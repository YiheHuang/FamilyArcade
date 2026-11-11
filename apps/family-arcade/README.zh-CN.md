# 家庭游戏馆 · Family Arcade

**一个启动器，27 款游戏，一张桌子。**

Family Arcade 是整个合集的正门：27 款离线家庭游戏，全部支持 AI、同屏热座和局域网。
装这一个程序就能启动所有游戏；也可以只下载想玩的那一款的独立安装包。

![家庭游戏馆启动器](docs/screenshots/zh/home.jpg)

## 它做什么

- **一个网格，全部游戏。** 搜索、按“经典 / 家庭牌桌 / 小游戏”筛选，一键启动。
- **便携游戏目录。** 每款游戏作为独立 Tauri 程序运行，有自己的局域网中继和存档，
  不需要再逐个安装。
- **独立安装包仍然保留。** 只想玩某一款，可直接下载那一款。
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

一体化安装包包含 `games/<slug>/game.exe` 和 `dist`；这些目录由
`node tools/prepare-hub.mjs` 从共享构建产物组装。

## 已知限制

- 一体化安装包较大，因为内含 27 款便携游戏。
- 游戏在独立窗口中打开，启动器本身不内嵌游戏画面。
- 安装包未签名，Windows SmartScreen 会提示一次。

完整合集与逐游戏安装包见 [根 README](../../README.md)。
