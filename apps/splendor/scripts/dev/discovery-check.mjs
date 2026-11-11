#!/usr/bin/env node
/**
 * UDP room discovery check.
 *
 *  1. launches the packaged app (host) with CDP;
 *  2. sends the discovery probe from Node (dgram, broadcast + loopback) and asserts
 *     a well-formed reply carrying the app tag, the HTTP port and the version;
 *  3. drives the app's own window through the real lobby UI to create a room and
 *     asserts the room code now shows up in the advertisement;
 *  4. leaves the room and asserts the advertisement clears.
 *
 * Prerequisite: npm run build -w @splendor/desktop
 * Usage:        node scripts/dev/discovery-check.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'splendor-desktop.exe');
const TMP = path.join(ROOT, 'data', 'tmp');
const PROFILE = path.join(TMP, 'app-profile-discovery');
const DATA_DIR = path.join(PROFILE, 'data');
const CDP_PORT = Number(process.env.DISCOVERY_CDP_PORT ?? 9337);
const DISCOVERY_PORT = 7669;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[discovery] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}

/** 发一轮探针，收集 1.5 秒内的应答 */
function probe(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const replies = [];
    socket.on('message', (buf) => {
      try {
        const value = JSON.parse(buf.toString('utf8'));
        if (value?.app === 'splendor-family') replies.push(value);
      } catch {
        /* ignore */
      }
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      const payload = Buffer.from(JSON.stringify({ app: 'splendor-family', v: 1, q: 'who' }));
      const targets = [['127.0.0.1', DISCOVERY_PORT], ['255.255.255.255', DISCOVERY_PORT]];
      for (const iface of Object.values(os.networkInterfaces()).flat()) {
        if (iface && iface.family === 'IPv4' && !iface.internal && iface.address) {
          const parts = iface.address.split('.').map(Number);
          const mask = (iface.netmask ?? '255.255.255.0').split('.').map(Number);
          const broadcast = parts.map((p, i) => (p | (255 - (mask[i] ?? 255)) ) & 255).join('.');
          targets.push([broadcast, DISCOVERY_PORT]);
        }
      }
      for (const [host, port] of targets) {
        try {
          socket.send(payload, port, host);
        } catch {
          /* ignore */
        }
      }
    });
    setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(replies);
    }, timeoutMs);
  });
}

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const appLog = fs.openSync(path.join(TMP, 'discovery-app.log'), 'w');
const child = spawn(APP, [], {
  stdio: ['ignore', appLog, appLog],
  env: { ...process.env, SPLENDOR_CDP_PORT: String(CDP_PORT), SPLENDOR_DATA_DIR: DATA_DIR },
});

let browser = null;
try {
  await sleep(7000);
  let httpPort = 0;
  for (let i = 0; i < 20 && httpPort === 0; i++) {
    for (let p = 8080; p <= 8085 && httpPort === 0; p++) {
      try {
        const res = await fetch(`http://127.0.0.1:${p}/healthz`);
        if (res.ok) httpPort = p;
      } catch {
        /* keep probing */
      }
    }
    if (httpPort === 0) await sleep(500);
  }
  ok('主机应用已启动', httpPort > 0, `HTTP ${httpPort}`);

  const first = await probe();
  const firstReply = first.find((r) => r.port === httpPort) ?? first[0];
  ok('桌面端应答 UDP 探针（含端口与版本）', !!firstReply && firstReply.port === httpPort && !!firstReply.version, JSON.stringify(firstReply ?? '(无应答)'));
  ok('未开房时房间码为空', !firstReply?.code, `code=${JSON.stringify(firstReply?.code ?? '')}`);

  // 通过真实界面创建房间
  for (let i = 0; i < 15 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 4000 });
    } catch {
      await sleep(1000);
    }
  }
  if (!browser) throw new Error('CDP 连接失败');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => !p.url().startsWith('devtools://')) ?? ctx.pages()[0];
  await sleep(1200);
  // 固定中文界面并跳过新手引导（CI 上是英文系统，否则选择器不匹配）
  await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('splendor.settings.v1') ?? '{}');
      localStorage.setItem('splendor.settings.v1', JSON.stringify({ ...raw, lang: 'zh' }));
      localStorage.setItem('splendor.tutorial.v1', '1');
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: 'load' }).catch(() => undefined);
  await sleep(1600);
  const openedLobby = await page.evaluate(() => {
    const card = [...document.querySelectorAll('button')].find((b) => /局域网|LAN/i.test(b.textContent ?? ''));
    if (!card) return false;
    card.click();
    return true;
  });
  await sleep(1200);
  // 扫描结果应标记"自己"，界面的"附近的房间"列表不应把自己列出来
  const scanInfo = await page.evaluate(() => window.splendorDesktop.discovery.scan(1200)).catch(() => []);
  ok('扫描结果标记了"自己"', Array.isArray(scanInfo) && scanInfo.some((r) => r.own === true), JSON.stringify(scanInfo));
  const nearbyUi = await page.evaluate(() => ({
    section: !!document.querySelector('[data-testid="nearby-rooms"]'),
    entries: document.querySelectorAll('[data-testid="nearby-room"]').length,
    text: (document.querySelector('[data-testid="nearby-rooms"]')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60),
  }));
  ok('界面显示"附近的房间"且不包含自己', nearbyUi.section && nearbyUi.entries === 0, JSON.stringify(nearbyUi));

  const createdRoom = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /创建房间|Create room/i.test(b.textContent ?? ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  await sleep(2500);
  const roomCode = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    const match = text.match(/\b([A-Z0-9]{4})\b/);
    return match ? match[1] : '';
  });
  ok('界面创建房间成功', openedLobby && createdRoom && !!roomCode, `房间码 ${roomCode || '(未读到)'}`);

  const second = await probe();
  const secondReply = second.find((r) => r.port === httpPort);
  ok(
    '广播里带上了房间码与人数',
    !!secondReply && !!roomCode && secondReply.code === roomCode && (secondReply.humans ?? 0) >= 1,
    JSON.stringify(secondReply ?? '(无应答)'),
  );

  // 离开房间后广播应清空
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /离开房间|Leave/i.test(b.textContent ?? ''));
    btn?.click();
  });
  await sleep(2000);
  const third = await probe();
  const thirdReply = third.find((r) => r.port === httpPort);
  ok('离开房间后不再广播房间码', !!thirdReply && !thirdReply.code, JSON.stringify(thirdReply ?? '(无应答)'));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  log(`出错：${String(err).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  spawn('taskkill', ['/F', '/IM', 'splendor-desktop.exe'], { stdio: 'ignore' });
  await sleep(1500);
  fs.rmSync(PROFILE, { recursive: true, force: true });
  void child;
}
