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
