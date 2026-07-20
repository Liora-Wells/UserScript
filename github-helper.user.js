// ==UserScript==
// @name         GitHub 助手
// @namespace    https://github.com/Liora-Wells/UserScript
// @version      1.2.0
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
// @grant        GM_setClipboard
// @grant        window.onurlchange
// @sandbox      JavaScript
// @connect      api.github.com
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;
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
        groupsCollapsed: 'ghhelper_proxy_groups_collapsed',
        defaultRawProxyId: 'ghhelper_default_raw_proxy_id'
    };

    const DEFAULT_FEATURES = {
        groupAndSort: true,
        downloadCount: true,
        replaceTime: false,
        collapsibleNotes: true,
        proxyButtons: true,
        scrollToTop: true,
        fileQuickDownload: true
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

        // ☁ 默认 Raw 加速源 id（用于文件列表 ☁ 悬浮图标）
        getDefaultRawProxyId() {
            return this.get(STORAGE_KEYS.defaultRawProxyId, null);
        },

        setDefaultRawProxyId(id) {
            this.set(STORAGE_KEYS.defaultRawProxyId, id);
        },

        clearDefaultRawProxyId() {
            this.set(STORAGE_KEYS.defaultRawProxyId, null);
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
                // originalPath 形如 "owner/repo.git"（从 input value split(':')[1] 得到）
                // 直接拼接，不再追加 .git（原值已包含）
                return url + originalPath.replace(/^\//, '');
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
        },

        // 获取默认 Raw 加速源（含回退逻辑）
        // 1. 用户设定的默认源仍启用 → 返回该源
        // 2. 默认源被禁用/删除 → 回退到第一个启用的 pinned
        // 3. 无可用源 → 返回 null
        getDefaultRawProxy() {
            const id = StorageManager.getDefaultRawProxyId();
            const all = this.getEnabled('raw');
            if (id) {
                const p = all.find(x => x.id === id);
                if (p) return p;
            }
            const disp = this.getDisplayProxies('raw');
            return disp.pinned[0] || all[0] || null;
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
                return { id: 'windows', name: 'Windows', showTag: true };
            if (name.endsWith('.dmg') || name.endsWith('.pkg') || name.endsWith('.xip') || name.endsWith('.app.tar.gz') || name.includes('-mac') || name.includes('_mac') || name.includes('darwin'))
                return { id: 'mac', name: 'macOS', showTag: true };
            if (name.endsWith('.apk') || name.endsWith('.aab'))
                return { id: 'android', name: 'Android', showTag: true };
            if (name.endsWith('.ipa'))
                return { id: 'ios', name: 'iOS', showTag: true };
            if (name.endsWith('.deb'))
                return { id: 'linux-deb', name: 'Debian', showTag: true };
            if (name.endsWith('.rpm'))
                return { id: 'linux-rpm', name: 'RedHat', showTag: true };
            if (name.endsWith('.appimage'))
                return { id: 'linux-appimage', name: 'AppImage', showTag: true };
            if (name.endsWith('.flatpak'))
                return { id: 'linux-flatpak', name: 'Flatpak', showTag: true };
            if (name.endsWith('.pacman') || name.endsWith('.pkg.tar.zst') || name.endsWith('.ebuild'))
                return { id: 'linux-arch', name: 'Arch', showTag: true };
            if (name.endsWith('.ipk') || name.endsWith('.ipk.gz'))
                return { id: 'linux-ipk', name: 'OpenWrt', showTag: true };
            if (name.endsWith('.snap') || name.endsWith('.snapi'))
                return { id: 'linux-snap', name: 'Snap', showTag: true };
            if (name.endsWith('.nupkg'))
                return { id: 'nupkg', name: 'NuGet', showTag: true };
            if (name.endsWith('.jar'))
                return { id: 'jar', name: 'JAR', showTag: true };
            if (name.endsWith('.whl'))
                return { id: 'wheel', name: 'Wheel', showTag: true };
            if (name.includes('-linux') || name.includes('_linux') || name.endsWith('.tar.xz') || name.endsWith('.tar.lz4'))
                return { id: 'linux-other', name: 'Linux', showTag: true };
            if (name.endsWith('.tar.gz') && (name.includes('linux') || name.includes('mac') || name.includes('win')))
                return { id: 'linux-other', name: 'Tarball', showTag: true };

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
    // 4. DOM 渲染器 (DOMRenderer)
    // ============================================================

    // 辅助：判断节点是否为脚本自身元素或其子节点（用于 observer 过滤）
    // 优化：先用 className 前缀检查（最快），再 hasAttribute，最后才 closest
    // 大多数 addedNodes 会在第一步就返回 false，避免 closest 向上遍历到 document 根
    const isScriptNode = (n) => {
        if (!n || n.nodeType !== 1) return false;
        // 快速路径：脚本元素都带 ghhelper- className 前缀
        const cn = n.className;
        if (typeof cn === 'string' && cn.indexOf('ghhelper-') !== -1) return true;
        // 脚本顶层元素都带 data-ghhelper-element 标记
        if (n.hasAttribute('data-ghhelper-element')) return true;
        // 兜底：向上查找（仅在脚本元素作为子节点被插入时才会命中）
        return !!n.closest('[data-ghhelper-element]');
    };

    const DOMRenderer = {
        _scrollTopBtn: null,

        injectCSS() {
            if (document.getElementById('ghhelper-css')) return;
            const style = document.createElement('style');
            style.id = 'ghhelper-css';
            style.textContent = `
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
.ghhelper-proxy-dropdown.ghhelper-dropdown-open .ghhelper-proxy-dropdown-menu{display:block}
.ghhelper-proxy-menu-item{display:block!important;padding:4px 16px!important;margin:0!important;border:none!important;border-radius:0!important;background:transparent!important;color:var(--fgColor-default,var(--color-fg-default))!important;text-decoration:none!important;font-size:12px!important;text-align:center!important;line-height:1.5!important;white-space:nowrap}
.ghhelper-proxy-menu-item:hover{background-color:var(--controlAction-bgColor-hover,var(--color-action-list-item-default-hover-bg))!important;text-decoration:none!important}
.ghhelper-os-select,.ghhelper-arch-select{appearance:auto;background-color:var(--button-default-bgColor-rest,var(--color-btn-bg,#21262d));border:1px solid var(--button-default-borderColor-rest,var(--color-btn-border,rgba(240,246,252,0.1)));border-radius:6px;color:var(--button-default-fgColor-rest,var(--color-btn-text,#c9d1d9));cursor:pointer;font-size:12px;font-weight:500;line-height:20px;padding:3px 8px;margin-left:8px}
.ghhelper-os-select:hover,.ghhelper-arch-select:hover{background-color:var(--button-default-bgColor-hover,var(--color-btn-hover-bg,#30363d))}
.ghhelper-meta-wrapper>summary{cursor:pointer;padding:8px 16px;font-size:12px;color:var(--fgColor-muted,var(--color-fg-muted,#8b949e));border-top:1px solid var(--borderColor-muted,var(--color-border-muted,#30363d))}
.ghhelper-meta-wrapper>summary:hover{color:var(--fgColor-default,var(--color-fg-default,#e6edf3))}
.ghhelper-notes-wrap{margin:16px 0;border:1px solid var(--color-border-muted,#21262d);border-radius:6px;overflow:hidden}
.ghhelper-notes-wrap>summary{display:flex;align-items:center;gap:8px;padding:10px 16px;cursor:pointer;list-style:none;background-color:var(--color-canvas-subtle,#161b22);font-size:14px;font-weight:600;color:var(--color-fg-default,#e6edf3);border-bottom:1px solid var(--color-border-muted,#21262d)}
.ghhelper-notes-wrap>summary::-webkit-details-marker{display:none}
.ghhelper-notes-wrap>summary:hover{background-color:var(--color-canvas-inset,#010409)}
.ghhelper-notes-wrap:not([open])>summary{border-bottom:none}
.ghhelper-notes-arrow{display:inline-block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;transition:transform 0.12s ease;opacity:0.7}
.ghhelper-notes-wrap[open]>.ghhelper-notes-arrow{transform:rotate(180deg)}
.ghhelper-notes-title{font-weight:600}
.ghhelper-notes-version{display:inline-block;padding:1px 8px;font-size:11px;border-radius:10px;background-color:var(--color-success-subtle,rgba(26,127,55,0.15));color:var(--color-success-fg,#1a7f37);border:1px solid var(--color-success-emphasis,#1a7f37)}
.ghhelper-notes-wrap>.markdown-body{padding:16px;margin:0!important}
.ghhelper-raw-btn{border-radius:0!important;margin-left:-1px!important}
.ghhelper-clone-row{margin-top:4px}
.ghhelper-clone-row>input{cursor:pointer!important}
.ghhelper-clone-row>input:hover{background-color:var(--color-canvas-subtle,#161b22)!important}
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
                    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'GitHub-Helper/1.1' },
                    onload: (r) => {
                        if (r.status === 200) resolve(JSON.parse(r.responseText));
                        else reject(`API ${r.status}`);
                    },
                    onerror: reject
                });
            });
        },

        processReleaseBox(details) {
            // 防御：永远不处理脚本自身创建的 wrapper details（签名/校验折叠区）
            // 防止在 wrapper 内部再次创建嵌套 wrapper
            if (details.hasAttribute('data-ghhelper-wrapper')) return;
            if (details.dataset.ghhelperProcessed === 'true') {
                // 已处理过：若 details 已展开，只重渲加速按钮，不重建分组排序
                // 分组排序的 wrapper 重建会破坏用户的展开状态，应由行数变化触发
                if (details.open) {
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
                    this.resortAll();
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
                    this.resortAll();
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
                        // 防御：用户切页后 details/btn 已脱离 DOM，直接放弃操作
                        if (!document.contains(details) || !document.contains(btn)) {
                            busy = false;
                            return;
                        }
                        assets = d.assets;
                        this.injectDownloadCounts(details, assets);
                        btn.innerHTML = '<span class="Button-content"><span class="Button-label">刷新下载量</span></span>';
                        btn.disabled = false;
                        busy = false;
                    }).catch(() => {
                        if (!document.contains(btn)) { busy = false; return; }
                        btn.innerHTML = '<span class="Button-content"><span class="Button-label color-fg-danger">获取失败(限流)</span></span>';
                        btn.disabled = false;
                        busy = false;
                    });
                });
                titleSpan.appendChild(btn);
            }

            let retryTimer = null;

            const refresh = () => {
                // 防御：details 已被 SPA 移除则立即清理 timer 并退出，避免闭包泄漏
                if (!document.contains(details)) {
                    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
                    return;
                }
                if (!details.open) return;
                LOG('  refresh details 内容, groupAndSort=' + StorageManager.isFeatureEnabled('groupAndSort') + ', proxyButtons=' + StorageManager.isFeatureEnabled('proxyButtons'));
                if (StorageManager.isFeatureEnabled('groupAndSort')) this.formatAndSortUI(details);
                if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(details);

                // 如果展开后还没有下载链接，延迟重试（GitHub 异步加载）
                const hasLinks = details.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                if (!hasLinks && !retryTimer) {
                    retryTimer = setTimeout(() => {
                        retryTimer = null;
                        LOG('  refresh 延迟重试');
                        refresh();
                    }, 800);
                }
            };

            details.addEventListener('toggle', (e) => {
                // 只处理外层 details 自身的 toggle，忽略内层（签名/校验 wrapper）冒泡
                if (e.target !== details) return;
                LOG('  toggle 事件触发, details.open=' + details.open);
                if (details.open) refresh();
            });

            // 若 details 已展开，立即执行一次 refresh
            // 后续 Assets 内容异步加载由全局 MutationObserver 统一检测并触发 processAllDetails
            if (details.open) {
                LOG('  details 已展开，立即执行首次 refresh');
                refresh();
            }
        },

        formatAndSortUI(detailsElem, force) {
            const validRows = Array.from(detailsElem.querySelectorAll('li')).filter(r =>
                r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]'));
            LOG('    formatAndSortUI: 有效行数=' + validRows.length + ', force=' + !!force + ', 上次计数=' + detailsElem.dataset.ghhelperVRCount);
            if (!validRows.length) return;

            const prev = parseInt(detailsElem.dataset.ghhelperVRCount || '0');
            const existingWrapper = detailsElem.querySelector('[data-ghhelper-wrapper="1"]');

            // 行数未变 + wrapper 已存在 → 增量更新（只重排和更新样式，不重建 wrapper）
            if (validRows.length === prev && existingWrapper) {
                LOG('    formatAndSortUI: 行数未变且 wrapper 存在，增量更新样式和排序');
                this._updateSortAndStyle(detailsElem, validRows);
                return;
            }
            // 行数未变但无 wrapper（首次或异常状态）→ 全量重建
            // 行数变化 → 全量重建
            detailsElem.dataset.ghhelperVRCount = validRows.length;

            // 幂等清理：移除所有旧 wrapper，把内部 li 还原回真实 parent，防止重复折叠
            // 必须在收集 validRows 之后、计算 parent 之前执行，确保 parent 指向真实容器
            // 记录旧 wrapper 的 open 状态，重建时保留用户的展开状态
            // 注意：从 detailsElem 直接查找所有 wrapper（不限于第一个 ul/div），避免遗漏嵌套 wrapper
            let prevWrapperOpen = false;
            detailsElem.querySelectorAll('[data-ghhelper-wrapper="1"]').forEach(w => {
                if (w.hasAttribute('open')) prevWrapperOpen = true;
                // 把 wrapper 内的 li 还原到 wrapper 的父节点（真实容器）
                const wp = w.parentNode;
                if (wp) {
                    w.querySelectorAll('li').forEach(li => wp.appendChild(li));
                }
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
            // 注意：无需再次查询 wrapper，上面第 893 行已移除所有旧 wrapper
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
                // 保留旧 wrapper 的展开状态，避免重建后折叠
                if (prevWrapperOpen) w.setAttribute('open', 'open');
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

        // 增量更新：只重排和更新样式，不重建 wrapper（保护用户的展开状态）
        _updateSortAndStyle(detailsElem, validRows) {
            const os = SortEngine.getActiveOS();
            const arch = SortEngine.getActiveArch();
            const wrapper = detailsElem.querySelector('[data-ghhelper-wrapper="1"]');

            // 重新计算分组和分数
            const nonAux = [];
            validRows.forEach(row => {
                const nl = row.querySelector('a[href*="/releases/download/"],a[href*="/archive/"],a[href*="/attestations/"]');
                let gi = { id: 'other', showTag: false };
                let fn = '';
                if (nl) {
                    fn = this.getFileNameFromLink(nl);
                    const href = nl.getAttribute('href') || '';
                    gi = href.includes('/archive/') ? { id: 'source', showTag: false }
                        : href.includes('/attestations/') ? { id: 'meta', showTag: false }
                        : SortEngine.parseFileGroup(fn);
                }
                const score = nl ? SortEngine.calculateMatchScore(fn, gi, os, arch) : -10000;
                row._ghs = score; row._ghg = gi; row._ghn = nl;
                // 签名/校验/meta 行不参与重排（留在 wrapper 内不动）
                if (gi.id === 'meta' || SortEngine.isSignatureFile(fn)) {
                    // 签名行留在 wrapper 内，只更新样式
                    this._styleRow(row);
                } else {
                    nonAux.push(row);
                }
            });

            // 找到真实 parent（非 wrapper）
            let parent = nonAux.length ? nonAux[0].parentNode : null;
            if (!parent && wrapper) parent = wrapper.parentNode;
            if (!parent) return;

            // 按分数排序非签名行
            nonAux.sort((a, b) => b._ghs - a._ghs);

            // 重排：把非签名行移到 wrapper 之前（保持顺序）
            const insertBefore = wrapper || null;
            nonAux.forEach(row => {
                if (row.parentNode !== parent) parent.appendChild(row);
                else parent.insertBefore(row, insertBefore);
                this._styleRow(row);
            });
        },

        // 行样式更新（不重建 DOM 结构）
        _styleRow(row) {
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
                if (nl && nl.parentNode) nl.parentNode.insertBefore(mc, nl.nextSibling);
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
        },

        // OS/Arch 变更时重排（不重建 wrapper）
        resortAll() {
            const targets = document.querySelectorAll('details[data-ghhelper-processed="true"]:not([data-ghhelper-wrapper])');
            LOG('  resortAll 调用, 已处理 details 数:', targets.length);
            targets.forEach(d => {
                if (d.open && StorageManager.isFeatureEnabled('groupAndSort')) {
                    this.formatAndSortUI(d, true);
                }
            });
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
            // 一次性收集 row 和 nl，避免 forEach 中重复 querySelector
            const rows = [];
            Array.from(detailsElem.querySelectorAll('li')).forEach(r => {
                const nl = r.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
                if (nl) rows.push({ row: r, nl });
            });
            LOG('    processProxyButtons: 有效行数=' + rows.length);
            if (!rows.length) return;

            const disp = ProxyManager.getDisplayProxies('download');
            const all = [...disp.pinned, ...disp.overflow];
            if (!all.length) { LOG('    processProxyButtons: 无可用加速源'); return; }

            rows.forEach(({ row, nl }) => {
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
                    dd.setAttribute('data-ghhelper-element', '1');
                    dd.setAttribute('data-ghhelper-nt', '1');
                    const db = document.createElement('a');
                    db.className = 'ghhelper-proxy-btn'; db.textContent = '加速 ▼';
                    db.href = 'javascript:void(0)';
                    db.setAttribute('data-ghhelper-nt', '1');
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
                    // click 切换下拉菜单（避免 hover 在鼠标轨迹离开时关闭）
                    db.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 先关闭其他已打开的菜单
                        document.querySelectorAll('.ghhelper-dropdown-open').forEach(el => {
                            if (el !== dd) el.classList.remove('ghhelper-dropdown-open');
                        });
                        dd.classList.toggle('ghhelper-dropdown-open');
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

        // Raw 加速：在文件查看页 Raw 按钮后追加一串加速按钮
        // 样式参考 docs/Github 增强 - 高速下载.js：紧贴原按钮、复用其 className
        processRawButtons() {
            if (!StorageManager.isFeatureEnabled('proxyButtons')) return;
            const rawBtn = document.querySelector('a[data-testid="raw-button"]');
            if (!rawBtn) return;
            // 已处理且加速源数量未变则跳过
            const disp = ProxyManager.getDisplayProxies('raw');
            const all = [...disp.pinned, ...disp.overflow];
            const prevCount = parseInt(rawBtn.dataset.ghhelperRawCount || '0');
            if (rawBtn.dataset.ghhelperRawProcessed === 'true' && prevCount === all.length) return;

            // 清理旧按钮
            const parent = rawBtn.parentNode;
            parent.querySelectorAll('.ghhelper-raw-btn').forEach(e => e.remove());
            if (!all.length) { rawBtn.dataset.ghhelperRawProcessed = 'true'; rawBtn.dataset.ghhelperRawCount = '0'; return; }
            rawBtn.dataset.ghhelperRawProcessed = 'true';
            rawBtn.dataset.ghhelperRawCount = String(all.length);

            const href = window.location.pathname;
            // 倒序插入，使最终顺序为正序（每个都 insertAdjacentHTML afterend）
            all.slice().reverse().forEach(p => {
                const url = ProxyManager.buildUrl(p, href, 'raw');
                const btn = document.createElement('a');
                btn.className = rawBtn.className + ' ghhelper-raw-btn';
                btn.setAttribute('data-ghhelper-element', '1');
                btn.setAttribute('data-ghhelper-nt', '1');
                btn.href = url;
                btn.target = '_blank';
                btn.rel = 'noopener noreferrer';
                btn.textContent = p.name;
                btn.title = (p.desc || '') + (p.region ? ' [' + p.region + ']' : '') +
                    '\n\n提示：[Alt + 左键] 可直接下载，[右键 - 另存为...] 保存文件';
                rawBtn.insertAdjacentElement('afterend', btn);
            });
            LOG('  processRawButtons: 已添加 ' + all.length + ' 个 Raw 加速按钮');
        },

        // Clone 加速：在 Code 下拉菜单的 HTTPS clone input 下方插入加速源 input
        // 样式参考 docs/Github 增强 - 高速下载.js：克隆原 input，堆叠显示
        // 关键：不修改原 input 的 value，避免切换协议时污染
        processCloneButtons(target) {
            if (!StorageManager.isFeatureEnabled('proxyButtons')) return;
            // 查找 HTTPS Clone URL input
            const html = target.querySelector('input[value^="https://"][value*="github.com"]');
            if (!html) return;
            // 必须是 Clone URL（通常是 input-monospace 或类似样式）
            if (!this._isCloneInput(html)) return;
            // 检查 input 是否可见（切换到 SSH tab 时 HTTPS input 可能被隐藏）
            if (html.offsetParent === null && html.getClientRects().length === 0) return;
            // 已处理且加速源行仍存在则跳过（避免重复处理）
            if (html.dataset.ghhelperCloneProcessed === '1') {
                const wrapperEl = html.parentElement;
                if (wrapperEl && wrapperEl.nextElementSibling && wrapperEl.nextElementSibling.classList.contains('ghhelper-clone-row')) return;
            }

            // 清理旧的 Clone 加速源（保留 SSH 的，因为可能在不同 tab 下）
            this._clearCloneRows();
            // 标记当前 input 为已处理
            html.setAttribute('data-ghhelper-clone-processed', '1');

            const disp = ProxyManager.getDisplayProxies('clone');
            const all = [...disp.pinned, ...disp.overflow];
            if (!all.length) return;

            const host = window.location.host;
            const rawValue = html.value;
            const splitVal = rawValue.split(host);
            if (splitVal.length < 2) return;
            const href_split = splitVal[1];

            // 给原 input 加 git clone 前缀，与加速源行样式统一
            // 幂等检查：rawValue 不以 "git clone " 开头时才添加
            if (!rawValue.startsWith('git clone ')) {
                html.value = 'git clone ' + rawValue;
                html.setAttribute('value', html.value);
            }

            const wrapperEl = html.parentElement;
            if (!wrapperEl) return;

            // 修复下拉菜单 overflow/max-height
            this._fixMenuOverflow(wrapperEl);

            // 隐藏右侧复制按钮（点击 input 即可复制）
            const copyBtn = html.nextElementSibling;
            if (copyBtn) copyBtn.style.display = 'none';

            // 添加提示文字
            const hint = wrapperEl.nextElementSibling;
            if (hint && hint.tagName === 'P' && !hint.dataset.ghhelperHintAdded) {
                hint.dataset.ghhelperHintAdded = '1';
                hint.textContent += ' (点击文字可直接复制)';
            }

            // 克隆原 input，生成加速源行
            all.forEach(p => {
                const url = ProxyManager.buildUrl(p, href_split, 'clone');
                const inputClone = html.cloneNode(false);
                inputClone.removeAttribute('data-ghhelper-clone-processed');
                inputClone.setAttribute('data-ghhelper-nt', '1');
                inputClone.setAttribute('data-ghhelper-element', '1');
                inputClone.value = 'git clone ' + url;
                inputClone.title = url + '\n\n点击文字可直接复制';
                inputClone.style.cursor = 'pointer';
                inputClone.readOnly = true;

                // 创建包装 div，继承原父元素的 className
                const row = document.createElement('div');
                row.className = 'ghhelper-clone-row ' + wrapperEl.className;
                row.setAttribute('data-ghhelper-element', '1');
                row.setAttribute('data-ghhelper-nt', '1');
                row.style.marginTop = '4px';
                row.appendChild(inputClone);

                wrapperEl.insertAdjacentElement('afterend', row);
            });

            // 给祖先容器添加点击委托（点击 input 自动复制）
            const grandparent = wrapperEl.parentElement;
            if (grandparent && !grandparent.dataset.ghhelperCloneClickBound) {
                grandparent.dataset.ghhelperCloneClickBound = '1';
                grandparent.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT' && e.target.value.startsWith('git clone ')) {
                        GM_setClipboard(e.target.value);
                    }
                });
            }

            LOG('  processCloneButtons: 已添加 ' + all.length + ' 个 Clone 加速源');
        },

        // SSH 加速：在 Code 下拉菜单的 SSH clone input 下方插入加速源 input
        processSSHButtons(target) {
            if (!StorageManager.isFeatureEnabled('proxyButtons')) return;
            const html = target.querySelector('input[value^="git@"][value*="github.com"]');
            if (!html) return;
            if (!this._isCloneInput(html)) return;
            // 检查 input 是否可见（切换到 HTTPS tab 时 SSH input 可能被隐藏）
            if (html.offsetParent === null && html.getClientRects().length === 0) return;
            // 已处理且加速源行仍存在则跳过
            if (html.dataset.ghhelperSshProcessed === '1') {
                const wrapperEl = html.parentElement;
                if (wrapperEl && wrapperEl.nextElementSibling && wrapperEl.nextElementSibling.classList.contains('ghhelper-ssh-row')) return;
            }

            // 清理旧的 SSH 加速源（保留 Clone 的，因为可能在不同 tab 下）
            this._clearSshRows();
            // 标记当前 input 为已处理
            html.setAttribute('data-ghhelper-ssh-processed', '1');

            const disp = ProxyManager.getDisplayProxies('ssh');
            const all = [...disp.pinned, ...disp.overflow];
            if (!all.length) return;

            const rawValue = html.value;
            const splitVal = rawValue.split(':');
            if (splitVal.length < 2) return;
            const href_split = splitVal[1];

            // 给原 input 加 git clone 前缀，与加速源行样式统一
            // 幂等检查：rawValue 不以 "git clone " 开头时才添加
            // 注意：split(':') 计算的是 href_split（不含 host 部分），加前缀不影响（前缀无冒号）
            if (!rawValue.startsWith('git clone ')) {
                html.value = 'git clone ' + rawValue;
                html.setAttribute('value', html.value);
            }

            const wrapperEl = html.parentElement;
            if (!wrapperEl) return;

            // 修复下拉菜单 overflow/max-height
            this._fixMenuOverflow(wrapperEl);

            // 隐藏右侧复制按钮
            const copyBtn = html.nextElementSibling;
            if (copyBtn) copyBtn.style.display = 'none';

            // 添加提示文字
            const hint = wrapperEl.nextElementSibling;
            if (hint && hint.tagName === 'P' && !hint.dataset.ghhelperSshHintAdded) {
                hint.dataset.ghhelperSshHintAdded = '1';
                hint.textContent += ' (点击文字可直接复制)';
            }

            // 克隆原 input，生成加速源行
            all.forEach(p => {
                const url = ProxyManager.buildUrl(p, href_split, 'ssh');
                const inputClone = html.cloneNode(false);
                inputClone.removeAttribute('data-ghhelper-ssh-processed');
                inputClone.setAttribute('data-ghhelper-nt', '1');
                inputClone.setAttribute('data-ghhelper-element', '1');
                inputClone.value = 'git clone ' + url;
                inputClone.title = url + '\n\n点击文字可直接复制';
                inputClone.style.cursor = 'pointer';
                inputClone.readOnly = true;

                const row = document.createElement('div');
                row.className = 'ghhelper-ssh-row ' + wrapperEl.className;
                row.setAttribute('data-ghhelper-element', '1');
                row.setAttribute('data-ghhelper-nt', '1');
                row.style.marginTop = '4px';
                row.appendChild(inputClone);

                wrapperEl.insertAdjacentElement('afterend', row);
            });

            // 给祖先容器添加点击委托
            const grandparent = wrapperEl.parentElement;
            if (grandparent && !grandparent.dataset.ghhelperSshClickBound) {
                grandparent.dataset.ghhelperSshClickBound = '1';
                grandparent.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT' && e.target.value.startsWith('git clone ')) {
                        GM_setClipboard(e.target.value);
                    }
                });
            }

            LOG('  processSSHButtons: 已添加 ' + all.length + ' 个 SSH 加速源');
        },

        // 判断 input 是否为 Clone URL 输入框（避免误匹配搜索框等）
        _isCloneInput(inp) {
            // Clone URL input 通常有 input-monospace 或 aria-label 包含 clone/copy
            const cls = inp.className || '';
            const label = inp.getAttribute('aria-label') || '';
            if (/input-monospace/i.test(cls)) return true;
            if (/clone|copy|repository/i.test(label)) return true;
            // 兜底：value 是 .git 结尾的 URL
            if (/\.git$/.test(inp.value)) return true;
            return false;
        },

        // 清理 Clone 加速源行（只删除注入的行，不清除 input 标记）
        _clearCloneRows() {
            const scope = document.getElementById('__primerPortalRoot__') || document;
            scope.querySelectorAll('.ghhelper-clone-row').forEach(e => e.remove());
        },

        // 清理 SSH 加速源行（只删除注入的行，不清除 input 标记）
        _clearSshRows() {
            const scope = document.getElementById('__primerPortalRoot__') || document;
            scope.querySelectorAll('.ghhelper-ssh-row').forEach(e => e.remove());
        },

        // 清理所有 Clone/SSH 加速源行，并重置 input 标记（用于加速源变更后重渲）
        _clearAllCloneSshRows() {
            const scope = document.getElementById('__primerPortalRoot__') || document;
            scope.querySelectorAll('.ghhelper-clone-row, .ghhelper-ssh-row').forEach(e => e.remove());
            scope.querySelectorAll('[data-ghhelper-clone-processed]').forEach(el => el.removeAttribute('data-ghhelper-clone-processed'));
            scope.querySelectorAll('[data-ghhelper-ssh-processed]').forEach(el => el.removeAttribute('data-ghhelper-ssh-processed'));
        },

        // 修复 Code 下拉菜单 overflow/max-height，避免加速源被截断
        _fixMenuOverflow(elem) {
            // 尝试定位各种可能的菜单根容器
            const selectors = [
                '[class*="AnchoredOverlay"]',
                '[class*="prc-Overlay"]',
                '[class*="Overlay__"]',
                '[data-overlay-container]',
                '[class*="SelectMenu"]',
                '[class*="ActionList"]'
            ];
            let overlay = null;
            for (const sel of selectors) {
                overlay = elem.closest(sel);
                if (overlay) break;
            }
            // 如果没找到，从 portal 根往下找
            if (!overlay) {
                const portal = document.getElementById('__primerPortalRoot__');
                if (portal) {
                    for (const sel of selectors) {
                        overlay = portal.querySelector(sel);
                        if (overlay) break;
                    }
                }
            }
            if (overlay) {
                overlay.style.setProperty('overflow', 'visible', 'important');
                overlay.style.setProperty('overflow-x', 'visible', 'important');
                overlay.style.setProperty('overflow-y', 'visible', 'important');
                overlay.style.setProperty('max-height', 'none', 'important');
                overlay.style.setProperty('height', 'auto', 'important');
            }
            // 同时逐层向上清理，确保中间层不截断（最多 15 层）
            let node = elem;
            let depth = 0;
            while (node && node !== document.body && depth < 15) {
                const style = getComputedStyle(node);
                // 只清理有截断限制的元素，避免干扰正常布局
                if (style.overflow !== 'visible' || style.overflowY !== 'visible' || style.maxHeight !== 'none') {
                    node.style.setProperty('overflow', 'visible', 'important');
                    node.style.setProperty('overflow-x', 'visible', 'important');
                    node.style.setProperty('overflow-y', 'visible', 'important');
                    node.style.setProperty('max-height', 'none', 'important');
                }
                node = node.parentElement;
                depth++;
            }
        },

        // 重渲 Raw/Clone/SSH（加速源变更后）
        reprocessRawCloneSSH() {
            // Raw
            document.querySelectorAll('a[data-testid="raw-button"]').forEach(btn => {
                delete btn.dataset.ghhelperRawProcessed;
                delete btn.dataset.ghhelperRawCount;
            });
            this.processRawButtons();
            // Clone/SSH：清理加速源行和标记，等待下次打开下拉菜单时重新处理
            this._clearAllCloneSshRows();
        },

        reprocessAll() {
            const targets = document.querySelectorAll('details[data-ghhelper-processed="true"]:not([data-ghhelper-wrapper])');
            LOG('  reprocessAll 调用, 已处理 details 数:', targets.length);
            targets.forEach(d => {
                // 只重渲加速按钮（加速源变更后需要更新），不重建分组排序
                // 分组排序的 wrapper 重建会破坏用户的展开状态
                if (d.open) {
                    if (StorageManager.isFeatureEnabled('proxyButtons')) this.processProxyButtons(d);
                }
            });
            // 同步刷新 Raw/Clone/SSH 加速按钮
            this.reprocessRawCloneSSH();
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

                // 创建外层 details
                const wrap = document.createElement('details');
                wrap.setAttribute('data-ghhelper-notes-wrap', '1');
                wrap.setAttribute('data-ghhelper-element', '1');
                wrap.setAttribute('data-ghhelper-nt', '1');
                wrap.className = 'ghhelper-notes-wrap';
                wrap.setAttribute('open', 'open');

                // summary：简洁的标题栏，不抢夺内容的视觉焦点
                const summary = document.createElement('summary');
                summary.setAttribute('data-ghhelper-nt', '1');
                summary.innerHTML = '<span class="ghhelper-notes-arrow"></span>' +
                    '<span class="ghhelper-notes-title">更新日志</span>' +
                    (version ? '<span class="ghhelper-notes-version">' + escapeHtml(version) + '</span>' : '');
                wrap.appendChild(summary);

                // 关键：不移动原 el 的子元素，而是把整个原 el 移入 details
                // 这样原 el 的 className、dataset、内部 DOM 结构完全保留
                // GitHub 的 JS（如代码高亮、锚点、复制按钮等）仍能正常工作
                el.parentNode.replaceChild(wrap, el);
                wrap.appendChild(el);
                // 移除原 el 的 margin（由 wrap 接管外边距），保留其他样式
                el.style.margin = '0';
                el.classList.remove('tmp-my-3');
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
            // 保存 handler 引用，便于功能关闭时 removeEventListener
            this._scrollTopHandler = () => btn.classList.toggle('ghhelper-visible', window.scrollY > 300);
            window.addEventListener('scroll', this._scrollTopHandler, { passive: true });
            this._scrollTopHandler();
        },

        // 移除回到顶部按钮和 scroll 监听器（功能关闭时调用）
        removeScrollToTop() {
            if (this._scrollTopHandler) {
                window.removeEventListener('scroll', this._scrollTopHandler, { passive: true });
                this._scrollTopHandler = null;
            }
            if (this._scrollTopBtn) {
                this._scrollTopBtn.remove();
                this._scrollTopBtn = null;
            }
        },

        injectGearButton() {
            if (document.getElementById('ghhelper-gear-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'ghhelper-gear-btn';
            btn.className = 'ghhelper-gear-btn';
            btn.setAttribute('data-ghhelper-element', '1');
            btn.setAttribute('data-ghhelper-nt', '1');
            btn.title = 'GitHub 助手设置';
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.028-.288c.648-.175 1.306.129 1.474.77l.273 1.022c.168.643-.089 1.312-.59 1.637l-.846.54c-.054.034-.13.101-.13.241 0 .14.076.207.13.241l.846.54c.501.325.758.994.59 1.637l-.273 1.022c-.168.641-.826.945-1.474.77l-1.028-.288c-.066-.019-.176-.011-.299.071-.214.143-.437.272-.668.386-.133.066-.194.158-.212.224l-.288 1.107c-.17.645-.716 1.195-1.459 1.259a8.2 8.2 0 0 1-1.402 0c-.743-.064-1.289-.614-1.459-1.259l-.288-1.107c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.028.288c-.648.175-1.306-.129-1.474-.77l-.273-1.022c-.168-.643.089-1.312.59-1.637l.846-.54c.054-.034.13-.101.13-.241 0-.14-.076-.207-.13-.241l-.846-.54c-.501-.325-.758-.994-.59-1.637l.273-1.022c.168-.641.826-.945 1.474-.77l1.028.288c.066.019.176.011.299-.071.231-.114.454-.243.668-.386.133-.066.194-.158.212-.224l.288-1.107C7.01.645 7.556.095 8.299.031A8.2 8.2 0 0 1 8 0zM5.5 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z"/></svg>';
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
            const val = StorageManager.get(STORAGE_KEYS.groupsCollapsed, def);
            // 合并默认值，确保所有 key 都存在
            return Object.assign({}, def, val || {});
        },

        _setGroupsCollapsed(state) {
            StorageManager.set(STORAGE_KEYS.groupsCollapsed, state);
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
            html += '<h4 data-ghhelper-nt="1" style="margin:0 0 10px">加速源管理</h4>';

            // 第一行：搜索框 + 操作按钮
            html += '<div class="ghhelper-search-row" data-ghhelper-nt="1">';
            html += '<input class="ghhelper-input ghhelper-search-input" id="ghhelper-search" placeholder="🔍 搜索名称/URL/地区/备注" data-ghhelper-nt="1">';
            html += '<button class="ghhelper-search-clear" id="ghhelper-search-clear" data-ghhelper-nt="1" style="display:none">×</button>';
            html += '<button class="ghhelper-btn ghhelper-btn-primary" id="ghhelper-add-proxy" data-ghhelper-nt="1">+ 添加</button>';
            html += '<button class="ghhelper-btn" id="ghhelper-restore-defaults" data-ghhelper-nt="1">↻ 恢复默认</button>';
            html += '</div>';

            // 第二行：Chip 行（容器，由 _renderChipRow 填充）
            html += '<div id="ghhelper-chip-row" data-ghhelper-nt="1"></div>';

            // 第三行：状态摘要 + 批量操作
            html += '<div class="ghhelper-status-row" data-ghhelper-nt="1">';
            html += '<span id="ghhelper-proxy-count" data-ghhelper-nt="1">共 ' + all.length + ' 条 · 启用 ' + enabledCount + ' · 禁用 ' + disabledCount + '</span>';
            html += '<div class="ghhelper-status-actions" data-ghhelper-nt="1">';
            html += '<button class="ghhelper-status-action" id="ghhelper-expand-all" data-ghhelper-nt="1">全部展开</button>';
            html += '<button class="ghhelper-status-action" id="ghhelper-collapse-all" data-ghhelper-nt="1">全部折叠</button>';
            html += '</div></div>';

            // 列表（容器，由 _renderGroups 填充）
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

            // 渲染 Chip 行与分组列表
            this._renderChipRow();
            this._renderGroups();

            // 事件绑定
            const searchInput = document.getElementById('ghhelper-search');
            const searchClear = document.getElementById('ghhelper-search-clear');
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                searchClear.style.display = val ? 'block' : 'none';
                this._setFilter('keyword', val);
            });
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                this._setFilter('keyword', '');
            });

            document.getElementById('ghhelper-add-proxy').addEventListener('click', () => {
                this._showAddForm();
            });
            document.getElementById('ghhelper-restore-defaults').addEventListener('click', () => {
                if (confirm('将重新添加所有缺失的内置源，已编辑的内置源会被重置，确认？')) {
                    ProxyManager.restoreDefaults();
                    this.renderTab('proxies');
                    DOMRenderer.reprocessAll();
                }
            });
            document.getElementById('ghhelper-expand-all').addEventListener('click', () => {
                this._setGroupsCollapsed({ download: false, raw: false, clone: false, ssh: false });
                this._renderGroups();
            });
            document.getElementById('ghhelper-collapse-all').addEventListener('click', () => {
                this._setGroupsCollapsed({ download: true, raw: true, clone: true, ssh: true });
                this._renderGroups();
            });
            document.getElementById('ghhelper-max-display').addEventListener('change', function () {
                StorageManager.setMaxDisplay(parseInt(this.value));
                DOMRenderer.reprocessAll();
            });
        },

        _renderChipRow() {
            const chipRowEl = document.getElementById('ghhelper-chip-row');
            if (!chipRowEl) return;
            const all = StorageManager.getProxies();
            const counts = this._computeChipCounts(all);
            const state = this._getFilterState();

            const chip = (key, dim, label, count, active) => {
                const cls = 'ghhelper-chip' + (active ? ' ghhelper-chip-active' : '');
                return '<span class="' + cls + '" data-chip-dim="' + dim + '" data-chip-key="' + key + '" data-ghhelper-nt="1">' + label + ' <span class="ghhelper-chip-count">' + count + '</span></span>';
            };

            let html = '<div class="ghhelper-chip-group" data-ghhelper-nt="1">';
            // 类型维度
            html += chip('all', 'type', '全部', counts.type.all, state.type === 'all');
            html += chip('download', 'type', '下载', counts.type.download, state.type === 'download');
            html += chip('raw', 'type', 'Raw', counts.type.raw, state.type === 'raw');
            html += chip('clone', 'type', 'Clone', counts.type.clone, state.type === 'clone');
            html += chip('ssh', 'type', 'SSH', counts.type.ssh, state.type === 'ssh');
            html += '<span class="ghhelper-chip-separator" data-ghhelper-nt="1"></span>';
            // 来源维度
            html += chip('all', 'source', '全部', counts.source.all, state.source === 'all');
            html += chip('builtin', 'source', '内置', counts.source.builtin, state.source === 'builtin');
            html += chip('custom', 'source', '自定义', counts.source.custom, state.source === 'custom');
            html += '<span class="ghhelper-chip-separator" data-ghhelper-nt="1"></span>';
            // 状态维度
            html += chip('all', 'status', '全部', counts.status.all, state.status === 'all');
            html += chip('enabled', 'status', '启用', counts.status.enabled, state.status === 'enabled');
            html += chip('disabled', 'status', '禁用', counts.status.disabled, state.status === 'disabled');
            html += '<span class="ghhelper-chip-separator" data-ghhelper-nt="1"></span>';
            // 修改维度
            html += chip('modified', 'modified', '已修改', counts.modified, state.modified);
            html += '</div>';

            chipRowEl.innerHTML = html;

            // 事件委托（只绑一次）
            if (!chipRowEl.dataset.ghhelperDelegated) {
                chipRowEl.dataset.ghhelperDelegated = '1';
                chipRowEl.addEventListener('click', (e) => {
                    const chipEl = e.target.closest('.ghhelper-chip');
                    if (!chipEl) return;
                    const dim = chipEl.dataset.chipDim;
                    const key = chipEl.dataset.chipKey;
                    if (dim === 'modified') {
                        // toggle
                        this._setFilter('modified', !this._getFilterState().modified);
                    } else {
                        // 同维度单选
                        this._setFilter(dim, key);
                    }
                });
            }
        },

        _renderGroups() {
            const listEl = document.getElementById('ghhelper-proxy-list');
            if (!listEl) return;
            const all = StorageManager.getProxies();
            const filtered = this._applyFilters(all);
            const collapsed = this._getGroupsCollapsed();
            const groupOrder = [
                { type: 'download', label: '下载' },
                { type: 'raw', label: 'Raw' },
                { type: 'clone', label: 'Clone' },
                { type: 'ssh', label: 'SSH' }
            ];

            let html = '';
            groupOrder.forEach(g => {
                const groupAll = all.filter(p => p.type === g.type);
                const groupFiltered = filtered.filter(p => p.type === g.type);
                if (groupAll.length === 0) return; // 该分组无源，不显示
                const visibleCount = groupFiltered.length;
                const totalCount = groupAll.length;
                const enabledCount = groupAll.filter(p => p.enabled).length;
                const isCollapsed = collapsed[g.type];
                const isEmpty = visibleCount === 0;
                const headerClass = 'ghhelper-group-header' + (isEmpty ? ' ghhelper-group-empty' : '');
                const arrowClass = 'ghhelper-group-arrow' + (isCollapsed ? '' : ' ghhelper-group-arrow-open');
                const bodyClass = 'ghhelper-group-body' + (isCollapsed ? ' ghhelper-group-collapsed' : '');

                html += '<div class="' + headerClass + '" data-group-toggle="' + g.type + '" data-ghhelper-nt="1">';
                html += '<span class="' + arrowClass + '" data-ghhelper-nt="1"></span>';
                html += '<span class="ghhelper-group-title" data-ghhelper-nt="1">' + g.label + '</span>';
                html += '<span class="ghhelper-group-count" data-ghhelper-nt="1">(' + visibleCount + '/' + totalCount + ')</span>';
                html += '<span class="ghhelper-group-enabled" data-ghhelper-nt="1">· 启用 ' + enabledCount + '</span>';
                html += '</div>';
                html += '<div class="' + bodyClass + '" data-ghhelper-nt="1">';
                if (isEmpty) {
                    html += '<div class="ghhelper-empty-hint" data-ghhelper-nt="1">无匹配加速源</div>';
                } else {
                    groupFiltered.forEach(p => {
                        html += this._renderCard(p);
                    });
                }
                html += '</div>';
            });

            if (all.length === 0) {
                html = '<div class="ghhelper-empty-hint" data-ghhelper-nt="1">暂无加速源，点「+ 添加」创建</div>';
            }

            listEl.innerHTML = html;

            // 事件委托（绑定到 listEl，只绑一次）
            if (!listEl.dataset.ghhelperDelegated) {
                listEl.dataset.ghhelperDelegated = '1';
                // 分组折叠
                listEl.addEventListener('click', (e) => {
                    const header = e.target.closest('[data-group-toggle]');
                    if (header) {
                        this._toggleGroup(header.dataset.groupToggle);
                        return;
                    }
                    // 编辑按钮
                    const editBtn = e.target.closest('[data-proxy-edit]');
                    if (editBtn) {
                        this._showEditForm(editBtn.dataset.proxyEdit);
                        return;
                    }
                    // 删除按钮
                    const delBtn = e.target.closest('[data-proxy-delete]');
                    if (delBtn) {
                        const id = delBtn.dataset.proxyDelete;
                        const proxy = StorageManager.getProxies().find(p => p.id === id);
                        const msg = proxy && proxy.builtIn
                            ? '删除内置源后可通过"恢复默认"找回，确认？'
                            : '确认删除此自定义加速源？';
                        if (confirm(msg)) {
                            ProxyManager.deleteProxy(id);
                            this._renderChipRow();
                            this._renderGroups();
                            DOMRenderer.reprocessAll();
                        }
                        return;
                    }
                    // 表单内的取消按钮
                    const cancelBtn = e.target.closest('[data-form-cancel]');
                    if (cancelBtn) {
                        this._renderGroups();
                        return;
                    }
                    // 表单内的保存按钮
                    const saveBtn = e.target.closest('[data-form-save]');
                    if (saveBtn) {
                        this._handleFormSave(saveBtn);
                        return;
                    }
                });
                // toggle 启用/禁用
                listEl.addEventListener('change', (e) => {
                    const toggle = e.target.closest('[data-proxy-toggle]');
                    if (toggle) {
                        ProxyManager.toggleProxy(toggle.dataset.proxyToggle);
                        this._renderChipRow();
                        this._renderGroups();
                        DOMRenderer.reprocessAll();
                    }
                });
                // 表单字段输入时清除错误提示
                listEl.addEventListener('input', (e) => {
                    const field = e.target.closest('[data-form-field]');
                    if (field) {
                        const errEl = field.parentElement.querySelector('.ghhelper-proxy-form-error');
                        if (errEl) errEl.remove();
                    }
                });
            }
        },

        _renderCard(p) {
            const dotColor = p.enabled ? '#1a7f37' : '#6e7681';
            const typeLabel = p.type === 'all' ? '全部' : p.type;
            const sourceLabel = p.builtIn ? '内置' : '自定义';
            const sourceClass = p.builtIn ? 'ghhelper-proxy-tag-builtin' : 'ghhelper-proxy-tag-custom';
            let html = '<div class="ghhelper-proxy-card" data-proxy-id="' + this._escapeHtml(p.id) + '" data-ghhelper-nt="1">';
            // 第一行
            html += '<div class="ghhelper-proxy-card-row1" data-ghhelper-nt="1">';
            html += '<span class="ghhelper-proxy-dot" data-ghhelper-nt="1" style="background-color:' + dotColor + '"></span>';
            html += '<span class="ghhelper-proxy-name" data-ghhelper-nt="1">' + this._escapeHtml(p.name) + '</span>';
            if (p.builtIn && p.edited) {
                html += '<span class="ghhelper-proxy-modified" data-ghhelper-nt="1">已修改</span>';
            }
            html += '<div class="ghhelper-proxy-tags" data-ghhelper-nt="1">';
            html += '<span class="ghhelper-proxy-tag" data-ghhelper-nt="1">[' + typeLabel + ']</span>';
            html += '<span class="ghhelper-proxy-tag ' + sourceClass + '" data-ghhelper-nt="1">[' + sourceLabel + ']</span>';
            if (p.region) {
                html += '<span class="ghhelper-proxy-tag" data-ghhelper-nt="1">' + this._escapeHtml(p.region) + '</span>';
            }
            html += '</div>';
            html += '<div class="ghhelper-proxy-actions" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-toggle" data-ghhelper-nt="1"><input type="checkbox" ' + (p.enabled ? 'checked' : '') + ' data-proxy-toggle="' + this._escapeHtml(p.id) + '"><span class="ghhelper-toggle-slider"></span></label>';
            html += '<button class="ghhelper-btn" data-proxy-edit="' + this._escapeHtml(p.id) + '" data-ghhelper-nt="1">✎ 编辑</button>';
            html += '<button class="ghhelper-btn ghhelper-btn-danger" data-proxy-delete="' + this._escapeHtml(p.id) + '" data-ghhelper-nt="1">🗑 删除</button>';
            html += '</div>';
            html += '</div>';
            // 第二行 URL
            html += '<div class="ghhelper-proxy-url" data-ghhelper-nt="1">' + this._escapeHtml(p.url) + '</div>';
            // 第三行 备注
            if (p.desc) {
                html += '<div class="ghhelper-proxy-desc" data-ghhelper-nt="1">' + this._escapeHtml(p.desc) + '</div>';
            }
            html += '</div>';
            return html;
        },

        _renderEditForm(mode, proxy) {
            // mode: 'edit' | 'add'
            // proxy: 编辑时为原对象，添加时为 { type: 'download', enabled: true } 默认值
            const isEdit = mode === 'edit';
            const title = isEdit ? '编辑：' + proxy.name : '添加加速源';
            const sourceLabel = isEdit ? (proxy.builtIn ? '内置' : '自定义') : '自定义';
            const sourceClass = isEdit
                ? (proxy.builtIn ? 'ghhelper-proxy-tag-builtin' : 'ghhelper-proxy-tag-custom')
                : 'ghhelper-proxy-tag-custom';
            const showModified = isEdit && proxy.builtIn && proxy.edited;

            const name = isEdit ? this._escapeHtml(proxy.name || '') : '';
            const url = isEdit ? this._escapeHtml(proxy.url || '') : '';
            const type = isEdit ? proxy.type : 'download';
            const region = isEdit ? this._escapeHtml(proxy.region || '') : '';
            const desc = isEdit ? this._escapeHtml(proxy.desc || '') : '';
            const enabled = isEdit ? proxy.enabled : true;

            let html = '<div class="ghhelper-proxy-form" data-ghhelper-element="1" data-ghhelper-nt="1">';
            // 表单头
            html += '<div class="ghhelper-proxy-form-header" data-ghhelper-nt="1">';
            html += '<span class="ghhelper-proxy-form-title" data-ghhelper-nt="1">▾ ' + this._escapeHtml(title) + '</span>';
            html += '<span class="ghhelper-proxy-tag ' + sourceClass + '" data-ghhelper-nt="1">[' + sourceLabel + ']</span>';
            if (showModified) {
                html += '<span class="ghhelper-proxy-modified" data-ghhelper-nt="1">已修改</span>';
            }
            html += '<button class="ghhelper-proxy-form-close" data-form-cancel="1" data-ghhelper-nt="1">×</button>';
            html += '</div>';
            // 字段网格
            html += '<div class="ghhelper-proxy-form-grid" data-ghhelper-nt="1">';
            // 名称
            html += '<div class="ghhelper-proxy-form-field" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">名称</label>';
            html += '<input class="ghhelper-input" data-form-field="name" data-ghhelper-nt="1" value="' + name + '">';
            html += '</div>';
            // 类型
            html += '<div class="ghhelper-proxy-form-field" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">类型</label>';
            html += '<select class="ghhelper-select" data-form-field="type" data-ghhelper-nt="1">';
            ['download', 'raw', 'clone', 'ssh', 'all'].forEach(t => {
                const labels = { download: '下载/ZIP', raw: 'Raw', clone: 'Clone', ssh: 'SSH', all: '全部' };
                html += '<option value="' + t + '"' + (type === t ? ' selected' : '') + '>' + labels[t] + '</option>';
            });
            html += '</select>';
            html += '</div>';
            // URL（整行）
            html += '<div class="ghhelper-proxy-form-field ghhelper-proxy-form-field-full" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">URL</label>';
            html += '<input class="ghhelper-input" data-form-field="url" data-ghhelper-nt="1" value="' + url + '" placeholder="https://example.com/https://github.com">';
            html += '</div>';
            // 地区
            html += '<div class="ghhelper-proxy-form-field" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">地区</label>';
            html += '<input class="ghhelper-input" data-form-field="region" data-ghhelper-nt="1" value="' + region + '">';
            html += '</div>';
            // 启用
            html += '<div class="ghhelper-proxy-form-field" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">启用</label>';
            html += '<label class="ghhelper-toggle" data-ghhelper-nt="1"><input type="checkbox" data-form-field="enabled"' + (enabled ? ' checked' : '') + '><span class="ghhelper-toggle-slider"></span></label>';
            html += '</div>';
            // 备注（整行）
            html += '<div class="ghhelper-proxy-form-field ghhelper-proxy-form-field-full" data-ghhelper-nt="1">';
            html += '<label class="ghhelper-proxy-form-label" data-ghhelper-nt="1">备注</label>';
            html += '<input class="ghhelper-input" data-form-field="desc" data-ghhelper-nt="1" value="' + desc + '">';
            html += '</div>';
            html += '</div>';
            // 操作按钮
            html += '<div class="ghhelper-proxy-form-actions" data-ghhelper-nt="1">';
            html += '<button class="ghhelper-btn" data-form-cancel="1" data-ghhelper-nt="1">取消</button>';
            html += '<button class="ghhelper-btn ghhelper-btn-primary" data-form-save="1" data-form-mode="' + mode + '"' + (isEdit ? ' data-form-id="' + this._escapeHtml(proxy.id) + '"' : '') + ' data-ghhelper-nt="1">保存</button>';
            html += '</div>';
            html += '</div>';
            return html;
        },

        _showEditForm(id) {
            const proxy = StorageManager.getProxies().find(p => p.id === id);
            if (!proxy) {
                alert('该加速源已被删除');
                this._renderGroups();
                return;
            }
            // 渲染：替换该卡片的 innerHTML 为表单
            const listEl = document.getElementById('ghhelper-proxy-list');
            if (!listEl) return;
            const cardEl = listEl.querySelector('[data-proxy-id="' + id + '"]');
            if (!cardEl) return;
            cardEl.innerHTML = this._renderEditForm('edit', proxy);
            cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        },

        _showAddForm() {
            // 在列表顶部插入一张临时卡片，展开为添加表单
            const listEl = document.getElementById('ghhelper-proxy-list');
            if (!listEl) return;
            // 若已有临时卡片，先移除
            const existing = listEl.querySelector('[data-proxy-id="__add__"]');
            if (existing) existing.remove();
            const tempCard = document.createElement('div');
            tempCard.className = 'ghhelper-proxy-card';
            tempCard.setAttribute('data-proxy-id', '__add__');
            tempCard.setAttribute('data-ghhelper-nt', '1');
            tempCard.setAttribute('data-ghhelper-element', '1');
            tempCard.innerHTML = this._renderEditForm('add', { type: 'download', enabled: true });
            listEl.insertBefore(tempCard, listEl.firstChild);
            tempCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },

        _handleFormSave(saveBtn) {
            const formEl = saveBtn.closest('.ghhelper-proxy-form');
            if (!formEl) return;
            const mode = saveBtn.dataset.formMode;
            const id = saveBtn.dataset.formId;
            const get = (field) => {
                const el = formEl.querySelector('[data-form-field="' + field + '"]');
                if (!el) return '';
                if (el.type === 'checkbox') return el.checked;
                return el.value.trim();
            };
            const showError = (field, msg) => {
                const fieldEl = formEl.querySelector('[data-form-field="' + field + '"]');
                if (!fieldEl) return;
                const wrapper = fieldEl.closest('.ghhelper-proxy-form-field');
                if (!wrapper) return;
                let errEl = wrapper.querySelector('.ghhelper-proxy-form-error');
                if (!errEl) {
                    errEl = document.createElement('div');
                    errEl.className = 'ghhelper-proxy-form-error';
                    errEl.setAttribute('data-ghhelper-nt', '1');
                    wrapper.appendChild(errEl);
                }
                errEl.textContent = msg;
            };

            const name = get('name');
            const url = get('url');
            const type = get('type');
            const region = get('region');
            const desc = get('desc');
            const enabled = get('enabled');

            // 校验
            if (!name) { showError('name', '名称必填'); return; }
            if (!url) { showError('url', 'URL 必填'); return; }
            if (!/^https?:\/\//.test(url) && !/^ssh:\/\//.test(url)) {
                showError('url', 'URL 必须以 http(s):// 或 ssh:// 开头');
                return;
            }

            const updates = { name, url, type, region, desc, enabled };
            if (mode === 'edit') {
                const ok = ProxyManager.editProxy(id, updates);
                if (!ok) {
                    alert('该加速源已被删除');
                }
            } else {
                ProxyManager.addCustom(updates);
            }
            // 保存成功：重渲 Chip + 分组
            this._renderChipRow();
            this._renderGroups();
            DOMRenderer.reprocessAll();
        },

        renderFeatureTab(body) {
            const items = [
                { key: 'groupAndSort', icon: '📁', label: '文件分组排序', desc: '按 OS/平台分组，当前系统优先排序', impact: 'Release 文件列表顺序与色块标记' },
                { key: 'downloadCount', icon: '📥', label: '显示下载量', desc: '从 GitHub API 获取每个文件的下载次数', impact: '文件行右侧显示下载量图标+数字' },
                { key: 'replaceTime', icon: '🕐', label: '精确时间替换', desc: '将"3天前"替换为"2026-07-13 14:30"', impact: '关闭以兼容中文化脚本，开启后两者可能冲突' },
                { key: 'collapsibleNotes', icon: '📖', label: '可折叠更新日志', desc: '将更新日志包进可折叠区域', impact: 'Release 标题下方显示"更新日志"折叠栏' },
                { key: 'proxyButtons', icon: '⚡', label: '加速下载按钮', desc: 'Release 文件、Raw、Clone、SSH 旁显示加速下载按钮', impact: '文件行右侧显示加速源按钮+下拉菜单；Raw 按钮旁加速；Code 菜单 Clone/SSH 下方加速' },
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
                    // 功能开关特定处理
                    if (this.dataset.feature === 'scrollToTop') {
                        if (this.checked) DOMRenderer.injectScrollToTop();
                        else DOMRenderer.removeScrollToTop();
                    }
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

    // 一次性初始化：注册菜单、注入 CSS、注入设置按钮
    // 这些操作只需执行一次，多次调用也不会重复（内部有幂等检查）
    let _oneTimeSetupDone = false;
    function oneTimeSetup() {
        if (_oneTimeSetupDone) return;
        _oneTimeSetupDone = true;
        StorageManager.initProxies();
        DOMRenderer.injectCSS();
        DOMRenderer.injectGearButton();

        if (!window.__ghhelperDropdownBound) {
            window.__ghhelperDropdownBound = true;
            document.addEventListener('click', function (e) {
                if (!e.target.closest('.ghhelper-proxy-dropdown')) {
                    document.querySelectorAll('.ghhelper-dropdown-open').forEach(el => {
                        el.classList.remove('ghhelper-dropdown-open');
                    });
                }
            });
        }

        if (StorageManager.isFeatureEnabled('scrollToTop')) {
            DOMRenderer.injectScrollToTop();
        }

        if (StorageManager.isFeatureEnabled('replaceTime')) {
            // 时间替换：首次执行一次全量替换
            // 后续由全局 observer 检测 relative-time 新增时增量替换（见 startGlobalObserver）
            DOMRenderer.replaceRelativeTimes();
        }
    }

    // 根据当前页面 pathname 分发到对应处理函数
    // 每个处理函数内部都有幂等检查，可安全重复调用
    function routeByPathname() {
        const pathname = window.location.pathname;
        LOG('routeByPathname, pathname:', pathname);

        // Release 页面：处理 details/资产/更新日志
        if (/^\/[^/]+\/[^/]+\/releases/.test(pathname)) {
            processAllDetails();
            return;
        }

        // 仓库主页：处理 Clone/SSH 加速源
        // 通过 __primerPortalRoot__ 检测（Code 下拉菜单打开时才会有）
        if (document.querySelector('#repository-container-header:not([hidden])')) {
            const portal = document.getElementById('__primerPortalRoot__');
            if (portal) {
                DOMRenderer.processCloneButtons(portal);
                DOMRenderer.processSSHButtons(portal);
            }
            return;
        }

        // 文件查看页：处理 Raw 加速按钮
        // processRawButtons 内部会检查 raw-button 是否存在
        DOMRenderer.processRawButtons();
    }

    // 初始化入口（urlchange / 首次加载 / turbo:load 调用）
    let _routeTimer = null;
    function init() {
        try {
            oneTimeSetup();
            updatePathCache(); // 更新路径分流缓存，供全局 observer 使用
            routeByPathname();
            // 延迟再处理一次，规避 GitHub SPA 异步渲染
            // 清除上一次的 timer，避免 urlchange 频繁触发时堆积
            if (_routeTimer) clearTimeout(_routeTimer);
            _routeTimer = setTimeout(() => {
                _routeTimer = null;
                // SPA 异步渲染后 #repository-container-header 可能延迟出现，再更新一次
                updatePathCache();
                routeByPathname();
            }, 1500);
        } catch (e) {
            LOG('init 异常:', e.message);
        }
    }

    // processAllDetails 的缓存状态（模块级，避免闭包累积和高频重复处理）
    let _lastDetailsCount = 0;
    let _lastDetailsPath = '';
    // processAllDetails 防抖 timer：合并 observer 高频触发
    let _processAllDetailsTimer = null;

    // 防抖版本：合并 100ms 内的多次触发，避免 observer 高频调用 processAllDetails
    // 仅用于全局 observer 回调；init/toggle 等直接调用 processAllDetails 即时处理
    function processAllDetailsDebounced() {
        if (_processAllDetailsTimer) return;
        _processAllDetailsTimer = setTimeout(() => {
            _processAllDetailsTimer = null;
            processAllDetails();
        }, 100);
    }

    function processAllDetails() {
        const pathname = window.location.pathname;
        if (!/^\/[^/]+\/[^/]+\/releases/.test(pathname)) return;
        const repoInfo = DOMRenderer.getRepoInfo();
        if (!repoInfo) return;

        // 缓存 details 数量，避免高频触发时重复处理
        // 仅当 details 数量变化时才执行完整处理
        const detailsList = document.querySelectorAll('details');
        const detailsCount = detailsList.length;
        if (detailsCount === 0) return;

        // 排除脚本自身的 wrapper details 后的数量
        let realDetailsCount = 0;
        for (const d of detailsList) {
            if (!d.hasAttribute('data-ghhelper-wrapper') &&
                !d.hasAttribute('data-ghhelper-notes-wrap')) realDetailsCount++;
        }
        // 数量未变且路径未变则跳过（高频触发时的快速短路）
        if (realDetailsCount === _lastDetailsCount && _lastDetailsPath === pathname) {
            LOG('  processAllDetails 跳过: details 数量未变 (' + realDetailsCount + ')');
            return;
        }
        _lastDetailsCount = realDetailsCount;
        _lastDetailsPath = pathname;
        LOG('processAllDetails 调用, pathname:', pathname, ', details 数量:', realDetailsCount);

        if (StorageManager.isFeatureEnabled('collapsibleNotes')) {
            DOMRenderer.processReleaseNotes();
        }

        let assetCount = 0;
        detailsList.forEach(details => {
            // 跳过更新日志折叠区，避免误判为 Assets 容器
            // 跳过脚本自身创建的 wrapper details（签名/校验折叠区），否则 wrapper 内的签名文件链接
            // 会让 hasDownloadLink=true，导致 wrapper 被误识别为 Assets，在内部又创建嵌套 wrapper
            if (details.hasAttribute('data-ghhelper-notes-wrap') ||
                details.hasAttribute('data-ghhelper-wrapper')) return;
            // 只认 details 的直接 summary，避免取到嵌套 wrapper 的 summary
            const summary = details.querySelector(':scope > summary');
            const hasDownloadLink = !!details.querySelector('a[href*="/releases/download/"],a[href*="/archive/"]');
            const isAssetsByText = summary && /Assets|资源|资产/i.test(summary.textContent);
            if (hasDownloadLink || isAssetsByText) {
                assetCount++;
                DOMRenderer.processReleaseBox(details);
            }
        });
        LOG('  匹配到 Assets 的 details:', assetCount, '个');
    }

    // ============================================================
    // 10. 全局 MutationObserver（参考 Github 增强 - 高速下载.js 架构）
    // ============================================================
    // 一个全局 observer 监听 document 的 childList+subtree
    // 回调中根据 pathname 分流，精确匹配 addedNodes 的 tagName/dataset/className
    // 不使用 isScriptMutation 过滤，因为每个处理函数内部都有幂等检查
    // 每个处理函数（processAllDetails/processCloneButtons 等）内部都会检查目标元素是否已存在

    let _globalObserverStarted = false;
    // 路径分流缓存：在 urlchange 时更新，避免 observer 回调中高频 querySelector
    let _isReleasePage = false;
    let _isRepoHome = false;
    function updatePathCache() {
        const pathname = location.pathname;
        _isReleasePage = pathname.indexOf('/releases') > -1;
        // 仓库主页特征：有 #repository-container-header 且非隐藏
        // 仅在非 Release 页面时检查，避免重复 querySelector
        _isRepoHome = !_isReleasePage &&
            document.querySelector('#repository-container-header:not([hidden])') !== null;
    }

    function startGlobalObserver() {
        if (_globalObserverStarted) return;
        _globalObserverStarted = true;
        updatePathCache();

        // 全局 observer 回调：精确匹配 addedNodes 的特征，避免 expensive querySelector
        // 找到第一个匹配即退出（return），避免遍历所有 addedNodes
        // 处理函数内部都有幂等检查，可安全重复调用
        const callback = (mutationsList) => {
            // 使用缓存的路径分流结果，避免每次 mutation 都做 querySelector
            const isReleasePage = _isReleasePage;
            const isRepoHome = _isRepoHome;

            for (const mutation of mutationsList) {
                for (const target of mutation.addedNodes) {
                    if (target.nodeType !== 1) continue;
                    // 跳过脚本自身元素（快速短路，避免 expensive 查询）
                    if (isScriptNode(target)) continue;

                    // ===== Release 页面：检测资产列表容器新增 =====
                    if (isReleasePage) {
                        // GitHub Release 资产列表容器特征
                        if (target.tagName === 'DIV' && target.dataset.viewComponent === 'true' && target.classList[0] === 'Box') {
                            LOG('全局 observer: Release Box 新增');
                            processAllDetailsDebounced();
                            return;
                        }
                        // 新增的 details 元素
                        if (target.tagName === 'DETAILS') {
                            LOG('全局 observer: details 新增');
                            processAllDetailsDebounced();
                            return;
                        }
                        // 新增的 include-fragment（Assets 异步加载容器）
                        if (target.tagName === 'INCLUDE-FRAGMENT') {
                            LOG('全局 observer: include-fragment 新增');
                            processAllDetailsDebounced();
                            return;
                        }
                        // 新增的下载链接（资产展开后异步加载）
                        if (target.tagName === 'A') {
                            const href = target.getAttribute('href') || '';
                            if (href.indexOf('/releases/download/') > -1 || href.indexOf('/archive/') > -1) {
                                LOG('全局 observer: 下载链接新增');
                                processAllDetailsDebounced();
                                return;
                            }
                        }
                    }

                    // ===== 仓库主页：检测 Code 下拉菜单 portal 内容变化 =====
                    if (isRepoHome) {
                        // Code 下拉菜单打开时的 portal 子元素
                        if (target.tagName === 'DIV' && target.parentElement && target.parentElement.id === '__primerPortalRoot__') {
                            LOG('全局 observer: portal 子元素新增');
                            const portal = document.getElementById('__primerPortalRoot__');
                            if (portal) {
                                DOMRenderer.processCloneButtons(portal);
                                DOMRenderer.processSSHButtons(portal);
                            }
                            return;
                        }

                        // HTTPS/SSH tab 切换：React 重新渲染的 LocalTab 容器
                        if (target.tagName === 'DIV' && target.className && target.className.indexOf('LocalTab-module__') !== -1) {
                            LOG('全局 observer: LocalTab 切换');
                            const portal = document.getElementById('__primerPortalRoot__') || document;
                            if (target.querySelector('input[value^="https:"]')) {
                                DOMRenderer._clearSshRows();
                                DOMRenderer.processCloneButtons(portal);
                            } else if (target.querySelector('input[value^="git@"]')) {
                                DOMRenderer._clearCloneRows();
                                DOMRenderer.processSSHButtons(portal);
                            }
                            return;
                        }
                    }

                    // ===== 全局：检测 raw-button 新增（文件查看页） =====
                    if (target.tagName === 'A' && target.dataset && target.dataset.testid === 'raw-button') {
                        LOG('全局 observer: raw-button 新增');
                        DOMRenderer.processRawButtons();
                        return;
                    }

                    // ===== 全局：检测 relative-time 新增（时间替换） =====
                    if (target.tagName === 'RELATIVE-TIME' && !target.hasAttribute('data-ghhelper-time')) {
                        DOMRenderer.replaceOneTime(target);
                        continue;
                    }
                }
            }
        };

        const observer = new MutationObserver(callback);
        observer.observe(document, { childList: true, subtree: true });
        LOG('全局 MutationObserver 已启动');
    }

    // ============================================================
    // 11. 启动入口
    // ============================================================

    registerMenus();
    init();
    startGlobalObserver();

    // URL 变化监听：使用 Tampermonkey 原生 window.onurlchange
    // 若环境不支持（非 Tampermonkey），添加 fallback
    if (window.onurlchange === undefined) {
        // fallback：监听 popstate + 覆盖 history.pushState/replaceState
        // 仅在 pathname 变化时触发 urlchange 事件
        let _lastPath = window.location.pathname;
        const _checkUrlChange = () => {
            const newPath = window.location.pathname;
            if (newPath !== _lastPath) {
                _lastPath = newPath;
                window.dispatchEvent(new Event('urlchange'));
            }
        };
        const _origPushState = history.pushState;
        const _origReplaceState = history.replaceState;
        history.pushState = function () { const r = _origPushState.apply(this, arguments); _checkUrlChange(); return r; };
        history.replaceState = function () { const r = _origReplaceState.apply(this, arguments); _checkUrlChange(); return r; };
        window.addEventListener('popstate', _checkUrlChange);
        document.addEventListener('turbo:load', _checkUrlChange);
        document.addEventListener('pjax:end', _checkUrlChange);
    }
    window.addEventListener('urlchange', () => {
        LOG('urlchange 触发, pathname:', window.location.pathname);
        init();
    });

    LOG('=== GitHub 助手脚本加载完成, 版本 1.1.0 ===');
    LOG('  当前页面:', window.location.href);
    LOG('  功能状态:', JSON.stringify(StorageManager.getFeatures()));
    LOG('  GM 函数可用: getValue=' + (typeof GM_getValue !== 'undefined') + ', setValue=' + (typeof GM_setValue !== 'undefined') + ', registerMenu=' + (typeof GM_registerMenuCommand !== 'undefined'));

})();