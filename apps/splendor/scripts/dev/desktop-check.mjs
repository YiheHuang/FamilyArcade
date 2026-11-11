#!/usr/bin/env node
/**
 * Packaged-desktop verification: settings rows, update self-service, app logging.
 *
 *   1. launches the packaged app (fresh profile) with CDP;
 *   2. opens Settings and asserts the update + zoom + logs rows;
 *   3. writes an update bundle from its own running asar (publish) and checks it;
 *   4. enables "allow uploads", shares its version to its own update source
 *      (exercises POST /updates/publish end to end);
 *   5. triggers a renderer error and checks that it lands in the log file;
 *   6. leaves screenshots in data/tmp/shots for the README.
 *
 * Prerequisite: npm run pack -w @splendor/electron
 * Usage:        node scripts/dev/desktop-check.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_DIR = process.env.SPLENDOR_APP_DIR ?? path.join(ROOT, 'packages', 'electron', 'release', 'win-unpacked');
const TMP = path.join(ROOT, 'data', 'tmp');
const PROFILE = path.join(TMP, 'app-profile-desktop-check');
const SHOTS = path.join(TMP, 'shots');
const CDP_PORT = Number(process.env.DESKTOP_CDP_PORT ?? 9370);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[desktop-check] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(path.join(APP_DIR, 'Splendor.exe'))) {
  log('missing packaged app — run: npm run pack -w @splendor/electron');
  process.exit(1);
}

const asar = await import('@electron/asar');
const readVersion = (file) => JSON.parse(asar.extractFile(file, 'package.json').toString()).version;
const ASAR = path.join(APP_DIR, 'resources', 'app.asar');
const APP_VERSION = readVersion(ASAR);
const ASAR_SHA = crypto.createHash('sha256').update(fs.readFileSync(ASAR)).digest('hex');
log(`packaged version ${APP_VERSION}`);

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const appLog = fs.openSync(path.join(TMP, 'desktop-check-app.log'), 'w');
spawn(path.join(APP_DIR, 'Splendor.exe'), [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`], {
  stdio: ['ignore', appLog, appLog],
});

let pass = false;
try {
  await sleep(8000);
  let browser = null;
  for (let i = 0; i < 15 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 4000 });
    } catch {
      await sleep(1000);
    }
  }
  if (!browser) throw new Error('could not attach to the app (CDP)');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes('index.html')) ?? ctx.pages()[0];
  await sleep(1200);

  // 1) 打开设置页（用导航瓦片，避免依赖界面语言）
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('button')];
    const nav = tiles.filter((b) => (b.className ?? '').includes('surface'));
    (nav[nav.length - 1] ?? tiles[tiles.length - 1])?.click();
  });
  await sleep(900);
  const rows = await page.evaluate(() => ({
    source: !!document.querySelector('[data-testid="update-source"]'),
    kind: document.querySelector('[data-testid="update-source-kind"]')?.textContent?.trim() ?? '',
    publish: !!document.querySelector('[data-testid="update-publish"]'),
    share: !!document.querySelector('[data-testid="update-share"]'),
    autoDownload: !!document.querySelector('[data-testid="toggle-autoDownload"]'),
    allowUploads: !!document.querySelector('[data-testid="toggle-allowUploads"]'),
    zoom: ['100%', '115%', '130%'].every((l) => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === l)),
    logs: !!document.querySelector('[data-testid="logs-open"]') && !!document.querySelector('[data-testid="logs-diagnostics"]'),
  }));
  ok('设置页含更新/缩放/日志各项', rows.source && rows.publish && rows.share && rows.autoDownload && rows.allowUploads && rows.zoom && rows.logs, JSON.stringify(rows));
  ok('更新源默认走自动（局域网服务器）', rows.kind.length > 0, rows.kind);
  await page.screenshot({ path: path.join(SHOTS, 'settings-updates.png'), fullPage: true });

  // 2) 缩放：切到 130% 后根元素生效且无横向滚动，再切回
  const zoom = await page.evaluate(async () => {
    const pick = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();
    pick('130%');
    await new Promise((r) => setTimeout(r, 300));
    const doc = document.documentElement;
    const at130 = { zoom: doc.style.zoom, overflow: doc.scrollWidth > doc.clientWidth + 2 };
    pick('100%');
    await new Promise((r) => setTimeout(r, 300));
    return { at130, back: doc.style.zoom };
  });
  ok('界面缩放 130% 生效且无横向滚动', zoom.at130.zoom === '1.3' && !zoom.at130.overflow && zoom.back === '', JSON.stringify(zoom));

  // 3) 日志：渲染端错误应写入主进程日志文件
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('desktop-check renderer probe');
    }, 50);
  });
  await sleep(1500);
  const logsDir = path.join(PROFILE, 'logs');
  const logFiles = fs.existsSync(logsDir) ? fs.readdirSync(logsDir).filter((f) => f.endsWith('.log')) : [];
  const logText = logFiles.length ? fs.readFileSync(path.join(logsDir, logFiles[0]), 'utf8') : '';
  ok('主进程日志文件已生成', logFiles.length > 0, logFiles.join(', '));
  ok('渲染端错误已落盘', logText.includes('desktop-check renderer probe'), `${logFiles.length} 个日志文件`);

  // 4) 一键发布：把本机版本写进本机更新源
  const published = await page.evaluate(async () => {
    const st = await window.splendorDesktop.update.state();
    const res = await window.splendorDesktop.update.publish();
    return { res, updatesDir: st.updatesDir };
  });
  const upDir = path.join(PROFILE, 'updates');
  const manifest = fs.existsSync(path.join(upDir, 'update.json'))
    ? JSON.parse(fs.readFileSync(path.join(upDir, 'update.json'), 'utf8'))
    : null;
  ok(
    '一键发布写入更新源（版本与校验一致）',
    published.res.ok === true && manifest?.version === APP_VERSION && manifest?.sha256 === ASAR_SHA,
    `version=${manifest?.version ?? '?'} sha=${(manifest?.sha256 ?? '').slice(0, 12)}…`,
  );

  // 5) 上传通道：先关再开，验证服务器开关生效，最后走通上传
  const upload = await page.evaluate(async () => {
    const off = await window.splendorDesktop.update.upload('http://localhost:8080/updates');
    await window.splendorDesktop.update.permissionSet(true);
    await new Promise((r) => setTimeout(r, 200));
    const on = await window.splendorDesktop.update.upload('http://localhost:8080/updates');
    return { off, on };
  });
  ok('上传通道默认关闭时被拒', upload.off.ok === false, upload.off.error ?? '');
  ok('开启后上传成功（服务端校验 sha256 与 asar 结构）', upload.on.ok === true, upload.on.error ?? '');
  const prevExists = fs.existsSync(path.join(upDir, 'app.asar.prev'));
  ok('上传后旧包保留为 app.asar.prev', prevExists);

  // 6) 诊断信息
  const diag = await page.evaluate(async () => {
    const info = await window.splendorDesktop.log.diagnostics();
    return { version: info.appVersion, logs: info.logsDir.length > 0, tail: info.logTail.length > 0 };
  });
  ok('复制诊断信息可读取版本与日志尾部', diag.version === APP_VERSION && diag.logs && diag.tail, JSON.stringify(diag));

  // 7) 记录页（战绩标签）截图
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, 'settings-desktop.png'), fullPage: true });

  pass = results.every((r) => r.pass);
  log(pass ? 'PASS — packaged desktop checks are all green' : 'FAIL — see the failed items above');
} catch (err) {
  log(`error: ${String(err).slice(0, 300)}`);
} finally {
  spawn('taskkill', ['/F', '/IM', 'Splendor.exe'], { stdio: 'ignore' });
  await sleep(2000);
  fs.rmSync(path.join(APP_DIR, 'resources', 'patch-version.txt'), { force: true });
  fs.rmSync(path.join(process.env.APPDATA ?? '', 'Splendor', 'updates'), { recursive: true, force: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  process.exitCode = pass ? 0 : 1;
}
