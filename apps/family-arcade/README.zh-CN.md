[English](README.md) · 简体中文

# 家庭游戏馆

**一个启动器，53 款游戏，一张桌子。**

家庭游戏馆是整个合集的正门：53 款离线家庭游戏，全部支持 AI、同屏热座和局域网。
完整版和精简版一次装好全部游戏；Lite 则可以只下载想玩的那一款。

![家庭游戏馆启动器](docs/screenshots/zh/home.jpg)

**运行时：** **离线版**内含 WebView2 运行时；**精简版**改用 Tauri 的小型引导器；**Lite** 只下载你选择的游戏。每个便携游戏也都带有 `WebView2Loader.dll`。见 [`RUNTIME.md`](RUNTIME.md) 和 [Lite 说明](LITE.zh-CN.md)。

## 它做什么

- **一个网格，全部游戏。** 搜索、按“经典 / 家庭牌桌 / 小游戏”筛选，一键启动。
- **便携游戏目录。** 每款游戏作为独立 Tauri 程序运行，有自己的局域网中继和存档，
  不需要再逐个安装。
- **三种安装方式。** 完整离线版、不带运行时的精简版，以及按需下载游戏的 Lite。
- **小细节。** 最近玩过、键盘焦点、减少动效、中英双语。
- **私密。** 无账号、无遥测、无广告、不需要联网。

## 构建

```bash
npm install
npm run dev            # 浏览器预览启动器
npm run check
npm run shots          # 截图（需先运行 dev）
npx tauri build --bundles nsis
```

离线版和精简版包含 `games/<slug>/game.exe` 和 `dist`；Lite 则按需下载同样的便携目录。
这些目录由 `node tools/prepare-hub.mjs` 从共享构建产物组装。

## 已知限制

- 一体化安装包较大，因为内含 53 款便携游戏。
- 游戏在独立窗口中打开，启动器本身不内嵌游戏画面。
- 安装包未签名，Windows SmartScreen 会提示一次。

完整合集与三种启动器见 [根 README](../../README.zh-CN.md)。
