// ==UserScript==
// @name         发送到Aria2下载
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      3.0.0
// @description  将链接发送到本地/远程 Aria2 下载，支持多服务器、批量、磁力、重命名、自定义路径、请求头、代理、任务历史、状态查询
// @author       Liora-Wells
// @match        *://*/*
// @icon         https://www.gnu.org/graphics/aria2-icon-64.png
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_deleteValue
// @connect      *
// @license      MIT
// @run-at       document-end
// @noframes
// @updateURL    https://github.com/Liora-Wells/UserScript/raw/main/send-to-aria2.user.js
// @downloadURL  https://github.com/Liora-Wells/UserScript/raw/main/send-to-aria2.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. 常量定义
    // ============================================================

    const STORAGE_KEYS = {
        servers: 'aria2_servers',
        lastServerId: 'aria2_last_server_id',
        history: 'aria2_history',
        prefs: 'aria2_prefs',
        legacyConfig: 'aria2_config' // 旧版兼容键
    };

    const PROTOCOL_WHITELIST = ['http:', 'https:', 'ftp:', 'magnet:', 'thunder:', 'ed2k:', 'sftp:'];

    const DEFAULT_PREFS = {
        theme: 'dark',
        autoNotification: true,
        historyEnabled: true,
        historyLimit: 100,
        captureRightClick: true
    };

    const DEFAULT_SERVER = {
        id: 'srv_default',
        name: '本机 Aria2',
        rpcUrl: 'http://localhost:6800/jsonrpc',
        rpcSecret: '',
        defaultDir: '',
        proxyUrl: '',
        enableProxy: false,
        headers: { referer: '', userAgent: '', cookie: '' },
        createdAt: 0
    };

    // 状态显示映射（Aria2 原生 status → 显示用）
    const STATUS_MAP = {
        complete: { label: '已完成', color: '#67c23a' },
        active:   { label: '活动中', color: '#409eff' },
        waiting:  { label: '等待中', color: '#e6a23c' },
        paused:   { label: '已暂停', color: '#909399' },
        error:    { label: '错误',   color: '#f56c6c' },
        removed:  { label: '已删除', color: '#909399' },
        sent:     { label: '已发送', color: '#909399' },
        unknown:  { label: '未知',   color: '#909399' }
    };

    // ============================================================
    // 2. 工具函数
    // ============================================================

    /**
     * 生成唯一 id（前缀 + 时间戳 + 随机）
     */
    function genId(prefix) {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    /**
     * 校验 URL 协议是否在白名单内
     * @returns {boolean}
     */
    function isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed) return false;
        // magnet / thunder / ed2k 是 scheme: 开头但不是 protocol 形式，特殊处理
        if (/^(magnet|thunder|ed2k):/i.test(trimmed)) return true;
        try {
            const u = new URL(trimmed);
            return PROTOCOL_WHITELIST.includes(u.protocol.toLowerCase());
        } catch (e) {
            return false;
        }
    }

    /**
     * 从 URL 提取文件名（末段）
     * 不再过滤"无点"文件名（保留 LICENSE、Makefile 等）
     * @returns {string} 文件名，无则返回空字符串
     */
    function getFileNameFromUrl(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            const pathname = u.pathname;
            if (!pathname || pathname === '/') return '';
            const last = pathname.split('/').pop();
            if (!last) return '';
            try {
                return decodeURIComponent(last);
            } catch (e) {
                return last;
            }
        } catch (e) {
            return '';
        }
    }

    /**
     * 判断 URL 是否为内联资源（data:/blob:），Aria2 无法处理
     */
    function isInlineUrl(url) {
        if (!url) return false;
        return /^(data:|blob:)/i.test(url.trim());
    }

    /**
     * 防抖
     */
    function debounce(fn, wait) {
        let timer = null;
        return function () {
            const ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    }

    /**
     * 转义 HTML（防止注入）
     */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 格式化字节为可读字符串
     */
    function formatBytes(bytes) {
        if (!bytes || bytes < 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        let v = bytes;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return v.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
    }

    /**
     * 格式化相对时间（"2 分钟前"）
     */
    function formatRelativeTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        const sec = Math.floor(diff / 1000);
        if (sec < 60) return '刚刚';
        const min = Math.floor(sec / 60);
        if (min < 60) return min + ' 分钟前';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + ' 小时前';
        const day = Math.floor(hr / 24);
        if (day < 30) return day + ' 天前';
        return new Date(ts).toLocaleDateString();
    }

    // ============================================================
    // 3. 存储管理
    // ============================================================

    const StorageManager = {
        /**
         * 同步读取（Tampermonkey 默认同步；VM 也可同步访问）
         * 兼容 VM 异步返回的 Promise（用 .then 兜底，但同步路径优先）
         */
        get(key, defaultValue) {
            let v = GM_getValue(key, undefined);
            // VM 可能返回 Promise
            if (v && typeof v.then === 'function') {
                // 异步路径：返回默认值，实际值由调用方再次读取
                // 项目约定不写 await，此处同步降级
                return defaultValue;
            }
            if (v === undefined || v === null) return defaultValue;
            if (typeof v === 'string') {
                try { return JSON.parse(v); } catch (e) { return defaultValue; }
            }
            return v;
        },

        set(key, value) {
            GM_setValue(key, JSON.stringify(value));
        },

        remove(key) {
            GM_deleteValue(key);
        },

        // ---------- 服务器 ----------
        getServers() {
            const list = this.get(STORAGE_KEYS.servers, null);
            if (Array.isArray(list) && list.length > 0) return list;
            return null; // 调用方负责初始化
        },

        setServers(servers) {
            this.set(STORAGE_KEYS.servers, servers);
        },

        getServerById(id) {
            const list = this.getServers() || [];
            return list.find(s => s.id === id) || null;
        },

        getLastServerId() {
            return this.get(STORAGE_KEYS.lastServerId, null);
        },

        setLastServerId(id) {
            this.set(STORAGE_KEYS.lastServerId, id);
        },

        /**
         * 获取当前生效的服务器（记忆上次 > 第一个）
         */
        getCurrentServer() {
            const list = this.getServers();
            if (!list || list.length === 0) return null;
            const lastId = this.getLastServerId();
            if (lastId) {
                const s = list.find(x => x.id === lastId);
                if (s) return s;
            }
            return list[0];
        },

        // ---------- 偏好 ----------
        getPrefs() {
            const p = this.get(STORAGE_KEYS.prefs, null);
            return Object.assign({}, DEFAULT_PREFS, p || {});
        },

        setPrefs(prefs) {
            this.set(STORAGE_KEYS.prefs, prefs);
        },

        // ---------- 历史 ----------
        getHistory() {
            return this.get(STORAGE_KEYS.history, []);
        },

        setHistory(items) {
            const prefs = this.getPrefs();
            const limit = prefs.historyLimit || 100;
            // 超限截断（保留最新的 N 条）
            const trimmed = items.length > limit ? items.slice(0, limit) : items;
            this.set(STORAGE_KEYS.history, trimmed);
        },

        addHistoryItem(item) {
            const prefs = this.getPrefs();
            if (!prefs.historyEnabled) return;
            const items = this.getHistory();
            items.unshift(item); // 新的在前
            this.setHistory(items);
        },

        updateHistoryItem(id, patch) {
            const items = this.getHistory();
            const idx = items.findIndex(x => x.id === id);
            if (idx === -1) return;
            items[idx] = Object.assign({}, items[idx], patch);
            this.setHistory(items);
        },

        removeHistoryItem(id) {
            const items = this.getHistory().filter(x => x.id !== id);
            this.setHistory(items);
        },

        clearHistory() {
            this.set(STORAGE_KEYS.history, []);
        },

        // ---------- 迁移 ----------
        /**
         * 首次启动或升级时调用，确保数据结构就绪
         * @returns {boolean} 是否发生了迁移
         */
        migrateIfNeeded() {
            const existing = this.getServers();
            if (existing) return false; // 已有新结构

            const legacy = this.get(STORAGE_KEYS.legacyConfig, null);
            let prefs = Object.assign({}, DEFAULT_PREFS);
            let servers = [];

            if (legacy) {
                // 旧版结构：{ rpcUrl, rpcSecret, defaultDir, autoNotification, theme, proxyUrl, enableProxy }
                const old = legacy;
                const server = Object.assign({}, DEFAULT_SERVER, {
                    id: genId('srv'),
                    name: '本机 Aria2',
                    rpcUrl: old.rpcUrl || DEFAULT_SERVER.rpcUrl,
                    rpcSecret: old.rpcSecret || '',
                    defaultDir: old.defaultDir || '',
                    proxyUrl: old.proxyUrl || '',
                    enableProxy: !!old.enableProxy,
                    headers: { referer: '', userAgent: '', cookie: '' },
                    createdAt: Date.now()
                });
                servers.push(server);
                prefs = Object.assign(prefs, {
                    theme: old.theme || 'dark',
                    autoNotification: old.autoNotification !== false
                });
                this.remove(STORAGE_KEYS.legacyConfig);
            } else {
                // 全新安装
                const server = Object.assign({}, DEFAULT_SERVER, {
                    id: genId('srv'),
                    createdAt: Date.now()
                });
                servers.push(server);
            }

            this.setServers(servers);
            this.setPrefs(prefs);
            return true;
        }
    };

    // ============================================================
    // 模块分区（后续任务按此顺序填充）
    // ============================================================
    // 1. 常量定义（DEFAULTS / STORAGE_KEYS / PROTOCOL_WHITELIST）
    // 2. 工具函数（getFileNameFromUrl / validateUrl / genId / debounce）
    // 3. 存储管理（StorageManager）
    // 4. RPC 客户端（Aria2RPC 类）
    // 5. 右键捕获（captureUrlFromEvent + 监听器注册）
    // 6. UI 渲染（createModal / renderTab / renderDownloadTab / renderHistoryTab / renderSettingsTab）
    // 7. UI 交互（bindEvents / showToast / showConfirmBar / 快捷键）
    // 8. 菜单注册（registerMenuCommands）
    // 9. 初始化（init）

    // ============================================================
    // 9. 初始化（临时最小骨架，后续任务替换）
    // ============================================================
    function init() {
        StorageManager.migrateIfNeeded();
        const server = StorageManager.getCurrentServer();
        console.log('[Aria2] 初始化完成，当前服务器：', server && server.name);
        GM_registerMenuCommand('📥 打开下载面板', function () {
            alert('骨架：下载面板待实现\n当前服务器：' + (server ? server.name : '无'));
        });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
