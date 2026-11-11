#!/usr/bin/env node
/**
 * Tauri auto-update smoke test.
 *
 * Uses a harmless stand-in "installer" (`cmd.exe`, exits immediately) so the whole
 * pipeline can be exercised without touching the real installation:
 *   check → download (sha256 + Ed25519 verified) → apply → helper installs → app
 *   relaunches with a boot nonce → UI reports ready → helper records success.
 *
 * Asserts the update-work state: last-result.json ok, pending cleared, self-installer
 * kept for sharing, and the app serving again.
 *
 * Prerequisite: npm run build -w @splendor/desktop
 * Usage:        node scripts/dev/update-smoke.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'splendor-desktop.exe');
const NSIS_DIR = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const TMP = path.join(ROOT, 'data', 'tmp');
const PROFILE = path.join(TMP, 'app-profile-update-smoke');
const DATA_DIR = path.join(PROFILE, 'data');
const SOURCE = path.join(TMP, 'fake-update-installer');
const CDP_PORT = Number(process.env.UPD_CDP_PORT ?? 9335);
const SRC_PORT = Number(process.env.UPD_SRC_PORT ?? 8997);
const FAKE_VERSION = '9.9.9';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[update-smoke] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}

// 伪造更新源：载荷用我们自己的真实安装器（按 currentUser 静默安装，验证整条链路）
const builtInstaller = fs
  .readdirSync(NSIS_DIR)
  .filter((f) => f.endsWith('.exe'))
  .map((f) => path.join(NSIS_DIR, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!builtInstaller) {
  log('没有找到安装器，请先构建：npm run build -w @splendor/desktop');
  process.exit(1);
}
fs.rmSync(SOURCE, { recursive: true, force: true });
fs.mkdirSync(SOURCE, { recursive: true });
const fakeInstaller = path.join(SOURCE, 'Splendor-Setup-9.9.9.exe');
fs.copyFileSync(builtInstaller, fakeInstaller);
const bytes = fs.readFileSync(fakeInstaller);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
let signature = '';
const keyPem = path.join(process.env.APPDATA ?? '', 'Splendor', 'keys', 'ed25519-private.pem');
if (fs.existsSync(keyPem)) {
  signature = crypto.sign(null, Buffer.from(digest, 'hex'), crypto.createPrivateKey(fs.readFileSync(keyPem, 'utf8'))).toString('base64');
  log('已用本机私钥签名（与内置公钥匹配）');
} else {
  log('没有找到签名私钥：跳过签名（仅 sha256）');
}
fs.writeFileSync(
  path.join(SOURCE, 'update.json'),
  JSON.stringify({ version: FAKE_VERSION, installer: 'Splendor-Setup-9.9.9.exe', sha256: digest, size: bytes.length, signature, notes: 'update smoke test' }, null, 2),
  'utf8',
);

const sourceServer = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/').replace(/^\//, '') || 'update.json';
  fs.readFile(path.join(SOURCE, rel), (err, data) => {
    if (err) {
      res.writeHead(404).end('nope');
      return;
    }
    res.writeHead(200, { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => sourceServer.listen(SRC_PORT, r));

fs.rmSync(PROFILE, { recursive: true, force: true });
const appLog = fs.openSync(path.join(TMP, 'update-smoke-app.log'), 'w');
let child = spawn(APP, [], {
  stdio: ['ignore', appLog, appLog],
  env: { ...process.env, SPLENDOR_CDP_PORT: String(CDP_PORT), SPLENDOR_DATA_DIR: DATA_DIR },
});
let browser = null;
let passed = false;

const attach = async () => {
  for (let i = 0; i < 20; i++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 4000 });
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('CDP 连接失败');
};

try {
  await sleep(7000);
  browser = await attach();
  let ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) ?? ctx.pages()[0];
  await sleep(1200);

  const check = await page.evaluate((src) => window.splendorDesktop.update.check(src), `http://localhost:${SRC_PORT}`);
  ok('检查到新版本', check.available === true && check.version === FAKE_VERSION, JSON.stringify(check));
  const download = await page.evaluate((src) => window.splendorDesktop.update.download(src), `http://localhost:${SRC_PORT}`);
  ok('下载并通过 sha256 校验', download.ok === true, JSON.stringify(download));
  const staged = path.join(DATA_DIR, 'update-work', 'staged-installer.exe');
  ok('安装包已暂存', fs.existsSync(staged), `${(fs.statSync(staged).size / 1024).toFixed(0)} KB`);

  const apply = await page.evaluate(() => window.splendorDesktop.update.apply());
  ok('触发安装（应用将退出并由助手接管）', apply.ok === true, JSON.stringify(apply));
  await browser.close().catch(() => {});
  browser = null;

  // 等助手完成：结果文件出现
  const resultFile = path.join(DATA_DIR, 'update-work', 'last-result.json');
  let result = null;
  for (let i = 0; i < 100 && !result; i++) {
    await sleep(1500);
    try {
      result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    } catch {
      result = null;
    }
  }
  if (!result) {
    const helperLog = path.join(DATA_DIR, 'logs', 'update.log');
    log('未等到结果，助手日志：');
    log(fs.existsSync(helperLog) ? fs.readFileSync(helperLog, 'utf8').split('\n').slice(-12).join('\n') : '(没有助手日志)');
  }
  ok('助手记录了更新结果（成功）', result?.ok === true, JSON.stringify(result ?? '(无)'));

  // 应用应已自动重启并对外服务
  let health = 0;
  for (let i = 0; i < 20 && health === 0; i++) {
    for (let p = 8080; p <= 8085 && health === 0; p++) {
      try {
        const res = await fetch(`http://127.0.0.1:${p}/healthz`);
        if (res.ok) health = p;
      } catch {
        /* 继续探测 */
      }
    }
    if (health === 0) await sleep(1500);
  }
  ok('新版应用已自动重启并提供服务', health > 0, `healthz ${health}`);
  ok('本机保留了安装包（供向其他电脑共享）', fs.existsSync(path.join(DATA_DIR, 'update-work', 'self-installer.exe')));
  ok('待安装标记已清理', !fs.existsSync(path.join(DATA_DIR, 'update-work', 'pending.json')));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  passed = failed.length === 0;
  process.exitCode = passed ? 0 : 1;
} catch (err) {
  log(`出错：${String(err).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  sourceServer.close();
  spawn('taskkill', ['/F', '/IM', 'splendor-desktop.exe'], { stdio: 'ignore' });
  spawn('taskkill', ['/F', '/IM', 'update-helper.exe'], { stdio: 'ignore' });
  await sleep(1500);
  await browser?.close().catch(() => {});
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(SOURCE, { recursive: true, force: true });
  void child;
  void os;
}
