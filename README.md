# Liora-Wells/UserScript

🔨 自用的一些油猴脚本，**有什么需求、建议、问题直接提 [Issues](https://github.com/Liora-Wells/UserScript/issues/new/choose)** ，觉得好用请点个 ⭐ 鼓励一下~

## 脚本列表

|  | 脚本名称 | 脚本功能 | 安装 |
|---|---|---|---|
|  | **GitHub 助手** | GitHub Release 增强显示 + 多类型加速下载（Clone / SSH / Raw / ZIP），兼容中文化插件 | [**Greasy Fork**](https://update.greasyfork.org/scripts/587965/GitHub%20%E5%8A%A9%E6%89%8B.user.js) \| [**GitHub Raw**](https://github.com/Liora-Wells/UserScript/raw/main/github-helper.user.js) |

> **Note**
> *脚本列表会随心补充，可能时多时少~*

*所有脚本均在 **Chrome、Firefox、Edge 浏览器** 下测试使用，推荐搭配 **Tampermonkey** 或 **Violentmonkey** 扩展。*

## 如何安装/使用脚本？

要使用任何脚本，首先需要浏览器安装一个用户脚本管理器扩展。推荐以下几款（任选其一即可）：

| 扩展 | Chrome | Firefox | Edge | 说明 |
|---|---|---|---|---|
| **Tampermonkey** | [安装](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) | [安装](https://addons.mozilla.org/firefox/addon/tampermonkey/) | [安装](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) | 闭源，功能最全，生态最广 |
| **Violentmonkey** | [安装](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) | [安装](https://addons.mozilla.org/firefox/addon/violentmonkey/) | [安装](https://microsoftedge.microsoft.com/addons/detail/violentmonkey/eeagobfjdenkkddmbclomhiblgggliao) | **开源**，轻量性能更好，推荐 Firefox 用户使用 |

- 点击表格 **`[安装]`** 链接，浏览器会弹出脚本管理器的安装提示页面，再点击 **`[安装]`** 即可。
- 如果要重装脚本，请记得在脚本管理器扩展的**回收站中彻底删除**脚本后再去重新安装。

> **Tip**
> - 如果访问官方商店不便，可以前往第三方聚合站 **[crxsoso.com](https://www.crxsoso.com/)** 搜索下载 Tampermonkey / Violentmonkey 的 `.crx` / `.xpi` 安装包。
> - 其他基于 **Chromium** 内核的浏览器（如国内套皮浏览器）一般都可以使用 Chrome 扩展。

> **Important**
> - 本项目脚本主要在 **Tampermonkey** 下测试，**Violentmonkey** 同样兼容，其他脚本管理器（如 Greasemonkey）未做保证。

## Tampermonkey `v5.0.0` 后脚本在 `部分网站` 无法正常运行？

Tampermonkey 为了顺应 Chrome 的 Manifest V3 要求，在 v5.0.0 版本中修改了 CSP 相关选项的默认值。

你只需要去 Tampermonkey 设置中，先把最顶端的第一个选项 `配置模式:` 默认的 `新手` 改为 `高级`。

然后翻到下面的 `安全` 选项区域，找到 `修改内容安全策略（CSP）头信息:` 把默认的 `自动` 改为 **`全部移除`** 并点击下面一点的 `保存` 按钮即可解决。

## Tampermonkey `v5.2.0` 后脚本无法正常运行？

因为其 v5.2.0 版本转为了 Manifest V3，所以需要在浏览器的**扩展管理**界面**启用 `开发者模式`** 才能正常运行脚本！

## 新版本 Chrome 系浏览器无法运行任何脚本？

新版本需要在**扩展管理**界面 Tampermonkey(篡改猴) 详情中**启用 `允许运行用户脚本`** 才能正常运行脚本！

## 鸣谢

本项目在开发过程中参考了以下项目的思路与实现，在此表示感谢：

- **[XIU2/UserScript](https://github.com/XIU2/UserScript)** —— [**Github 增强 - 高速下载**](https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js)
  `GitHub 助手` 脚本在加速下载源设计、Clone/SSH/Raw 多类型加速等思路与 UI 风格上参考了该项目。

## License

本项目采用 [MIT License](./LICENSE) 开源。
