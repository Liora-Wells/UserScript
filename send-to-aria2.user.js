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
        GM_registerMenuCommand('📥 打开下载面板', function () {
            alert('骨架：下载面板待实现');
        });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
