#!/usr/bin/env node
/**
 * LAN end-to-end: the packaged Tauri app hosts a real room.
 *
 *  1. launches the app (host) with CDP and attaches with Playwright;
 *  2. a phone-sized browser joins the room through the real UI;
 *  3. a protocol client creates the room, starts it, plays turns;
 *  4. the guest asks to undo (host's window runs the authoritative RoomManager);
 *  5. a reconnect with the room token restores the seat;
 *  6. asserts host-side facts: relay counters in the host *window*, room save file,
 *     and that the state sent to guests never contains the deck contents.
 *
 * Prerequisite: npm run build -w @splendor/desktop
 * Usage:        node scripts/dev/lan-e2e.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'splendor-desktop.exe');
const TMP = path.join(ROOT, 'data', 'tmp');
const PROFILE = path.join(TMP, 'app-profile-lan-e2e');
const CDP_PORT = Number(process.env.LAN_CDP_PORT ?? 9334);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[lan-e2e] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const appLog = fs.openSync(path.join(TMP, 'lan-e2e-app.log'), 'w');
const DATA_DIR = path.join(PROFILE, 'data');
const child = spawn(APP, [], {
  stdio: ['ignore', appLog, appLog],
  env: { ...process.env, SPLENDOR_CDP_PORT: String(CDP_PORT), SPLENDOR_DATA_DIR: DATA_DIR },
});

/** 极简协议客户端（与 packages/server 的协议一致） */
class Proto {
  constructor(url) {
    this.url = url;
    this.messages = [];
    this.room = null;
    this.state = null;
    this.token = null;
    this.seat = null;
    this.code = null;
  }
  async connect() {
    const { WebSocket } = await import('ws');
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      this.messages.push(msg);
      if (msg.t === 'room') {
        this.room = msg;
        this.code = msg.code;
        this.seat = msg.you?.seat ?? this.seat;
        if (msg.you?.token) this.token = msg.you.token;
      }
      if (msg.t === 'state') {
        this.state = msg;
        const evSeat = (msg.events ?? []).map((e) => `${e.type}@${e.seat ?? '?'}`).join(',');
        this.trace = this.trace ?? [];
        this.trace.push(`mv${msg.moveCount} turn${msg.view?.turn} [${evSeat}]`);
      }
      if (msg.t === 'left') this.token = null;
    });
    await sleep(250);
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  async wait(pred, timeoutMs = 6000) {
    const start = Date.now();
    // 从最新往回找：等待"新到达"的消息，避免匹配到早先的历史状态
    const scan = () => {
      for (let i = this.messages.length - 1; i >= 0; i -= 1) {
        if (pred(this.messages[i])) return this.messages[i];
      }
      return null;
    };
    while (Date.now() - start < timeoutMs) {
      const found = scan();
      if (found) return found;
      await sleep(80);
    }
    return null;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

let browser = null;
let hostWin = null;
let hostPort = 0;
let pass = false;

try {
  await sleep(7000);
  for (let i = 0; i < 15 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 4000 });
    } catch {
      await sleep(1000);
    }
  }
  if (!browser) throw new Error('could not attach to the host app (CDP)');
  const ctx = browser.contexts()[0];
  hostWin = ctx.pages().find((p) => !p.url().startsWith('devtools://')) ?? ctx.pages()[0];
  await sleep(1000);
  hostPort = await hostWin.evaluate(() => window.splendorDesktop?.serverPort ?? 0);
  ok('主机窗口就绪并拿到端口', hostPort > 0, `port ${hostPort}`);

  const hostReady = await hostWin.evaluate(() => !!window.__lanHost && window.__lanHost.stats.open >= 0);
  ok('主机窗口内运行着权威端实例', hostReady);

  // 1) 协议客户端建房（2 人：1 人类 + 1 开门等待手机加入）
  const p1 = new Proto(`ws://127.0.0.1:${hostPort}/ws`);
  await p1.connect();
  p1.send({ t: 'create', name: '爸爸', seatCount: 2, turnSeconds: 0 });
  const room = await p1.wait((m) => m.t === 'room');
  ok('建房成功并拿到 4 位房间码', !!room && /^[A-Z0-9]{4}$/.test(room.code ?? ''), room?.code ?? '(无)');
  const code = room.code;

  // 2) 手机浏览器走真实界面加入
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await phone.newPage();
  await page.goto(`http://127.0.0.1:${hostPort}/?lang=zh`, { waitUntil: 'load' });
  await sleep(1500);
  const lobbyOpened = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const lan = buttons.find((b) => (b.textContent ?? '').includes('局域网'));
    if (!lan) return false;
    lan.click();
    return true;
  });
  await sleep(800);
  const joined = await page.evaluate((roomCode) => {
    const input = [...document.querySelectorAll('input')].find((i) => (i.placeholder ?? '').includes('房间') || (i.maxLength ?? 0) === 4 || (i.placeholder ?? '').toUpperCase().includes('CODE'));
    if (!input) return { ok: false, reason: 'no code input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, roomCode);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const joinBtn = [...document.querySelectorAll('button')].find((b) => /加入|Join/.test(b.textContent ?? ''));
    if (!joinBtn) return { ok: false, reason: 'no join button' };
    joinBtn.click();
    return { ok: true };
  }, code);
  await sleep(2500);
  const phoneRoom = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    return { text: text.slice(0, 140), inRoom: text.includes('离开房间') };
  });
  ok('手机浏览器通过界面加入房间', lobbyOpened && joined.ok && phoneRoom.inRoom, `${joined.reason ?? ''} ${phoneRoom.text.replace(/\s+/g, ' ').slice(0, 70)}`);

  const p2seat = await p1.wait((m) => m.t === 'room' && (m.seats ?? []).some((s) => s.kind === 'human' && s.connected && s.seat !== 0), 6000);
  ok('房主看到第二位人类玩家已就座', !!p2seat);

  // 3) 开始对局
  p1.send({ t: 'start' });
  const st1 = await p1.wait((m) => m.t === 'state' && m.view?.phase === 'playing');
  ok('开始对局并收到权威状态', !!st1, `轮次 ${st1?.view?.turn ?? '?'}`);
  const hiddenInfoOk = !!st1 && !('decks' in (st1.view ?? {})) && Array.isArray(st1.view?.deckCounts);
  ok('下发给客户端的状态不含牌堆内容（隐藏信息）', hiddenInfoOk);

  // 4) 各打一手：房主拿三枚，手机拿两枚
  const movesBefore = st1?.moveCount ?? 0;
  p1.send({ t: 'move', move: { type: 'take', colors: ['white', 'blue', 'green'] } });
  const st2 = await p1.wait((m) => m.t === 'state' && (m.moveCount ?? 0) > movesBefore);
  ok('房主在这一端落子后状态推进', !!st2, `moveCount ${st2?.moveCount}`);

  // 等手机切换到对局界面（宝石堆出现）
  let phoneInGame = false;
  for (let i = 0; i < 20 && !phoneInGame; i++) {
    await sleep(500);
    phoneInGame = (await page.evaluate(() => document.querySelectorAll('[data-gem]').length)) >= 5;
  }
  ok('手机端收到开局并进入对局界面', phoneInGame);

  // 手机端：用真实指针点击（Playwright locator）拿两枚宝石并确认，重试直到房主端看到推进
  const beforePhone = st2?.moveCount ?? 0;
  let phoneTake = { clicked: 0, confirmed: false, attempts: 0 };
  let st3 = null;
  for (let attempt = 1; attempt <= 6 && !st3; attempt += 1) {
    const clicked = [];
    for (const color of ['white', 'blue']) {
      try {
        await page.locator(`[data-gem="${color}"]`).first().click({ timeout: 2500 });
        clicked.push(color);
      } catch {
        /* 该颜色不可点（银行空/未轮到） */
      }
    }
    let confirmed = false;
    try {
      await page.getByText('确认拿取').first().click({ timeout: 2500 });
      confirmed = true;
    } catch {
      /* 还没形成选择 */
    }
    phoneTake = { clicked: clicked.length, confirmed, attempts: attempt };
    if (clicked.length >= 2 && confirmed) {
      st3 = await p1.wait((m) => m.t === 'state' && (m.moveCount ?? 0) >= beforePhone + 1, 5000);
    }
    if (!st3) await sleep(900);
  }
  if (!st3) {
    const debug = await page.evaluate(() => ({
      text: (document.querySelector('#root')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
      buttons: [...document.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean).slice(0, 12),
      gems: document.querySelectorAll('[data-gem]').length,
    }));
    log('手机端拿取未生效：' + JSON.stringify(debug));
    await page.screenshot({ path: path.join(TMP, 'lan-e2e-phone.png') });
  }
  ok('手机端在真实界面里完成一次拿取', !!st3 && phoneTake.confirmed, `moveCount ${st3?.moveCount ?? '?'}`);

  // 5) 悔棋：手机请求 → 房主这一端同意 → 回滚
  const beforeUndo = st3?.moveCount ?? 0;
  try {
    await page.locator('[data-testid="undo-request"]').first().click({ timeout: 3000 });
  } catch {
    await page.getByText('请求悔棋').first().click({ timeout: 3000 });
  }
  const ask = await p1.wait((m) => m.t === 'undo:ask', 6000);
  ok('房主收到悔棋询问', !!ask, `请求者座位 ${ask?.seat}`);
  if (ask) p1.send({ t: 'undo:respond', accept: true });
  const result = await p1.wait((m) => m.t === 'undo:result', 6000);
  const stUndo = await p1.wait((m) => m.t === 'state' && (m.moveCount ?? 99) < beforeUndo, 6000);
  // 精确语义：只撤回请求者（座位 1）自己那一手，对手此前那一手保留
  log('落子轨迹：' + (p1.trace ?? []).join(' | '));
  const hostTokens = stUndo?.view?.players?.[0]?.tokens ?? null;
  const hostKept = !!hostTokens && (hostTokens.white ?? 0) >= 1 && (hostTokens.blue ?? 0) >= 1;
  ok(
    '回滚只撤回请求者那一手（对手此前走法保留）',
    !!result?.ok && stUndo?.moveCount === beforeUndo - 1 && hostKept,
    `moveCount ${beforeUndo} → ${stUndo?.moveCount ?? '?'} · 房主令牌 ${JSON.stringify(hostTokens)}`,
  );

  // 6) 断线重连：协议客户端断线后用令牌回到原座位
  const tokenBefore = p1.token;
  p1.close();
  await sleep(1200);
  const p1b = new Proto(`ws://127.0.0.1:${hostPort}/ws`);
  await p1b.connect();
  p1b.send({ t: 'rejoin', code, token: tokenBefore });
  const back = await p1b.wait((m) => m.t === 'room' && m.you?.seat === 0, 6000);
  const stateBack = await p1b.wait((m) => m.t === 'state', 6000);
  ok('断线后用令牌恢复原座位并拿到完整状态', !!back && !!stateBack, `座位 ${back?.you?.seat}`);

  // 7) 主机侧证据：窗口内中继计数 + 房间存档
  const stats = await hostWin.evaluate(() => window.__lanHost?.stats ?? null);
  ok('主机窗口确实在处理连接（中继计数）', !!stats && stats.open >= 1 && stats.msg >= 1, JSON.stringify(stats));
  const saveFile = path.join(DATA_DIR, 'lan-rooms.json');
  const saved = fs.existsSync(saveFile) ? JSON.parse(fs.readFileSync(saveFile, 'utf8')) : null;
  const savedCodes = JSON.stringify(saved ?? {});
  ok('房间已存档到数据目录 lan-rooms.json', !!saved && savedCodes.includes(code), saveFile.replace(PROFILE, '<profile>'));

  p1b.close();
  await phone.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  pass = failed.length === 0;
  process.exitCode = pass ? 0 : 1;
} catch (err) {
  log(`出错：${String(err).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  spawn('taskkill', ['/F', '/IM', 'splendor-desktop.exe'], { stdio: 'ignore' });
  await sleep(1500);
  fs.rmSync(PROFILE, { recursive: true, force: true });
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  void child;
}
