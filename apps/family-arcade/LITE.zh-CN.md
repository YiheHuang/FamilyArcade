# 家庭游戏馆 Lite

一个极轻量的启动器：装好启动器，想玩哪款再下载哪款。

- 安装包里只有启动器和游戏目录，不包含游戏本体。
- 安装包使用 Tauri 的 WebView2 引导器：缺少 WebView2 时会先自动检测并安装，再打开启动器；之后才开始下载游戏。
- 每款游戏是一个便携 ZIP 包，约 4–7 MB。
- 已安装游戏放在 `%LOCALAPPDATA%\com.familyarcade.lite\games`。
- 在 **设置 → 已安装游戏** 里可以删除游戏、查看占用空间。
- 想要一次装完，仍可使用 **离线版** 或 **精简版** 一体化安装包。

## 私有下载

游戏包放在私有 GitHub Release 里。Lite 每台设备需要设置一次只读 GitHub 令牌：

1. GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token。
2. Repository access 选择 **Only select repositories** → `YiheHuang/FamilyArcade`。
3. Repository permissions：**Contents: Read-only**、**Metadata: Read-only**。
4. 生成后粘贴到 **Lite → 设置 → GitHub 下载密钥**。

令牌只保存在本机应用配置目录，仅用于读取 Release 资源。设备丢失时在 GitHub 撤销即可。
如果以后 Release 资源改为公开，Lite 不需要令牌也能下载。

## 构建

```bash
npm install
npm run build:lite
npx tauri build --features lite --bundles nsis \
  --config src-tauri/tauri.lite.conf.json
```

先运行 `node tools/prepare-hub.mjs` 组装便携游戏目录，再运行
`node tools/build-lite-packages.mjs` 生成游戏包和目录。
