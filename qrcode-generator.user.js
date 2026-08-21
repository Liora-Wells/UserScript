// ==UserScript==
// @name         二维码生成器
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      1.1.0
// @description  二维码生成器：生成/解析/批量/多选/黑白名单/历史记录
// @author       Liora-Wells
// @match        *://*/*
// @updateURL    https://github.com/Liora-Wells/UserScript/raw/main/qrcode-generator.user.js
// @downloadURL  https://github.com/Liora-Wells/UserScript/raw/main/qrcode-generator.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_notification
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
// @require      https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // ========== 兼容层 ==========
    function storageGet(key, defVal) {
        try {
            var v = GM_getValue(key, defVal);
            return v === undefined ? defVal : v;
        } catch (e) { return defVal; }
    }
    function storageSet(key, val) {
        try { GM_setValue(key, val); } catch (e) { /* ignore */ }
    }
    function notifySystem(text) {
        try { GM_notification({ text: text, timeout: 2000 }); return true; }
        catch (e) { return false; }
    }

    async function copyText(text) {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
            ta.remove();
            return ok;
        }
    }

    function copyImageToClipboard(canvas) {
        return new Promise(function (resolve) {
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
                resolve(false); return;
            }
            canvas.toBlob(function (blob) {
                if (!blob) { resolve(false); return; }
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    .then(function () { resolve(true); })
                    .catch(function () { resolve(false); });
            }, 'image/png');
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    var SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? GM_info.script.version : '1.1.0';

    // ========== 日志模块 ==========
    var DEBUG = false;
    function log() { if (DEBUG) console.log.apply(console, ['[QR]'].concat([].slice.call(arguments))); }
    function warn() { if (DEBUG) console.warn.apply(console, ['[QR]'].concat([].slice.call(arguments))); }
    function errLog() { console.error.apply(console, ['[QR]'].concat([].slice.call(arguments))); }

    // ========== 配置模块 ==========
    var DEFAULT_CONFIG = {
        whitelist: [],
        blacklist: [],
        whitelistMode: false,
        size: 240,
        fgColor: '#000000',
        bgColor: '#ffffff',
        qrMargin: 16,
        qrBorderRadius: 4,
        history: [],
        maxHistory: 10,
        theme: 'auto',
        maxBatch: 9,
        debug: false
    };

    function loadConfig() {
        var saved = storageGet('qrConfig', {});
        if (!saved || typeof saved !== 'object') saved = {};
        var cfg = {};
        for (var k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
        for (var k in saved) cfg[k] = saved[k];
        // 旧存档兼容：补默认值
        if (typeof cfg.qrMargin !== 'number') cfg.qrMargin = DEFAULT_CONFIG.qrMargin;
        if (typeof cfg.qrBorderRadius !== 'number') cfg.qrBorderRadius = DEFAULT_CONFIG.qrBorderRadius;
        return cfg;
    }
    function saveConfig() { storageSet('qrConfig', CONFIG); }
    function setConfig(key, val) { CONFIG[key] = val; saveConfig(); }

    var CONFIG = loadConfig();
    DEBUG = !!CONFIG.debug;

    function shouldRun() {
        var host = location.hostname;
        var url = location.href;
        function matchPattern(pattern) {
            pattern = pattern.trim();
            if (!pattern) return false;
            if (pattern.indexOf('*.') === 0) return host.endsWith(pattern.slice(1));
            if (host === pattern) return true;
            if (url.indexOf(pattern) !== -1) return true;
            return false;
        }
        function matchList(list) { return list.some(matchPattern); }
        if (CONFIG.whitelistMode) {
            return CONFIG.whitelist.length === 0 || matchList(CONFIG.whitelist);
        } else {
            return !matchList(CONFIG.blacklist);
        }
    }

    function isDarkTheme() {
        if (CONFIG.theme === 'dark') return true;
        if (CONFIG.theme === 'light') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    var AUTO_RUN = shouldRun();

    // ========== 样式注入 ==========
    GM_addStyle(`
        .qr-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.4);z-index:2147483646;display:flex;align-items:center;justify-content:center;animation:qrFadeIn .2s ease}
        @keyframes qrFadeIn{from{opacity:0}to{opacity:1}}
        .qr-panel{--qr-bg:#fff;--qr-surface:#fafafa;--qr-text:#333;--qr-border:#eee;--qr-input-bg:#fff;--qr-input-border:#ddd;--qr-hover:#f0f0f0;--qr-accent:#4a90e2;background:var(--qr-bg);color:var(--qr-text);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);min-width:300px;max-width:90vw;max-height:90vh;overflow-y:auto;position:relative;font-family:-apple-system,"Segoe UI",sans-serif}
        .qr-panel[data-theme="dark"]{--qr-bg:#1e1e1e;--qr-surface:#2d2d2d;--qr-text:#eee;--qr-border:#444;--qr-input-bg:#2d2d2d;--qr-input-border:#444;--qr-hover:#333;--qr-accent:#6ab0ff}
        .qr-title{font-size:14px;font-weight:600;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;touch-action:none}
        .qr-close{cursor:pointer;font-size:20px;line-height:1;color:#999;padding:0 4px}
        .qr-close:hover{color:#f55}
        .qr-canvas{text-align:center;margin:10px 0;min-height:40px}
        .qr-canvas{padding:var(--qr-margin,16px);background:var(--qr-canvas-bg,#fff);border-radius:var(--qr-radius,4px);display:inline-block;line-height:0}
        .qr-canvas canvas{max-width:100%;border-radius:var(--qr-radius,4px);display:block}
        .qr-canvas-placeholder{font-size:13px;color:#888;padding:30px 0;text-align:center}
        .qr-input{width:100%;padding:8px;border:1px solid var(--qr-input-border);background:var(--qr-input-bg);color:var(--qr-text);border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:10px}
        .qr-btns{display:flex;gap:8px;flex-wrap:wrap}
        .qr-btn{flex:1;padding:8px 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;transition:all .2s;background:var(--qr-accent);color:#fff;min-width:80px}
        .qr-btn:hover{opacity:.85}
        .qr-btn.secondary{background:#888}
        .qr-btn.ghost{background:transparent;color:var(--qr-accent);border:1px solid var(--qr-accent)}
        .qr-history{margin-top:10px;max-height:140px;overflow-y:auto;font-size:12px}
        .qr-history-item{display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-radius:4px;white-space:nowrap;overflow:hidden}
        .qr-history-text{flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;margin-right:6px}
        .qr-history-text:hover{color:var(--qr-accent)}
        .qr-history-del{cursor:pointer;color:#999;font-size:14px;padding:0 4px;flex-shrink:0}
        .qr-history-del:hover{color:#f55}
        .qr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin:15px 0}
        .qr-grid-item{text-align:center;padding:10px;border:1px solid var(--qr-border);border-radius:8px;background:var(--qr-surface)}
        .qr-grid-item canvas{width:140px;height:140px;cursor:pointer}
        .qr-grid-item canvas:hover{transform:scale(1.05)}
        .qr-grid-label{font-size:11px;color:#888;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .qr-float-btn{position:fixed;z-index:2147483647;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:20px;transition:all .2s;pointer-events:auto}
        .qr-float-btn:hover{transform:scale(1.15)}
        .qr-selected{outline:3px solid var(--qr-accent)!important;outline-offset:2px}
        .qr-multiselect-hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--qr-accent);color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.3)}
        .qr-settings{min-width:380px}
        .qr-settings h3{margin:10px 0 6px;font-size:14px}
        .qr-settings label{display:block;font-size:13px;margin:6px 0 2px}
        .qr-settings textarea{width:100%;min-height:60px;padding:6px;font-size:12px;border:1px solid var(--qr-input-border);background:var(--qr-input-bg);color:var(--qr-text);border-radius:4px;resize:vertical;font-family:monospace;box-sizing:border-box}
        .qr-row{display:flex;gap:10px;align-items:center;margin:6px 0}
        .qr-row input[type="color"]{width:40px;height:30px;border:none;cursor:pointer}
        .qr-row input[type="number"]{width:80px;padding:4px}
        .qr-tip{font-size:11px;color:#888;margin-top:4px}
        .qr-warning{background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px;font-size:12px;color:#856404;margin:8px 0}
        .qr-panel[data-theme="dark"] .qr-warning{background:#332b00;border-color:#665500;color:#ffc107}
        .qr-toast{position:fixed;top:20px;right:20px;z-index:2147483647;background:#333;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.3);animation:qrToastIn .25s ease;max-width:320px;word-break:break-all}
        .qr-toast.qr-toast-success{background:#2e7d32}
        .qr-toast.qr-toast-error{background:#c62828}
        .qr-toast.qr-toast-out{animation:qrToastOut .25s ease forwards}
        @keyframes qrToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes qrToastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(20px)}}
    `);

    // ========== Toast 组件 ==========
    function toast(msg, type) {
        type = type || 'info';
        var el = document.createElement('div');
        el.className = 'qr-toast qr-toast-' + type;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () {
            el.classList.add('qr-toast-out');
            setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
        }, 2000);
    }
    function notifyUser(msg) {
        if (!notifySystem(msg)) toast(msg, 'info');
        else toast(msg, 'info');
    }

    // ========== QR 核心 ==========
    // 深色主题仅影响面板 chrome，码体始终用纯净背景，避免影响识别
    function getQRColors() {
        return { fg: CONFIG.fgColor, bg: CONFIG.bgColor };
    }
    function generateQRCanvas(text, size, fgColor, bgColor) {
        if (!text || !text.trim()) throw new Error('EMPTY');
        if (fgColor === undefined || bgColor === undefined) {
            var c = getQRColors(); fgColor = c.fg; bgColor = c.bg;
        }
        if (!text || !text.trim()) throw new Error('EMPTY');
        var qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var cellSize = Math.floor(size / count);
        if (cellSize < 1) cellSize = 1;
        var actualSize = cellSize * count;
        var canvas = document.createElement('canvas');
        canvas.width = actualSize;
        canvas.height = actualSize;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, actualSize, actualSize);
        ctx.fillStyle = fgColor;
        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                if (qr.isDark(r, c)) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
        return canvas;
    }

    function generateQRSvg(text, size) {
        if (!text || !text.trim()) throw new Error('EMPTY');
        if (size === undefined) size = CONFIG.size;
        var qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var cellSize = Math.max(2, Math.floor(size / count));
        return qr.createSvgTag({ cellSize: cellSize, margin: 0 });
    }

    function decodeImageFile(file) {
        if (!file) { toast('未选择文件', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
                var MAX = 1000;
                var scale = Math.min(1, MAX / Math.max(img.width, img.height));
                var w = Math.round(img.width * scale);
                var h = Math.round(img.height * scale);
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var imageData;
                try { imageData = ctx.getImageData(0, 0, w, h); }
                catch (e) { errLog(e); toast('解析失败：无法读取图片', 'error'); return; }
                try {
                    var code = jsQR(imageData.data, w, h);
                    if (code && code.data) {
                        toast('解析成功', 'success');
                        showQR(code.data, '解析结果');
                    } else {
                        toast('未识别到二维码', 'error');
                    }
                } catch (e) { errLog(e); toast('解析失败：' + e.message, 'error'); }
            };
            img.onerror = function () { toast('图片加载失败', 'error'); };
            img.src = ev.target.result;
        };
        reader.onerror = function () { toast('文件读取失败', 'error'); };
        reader.readAsDataURL(file);
    }

    function showDecodeQR() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function (e) {
            var file = e.target.files[0];
            if (file) decodeImageFile(file);
        };
        input.click();
    }

    // ========== 全局状态 ==========
    var currentOverlay = null;
    var currentQR = { text: '', canvas: null };

    // ========== 拖动（Pointer Events，自动清理监听器） ==========
    function makeDraggable(panel, handle) {
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            var rect = panel.getBoundingClientRect();
            var offX = e.clientX - rect.left;
            var offY = e.clientY - rect.top;
            panel.style.position = 'fixed';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.margin = '0';
            if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (_) {} }
            e.preventDefault();
            function onMove(ev) {
                panel.style.left = Math.max(0, Math.min(ev.clientX - offX, window.innerWidth - panel.offsetWidth)) + 'px';
                panel.style.top = Math.max(0, Math.min(ev.clientY - offY, window.innerHeight - 40)) + 'px';
            }
            function onUp(ev) {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                if (ev.target.releasePointerCapture) { try { ev.target.releasePointerCapture(ev.pointerId); } catch (_) {} }
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
        });
    }

    // ========== 历史记录 ==========
    function addHistory(text) {
        if (!text) return;
        CONFIG.history = CONFIG.history.filter(function (h) { return h !== text; });
        CONFIG.history.unshift(text);
        if (CONFIG.history.length > CONFIG.maxHistory) CONFIG.history = CONFIG.history.slice(0, CONFIG.maxHistory);
        saveConfig();
    }
    function removeHistory(text) {
        CONFIG.history = CONFIG.history.filter(function (h) { return h !== text; });
        saveConfig();
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.remove(); }, 1000);
    }

    function applyThemeToPanel(panel) {
        panel.setAttribute('data-theme', isDarkTheme() ? 'dark' : 'light');
    }

    // ========== 主弹窗 ==========
    function closeQR() {
        if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    }

    function showQR(text, title) {
        title = title || '二维码';
        text = (text || '').trim();
        if (text) addHistory(text);

        closeQR();

        var overlay = document.createElement('div');
        overlay.className = 'qr-overlay';
        var panel = document.createElement('div');
        panel.className = 'qr-panel';
        applyThemeToPanel(panel);

        currentQR.text = text;

        panel.innerHTML = ''
            + '<div class="qr-title"><span>' + escapeHtml(title) + '</span><span class="qr-close" title="关闭 (Esc / Alt+W)">\u2715</span></div>'
            + '<div class="qr-canvas"></div>'
            + '<input class="qr-input" type="text" placeholder="输入内容实时生成二维码">'
            + '<div class="qr-btns">'
            + '  <button class="qr-btn" data-act="copy">\uD83D\uDCCB 复制文本</button>'
            + '  <button class="qr-btn" data-act="copyimg">\uD83D\uDDBC 复制图片</button>'
            + '  <button class="qr-btn" data-act="dlpng">\uD83D\uDCE5 PNG</button>'
            + '  <button class="qr-btn" data-act="dlsvg">\uD83D\uDCE5 SVG</button>'
            + '  <button class="qr-btn secondary" data-act="settings">\u2699\uFE0F 设置</button>'
            + '</div>'
            + '<div class="qr-history"></div>';
        // 样式自定义：边距 / 圆角 作用于画布容器（不影响码体本身颜色，避免影响解析）
        canvasBox.style.setProperty('--qr-margin', (CONFIG.qrMargin || 0) + 'px');
        canvasBox.style.setProperty('--qr-radius', (CONFIG.qrBorderRadius || 0) + 'px');

        var canvasBox = panel.querySelector('.qr-canvas');
        var input = panel.querySelector('.qr-input');
        input.value = text;

        function renderCanvas(val) {
            canvasBox.innerHTML = '';
            if (!val || !val.trim()) {
                var ph = document.createElement('div');
                ph.className = 'qr-canvas-placeholder';
                ph.textContent = '请输入内容生成二维码';
                canvasBox.appendChild(ph);
                currentQR.canvas = null;
                currentQR.text = '';
                return;
            }
            try {
                var c = generateQRCanvas(val, CONFIG.size, CONFIG.fgColor, CONFIG.bgColor);
                canvasBox.appendChild(c);
                currentQR.canvas = c;
                currentQR.text = val;
            } catch (e) {
                errLog(e);
                var msg = e.message === 'EMPTY' ? '内容为空' : '内容过长，无法生成二维码';
                toast(msg, 'error');
                if (!currentQR.canvas) {
                    var ph2 = document.createElement('div');
                    ph2.className = 'qr-canvas-placeholder';
                    ph2.textContent = msg;
                    canvasBox.appendChild(ph2);
                } else {
                    canvasBox.appendChild(currentQR.canvas);
                }
            }
        }

        renderCanvas(text);

        var histBox = panel.querySelector('.qr-history');
        var others = CONFIG.history.filter(function (h) { return h !== text; });
        if (others.length > 0) {
            var head = document.createElement('div');
            head.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px';
            head.textContent = '\uD83D\uDCDC 最近记录：';
            histBox.appendChild(head);
            others.forEach(function (h) {
                var row = document.createElement('div');
                row.className = 'qr-history-item';
                var span = document.createElement('span');
                span.className = 'qr-history-text';
                span.textContent = h;
                span.title = h;
                span.onclick = function () { showQR(h, title); };
                var del = document.createElement('span');
                del.className = 'qr-history-del';
                del.textContent = '\u2715';
                del.title = '删除';
                del.onclick = function (ev) {
                    ev.stopPropagation();
                    removeHistory(h);
                    row.remove();
                    if (histBox.querySelectorAll('.qr-history-item').length === 0) histBox.innerHTML = '';
                };
                row.appendChild(span);
                row.appendChild(del);
                histBox.appendChild(row);
            });
        }

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        currentOverlay = overlay;

        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeQR(); });
        panel.querySelector('.qr-close').onclick = closeQR;
        makeDraggable(panel, panel.querySelector('.qr-title'));

        var timer;
        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () { renderCanvas(input.value); }, 300);
        });

        var copyImgBtn = panel.querySelector('[data-act="copyimg"]');
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
            copyImgBtn.style.display = 'none';
        }

        panel.querySelectorAll('.qr-btn').forEach(function (btn) {
            btn.onclick = function () {
                var act = btn.getAttribute('data-act');
                if (act === 'copy') {
                    var val = currentQR.text || input.value.trim();
                    if (!val) { toast('没有可复制的内容', 'error'); return; }
                    copyText(val).then(function (ok) {
                        if (ok) { toast('已复制', 'success'); btn.textContent = '\u2713 已复制'; setTimeout(function () { btn.textContent = '\uD83D\uDCCB 复制文本'; }, 1200); }
                        else toast('复制失败', 'error');
                    });
                } else if (act === 'copyimg') {
                    if (!currentQR.canvas) { toast('没有可复制的图片', 'error'); return; }
                    copyImageToClipboard(currentQR.canvas).then(function (ok) {
                        if (ok) toast('图片已复制', 'success');
                        else toast('复制图片失败', 'error');
                    });
                } else if (act === 'dlpng') {
                    if (!currentQR.canvas) { toast('没有可下载的图片', 'error'); return; }
                    var name = 'qr-' + (currentQR.text.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '_') || 'qrcode') + '.png';
                    downloadBlob(dataURLToBlob(currentQR.canvas.toDataURL('image/png')), name);
                    toast('已下载 PNG', 'success');
                } else if (act === 'dlsvg') {
                    var val2 = currentQR.text || input.value.trim();
                    if (!val2) { toast('没有可下载的内容', 'error'); return; }
                    try {
                        var svgStr = generateQRSvg(val2, CONFIG.size);
                        var blob = new Blob([svgStr], { type: 'image/svg+xml' });
                        var name2 = 'qr-' + (val2.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '_') || 'qrcode') + '.svg';
                        downloadBlob(blob, name2);
                        toast('已下载 SVG', 'success');
                    } catch (e) { errLog(e); toast('SVG 生成失败', 'error'); }
                } else if (act === 'settings') {
                    showSettings();
                }
            };
        });

        setTimeout(function () { input.focus(); }, 50);
    }

    function dataURLToBlob(dataURL) {
        var parts = dataURL.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var u8 = new Uint8Array(bstr.length);
        for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        return new Blob([u8], { type: mime });
    }

    function showInputPrompt() {
        showQR('', '自定义内容');
    }

    // ========== 批量生成弹窗 ==========
    function showMultipleQR(links) {
        closeQR();
        if (!links || links.length === 0) { toast('没有可生成的链接', 'error'); return; }

        var overlay = document.createElement('div');
        overlay.className = 'qr-overlay';
        var panel = document.createElement('div');
        panel.className = 'qr-panel qr-multiple';
        applyThemeToPanel(panel);

        panel.innerHTML = ''
            + '<div class="qr-title"><span>\uD83D\uDCF1 批量二维码 (' + links.length + ' 个)</span><span class="qr-close">\u2715</span></div>'
            + '<div class="qr-grid"></div>'
            + '<div class="qr-tip" style="text-align:center;margin-top:10px">\uD83D\uDCA1 点击二维码查看大图</div>';

        var grid = panel.querySelector('.qr-grid');
        links.forEach(function (link, i) {
            var item = document.createElement('div');
            item.className = 'qr-grid-item';
            var canvas;
            try { canvas = generateQRCanvas(link, 140, CONFIG.fgColor, CONFIG.bgColor); }
            catch (e) { errLog(e); canvas = document.createElement('div'); canvas.textContent = '生成失败'; canvas.style.cssText = 'font-size:12px;color:#c00;padding:20px'; }
            if (canvas.tagName === 'CANVAS') {
                canvas.onclick = (function (l, idx) { return function () { showQR(l, '链接 ' + (idx + 1)); }; })(link, i);
            }
            item.appendChild(canvas);
            var label = document.createElement('div');
            label.className = 'qr-grid-label';
            label.textContent = link.length > 28 ? link.slice(0, 28) + '...' : link;
            label.title = link;
            item.appendChild(label);
            grid.appendChild(item);
        });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        currentOverlay = overlay;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeQR(); });
        panel.querySelector('.qr-close').onclick = closeQR;
        makeDraggable(panel, panel.querySelector('.qr-title'));
    }

    // ========== 设置面板 ==========
    function showSettings() {
        closeQR();
        var overlay = document.createElement('div');
        overlay.className = 'qr-overlay';
        var panel = document.createElement('div');
        panel.className = 'qr-panel qr-settings';
        applyThemeToPanel(panel);

        panel.innerHTML = ''
            + '<div class="qr-title"><span>\u2699\uFE0F QR Code 设置</span><span class="qr-close">\u2715</span></div>'
            + '<div class="qr-warning">\u26A0\uFE0F 修改黑白名单后需<strong>刷新页面</strong>生效（自动注入部分）；菜单命令始终可用</div>'
            + '<h3>\uD83C\uDFA8 样式</h3>'
            + '<div class="qr-row"><label>尺寸:</label><input type="number" id="cfg-size" value="' + CONFIG.size + '" min="100" max="600">'
            + ' <label>前景:</label><input type="color" id="cfg-fg" value="' + CONFIG.fgColor + '">'
            + ' <label>背景:</label><input type="color" id="cfg-bg" value="' + CONFIG.bgColor + '"></div>'
            + '<div class="qr-row"><label>内边距:</label><input type="number" id="cfg-margin" value="' + CONFIG.qrMargin + '" min="0" max="40" style="width:80px"> px'
            + ' <label>圆角:</label><input type="number" id="cfg-radius" value="' + CONFIG.qrBorderRadius + '" min="0" max="24" style="width:80px"> px</div>'
            + '<div class="qr-tip">内边距/圆角仅影响容器留白，不改变二维码本身颜色，深色主题下也能正常解析</div>'
            + '<label>主题:</label><select id="cfg-theme" class="qr-input" style="margin:0">'
            + '  <option value="light"' + (CONFIG.theme==='light'?' selected':'') + '>浅色</option>'
            + '  <option value="dark"' + (CONFIG.theme==='dark'?' selected':'') + '>深色</option>'
            + '  <option value="auto"' + (CONFIG.theme==='auto'?' selected':'') + '>跟随系统</option>'
            + '</select>'
            + '<h3>\uD83C\uDF10 网址过滤</h3>'
            + '<label><input type="checkbox" id="cfg-wlmode"' + (CONFIG.whitelistMode?' checked':'') + '> 启用白名单模式</label>'
            + '<label>白名单（每行一个，支持 *.example.com）：</label><textarea id="cfg-wl" placeholder="example.com\n*.github.com">' + escapeHtml(CONFIG.whitelist.join('\n')) + '</textarea>'
            + '<label>黑名单（每行一个）：</label><textarea id="cfg-bl" placeholder="adsite.com">' + escapeHtml(CONFIG.blacklist.join('\n')) + '</textarea>'
            + '<h3>\uD83D\uDCE6 批量生成</h3><div class="qr-row"><label>最大显示数量:</label><input type="number" id="cfg-maxbatch" value="' + CONFIG.maxBatch + '" min="1" max="20"></div>'
            + '<h3>\uD83D\uDCDC 历史</h3><div id="cfg-hist-list" style="max-height:160px;overflow-y:auto;border:1px solid var(--qr-input-border);border-radius:6px;padding:6px;background:var(--qr-input-bg);margin-bottom:6px"></div><div class="qr-row"><button class="qr-btn ghost" id="cfg-clearhist">清空历史</button><span class="qr-tip">当前 ' + CONFIG.history.length + ' 条</span></div>'
            + '<label style="margin-top:10px"><input type="checkbox" id="cfg-debug"' + (CONFIG.debug?' checked':'') + '> 调试日志（控制台 [QR] 前缀）</label>'
            + '<div class="qr-btns" style="margin-top:15px"><button class="qr-btn" id="cfg-save">\uD83D\uDCBE 保存</button><button class="qr-btn secondary" id="cfg-cancel">取消</button></div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        currentOverlay = overlay;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeQR(); });
        panel.querySelector('.qr-close').onclick = closeQR;
        panel.querySelector('#cfg-cancel').onclick = closeQR;
        makeDraggable(panel, panel.querySelector('.qr-title'));

        // 渲染历史列表（设置面板内可浏览与删除）
        var histList = panel.querySelector('#cfg-hist-list');
        function renderHistList() {
            histList.innerHTML = '';
            if (CONFIG.history.length === 0) {
                histList.innerHTML = '<div style="font-size:12px;color:#888;text-align:center;padding:8px">暂无记录</div>';
                return;
            }
            CONFIG.history.forEach(function (h) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 6px;font-size:12px;border-bottom:1px solid var(--qr-border)';
                var txt = document.createElement('span');
                txt.textContent = h;
                txt.title = h;
                txt.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px';
                var del = document.createElement('span');
                del.textContent = '\u2715';
                del.title = '删除';
                del.style.cssText = 'cursor:pointer;color:#999;padding:0 4px';
                del.onmouseenter = function () { del.style.color = '#f55'; };
                del.onmouseleave = function () { del.style.color = '#999'; };
                del.onclick = function () {
                    removeHistory(h);
                    renderHistList();
                    panel.querySelector('.qr-tip').textContent = '当前 ' + CONFIG.history.length + ' 条';
                };
                row.appendChild(txt); row.appendChild(del);
                histList.appendChild(row);
            });
        }
        renderHistList();

        panel.querySelector('#cfg-clearhist').onclick = function () {
            CONFIG.history = [];
            saveConfig();
            toast('历史已清空', 'success');
            renderHistList();
            panel.querySelector('.qr-tip').textContent = '当前 0 条';
        };
        panel.querySelector('#cfg-save').onclick = function () {
            CONFIG.size = parseInt(panel.querySelector('#cfg-size').value, 10) || 240;
            CONFIG.fgColor = panel.querySelector('#cfg-fg').value;
            CONFIG.bgColor = panel.querySelector('#cfg-bg').value;
            CONFIG.qrMargin = Math.max(0, Math.min(40, parseInt(panel.querySelector('#cfg-margin').value, 10) || 0));
            CONFIG.qrBorderRadius = Math.max(0, Math.min(24, parseInt(panel.querySelector('#cfg-radius').value, 10) || 0));
            CONFIG.theme = panel.querySelector('#cfg-theme').value;
            CONFIG.whitelistMode = panel.querySelector('#cfg-wlmode').checked;
            CONFIG.whitelist = panel.querySelector('#cfg-wl').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            CONFIG.blacklist = panel.querySelector('#cfg-bl').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            CONFIG.maxBatch = parseInt(panel.querySelector('#cfg-maxbatch').value, 10) || 9;
            CONFIG.debug = panel.querySelector('#cfg-debug').checked;
            DEBUG = !!CONFIG.debug;
            saveConfig();
            toast('\u2713 已保存', 'success');
            closeQR();
        };
    }

    // ========== 浮动按钮（右键非破坏式） ==========
    var lastRightClickTarget = null;
    var floatBtn = null;
    var floatBtnTimer = null;

    function removeFloatBtn() {
        if (floatBtn) { floatBtn.remove(); floatBtn = null; }
        if (floatBtnTimer) { clearTimeout(floatBtnTimer); floatBtnTimer = null; }
    }

    if (AUTO_RUN) {
        document.addEventListener('contextmenu', function (e) {
            lastRightClickTarget = e.target;
            removeFloatBtn();
            var selection = window.getSelection().toString().trim();
            var link = e.target.closest ? e.target.closest('a[href]') : null;
            var hasLink = link && link.href && /^https?:/i.test(link.href);
            if (selection || hasLink) {
                setTimeout(function () {
                    floatBtn = document.createElement('div');
                    floatBtn.className = 'qr-float-btn';
                    floatBtn.textContent = '\uD83D\uDCF1';
                    floatBtn.style.left = Math.min(e.clientX + 10, window.innerWidth - 60) + 'px';
                    floatBtn.style.top = Math.min(e.clientY + 10, window.innerHeight - 60) + 'px';
                    floatBtn.onclick = function () {
                        if (selection) showQR(selection, '选中文本');
                        else if (link) showQR(link.href, '链接二维码');
                        removeFloatBtn();
                    };
                    document.body.appendChild(floatBtn);
                    floatBtnTimer = setTimeout(removeFloatBtn, 5000);
                }, 10);
            }
        }, false);
    } else {
        // 非 AUTO_RUN 仍需记录 lastRightClickTarget 供菜单“生成选中内容/链接”使用
        document.addEventListener('contextmenu', function (e) {
            lastRightClickTarget = e.target;
        }, false);
    }

    // ========== 多选模式 ==========
    var multiSelectMode = false;
    var selectedLinks = [];
    var multiSelectHint = null;

    function updateMultiSelectHint() {
        if (!multiSelectHint) {
            multiSelectHint = document.createElement('div');
            multiSelectHint.className = 'qr-multiselect-hint';
            document.body.appendChild(multiSelectHint);
        }
        multiSelectHint.textContent = '多选模式：已选 ' + selectedLinks.length + ' 个链接 | 按 Esc 或再次点击菜单完成';
    }
    function removeMultiSelectHint() {
        if (multiSelectHint) { multiSelectHint.remove(); multiSelectHint = null; }
    }
    function handleMultiSelect(e) {
        var target = e.target.closest ? e.target.closest('a[href]') : null;
        if (target && target.href && /^https?:/i.test(target.href)) {
            e.preventDefault();
            e.stopPropagation();
            var href = target.href;
            var idx = selectedLinks.indexOf(href);
            if (idx === -1) { selectedLinks.push(href); target.classList.add('qr-selected'); }
            else { selectedLinks.splice(idx, 1); target.classList.remove('qr-selected'); }
            updateMultiSelectHint();
        }
    }
    function endMultiSelect() {
        multiSelectMode = false;
        document.removeEventListener('click', handleMultiSelect, true);
        document.querySelectorAll('.qr-selected').forEach(function (el) { el.classList.remove('qr-selected'); });
        removeMultiSelectHint();
        if (selectedLinks.length > 0) {
            var links = selectedLinks.slice(0, CONFIG.maxBatch);
            if (selectedLinks.length > CONFIG.maxBatch) toast('链接过多，只显示前 ' + CONFIG.maxBatch + ' 个', 'info');
            showMultipleQR(links);
        }
        selectedLinks = [];
    }
    function startMultiSelect() {
        if (multiSelectMode) { endMultiSelect(); return; }
        multiSelectMode = true;
        selectedLinks = [];
        updateMultiSelectHint();
        document.addEventListener('click', handleMultiSelect, true);
    }

    // ========== 快捷键 ==========
    document.addEventListener('keydown', function (e) {
        if (typeof e.key !== 'string') return;
        var k = e.key.toLowerCase();
        if (e.key === 'Escape') {
            if (multiSelectMode) { e.preventDefault(); endMultiSelect(); return; }
            if (currentOverlay) { e.preventDefault(); closeQR(); return; }
        }
        if (e.altKey && k === 'q' && AUTO_RUN) {
            e.preventDefault();
            showQR(location.href, location.hostname);
        } else if (e.altKey && k === 'w') {
            if (currentOverlay) { e.preventDefault(); closeQR(); }
        }
    });

    // ========== 油猴菜单（无条件注册，黑名单站点也可用） ==========
    try {
        GM_registerMenuCommand('\uD83D\uDCF1 生成当前页二维码', function () { showQR(location.href, location.hostname); });
        GM_registerMenuCommand('\uD83D\uDD17 生成选中内容/链接二维码', function () {
            var sel = window.getSelection().toString().trim();
            if (sel) { showQR(sel, '选中文本'); return; }
            if (lastRightClickTarget) {
                var link = lastRightClickTarget.closest ? lastRightClickTarget.closest('a[href]') : null;
                if (link && link.href && /^https?:/i.test(link.href)) { showQR(link.href, '链接二维码'); return; }
            }
            showInputPrompt();
        });
        GM_registerMenuCommand('\u270F\uFE0F 输入内容生成二维码', showInputPrompt);
        GM_registerMenuCommand('\uD83D\uDD0D 扫描页面所有链接', function () {
            var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).map(function (a) { return a.href; }).filter(function (h) { return /^https?:/i.test(h); });
            var unique = Array.from(new Set(links));
            if (unique.length === 0) { toast('页面中没有链接', 'error'); return; }
            var display = unique.slice(0, CONFIG.maxBatch);
            if (unique.length > CONFIG.maxBatch) toast('共 ' + unique.length + ' 个，显示前 ' + CONFIG.maxBatch + ' 个', 'info');
            showMultipleQR(display);
        });
        GM_registerMenuCommand('\u2705 多选链接生成二维码', startMultiSelect);
        GM_registerMenuCommand('\uD83D\uDD0D 解析二维码图片', showDecodeQR);
        GM_registerMenuCommand('\u2699\uFE0F 设置', showSettings);
        GM_registerMenuCommand('\uD83D\uDDD1\uFE0F 清空历史', function () {
            CONFIG.history = [];
            saveConfig();
            toast('历史已清空', 'success');
        });
        GM_registerMenuCommand(DEBUG ? '\uD83D\uDC1B 关闭调试日志' : '\uD83D\uDC1B 开启调试日志', function () {
            CONFIG.debug = !CONFIG.debug;
            DEBUG = !!CONFIG.debug;
            saveConfig();
            toast(DEBUG ? '调试日志已开启' : '调试日志已关闭', 'success');
        });
    } catch (e) { errLog('菜单注册失败', e); }

    log('二维码生成器 v' + SCRIPT_VERSION + ' 已加载 | AUTO_RUN=' + AUTO_RUN + ' | 右键浮动按钮 ' + (AUTO_RUN ? '已启用' : '已禁用（黑名单）') + ' | Alt+Q 当前页');

})();
