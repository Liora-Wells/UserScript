// ==UserScript==
// @name         GitHub 助手
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      1.0.0
// @description  GitHub Release 增强显示 + 多类型加速下载，兼容中文化插件
// @author       Liora-Wells
// @match        https://github.com/*
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_openInTab
// @connect      api.github.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. 配置常量
    // ============================================================

    const STORAGE_KEYS = {
        proxies: 'ghhelper_proxies',
        features: 'ghhelper_features',
        maxDisplay: 'ghhelper_max_display',
        selectedOS: 'ghhelper_selected_os',
        selectedArch: 'ghhelper_selected_arch'
    };

    const DEFAULT_FEATURES = {
        groupAndSort: true,
        downloadCount: true,
        replaceTime: false,
        collapsibleNotes: true,
        proxyButtons: true,
        scrollToTop: true
    };

    const OS_OPTIONS = [
        { value: 'windows', label: 'Windows' },
        { value: 'mac', label: 'macOS' },
        { value: 'linux', label: 'Linux' },
        { value: 'android', label: 'Android' },
        { value: 'ios', label: 'iOS' }
    ];

    const ARCH_OPTIONS = [
        { value: 'x86_64', label: 'x64' },
        { value: 'arm64', label: 'arm64' },
        { value: 'x86', label: 'x86' },
        { value: 'arm32', label: 'arm32' },
        { value: 'riscv64', label: 'riscv64' }
    ];

    // 内置加速源（按设计文档精简）
    const BUILTIN_PROXIES = [
        // 下载/ZIP 加速
        { id: 'builtin_dl_1', type: 'download', url: 'https://gh-proxy.org/https://github.com', name: '美国1', desc: '[美国 Cloudflare CDN]', region: '美国', enabled: true, builtIn: true },
        { id: 'builtin_dl_2', type: 'download', url: 'https://gh.h233.eu.org/https://github.com', name: '美国2', desc: '[美国 Cloudflare CDN]', region: '美国', enabled: true, builtIn: true },
        { id: 'builtin_dl_3', type: 'download', url: 'https://ghproxy.net/https://github.com', name: '日本', desc: '[日本 Cloudflare CDN]', region: '日本', enabled: true, builtIn: true },
        { id: 'builtin_dl_4', type: 'download', url: 'https://ghfast.top/https://github.com', name: '韩国', desc: '[韩国 CDN 不固定]', region: '韩国', enabled: true, builtIn: true },
        { id: 'builtin_dl_5', type: 'download', url: 'https://wget.la/https://github.com', name: '香港', desc: '[香港 CDN 不固定]', region: '香港', enabled: true, builtIn: true },
        { id: 'builtin_dl_6', type: 'download', url: 'https://hk.gh-proxy.org/https://github.com', name: '香港2', desc: '[香港 Cloudflare CDN]', region: '香港', enabled: true, builtIn: true },
        { id: 'builtin_dl_7', type: 'download', url: 'https://gh.catmak.name/https://github.com', name: '韩国2', desc: '[韩国 Cloudflare CDN]', region: '韩国', enabled: true, builtIn: true },
        // Raw 加速
        { id: 'builtin_raw_1', type: 'raw', url: 'https://fastly.jsdelivr.net/gh', name: '日本', desc: '[JSDelivr CDN，有50MB限制]', region: '日本', enabled: true, builtIn: true },
        { id: 'builtin_raw_2', type: 'raw', url: 'https://gh-proxy.org/https://raw.githubusercontent.com', name: '美国', desc: '[美国 Cloudflare CDN]', region: '美国', enabled: true, builtIn: true },
        { id: 'builtin_raw_3', type: 'raw', url: 'https://wget.la/https://raw.githubusercontent.com', name: '香港', desc: '[香港 CDN 不固定]', region: '香港', enabled: true, builtIn: true },
        { id: 'builtin_raw_4', type: 'raw', url: 'https://ghfast.top/https://raw.githubusercontent.com', name: '韩国', desc: '[韩国 CDN 不固定]', region: '韩国', enabled: true, builtIn: true },
        { id: 'builtin_raw_5', type: 'raw', url: 'https://gh.catmak.name/https://raw.githubusercontent.com', name: '韩国2', desc: '[韩国 Cloudflare CDN]', region: '韩国', enabled: true, builtIn: true },
        // Clone 加速（复用下载源）
        { id: 'builtin_clone_1', type: 'clone', url: 'https://gitclone.com', name: '国内', desc: '[中国 国内 GitClone]', region: '国内', enabled: true, builtIn: true },
        { id: 'builtin_clone_2', type: 'clone', url: 'https://wget.la/https://github.com', name: '香港', desc: '[香港 CDN 不固定]', region: '香港', enabled: true, builtIn: true },
        { id: 'builtin_clone_3', type: 'clone', url: 'https://hk.gh-proxy.org/https://github.com', name: '香港2', desc: '[香港 Cloudflare CDN]', region: '香港', enabled: true, builtIn: true },
        { id: 'builtin_clone_4', type: 'clone', url: 'https://ghfast.top/https://github.com', name: '韩国', desc: '[韩国 CDN 不固定]', region: '韩国', enabled: true, builtIn: true },
        // SSH Clone
        { id: 'builtin_ssh_1', type: 'ssh', url: 'ssh://git@ssh.github.com:443/', name: '官方', desc: '[GitHub 443端口SSH]', region: '官方', enabled: true, builtIn: true }
    ];

    // ============================================================
    // 2. 存储管理器 (StorageManager)
    // ============================================================

    const StorageManager = {
        _cache: {},

        get(key, defaultValue) {
            if (this._cache[key] !== undefined) return this._cache[key];
            if (typeof GM_getValue === 'undefined') return defaultValue;
            const val = GM_getValue(key, defaultValue);
            this._cache[key] = val;
            return val;
        },

        set(key, value) {
            this._cache[key] = value;
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(key, value);
            }
        },

        getFeatures() {
            return this.get(STORAGE_KEYS.features, Object.assign({}, DEFAULT_FEATURES));
        },

        setFeatures(features) {
            this.set(STORAGE_KEYS.features, features);
        },

        isFeatureEnabled(featureKey) {
            const features = this.getFeatures();
            return features[featureKey] !== undefined ? features[featureKey] : DEFAULT_FEATURES[featureKey];
        },

        getProxies() {
            return this.get(STORAGE_KEYS.proxies, []);
        },

        setProxies(proxies) {
            this.set(STORAGE_KEYS.proxies, proxies);
        },

        getAllProxies() {
            return [...BUILTIN_PROXIES, ...this.getProxies()];
        },

        getMaxDisplay() {
            return this.get(STORAGE_KEYS.maxDisplay, 6);
        },

        setMaxDisplay(count) {
            this.set(STORAGE_KEYS.maxDisplay, count);
        },

        getSelectedOS() {
            return this.get(STORAGE_KEYS.selectedOS, null);
        },

        setSelectedOS(os) {
            this.set(STORAGE_KEYS.selectedOS, os);
        },

        getSelectedArch() {
            return this.get(STORAGE_KEYS.selectedArch, null);
        },

        setSelectedArch(arch) {
            this.set(STORAGE_KEYS.selectedArch, arch);
        }
    };

    // ============================================================
    // 3. 加速源管理器 (ProxyManager)
    // ============================================================

    const ProxyManager = {
        getAll() {
            return StorageManager.getAllProxies();
        },

        getEnabled(type) {
            return this.getAll().filter(p => p.enabled && (p.type === type || p.type === 'all'));
        },

        getCustom() {
            return StorageManager.getProxies();
        },

        addCustom(proxy) {
            const custom = this.getCustom();
            proxy.id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            proxy.builtIn = false;
            proxy.enabled = true;
            custom.push(proxy);
            StorageManager.setProxies(custom);
            return proxy;
        },

        updateCustom(id, updates) {
            const custom = this.getCustom();
            const idx = custom.findIndex(p => p.id === id);
            if (idx === -1) return false;
            Object.assign(custom[idx], updates);
            StorageManager.setProxies(custom);
            return true;
        },

        deleteCustom(id) {
            const custom = this.getCustom();
            const idx = custom.findIndex(p => p.id === id);
            if (idx === -1) return false;
            custom.splice(idx, 1);
            StorageManager.setProxies(custom);
            return true;
        },

        toggleBuiltin(id) {
            const builtin = BUILTIN_PROXIES.find(p => p.id === id);
            if (builtin) {
                builtin.enabled = !builtin.enabled;
                return true;
            }
            return false;
        },

        buildUrl(proxy, originalPath, type) {
            let url = proxy.url;
            if (type === 'clone' && url === 'https://gitclone.com') {
                return url + '/github.com' + originalPath;
            }
            if (type === 'raw') {
                if (url.includes('/gh') && url.indexOf('/gh') + 3 === url.length) {
                    return url + originalPath.replace('/blob/', '@');
                }
                return url + originalPath.replace('/blob/', '/');
            }
            if (type === 'ssh') {
                const repoPath = originalPath.replace(/^\//, '');
                return url + repoPath + '.git';
            }
            return url + originalPath;
        },

        getDisplayProxies(type) {
            const maxDisplay = StorageManager.getMaxDisplay();
            const custom = this.getCustom().filter(p => p.enabled && (p.type === type || p.type === 'all'));
            const builtin = BUILTIN_PROXIES.filter(p => p.enabled && (p.type === type || p.type === 'all'));
            const result = { pinned: [], overflow: [] };

            custom.forEach(p => result.pinned.push(p));
            const remaining = maxDisplay - result.pinned.length;
            if (remaining > 0) {
                builtin.slice(0, remaining).forEach(p => result.pinned.push(p));
            }
            builtin.slice(remaining > 0 ? remaining : 0).forEach(p => result.overflow.push(p));

            return result;
        }
    };

    // ============================================================
    // 4. 分组排序引擎 (SortEngine)
    // ============================================================

    const SortEngine = {
        getCurrentOS() {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.includes('win')) return 'windows';
            if (ua.includes('mac')) return 'mac';
            if (ua.includes('android')) return 'android';
            if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
            if (ua.includes('linux')) return 'linux';
            return 'unknown';
        },

        getCurrentArch() {
            if (navigator.userAgentData && navigator.userAgentData.arch) {
                const arch = String(navigator.userAgentData.arch).toLowerCase();
                if (arch.includes('arm64') || arch.includes('aarch64')) return 'arm64';
                if (arch === 'arm' || arch.includes('arm32') || arch.includes('armv7')) return 'arm32';
                if (arch.includes('x86_64') || arch === 'amd64' || arch === 'x64') return 'x86_64';
                if (arch.includes('x86') || arch.includes('i386') || arch.includes('i686')) return 'x86';
            }
            const platform = String(navigator.platform || '').toLowerCase();
            const ua = navigator.userAgent.toLowerCase();
            if (platform.includes('aarch64') || platform.includes('arm64') || ua.includes('aarch64') || ua.includes('arm64')) return 'arm64';
            if (platform.includes('win64') || platform.includes('x64') || platform.includes('x86_64') || ua.includes('win64') || ua.includes('x86_64') || ua.includes('wow64')) return 'x86_64';
            if (platform.includes('arm') || ua.includes('armv7') || ua.includes('armhf')) return 'arm32';
            if (platform.includes('i386') || platform.includes('i686') || ua.includes('i386') || ua.includes('i686')) return 'x86';
            const os = this.getCurrentOS();
            if (os === 'mac') return 'arm64';
            return 'x86_64';
        },

        getActiveOS() {
            return StorageManager.getSelectedOS() || this.getCurrentOS();
        },

        getActiveArch() {
            return StorageManager.getSelectedArch() || this.getCurrentArch();
        },

        parseFileArch(fileName) {
            const name = fileName.toLowerCase();
            if (name.includes('aarch64') || name.includes('arm64') || name.includes('armv8') || name.includes('arm64-v8a')) return 'arm64';
            if (name.includes('x86_64') || name.includes('x64') || name.includes('amd64')) return 'x86_64';
            if (name.includes('riscv64') || name.includes('riscv')) return 'riscv64';
            if (name.includes('armv7') || name.includes('armeabi-v7a') || name.includes('armhf') || name.includes('armv6') || name.includes('armel') || name.includes('armeabi') || /\barm\b/.test(name)) return 'arm32';
            if (name.includes('i386') || name.includes('i686') || name.includes('ia32') || name.includes('x86') || name.includes('32-bit') || name.includes('32bit')) return 'x86';
            if (name.includes('mips64') || name.includes('mipsel') || name.includes('mips')) return 'mips';
            if (name.includes('ppc64') || name.includes('ppc')) return 'ppc';
            if (name.includes('s390x')) return 's390x';
            if (name.includes('universal') || name.includes('fat')) return 'universal';
            return null;
        },

        isSignatureFile(name) {
            const sigExt = ['.sha256sum', '.sha512sum', '.md5sum', '.checksums', '.sha256', '.sha512',
                '.md5', '.sig', '.asc', '.sig.pgp', '.minisig', '.pem', '.blockmap', '.shasum', '.sums',
                '.bsdiff', '.delta', '.patch'];
            for (const ext of sigExt) {
                if (name.endsWith(ext)) return true;
            }
            return false;
        },

        isSourceFile(name) {
            return name.includes('-source') || name.includes('-src') ||
                (name.endsWith('.tar.gz') && !name.includes('linux') && !name.includes('mac') && !name.includes('win') && !name.endsWith('.app.tar.gz')) ||
                name.endsWith('.tar.xz') || name.endsWith('.tar.bz2');
        },

        parseFileGroup(fileName) {
            const name = fileName.toLowerCase();
            if (this.isSignatureFile(name)) return { id: 'meta', showTag: false };
            if (this.isSourceFile(name)) return { id: 'source', showTag: false };

            if (name.endsWith('.exe') || name.endsWith('.msi') || name.endsWith('.appx') || name.endsWith('.msix') || name.includes('-win') || name.includes('_win'))
                return { id: 'windows', name: 'Windows', color: 'blue', showTag: true };
            if (name.endsWith('.dmg') || name.endsWith('.pkg') || name.endsWith('.xip') || name.endsWith('.app.tar.gz') || name.includes('-mac') || name.includes('_mac') || name.includes('darwin'))
                return { id: 'mac', name: 'macOS', color: 'purple', showTag: true };
            if (name.endsWith('.apk') || name.endsWith('.aab'))
                return { id: 'android', name: 'Android', color: 'green', showTag: true };
            if (name.endsWith('.ipa'))
                return { id: 'ios', name: 'iOS', color: 'gray', showTag: true };
            if (name.endsWith('.deb'))
                return { id: 'linux-deb', name: 'Debian', color: 'orange', showTag: true };
            if (name.endsWith('.rpm'))
                return { id: 'linux-rpm', name: 'RedHat', color: 'red', showTag: true };
            if (name.endsWith('.appimage'))
                return { id: 'linux-appimage', name: 'AppImage', color: 'teal', showTag: true };
            if (name.endsWith('.flatpak'))
                return { id: 'linux-flatpak', name: 'Flatpak', color: 'cyan', showTag: true };
            if (name.endsWith('.pacman') || name.endsWith('.pkg.tar.zst') || name.endsWith('.ebuild'))
                return { id: 'linux-arch', name: 'Arch', color: 'pink', showTag: true };
            if (name.endsWith('.ipk') || name.endsWith('.ipk.gz'))
                return { id: 'linux-ipk', name: 'OpenWrt', color: 'yellow', showTag: true };
            if (name.endsWith('.snap') || name.endsWith('.snapi'))
                return { id: 'linux-snap', name: 'Snap', color: 'indigo', showTag: true };
            if (name.endsWith('.nupkg'))
                return { id: 'nupkg', name: 'NuGet', color: 'purple', showTag: true };
            if (name.endsWith('.jar'))
                return { id: 'jar', name: 'JAR', color: 'red', showTag: true };
            if (name.endsWith('.whl'))
                return { id: 'wheel', name: 'Wheel', color: 'blue', showTag: true };
            if (name.includes('-linux') || name.includes('_linux') || name.endsWith('.tar.xz') || name.endsWith('.tar.lz4'))
                return { id: 'linux-other', name: 'Linux', color: 'amber', showTag: true };
            if (name.endsWith('.tar.gz') && (name.includes('linux') || name.includes('mac') || name.includes('win')))
                return { id: 'linux-other', name: 'Tarball', color: 'gray', showTag: true };

            return { id: 'other', showTag: false };
        },

        calculateMatchScore(fileName, groupInfo, currentOS, currentArch) {
            let groupScore = 0;
            let innerScore = 0;
            const name = fileName.toLowerCase();
            const isCurrentOS = (groupInfo.id === currentOS) || groupInfo.id.startsWith(currentOS + '-');

            if (isCurrentOS) {
                groupScore = 10000;
                if (groupInfo.id === 'linux-deb') groupScore += 300;
                else if (groupInfo.id === 'linux-rpm') groupScore += 200;
                else if (groupInfo.id === 'linux-appimage' || groupInfo.id === 'linux-flatpak') groupScore += 100;
            } else {
                const osScores = { windows: 9000, mac: 8000, 'linux-deb': 7000, 'linux-rpm': 6000, 'linux-appimage': 5200, 'linux-flatpak': 5000, 'linux-arch': 4500, 'linux-other': 4000, android: 3500, ios: 3000, other: 2000, meta: -1000, source: -2000 };
                groupScore = osScores[groupInfo.id] || 1000;
            }

            const fileArch = this.parseFileArch(fileName);
            if (fileArch === currentArch) innerScore += 500;
            else if (fileArch === 'universal') innerScore += 600;
            else if (fileArch === 'x86_64') innerScore += 50;
            else if (fileArch === 'arm64') innerScore += 20;
            else if (fileArch === 'x86') innerScore += 10;
            else if (fileArch === 'arm32') innerScore += 5;

            if (name.endsWith('.exe') || name.endsWith('.dmg') || name.endsWith('.appimage') || name.endsWith('.flatpak') || name.endsWith('.apk')) innerScore += 15;
            if (name.endsWith('.zip') || name.endsWith('.7z')) innerScore += 5;

            return groupScore + innerScore;
        },

        getGroupClass(groupId) {
            const map = {
                windows: 'ghhelper-group-win', mac: 'ghhelper-group-mac',
                'linux-deb': 'ghhelper-group-linux-deb', 'linux-rpm': 'ghhelper-group-linux-rpm',
                'linux-arch': 'ghhelper-group-linux-arch', 'linux-appimage': 'ghhelper-group-linux-appimage',
                'linux-flatpak': 'ghhelper-group-linux-flatpak', 'linux-ipk': 'ghhelper-group-linux-ipk',
                'linux-snap': 'ghhelper-group-linux-snap', 'linux-other': 'ghhelper-group-linux-other',
                android: 'ghhelper-group-mobile', ios: 'ghhelper-group-mobile',
                nupkg: 'ghhelper-group-nupkg', jar: 'ghhelper-group-jar', wheel: 'ghhelper-group-wheel'
            };
            return map[groupId] || 'ghhelper-group-other';
        },

        getTagClass(groupId) {
            return 'ghhelper-tag-' + (groupId || 'other');
        }
    };

    // ============================================================
    // 5. DOM 渲染器 (DOMRenderer)
    // ============================================================

    const DOMRenderer = {
        _processedDetails: [],
        _scrollTopBtn: null,
        _timeObserver: null,

        injectCSS() {
            if (document.getElementById('ghhelper-css')) return;
            const style = document.createElement('style');
            style.id = 'ghhelper-css';
            style.textContent = `
.ghhelper-group-win{border-left:4px solid var(--color-accent-emphasis,#1f6feb)!important;background-color:var(--color-accent-subtle,rgba(56,139,253,0.1))!important}
.ghhelper-group-win:hover{background-color:var(--color-accent-muted,rgba(56,139,253,0.15))!important}
.ghhelper-group-mac{border-left:4px solid var(--color-done-emphasis,#8957e5)!important;background-color:var(--color-done-subtle,rgba(137,87,229,0.1))!important}
.ghhelper-group-mac:hover{background-color:var(--color-done-muted,rgba(137,87,229,0.15))!important}
.ghhelper-group-mobile{border-left:4px solid #e3b341!important;background-color:rgba(227,179,65,0.12)!important}
.ghhelper-group-mobile:hover{background-color:rgba(227,179,65,0.18)!important}
.ghhelper-group-linux-deb{border-left:4px solid var(--color-severe-emphasis,#db6d28)!important;background-color:var(--color-severe-subtle,rgba(219,109,40,0.1))!important}
.ghhelper-group-linux-deb:hover{background-color:var(--color-severe-muted,rgba(219,109,40,0.15))!important}
.ghhelper-group-linux-rpm{border-left:4px solid var(--color-danger-emphasis,#f85149)!important;background-color:var(--color-danger-subtle,rgba(248,81,73,0.1))!important}
.ghhelper-group-linux-rpm:hover{background-color:var(--color-danger-muted,rgba(248,81,73,0.15))!important}
.ghhelper-group-linux-arch{border-left:4px solid var(--color-sponsors-emphasis,#bf4b8a)!important;background-color:var(--color-sponsors-subtle,rgba(191,75,138,0.1))!important}
.ghhelper-group-linux-arch:hover{background-color:var(--color-sponsors-muted,rgba(191,75,138,0.15))!important}
.ghhelper-group-linux-appimage{border-left:4px solid #20c997!important;background-color:rgba(32,201,151,0.1)!important}
.ghhelper-group-linux-appimage:hover{background-color:rgba(32,201,151,0.15)!important}
.ghhelper-group-linux-flatpak{border-left:4px solid #0abda0!important;background-color:rgba(10,189,160,0.1)!important}
.ghhelper-group-linux-flatpak:hover{background-color:rgba(10,189,160,0.15)!important}
.ghhelper-group-linux-ipk{border-left:4px solid #e3b341!important;background-color:rgba(227,179,65,0.1)!important}
.ghhelper-group-linux-ipk:hover{background-color:rgba(227,179,65,0.15)!important}
.ghhelper-group-linux-snap{border-left:4px solid #6366f1!important;background-color:rgba(99,102,241,0.1)!important}
.ghhelper-group-linux-snap:hover{background-color:rgba(99,102,241,0.15)!important}
.ghhelper-group-linux-other{border-left:4px solid var(--color-attention-emphasis,#9e6a03)!important;background-color:var(--color-attention-subtle,rgba(210,153,34,0.1))!important}
.ghhelper-group-linux-other:hover{background-color:var(--color-attention-muted,rgba(210,153,34,0.15))!important}
.ghhelper-group-other{border-left:4px solid transparent!important}
.ghhelper-platform-tag{background-color:transparent!important;display:inline-block;font-size:11px;padding:1px 6px;border:1px solid;border-radius:10px;margin-right:4px}
.ghhelper-tag-windows{color:var(--color-accent-emphasis,#1f6feb)!important;border-color:var(--color-accent-emphasis,#1f6feb)!important}
.ghhelper-tag-mac{color:var(--color-done-emphasis,#8957e5)!important;border-color:var(--color-done-emphasis,#8957e5)!important}
.ghhelper-tag-android{color:#2da44e!important;border-color:#2da44e!important}
.ghhelper-tag-ios{color:#6e7681!important;border-color:#6e7681!important}
.ghhelper-tag-linux-deb{color:var(--color-severe-emphasis,#db6d28)!important;border-color:var(--color-severe-emphasis,#db6d28)!important}
.ghhelper-tag-linux-rpm{color:var(--color-danger-emphasis,#f85149)!important;border-color:var(--color-danger-emphasis,#f85149)!important}
.ghhelper-tag-linux-arch{color:var(--color-sponsors-emphasis,#bf4b8a)!important;border-color:var(--color-sponsors-emphasis,#bf4b8a)!important}
.ghhelper-tag-linux-appimage{color:#20c997!important;border-color:#20c997!important}
.ghhelper-tag-linux-flatpak{color:#0abda0!important;border-color:#0abda0!important}
.ghhelper-tag-linux-ipk{color:#e3b341!important;border-color:#e3b341!important}
.ghhelper-tag-linux-snap{color:#6366f1!important;border-color:#6366f1!important}
.ghhelper-tag-linux-other{color:var(--color-attention-emphasis,#9e6a03)!important;border-color:var(--color-attention-emphasis,#9e6a03)!important}
.ghhelper-proxy-row{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:8px;flex-shrink:0}
.ghhelper-proxy-btn{display:inline-flex;align-items:center;padding:2px 8px;font-size:11px;font-weight:500;border:1px solid var(--borderColor-default,var(--color-border-default,#30363d));border-radius:6px;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;text-decoration:none!important;white-space:nowrap}
.ghhelper-proxy-btn:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d));text-decoration:none!important;color:var(--button-default-fgColor-hover,var(--color-btn-hover-text,#c9d1d9))!important}
.ghhelper-proxy-dropdown{position:relative;display:inline-flex;align-items:center}
.ghhelper-proxy-dropdown::after{content:"";position:absolute;top:100%;left:0;right:0;height:8px;z-index:998}
.ghhelper-proxy-dropdown-menu{display:none;position:absolute;right:0;top:100%;z-index:999;min-width:80px;padding:4px 0;margin-top:4px;background-color:var(--overlay-bgColor,var(--color-canvas-overlay));border:1px solid var(--borderColor-default,var(--color-border-default));border-radius:6px;box-shadow:var(--shadow-floating-large,0 8px 24px rgba(140,149,159,0.2))}
.ghhelper-proxy-dropdown:hover .ghhelper-proxy-dropdown-menu{display:block}
.ghhelper-proxy-menu-item{display:block!important;padding:4px 16px!important;margin:0!important;border:none!important;border-radius:0!important;background:transparent!important;color:var(--fgColor-default,var(--color-fg-default))!important;text-decoration:none!important;font-size:12px!important;text-align:center!important;line-height:1.5!important}
.ghhelper-proxy-menu-item:hover{background-color:var(--controlAction-bgColor-hover,var(--color-action-list-item-default-hover-bg))!important;text-decoration:none!important}
.ghhelper-os-select,.ghhelper-arch-select{appearance:auto;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));border:1px solid var(--button-default-borderColor-rest,var(--color-btn-border,rgba(240,246,252,0.1)));border-radius:6px;color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;font-size:12px;font-weight:500;line-height:20px;padding:3px 8px;margin-left:8px}
.ghhelper-os-select:hover,.ghhelper-arch-select:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-meta-wrapper>summary{cursor:pointer;padding:8px 16px;font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted,#8b949e));border-top:1px solid var(--borderColor-muted,var(--color-border-muted,#30363d))}
.ghhelper-meta-wrapper>summary:hover{color:var(--fgColor-default,var(--color-fg-default,#e6edf3))}
.ghhelper-aux-wrapper{padding-left:0!important}
.ghhelper-aux-wrapper>li{border-left:none!important;background-color:transparent!important}
.ghhelper-aux-wrapper>summary{cursor:pointer;padding:6px 16px;font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted,#8b949e))}
.ghhelper-aux-wrapper>summary:hover{color:var(--fgColor-default,var(--color-fg-default,#e6edf3))}
.markdown-body.ghhelper-notes-collapsed{display:none!important}
.ghhelper-notes-toggle{appearance:none;background:none;border:none;padding:0;margin:0 0 8px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;color:var(--fgColor-muted,var(--color-fg-muted,#8b949e));font-size:14px;font-weight:600}
.ghhelper-notes-toggle:hover{color:var(--fgColor-default,var(--color-fg-default,#e6edf3))}
.ghhelper-notes-chevron{display:inline-block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid currentColor;transition:transform 0.12s ease;transform-origin:50% 40%}
.ghhelper-notes-toggle.is-collapsed .ghhelper-notes-chevron{transform:rotate(-90deg)}
.ghhelper-scroll-top{position:fixed;right:24px;bottom:24px;z-index:9999;width:40px;height:40px;border-radius:50%;border:1px solid var(--button-default-borderColor-rest,var(--color-btn-border,rgba(240,246,252,0.1)));background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);opacity:0;pointer-events:none;transition:opacity 0.2s ease}
.ghhelper-scroll-top.ghhelper-visible{opacity:1;pointer-events:auto}
.ghhelper-scroll-top:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-settings-overlay{position:fixed;inset:0;z-index:10000;background-color:rgba(1,4,9,0.6);display:flex;align-items:center;justify-content:center}
.ghhelper-settings-modal{background-color:var(--color-canvas-default,#0d1117);border:1px solid var(--color-border-default,#30363d);border-radius:12px;width:560px;max-width:92vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-floating-large,0 8px 24px rgba(0,0,0,0.4))}
.ghhelper-settings-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--color-border-default,#30363d)}
.ghhelper-settings-header h3{margin:0;font-size:16px}
.ghhelper-settings-close{background:none;border:none;color:var(--fgColor-muted,var(--color-fg-muted));cursor:pointer;font-size:22px;line-height:1;padding:0}
.ghhelper-settings-close:hover{color:var(--fgColor-default,var(--color-fg-default))}
.ghhelper-settings-tabs{display:flex;border-bottom:1px solid var(--color-border-default,#30363d);padding:0 20px}
.ghhelper-settings-tab{padding:8px 16px;cursor:pointer;border:none;background:none;color:var(--fgColor-muted,var(--color-fg-muted));font-size:13px;border-bottom:2px solid transparent;margin-bottom:-1px}
.ghhelper-settings-tab:hover{color:var(--fgColor-default,var(--color-fg-default))}
.ghhelper-settings-tab.active{color:var(--fgColor-default,var(--color-fg-default));border-bottom-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-settings-body{flex:1;overflow-y:auto;padding:20px}
.ghhelper-settings-section{margin-bottom:20px}
.ghhelper-settings-section h4{margin:0 0 10px;font-size:14px}
.ghhelper-settings-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border-muted,rgba(48,54,61,0.5))}
.ghhelper-settings-row:last-child{border-bottom:none}
.ghhelper-settings-label{font-size:13px}
.ghhelper-settings-desc{font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted))}
.ghhelper-toggle{position:relative;width:36px;height:20px;cursor:pointer}
.ghhelper-toggle input{display:none}
.ghhelper-toggle-slider{position:absolute;inset:0;background-color:var(--color-neutral-muted,rgba(110,118,129,0.4));border-radius:10px;transition:0.2s}
.ghhelper-toggle-slider::before{content:"";position:absolute;left:2px;bottom:2px;width:16px;height:16px;background-color:white;border-radius:50%;transition:0.2s}
.ghhelper-toggle input:checked+.ghhelper-toggle-slider{background-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-toggle input:checked+.ghhelper-toggle-slider::before{transform:translateX(16px)}
.ghhelper-btn{padding:4px 12px;font-size:12px;border:1px solid var(--color-border-default,#30363d);border-radius:6px;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer}
.ghhelper-btn:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-btn-danger{color:var(--color-danger-fg,#f85149)!important;border-color:var(--color-danger-emphasis,#f85149)!important}
.ghhelper-btn-danger:hover{background-color:var(--color-danger-subtle,rgba(248,81,73,0.1))!important}
.ghhelper-btn-primary{background-color:var(--color-accent-emphasis,#1f6feb)!important;color:#fff!important;border-color:var(--color-accent-emphasis,#1f6feb)!important}
.ghhelper-btn-primary:hover{background-color:var(--color-accent-muted,rgba(56,139,253,0.8))!important}
.ghhelper-proxy-item{border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:12px;margin-bottom:8px}
.ghhelper-proxy-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.ghhelper-proxy-name{font-weight:600;font-size:13px}
.ghhelper-proxy-url{font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted));word-break:break-all;margin-bottom:6px}
.ghhelper-proxy-meta{font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted));display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ghhelper-input{padding:4px 8px;font-size:12px;border:1px solid var(--color-border-default,#30363d);border-radius:6px;background-color:var(--color-canvas-default,#0d1117);color:var(--fgColor-default,var(--color-fg-default));width:100%;box-sizing:border-box}
.ghhelper-select{padding:4px 8px;font-size:12px;border:1px solid var(--color-border-default,#30363d);border-radius:6px;background-color:var(--color-canvas-default,#0d1117);color:var(--fgColor-default,var(--color-fg-default))}
.ghhelper-badge{display:inline-block;padding:1px 6px;font-size:10px;border-radius:8px;border:1px solid}
.ghhelper-badge-builtin{color:var(--color-accent-fg,#58a6ff);border-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-badge-custom{color:var(--color-done-fg,#a371f7);border-color:var(--color-done-emphasis,#8957e5)}
.ghhelper-gear-btn{position:fixed;right:24px;top:80px;z-index:9998;width:36px;height:36px;border-radius:50%;border:1px solid var(--button-default-borderColor-rest,var(--color-btn-border,rgba(240,246,252,0.1)));background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);opacity:0.7;transition:opacity 0.15s}
.ghhelper-gear-btn:hover{opacity:1;background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-panel-section{display:none}
.ghhelper-panel-section.active{display:block}
`;
            document.head.appendChild(style);
        },

        getFileNameFromLink(linkElem) {
            const href = linkElem.getAttribute('href');
            if (href) {
                const seg = decodeURIComponent(href.split('/').pop().split('?')[0]);
                if (seg) return seg;
            }
            const span = linkElem.querySelector('.Truncate-text');
            return span ? span.textContent.trim() : linkElem.textContent.trim();
        },

        formatCount(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
            if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
            return String(num);
        },

        getRepoInfo() {
            const parts = window.location.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
            return null;
        },

        fetchReleaseData(owner, repo, tag) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
                    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'GitHub-Helper/1.0' },
                    onload: (r) => {
                        if (r.status === 200) resolve(JSON.parse(r.responseText));
                        else reject(`API ${r.status}`);
                    },
                    onerror: reject
                });
            });
        },

        processReleaseBox(details) {
            if (details.dataset.ghhelperProcessed === 'true') return;
            details.dataset.ghhelperProcessed = 'true';
            this._processedDetails.push(details);

            const repoInfo = this.getRepoInfo();
            if (!repoInfo) return;
            const tagName = this.findTagName(details);
            if (!tagName) return;

            const summary = details.querySelector('summary');
            if (!summary) return;
            const titleSpan = summary.querySelector('.d-inline-flex.flex-items-center') || summary;

            if (StorageManager.isFeatureEnabled('groupAndSort') && titleSpan && !summary.dataset.ghhelperSelInjected) {
                summary.dataset.ghhelperSelInjected = 'true';
                const osSel = document.createElement('select');
                osSel.className = 'ghhelper-os-select';
                osSel.setAttribute('data-ghhelper-element', '1');
                osSel.setAttribute('data-ghhelper-nt', '1');
                const detOS = SortEngine.getCurrentOS();
                const selOS = StorageManager.getSelectedOS() || detOS;
                OS_OPTIONS.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.value; opt.textContent = o.label;
                    if (o.value === selOS) opt.selected = true;
                    osSel.appendChild(opt);
                });
                osSel.addEventListener('click', e => e.stopPropagation());
                osSel.addEventListener('mousedown', e => e.stopPropagation());
                osSel.addEventListener('change', () => {
                    StorageManager.setSelectedOS(osSel.value);
                    document.querySelectorAll('.ghhelper-os-select').forEach(s => s.value = osSel.value);
                    this.reprocessAll();
                });
                titleSpan.appendChild(osSel);

                const archSel = document.createElement('select');
                archSel.className = 'ghhelper-arch-select';
                archSel.setAttribute('data-ghhelper-element', '1');
                archSel.setAttribute('data-ghhelper-nt', '1');
                const detArch = SortEngine.getCurrentArch();
                const selArch = StorageManager.getSelectedArch() || detArch;
                ARCH_OPTIONS.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.value; opt.textContent = o.label;
                    if (o.value === selArch) opt.selected = true;
                    archSel.appendChild(opt);
                });
                archSel.addEventListener('click', e => e.stopPropagation());
                archSel.addEventListener('mousedown', e => e.stopPropagation());
                archSel.addEventListener('change', () => {
                    StorageManager.setSelectedArch(archSel.value);
                    document.querySelectorAll('.ghhelper-arch-select').forEach(s => s.value = archSel.value);
                    this.reprocessAll();
                });
                titleSpan.appendChild(archSel);
            }

            if (StorageManager.isFeatureEnabled('downloadCount') && titleSpan && !summary.dataset.ghhelperDlBtn) {
                summary.dataset.ghhelperDlBtn = 'true';
                const btn = document.createElement('button');
                btn.className = 'Button Button--secondary Button--small ml-3';
                btn.setAttribute('data-ghhelper-element', '1');
                btn.setAttribute('data-ghhelper-nt', '1');
                btn.innerHTML = '<span class="Button-content"><span class="Button-label">显示下载量</span></span>';
                let assets = null, busy = false;
                btn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (busy) return;
                    busy = true;
                    btn.innerHTML = '<span class="Button-content"><span class="Button-label">获取中...</span></span>';
                    btn.disabled = true;
                    this.fetchReleaseData(repoInfo.owner, repoInfo.repo, tagName).then(d => {
                        assets = d.assets;
                        this.injectDownloadCounts(details, assets);
                        btn.innerHTML = '<span class="Button-content"><span class="Button-label">刷新下载量</span></span>';
                        btn.disabled = false;
                        busy = false;
                    }).catch(() => {
                        btn.innerHTML = '<span class="Button-content"><span class="Button-label color-fg-danger">获取失败(限流)</span></span>';
                        btn.disabled = false;
                        busy = false;
                    });
                });
                titleSpan.appendChild(btn);
            }

            details.addEventListener('toggle', () => {
                if (details.open) {
                    if (StorageManager.isFeatureEnabled('groupAndSort')) this.formatAndSortUI(details);
                    if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(details);
                }
            });
        },

        formatAndSortUI(detailsElem, force) {
            const validRows = Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]'));
            if (!validRows.length) return;
            const prev = parseInt(detailsElem.dataset.ghhelperVRCount || '0');
            if (!force && validRows.length === prev) return;
            detailsElem.dataset.ghhelperVRCount = validRows.length;

            const parent = validRows[0].parentNode;
            const os = SortEngine.getActiveOS();
            const arch = SortEngine.getActiveArch();

            validRows.forEach(row => {
                const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]');
                let score = -10000, gi = { id: 'other', showTag: false };
                if (nl) {
                    const fn = this.getFileNameFromLink(nl);
                    const href = nl.getAttribute('href') || '';
                    gi = href.includes('/archive/') ? { id: 'source', showTag: false }
                        : href.includes('/attestations/') ? { id: 'meta', showTag: false }
                        : SortEngine.parseFileGroup(fn);
                    score = SortEngine.calculateMatchScore(fn, gi, os, arch);
                }
                row._ghs = score; row._ghg = gi; row._ghn = nl;
            });

            validRows.forEach(r => r.remove());
            parent.querySelectorAll('[data-ghhelper-wrapper="1"]').forEach(w => w.remove());
            validRows.sort((a, b) => b._ghs - a._ghs);

            const normal = validRows.filter(r => r._ghg.id !== 'meta');
            const meta = validRows.filter(r => r._ghg.id === 'meta');

            const style = (row) => {
                row.style.borderTop = ''; row.style.borderLeft = ''; row.style.backgroundColor = '';
                row.className = row.className.replace(/ghhelper-group-\S+/g, '');
                row.classList.add(SortEngine.getGroupClass(row._ghg.id));
                let mc = row.querySelector('[data-ghhelper-meta]');
                if (!mc) {
                    mc = document.createElement('div');
                    mc.setAttribute('data-ghhelper-meta', '1');
                    mc.setAttribute('data-ghhelper-element', '1');
                    mc.setAttribute('data-ghhelper-nt', '1');
                    mc.style.cssText = 'display:flex;align-items:center;flex-shrink:0;margin-right:12px;flex-wrap:wrap;gap:4px';
                    const rs = row.querySelector('[class*="col-"]') || row.querySelector('[class*="flex-auto"]');
                    if (rs) { const sw = rs.querySelector('[class*="flex-1"]'); if (sw) sw.insertBefore(mc, sw.firstChild); else rs.insertBefore(mc, rs.firstChild); }
                    else row.appendChild(mc);
                }
                mc.querySelectorAll('[data-ghhelper-tag]').forEach(t => t.remove());
                if (row._ghg.showTag) {
                    const tag = document.createElement('span');
                    tag.setAttribute('data-ghhelper-tag', '1');
                    tag.setAttribute('data-ghhelper-element', '1');
                    tag.setAttribute('data-ghhelper-nt', '1');
                    tag.className = 'ghhelper-platform-tag ' + SortEngine.getTagClass(row._ghg.id);
                    tag.textContent = row._ghg.name;
                    mc.appendChild(tag);
                }
            };

            let gid = null, seg = [];
            const flush = () => {
                if (!seg.length) return;
                const main = [], aux = [];
                seg.forEach(r => {
                    const n = r._ghn ? this.getFileNameFromLink(r._ghn) : '';
                    (SortEngine.isSignatureFile(n) ? aux : main).push(r);
                });
                main.forEach(r => { parent.appendChild(r); style(r); });
                if (aux.length) {
                    const w = document.createElement('details');
                    w.setAttribute('data-ghhelper-wrapper', '1');
                    w.setAttribute('data-ghhelper-element', '1');
                    w.setAttribute('data-ghhelper-nt', '1');
                    w.className = 'ghhelper-aux-wrapper ' + SortEngine.getGroupClass(seg[0]._ghg.id);
                    const s = document.createElement('summary');
                    s.textContent = `校验/增量文件 (${aux.length})`;
                    w.appendChild(s);
                    aux.forEach(r => { w.appendChild(r); style(r); });
                    parent.appendChild(w);
                }
                seg = [];
            };

            normal.forEach(r => { if (r._ghg.id !== gid) flush(); gid = r._ghg.id; seg.push(r); });
            flush();

            if (meta.length) {
                const w = document.createElement('details');
                w.setAttribute('data-ghhelper-wrapper', '1');
                w.setAttribute('data-ghhelper-element', '1');
                w.setAttribute('data-ghhelper-nt', '1');
                w.className = 'ghhelper-meta-wrapper';
                const s = document.createElement('summary');
                s.textContent = `签名 / 校验文件 (${meta.length})`;
                w.appendChild(s);
                meta.forEach(r => { w.appendChild(r); style(r); });
                parent.appendChild(w);
            }

            const sab = Array.from(parent.children).find(c =>
                !c.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]') &&
                !c.hasAttribute('data-ghhelper-wrapper') && /show all/i.test(c.textContent));
            if (sab) parent.appendChild(sab);
        },

        injectDownloadCounts(detailsElem, assets) {
            if (!assets) return;
            Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]')).forEach(row => {
                    const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                    if (!nl) return;
                    const fn = this.getFileNameFromLink(nl);
                    const ad = assets.find(a => a.name === fn);
                    if (!ad || row.querySelector('[data-ghhelper-dlcount]')) return;
                    const cs = document.createElement('span');
                    cs.setAttribute('data-ghhelper-dlcount', '1');
                    cs.setAttribute('data-ghhelper-element', '1');
                    cs.setAttribute('data-ghhelper-nt', '1');
                    cs.style.cssText = 'color:var(--fgColor-muted,var(--color-fg-muted));flex-shrink:0;display:flex;align-items:center;margin-right:8px;white-space:nowrap';
                    cs.innerHTML = '<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" style="flex-shrink:0;min-width:16px;margin-right:2px"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"/></svg><span>' + this.formatCount(ad.download_count) + '</span>';
                    let mc = row.querySelector('[data-ghhelper-meta]');
                    if (!mc) {
                        mc = document.createElement('div');
                        mc.setAttribute('data-ghhelper-meta', '1');
                        mc.setAttribute('data-ghhelper-element', '1');
                        mc.setAttribute('data-ghhelper-nt', '1');
                        mc.style.cssText = 'display:flex;align-items:center;flex-shrink:0;margin-right:12px;flex-wrap:wrap;gap:4px';
                        const rs = row.querySelector('[class*="col-"]') || row.querySelector('[class*="flex-auto"]');
                        if (rs) rs.insertBefore(mc, rs.firstChild); else row.appendChild(mc);
                    }
                    mc.appendChild(cs);
                });
        },

        processProxyButtons(detailsElem) {
            Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]')).forEach(row => {
                    const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                    if (!nl) return;
                    const href = nl.getAttribute('href');
                    if (!href) return;
                    const existing = row.querySelector('[data-ghhelper-proxy]');
                    if (existing) existing.remove();
                    const disp = ProxyManager.getDisplayProxies('download');
                    const all = [...disp.pinned, ...disp.overflow];
                    if (!all.length) return;
                    const container = document.createElement('span');
                    container.setAttribute('data-ghhelper-proxy', '1');
                    container.setAttribute('data-ghhelper-element', '1');
                    container.setAttribute('data-ghhelper-nt', '1');
                    container.className = 'ghhelper-proxy-row';
                    disp.pinned.forEach(p => {
                        const url = ProxyManager.buildUrl(p, href, 'download');
                        const btn = document.createElement('a');
                        btn.className = 'ghhelper-proxy-btn';
                        btn.href = url; btn.target = '_blank'; btn.rel = 'noopener noreferrer';
                        btn.textContent = p.name;
                        btn.title = (p.desc || '') + (p.region ? ' [' + p.region + ']' : '');
                        container.appendChild(btn);
                    });
                    if (disp.overflow.length) {
                        const dd = document.createElement('span');
                        dd.className = 'ghhelper-proxy-dropdown';
                        const db = document.createElement('span');
                        db.className = 'ghhelper-proxy-btn'; db.textContent = '加速 ▼';
                        const dm = document.createElement('div');
                        dm.className = 'ghhelper-proxy-dropdown-menu';
                        disp.overflow.forEach(p => {
                            const url = ProxyManager.buildUrl(p, href, 'download');
                            const lk = document.createElement('a');
                            lk.className = 'ghhelper-proxy-menu-item';
                            lk.href = url; lk.target = '_blank'; lk.rel = 'noopener noreferrer';
                            lk.textContent = p.name;
                            lk.title = (p.desc || '') + (p.region ? ' [' + p.region + ']' : '');
                            dm.appendChild(lk);
                        });
                        dd.appendChild(db); dd.appendChild(dm); container.appendChild(dd);
                    }
                    const rs = row.querySelector('[class*="col-"]') || row.querySelector('[class*="flex-auto"]');
                    if (rs) rs.appendChild(container); else row.appendChild(container);
                    const xb = row.querySelector('.XIU2-RS');
                    if (xb) xb.style.display = 'none';
                });
        },

        reprocessAll() {
            this._processedDetails.forEach(d => {
                d.dataset.ghhelperVRCount = '0';
                if (d.open) this.formatAndSortUI(d, true);
            });
        },

        findTagName(detailsElem) {
            const m = window.location.pathname.match(/\/releases\/tag\/([^/?]+)/);
            if (m) return decodeURIComponent(m[1]);
            const c = detailsElem.closest('section,.Box,.js-details-container,div[data-test-selector="release-card"]');
            if (c) {
                const tl = c.querySelector('a[href*="/releases/tag/"]');
                if (tl) { const m2 = tl.getAttribute('href').match(/\/releases\/tag\/([^/?]+)/); if (m2) return decodeURIComponent(m2[1]); }
            }
            return null;
        },

        processReleaseNotes() {
            document.querySelectorAll('.markdown-body.tmp-my-3:not(.ghhelper-notes-processed)').forEach(el => {
                el.classList.add('ghhelper-notes-processed');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ghhelper-notes-toggle';
                btn.setAttribute('data-ghhelper-element', '1');
                btn.setAttribute('data-ghhelper-nt', '1');
                btn.innerHTML = '<span class="ghhelper-notes-chevron"></span>更新日志';
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    const c = el.classList.toggle('ghhelper-notes-collapsed');
                    btn.classList.toggle('is-collapsed', c);
                });
                el.parentNode.insertBefore(btn, el);
            });
        },

        replaceOneTime(el) {
            const dt = el.getAttribute('datetime');
            if (!dt) return;
            const d = new Date(dt);
            if (isNaN(d.getTime())) return;
            const pad = n => String(n).padStart(2, '0');
            const f = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            el.setAttribute('data-ghhelper-time', '1');
            if (el.shadowRoot) el.shadowRoot.textContent = f;
            el.textContent = f;
            el.style.cssText = 'font-variant-numeric:tabular-nums;';
        },

        replaceRelativeTimes() {
            document.querySelectorAll('relative-time:not([data-ghhelper-time])').forEach(el => this.replaceOneTime(el));
        },

        startTimeObserver() {
            if (this._timeObserver) return;
            this._timeObserver = new MutationObserver(() => {
                document.querySelectorAll('relative-time:not([data-ghhelper-time])').forEach(el => this.replaceOneTime(el));
            });
            this._timeObserver.observe(document.body, { childList: true, subtree: true });
        },

        injectScrollToTop() {
            if (this._scrollTopBtn) return;
            const btn = document.createElement('button');
            btn.className = 'ghhelper-scroll-top';
            btn.setAttribute('data-ghhelper-element', '1');
            btn.setAttribute('data-ghhelper-nt', '1');
            btn.title = '回到顶部';
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.25a.75.75 0 0 1 .53.22l4.25 4.25a.75.75 0 1 1-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 1 1-1.06-1.06L7.47 4.47a.75.75 0 0 1 .53-.22Z"/></svg>';
            btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
            document.body.appendChild(btn);
            this._scrollTopBtn = btn;
            const u = () => btn.classList.toggle('ghhelper-visible', window.scrollY > 300);
            window.addEventListener('scroll', u, { passive: true });
            u();
        },

        injectGearButton() {
            if (document.getElementById('ghhelper-gear-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'ghhelper-gear-btn';
            btn.className = 'ghhelper-gear-btn';
            btn.setAttribute('data-ghhelper-element', '1');
            btn.setAttribute('data-ghhelper-nt', '1');
            btn.title = 'GitHub 助手设置';
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.028-.288c.648-.175 1.306.129 1.474.77l.273 1.022c.168.643-.089 1.312-.59 1.637l-.846.54c-.054.034-.13.101-.13.241 0 .14.076.207.13.241l.846.54c.501.325.758.994.59 1.637l-.273 1.022c-.168.641-.826.945-1.474.77l-1.028-.288c-.066-.019-.176-.011-.299.071-.214.143-.437.272-.668.386-.133.066-.194.158-.212.224l-.288 1.107c-.17.645-.716 1.195-1.459 1.259a8.2 8.2 0 0 1-1.402 0c-.743-.064-1.289-.614-1.459-1.259l-.288-1.107c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.028.288c-.648.175-1.306-.129-1.474-.77l-.273-1.022c-.168-.643.089-1.312.59-1.637l.846-.54c.054-.034.13-.101.13-.241 0-.14-.076-.207-.13-.241l-.846-.54c-.501-.325-.758-.994-.59-1.637l.273-1.022c.168-.641.826-.945 1.474-.77l1.028.288c.066.019.176.011.299-.071.231-.114.454-.243.668-.386.133-.066.194-.158.212-.224l.288-1.107C7.01.645 7.556.095 8.299.031 8.2 8.2 0 0 1 .701.031 8 8 8zM5.5 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z"/></svg>';
            btn.addEventListener('click', () => SettingsPanel.show());
            document.body.appendChild(btn);
        }
    };

    // ============================================================
    // 6. 设置面板 (SettingsPanel)
    // ============================================================

    const SettingsPanel = {
        _overlay: null,
        _activeTab: 'proxies',

        show() {
            if (this._overlay) {
                this._overlay.style.display = 'flex';
                this.renderTab(this._activeTab);
                return;
            }
            this._overlay = this.create();
            document.body.appendChild(this._overlay);
            this.renderTab('proxies');
        },

        hide() {
            if (this._overlay) this._overlay.style.display = 'none';
        },

        create() {
            const overlay = document.createElement('div');
            overlay.className = 'ghhelper-settings-overlay';
            overlay.setAttribute('data-ghhelper-element', '1');
            overlay.setAttribute('data-ghhelper-nt', '1');
            overlay.innerHTML = `
<div class="ghhelper-settings-modal">
  <div class="ghhelper-settings-header">
    <h3>GitHub 助手设置</h3>
    <button class="ghhelper-settings-close" id="ghhelper-close">&times;</button>
  </div>
  <div class="ghhelper-settings-tabs">
    <button class="ghhelper-settings-tab active" data-tab="proxies">加速源管理</button>
    <button class="ghhelper-settings-tab" data-tab="features">功能开关</button>
    <button class="ghhelper-settings-tab" data-tab="help">帮助</button>
  </div>
  <div class="ghhelper-settings-body" id="ghhelper-body"></div>
</div>`;
            overlay.querySelector('#ghhelper-close').addEventListener('click', () => this.hide());
            overlay.addEventListener('click', e => { if (e.target === overlay) this.hide(); });
            overlay.querySelectorAll('.ghhelper-settings-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    overlay.querySelectorAll('.ghhelper-settings-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this._activeTab = tab.dataset.tab;
                    this.renderTab(tab.dataset.tab);
                });
            });
            return overlay;
        },

        renderTab(tab) {
            const body = document.getElementById('ghhelper-body');
            if (!body) return;
            if (tab === 'proxies') this.renderProxyTab(body);
            else if (tab === 'features') this.renderFeatureTab(body);
            else if (tab === 'help') this.renderHelpTab(body);
        },

        renderProxyTab(body) {
            const custom = ProxyManager.getCustom();
            const builtin = BUILTIN_PROXIES;
            const maxDisplay = StorageManager.getMaxDisplay();

            let html = '<div class="ghhelper-settings-section"><h4>自定义加速源 (' + custom.length + ')</h4>';
            custom.forEach(p => {
                html += this._proxyItemHTML(p, false);
            });
            html += '<button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-add-proxy" style="margin-top:8px">+ 添加加速源</button></div>';

            html += '<div class="ghhelper-settings-section"><h4>内置加速源 (' + builtin.length + ')</h4>';
            html += '<div style="max-height:200px;overflow-y:auto">';
            builtin.forEach(p => {
                html += '<div class="ghhelper-settings-row"><div><span class="ghhelper-settings-label">' + p.name + '</span> <span class="ghhelper-settings-desc">' + p.desc + ' [' + (p.region || '') + ']</span></div>';
                html += '<label class="ghhelper-toggle"><input type="checkbox" ' + (p.enabled ? 'checked' : '') + ' data-builtin-id="' + p.id + '"><span class="ghhelper-toggle-slider"></span></label></div>';
            });
            html += '</div></div>';

            html += '<div class="ghhelper-settings-section"><h4>显示设置</h4>';
            html += '<div class="ghhelper-settings-row"><span class="ghhelper-settings-label">最大显示数量</span><select class="ghhelper-select" id="ghhelper-max-display">';
            [4, 5, 6, 7, 8, 9, 10].forEach(n => {
                html += '<option value="' + n + '" ' + (maxDisplay === n ? 'selected' : '') + '>' + n + '</option>';
            });
            html += '</select></div></div>';

            body.innerHTML = html;

            // 绑定事件
            document.getElementById('ghhelper-add-proxy').addEventListener('click', () => this.showAddProxyForm(body));
            document.getElementById('ghhelper-max-display').addEventListener('change', function () {
                StorageManager.setMaxDisplay(parseInt(this.value));
            });
            body.querySelectorAll('input[data-builtin-id]').forEach(cb => {
                cb.addEventListener('change', function () {
                    ProxyManager.toggleBuiltin(this.dataset.builtinId);
                });
            });
            body.querySelectorAll('.ghhelper-btn-danger').forEach(btn => {
                btn.addEventListener('click', function () {
                    const id = this.dataset.proxyId;
                    ProxyManager.deleteCustom(id);
                    SettingsPanel.renderTab('proxies');
                });
            });
        },

        _proxyItemHTML(p, builtin) {
            let h = '<div class="ghhelper-proxy-item"><div class="ghhelper-proxy-header">';
            h += '<span class="ghhelper-proxy-name">' + p.name + ' <span class="ghhelper-badge ' + (builtin ? 'ghhelper-badge-builtin' : 'ghhelper-badge-custom') + '">' + (builtin ? '内置' : '自定义') + '</span></span>';
            if (!builtin) {
                h += '<div><button class="ghhelper-btn ghhelper-btn-danger" data-proxy-id="' + p.id + '" style="margin-left:8px">删除</button></div>';
            }
            h += '</div><div class="ghhelper-proxy-url">' + p.url + '</div>';
            h += '<div class="ghhelper-proxy-meta"><span>类型: ' + p.type + '</span><span>' + (p.desc || '') + '</span><span>' + (p.region || '') + '</span></div></div>';
            return h;
        },

        showAddProxyForm(body) {
            const form = document.createElement('div');
            form.style.cssText = 'border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:12px;margin-top:8px';
            form.innerHTML = `
<p style="margin:0 0 8px;font-weight:600">添加自定义加速源</p>
<div style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-name" placeholder="名称" style="margin-bottom:6px"></div>
<div style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-url" placeholder="URL（如 https://example.com/https://github.com）"></div>
<div style="margin-bottom:6px"><select class="ghhelper-select" id="ghhelper-new-type">
  <option value="download">下载/ZIP</option><option value="raw">Raw</option><option value="clone">Clone</option><option value="ssh">SSH</option><option value="all">全部</option>
</select></div>
<div style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-desc" placeholder="备注（可选）"></div>
<div style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-region" placeholder="地区（可选）"></div>
<div style="display:flex;gap:8px">
  <button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-save-proxy">保存</button>
  <button class="ghhelper-btn" id="ghhelper-cancel-proxy">取消</button>
</div>`;
            body.insertBefore(form, document.getElementById('ghhelper-add-proxy'));

            document.getElementById('ghhelper-save-proxy').addEventListener('click', () => {
                const name = document.getElementById('ghhelper-new-name').value.trim();
                const url = document.getElementById('ghhelper-new-url').value.trim();
                if (!name || !url) return;
                ProxyManager.addCustom({
                    name, url,
                    type: document.getElementById('ghhelper-new-type').value,
                    desc: document.getElementById('ghhelper-new-desc').value.trim(),
                    region: document.getElementById('ghhelper-new-region').value.trim()
                });
                SettingsPanel.renderTab('proxies');
            });
            document.getElementById('ghhelper-cancel-proxy').addEventListener('click', () => {
                form.remove();
            });
        },

        renderFeatureTab(body) {
            const features = StorageManager.getFeatures();
            const items = [
                { key: 'groupAndSort', label: '文件分组排序', desc: '按 OS/平台分组 + 智能排序' },
                { key: 'downloadCount', label: '显示下载量', desc: '从 GitHub API 获取下载量' },
                { key: 'replaceTime', label: '精确时间替换', desc: '默认关闭以兼容中文化脚本' },
                { key: 'collapsibleNotes', label: '可折叠更新日志', desc: '更新日志可手动折叠' },
                { key: 'proxyButtons', label: '加速下载按钮', desc: '显示加速下载按钮' },
                { key: 'scrollToTop', label: '回到顶部按钮', desc: '悬浮回到顶部按钮' }
            ];
            let html = '<div class="ghhelper-settings-section"><h4>功能开关</h4>';
            items.forEach(item => {
                html += '<div class="ghhelper-settings-row"><div><span class="ghhelper-settings-label">' + item.label + '</span><br><span class="ghhelper-settings-desc">' + item.desc + '</span></div>';
                html += '<label class="ghhelper-toggle"><input type="checkbox" ' + (features[item.key] ? 'checked' : '') + ' data-feature="' + item.key + '"><span class="ghhelper-toggle-slider"></span></label></div>';
            });
            html += '</div>';
            body.innerHTML = html;

            body.querySelectorAll('input[data-feature]').forEach(cb => {
                cb.addEventListener('change', function () {
                    const f = StorageManager.getFeatures();
                    f[this.dataset.feature] = this.checked;
                    StorageManager.setFeatures(f);
                });
            });
        },

        renderHelpTab(body) {
            body.innerHTML = `
<div class="ghhelper-settings-section">
  <h4>关于 GitHub 助手</h4>
  <p style="font-size:13px;color:var(--fgColor-muted,var(--color-fg-muted))">
    GitHub 助手整合了 Release 增强显示、加速下载等功能，兼容 GitHub 中文化插件。
  </p>
</div>
<div class="ghhelper-settings-section">
  <h4>功能说明</h4>
  <ul style="font-size:13px;color:var(--fgColor-muted,var(--color-fg-muted));padding-left:20px">
    <li><strong>文件分组排序</strong>：将 Release 文件按平台分组，并根据当前系统/架构智能排序</li>
    <li><strong>显示下载量</strong>：点击按钮获取每个文件的下载量</li>
    <li><strong>精确时间替换</strong>：将相对时间替换为精确时间（默认关闭）</li>
    <li><strong>可折叠更新日志</strong>：可手动折叠/展开 Release 更新日志</li>
    <li><strong>加速下载按钮</strong>：在每个 Release 文件旁显示加速下载按钮</li>
    <li><strong>回到顶部按钮</strong>：滚动超过 300px 后显示</li>
  </ul>
</div>
<div class="ghhelper-settings-section">
  <h4>加速源</h4>
  <p style="font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted))">
    自定义加速源优先显示，内置加速源作为补充。每个文件最多显示 maxDisplayCount 个按钮，超出部分放入"加速 ▼"下拉菜单。
  </p>
</div>
<div class="ghhelper-settings-section">
  <h4>反馈</h4>
  <p style="font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted))">
    如有问题或建议，请访问 <a href="https://github.com/Liora-Wells/UserScript" target="_blank">GitHub 仓库</a>
  </p>
</div>`;
        }
    };

    // ============================================================
    // 7. 中文化兼容层 (CompatibilityLayer)
    // ============================================================

    // 所有注入的 DOM 元素都标记了 data-ghhelper-nt="1"，
    // 中文化脚本的 traverseNode 函数会跳过这些元素（通过 reIgnoreClass 等规则）。
    // 此外，所有 CSS 类名使用 ghhelper- 前缀，避免与中文化脚本冲突。

    // ============================================================
    // 8. 初始化入口
    // ============================================================

    function init() {
        DOMRenderer.injectCSS();
        DOMRenderer.injectGearButton();

        if (StorageManager.isFeatureEnabled('scrollToTop')) {
            DOMRenderer.injectScrollToTop();
        }

        if (StorageManager.isFeatureEnabled('replaceTime')) {
            DOMRenderer.replaceRelativeTimes();
            DOMRenderer.startTimeObserver();
        }

        if (!/^\/[^/]+\/[^/]+\/releases/.test(window.location.pathname)) return;

        const repoInfo = DOMRenderer.getRepoInfo();
        if (!repoInfo) return;

        if (StorageManager.isFeatureEnabled('collapsibleNotes')) {
            DOMRenderer.processReleaseNotes();
        }

        document.querySelectorAll('details').forEach(details => {
            const summary = details.querySelector('summary');
            if (summary && /Assets/i.test(summary.textContent)) {
                DOMRenderer.processReleaseBox(details);
            }
        });
    }

    init();
    document.addEventListener('turbo:load', init);
    document.addEventListener('pjax:end', init);
    if (window.onurlchange === undefined) {
        history.pushState = (f => function () { var r = f.apply(this, arguments); window.dispatchEvent(new Event('urlchange')); return r; })(history.pushState);
        history.replaceState = (f => function () { var r = f.apply(this, arguments); window.dispatchEvent(new Event('urlchange')); return r; })(history.replaceState);
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('urlchange')));
    }
    window.addEventListener('urlchange', init);

})();