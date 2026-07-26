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
    // 4. RPC 客户端
    // ============================================================

    class Aria2RPC {
        constructor(server) {
            this.server = server;
        }

        /**
         * 内部：发送 JSON-RPC 请求
         * @returns {Promise}
         */
        _call(method, params = []) {
            const server = this.server;
            return new Promise((resolve, reject) => {
                if (!server || !server.rpcUrl) {
                    reject(new Error('RPC 地址未配置'));
                    return;
                }
                const fullParams = [];
                if (server.rpcSecret && server.rpcSecret.trim()) {
                    fullParams.push('token:' + server.rpcSecret.trim());
                }
                fullParams.push(...params);

                const body = JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'aria2_' + method + '_' + Date.now(),
                    method: method,
                    params: fullParams
                });

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: server.rpcUrl.trim(),
                    headers: { 'Content-Type': 'application/json' },
                    data: body,
                    timeout: 10000,
                    onload: function (resp) {
                        try {
                            const result = JSON.parse(resp.responseText);
                            if (result.error) {
                                reject(new Error('Aria2 错误 [' + result.error.code + ']: ' + (result.error.message || '')));
                            } else {
                                resolve(result.result);
                            }
                        } catch (e) {
                            reject(new Error('Aria2 响应格式异常，请检查 RPC 地址是否指向 jsonrpc 端点'));
                        }
                    },
                    onerror: function () {
                        reject(new Error('连接失败，请检查 Aria2 是否启动、RPC 地址是否正确'));
                    },
                    ontimeout: function () {
                        reject(new Error('连接超时，请检查 RPC 服务是否正常运行'));
                    }
                });
            });
        }

        /**
         * 测试连接，返回版本号
         */
        getVersion() {
            return this._call('aria2.getVersion', []);
        }

        /**
         * 添加下载任务
         * @param {string[]} urls 单个或多个 URL
         * @param {object} options Aria2 选项（dir/out/all-proxy/referer/user-agent/header 等）
         * @returns {Promise<string>} GID
         */
        addUri(urls, options) {
            const params = [urls];
            if (options && Object.keys(options).length > 0) params.push(options);
            return this._call('aria2.addUri', params);
        }

        /**
         * 查询单个任务状态
         * @param {string} gid
         * @param {string[]} keys 需要返回的字段，空则返回全部
         */
        tellStatus(gid, keys) {
            const params = [gid];
            if (keys && keys.length > 0) params.push(keys);
            return this._call('aria2.tellStatus', params);
        }

        /**
         * 查询所有活动任务（历史 Tab 批量刷新用）
         */
        tellActive() {
            return this._call('aria2.tellActive', []);
        }
    }

    /**
     * 构造 Aria2 选项（规格 6.3）
     * @param {object} input { filename, saveDir, useProxy, headers }
     * @param {object} server 服务器对象
     */
    function buildOptions(input, server) {
        const options = {};
        if (input.filename) options.out = input.filename;
        if (input.saveDir) options.dir = input.saveDir;
        else if (server.defaultDir) options.dir = server.defaultDir;
        if (input.useProxy && server.proxyUrl) options['all-proxy'] = server.proxyUrl;
        const referer = (input.headers && input.headers.referer) || (server.headers && server.headers.referer) || '';
        const userAgent = (input.headers && input.headers.userAgent) || (server.headers && server.headers.userAgent) || '';
        const cookie = (input.headers && input.headers.cookie) || (server.headers && server.headers.cookie) || '';
        if (referer) options.referer = referer;
        if (userAgent) options['user-agent'] = userAgent;
        if (cookie) options.header = 'Cookie: ' + cookie;
        return options;
    }

    /**
     * 批量发送多个 URL（规格 6.4：循环单条调用）
     * @returns {Promise<{success: Array, failed: Array}>}
     */
    async function batchSendUrls(urls, options, server) {
        const rpc = new Aria2RPC(server);
        const success = [];
        const failed = [];
        for (let i = 0; i < urls.length; i++) {
            try {
                const gid = await rpc.addUri([urls[i]], options);
                success.push({ url: urls[i], gid: gid });
            } catch (e) {
                failed.push({ url: urls[i], error: e.message });
            }
        }
        return { success, failed };
    }

    // ============================================================
    // 5. 右键捕获
    // ============================================================

    let lastCapturedUrl = '';
    let lastCapturedFilename = '';

    /**
     * 从右键事件捕获 URL（规格 3.1 优先级链）
     */
    function captureUrlFromEvent(e) {
        const target = e.target;
        if (!target) return { url: '', filename: '' };

        // 优先级 1: <a href>
        const link = target.closest('a[href]');
        if (link && link.href) {
            return {
                url: link.href,
                filename: (link.download && link.download.trim()) || getFileNameFromUrl(link.href)
            };
        }

        const tag = target.tagName;

        // 优先级 2: <img>
        if (tag === 'IMG' && target.src) {
            return { url: target.src, filename: getFileNameFromUrl(target.src) };
        }

        // 优先级 3/4: <video>/<audio> 及其 <source>
        if (tag === 'VIDEO' || tag === 'AUDIO') {
            const source = target.querySelector('source[src]');
            if (source && source.src) {
                return { url: source.src, filename: getFileNameFromUrl(source.src) };
            }
            if (target.src) {
                return { url: target.src, filename: getFileNameFromUrl(target.src) };
            }
        }

        // 兜底：不捕获
        return { url: '', filename: '' };
    }

    function registerContextMenuListener() {
        document.addEventListener('contextmenu', function (e) {
            const prefs = StorageManager.getPrefs();
            if (!prefs.captureRightClick) return;
            const captured = captureUrlFromEvent(e);
            lastCapturedUrl = captured.url;
            lastCapturedFilename = captured.filename;
        }, true);
    }

    // ============================================================
    // 6. UI 渲染
    // ============================================================

    // ---------- 6.1 样式注入 ----------
    let styleInjected = false;

    function injectStyles() {
        if (styleInjected) return;
        styleInjected = true;
        GM_addStyle(`
            /* 所有样式限定在 .aria2-app 作用域内，不污染宿主页面 */
            .aria2-app {
                /* 暗黑主题（默认） */
                --aria2-bg-primary: #1f1f1f;
                --aria2-bg-secondary: #2a2a2a;
                --aria2-bg-mask: rgba(0, 0, 0, 0.7);
                --aria2-text-primary: #f5f5f5;
                --aria2-text-secondary: #dddddd;
                --aria2-text-tips: #aaaaaa;
                --aria2-border-color: #444444;
                --aria2-btn-default-bg: #333333;
                --aria2-btn-default-hover: #444444;
                --aria2-btn-default-text: #dddddd;
                --aria2-input-bg: #2a2a2a;
                --aria2-input-text: #ffffff;
                --aria2-input-placeholder: #888888;
                --aria2-shadow-color: rgba(0, 0, 0, 0.3);
                --aria2-accent: #409eff;
            }
            .aria2-app[data-aria2-theme="light"] {
                --aria2-bg-primary: #ffffff;
                --aria2-bg-secondary: #f8f9fa;
                --aria2-bg-mask: rgba(0, 0, 0, 0.5);
                --aria2-text-primary: #333333;
                --aria2-text-secondary: #555555;
                --aria2-text-tips: #666666;
                --aria2-border-color: #dddddd;
                --aria2-btn-default-bg: #f5f5f5;
                --aria2-btn-default-hover: #eeeeee;
                --aria2-btn-default-text: #666666;
                --aria2-input-bg: #ffffff;
                --aria2-input-text: #333333;
                --aria2-input-placeholder: #999999;
                --aria2-shadow-color: rgba(0, 0, 0, 0.15);
            }

            .aria2-app * { box-sizing: border-box; }

            .aria2-mask {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--aria2-bg-mask); z-index: 999998;
                display: none; align-items: center; justify-content: center;
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            }
            .aria2-mask[data-show="1"] { display: flex; }

            .aria2-modal {
                width: 560px; max-width: 90vw; max-height: 90vh;
                background: var(--aria2-bg-primary); border-radius: 10px;
                box-shadow: 0 8px 30px var(--aria2-shadow-color);
                overflow: hidden; display: flex; flex-direction: column;
                color: var(--aria2-text-primary);
            }
            .aria2-header {
                padding: 16px 22px; border-bottom: 1px solid var(--aria2-border-color);
                display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
            }
            .aria2-title { font-size: 18px; font-weight: 600; margin: 0; }
            .aria2-close {
                width: 28px; height: 28px; border: none; background: none;
                font-size: 22px; color: var(--aria2-text-tips); cursor: pointer;
                border-radius: 4px; display: flex; align-items: center; justify-content: center;
            }
            .aria2-close:hover { color: var(--aria2-text-primary); background: var(--aria2-btn-default-bg); }

            .aria2-toolbar {
                padding: 12px 22px; border-bottom: 1px solid var(--aria2-border-color);
                display: flex; align-items: center; gap: 12px; flex-shrink: 0; flex-wrap: wrap;
            }
            .aria2-toolbar select, .aria2-toolbar button {
                padding: 6px 12px; border: 1px solid var(--aria2-border-color);
                border-radius: 6px; background: var(--aria2-bg-secondary);
                color: var(--aria2-text-primary); font-size: 13px; cursor: pointer;
                font-family: inherit;
            }
            .aria2-toolbar button:hover { background: var(--aria2-btn-default-hover); }
            .aria2-toolbar .aria2-spacer { flex-grow: 1; }

            .aria2-tabs {
                display: flex; border-bottom: 1px solid var(--aria2-border-color); flex-shrink: 0;
            }
            .aria2-tab {
                padding: 12px 20px; border: none; background: none;
                color: var(--aria2-text-secondary); cursor: pointer; font-size: 14px;
                font-family: inherit; border-bottom: 2px solid transparent;
            }
            .aria2-tab[data-active="1"] {
                color: var(--aria2-accent); border-bottom-color: var(--aria2-accent);
            }

            .aria2-body { padding: 22px; overflow-y: auto; flex-grow: 1; }

            .aria2-footer {
                padding: 12px 22px; border-top: 1px solid var(--aria2-border-color);
                display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
            }

            .aria2-btn {
                padding: 8px 16px; border-radius: 6px; border: none;
                font-size: 14px; cursor: pointer; font-family: inherit; font-weight: 500;
                line-height: 1.4;
            }
            .aria2-btn-default { background: var(--aria2-btn-default-bg); color: var(--aria2-btn-default-text); }
            .aria2-btn-default:hover { background: var(--aria2-btn-default-hover); }
            .aria2-btn-primary { background: var(--aria2-accent); color: #fff; }
            .aria2-btn-primary:hover { filter: brightness(1.1); }
            .aria2-btn-danger { background: #f56c6c; color: #fff; }
            .aria2-btn-danger:hover { filter: brightness(1.1); }
            .aria2-btn:disabled { opacity: 0.6; cursor: not-allowed; }

            .aria2-group { margin-bottom: 16px; }
            .aria2-label { display: block; font-size: 13px; color: var(--aria2-text-secondary); margin-bottom: 6px; font-weight: 500; }
            .aria2-input, .aria2-textarea, .aria2-select {
                width: 100%; padding: 9px 12px; border: 1px solid var(--aria2-border-color);
                border-radius: 6px; font-size: 14px; color: var(--aria2-input-text);
                background: var(--aria2-input-bg); font-family: inherit; line-height: 1.5;
                transition: border-color 0.2s;
            }
            .aria2-textarea { resize: vertical; min-height: 90px; }
            .aria2-input:focus, .aria2-textarea:focus, .aria2-select:focus {
                outline: none; border-color: var(--aria2-accent); box-shadow: 0 0 0 2px rgba(64,158,255,0.1);
            }
            .aria2-tips { margin-top: 6px; font-size: 12px; color: var(--aria2-text-tips); line-height: 1.4; }

            .aria2-row { display: flex; gap: 12px; align-items: center; }
            .aria2-row > * { flex: 1; }
            .aria2-checkbox-label { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--aria2-text-secondary); cursor: pointer; user-select: none; }

            .aria2-status {
                margin-top: 12px; font-size: 13px; padding: 8px 12px; border-radius: 4px;
                display: none; line-height: 1.4;
            }
            .aria2-status[data-type="success"] { display: block; background: rgba(103,194,58,0.1); color: #67c23a; border: 1px solid rgba(103,194,58,0.2); }
            .aria2-status[data-type="error"]   { display: block; background: rgba(245,108,108,0.1); color: #f56c6c; border: 1px solid rgba(245,108,108,0.2); }

            .aria2-toast {
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                background: var(--aria2-bg-secondary); color: var(--aria2-text-primary);
                padding: 10px 20px; border-radius: 6px; box-shadow: 0 4px 12px var(--aria2-shadow-color);
                z-index: 9999999; font-size: 14px; max-width: 80vw;
                display: none; align-items: center; gap: 8px;
            }
            .aria2-toast[data-show="1"] { display: flex; }
            .aria2-toast[data-type="success"] { border-left: 4px solid #67c23a; }
            .aria2-toast[data-type="error"]   { border-left: 4px solid #f56c6c; }

            .aria2-confirm-bar {
                margin-top: 8px; padding: 10px; background: var(--aria2-bg-secondary);
                border-radius: 6px; display: none; align-items: center; gap: 10px;
                font-size: 13px;
            }
            .aria2-confirm-bar[data-show="1"] { display: flex; }

            /* 折叠区块 */
            .aria2-collapse-toggle { cursor: pointer; color: var(--aria2-text-secondary); font-size: 13px; user-select: none; display: inline-flex; align-items: center; gap: 4px; }
            .aria2-collapse-body { display: none; margin-top: 12px; }
            .aria2-collapse-body[data-show="1"] { display: block; }

            /* 服务器卡片 */
            .aria2-server-card {
                border: 1px solid var(--aria2-border-color); border-radius: 8px;
                padding: 14px; margin-bottom: 10px; background: var(--aria2-bg-secondary);
            }
            .aria2-server-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .aria2-server-card-name { font-weight: 600; font-size: 15px; }
            .aria2-server-card-meta { font-size: 12px; color: var(--aria2-text-tips); margin-top: 4px; line-height: 1.5; }
            .aria2-server-card-actions { display: flex; gap: 6px; }
            .aria2-server-card-actions button { padding: 4px 10px; font-size: 12px; }

            /* 偏好卡片 */
            .aria2-pref-card {
                display: flex; align-items: center; justify-content: space-between;
                padding: 14px; border: 1px solid var(--aria2-border-color); border-radius: 8px;
                margin-bottom: 10px; background: var(--aria2-bg-secondary);
            }
            .aria2-pref-card-info { flex-grow: 1; }
            .aria2-pref-card-title { font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 8px; }
            .aria2-pref-card-desc { font-size: 12px; color: var(--aria2-text-tips); margin-top: 4px; }

            /* 开关（简易 toggle） */
            .aria2-switch {
                position: relative; width: 40px; height: 22px; background: var(--aria2-border-color);
                border-radius: 11px; cursor: pointer; transition: background 0.2s; flex-shrink: 0;
            }
            .aria2-switch[data-on="1"] { background: var(--aria2-accent); }
            .aria2-switch::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
                background: #fff; border-radius: 50%; transition: left 0.2s;
            }
            .aria2-switch[data-on="1"]::after { left: 20px; }

            /* 历史卡片 */
            .aria2-history-card {
                border: 1px solid var(--aria2-border-color); border-radius: 8px;
                padding: 12px; margin-bottom: 10px; background: var(--aria2-bg-secondary);
            }
            .aria2-history-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
            .aria2-history-card-status { font-size: 12px; padding: 2px 8px; border-radius: 10px; color: #fff; }
            .aria2-history-card-url { font-size: 13px; word-break: break-all; margin-bottom: 6px; }
            .aria2-history-card-meta { font-size: 12px; color: var(--aria2-text-tips); margin-bottom: 8px; }
            .aria2-history-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
            .aria2-history-card-actions button { padding: 4px 10px; font-size: 12px; }

            .aria2-chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
            .aria2-chip {
                padding: 4px 10px; border-radius: 14px; border: 1px solid var(--aria2-border-color);
                background: var(--aria2-bg-secondary); color: var(--aria2-text-secondary);
                font-size: 12px; cursor: pointer;
            }
            .aria2-chip[data-active="1"] { background: var(--aria2-accent); color: #fff; border-color: var(--aria2-accent); }
        `);
    }

    // ---------- 6.2 弹窗外壳 ----------
    let modalCreated = false;
    let activeTab = 'download'; // 'download' | 'history' | 'settings'

    function ensureModal() {
        injectStyles();
        if (modalCreated) return document.getElementById('aria2-app');
        modalCreated = true;

        const app = document.createElement('div');
        app.className = 'aria2-app';
        app.id = 'aria2-app';
        app.setAttribute('data-aria2-theme', StorageManager.getPrefs().theme);
        app.setAttribute('data-ghhelper-nt', '1'); // 防翻译脚本干扰

        app.innerHTML = `
            <div class="aria2-mask" id="aria2-mask">
                <div class="aria2-modal" role="dialog" aria-modal="true">
                    <div class="aria2-header">
                        <h3 class="aria2-title">发送到Aria2下载</h3>
                        <button class="aria2-close" id="aria2-close" title="关闭">×</button>
                    </div>
                    <div class="aria2-toolbar">
                        <span>服务器:</span>
                        <select id="aria2-server-select"></select>
                        <button id="aria2-test-btn" title="测试当前服务器连接">⚡测试</button>
                        <div class="aria2-spacer"></div>
                        <button id="aria2-theme-btn" title="切换主题">🌙</button>
                    </div>
                    <div class="aria2-tabs">
                        <button class="aria2-tab" data-tab="download">📥 下载</button>
                        <button class="aria2-tab" data-tab="history">📜 历史</button>
                        <button class="aria2-tab" data-tab="settings">⚙️ 设置</button>
                    </div>
                    <div class="aria2-body" id="aria2-body"></div>
                    <div class="aria2-footer" id="aria2-footer"></div>
                </div>
            </div>
            <div class="aria2-toast" id="aria2-toast"></div>
        `;
        document.body.appendChild(app);
        return app;
    }

    function openModal(tab) {
        const app = ensureModal();
        if (tab) activeTab = tab;
        refreshToolbar();
        refreshTabs();
        renderActiveTab();
        bindToolbarEvents();
        document.getElementById('aria2-mask').setAttribute('data-show', '1');
        onBindModalKeys();
    }

    function closeModal() {
        const mask = document.getElementById('aria2-mask');
        if (mask) mask.setAttribute('data-show', '0');
        onUnbindModalKeys();
    }

    function refreshToolbar() {
        const select = document.getElementById('aria2-server-select');
        const servers = StorageManager.getServers() || [];
        const currentId = (StorageManager.getCurrentServer() || {}).id;
        select.innerHTML = servers.map(s =>
            `<option value="${escapeHtml(s.id)}"${s.id === currentId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`
        ).join('');

        // 主题按钮
        const themeBtn = document.getElementById('aria2-theme-btn');
        const prefs = StorageManager.getPrefs();
        themeBtn.textContent = prefs.theme === 'dark' ? '☀️' : '🌙';
    }

    function refreshTabs() {
        const tabs = document.querySelectorAll('.aria2-tab');
        tabs.forEach(t => t.setAttribute('data-active', t.getAttribute('data-tab') === activeTab ? '1' : '0'));
    }

    function renderActiveTab() {
        const body = document.getElementById('aria2-body');
        const footer = document.getElementById('aria2-footer');
        body.innerHTML = '';
        footer.innerHTML = '';
        if (activeTab === 'download') renderDownloadTab(body, footer);
        else if (activeTab === 'history') renderHistoryTab(body, footer);
        else if (activeTab === 'settings') renderSettingsTab(body, footer);
    }

    // 临时占位（任务 8/10 替换 renderHistoryTab / renderSettingsTab）
    function renderDownloadTab(body, footer) {
        body.innerHTML = `
            <div class="aria2-group">
                <label class="aria2-label">下载链接（一行一个，支持 http/https/ftp/magnet）</label>
                <textarea class="aria2-textarea" id="aria2-url-input" placeholder="请输入下载链接，一行一个"></textarea>
                <div class="aria2-tips" id="aria2-url-count"></div>
            </div>
            <div class="aria2-group">
                <label class="aria2-label">文件名（重命名，可选）</label>
                <input type="text" class="aria2-input" id="aria2-filename-input" placeholder="留空使用原文件名">
                <div class="aria2-tips">批量下载时留空</div>
            </div>
            <div class="aria2-group">
                <label class="aria2-label">保存路径（可选）</label>
                <div class="aria2-row">
                    <input type="text" class="aria2-input" id="aria2-dir-input" placeholder="留空使用该服务器默认路径">
                    <button class="aria2-btn aria2-btn-default" id="aria2-remember-dir-btn" style="flex:0 0 auto;">记忆</button>
                </div>
            </div>
            <div class="aria2-group">
                <label class="aria2-checkbox-label">
                    <input type="checkbox" id="aria2-use-proxy-checkbox"> 使用代理（该服务器配置的代理）
                </label>
            </div>
            <div class="aria2-group">
                <span class="aria2-collapse-toggle" id="aria2-advanced-toggle">▸ 高级选项</span>
                <div class="aria2-collapse-body" id="aria2-advanced-body">
                    <div class="aria2-group">
                        <label class="aria2-label">Referer（留空用服务器默认）</label>
                        <input type="text" class="aria2-input" id="aria2-referer-input" placeholder="如 https://example.com">
                    </div>
                    <div class="aria2-group">
                        <label class="aria2-label">User-Agent（留空用服务器默认）</label>
                        <input type="text" class="aria2-input" id="aria2-ua-input" placeholder="如 Mozilla/5.0 ...">
                    </div>
                    <div class="aria2-group">
                        <label class="aria2-label">Cookie（留空用服务器默认）</label>
                        <input type="text" class="aria2-input" id="aria2-cookie-input" placeholder="如 key=val; key2=val2">
                    </div>
                </div>
            </div>
            <div class="aria2-status" id="aria2-download-status"></div>
        `;

        footer.innerHTML = `
            <button class="aria2-btn aria2-btn-default" id="aria2-clear-btn">清空</button>
            <button class="aria2-btn aria2-btn-default" id="aria2-cancel-btn">取消</button>
            <button class="aria2-btn aria2-btn-primary" id="aria2-send-btn">发送下载</button>
        `;

        const server = StorageManager.getCurrentServer() || {};
        document.getElementById('aria2-dir-input').value = server.defaultDir || '';
        document.getElementById('aria2-use-proxy-checkbox').checked = !!server.enableProxy;

        // URL 计数（去重）
        const urlInput = document.getElementById('aria2-url-input');
        const urlCount = document.getElementById('aria2-url-count');
        const updateCount = function () {
            const lines = urlInput.value.split('\n').map(s => s.trim()).filter(Boolean);
            const unique = Array.from(new Set(lines));
            if (lines.length === 0) urlCount.textContent = '';
            else if (unique.length === lines.length) urlCount.textContent = '共 ' + lines.length + ' 个链接';
            else urlCount.textContent = '共 ' + lines.length + ' 个链接（去重后 ' + unique.length + ' 个）';
        };
        urlInput.addEventListener('input', updateCount);

        // 折叠
        const advToggle = document.getElementById('aria2-advanced-toggle');
        const advBody = document.getElementById('aria2-advanced-body');
        advToggle.addEventListener('click', function () {
            const show = advBody.getAttribute('data-show') === '1';
            advBody.setAttribute('data-show', show ? '0' : '1');
            advToggle.textContent = (show ? '▸' : '▾') + ' 高级选项';
        });

        // 清空
        document.getElementById('aria2-clear-btn').addEventListener('click', function () {
            urlInput.value = '';
            document.getElementById('aria2-filename-input').value = '';
            document.getElementById('aria2-dir-input').value = server.defaultDir || '';
            document.getElementById('aria2-use-proxy-checkbox').checked = !!server.enableProxy;
            document.getElementById('aria2-referer-input').value = '';
            document.getElementById('aria2-ua-input').value = '';
            document.getElementById('aria2-cookie-input').value = '';
            updateCount();
            showDownloadStatus('', '');
        });

        // 取消
        document.getElementById('aria2-cancel-btn').addEventListener('click', closeModal);

        // 记忆路径
        document.getElementById('aria2-remember-dir-btn').addEventListener('click', function () {
            const dir = document.getElementById('aria2-dir-input').value.trim();
            const cur = StorageManager.getCurrentServer();
            if (!cur) return;
            const servers = StorageManager.getServers().map(s => s.id === cur.id ? Object.assign({}, s, { defaultDir: dir }) : s);
            StorageManager.setServers(servers);
            showToast('已记忆为该服务器默认路径', 'success');
        });

        // 发送
        document.getElementById('aria2-send-btn').addEventListener('click', handleSendDownload);
    }

    function showDownloadStatus(text, type) {
        const el = document.getElementById('aria2-download-status');
        if (!el) return;
        el.textContent = text;
        if (text && type) el.setAttribute('data-type', type);
        else el.removeAttribute('data-type');
    }

    /**
     * 发送下载按钮处理（规格 6.2-6.5）
     */
    async function handleSendDownload() {
        const urlInput = document.getElementById('aria2-url-input');
        const filenameInput = document.getElementById('aria2-filename-input');
        const dirInput = document.getElementById('aria2-dir-input');
        const useProxyCheckbox = document.getElementById('aria2-use-proxy-checkbox');
        const sendBtn = document.getElementById('aria2-send-btn');

        const rawLines = urlInput.value.split('\n').map(s => s.trim()).filter(Boolean);
        const urls = Array.from(new Set(rawLines)); // 去重
        const filename = filenameInput.value.trim();
        const saveDir = dirInput.value.trim();
        const useProxy = useProxyCheckbox.checked;
        const headers = {
            referer: document.getElementById('aria2-referer-input').value.trim(),
            userAgent: document.getElementById('aria2-ua-input').value.trim(),
            cookie: document.getElementById('aria2-cookie-input').value.trim()
        };

        if (urls.length === 0) {
            showDownloadStatus('请输入下载链接', 'error');
            return;
        }

        // 校验每个 URL
        for (const u of urls) {
            if (isInlineUrl(u)) {
                showDownloadStatus('链接为内联资源（data:/blob:），无法发送: ' + u, 'error');
                return;
            }
            if (!isValidUrl(u)) {
                showDownloadStatus('链接格式错误或协议不支持: ' + u, 'error');
                return;
            }
        }

        // 批量+文件名互斥
        if (urls.length > 1 && filename) {
            showDownloadStatus('批量下载请清空文件名', 'error');
            return;
        }

        // 代理校验
        const server = StorageManager.getCurrentServer();
        if (useProxy && !(server && server.proxyUrl && server.proxyUrl.trim())) {
            showDownloadStatus('请先在设置中为该服务器配置代理地址', 'error');
            return;
        }

        // 协议混合校验
        const protocols = new Set(urls.map(u => u.split(':')[0].toLowerCase()));
        if (protocols.size > 1) {
            showDownloadStatus('批量下载不支持混合协议', 'error');
            return;
        }

        // 发送
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';
        showDownloadStatus('', '');
        try {
            const options = buildOptions({ filename, saveDir, useProxy, headers }, server);
            const result = await batchSendUrls(urls, options, server);
            const okCount = result.success.length;
            const failCount = result.failed.length;

            if (failCount === 0) {
                showDownloadStatus('下载任务发送成功，共 ' + okCount + ' 个任务', 'success');
            } else if (okCount === 0) {
                showDownloadStatus('全部失败：' + result.failed[0].error, 'error');
            } else {
                showDownloadStatus('部分成功：' + okCount + ' 个成功，' + failCount + ' 个失败（' + result.failed[0].error + '）', 'error');
            }

            // 记录历史
            const prefs = StorageManager.getPrefs();
            if (prefs.historyEnabled) {
                result.success.forEach(s => {
                    StorageManager.addHistoryItem({
                        id: genId('task'),
                        serverId: server.id,
                        urls: [s.url],
                        filename: filename,
                        saveDir: saveDir,
                        usedProxy: useProxy,
                        gid: s.gid,
                        status: 'sent',
                        createdAt: Date.now(),
                        lastQueryAt: 0
                    });
                });
            }

            // 桌面通知
            if (prefs.autoNotification && okCount > 0) {
                GM_notification({
                    title: '发送到Aria2成功',
                    text: '已成功发送 ' + okCount + ' 个下载任务',
                    timeout: 3000
                });
            }

            // 全部成功则 2 秒后关闭
            if (failCount === 0) {
                setTimeout(closeModal, 2000);
            }
        } catch (e) {
            showDownloadStatus(e.message || '发送失败', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = '发送下载';
        }
    }
    // 历史 Tab 当前过滤状态
    let historyFilter = 'all'; // 'all' | 'sent' | 'active' | 'complete' | 'error'
    let historySearch = '';

    function renderHistoryTab(body, footer) {
        body.innerHTML = `
            <div class="aria2-chip-row" id="aria2-history-chips"></div>
            <div class="aria2-group">
                <input type="text" class="aria2-input" id="aria2-history-search" placeholder="搜索 URL / 文件名 / GID">
            </div>
            <div id="aria2-history-list"></div>
            <div class="aria2-tips" id="aria2-history-count"></div>
        `;

        footer.innerHTML = `
            <button class="aria2-btn aria2-btn-default" id="aria2-history-refresh-btn">🔄刷新活动任务</button>
            <button class="aria2-btn aria2-btn-danger" id="aria2-history-clear-btn">清空历史</button>
        `;

        renderHistoryChips();
        renderHistoryList();

        document.getElementById('aria2-history-search').addEventListener('input', debounce(function (e) {
            historySearch = e.target.value.trim().toLowerCase();
            renderHistoryList();
        }, 200));

        document.getElementById('aria2-history-refresh-btn').addEventListener('click', refreshActiveHistory);
        document.getElementById('aria2-history-clear-btn').addEventListener('click', function () {
            showConfirmBar('aria2-history-clear-btn', '确定清空全部历史？', async function () {
                StorageManager.clearHistory();
                renderHistoryList();
                showToast('历史已清空', 'success');
            });
        });
    }

    function renderHistoryChips() {
        const all = StorageManager.getHistory();
        const counts = {
            all: all.length,
            sent: all.filter(x => x.status === 'sent').length,
            active: all.filter(x => x.status === 'active' || x.status === 'waiting' || x.status === 'pending').length,
            complete: all.filter(x => x.status === 'complete').length,
            error: all.filter(x => x.status === 'error' || x.status === 'unknown').length
        };
        const chips = [
            { key: 'all', label: '全部' },
            { key: 'sent', label: '已发送' },
            { key: 'active', label: '活动中' },
            { key: 'complete', label: '已完成' },
            { key: 'error', label: '错误/未知' }
        ];
        const html = chips.map(c =>
            `<button class="aria2-chip" data-filter="${c.key}" data-active="${historyFilter === c.key ? '1' : '0'}">${c.label} (${counts[c.key]})</button>`
        ).join('');
        const container = document.getElementById('aria2-history-chips');
        container.innerHTML = html;
        container.querySelectorAll('.aria2-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                historyFilter = chip.getAttribute('data-filter');
                renderHistoryChips();
                renderHistoryList();
            });
        });
    }

    function filterHistoryItems() {
        let items = StorageManager.getHistory();
        if (historyFilter !== 'all') {
            const map = {
                sent: ['sent'],
                active: ['active', 'waiting', 'pending'],
                complete: ['complete'],
                error: ['error', 'unknown']
            };
            const allowed = map[historyFilter] || [];
            items = items.filter(x => allowed.includes(x.status));
        }
        if (historySearch) {
            items = items.filter(x => {
                const text = (x.urls || []).join(' ') + ' ' + (x.filename || '') + ' ' + (x.gid || '');
                return text.toLowerCase().includes(historySearch);
            });
        }
        return items;
    }

    function renderHistoryList() {
        const list = document.getElementById('aria2-history-list');
        const count = document.getElementById('aria2-history-count');
        const items = filterHistoryItems();
        if (items.length === 0) {
            list.innerHTML = '<div class="aria2-tips">无匹配记录</div>';
            count.textContent = '';
            return;
        }
        count.textContent = '共 ' + items.length + ' 条';
        list.innerHTML = items.map(renderHistoryCard).join('');
        bindHistoryCardEvents();
    }

    function renderHistoryCard(item) {
        const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.unknown;
        const server = StorageManager.getServerById(item.serverId);
        const serverName = server ? server.name : '未知服务器';
        const urlText = (item.urls || []).join('\n');
        const meta = '→ ' + escapeHtml(serverName) +
            ' | ' + escapeHtml(item.saveDir || '默认路径') +
            ' | GID: ' + escapeHtml(item.gid || '-');
        const progress = item.progress != null ? '进度: ' + item.progress + '%' : '';
        const speed = item.speed ? ' 速度: ' + item.speed : '';
        return `
            <div class="aria2-history-card" data-id="${escapeHtml(item.id)}">
                <div class="aria2-history-card-head">
                    <span class="aria2-history-card-status" style="background:${statusInfo.color}">${escapeHtml(statusInfo.label)}</span>
                    <span class="aria2-tips">${escapeHtml(formatRelativeTime(item.createdAt))}</span>
                </div>
                <div class="aria2-history-card-url">${escapeHtml(urlText).replace(/\n/g, '<br>')}</div>
                <div class="aria2-history-card-meta">${meta}</div>
                ${progress || speed ? '<div class="aria2-history-card-meta">' + escapeHtml(progress + speed) + '</div>' : ''}
                <div class="aria2-history-card-actions">
                    <button data-action="query">🔄查询</button>
                    <button data-action="resend">🔁重发</button>
                    <button data-action="copy">📋复制URL</button>
                    <button data-action="delete">🗑删除</button>
                </div>
            </div>
        `;
    }

    function bindHistoryCardEvents() {
        const list = document.getElementById('aria2-history-list');
        if (!list || list.__aria2HistoryBound) return;
        list.__aria2HistoryBound = true;
        // 事件委托：在稳定父容器上绑定单个监听器，避免 DOM 更新丢失监听
        list.addEventListener('click', function (e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const card = btn.closest('.aria2-history-card');
            if (!card) return;
            const id = card.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            handleHistoryAction(id, action);
        });
    }

    async function handleHistoryAction(id, action) {
        const items = StorageManager.getHistory();
        const item = items.find(x => x.id === id);
        if (!item) {
            showToast('任务记录已不存在', 'error');
            return;
        }

        if (action === 'delete') {
            StorageManager.removeHistoryItem(id);
            renderHistoryChips();
            renderHistoryList();
            return;
        }

        if (action === 'copy') {
            GM_setClipboard((item.urls || []).join('\n'));
            showToast('已复制 URL', 'success');
            return;
        }

        if (action === 'resend') {
            const server = StorageManager.getServerById(item.serverId) || StorageManager.getCurrentServer();
            try {
                const options = buildOptions({
                    filename: item.filename,
                    saveDir: item.saveDir,
                    useProxy: item.usedProxy,
                    headers: {}
                }, server);
                const gid = await new Aria2RPC(server).addUri(item.urls, options);
                StorageManager.addHistoryItem({
                    id: genId('task'),
                    serverId: server.id,
                    urls: item.urls,
                    filename: item.filename,
                    saveDir: item.saveDir,
                    usedProxy: item.usedProxy,
                    gid: gid,
                    status: 'sent',
                    createdAt: Date.now(),
                    lastQueryAt: 0
                });
                renderHistoryChips();
                renderHistoryList();
                showToast('重发成功，新 GID: ' + gid, 'success');
            } catch (e) {
                showToast('重发失败: ' + e.message, 'error');
            }
            return;
        }

        if (action === 'query') {
            await queryHistoryStatus(item);
        }
    }

    async function queryHistoryStatus(item) {
        if (!item.gid) {
            showToast('该任务无 GID，无法查询', 'error');
            return;
        }
        const server = StorageManager.getServerById(item.serverId) || StorageManager.getCurrentServer();
        try {
            const status = await new Aria2RPC(server).tellStatus(item.gid, [
                'status', 'totalLength', 'completedLength', 'downloadSpeed', 'errorCode'
            ]);
            const patch = {
                status: status.status,
                lastQueryAt: Date.now()
            };
            if (status.status === 'active') {
                const total = parseInt(status.totalLength || 0, 10);
                const done = parseInt(status.completedLength || 0, 10);
                patch.progress = total > 0 ? Math.round(done / total * 100) : 0;
                patch.speed = formatBytes(parseInt(status.downloadSpeed || 0, 10)) + '/s';
            }
            if (status.status === 'removed') patch.status = 'unknown';
            StorageManager.updateHistoryItem(item.id, patch);
            renderHistoryChips();
            renderHistoryList();
        } catch (e) {
            // 网络错误/RPC 宕机/密钥失效等不应污染任务状态，仅更新查询时间
            // 任务确实被删除的情况由用户手动判断
            StorageManager.updateHistoryItem(item.id, { lastQueryAt: Date.now() });
            renderHistoryChips();
            renderHistoryList();
            showToast('查询失败: ' + e.message, 'error');
        }
    }

    /**
     * 批量刷新所有活动任务（用 tellActive 一次拉取）
     */
    async function refreshActiveHistory() {
        let failedServerCount = 0;
        const servers = StorageManager.getServers() || [];
        const serverMap = {};
        servers.forEach(s => serverMap[s.id] = s);

        // 收集所有 sent/active/waiting 状态的任务
        const items = StorageManager.getHistory();
        const activeItems = items.filter(x =>
            x.gid && ['sent', 'active', 'waiting', 'pending'].includes(x.status)
        );

        // 按服务器分组查询
        const byServer = {};
        activeItems.forEach(x => {
            if (!byServer[x.serverId]) byServer[x.serverId] = [];
            byServer[x.serverId].push(x);
        });

        for (const serverId of Object.keys(byServer)) {
            const server = serverMap[serverId];
            if (!server) continue;
            const rpc = new Aria2RPC(server);
            let activeList = [];
            try {
                activeList = await rpc.tellActive();
            } catch (e) {
                failedServerCount++;
                continue; // 该服务器查询失败，跳过
            }
            const gidToStatus = {};
            activeList.forEach(s => { gidToStatus[s.gid] = s; });

            byServer[serverId].forEach(item => {
                const s = gidToStatus[item.gid];
                if (s) {
                    const total = parseInt(s.totalLength || 0, 10);
                    const done = parseInt(s.completedLength || 0, 10);
                    StorageManager.updateHistoryItem(item.id, {
                        status: s.status,
                        progress: total > 0 ? Math.round(done / total * 100) : 0,
                        speed: formatBytes(parseInt(s.downloadSpeed || 0, 10)) + '/s',
                        lastQueryAt: Date.now()
                    });
                } else {
                    // 不在活动列表中，可能是 waiting/paused/complete/removed，不修改 status 避免污染
                    // 用户可手动点"查询"按钮查询单条状态
                    StorageManager.updateHistoryItem(item.id, { lastQueryAt: Date.now() });
                }
            });
        }

        renderHistoryChips();
        renderHistoryList();
        if (failedServerCount === 0) {
            showToast('活动任务已刷新', 'success');
        } else if (failedServerCount < Object.keys(byServer).length) {
            showToast('已刷新，' + failedServerCount + ' 个服务器查询失败', 'error');
        } else {
            showToast('全部服务器查询失败', 'error');
        }
    }
    function renderSettingsTab(body, footer) {
        body.innerHTML = '<div class="aria2-tips">设置 Tab 待实现（任务 10）</div>';
    }

    // ============================================================
    // 7. UI 交互
    // ============================================================

    let toastTimer = null;
    function showToast(text, type) {
        const toast = document.getElementById('aria2-toast');
        if (!toast) {
            // 兜底：弹窗外未创建时用 alert
            alert(text);
            return;
        }
        toast.textContent = text;
        toast.setAttribute('data-type', type || '');
        toast.setAttribute('data-show', '1');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.setAttribute('data-show', '0');
        }, 3000);
    }

    /**
     * 内嵌确认条（避免 confirm 阻塞）
     * @param {string} triggerBtnId 触发按钮 id（会被临时隐藏）
     * @param {string} text 提示文本
     * @param {function} onConfirm 确认回调
     */
    function showConfirmBar(triggerBtnId, text, onConfirm) {
        const btn = document.getElementById(triggerBtnId);
        if (!btn) { if (confirm(text)) onConfirm(); return; }

        // 在按钮位置插入确认条，隐藏触发按钮
        const bar = document.createElement('div');
        bar.className = 'aria2-confirm-bar';
        bar.setAttribute('data-show', '1');
        bar.innerHTML = `
            <span style="flex-grow:1">${escapeHtml(text)}</span>
            <button class="aria2-btn aria2-btn-primary" data-cf="yes" style="padding:4px 12px;font-size:12px">确认</button>
            <button class="aria2-btn aria2-btn-default" data-cf="no" style="padding:4px 12px;font-size:12px">取消</button>
        `;
        btn.style.display = 'none';
        btn.parentNode.insertBefore(bar, btn.nextSibling);

        const cleanup = function () {
            bar.remove();
            btn.style.display = '';
        };
        bar.querySelector('[data-cf="yes"]').addEventListener('click', function () {
            cleanup();
            onConfirm();
        });
        bar.querySelector('[data-cf="no"]').addEventListener('click', cleanup);
    }

    // ---------- 快捷键 ----------
    let keyHandlerRef = null;

    function onBindModalKeys() {
        if (keyHandlerRef) return; // 已绑定
        keyHandlerRef = function (e) {
            // Esc 关闭
            if (e.key === 'Escape') {
                closeModal();
                return;
            }
            // Ctrl+Enter 发送（仅下载 Tab）
            if (e.ctrlKey && e.key === 'Enter' && activeTab === 'download') {
                e.preventDefault();
                const btn = document.getElementById('aria2-send-btn');
                if (btn && !btn.disabled) btn.click();
                return;
            }
            // Ctrl+S 保存（设置 Tab 服务器编辑表单内）
            if (e.ctrlKey && (e.key === 's' || e.key === 'S') && activeTab === 'settings') {
                e.preventDefault(); // 一律阻止浏览器默认保存行为
                const saveBtn = document.getElementById('aria2-server-form-save-btn');
                if (saveBtn) saveBtn.click();
                return;
            }
            // Ctrl+1/2/3 切换 Tab
            if (e.ctrlKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
                e.preventDefault();
                const map = { '1': 'download', '2': 'history', '3': 'settings' };
                activeTab = map[e.key];
                refreshTabs();
                renderActiveTab();
            }
        };
        document.addEventListener('keydown', keyHandlerRef);
    }

    function onUnbindModalKeys() {
        if (keyHandlerRef) {
            document.removeEventListener('keydown', keyHandlerRef);
            keyHandlerRef = null;
        }
    }

    // ---------- 工具栏 / Tab 交互绑定 ----------
    function bindToolbarEvents() {
        // 仅绑定一次（用 data-bound 标记）
        const app = document.getElementById('aria2-app');
        if (!app || app.getAttribute('data-bound')) return;
        app.setAttribute('data-bound', '1');

        // 批量获取关键元素，缺失任一则跳过对应绑定（避免抛异常导致后续绑定丢失）
        const closeBtn = document.getElementById('aria2-close');
        const mask = document.getElementById('aria2-mask');
        const serverSelect = document.getElementById('aria2-server-select');
        const themeBtn = document.getElementById('aria2-theme-btn');
        const testBtn = document.getElementById('aria2-test-btn');

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (mask) mask.addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });

        // 服务器切换
        if (serverSelect) serverSelect.addEventListener('change', function (e) {
            StorageManager.setLastServerId(e.target.value);
            refreshToolbar();
            renderActiveTab(); // 重新渲染当前 Tab（部分 Tab 依赖当前服务器）
        });

        // 主题切换
        if (themeBtn) themeBtn.addEventListener('click', function () {
            const prefs = StorageManager.getPrefs();
            const next = prefs.theme === 'dark' ? 'light' : 'dark';
            const newPrefs = Object.assign({}, prefs, { theme: next });
            StorageManager.setPrefs(newPrefs);
            document.getElementById('aria2-app').setAttribute('data-aria2-theme', next);
            this.textContent = next === 'dark' ? '☀️' : '🌙';
        });

        // Tab 切换
        document.querySelectorAll('.aria2-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                activeTab = tab.getAttribute('data-tab');
                refreshTabs();
                renderActiveTab();
            });
        });

        // 测试连接
        if (testBtn) testBtn.addEventListener('click', async function () {
            const server = StorageManager.getCurrentServer();
            if (!server) { showToast('无服务器', 'error'); return; }
            this.disabled = true;
            this.textContent = '测试中...';
            try {
                const v = await new Aria2RPC(server).getVersion();
                showToast('✓ 连接成功 (Aria2 v' + v.version + ')', 'success');
            } catch (e) {
                showToast('✗ ' + e.message, 'error');
            } finally {
                this.disabled = false;
                this.textContent = '⚡测试';
            }
        });
    }

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
        registerContextMenuListener();
        GM_registerMenuCommand('📥 打开下载面板', function () {
            openModal('download');
        });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
