// ==UserScript==
// @name         发送到Aria2下载
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      2.0.0
// @description  右键/弹窗将链接发送到本地/远程Aria2下载，支持重命名、批量下载、自定义路径、代理设置、明暗主题切换，兼容所有Aria2客户端
// @author       Liora-Wells
// @match        *://*/*
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
// @updateURL    https://github.com/Liora-Wells/UserScript/raw/main/send-to-aria2.user.js
// @downloadURL  https://github.com/Liora-Wells/UserScript/raw/main/send-to-aria2.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 1. 全局配置与变量 =====================
    // 默认配置（首次加载生效，后续可在弹窗配置页修改）
    const DEFAULT_CONFIG = {
        rpcUrl: 'http://localhost:6800/jsonrpc', // Aria2 RPC默认地址
        rpcSecret: '', // Aria2 RPC密钥（无密钥则留空）
        defaultDir: '', // 默认下载路径（留空使用Aria2自身默认路径）
        autoNotification: true, // 下载任务发送成功后自动弹出桌面通知
        theme: 'dark', // 主题设置：dark-暗黑（默认）/light-明亮
        proxyUrl: '', // 代理地址（例：http://127.0.0.1:7890 / socks5://127.0.0.1:7890）
        enableProxy: false // 默认是否启用代理
    };

    // 全局变量
    let currentConfig = {}; // 当前生效的配置
    let rightClickUrl = ''; // 右键点击捕获的链接/媒体地址
    let rightClickFileName = ''; // 右键捕获的默认文件名

    // ===================== 2. 样式注入（主题优化+清晰度修复） =====================
    GM_addStyle(`
        /* 全局主题根变量 */
        :root {
            --bg-primary: #1f1f1f;
            --bg-secondary: #2a2a2a;
            --bg-mask: rgba(0, 0, 0, 0.7);
            --text-primary: #f5f5f5;
            --text-secondary: #dddddd;
            --text-tips: #aaaaaa;
            --border-color: #444444;
            --btn-default-bg: #333333;
            --btn-default-hover: #444444;
            --btn-default-text: #dddddd;
            --input-bg: #2a2a2a;
            --input-text: #ffffff;
            --input-placeholder: #888888;
            --shadow-color: rgba(0, 0, 0, 0.3);
        }

        /* 明亮主题变量 */
        :root[aria2-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f8f9fa;
            --bg-mask: rgba(0, 0, 0, 0.5);
            --text-primary: #333333;
            --text-secondary: #555555;
            --text-tips: #666666;
            --border-color: #dddddd;
            --btn-default-bg: #f5f5f5;
            --btn-default-hover: #eeeeee;
            --btn-default-text: #666666;
            --input-bg: #ffffff;
            --input-text: #333333;
            --input-placeholder: #999999;
            --shadow-color: rgba(0, 0, 0, 0.15);
        }

        /* 弹窗通用样式 */
        .aria2-modal-mask {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: var(--bg-mask);
            z-index: 999998;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .aria2-modal {
            width: 520px;
            max-width: 90vw;
            max-height: 90vh;
            background: var(--bg-primary);
            border-radius: 10px;
            box-shadow: 0 8px 30px var(--shadow-color);
            overflow: hidden;
            z-index: 999999;
            display: flex;
            flex-direction: column;
        }
        .aria2-modal-header {
            padding: 18px 22px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .aria2-modal-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
            line-height: 1.4;
        }
        .aria2-modal-close {
            width: 28px;
            height: 28px;
            border: none;
            background: none;
            font-size: 22px;
            color: var(--text-tips);
            cursor: pointer;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
        }
        .aria2-modal-close:hover {
            color: var(--text-primary);
            background: var(--btn-default-bg);
        }
        .aria2-modal-body {
            padding: 22px;
            overflow-y: auto;
            flex-grow: 1;
        }
        .aria2-form-group {
            margin-bottom: 18px;
        }
        .aria2-form-label {
            display: block;
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 500;
            line-height: 1.4;
        }
        .aria2-form-input, .aria2-form-textarea {
            width: 100%;
            box-sizing: border-box;
            padding: 10px 14px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 14px;
            color: var(--input-text);
            background: var(--input-bg);
            font-family: inherit;
            line-height: 1.5;
            transition: border-color 0.2s;
        }
        .aria2-form-textarea {
            resize: vertical;
            min-height: 90px;
        }
        .aria2-form-input:focus, .aria2-form-textarea:focus {
            outline: none;
            border-color: #409eff;
            box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
        }
        .aria2-form-input::placeholder, .aria2-form-textarea::placeholder {
            color: var(--input-placeholder);
        }
        .aria2-form-checkbox {
            margin-right: 6px;
            cursor: pointer;
        }
        .aria2-form-checkbox-label {
            font-size: 14px;
            color: var(--text-secondary);
            cursor: pointer;
            user-select: none;
            display: inline-flex;
            align-items: center;
            font-weight: 500;
        }
        .aria2-modal-footer {
            padding: 14px 22px;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            flex-shrink: 0;
        }
        .aria2-btn {
            padding: 9px 18px;
            border-radius: 6px;
            border: none;
            font-size: 14px;
            cursor: pointer;
            font-family: inherit;
            font-weight: 500;
            transition: all 0.2s;
            line-height: 1.4;
        }
        .aria2-btn-default {
            background: var(--btn-default-bg);
            color: var(--btn-default-text);
        }
        .aria2-btn-default:hover {
            background: var(--btn-default-hover);
        }
        .aria2-btn-primary {
            background: #409eff;
            color: #fff;
        }
        .aria2-btn-primary:hover {
            background: #337ecc;
        }
        .aria2-btn-danger {
            background: #f56c6c;
            color: #fff;
        }
        .aria2-btn-danger:hover {
            background: #d94e4e;
        }
        .aria2-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .aria2-tips {
            margin-top: 8px;
            font-size: 12px;
            color: var(--text-tips);
            line-height: 1.4;
        }
        .aria2-status-tip {
            margin-top: 14px;
            font-size: 13px;
            padding: 8px 12px;
            border-radius: 4px;
            display: none;
            line-height: 1.4;
        }
        .aria2-status-success {
            background: rgba(103, 194, 58, 0.1);
            color: #67c23a;
            border: 1px solid rgba(103, 194, 58, 0.2);
            display: block;
        }
        .aria2-status-error {
            background: rgba(245, 108, 108, 0.1);
            color: #f56c6c;
            border: 1px solid rgba(245, 108, 108, 0.2);
            display: block;
        }
        .aria2-form-row {
            display: flex;
            gap: 16px;
            align-items: center;
            margin-bottom: 18px;
        }
        .aria2-form-row .aria2-form-group {
            margin-bottom: 0;
            flex-grow: 1;
        }
        .aria2-form-select {
            width: 100%;
            box-sizing: border-box;
            padding: 10px 14px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 14px;
            color: var(--input-text);
            background: var(--input-bg);
            font-family: inherit;
            line-height: 1.5;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .aria2-form-select:focus {
            outline: none;
            border-color: #409eff;
        }
    `);

    // ===================== 3. 主题管理核心函数 =====================
    // 初始化主题
    function initTheme() {
        document.documentElement.setAttribute('aria2-theme', currentConfig.theme);
    }

    // 切换主题
    function switchTheme(theme) {
        currentConfig.theme = theme;
        document.documentElement.setAttribute('aria2-theme', theme);
        saveConfig({ theme: theme });
    }

    // ===================== 4. 配置管理核心函数 =====================
    // 加载配置
    async function loadConfig() {
        const savedConfig = await GM_getValue('aria2_config', null);
        currentConfig = savedConfig ? JSON.parse(savedConfig) : {...DEFAULT_CONFIG};
        initTheme(); // 加载配置后初始化主题
    }

    // 保存配置
    async function saveConfig(newConfig) {
        currentConfig = {...currentConfig, ...newConfig};
        await GM_setValue('aria2_config', JSON.stringify(currentConfig));
        showConfigStatusTip('配置保存成功', 'success');
    }

    // 重置配置
    async function resetConfig() {
        await GM_setValue('aria2_config', JSON.stringify(DEFAULT_CONFIG));
        currentConfig = {...DEFAULT_CONFIG};
        initTheme(); // 重置后恢复默认主题
        showConfigStatusTip('配置已重置为默认值', 'success');
    }

    // ===================== 5. Aria2 RPC通信核心函数（新增代理支持） =====================
    /**
     * 发送下载任务到Aria2
     * @param {string|array} urls 下载链接（单个字符串或多个链接数组）
     * @param {string} fileName 重命名的文件名（可选）
     * @param {string} saveDir 保存路径（可选）
     * @param {boolean} useProxy 是否使用代理
     * @returns {Promise} 下载结果
     */
    function sendToAria2(urls, fileName = '', saveDir = '', useProxy = false) {
        return new Promise((resolve, reject) => {
            // 格式化链接
            const urlList = Array.isArray(urls) ? urls.filter(url => url.trim()) : [urls.trim()];
            if (urlList.length === 0) {
                reject(new Error('下载链接不能为空'));
                return;
            }

            // 校验链接合法性
            const invalidUrl = urlList.find(url => !/^https?:\/\//.test(url));
            if (invalidUrl) {
                reject(new Error(`链接格式错误，必须以http/https开头：${invalidUrl}`));
                return;
            }

            // 构建RPC请求参数
            const params = [];
            // 添加密钥验证
            if (currentConfig.rpcSecret.trim()) {
                params.push(`token:${currentConfig.rpcSecret.trim()}`);
            }
            // 添加下载链接
            params.push(urlList);
            // 添加下载选项（重命名、路径、代理）
            const options = {};
            if (fileName.trim()) options.out = fileName.trim();
            if (saveDir.trim()) options.dir = saveDir.trim();
            else if (currentConfig.defaultDir.trim()) options.dir = currentConfig.defaultDir.trim();
            // 代理设置：启用代理且代理地址不为空时生效
            if (useProxy && currentConfig.proxyUrl.trim()) {
                options['all-proxy'] = currentConfig.proxyUrl.trim();
            }
            if (Object.keys(options).length > 0) params.push(options);

            // 构建RPC请求体
            const rpcBody = JSON.stringify({
                jsonrpc: '2.0',
                id: 'aria2_download_script_' + Date.now(),
                method: 'aria2.addUri',
                params: params
            });

            // 发送RPC请求（使用GM_xmlhttpRequest解决跨域问题）
            GM_xmlhttpRequest({
                method: 'POST',
                url: currentConfig.rpcUrl.trim(),
                headers: {
                    'Content-Type': 'application/json'
                },
                data: rpcBody,
                timeout: 10000,
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.error) {
                            reject(new Error(`Aria2返回错误：${result.error.message || result.error.code}`));
                        } else {
                            resolve(result.result);
                        }
                    } catch (e) {
                        reject(new Error('解析Aria2响应失败，响应内容格式错误'));
                    }
                },
                onerror: function() {
                    reject(new Error('连接失败，请检查Aria2是否启动、RPC地址是否正确'));
                },
                ontimeout: function() {
                    reject(new Error('连接超时，请检查Aria2 RPC服务是否正常运行'));
                }
            });
        });
    }

    // ===================== 6. 右键事件捕获 =====================
    // 监听右键点击事件，捕获当前点击的链接/图片/视频地址
    document.addEventListener('contextmenu', function(e) {
        // 重置右键数据
        rightClickUrl = '';
        rightClickFileName = '';

        const target = e.target;

        // 1. 优先捕获链接地址（a标签）
        const linkElement = target.closest('a');
        if (linkElement && linkElement.href) {
            rightClickUrl = linkElement.href;
            // 提取默认文件名
            rightClickFileName = getFileNameFromUrl(rightClickUrl);
            return;
        }

        // 2. 捕获图片地址
        if (target.tagName === 'IMG' && target.src) {
            rightClickUrl = target.src;
            rightClickFileName = getFileNameFromUrl(rightClickUrl);
            return;
        }

        // 3. 捕获视频/音频地址
        if (['VIDEO', 'AUDIO'].includes(target.tagName) && target.src) {
            rightClickUrl = target.src;
            rightClickFileName = getFileNameFromUrl(rightClickUrl);
            return;
        }

        // 4. 兜底：当前页面地址
        rightClickUrl = window.location.href;
        rightClickFileName = document.title + '.html';
    }, true);

    // 从URL中提取默认文件名
    function getFileNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            // 提取路径最后一段作为文件名
            const fileName = pathname.split('/').pop().trim();
            // 过滤无后缀的无效文件名
            return fileName && fileName.includes('.') ? decodeURIComponent(fileName) : '';
        } catch (e) {
            return '';
        }
    }

    // ===================== 7. 弹窗相关函数（界面优化+新增代理/主题配置） =====================
    // 创建弹窗DOM
    function createModal() {
        // 避免重复创建
        if (document.getElementById('aria2-main-modal')) return;

        // 主弹窗HTML（新增代理开关）
        const modalHtml = `
            <div class="aria2-modal-mask" id="aria2-main-modal-mask">
                <div class="aria2-modal" id="aria2-main-modal">
                    <div class="aria2-modal-header">
                        <h3 class="aria2-modal-title">发送到Aria2下载</h3>
                        <button class="aria2-modal-close" id="aria2-main-close">×</button>
                    </div>
                    <div class="aria2-modal-body">
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">下载链接（支持多行批量，一行一个）</label>
                            <textarea class="aria2-form-textarea" id="aria2-url-input" placeholder="请输入下载链接，一行一个"></textarea>
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">文件名（重命名，可选）</label>
                            <input type="text" class="aria2-form-input" id="aria2-filename-input" placeholder="留空使用原文件名">
                            <div class="aria2-tips">批量下载时请勿填写文件名，将使用原文件名保存</div>
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">保存路径（可选）</label>
                            <input type="text" class="aria2-form-input" id="aria2-dir-input" placeholder="留空使用默认路径">
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-checkbox-label">
                                <input type="checkbox" class="aria2-form-checkbox" id="aria2-use-proxy-checkbox">
                                使用代理（解决浏览器能访问但Aria2无法下载的问题）
                            </label>
                            <div class="aria2-tips">需先在配置设置中填写代理地址</div>
                        </div>
                        <div class="aria2-status-tip" id="aria2-status-tip"></div>
                    </div>
                    <div class="aria2-modal-footer">
                        <button class="aria2-btn aria2-btn-default" id="aria2-config-btn">配置设置</button>
                        <button class="aria2-btn aria2-btn-default" id="aria2-clear-btn">清空</button>
                        <button class="aria2-btn aria2-btn-primary" id="aria2-send-btn">发送下载</button>
                    </div>
                </div>
            </div>

            <!-- 配置弹窗（新增主题切换+代理配置） -->
            <div class="aria2-modal-mask" id="aria2-config-modal-mask">
                <div class="aria2-modal" id="aria2-config-modal">
                    <div class="aria2-modal-header">
                        <h3 class="aria2-modal-title">Aria2配置设置</h3>
                        <button class="aria2-modal-close" id="aria2-config-close">×</button>
                    </div>
                    <div class="aria2-modal-body">
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">主题设置</label>
                            <select class="aria2-form-select" id="aria2-theme-select">
                                <option value="dark">暗黑主题（默认）</option>
                                <option value="light">明亮主题</option>
                            </select>
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">Aria2 RPC 地址</label>
                            <input type="text" class="aria2-form-input" id="aria2-rpc-url-input" placeholder="例如：http://localhost:6800/jsonrpc">
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">Aria2 RPC 密钥</label>
                            <input type="password" class="aria2-form-input" id="aria2-rpc-secret-input" placeholder="无密钥则留空">
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">默认下载路径</label>
                            <input type="text" class="aria2-form-input" id="aria2-default-dir-input" placeholder="留空使用Aria2自身默认路径">
                        </div>
                        <div class="aria2-form-group">
                            <label class="aria2-form-label">代理地址（支持http/https/socks5）</label>
                            <input type="text" class="aria2-form-input" id="aria2-proxy-url-input" placeholder="例如：http://127.0.0.1:7890 / socks5://127.0.0.1:7890">
                            <div class="aria2-tips">填写与浏览器一致的代理地址，解决Aria2无全局代理无法下载的问题</div>
                        </div>
                        <div class="aria2-form-row">
                            <div class="aria2-form-group">
                                <label class="aria2-form-checkbox-label">
                                    <input type="checkbox" class="aria2-form-checkbox" id="aria2-notification-checkbox">
                                    发送成功后显示桌面通知
                                </label>
                            </div>
                            <div class="aria2-form-group">
                                <label class="aria2-form-checkbox-label">
                                    <input type="checkbox" class="aria2-form-checkbox" id="aria2-proxy-default-checkbox">
                                    默认启用代理
                                </label>
                            </div>
                        </div>
                        <div class="aria2-status-tip" id="aria2-config-status-tip"></div>
                    </div>
                    <div class="aria2-modal-footer">
                        <button class="aria2-btn aria2-btn-danger" id="aria2-reset-btn">重置默认</button>
                        <button class="aria2-btn aria2-btn-default" id="aria2-config-cancel-btn">取消</button>
                        <button class="aria2-btn aria2-btn-primary" id="aria2-config-save-btn">保存配置</button>
                    </div>
                </div>
            </div>
        `;

        // 插入到页面
        const container = document.createElement('div');
        container.innerHTML = modalHtml;
        document.body.appendChild(container);

        // 绑定事件
        bindModalEvents();
    }

    // 绑定弹窗事件
    function bindModalEvents() {
        // 主弹窗元素
        const mainMask = document.getElementById('aria2-main-modal-mask');
        const mainModal = document.getElementById('aria2-main-modal');
        const mainClose = document.getElementById('aria2-main-close');
        const sendBtn = document.getElementById('aria2-send-btn');
        const clearBtn = document.getElementById('aria2-clear-btn');
        const configBtn = document.getElementById('aria2-config-btn');
        const urlInput = document.getElementById('aria2-url-input');
        const filenameInput = document.getElementById('aria2-filename-input');
        const dirInput = document.getElementById('aria2-dir-input');
        const useProxyCheckbox = document.getElementById('aria2-use-proxy-checkbox');
        const statusTip = document.getElementById('aria2-status-tip');

        // 配置弹窗元素
        const configMask = document.getElementById('aria2-config-modal-mask');
        const configModal = document.getElementById('aria2-config-modal');
        const configClose = document.getElementById('aria2-config-close');
        const configCancelBtn = document.getElementById('aria2-config-cancel-btn');
        const configSaveBtn = document.getElementById('aria2-config-save-btn');
        const resetBtn = document.getElementById('aria2-reset-btn');
        const themeSelect = document.getElementById('aria2-theme-select');
        const rpcUrlInput = document.getElementById('aria2-rpc-url-input');
        const rpcSecretInput = document.getElementById('aria2-rpc-secret-input');
        const defaultDirInput = document.getElementById('aria2-default-dir-input');
        const proxyUrlInput = document.getElementById('aria2-proxy-url-input');
        const notificationCheckbox = document.getElementById('aria2-notification-checkbox');
        const proxyDefaultCheckbox = document.getElementById('aria2-proxy-default-checkbox');
        const configStatusTip = document.getElementById('aria2-config-status-tip');

        // 主弹窗关闭事件
        function closeMainModal() {
            mainMask.style.display = 'none';
            // 清空输入框和提示
            urlInput.value = '';
            filenameInput.value = '';
            dirInput.value = '';
            useProxyCheckbox.checked = currentConfig.enableProxy;
            statusTip.className = 'aria2-status-tip';
            statusTip.textContent = '';
        }

        mainClose.addEventListener('click', closeMainModal);
        mainMask.addEventListener('click', function(e) {
            if (e.target === mainMask) closeMainModal();
        });

        // 清空按钮
        clearBtn.addEventListener('click', function() {
            urlInput.value = '';
            filenameInput.value = '';
            dirInput.value = '';
            useProxyCheckbox.checked = currentConfig.enableProxy;
            statusTip.className = 'aria2-status-tip';
            statusTip.textContent = '';
        });

        // 发送下载按钮
        sendBtn.addEventListener('click', async function() {
            const urls = urlInput.value.trim().split('\n');
            const fileName = filenameInput.value.trim();
            const saveDir = dirInput.value.trim();
            const useProxy = useProxyCheckbox.checked;

            // 校验
            if (urls.length === 0 || !urls[0].trim()) {
                showStatusTip('请输入下载链接', 'error');
                return;
            }

            // 批量下载禁止重命名
            if (urls.length > 1 && fileName) {
                showStatusTip('批量下载时请勿填写文件名', 'error');
                return;
            }

            // 代理校验
            if (useProxy && !currentConfig.proxyUrl.trim()) {
                showStatusTip('请先在配置设置中填写代理地址', 'error');
                return;
            }

            try {
                sendBtn.disabled = true;
                sendBtn.textContent = '发送中...';
                await sendToAria2(urls, fileName, saveDir, useProxy);
                showStatusTip(`下载任务发送成功，共${urls.length}个任务`, 'success');
                // 桌面通知
                if (currentConfig.autoNotification) {
                    GM_notification({
                        title: '发送到Aria2成功',
                        text: `已成功发送${urls.length}个下载任务`,
                        timeout: 3000
                    });
                }
                // 发送成功后2秒关闭弹窗
                setTimeout(() => {
                    closeMainModal();
                }, 2000);
            } catch (e) {
                showStatusTip(e.message, 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = '发送下载';
            }
        });

        // 配置弹窗打开/关闭
        function openConfigModal() {
            // 填充当前配置
            themeSelect.value = currentConfig.theme;
            rpcUrlInput.value = currentConfig.rpcUrl || '';
            rpcSecretInput.value = currentConfig.rpcSecret || '';
            defaultDirInput.value = currentConfig.defaultDir || '';
            proxyUrlInput.value = currentConfig.proxyUrl || '';
            notificationCheckbox.checked = currentConfig.autoNotification;
            proxyDefaultCheckbox.checked = currentConfig.enableProxy;
            configStatusTip.className = 'aria2-status-tip';
            configStatusTip.textContent = '';
            configMask.style.display = 'flex';
        }

        function closeConfigModal() {
            configMask.style.display = 'none';
        }

        configBtn.addEventListener('click', openConfigModal);
        configClose.addEventListener('click', closeConfigModal);
        configCancelBtn.addEventListener('click', closeConfigModal);
        configMask.addEventListener('click', function(e) {
            if (e.target === configMask) closeConfigModal();
        });

        // 主题实时预览切换
        themeSelect.addEventListener('change', function() {
            switchTheme(this.value);
        });

        // 配置保存按钮
        configSaveBtn.addEventListener('click', async function() {
            const newConfig = {
                rpcUrl: rpcUrlInput.value.trim(),
                rpcSecret: rpcSecretInput.value.trim(),
                defaultDir: defaultDirInput.value.trim(),
                autoNotification: notificationCheckbox.checked,
                proxyUrl: proxyUrlInput.value.trim(),
                enableProxy: proxyDefaultCheckbox.checked,
                theme: themeSelect.value
            };

            if (!newConfig.rpcUrl) {
                showConfigStatusTip('RPC地址不能为空', 'error');
                return;
            }

            await saveConfig(newConfig);
            // 更新主弹窗代理默认状态
            useProxyCheckbox.checked = newConfig.enableProxy;
            closeConfigModal();
        });

        // 重置配置按钮
        resetBtn.addEventListener('click', async function() {
            if (confirm('确定要重置为默认配置吗？所有设置将恢复初始状态')) {
                await resetConfig();
                // 重置配置弹窗表单
                themeSelect.value = currentConfig.theme;
                rpcUrlInput.value = currentConfig.rpcUrl;
                rpcSecretInput.value = currentConfig.rpcSecret;
                defaultDirInput.value = currentConfig.defaultDir;
                proxyUrlInput.value = currentConfig.proxyUrl;
                notificationCheckbox.checked = currentConfig.autoNotification;
                proxyDefaultCheckbox.checked = currentConfig.enableProxy;
                closeConfigModal();
            }
        });
    }

    // 打开主弹窗
    function openMainModal(defaultUrl = '', defaultFileName = '') {
        createModal();
        const urlInput = document.getElementById('aria2-url-input');
        const filenameInput = document.getElementById('aria2-filename-input');
        const dirInput = document.getElementById('aria2-dir-input');
        const useProxyCheckbox = document.getElementById('aria2-use-proxy-checkbox');

        // 填充默认值
        urlInput.value = defaultUrl;
        filenameInput.value = defaultFileName;
        dirInput.value = currentConfig.defaultDir || '';
        useProxyCheckbox.checked = currentConfig.enableProxy;

        // 显示弹窗
        document.getElementById('aria2-main-modal-mask').style.display = 'flex';
        urlInput.focus();
    }

    // 状态提示
    function showStatusTip(text, type) {
        const tip = document.getElementById('aria2-status-tip');
        if (!tip) return;
        tip.textContent = text;
        tip.className = `aria2-status-tip aria2-status-${type}`;
    }

    function showConfigStatusTip(text, type) {
        const tip = document.getElementById('aria2-config-status-tip');
        if (!tip) return;
        tip.textContent = text;
        tip.className = `aria2-status-tip aria2-status-${type}`;
    }

    // ===================== 8. 菜单注册 =====================
    async function registerMenuCommands() {
        await loadConfig();

        // 1. 打开下载面板（主弹窗）
        GM_registerMenuCommand('📥 打开下载面板', function() {
            openMainModal();
        });

        // 2. 直接发送当前右键链接到Aria2
        GM_registerMenuCommand('⚡ 直接发送到Aria2', async function() {
            if (!rightClickUrl) {
                alert('未获取到有效下载链接');
                return;
            }

            try {
                await sendToAria2(rightClickUrl, rightClickFileName, '', currentConfig.enableProxy);
                if (currentConfig.autoNotification) {
                    GM_notification({
                        title: '发送成功',
                        text: '下载任务已发送到Aria2',
                        timeout: 3000
                    });
                }
            } catch (e) {
                alert(`发送失败：${e.message}`);
            }
        });

        // 3. 发送到Aria2（重命名）
        GM_registerMenuCommand('✏️ 发送到Aria2（重命名）', function() {
            if (!rightClickUrl) {
                alert('未获取到有效下载链接');
                return;
            }
            openMainModal(rightClickUrl, rightClickFileName);
        });

        // 4. 打开配置设置
        GM_registerMenuCommand('⚙️ 配置设置', function() {
            createModal();
            document.getElementById('aria2-config-btn').click();
        });
    }

    // ===================== 9. 初始化执行 =====================
    window.addEventListener('DOMContentLoaded', async function() {
        await registerMenuCommands();
    });

    // 兼容页面动态加载
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        registerMenuCommands();
    }
})();
