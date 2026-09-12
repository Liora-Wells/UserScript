// ==UserScript==
// @name         二维码生成器
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      1.3.0
// @description  二维码生成器：生成/解析/批量/多选/黑白名单/历史记录
// @author       Liora-Wells
// @match        *://*/*
// @updateURL    https://github.com/Liora-Wells/UserScript/raw/main/qrcode-generator.user.js
// @downloadURL  https://github.com/Liora-Wells/UserScript/raw/main/qrcode-generator.user.js
// @license      MIT
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

    var SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? GM_info.script.version : '';

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
        qrBorderRadius: 12,
        qrECLevel: 'M',
        history: [],
        maxHistory: 5,
        theme: 'auto',
        maxBatch: 12,
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
        if (typeof cfg.qrECLevel !== 'string') cfg.qrECLevel = DEFAULT_CONFIG.qrECLevel;
        if (typeof cfg.maxHistory !== 'number' || !isFinite(cfg.maxHistory)) cfg.maxHistory = DEFAULT_CONFIG.maxHistory;
        cfg.maxHistory = Math.max(1, Math.min(10, Math.floor(cfg.maxHistory)));
        if (typeof cfg.maxBatch !== 'number') cfg.maxBatch = DEFAULT_CONFIG.maxBatch;
        return cfg;
    }
    function saveConfig() { storageSet('qrConfig', CONFIG); }
    function setConfig(key, val) { CONFIG[key] = val; saveConfig(); }

    var CONFIG = loadConfig();
    DEBUG = !!CONFIG.debug;

    function shouldRun() {
        var host = location.hostname;
        function matchPattern(pattern) {
            pattern = pattern.trim();
            if (!pattern) return false;
            if (pattern.indexOf('*.') === 0) return host.endsWith(pattern.slice(1));
            if (host === pattern) return true;
            if (host.endsWith('.' + pattern)) return true;
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
        .qr-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,14,28,.45);backdrop-filter:blur(4px);z-index:2147483646;display:flex;align-items:center;justify-content:center;animation:qrFadeIn .2s ease;padding:16px;box-sizing:border-box}
        @keyframes qrFadeIn{from{opacity:0}to{opacity:1}}
        .qr-panel{--qr-bg:#ffffff;--qr-surface:#f6f7fb;--qr-surface-2:#eef0f6;--qr-text:#1c2333;--qr-muted:#6b7280;--qr-border:#e5e7ef;--qr-input-bg:#fff;--qr-input-border:#d6d9e6;--qr-hover:#eef0f6;--qr-accent:#4a6cf7;--qr-accent-2:#7a5cff;background:var(--qr-bg);color:var(--qr-text);border-radius:16px;padding:18px 18px 16px;box-shadow:0 16px 48px rgba(16,24,64,.22),0 2px 10px rgba(16,24,64,.12);min-width:340px;max-width:min(560px,92vw);max-height:90vh;overflow-y:auto;position:relative;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;border:1px solid rgba(255,255,255,.6)}
        .qr-panel[data-theme="dark"]{--qr-bg:#1a1d27;--qr-surface:#232838;--qr-surface-2:#2c3246;--qr-text:#e8ecf5;--qr-muted:#9aa3b8;--qr-border:#2e344a;--qr-input-bg:#1e2333;--qr-input-border:#2e344a;--qr-hover:#232838;--qr-accent:#6b7cff;--qr-accent-2:#9a6bff;box-shadow:0 16px 48px rgba(0,0,0,.45),0 2px 10px rgba(0,0,0,.35);border-color:rgba(255,255,255,.06)}
        .qr-title{font-size:14px;font-weight:700;letter-spacing:.02em;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;touch-action:none;color:var(--qr-text)}
        .qr-title span:first-child{display:flex;align-items:center;gap:6px}
        .qr-close{cursor:pointer;font-size:18px;line-height:1;color:var(--qr-muted);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all .2s}
        .qr-close:hover{color:#ff5a5a;background:var(--qr-hover)}
        .qr-canvas-wrap{display:flex;justify-content:center;align-items:center;margin:10px 0 12px;min-height:80px}
        .qr-canvas{padding:var(--qr-margin,16px);background:#fff;border-radius:var(--qr-radius,12px);display:inline-flex;justify-content:center;align-items:center;line-height:0;box-shadow:0 4px 18px rgba(16,24,64,.12);border:1px solid rgba(0,0,0,.06)}
        .qr-panel[data-theme="dark"] .qr-canvas{box-shadow:0 4px 18px rgba(0,0,0,.35)}
        .qr-canvas canvas{max-width:100%;border-radius:calc(var(--qr-radius,12px) - 4px);display:block}
        .qr-canvas-placeholder{font-size:13px;color:var(--qr-muted);padding:28px 12px;text-align:center;border:1px dashed var(--qr-border);border-radius:12px;background:var(--qr-surface);width:100%;box-sizing:border-box}
        .qr-input{width:100%;padding:10px 12px;border:1px solid var(--qr-input-border);background:var(--qr-input-bg);color:var(--qr-text);border-radius:10px;box-sizing:border-box;font-size:13px;margin-bottom:12px;transition:border-color .2s, box-shadow .2s;outline:none}
        .qr-input:focus{border-color:var(--qr-accent);box-shadow:0 0 0 3px rgba(74,108,247,.18)}
        .qr-btns{display:flex;gap:8px;flex-wrap:wrap}
        .qr-btn{flex:1;padding:9px 12px;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;transition:all .18s;background:linear-gradient(135deg,var(--qr-accent),var(--qr-accent-2));color:#fff;min-width:84px;box-shadow:0 4px 12px rgba(74,108,247,.28)}
        .qr-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(74,108,247,.34);opacity:1}
        .qr-btn:active{transform:translateY(0)}
        .qr-btn.secondary{background:var(--qr-surface-2);color:var(--qr-text);box-shadow:none;border:1px solid var(--qr-border)}
        .qr-btn.secondary:hover{background:var(--qr-hover)}
        .qr-btn.ghost{background:transparent;color:var(--qr-accent);border:1px solid var(--qr-accent);box-shadow:none}
        .qr-btn.ghost:hover{background:rgba(74,108,247,.08)}
        .qr-history{margin-top:12px;max-height:140px;overflow-y:auto;font-size:12px;padding-right:2px}
        .qr-history-item{display:flex;justify-content:space-between;align-items:center;padding:7px 8px;border-radius:8px;white-space:nowrap;overflow:hidden;transition:background .15s;border:1px solid transparent}
        .qr-history-item:hover{background:var(--qr-surface);border-color:var(--qr-border)}
        .qr-history-text{flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;margin-right:8px;color:var(--qr-text)}
        .qr-history-text:hover{color:var(--qr-accent)}
        .qr-history-del{cursor:pointer;color:var(--qr-muted);font-size:13px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;flex-shrink:0;transition:all .15s}
        .qr-history-del:hover{color:#ff5a5a;background:rgba(255,90,90,.12)}
        .qr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin:14px 0}
        .qr-grid-item{text-align:center;padding:12px 10px 10px;border:1px solid var(--qr-border);border-radius:12px;background:var(--qr-surface);transition:all .18s;display:flex;flex-direction:column;align-items:center}
        .qr-grid-item:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(16,24,64,.12);border-color:var(--qr-accent)}
        .qr-panel[data-theme="dark"] .qr-grid-item:hover{box-shadow:0 8px 20px rgba(0,0,0,.3)}
        .qr-grid-item canvas{width:140px;height:140px;cursor:pointer;flex-shrink:0;background:#fff;border-radius:8px;padding:6px;box-sizing:border-box}
        .qr-grid-item canvas:hover{transform:none}
        .qr-grid-label{font-size:11px;color:var(--qr-muted);margin-top:8px;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;white-space:normal;line-height:1.4;min-height:30px;width:100%}
        .qr-grid-actions{margin-top:6px;display:flex;gap:6px;justify-content:center}
        .qr-grid-copy{font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--qr-border);background:var(--qr-bg);color:var(--qr-text);cursor:pointer}
        .qr-grid-copy:hover{border-color:var(--qr-accent);color:var(--qr-accent)}
        .qr-float-btn{position:fixed;z-index:2147483647;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);font-size:18px;transition:all .2s;pointer-events:auto;opacity:.92}
        .qr-float-btn:hover{transform:scale(1.08);opacity:1}
        .qr-selected{outline:3px solid var(--qr-accent)!important;outline-offset:2px}
        .qr-multiselect-hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--qr-accent);color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.3)}
        .qr-settings{min-width:380px;max-width:min(560px,92vw)}
        .qr-settings h3{margin:14px 0 8px;font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--qr-text);display:flex;align-items:center;gap:6px}
        .qr-settings h3:first-of-type{margin-top:6px}
        .qr-settings label{display:block;font-size:12px;margin:6px 0 2px;color:var(--qr-muted)}
        .qr-settings textarea{width:100%;min-height:60px;padding:8px 10px;font-size:12px;border:1px solid var(--qr-input-border);background:var(--qr-input-bg);color:var(--qr-text);border-radius:8px;resize:vertical;font-family:monospace;box-sizing:border-box;outline:none;transition:border-color .2s}
        .qr-settings textarea:focus{border-color:var(--qr-accent)}
        .qr-settings-preview{margin:10px 0;padding:12px;border:1px solid var(--qr-border);border-radius:12px;background:var(--qr-surface);display:flex;flex-direction:column;align-items:center;gap:8px}
        .qr-settings-preview canvas{max-width:100%;background:#fff;border-radius:8px;padding:6px;box-sizing:border-box}
        .qr-settings-preview-label{font-size:11px;color:var(--qr-muted)}
        .qr-row{display:flex;gap:10px;align-items:center;margin:6px 0;flex-wrap:wrap}
        .qr-row input[type="color"]{-webkit-appearance:none;appearance:none;width:40px;height:28px;border:1px solid var(--qr-border);border-radius:6px;cursor:pointer;padding:0;background:var(--qr-input-bg)}
        .qr-row input[type="color"]::-webkit-color-swatch-wrapper{padding:2px}
        .qr-row input[type="color"]::-webkit-color-swatch{border:none;border-radius:4px}
        .qr-row input[type="color"]::-moz-color-swatch{border:none;border-radius:4px}
        .qr-row input[type="number"], .qr-row select{padding:6px 8px;border:1px solid var(--qr-input-border);background:var(--qr-input-bg);color:var(--qr-text);border-radius:8px;font-size:12px;outline:none}
        .qr-row input[type="number"]{width:76px}
        .qr-row select{flex:1}
        .qr-tip{font-size:11px;color:var(--qr-muted);margin-top:4px;line-height:1.4}
        .qr-warning{background:#fff7d6;border:1px solid #f5d76e;border-radius:8px;padding:8px 10px;font-size:11px;color:#7a5d00;margin:8px 0;line-height:1.4}
        .qr-panel[data-theme="dark"] .qr-warning{background:#2a2500;border-color:#5a4d00;color:#ffd54f}
        .qr-toast{position:fixed;top:20px;right:20px;z-index:2147483647;background:#1c2333;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.28);animation:qrToastIn .25s ease;max-width:320px;word-break:break-all}
        .qr-toast.qr-toast-success{background:#1b7a3d}
        .qr-toast.qr-toast-error{background:#c62828}
        .qr-toast.qr-toast-out{animation:qrToastOut .25s ease forwards}
        @keyframes qrToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes qrToastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(20px)}}
        .qr-scan-results{margin:10px 0;display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto}
        .qr-scan-item{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--qr-border);border-radius:10px;background:var(--qr-surface)}
        .qr-scan-item img{width:56px;height:56px;object-fit:contain;background:#fff;border-radius:6px;padding:4px;flex-shrink:0}
        .qr-scan-item-text{flex:1;min-width:0}
        .qr-scan-item-text div{font-size:12px;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .qr-scan-item-actions{display:flex;gap:6px;flex-shrink:0}
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

    // ========== QR 核心 ==========
    // 深色主题仅影响面板 chrome，码体始终用纯净背景，避免影响识别
    function getQRColors() {
        return { fg: CONFIG.fgColor, bg: CONFIG.bgColor };
    }
    function generateQRCanvas(text, size, fgColor, bgColor) {
        if (typeof qrcode === 'undefined') { toast('二维码库加载失败，请检查网络或刷新', 'error'); throw new Error('QR_LIB'); }
        if (!text || !text.trim()) throw new Error('EMPTY');
        if (fgColor === undefined || bgColor === undefined) {
            var c = getQRColors(); fgColor = c.fg; bgColor = c.bg;
        }
        var ec = CONFIG.qrECLevel || 'M';
        var qr = qrcode(0, ec);
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
        if (typeof qrcode === 'undefined') { toast('二维码库加载失败，请检查网络或刷新', 'error'); throw new Error('QR_LIB'); }
        if (!text || !text.trim()) throw new Error('EMPTY');
        if (size === undefined) size = CONFIG.size;
        var ec = CONFIG.qrECLevel || 'M';
        var qr = qrcode(0, ec);
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var cellSize = Math.max(2, Math.floor(size / count));
        return qr.createSvgTag({ cellSize: cellSize, margin: 0 });
    }

    function decodeImageFile(file) {
        if (typeof jsQR === 'undefined') { toast('二维码库加载失败，请检查网络或刷新', 'error'); return; }
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

    // 识别当前页所有可见图片中的二维码
    function scanPageQRCodes() {
        if (typeof jsQR === 'undefined') { toast('二维码库加载失败，请检查网络或刷新', 'error'); return; }
        var imgs = Array.from(document.querySelectorAll('img'));
        // 同域 canvas 截图兜底：若页内无可解图片，会提示
        if (imgs.length === 0) { toast('当前页没有图片可识别', 'error'); return; }
        toast('正在扫描当前页图片...', 'info');
        var results = [];
        var pending = 0;
        var done = function () {
            pending--;
            if (pending !== 0) return;
            if (results.length === 0) { toast('未在当前页图片中找到二维码', 'error'); return; }
            showScanResults(results);
        };
        // 过滤不可见 / 过小图片
        var candidates = imgs.filter(function (img) {
            try {
                var r = img.getBoundingClientRect();
                if (r.width < 32 || r.height < 32) return false;
                if (!img.complete || !img.naturalWidth) return false;
                return true;
            } catch (e) { return false; }
        });
        if (candidates.length === 0) { toast('当前页没有可识别的图片', 'error'); return; }
        // 限制数量避免卡顿
        candidates = candidates.slice(0, 20);
        pending = candidates.length;
        candidates.forEach(function (img) {
            try {
                var w = img.naturalWidth, h = img.naturalHeight;
                var MAX = 600;
                var scale = Math.min(1, MAX / Math.max(w, h));
                var cw = Math.round(w * scale), ch = Math.round(h * scale);
                var canvas = document.createElement('canvas');
                canvas.width = cw; canvas.height = ch;
                var ctx = canvas.getContext('2d');
                // 跨域图片会污染 canvas，try-catch 隔离
                ctx.drawImage(img, 0, 0, cw, ch);
                var data;
                try { data = ctx.getImageData(0, 0, cw, ch); }
                catch (e) { done(); return; }
                var code = null;
                try { code = jsQR(data.data, cw, ch); } catch (e) { /* ignore */ }
                if (code && code.data) {
                    results.push({ text: code.data, src: img.currentSrc || img.src, w: w, h: h });
                }
            } catch (e) { /* 单张失败不影响其他 */ }
            done();
        });
    }

    function showScanResults(results) {
        closeQR();
        var overlay = document.createElement('div');
        overlay.className = 'qr-overlay';
        var panel = document.createElement('div');
        panel.className = 'qr-panel';
        applyThemeToPanel(panel);
        panel.innerHTML = '<div class="qr-title"><span>🔍 识别结果（' + results.length + ' 个）</span><span class="qr-close">✕</span></div><div class="qr-scan-results"></div>';
        var box = panel.querySelector('.qr-scan-results');
        results.forEach(function (r, i) {
            var item = document.createElement('div');
            item.className = 'qr-scan-item';
            var thumb = document.createElement('img');
            thumb.src = r.src;
            thumb.alt = '';
            var textWrap = document.createElement('div');
            textWrap.className = 'qr-scan-item-text';
            var t = document.createElement('div');
            t.textContent = r.text;
            t.title = r.text;
            textWrap.appendChild(t);
            var acts = document.createElement('div');
            acts.className = 'qr-scan-item-actions';
            var copyBtn = document.createElement('button');
            copyBtn.className = 'qr-grid-copy';
            copyBtn.textContent = '复制';
            copyBtn.onclick = function () { copyText(r.text).then(function (ok) { toast(ok ? '已复制' : '复制失败', ok ? 'success' : 'error'); }); };
            var openBtn = document.createElement('button');
            openBtn.className = 'qr-grid-copy';
            openBtn.textContent = '生成二维码';
            openBtn.onclick = function () { showQR(r.text, '识别结果 ' + (i + 1)); };
            acts.appendChild(copyBtn);
            acts.appendChild(openBtn);
            item.appendChild(thumb);
            item.appendChild(textWrap);
            item.appendChild(acts);
            box.appendChild(item);
        });
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        currentOverlay = overlay;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeQR(); });
        panel.querySelector('.qr-close').onclick = closeQR;
        makeDraggable(panel, panel.querySelector('.qr-title'));
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
            + '<div class="qr-canvas-wrap"><div class="qr-canvas"></div></div>'
            + '<input class="qr-input" type="text" placeholder="输入内容实时生成二维码">'
            + '<div class="qr-btns">'
            + '  <button class="qr-btn" data-act="copy">\uD83D\uDCCB 复制文本</button>'
            + '  <button class="qr-btn" data-act="copyimg">\uD83D\uDDBC 复制图片</button>'
            + '  <button class="qr-btn" data-act="dlpng">\uD83D\uDCE5 PNG</button>'
            + '  <button class="qr-btn" data-act="dlsvg">\uD83D\uDCE5 SVG</button>'
            + '  <button class="qr-btn secondary" data-act="settings">\u2699\uFE0F 设置</button>'
            + '</div>'
            + '<div class="qr-history"></div>';

        var canvasBox = panel.querySelector('.qr-canvas');
        // 样式自定义：边距 / 圆角 作用于画布容器（不影响码体本身颜色，避免影响解析）
        canvasBox.style.setProperty('--qr-margin', (CONFIG.qrMargin || 0) + 'px');
        canvasBox.style.setProperty('--qr-radius', (CONFIG.qrBorderRadius || 0) + 'px');
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
                    var dlCanvas = currentQR.canvas;
                    dlCanvas.toBlob(function (blob) {
                        if (blob) { downloadBlob(blob, name); toast('已下载 PNG', 'success'); }
                        else toast('下载 PNG 失败', 'error');
                    }, 'image/png');
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
            label.textContent = link;
            label.title = link;
            item.appendChild(label);
            var acts = document.createElement('div');
            acts.className = 'qr-grid-actions';
            var copyBtn = document.createElement('button');
            copyBtn.className = 'qr-grid-copy';
            copyBtn.textContent = '复制链接';
            copyBtn.onclick = function (ev) {
                ev.stopPropagation();
                copyText(link).then(function (ok) { toast(ok ? '已复制' : '复制失败', ok ? 'success' : 'error'); });
            };
            var openBtn = document.createElement('button');
            openBtn.className = 'qr-grid-copy';
            openBtn.textContent = '查看';
            openBtn.onclick = function (ev) { ev.stopPropagation(); showQR(link, '链接 ' + (i + 1)); };
            acts.appendChild(copyBtn);
            acts.appendChild(openBtn);
            item.appendChild(acts);
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
            + '<div class="qr-row"><label>尺寸:</label><input type="number" id="cfg-size" class="cfg-live" value="' + CONFIG.size + '" min="100" max="600">'
            + ' <label>前景:</label><input type="color" id="cfg-fg" class="cfg-live" value="' + escapeHtml(CONFIG.fgColor) + '">'
            + ' <label>背景:</label><input type="color" id="cfg-bg" class="cfg-live" value="' + escapeHtml(CONFIG.bgColor) + '"></div>'
            + '<div class="qr-row"><label>内边距:</label><input type="number" id="cfg-margin" class="cfg-live" value="' + CONFIG.qrMargin + '" min="0" max="40" style="width:80px"> px'
            + ' <label>圆角:</label><input type="number" id="cfg-radius" class="cfg-live" value="' + CONFIG.qrBorderRadius + '" min="0" max="24" style="width:80px"> px'
            + ' <label>容错:</label><select id="cfg-ec" class="cfg-live" style="width:92px"><option value="L"' + (CONFIG.qrECLevel==='L'?' selected':'') + '>L 低</option><option value="M"' + (CONFIG.qrECLevel==='M'?' selected':'') + '>M 中</option><option value="Q"' + (CONFIG.qrECLevel==='Q'?' selected':'') + '>Q 高</option><option value="H"' + (CONFIG.qrECLevel==='H'?' selected':'') + '>H 最高</option></select></div>'
            + '<div class="qr-tip">内边距/圆角仅影响容器留白，不改变二维码本身颜色，深色主题下也能正常解析；容错越高越易被遮挡/污损后识别</div>'
            + '<div class="qr-settings-preview"><div class="qr-settings-preview-label">实时预览</div><div id="cfg-preview-box"></div></div>'
            + '<div class="qr-row"><button class="qr-btn ghost" id="cfg-resetstyle">\u21BB 恢复默认样式</button><span class="qr-tip">仅重置尺寸/颜色/边距/圆角/容错，需点击保存生效</span></div>'
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
            + '<h3>\uD83D\uDCDC 历史</h3><div id="cfg-hist-list" style="max-height:160px;overflow-y:auto;border:1px solid var(--qr-input-border);border-radius:6px;padding:6px;background:var(--qr-input-bg);margin-bottom:6px"></div><div class="qr-row"><button class="qr-btn ghost" id="cfg-clearhist">清空历史</button><span class="qr-tip" id="cfg-hist-count">当前 ' + CONFIG.history.length + ' 条</span></div>'
            + '<label style="margin-top:10px"><input type="checkbox" id="cfg-debug"' + (CONFIG.debug?' checked':'') + '> 调试日志（控制台 [QR] 前缀）</label>'
            + '<div class="qr-btns" style="margin-top:15px"><button class="qr-btn" id="cfg-save">\uD83D\uDCBE 保存</button><button class="qr-btn secondary" id="cfg-cancel">取消</button></div>';

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        currentOverlay = overlay;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeQR(); });
        panel.querySelector('.qr-close').onclick = closeQR;
        panel.querySelector('#cfg-cancel').onclick = closeQR;
        makeDraggable(panel, panel.querySelector('.qr-title'));

        // 实时预览
        var previewBox = panel.querySelector('#cfg-preview-box');
        function renderPreview() {
            try {
                previewBox.innerHTML = '';
                var s = parseInt(panel.querySelector('#cfg-size').value, 10) || 240;
                var fgEl = panel.querySelector('#cfg-fg');
                var bgEl = panel.querySelector('#cfg-bg');
                var fg = fgEl && fgEl.value ? fgEl.value : CONFIG.fgColor;
                var bg = bgEl && bgEl.value ? bgEl.value : CONFIG.bgColor;
                var mg = Math.max(0, Math.min(40, parseInt(panel.querySelector('#cfg-margin').value, 10) || 0));
                var rd = Math.max(0, Math.min(24, parseInt(panel.querySelector('#cfg-radius').value, 10) || 0));
                // 临时用当前面板内的预览配置生成
                var oldEC = CONFIG.qrECLevel;
                CONFIG.qrECLevel = panel.querySelector('#cfg-ec').value;
                previewBox.style.setProperty('--qr-margin', mg + 'px');
                previewBox.style.setProperty('--qr-radius', rd + 'px');
                var c = generateQRCanvas('https://example.com 预览', Math.min(s, 180), fg, bg);
                var wrap = document.createElement('div');
                wrap.className = 'qr-canvas';
                wrap.style.setProperty('--qr-margin', mg + 'px');
                wrap.style.setProperty('--qr-radius', rd + 'px');
                wrap.appendChild(c);
                previewBox.appendChild(wrap);
                CONFIG.qrECLevel = oldEC;
            } catch (e) {
                errLog('预览失败', e);
                previewBox.textContent = '预览生成失败';
            }
        }
        panel.querySelectorAll('.cfg-live').forEach(function (el) {
            el.addEventListener('input', renderPreview);
            el.addEventListener('change', renderPreview);
        });
        // 一键恢复默认样式（仅二维码样式项，需保存后生效）
        panel.querySelector('#cfg-resetstyle').onclick = function () {
            panel.querySelector('#cfg-size').value = DEFAULT_CONFIG.size;
            panel.querySelector('#cfg-fg').value = DEFAULT_CONFIG.fgColor;
            panel.querySelector('#cfg-bg').value = DEFAULT_CONFIG.bgColor;
            panel.querySelector('#cfg-margin').value = DEFAULT_CONFIG.qrMargin;
            panel.querySelector('#cfg-radius').value = DEFAULT_CONFIG.qrBorderRadius;
            panel.querySelector('#cfg-ec').value = DEFAULT_CONFIG.qrECLevel;
            renderPreview();
            toast('已恢复默认样式，点击保存生效', 'info');
        };
        panel.querySelector('#cfg-theme').addEventListener('change', function () {
            // 主题实时预览：改面板 data-theme
            var v = panel.querySelector('#cfg-theme').value;
            if (v === 'dark') panel.setAttribute('data-theme', 'dark');
            else if (v === 'light') panel.setAttribute('data-theme', 'light');
            else panel.setAttribute('data-theme', isDarkTheme() ? 'dark' : 'light');
        });
        renderPreview();

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
                    var cnt = panel.querySelector('#cfg-hist-count');
                    if (cnt) cnt.textContent = '当前 ' + CONFIG.history.length + ' 条';
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
            var cnt = panel.querySelector('#cfg-hist-count');
            if (cnt) cnt.textContent = '当前 0 条';
        };
        panel.querySelector('#cfg-save').onclick = function () {
            CONFIG.size = parseInt(panel.querySelector('#cfg-size').value, 10) || 240;
            CONFIG.fgColor = panel.querySelector('#cfg-fg').value;
            CONFIG.bgColor = panel.querySelector('#cfg-bg').value;
            CONFIG.qrMargin = Math.max(0, Math.min(40, parseInt(panel.querySelector('#cfg-margin').value, 10) || 0));
            CONFIG.qrBorderRadius = Math.max(0, Math.min(24, parseInt(panel.querySelector('#cfg-radius').value, 10) || 0));
            CONFIG.qrECLevel = panel.querySelector('#cfg-ec').value || 'M';
            CONFIG.theme = panel.querySelector('#cfg-theme').value;
            CONFIG.whitelistMode = panel.querySelector('#cfg-wlmode').checked;
            CONFIG.whitelist = panel.querySelector('#cfg-wl').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            CONFIG.blacklist = panel.querySelector('#cfg-bl').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            CONFIG.maxBatch = parseInt(panel.querySelector('#cfg-maxbatch').value, 10) || DEFAULT_CONFIG.maxBatch;
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
                    // 避开系统右键菜单：尽量贴鼠标左上方，必要时贴视口边缘
                    var BTN = 36, GAP = 10;
                    var x = e.clientX - BTN - GAP;
                    var y = e.clientY - BTN - GAP;
                    if (x < GAP) x = Math.min(e.clientX + GAP, window.innerWidth - BTN - GAP);
                    if (y < GAP) y = Math.min(e.clientY + GAP, window.innerHeight - BTN - GAP);
                    floatBtn = document.createElement('div');
                    floatBtn.className = 'qr-float-btn';
                    floatBtn.textContent = '\uD83D\uDCF1';
                    floatBtn.title = '生成二维码（点击）';
                    floatBtn.style.left = x + 'px';
                    floatBtn.style.top = y + 'px';
                    floatBtn.addEventListener('click', function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (selection) showQR(selection, '选中文本');
                        else if (link) showQR(link.href, '链接二维码');
                        removeFloatBtn();
                    });
                    // 滚动/点击/再右键/ESC 都自动消失，避免残留
                    floatBtnTimer = setTimeout(removeFloatBtn, 4000);
                    document.body.appendChild(floatBtn);
                }, 10);
            }
        }, false);
        // 任何滚动、点击空白、按 ESC 或再次右键都移除浮动按钮
        document.addEventListener('scroll', removeFloatBtn, true);
        document.addEventListener('mousedown', function (e) {
            if (floatBtn && !floatBtn.contains(e.target)) removeFloatBtn();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (floatBtn && e.key === 'Escape') removeFloatBtn();
        });
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
        GM_registerMenuCommand('\uD83D\uDD0E 识别当前页二维码', scanPageQRCodes);
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

    log('二维码生成器' + (SCRIPT_VERSION ? ' v' + SCRIPT_VERSION : '') + ' 已加载 | AUTO_RUN=' + AUTO_RUN + ' | 右键浮动按钮 ' + (AUTO_RUN ? '已启用' : '已禁用（黑名单）') + ' | Alt+Q 当前页');

})();
