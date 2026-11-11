#!/usr/bin/env node
/**
 * Tauri shell checks (phase 0 gate).
 *
 *   1. launches the built app (WebView2 remote debugging enabled);
 *   2. attaches with Playwright over CDP and asserts the injected bridge exists
 *      (`window.splendorDesktop` + the relay probe) and that the client booted;
 *   3. opens a WebSocket from Node and verifies the full relay round trip
 *      (browser -> Rust -> host webview -> Rust -> browser) using the probe echo;
 *   4. checks the HTTP side: /healthz, the embedded index.html, /updates/* 404;
 *   5. checks the data dir (%APPDATA%/Splendor) and the log file;
 *   6. reports installer / executable sizes.
 *
 * Prerequisite: npm run build -w @splendor/desktop
 * Usage:        node scripts/dev/tauri-check.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESKTOP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release');
const APP = path.join(DESKTOP, 'splendor-desktop.exe');
const CDP_PORT = Number(process.env.TAURI_CDP_PORT ?? 9333);
const TMP = path.join(ROOT, 'data', 'tmp');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[tauri-check] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}

// 体积报告
const exeSize = fs.statSync(APP).size;
const nsisDir = path.join(DESKTOP, 'bundle', 'nsis');
const installer = fs.existsSync(nsisDir) ? fs.readdirSync(nsisDir).find((f) => f.endsWith('.exe')) : null;
const installerSize = installer ? fs.statSync(path.join(nsisDir, installer)).size : 0;
log(`可执行文件 ${(exeSize / 1024 / 1024).toFixed(2)} MB · 安装包 ${installer ? `${installer} ${(installerSize / 1024 / 1024).toFixed(2)} MB` : '(未构建)'}`);
const appData = process.env.APPDATA ?? '';
const dataDir = path.join(appData, 'Splendor');
const logsBefore = fs.existsSync(path.join(dataDir, 'logs')) ? fs.readdirSync(path.join(dataDir, 'logs')) : [];

fs.mkdirSync(TMP, { recursive: true });
const appLog = fs.openSync(path.join(TMP, 'tauri-app.log'), 'w');
const env = {
  ...process.env,
  // 仅测试：让应用为 WebView2 打开调试端口（Playwright 通过 CDP 接管窗口）
  SPLENDOR_CDP_PORT: String(CDP_PORT),
};
const child = spawn(APP, [], { stdio: ['ignore', appLog, appLog], env });

let pass = false;
try {
  await sleep(6000);
  let browser = null;
  for (let i = 0; i < 15 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 4000 });
    } catch {
      await sleep(1000);
    }
  }
  ok('Playwright 能通过 WebView2 CDP 接管应用窗口', !!browser, browser ? '' : '连接失败');

  if (browser) {
    const ctx = browser.contexts()[0];
    const page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) ?? ctx.pages()[0];
    await sleep(1500);
    const probe = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      mounted: (document.querySelector('#root')?.innerText ?? '').length > 0,
      bridge: !!window.splendorDesktop,
      port: window.splendorDesktop?.serverPort ?? 0,
      version: window.splendorDesktop?.appVersion ?? '',
      hasLog: !!window.splendorDesktop?.log,
      relay: !!window.__lanRelay,
    }));
    ok('页面加载并挂载前端', probe.mounted, probe.url);
    ok('注入桥接对象 window.splendorDesktop（含端口/版本/日志）', probe.bridge && probe.port > 0 && !!probe.version && probe.hasLog, JSON.stringify({ port: probe.port, version: probe.version }));
    ok('中继探针已挂载', probe.relay);

    // WS 往返：Node 客户端 → Rust → 主机前端（权威端 + 探针）→ Rust → Node 客户端
    const { WebSocket } = await import('ws');
    const port = probe.port;
    const rt = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const tag = `probe-${Math.random().toString(16).slice(2)}`;
      const seen = [];
      const timer = setTimeout(() => {
        ws.close();
        resolve({ ok: false, seen });
      }, 5000);
      ws.on('open', () => ws.send(tag));
      ws.on('message', (data) => {
        const text = String(data);
        seen.push(text.slice(0, 80));
        const hasWelcome = seen.some((m) => m.includes('"t":"welcome"') || m.includes('"t": "welcome"'));
        const hasEcho = seen.includes(tag);
        if (hasWelcome && hasEcho) {
          clearTimeout(timer);
          ws.close();
          resolve({ ok: true, tag, seen });
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ok: false, seen, reason: String(err).slice(0, 80) });
      });
    });
    ok('WS 中继往返（主机前端回 welcome，探针回显）', rt.ok, rt.ok ? rt.tag : JSON.stringify(rt.seen ?? rt.reason));

    // 主机前端的探针计数应已增长
    await sleep(600);
    const stats = await page.evaluate(() => window.__lanRelay?.stats ?? null);
    ok('主机前端确实参与了中继（探针计数）', !!stats && stats.msg >= 1 && stats.echo >= 1, JSON.stringify(stats));

    // HTTP 侧
    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.text()).catch(() => '');
    ok('/healthz 正常', health.trim() === 'ok', health.slice(0, 20));
    const index = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text()).catch(() => '');
    ok('内嵌前端可被浏览器访问（手机入房路径）', index.includes('<div id="root"') || index.includes('id="root"'), `${index.length} 字节`);
    const music = await fetch(`http://127.0.0.1:${port}/music/theme-1.ogg`);
    const musicBuf = music.ok ? Buffer.from(await music.arrayBuffer()) : Buffer.alloc(0);
    ok(
      '内嵌资源（音乐）可由浏览器取到',
      music.ok && musicBuf.length > 100 * 1024 && musicBuf.subarray(0, 4).toString('latin1') === 'OggS',
      `HTTP ${music.status} · ${(musicBuf.length / 1024).toFixed(0)} KB`,
    );
    const upd = await fetch(`http://127.0.0.1:${port}/updates/update.json`).then((r) => r.status).catch(() => 0);
    ok('/updates/* 未放置更新包时返回 404', upd === 404, `HTTP ${upd}`);
  }
} catch (err) {
  log(`出错：${String(err).slice(0, 300)}`);
} finally {
  spawn('taskkill', ['/F', '/IM', 'splendor-desktop.exe'], { stdio: 'ignore' });
  await sleep(1200);

  // 数据目录与日志
  const dataOk = fs.existsSync(dataDir);
  ok('数据目录为 %APPDATA%\\Splendor（与旧版一致）', dataOk, dataDir);
  const logsAfter = fs.existsSync(path.join(dataDir, 'logs')) ? fs.readdirSync(path.join(dataDir, 'logs')) : [];
  const logFile = logsAfter.find((f) => f.startsWith('main-') && f.endsWith('.log'));
  const logText = logFile ? fs.readFileSync(path.join(dataDir, 'logs', logFile), 'utf8') : '';
  ok('主进程日志已写入', !!logFile && logText.includes('内置局域网服务器已启动'), `${logFile ?? '(无)'} / ${logsBefore.length}→${logsAfter.length}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  console.log(`体积：exe ${(exeSize / 1024 / 1024).toFixed(2)} MB · 安装包 ${installer ? `${(installerSize / 1024 / 1024).toFixed(2)} MB` : '未构建'}`);
  if (installer && installerSize > 6 * 1024 * 1024) {
    console.log(`⚠️ 安装包超过 6MB 门槛（${(installerSize / 1024 / 1024).toFixed(2)} MB）`);
  }
  pass = failed.length === 0;
  process.exitCode = pass ? 0 : 1;
}
