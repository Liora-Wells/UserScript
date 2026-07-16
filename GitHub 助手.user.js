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

    const DEBUG = true;
    const LOG = (...args) => { if (DEBUG) console.log('[GH助手]', ...args); };
    const WARN = (...args) => { if (DEBUG) console.warn('[GH助手]', ...args); };
    const ERR = (...args) => { if (DEBUG) console.error('[GH助手]', ...args); };

    // ============================================================
    // 1. 配置常量
    // ============================================================

    const STORAGE_KEYS = {
        proxies: 'ghhelper_proxies',
        deletedBuiltinIds: 'ghhelper_deleted_builtin_ids',
        features: 'ghhelper_features',
        maxDisplay: 'ghhelper_max_display',
        selectedOS: 'ghhelper_selected_os',
        selectedArch: 'ghhelper_selected_arch',
        groupsCollapsed: 'ghhelper_proxy_groups_collapsed'
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

        // 统一列表（内置+自定义），从 storage 读取
        getProxies() {
            return this.get(STORAGE_KEYS.proxies, []);
        },

        setProxies(proxies) {
            this.set(STORAGE_KEYS.proxies, proxies);
        },

        // 被删除的内置源 id 列表
        getDeletedBuiltinIds() {
            return this.get(STORAGE_KEYS.deletedBuiltinIds, []);
        },

        setDeletedBuiltinIds(ids) {
            this.set(STORAGE_KEYS.deletedBuiltinIds, ids);
        },

        getAllProxies() {
            return this.getProxies();
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
        },

        // 首次安装写入种子；升级时合并新增内置源
        initProxies() {
            const existing = this.getProxies();
            if (!existing || !existing.length) {
                LOG('StorageManager.initProxies: storage 为空，写入内置源种子');
                this.setProxies(BUILTIN_PROXIES.map(p => Object.assign({}, p, { edited: false })));
                return;
            }
            LOG('StorageManager.initProxies: storage 已有 ' + existing.length + ' 条，执行升级合并');
            this.mergeBuiltinUpgrades(existing);
        },

        mergeBuiltinUpgrades(current) {
            try {
                const deleted = this.getDeletedBuiltinIds();
                const existingIds = new Set(current.map(p => p.id));
                let added = 0, updated = 0;
                BUILTIN_PROXIES.forEach(builtin => {
                    if (existingIds.has(builtin.id)) {
                        // 已存在：若未编辑则用常量覆盖（保留 enabled 状态）
                        const idx = current.findIndex(p => p.id === builtin.id);
                        if (!current[idx].edited) {
                            current[idx] = Object.assign({}, builtin, { edited: false, enabled: current[idx].enabled });
                            updated++;
                        }
                    } else if (!deleted.includes(builtin.id)) {
                        // 新内置源，用户未删除过，追加
                        current.push(Object.assign({}, builtin, { edited: false }));
                        added++;
                    }
                });
                if (added || updated) {
                    this.setProxies(current);
                    LOG('StorageManager.mergeBuiltinUpgrades: 新增 ' + added + ' 条, 更新 ' + updated + ' 条');
                }
            } catch (e) {
                ERR('StorageManager.mergeBuiltinUpgrades 异常:', e);
            }
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

        // 自定义源 = builtIn 为 false
        getCustom() {
            return StorageManager.getProxies().filter(p => !p.builtIn);
        },

        // 内置源 = builtIn 为 true
        getBuiltin() {
            return StorageManager.getProxies().filter(p => p.builtIn);
        },

        addCustom(proxy) {
            const all = StorageManager.getProxies();
            proxy.id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            proxy.builtIn = false;
            proxy.enabled = true;
            proxy.edited = false;
            all.push(proxy);
            StorageManager.setProxies(all);
            LOG('ProxyManager.addCustom:', proxy.name, 'id:', proxy.id, '当前总数:', all.length);
            return proxy;
        },

        // 统一编辑：含内置源（编辑后标记 edited: true）
        editProxy(id, updates) {
            const all = StorageManager.getProxies();
            const idx = all.findIndex(p => p.id === id);
            if (idx === -1) return false;
            Object.assign(all[idx], updates);
            if (all[idx].builtIn) all[idx].edited = true;
            StorageManager.setProxies(all);
            LOG('ProxyManager.editProxy: id=' + id + ', edited=' + all[idx].edited);
            return true;
        },

        // 统一删除：内置源 id 记入 deletedBuiltinIds
        deleteProxy(id) {
            const all = StorageManager.getProxies();
            const idx = all.findIndex(p => p.id === id);
            LOG('ProxyManager.deleteProxy: id=' + id + ', 找到索引=' + idx + ', 总数=' + all.length);
            if (idx === -1) return false;
            const deleted = all[idx];
            all.splice(idx, 1);
            StorageManager.setProxies(all);
            // 内置源记录删除，升级时不再自动恢复
            if (deleted.builtIn) {
                const deletedIds = StorageManager.getDeletedBuiltinIds();
                if (!deletedIds.includes(id)) {
                    deletedIds.push(id);
                    StorageManager.setDeletedBuiltinIds(deletedIds);
                }
            }
            LOG('ProxyManager.deleteProxy: 删除成功, 剩余=' + all.length);
            return true;
        },

        // 统一启用/禁用
        toggleProxy(id) {
            const all = StorageManager.getProxies();
            const idx = all.findIndex(p => p.id === id);
            if (idx === -1) return false;
            all[idx].enabled = !all[idx].enabled;
            StorageManager.setProxies(all);
            LOG('ProxyManager.toggleProxy: id=' + id + ', enabled=' + all[idx].enabled);
            return true;
        },

        // 恢复默认：清空删除记录，把缺失的内置源合并回，已编辑的重置
        restoreDefaults() {
            const all = StorageManager.getProxies();
            const existingIds = new Set(all.map(p => p.id));
            let restored = 0;
            BUILTIN_PROXIES.forEach(builtin => {
                if (!existingIds.has(builtin.id)) {
                    all.push(Object.assign({}, builtin, { edited: false }));
                    restored++;
                } else {
                    // 已存在的内置源重置为常量值（保留 enabled）
                    const idx = all.findIndex(p => p.id === builtin.id);
                    if (all[idx].builtIn) {
                        all[idx] = Object.assign({}, builtin, { edited: false, enabled: all[idx].enabled });
                    }
                }
            });
            StorageManager.setProxies(all);
            StorageManager.setDeletedBuiltinIds([]);
            LOG('ProxyManager.restoreDefaults: 恢复 ' + restored + ' 条内置源');
            return restored;
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
            // 自定义源优先，内置源补齐
            const all = this.getEnabled(type);
            const custom = all.filter(p => !p.builtIn);
            const builtin = all.filter(p => p.builtIn);
            const result = { pinned: [], overflow: [] };

            custom.forEach(p => result.pinned.push(p));
            const remaining = Math.max(0, maxDisplay - result.pinned.length);
            builtin.slice(0, remaining).forEach(p => result.pinned.push(p));
            builtin.slice(remaining).forEach(p => result.overflow.push(p));

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
        _scrollTopBtn: null,
        _timeObserver: null,

        injectCSS() {
            if (document.getElementById('ghhelper-css')) return;
            const style = document.createElement('style');
            style.id = 'ghhelper-css';
            style.textContent = `
.ghhelper-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important}
.ghhelper-left{min-width:0;flex:1 1 auto;display:flex;align-items:center;gap:6px;overflow:hidden}
.ghhelper-right{flex-shrink:0;display:flex;align-items:center;gap:8px}
.ghhelper-group-win{border-left:4px solid #0969da!important;background-color:rgba(9,105,218,0.1)!important}
.ghhelper-group-win:hover{background-color:rgba(9,105,218,0.15)!important}
.ghhelper-group-mac{border-left:4px solid #8250df!important;background-color:rgba(130,80,223,0.1)!important}
.ghhelper-group-mac:hover{background-color:rgba(130,80,223,0.15)!important}
.ghhelper-group-mobile{border-left:4px solid #1a7f37!important;background-color:rgba(26,127,55,0.1)!important}
.ghhelper-group-mobile:hover{background-color:rgba(26,127,55,0.15)!important}
.ghhelper-group-linux-deb{border-left:4px solid #bc4c00!important;background-color:rgba(188,76,0,0.1)!important}
.ghhelper-group-linux-deb:hover{background-color:rgba(188,76,0,0.15)!important}
.ghhelper-group-linux-rpm{border-left:4px solid #cf222e!important;background-color:rgba(207,34,46,0.1)!important}
.ghhelper-group-linux-rpm:hover{background-color:rgba(207,34,46,0.15)!important}
.ghhelper-group-linux-arch{border-left:4px solid #4263eb!important;background-color:rgba(66,99,235,0.1)!important}
.ghhelper-group-linux-arch:hover{background-color:rgba(66,99,235,0.15)!important}
.ghhelper-group-linux-appimage{border-left:4px solid #0a7b83!important;background-color:rgba(10,123,131,0.1)!important}
.ghhelper-group-linux-appimage:hover{background-color:rgba(10,123,131,0.15)!important}
.ghhelper-group-linux-flatpak{border-left:4px solid #bf3989!important;background-color:rgba(191,57,137,0.1)!important}
.ghhelper-group-linux-flatpak:hover{background-color:rgba(191,57,137,0.15)!important}
.ghhelper-group-linux-ipk{border-left:4px solid #1a7f37!important;background-color:rgba(26,127,55,0.1)!important}
.ghhelper-group-linux-ipk:hover{background-color:rgba(26,127,55,0.15)!important}
.ghhelper-group-linux-snap{border-left:4px solid #4263eb!important;background-color:rgba(66,99,235,0.1)!important}
.ghhelper-group-linux-snap:hover{background-color:rgba(66,99,235,0.15)!important}
.ghhelper-group-linux-other{border-left:4px solid #7d4e00!important;background-color:rgba(125,78,0,0.1)!important}
.ghhelper-group-linux-other:hover{background-color:rgba(125,78,0,0.15)!important}
.ghhelper-group-other{border-left:4px solid transparent!important}
.ghhelper-platform-tag{background-color:transparent!important;display:inline-block;font-size:11px;padding:1px 6px;border:1px solid;border-radius:10px;margin-right:4px}
.ghhelper-tag-windows{color:#0969da!important;border-color:#0969da!important}
.ghhelper-tag-mac{color:#8250df!important;border-color:#8250df!important}
.ghhelper-tag-android{color:#1a7f37!important;border-color:#1a7f37!important}
.ghhelper-tag-ios{color:#1a7f37!important;border-color:#1a7f37!important}
.ghhelper-tag-linux-deb{color:#bc4c00!important;border-color:#bc4c00!important}
.ghhelper-tag-linux-rpm{color:#cf222e!important;border-color:#cf222e!important}
.ghhelper-tag-linux-arch{color:#4263eb!important;border-color:#4263eb!important}
.ghhelper-tag-linux-appimage{color:#0a7b83!important;border-color:#0a7b83!important}
.ghhelper-tag-linux-flatpak{color:#bf3989!important;border-color:#bf3989!important}
.ghhelper-tag-linux-ipk{color:#1a7f37!important;border-color:#1a7f37!important}
.ghhelper-tag-linux-snap{color:#4263eb!important;border-color:#4263eb!important}
.ghhelper-tag-linux-other{color:#7d4e00!important;border-color:#7d4e00!important}
.ghhelper-proxy-container{display:inline-flex;align-items:center;flex-shrink:0;margin-left:8px;gap:4px}
.ghhelper-proxy-dropdown{position:relative;display:inline-flex;align-items:center}
.ghhelper-proxy-dropdown::after{content:"";position:absolute;top:100%;left:0;right:0;height:8px;z-index:998}
.ghhelper-proxy-btn{display:inline-flex;align-items:center;padding:2px 8px;font-size:11px;font-weight:500;border:1px solid var(--borderColor-default,var(--color-border-default,#30363d));border-radius:6px;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;text-decoration:none!important;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis}
.ghhelper-proxy-btn:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d));text-decoration:none!important;color:var(--button-default-fgColor-hover,var(--color-btn-hover-text,#c9d1d9))!important}
.ghhelper-proxy-dropdown-menu{display:none;position:absolute;right:0;top:100%;z-index:999;min-width:80px;padding:4px 0;margin-top:4px;background-color:var(--overlay-bgColor,var(--color-canvas-overlay));border:1px solid var(--borderColor-default,var(--color-border-default));border-radius:6px;box-shadow:var(--shadow-floating-large,0 8px 24px rgba(140,149,159,0.2))}
.ghhelper-proxy-dropdown:hover .ghhelper-proxy-dropdown-menu{display:block}
.ghhelper-proxy-menu-item{display:block!important;padding:4px 16px!important;margin:0!important;border:none!important;border-radius:0!important;background:transparent!important;color:var(--fgColor-default,var(--color-fg-default))!important;text-decoration:none!important;font-size:12px!important;text-align:center!important;line-height:1.5!important;white-space:nowrap}
.ghhelper-proxy-menu-item:hover{background-color:var(--controlAction-bgColor-hover,var(--color-action-list-item-default-hover-bg))!important;text-decoration:none!important}
.ghhelper-os-select,.ghhelper-arch-select{appearance:auto;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));border:1px solid var(--button-default-borderColor-rest,var(--color-btn-border,rgba(240,246,252,0.1)));border-radius:6px;color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;font-size:12px;font-weight:500;line-height:20px;padding:3px 8px;margin-left:8px}
.ghhelper-os-select:hover,.ghhelper-arch-select:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-meta-wrapper>summary{cursor:pointer;padding:8px 16px;font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted,#8b949e));border-top:1px solid var(--borderColor-muted,var(--color-border-muted,#30363d))}
.ghhelper-meta-wrapper>summary:hover{color:var(--fgColor-default,var(--color-fg-default,#e6edf3))}
.ghhelper-notes-wrap{border:1px solid var(--color-border-default,#30363d);border-radius:8px;margin:8px 0;overflow:hidden}
.ghhelper-notes-wrap>summary{display:flex;align-items:center;gap:8px;padding:10px 16px;cursor:pointer;list-style:none;background-color:var(--color-canvas-subtle,#161b22);font-size:14px}
.ghhelper-notes-wrap>summary::-webkit-details-marker{display:none}
.ghhelper-notes-wrap>summary:hover{background-color:var(--color-canvas-inset,#010409)}
.ghhelper-notes-arrow{display:inline-block;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid currentColor;transition:transform 0.12s ease}
.ghhelper-notes-wrap[open]>.ghhelper-notes-arrow{transform:rotate(180deg)}
.ghhelper-notes-icon{color:var(--color-fg-muted,#8b949e)}
.ghhelper-notes-title{font-weight:600;color:var(--color-fg-default,#e6edf3)}
.ghhelper-notes-version{display:inline-block;padding:1px 8px;font-size:11px;border-radius:10px;background-color:var(--color-success-subtle,rgba(26,127,55,0.15));color:var(--color-success-fg,#1a7f37);border:1px solid var(--color-success-emphasis,#1a7f37)}
.ghhelper-notes-date{color:var(--color-fg-muted,#8b949e);font-size:12px;margin-left:auto}
.ghhelper-notes-body{padding:0 16px}
.ghhelper-version-section{border-top:1px solid var(--color-border-muted,#21262d);margin-top:8px}
.ghhelper-version-section>summary{display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;list-style:none;color:var(--color-fg-muted,#8b949e);font-size:13px}
.ghhelper-version-section>summary::-webkit-details-marker{display:none}
.ghhelper-version-section>summary:hover{color:var(--color-fg-default,#e6edf3)}
.ghhelper-version-line{flex:1;height:1px;background-color:var(--color-border-muted,#21262d)}
.ghhelper-version-toggle{font-size:11px}
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
.ghhelper-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;font-size:11px;border-radius:10px;cursor:pointer;border:1px solid var(--color-border-default,#30363d);background-color:var(--color-btn-bg,#21262d);color:var(--color-fg-muted,#8b949e);user-select:none;transition:all 0.15s}
.ghhelper-chip:hover{color:var(--color-fg-default,#e6edf3);border-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-chip.ghhelper-chip-active{background-color:var(--color-accent-emphasis,#1f6feb);color:#fff;border-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-chip-count{font-size:10px;opacity:0.85}
.ghhelper-chip-group{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.ghhelper-chip-separator{width:1px;height:14px;background-color:var(--color-border-default,#30363d);margin:0 4px}
.ghhelper-group-header{display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;user-select:none;border-bottom:1px solid var(--color-border-muted,#21262d)}
.ghhelper-group-header:hover{color:var(--color-fg-default,#e6edf3)}
.ghhelper-group-arrow{display:inline-block;width:0;height:0;border-left:4px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform 0.15s}
.ghhelper-group-arrow.ghhelper-group-arrow-open{transform:rotate(90deg)}
.ghhelper-group-title{font-weight:600;font-size:13px;color:var(--color-fg-default,#e6edf3)}
.ghhelper-group-count{font-size:11px;color:var(--color-fg-muted,#8b949e)}
.ghhelper-group-enabled{font-size:11px;color:var(--color-fg-muted,#8b949e);margin-left:auto}
.ghhelper-group-empty .ghhelper-group-title{color:var(--color-fg-muted,#8b949e);opacity:0.6}
.ghhelper-group-body{padding:4px 0}
.ghhelper-group-body.ghhelper-group-collapsed{display:none}
.ghhelper-proxy-card{border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:10px 12px;margin-bottom:6px}
.ghhelper-proxy-card-row1{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.ghhelper-proxy-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ghhelper-proxy-name{font-weight:600;font-size:13px;flex:1;min-width:0}
.ghhelper-proxy-tags{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.ghhelper-proxy-tag{font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid var(--color-border-default,#30363d);color:var(--color-fg-muted,#8b949e)}
.ghhelper-proxy-tag-builtin{color:var(--color-accent-fg,#58a6ff);border-color:var(--color-accent-emphasis,#1f6feb)}
.ghhelper-proxy-tag-custom{color:var(--color-success-fg,#1a7f37);border-color:var(--color-success-emphasis,#1a7f37)}
.ghhelper-proxy-modified{font-size:10px;padding:1px 6px;border-radius:8px;background-color:rgba(210,153,34,0.15);color:#d29922;border:1px solid #d29922}
.ghhelper-proxy-actions{display:flex;gap:4px;align-items:center;margin-left:auto}
.ghhelper-proxy-url{font-size:11px;color:var(--color-fg-muted,#8b949e);word-break:break-all;margin-bottom:4px}
.ghhelper-proxy-desc{font-size:11px;color:var(--color-fg-muted,#8b949e)}
.ghhelper-proxy-form{border:1px solid var(--color-accent-emphasis,#1f6feb);background-color:var(--color-canvas-subtle,#161b22);border-radius:8px;padding:12px;margin-bottom:6px}
.ghhelper-proxy-form-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ghhelper-proxy-form-title{font-weight:600;font-size:13px;color:var(--color-accent-fg,#58a6ff);flex:1}
.ghhelper-proxy-form-close{background:none;border:none;color:var(--color-fg-muted,#8b949e);cursor:pointer;font-size:16px;padding:0;line-height:1}
.ghhelper-proxy-form-close:hover{color:var(--color-fg-default,#e6edf3)}
.ghhelper-proxy-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:8px}
.ghhelper-proxy-form-field{display:flex;flex-direction:column;gap:2px}
.ghhelper-proxy-form-field-full{grid-column:1/3}
.ghhelper-proxy-form-label{font-size:11px;color:var(--color-fg-muted,#8b949e)}
.ghhelper-proxy-form-error{font-size:11px;color:var(--color-danger-fg,#f85149);margin-top:2px}
.ghhelper-proxy-form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--color-border-muted,#21262d)}
.ghhelper-search-row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
.ghhelper-search-input{flex:1}
.ghhelper-search-clear{background:none;border:none;color:var(--color-fg-muted,#8b949e);cursor:pointer;padding:4px 8px;font-size:14px}
.ghhelper-search-clear:hover{color:var(--color-fg-default,#e6edf3)}
.ghhelper-status-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--color-fg-muted,#8b949e);margin-bottom:8px;padding:4px 0;border-bottom:1px solid var(--color-border-muted,#21262d)}
.ghhelper-status-actions{display:flex;gap:8px}
.ghhelper-status-action{background:none;border:none;color:var(--color-accent-fg,#58a6ff);cursor:pointer;font-size:11px;padding:0;text-decoration:underline}
.ghhelper-status-action:hover{color:var(--color-accent-muted,#58a6ff)}
.ghhelper-empty-hint{text-align:center;padding:20px;color:var(--color-fg-muted,#8b949e);font-size:12px}
.ghhelper-input{padding:4px 8px;font-size:12px;border:1px solid var(--color-border-default,#30363d);border-radius:6px;background-color:var(--color-canvas-default,#0d1117);color:var(--fgColor-default,var(--color-fg-default));width:100%;box-sizing:border-box}
.ghhelper-select{padding:4px 8px;font-size:12px;border:1px solid var(--color-border-default,#30363d);border-radius:6px;background-color:var(--color-canvas-default,#0d1117);color:var(--fgColor-default,var(--color-fg-default))}
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
            if (details.dataset.ghhelperProcessed === 'true') {
                // 已处理过：若 details 已展开，强制刷新分组/着色/加速按钮
                // 应对首次进入已展开 Release 但内容尚未加载完成、重试时被 processed 跳过的场景
                if (details.open) {
                    if (StorageManager.isFeatureEnabled('groupAndSort')) this.formatAndSortUI(details, true);
                    if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(details);
                }
                return;
            }

            const repoInfo = this.getRepoInfo();
            if (!repoInfo) { WARN('  processReleaseBox 跳过: 无 repoInfo'); return; }
            const tagName = this.findTagName(details);
            if (!tagName) { WARN('  processReleaseBox 跳过: 未找到 tagName'); return; }
            LOG('  processReleaseBox 成功, tagName:', tagName);

            const summary = details.querySelector('summary');
            if (!summary) { WARN('  processReleaseBox 跳过: 无 summary'); return; }

            details.dataset.ghhelperProcessed = 'true';
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
                    LOG('  OS 选择器 change: ' + osSel.value);
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
                    LOG('  架构选择器 change: ' + archSel.value);
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

            let retryTimer = null;
            let isRefreshing = false;

            // 判断一次 mutation 是否由脚本自身元素引起
            const isScriptMutation = (mutations) => {
                return Array.from(mutations).every(m => {
                    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
                    if (!nodes.length) return true; // 属性变化等也忽略
                    return nodes.every(n => {
                        if (n.nodeType !== 1) return true;
                        return n.hasAttribute('data-ghhelper-element') || n.closest('[data-ghhelper-element]') || n.querySelector('[data-ghhelper-element]');
                    });
                });
            };

            const refresh = (mutations) => {
                if (!details.open || isRefreshing) return;
                if (mutations && isScriptMutation(mutations)) {
                    LOG('  refresh 跳过: 仅脚本自身元素变化');
                    return;
                }
                isRefreshing = true;
                LOG('  refresh details 内容, groupAndSort=' + StorageManager.isFeatureEnabled('groupAndSort') + ', proxyButtons=' + StorageManager.isFeatureEnabled('proxyButtons'));
                if (StorageManager.isFeatureEnabled('groupAndSort')) this.formatAndSortUI(details);
                if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(details);
                isRefreshing = false;

                // 如果展开后还没有下载链接，延迟重试（GitHub 异步加载）
                const hasLinks = details.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                if (!hasLinks && !retryTimer) {
                    retryTimer = setTimeout(() => {
                        retryTimer = null;
                        LOG('  refresh 延迟重试');
                        refresh(null);
                    }, 800);
                }
            };

            details.addEventListener('toggle', () => {
                LOG('  toggle 事件触发, details.open=' + details.open);
                if (details.open) refresh(null);
            });

            // GitHub 的 Assets 内容是动态加载的，需要监听子树变化
            const observer = new MutationObserver((mutations) => {
                if (isRefreshing) return;
                LOG('  details MutationObserver 触发, open=' + details.open + ', mutations=' + mutations.length);
                if (details.open) refresh(mutations);
            });
            observer.observe(details, { childList: true, subtree: true });
            LOG('  details MutationObserver 已绑定');

            // 若 details 已展开，立即执行一次 refresh
            // 否则首次进入已展开的 Release 时，需等 toggle/mutation 才会触发分组与着色
            if (details.open) {
                LOG('  details 已展开，立即执行首次 refresh');
                refresh(null);
            }
        },

        formatAndSortUI(detailsElem, force) {
            const validRows = Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]'));
            LOG('    formatAndSortUI: 有效行数=' + validRows.length + ', force=' + !!force + ', 上次计数=' + detailsElem.dataset.ghhelperVRCount);
            if (!validRows.length) return;
            const prev = parseInt(detailsElem.dataset.ghhelperVRCount || '0');
            if (!force && validRows.length === prev) {
                LOG('    formatAndSortUI: 行数未变，跳过');
                return;
            }
            detailsElem.dataset.ghhelperVRCount = validRows.length;

            // 幂等清理：移除所有旧 wrapper，把内部 li 还原回真实 parent，防止重复折叠
            // 必须在收集 validRows 之后、计算 parent 之前执行，确保 parent 指向真实容器
            const parentForCleanup = detailsElem.querySelector('ul, .Box-body, div') || detailsElem;
            parentForCleanup.querySelectorAll('[data-ghhelper-wrapper="1"]').forEach(w => {
                w.querySelectorAll('li').forEach(li => parentForCleanup.appendChild(li));
                w.remove();
            });

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
                    mc.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;margin-left:6px;flex-wrap:wrap;gap:4px;vertical-align:middle';
                    const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]');
                    if (nl && nl.parentNode) {
                        nl.parentNode.insertBefore(mc, nl.nextSibling);
                    } else {
                        const leftSection = row.querySelector('.col-lg-6') || row.querySelector('.col-md-8') || row.querySelector('[class*="col-"]:not(.flex-justify-end)');
                        if (leftSection) leftSection.appendChild(mc);
                        else row.appendChild(mc);
                    }
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
            // 收集所有签名/校验/增量文件，统一放入一个折叠区
            const allAux = [];
            const flush = () => {
                if (!seg.length) return;
                seg.forEach(r => {
                    const n = r._ghn ? this.getFileNameFromLink(r._ghn) : '';
                    if (SortEngine.isSignatureFile(n)) {
                        allAux.push(r);
                    } else {
                        parent.appendChild(r);
                        style(r);
                    }
                });
                seg = [];
            };

            normal.forEach(r => { if (r._ghg.id !== gid) flush(); gid = r._ghg.id; seg.push(r); });
            flush();

            // meta 组（attestations 等）也归入签名折叠区，统一为一个 wrapper
            meta.forEach(r => allAux.push(r));

            if (allAux.length) {
                const w = document.createElement('details');
                w.setAttribute('data-ghhelper-wrapper', '1');
                w.setAttribute('data-ghhelper-element', '1');
                w.setAttribute('data-ghhelper-nt', '1');
                w.className = 'ghhelper-meta-wrapper';
                const s = document.createElement('summary');
                s.textContent = '签名 / 校验 (' + allAux.length + ')';
                w.appendChild(s);
                allAux.forEach(r => { w.appendChild(r); style(r); });
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
                        if (rs) rs.appendChild(mc); else row.appendChild(mc);
                    }
                    mc.appendChild(cs);
                });
        },

        processProxyButtons(detailsElem) {
            const rows = Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]'));
            LOG('    processProxyButtons: 有效行数=' + rows.length);
            if (!rows.length) return;

            const disp = ProxyManager.getDisplayProxies('download');
            const all = [...disp.pinned, ...disp.overflow];
            if (!all.length) { LOG('    processProxyButtons: 无可用加速源'); return; }

            rows.forEach(row => {
                const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                if (!nl) return;
                const href = nl.getAttribute('href');
                if (!href) return;

                const fn = this.getFileNameFromLink(nl);
                let container = row.querySelector('[data-ghhelper-proxy]');
                const prevCount = container ? parseInt(container.dataset.proxyCount || '0') : 0;
                if (container && prevCount === all.length) {
                    LOG('    processProxyButtons: ' + fn + ' 加速源数量未变，跳过');
                    return;
                }
                if (container) container.remove();

                container = document.createElement('span');
                container.setAttribute('data-ghhelper-proxy', '1');
                container.setAttribute('data-ghhelper-element', '1');
                container.setAttribute('data-ghhelper-nt', '1');
                container.className = 'ghhelper-proxy-container';
                container.dataset.proxyCount = String(all.length);

                // 优先展示前 N 个为独立按钮，其余收入下拉
                const maxDisplay = StorageManager.getMaxDisplay();
                const maxPinned = Math.min(all.length, Math.max(1, maxDisplay - 1));
                const pinned = all.slice(0, maxPinned);
                const overflow = all.slice(maxPinned);

                pinned.forEach(p => {
                    const url = ProxyManager.buildUrl(p, href, 'download');
                    const btn = document.createElement('a');
                    btn.className = 'ghhelper-proxy-btn';
                    btn.href = url; btn.target = '_blank'; btn.rel = 'noopener noreferrer';
                    btn.textContent = p.name;
                    btn.title = (p.desc || '') + (p.region ? ' [' + p.region + ']' : '');
                    container.appendChild(btn);
                });

                if (overflow.length) {
                    const dd = document.createElement('span');
                    dd.className = 'ghhelper-proxy-dropdown';
                    const db = document.createElement('a');
                    db.className = 'ghhelper-proxy-btn'; db.textContent = '加速 ▼';
                    db.href = 'javascript:void(0)';
                    const dm = document.createElement('div');
                    dm.className = 'ghhelper-proxy-dropdown-menu';
                    overflow.forEach(p => {
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

                const rightSection = row.querySelector('.col-md-6') || row.querySelector('.flex-auto.flex-justify-end') || row.querySelector('[class*="col-"]') || row.querySelector('[class*="flex-auto"]');
                if (rightSection) rightSection.appendChild(container);
                else row.appendChild(container);

                LOG('    processProxyButtons: 已为 ' + fn + ' 添加加速按钮, 总数=' + all.length + ', 平铺=' + pinned.length + ', 下拉=' + overflow.length);
                const xb = row.querySelector('.XIU2-RS');
                if (xb) xb.style.display = 'none';
            });
        },

        reprocessAll() {
            const targets = document.querySelectorAll('details[data-ghhelper-processed="true"]');
            LOG('  reprocessAll 调用, 已处理 details 数:', targets.length);
            targets.forEach(d => {
                d.dataset.ghhelperVRCount = '0';
                if (d.open) {
                    this.formatAndSortUI(d, true);
                    if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(d);
                }
            });
        },

        findTagName(detailsElem) {
            const m = window.location.pathname.match(/\/releases\/tag\/([^/?]+)/);
            if (m) { LOG('    findTagName: 从URL匹配到:', m[1]); return decodeURIComponent(m[1]); }

            // 尝试从最近父级容器中查找 tag 链接
            const selectors = [
                'section,.Box,.js-details-container,div[data-test-selector="release-card"]',
                '[class*="release"]',
                '.Box-row',
                'article'
            ];
            for (const sel of selectors) {
                const c = detailsElem.closest(sel);
                if (!c) continue;
                const tl = c.querySelector('a[href*="/releases/tag/"],a[href*="/tag/"]');
                if (tl) {
                    LOG('    findTagName: 通过选择器 "' + sel + '" 找到 tag 链接:', tl.getAttribute('href'));
                    const m2 = tl.getAttribute('href').match(/\/(?:releases\/)?tag\/([^/?]+)/);
                    if (m2) { LOG('    findTagName: 匹配到:', m2[1]); return decodeURIComponent(m2[1]); }
                }
            }

            // 兜底：从页面标题中提取
            const titleEl = document.querySelector('[data-test-selector="release-card"] a[href*="/releases/tag/"], [data-view-component="true"] a[href*="/releases/tag/"]');
            if (titleEl) {
                const m3 = titleEl.getAttribute('href').match(/\/(?:releases\/)?tag\/([^/?]+)/);
                if (m3) { LOG('    findTagName: 页面兜底匹配到:', m3[1]); return decodeURIComponent(m3[1]); }
            }

            WARN('    findTagName: 所有方法均未找到 tagName, pathname:', window.location.pathname);
            return null;
        },

        processReleaseNotes() {
            // HTML 转义辅助，避免 innerHTML 拼接时被解析为标签
            const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

            document.querySelectorAll('.markdown-body.tmp-my-3:not([data-ghhelper-notes-processed])').forEach(el => {
                el.setAttribute('data-ghhelper-notes-processed', '1');

                // 提取版本号
                const m = window.location.pathname.match(/\/releases\/tag\/([^/?]+)/);
                const version = m ? decodeURIComponent(m[1]) : '';

                // 提取日期（限定到 release 容器内，避免匹配页面其他 time 元素）
                let dateStr = '';
                const releaseCard = el.closest('[data-test-selector="release-card"]') || el.closest('.release') || el.closest('.Box');
                const timeEl = releaseCard ? releaseCard.querySelector('relative-time, time[datetime]') : null;
                if (timeEl) {
                    const dt = timeEl.getAttribute('datetime');
                    if (dt) {
                        const d = new Date(dt);
                        if (!isNaN(d.getTime())) {
                            const pad = n => String(n).padStart(2, '0');
                            dateStr = pad(d.getMonth() + 1) + '-' + pad(d.getDate());
                        }
                    }
                }

                // 多版本分段：检测 h1 数量
                const h1s = Array.from(el.querySelectorAll('h1'));
                const hasMultiVersions = h1s.length >= 2;

                // 创建外层 details
                const wrap = document.createElement('details');
                wrap.setAttribute('data-ghhelper-notes-wrap', '1');
                wrap.setAttribute('data-ghhelper-element', '1');
                wrap.setAttribute('data-ghhelper-nt', '1');
                wrap.className = 'ghhelper-notes-wrap';
                wrap.setAttribute('open', 'open');

                // summary
                const summary = document.createElement('summary');
                summary.setAttribute('data-ghhelper-nt', '1');
                summary.innerHTML = '<span class="ghhelper-notes-arrow"></span>' +
                    '<span class="ghhelper-notes-icon">📖</span>' +
                    '<span class="ghhelper-notes-title">更新日志</span>' +
                    (version ? '<span class="ghhelper-notes-version">' + escapeHtml(version) + '</span>' : '') +
                    (dateStr ? '<span class="ghhelper-notes-date">' + dateStr + '</span>' : '');
                wrap.appendChild(summary);

                // body 容器
                const body = document.createElement('div');
                body.className = 'ghhelper-notes-body';
                body.setAttribute('data-ghhelper-nt', '1');

                if (hasMultiVersions) {
                    // 分段：用 details 包裹每个 h1 到下一个 h1 之间内容
                    const children = Array.from(el.childNodes);
                    let currentSection = null;
                    children.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === 'H1') {
                            // 开启新版本段
                            currentSection = document.createElement('details');
                            currentSection.setAttribute('data-ghhelper-element', '1');
                            currentSection.setAttribute('data-ghhelper-nt', '1');
                            currentSection.className = 'ghhelper-version-section';
                            currentSection.setAttribute('open', 'open');
                            const s = document.createElement('summary');
                            s.setAttribute('data-ghhelper-nt', '1');
                            s.innerHTML = '<span>📌 ' + escapeHtml((node.textContent || '').trim()) + '</span>' +
                                '<span class="ghhelper-version-line"></span>' +
                                '<span class="ghhelper-version-toggle">收起 ▲</span>';
                            currentSection.appendChild(s);
                            body.appendChild(currentSection);
                        } else if (currentSection) {
                            currentSection.appendChild(node);
                        } else {
                            body.appendChild(node);
                        }
                    });
                } else {
                    // 不分段，原样移入
                    while (el.firstChild) body.appendChild(el.firstChild);
                }

                wrap.appendChild(body);
                el.parentNode.insertBefore(wrap, el.nextSibling);
                el.style.display = 'none';
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
            LOG('SettingsPanel.show 调用');
            if (this._overlay) {
                this._overlay.style.display = 'flex';
                this.renderTab(this._activeTab);
                return;
            }
            this._overlay = this.create();
            LOG('SettingsPanel overlay 创建完成, 追加到 body');
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

        _getGroupsCollapsed() {
            const def = { download: false, raw: true, clone: true, ssh: true };
            try {
                const val = StorageManager.get(STORAGE_KEYS.groupsCollapsed, def);
                // 合并默认值，确保所有 key 都存在
                return Object.assign({}, def, val || {});
            } catch (e) {
                ERR('SettingsPanel._getGroupsCollapsed 异常:', e);
                return def;
            }
        },

        _setGroupsCollapsed(state) {
            try {
                StorageManager.set(STORAGE_KEYS.groupsCollapsed, state);
            } catch (e) {
                ERR('SettingsPanel._setGroupsCollapsed 异常:', e);
            }
        },

        _toggleGroup(type) {
            const state = this._getGroupsCollapsed();
            state[type] = !state[type];
            this._setGroupsCollapsed(state);
            // 只重渲分组区块，不重建整个 Tab
            this._renderGroups();
        },

        _getDefaultFilterState() {
            return {
                keyword: '',
                type: 'all',        // 'all' | 'download' | 'raw' | 'clone' | 'ssh'
                source: 'all',      // 'all' | 'builtin' | 'custom'
                status: 'all',      // 'all' | 'enabled' | 'disabled'
                modified: false     // true 时只显示 edited && builtIn 的源
            };
        },

        _getFilterState() {
            if (!this._filterState) this._filterState = this._getDefaultFilterState();
            return this._filterState;
        },

        _setFilter(key, value) {
            const state = this._getFilterState();
            state[key] = value;
            // 只重渲 Chip 行与分组区块，不重建整个 Tab
            this._renderChipRow();
            this._renderGroups();
        },

        _applyFilters(all) {
            const state = this._getFilterState();
            const kw = state.keyword.trim().toLowerCase();
            return all.filter(p => {
                // 关键词：名称/URL/地区/备注 任一包含
                if (kw) {
                    const haystack = [
                        p.name || '', p.url || '', p.region || '', p.desc || ''
                    ].join(' ').toLowerCase();
                    if (!haystack.includes(kw)) return false;
                }
                // 类型
                if (state.type !== 'all' && p.type !== state.type) return false;
                // 来源
                if (state.source === 'builtin' && !p.builtIn) return false;
                if (state.source === 'custom' && p.builtIn) return false;
                // 状态
                if (state.status === 'enabled' && !p.enabled) return false;
                if (state.status === 'disabled' && p.enabled) return false;
                // 已修改
                if (state.modified && !(p.builtIn && p.edited)) return false;
                return true;
            });
        },

        _computeChipCounts(all) {
            // 计算各 Chip 在"当前搜索关键词 + 其他维度筛选"下的计数
            // 实现方式：固定当前其他维度，切换当前维度算 count
            const state = this._getFilterState();
            const kw = state.keyword.trim().toLowerCase();
            const baseFiltered = all.filter(p => {
                if (kw) {
                    const haystack = [
                        p.name || '', p.url || '', p.region || '', p.desc || ''
                    ].join(' ').toLowerCase();
                    if (!haystack.includes(kw)) return false;
                }
                return true;
            });
            const countWith = (overrides) => {
                const s = Object.assign({}, state, overrides);
                return baseFiltered.filter(p => {
                    if (s.type !== 'all' && p.type !== s.type) return false;
                    if (s.source === 'builtin' && !p.builtIn) return false;
                    if (s.source === 'custom' && p.builtIn) return false;
                    if (s.status === 'enabled' && !p.enabled) return false;
                    if (s.status === 'disabled' && p.enabled) return false;
                    if (s.modified && !(p.builtIn && p.edited)) return false;
                    return true;
                }).length;
            };
            return {
                type: {
                    all: countWith({ type: 'all' }),
                    download: countWith({ type: 'download' }),
                    raw: countWith({ type: 'raw' }),
                    clone: countWith({ type: 'clone' }),
                    ssh: countWith({ type: 'ssh' })
                },
                source: {
                    all: countWith({ source: 'all' }),
                    builtin: countWith({ source: 'builtin' }),
                    custom: countWith({ source: 'custom' })
                },
                status: {
                    all: countWith({ status: 'all' }),
                    enabled: countWith({ status: 'enabled' }),
                    disabled: countWith({ status: 'disabled' })
                },
                modified: countWith({ modified: true })
            };
        },

        _escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        },

        renderProxyTab(body) {
            const all = StorageManager.getProxies();
            const enabledCount = all.filter(p => p.enabled).length;
            const disabledCount = all.length - enabledCount;

            let html = '<div class="ghhelper-settings-section" data-ghhelper-nt="1">';
            html += '<div data-ghhelper-nt="1" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
            html += '<h4 data-ghhelper-nt="1" style="margin:0">加速源管理</h4>';
            html += '<div data-ghhelper-nt="1" style="display:flex;gap:8px">';
            html += '<button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-add-proxy" data-ghhelper-nt="1">+ 添加</button>';
            html += '<button class="ghhelper-btn" id="ghhelper-restore-defaults" data-ghhelper-nt="1">↻ 恢复默认</button>';
            html += '</div></div>';

            // 筛选器
            html += '<div data-ghhelper-nt="1" style="display:flex;gap:8px;margin-bottom:12px;font-size:12px;align-items:center">';
            html += '<span data-ghhelper-nt="1">类型:</span><select class="ghhelper-select" id="ghhelper-filter-type" data-ghhelper-nt="1">';
            html += '<option value="all">全部</option><option value="download">下载</option><option value="raw">Raw</option><option value="clone">Clone</option><option value="ssh">SSH</option></select>';
            html += '<span data-ghhelper-nt="1">状态:</span><select class="ghhelper-select" id="ghhelper-filter-status" data-ghhelper-nt="1">';
            html += '<option value="all">全部</option><option value="enabled">启用</option><option value="disabled">禁用</option></select>';
            html += '<span id="ghhelper-proxy-count" data-ghhelper-nt="1" style="margin-left:auto;color:var(--fgColor-muted,var(--color-fg-muted))">启用 ' + enabledCount + ' / 禁用 ' + disabledCount + '</span>';
            html += '</div>';

            // 列表
            html += '<div id="ghhelper-proxy-list" data-ghhelper-nt="1"></div>';

            // 最大显示数量
            html += '<div data-ghhelper-nt="1" style="margin-top:16px;display:flex;align-items:center;gap:8px">';
            html += '<span data-ghhelper-nt="1" style="font-size:13px">最大显示数量:</span>';
            html += '<select class="ghhelper-select" id="ghhelper-max-display" data-ghhelper-nt="1">';
            [4, 5, 6, 7, 8, 9, 10].forEach(n => {
                html += '<option value="' + n + '" ' + (StorageManager.getMaxDisplay() === n ? 'selected' : '') + '>' + n + '</option>';
            });
            html += '</select>';
            html += '<span data-ghhelper-nt="1" style="font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted))">超出部分收入"加速 ▼"下拉菜单</span>';
            html += '</div></div>';

            body.innerHTML = html;

            this._renderProxyList();

            document.getElementById('ghhelper-add-proxy').addEventListener('click', () => this.showAddProxyForm(body));
            document.getElementById('ghhelper-restore-defaults').addEventListener('click', () => {
                if (confirm('将重新添加所有缺失的内置源，已编辑的内置源会被重置，确认？')) {
                    ProxyManager.restoreDefaults();
                    this.renderTab('proxies');
                    DOMRenderer.reprocessAll();
                }
            });
            document.getElementById('ghhelper-filter-type').addEventListener('change', () => this._renderProxyList());
            document.getElementById('ghhelper-filter-status').addEventListener('change', () => this._renderProxyList());
            document.getElementById('ghhelper-max-display').addEventListener('change', function () {
                StorageManager.setMaxDisplay(parseInt(this.value));
                DOMRenderer.reprocessAll();
            });
        },

        _renderProxyList() {
            const listEl = document.getElementById('ghhelper-proxy-list');
            if (!listEl) return;
            const all = StorageManager.getProxies();
            const filterType = document.getElementById('ghhelper-filter-type').value;
            const filterStatus = document.getElementById('ghhelper-filter-status').value;
            const filtered = all.filter(p => {
                if (filterType !== 'all' && p.type !== filterType && p.type !== 'all') return false;
                if (filterStatus === 'enabled' && !p.enabled) return false;
                if (filterStatus === 'disabled' && p.enabled) return false;
                return true;
            });

            let html = '';
            filtered.forEach(p => {
                const dotColor = p.enabled ? '#1a7f37' : '#6e7681';
                const typeBadge = p.type === 'all' ? '全部' : p.type;
                const sourceBadge = p.builtIn ? '内置' : '自定义';
                html += '<div class="ghhelper-proxy-card" data-ghhelper-nt="1" style="border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:10px 12px;margin-bottom:6px">';
                html += '<div data-ghhelper-nt="1" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
                html += '<span data-ghhelper-nt="1" style="width:8px;height:8px;border-radius:50%;background-color:' + dotColor + ';flex-shrink:0"></span>';
                html += '<span data-ghhelper-nt="1" style="font-weight:600;font-size:13px;flex:1;min-width:0">' + this._escapeHtml(p.name) + '</span>';
                html += '<span data-ghhelper-nt="1" class="Label" style="font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid">[' + typeBadge + ']</span>';
                if (p.region) html += '<span data-ghhelper-nt="1" style="font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted))">' + this._escapeHtml(p.region) + '</span>';
                html += '</div>';
                html += '<div data-ghhelper-nt="1" style="font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted));word-break:break-all;margin-bottom:6px">' + this._escapeHtml(p.url) + '</div>';
                if (p.desc) html += '<div data-ghhelper-nt="1" style="font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted));margin-bottom:6px">' + this._escapeHtml(p.desc) + '</div>';
                html += '<div data-ghhelper-nt="1" style="display:flex;align-items:center;gap:8px">';
                html += '<span data-ghhelper-nt="1" class="Label ' + (p.builtIn ? '' : 'Label--success') + '" style="font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid">' + sourceBadge + '</span>';
                html += '<label class="ghhelper-toggle" data-ghhelper-nt="1"><input type="checkbox" ' + (p.enabled ? 'checked' : '') + ' data-proxy-toggle="' + p.id + '"><span class="ghhelper-toggle-slider"></span></label>';
                html += '<button class="ghhelper-btn" data-proxy-edit="' + p.id + '" data-ghhelper-nt="1" style="margin-left:auto">编辑</button>';
                html += '<button class="ghhelper-btn ghhelper-btn-danger" data-proxy-delete="' + p.id + '" data-ghhelper-nt="1">删除</button>';
                html += '</div></div>';
            });
            if (!filtered.length) {
                html = '<div data-ghhelper-nt="1" style="text-align:center;padding:20px;color:var(--fgColor-muted,var(--color-fg-muted));font-size:12px">无匹配加速源</div>';
            }
            listEl.innerHTML = html;

            // 使用事件委托绑定事件，避免 DOM 重建或中文化插件遍历时事件丢失
            // 仅绑定一次（listEl 自身不会被 innerHTML 替换）
            if (!listEl.dataset.ghhelperDelegated) {
                listEl.dataset.ghhelperDelegated = '1';
                listEl.addEventListener('change', function (e) {
                    const cb = e.target.closest('input[data-proxy-toggle]');
                    if (!cb) return;
                    ProxyManager.toggleProxy(cb.dataset.proxyToggle);
                    DOMRenderer.reprocessAll();
                    // 仅刷新列表与计数，保留筛选器状态
                    SettingsPanel._renderProxyList();
                    SettingsPanel._refreshProxyCount();
                });
                listEl.addEventListener('click', function (e) {
                    const editBtn = e.target.closest('[data-proxy-edit]');
                    if (editBtn) {
                        SettingsPanel.showEditProxyForm(document.getElementById('ghhelper-body'), editBtn.dataset.proxyEdit);
                        return;
                    }
                    const delBtn = e.target.closest('[data-proxy-delete]');
                    if (!delBtn) return;
                    const id = delBtn.dataset.proxyDelete;
                    const proxy = StorageManager.getProxies().find(p => p.id === id);
                    const msg = proxy && proxy.builtIn
                        ? '删除内置源后可通过"恢复默认"找回，确认？'
                        : '确认删除此自定义加速源？';
                    if (confirm(msg)) {
                        ProxyManager.deleteProxy(id);
                        SettingsPanel._renderProxyList();
                        SettingsPanel._refreshProxyCount();
                        DOMRenderer.reprocessAll();
                    }
                });
            }
        },

        _refreshProxyCount() {
            const all = StorageManager.getProxies();
            const enabledCount = all.filter(p => p.enabled).length;
            const disabledCount = all.length - enabledCount;
            const countEl = document.getElementById('ghhelper-proxy-count');
            if (countEl) {
                countEl.textContent = '启用 ' + enabledCount + ' / 禁用 ' + disabledCount;
            }
        },

        showAddProxyForm(body) {
            // 清理已有表单（添加/编辑表单互斥）
            body.querySelectorAll('[data-ghhelper-element="1"]').forEach(el => el.remove());
            const form = document.createElement('div');
            form.setAttribute('data-ghhelper-nt', '1');
            form.setAttribute('data-ghhelper-element', '1');
            form.style.cssText = 'border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:12px;margin-bottom:12px';
            form.innerHTML = `
<p data-ghhelper-nt="1" style="margin:0 0 8px;font-weight:600">添加加速源</p>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-name" placeholder="名称" data-ghhelper-nt="1" style="margin-bottom:6px"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-url" placeholder="URL（如 https://example.com/https://github.com）" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><select class="ghhelper-select" id="ghhelper-new-type" data-ghhelper-nt="1">
  <option value="download">下载/ZIP</option><option value="raw">Raw</option><option value="clone">Clone</option><option value="ssh">SSH</option><option value="all">全部</option>
</select></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-desc" placeholder="备注（可选）" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-new-region" placeholder="地区（可选）" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="display:flex;gap:8px">
  <button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-save-proxy" data-ghhelper-nt="1">保存</button>
  <button class="ghhelper-btn" id="ghhelper-cancel-proxy" data-ghhelper-nt="1">取消</button>
</div>`;
            // 插入到代理列表之前（ghhelper-proxy-list 是 settings-section 的直接子节点）
            const listEl = document.getElementById('ghhelper-proxy-list');
            if (listEl && listEl.parentNode) {
                listEl.parentNode.insertBefore(form, listEl);
            } else {
                body.appendChild(form);
            }

            document.getElementById('ghhelper-save-proxy').addEventListener('click', () => {
                const name = document.getElementById('ghhelper-new-name').value.trim();
                const url = document.getElementById('ghhelper-new-url').value.trim();
                if (!name || !url) { alert('名称和 URL 必填'); return; }
                ProxyManager.addCustom({
                    name, url,
                    type: document.getElementById('ghhelper-new-type').value,
                    desc: document.getElementById('ghhelper-new-desc').value.trim(),
                    region: document.getElementById('ghhelper-new-region').value.trim()
                });
                SettingsPanel.renderTab('proxies');
                DOMRenderer.reprocessAll();
            });
            document.getElementById('ghhelper-cancel-proxy').addEventListener('click', () => {
                form.remove();
            });
        },

        showEditProxyForm(body, id) {
            const proxy = StorageManager.getProxies().find(p => p.id === id);
            if (!proxy) return;
            // 清理已有表单（添加/编辑表单互斥）
            body.querySelectorAll('[data-ghhelper-element="1"]').forEach(el => el.remove());
            const form = document.createElement('div');
            form.setAttribute('data-ghhelper-nt', '1');
            form.setAttribute('data-ghhelper-element', '1');
            form.style.cssText = 'border:1px solid var(--color-border-default,#30363d);border-radius:8px;padding:12px;margin-bottom:12px';
            form.innerHTML = `
<p data-ghhelper-nt="1" style="margin:0 0 8px;font-weight:600">编辑加速源</p>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-edit-name" value="${this._escapeHtml(proxy.name)}" data-ghhelper-nt="1" style="margin-bottom:6px"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-edit-url" value="${this._escapeHtml(proxy.url)}" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><select class="ghhelper-select" id="ghhelper-edit-type" data-ghhelper-nt="1">
  <option value="download" ${proxy.type === 'download' ? 'selected' : ''}>下载/ZIP</option>
  <option value="raw" ${proxy.type === 'raw' ? 'selected' : ''}>Raw</option>
  <option value="clone" ${proxy.type === 'clone' ? 'selected' : ''}>Clone</option>
  <option value="ssh" ${proxy.type === 'ssh' ? 'selected' : ''}>SSH</option>
  <option value="all" ${proxy.type === 'all' ? 'selected' : ''}>全部</option>
</select></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-edit-desc" value="${this._escapeHtml(proxy.desc || '')}" placeholder="备注（可选）" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="margin-bottom:6px"><input class="ghhelper-input" id="ghhelper-edit-region" value="${this._escapeHtml(proxy.region || '')}" placeholder="地区（可选）" data-ghhelper-nt="1"></div>
<div data-ghhelper-nt="1" style="display:flex;gap:8px">
  <button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-save-edit" data-ghhelper-nt="1">保存</button>
  <button class="ghhelper-btn" id="ghhelper-cancel-edit" data-ghhelper-nt="1">取消</button>
</div>`;
            // 插入到代理列表之前（ghhelper-proxy-list 是 settings-section 的直接子节点）
            const listElEdit = document.getElementById('ghhelper-proxy-list');
            if (listElEdit && listElEdit.parentNode) {
                listElEdit.parentNode.insertBefore(form, listElEdit);
            } else {
                body.appendChild(form);
            }

            document.getElementById('ghhelper-save-edit').addEventListener('click', () => {
                const name = document.getElementById('ghhelper-edit-name').value.trim();
                const url = document.getElementById('ghhelper-edit-url').value.trim();
                if (!name || !url) { alert('名称和 URL 必填'); return; }
                ProxyManager.editProxy(id, {
                    name, url,
                    type: document.getElementById('ghhelper-edit-type').value,
                    desc: document.getElementById('ghhelper-edit-desc').value.trim(),
                    region: document.getElementById('ghhelper-edit-region').value.trim()
                });
                SettingsPanel.renderTab('proxies');
                DOMRenderer.reprocessAll();
            });
            document.getElementById('ghhelper-cancel-edit').addEventListener('click', () => {
                form.remove();
            });
        },

        renderFeatureTab(body) {
            const items = [
                { key: 'groupAndSort', icon: '📁', label: '文件分组排序', desc: '按 OS/平台分组，当前系统优先排序', impact: 'Release 文件列表顺序与色块标记' },
                { key: 'downloadCount', icon: '📥', label: '显示下载量', desc: '从 GitHub API 获取每个文件的下载次数', impact: '文件行右侧显示下载量图标+数字' },
                { key: 'replaceTime', icon: '🕐', label: '精确时间替换', desc: '将"3天前"替换为"2026-07-13 14:30"', impact: '关闭以兼容中文化脚本，开启后两者可能冲突' },
                { key: 'collapsibleNotes', icon: '📖', label: '可折叠更新日志', desc: '将更新日志包进可折叠区域，多版本时支持分段折叠', impact: 'Release 标题下方显示"更新日志"折叠栏' },
                { key: 'proxyButtons', icon: '⚡', label: '加速下载按钮', desc: '在每个 Release 文件旁显示加速下载按钮', impact: '文件行右侧显示加速源按钮+下拉菜单' },
                { key: 'scrollToTop', icon: '↑', label: '回到顶部按钮', desc: '滚动超过 300px 后显示悬浮回到顶部按钮', impact: '页面右下角悬浮箭头按钮' }
            ];
            let html = '<div class="ghhelper-settings-section"><h4>功能开关</h4>';
            items.forEach(item => {
                const enabled = StorageManager.isFeatureEnabled(item.key);
                const badgeClass = DEFAULT_FEATURES[item.key] ? 'Label--success' : '';
                const badgeText = DEFAULT_FEATURES[item.key] ? '默认开启' : '默认关闭';
                html += '<div class="ghhelper-feature-card" data-ghhelper-nt="1" style="display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--color-border-default,#30363d);border-radius:8px;margin-bottom:8px">';
                html += '<span data-ghhelper-nt="1" style="font-size:18px;line-height:1.4">' + item.icon + '</span>';
                html += '<div data-ghhelper-nt="1" style="flex:1;min-width:0">';
                html += '<div data-ghhelper-nt="1" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
                html += '<span data-ghhelper-nt="1" style="font-weight:600;font-size:13px">' + item.label + '</span>';
                html += '<span data-ghhelper-nt="1" class="Label ' + badgeClass + '" style="font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid">' + badgeText + '</span>';
                html += '</div>';
                html += '<div data-ghhelper-nt="1" style="font-size:12px;color:var(--fgColor-default,var(--color-fg-default));margin-bottom:2px">' + item.desc + '</div>';
                html += '<div data-ghhelper-nt="1" style="font-size:11px;color:var(--fgColor-muted,var(--color-fg-muted))">影响：' + item.impact + '</div>';
                html += '</div>';
                html += '<label class="ghhelper-toggle" data-ghhelper-nt="1"><input type="checkbox" ' + (enabled ? 'checked' : '') + ' data-feature="' + item.key + '"><span class="ghhelper-toggle-slider"></span></label>';
                html += '</div>';
            });
            html += '</div>';
            body.innerHTML = html;

            body.querySelectorAll('input[data-feature]').forEach(cb => {
                cb.addEventListener('change', function () {
                    const f = StorageManager.getFeatures();
                    f[this.dataset.feature] = this.checked;
                    StorageManager.setFeatures(f);
                    // 触发重新处理
                    DOMRenderer.reprocessAll();
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
    <li><strong>可折叠更新日志</strong>：将更新日志包进可折叠区域，多版本时支持分段折叠（默认开启）</li>
    <li><strong>加速下载按钮</strong>：在每个 Release 文件旁显示加速下载按钮</li>
    <li><strong>回到顶部按钮</strong>：滚动超过 300px 后显示</li>
  </ul>
</div>
<div class="ghhelper-settings-section">
  <h4>加速源</h4>
  <p style="font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted))">
    所有加速源（内置+自定义）统一管理，支持编辑/删除/启用/禁用。内置源删除后可通过"恢复默认"找回。自定义源优先显示，内置源补齐到最大显示数量，超出部分放入"加速 ▼"下拉菜单。
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
    // 7. GM 菜单注册
    // ============================================================

    let _menuIds = [];

    function registerMenus() {
        LOG('registerMenus 调用, GM_registerMenuCommand 可用:', typeof GM_registerMenuCommand !== 'undefined');
        const features = StorageManager.getFeatures();
        const items = [
            { key: 'groupAndSort', label: '文件分组排序' },
            { key: 'downloadCount', label: '显示下载量' },
            { key: 'replaceTime', label: '精确时间替换' },
            { key: 'collapsibleNotes', label: '可折叠更新日志' },
            { key: 'proxyButtons', label: '加速下载按钮' },
            { key: 'scrollToTop', label: '回到顶部按钮' }
        ];
        items.forEach(item => {
            const id = GM_registerMenuCommand(
                (features[item.key] ? '✓ ' : '✗ ') + item.label,
                () => {
                    const f = StorageManager.getFeatures();
                    f[item.key] = !f[item.key];
                    StorageManager.setFeatures(f);
                    unregisterMenus();
                    registerMenus();
                }
            );
            _menuIds.push(id);
        });
        const id = GM_registerMenuCommand('打开设置面板', () => SettingsPanel.show());
        _menuIds.push(id);
    }

    function unregisterMenus() {
        _menuIds.forEach(id => GM_unregisterMenuCommand(id));
        _menuIds = [];
    }

    // ============================================================
    // 8. 中文化兼容层 (CompatibilityLayer)
    // ============================================================

    // 所有注入的 DOM 元素都标记了 data-ghhelper-nt="1"，
    // 中文化脚本的 traverseNode 函数会跳过这些元素（通过 reIgnoreClass 等规则）。
    // 此外，所有 CSS 类名使用 ghhelper- 前缀，避免与中文化脚本冲突。

    // ============================================================
    // 9. 初始化入口
    // ============================================================

    let _initRetryCount = 0;
    const MAX_RETRY = 5;
    const RETRY_DELAY = 800;

    function processAllDetails() {
        const pathname = window.location.pathname;
        LOG('processAllDetails 调用, pathname:', pathname);
        if (!/^\/[^/]+\/[^/]+\/releases/.test(pathname)) {
            LOG('  跳过: 非 releases 页面');
            return;
        }
        const repoInfo = DOMRenderer.getRepoInfo();
        if (!repoInfo) {
            WARN('  跳过: 无法获取 repoInfo');
            return;
        }
        LOG('  仓库:', repoInfo.owner + '/' + repoInfo.repo);

        if (StorageManager.isFeatureEnabled('collapsibleNotes')) {
            DOMRenderer.processReleaseNotes();
        }

        const detailsList = document.querySelectorAll('details');
        LOG('  发现 details 元素:', detailsList.length, '个');
        let assetCount = 0;
        detailsList.forEach(details => {
            // 跳过更新日志折叠区，避免误判为 Assets 容器
            if (details.hasAttribute('data-ghhelper-notes-wrap') || details.classList.contains('ghhelper-version-section')) return;
            const summary = details.querySelector('summary');
            const hasDownloadLink = !!details.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
            const isAssetsByText = summary && /Assets|资源|资产/i.test(summary.textContent);
            if (hasDownloadLink || isAssetsByText) {
                assetCount++;
                LOG('  处理 Assets details, hasDownloadLink=' + hasDownloadLink + ', isAssetsByText=' + isAssetsByText + ', 已处理标记:', details.dataset.ghhelperProcessed);
                DOMRenderer.processReleaseBox(details);
            }
        });
        LOG('  匹配到 Assets 的 details:', assetCount, '个');
    }

    function init() {
        LOG('init 调用, 重试次数:', _initRetryCount, 'pathname:', window.location.pathname);
        // 初始化加速源存储（首次写入种子，升级合并）
        StorageManager.initProxies();
        DOMRenderer.injectCSS();
        DOMRenderer.injectGearButton();

        if (StorageManager.isFeatureEnabled('scrollToTop')) {
            DOMRenderer.injectScrollToTop();
        }

        if (StorageManager.isFeatureEnabled('replaceTime')) {
            DOMRenderer.replaceRelativeTimes();
            DOMRenderer.startTimeObserver();
        }

        processAllDetails();

        if (_initRetryCount < MAX_RETRY) {
            _initRetryCount++;
            setTimeout(() => {
                LOG('延迟重试 processAllDetails, 第', _initRetryCount, '次');
                processAllDetails();
                _initRetryCount = 0;
            }, RETRY_DELAY);
        }
    }

    function startDetailsObserver() {
        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                LOG('MutationObserver 触发 processAllDetails');
                processAllDetails();
            }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        LOG('MutationObserver 已启动');
        return observer;
    }

    registerMenus();
    init();
    const _detailsObserver = startDetailsObserver();
    document.addEventListener('turbo:load', init);
    document.addEventListener('pjax:end', init);
    if (window.onurlchange === undefined) {
        history.pushState = (f => function () { var r = f.apply(this, arguments); window.dispatchEvent(new Event('urlchange')); return r; })(history.pushState);
        history.replaceState = (f => function () { var r = f.apply(this, arguments); window.dispatchEvent(new Event('urlchange')); return r; })(history.replaceState);
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('urlchange')));
    }
    window.addEventListener('urlchange', init);

    LOG('=== GitHub 助手脚本加载完成, 版本 1.0.0 ===');
    LOG('  当前页面:', window.location.href);
    LOG('  功能状态:', JSON.stringify(StorageManager.getFeatures()));
    LOG('  GM 函数可用: getValue=' + (typeof GM_getValue !== 'undefined') + ', setValue=' + (typeof GM_setValue !== 'undefined') + ', registerMenu=' + (typeof GM_registerMenuCommand !== 'undefined'));

})();