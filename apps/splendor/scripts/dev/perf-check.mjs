#!/usr/bin/env node
/**
 * Performance snapshot for the packaged Tauri app.
 *
 * Measures cold start (spawn → /healthz), time to a mounted UI, idle memory
 * (app + its WebView2 children) and the on-disk footprint, then writes
 * `docs/perf.md` so the numbers are versioned with the source.
 *
 * Prerequisite: npm run build -w @splendor/desktop
 * Usage:        node scripts/dev/perf-check.mjs
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'splendor-desktop.exe');
const TMP = path.join(ROOT, 'data', 'tmp');
const PROFILE = path.join(TMP, 'app-profile-perf');
const CDP_PORT = Number(process.env.PERF_CDP_PORT ?? 9336);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[perf] ${m}`);

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
const exeSize = fs.statSync(APP).size;
const nsisDir = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installer = fs.existsSync(nsisDir) ? fs.readdirSync(nsisDir).filter((f) => f.endsWith('.exe')).sort().pop() : null;
const installerSize = installer ? fs.statSync(path.join(nsisDir, installer)).size : 0;
// 安装后体积 = exe + 同目录运行库（WebView2 由系统提供，不计入）
const dlls = fs
  .readdirSync(path.dirname(APP))
  .filter((f) => f.toLowerCase().endsWith('.dll'))
  .reduce((sum, f) => sum + fs.statSync(path.join(path.dirname(APP), f)).size, 0);
const installSize = exeSize + dlls;

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const appLog = fs.openSync(path.join(TMP, 'perf-app.log'), 'w');
const t0 = Date.now();
const child = spawn(APP, [], {
  stdio: ['ignore', appLog, appLog],
  env: { ...process.env, SPLENDOR_CDP_PORT: String(CDP_PORT), SPLENDOR_DATA_DIR: path.join(PROFILE, 'data') },
});

let startupMs = 0;
for (let i = 0; i < 120 && startupMs === 0; i++) {
  for (let p = 8080; p <= 8085 && startupMs === 0; p++) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/healthz`);
      if (res.ok) startupMs = Date.now() - t0;
    } catch {
      /* keep probing */
    }
  }
  if (startupMs === 0) await sleep(100);
}
log(`服务器就绪：${startupMs} ms`);

let uiMs = 0;
let browser = null;
for (let i = 0; i < 30 && !browser; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 3000 });
  } catch {
    await sleep(500);
  }
}
if (browser) {
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) ?? ctx.pages()[0];
  for (let i = 0; i < 200 && uiMs === 0; i++) {
    const mounted = await page.evaluate(() => (document.querySelector('#root')?.innerText ?? '').length > 0).catch(() => false);
    if (mounted) uiMs = Date.now() - t0;
    else await sleep(50);
  }
  log(`界面挂载：${uiMs} ms`);
}

// 空闲内存：应用进程 + 它的 WebView2 子进程（按数据目录归属）
await sleep(8000);
function memoryMB() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'splendor-desktop.exe') -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*app-profile-perf*') } | Measure-Object -Property WorkingSetSize -Sum | Select-Object -ExpandProperty Sum"`,
      { encoding: 'utf8' },
    ).trim();
    const bytes = Number(out);
    return Number.isFinite(bytes) && bytes > 0 ? bytes / 1024 / 1024 : 0;
  } catch {
    return 0;
  }
}
const idleMemMB = memoryMB();
log(`空闲内存（应用 + WebView2 子进程）：${idleMemMB.toFixed(0)} MB`);

await browser?.close().catch(() => {});
spawn('taskkill', ['/F', '/IM', 'splendor-desktop.exe'], { stdio: 'ignore' });
await sleep(1200);
fs.rmSync(PROFILE, { recursive: true, force: true });

const report = `# Performance snapshot

Measured on the development machine with \`node scripts/dev/perf-check.mjs\`
(the same command can be re-run after any change to keep the numbers honest).

| Metric | Value |
| --- | --- |
| Version | ${version} |
| Cold start (spawn → HTTP \`/healthz\` answering) | ${startupMs} ms |
| Time to mounted UI | ${uiMs} ms |
| Idle memory (app + WebView2 children) | ${idleMemMB.toFixed(0)} MB |
| Installed footprint (exe + runtime DLLs) | ${(installSize / 1024 / 1024).toFixed(2)} MB |
| Installer | ${installerSize ? `${(installerSize / 1024 / 1024).toFixed(2)} MB` : 'n/a'} |
| Measured at | ${new Date().toISOString().slice(0, 10)} |

Notes:

- The Chromium runtime is **not** bundled: the app uses the system WebView2 (shared by
  every WebView2 app on the machine), which is where the size difference comes from.
- LAN hosting, the embedded frontend and the updater all run inside the same executable.
`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'perf.md'), report, 'utf8');
log('已写入 docs/perf.md');
void child;
