import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_SHOTS_PORT || 18928);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve('docs/screenshots');

const MATE = [
  [70, 7],
  [8, 7],
  [64, 1],
  [0, 1],
  [58, 49],
  [3, 13],
  [56, 47],
  [19, 73],
  [85, 76],
  [25, 23],
  [88, 69],
  [7, 79],
  [76, 67],
  [1, 64],
];

if (!existsSync('dist/index.html')) {
  throw new Error('Run npm run build first (dist/index.html is missing).');
}

const relay = spawn(
  process.execPath,
  ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(PORT)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);
let relayLog = '';
let relayExited = false;
relay.stdout.on('data', (chunk) => { relayLog += chunk.toString(); });
relay.stderr.on('data', (chunk) => { relayLog += chunk.toString(); });
relay.on('exit', () => { relayExited = true; });

async function waitForRelay() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (relayExited) throw new Error(`LAN relay stopped before listening\n${relayLog}`);
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`LAN relay did not start on ${BASE}\n${relayLog}`);
}

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function stopRelay(relay) {
  relay.kill();
  await Promise.race([
    new Promise((resolve) => relay.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

function point(page, index) {
  return page.locator(`.xq-point[data-index="${index}"]`);
}

async function play(page, from, to) {
  await point(page, from).click();
  await point(page, to).click();
  await page.waitForTimeout(250);
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const lang of ['en', 'zh']) {
    const dir = path.join(OUT, lang);
    await mkdir(dir, { recursive: true });

    const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await host.addInitScript((value) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.removeItem('familyarcade.xiangqi.save');
      localStorage.removeItem('familyarcade.xiangqi.record');
    }, lang);
    await host.goto(BASE, { waitUntil: 'networkidle' });
    await host.getByRole('button', { name: /Play over the local network|局域网对战/ }).click();
    const hostName = lang === 'zh' ? '阿明' : 'Mira';
    await host.getByPlaceholder(lang === 'zh' ? '主机' : 'Host').fill(hostName);
    await host.getByRole('button', { name: /Create room|创建房间/ }).click();
    await host.waitForSelector('.room-code.big', { timeout: 10000 });
    const roomCode = (await host.locator('.room-code.big').innerText()).trim();
    const invite = await host.locator('.invite-link').getAttribute('href').catch(() => null);

    const guest = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await guest.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
    if (invite) {
      await guest.goto(invite, { waitUntil: 'networkidle' });
    } else {
      await guest.goto(BASE, { waitUntil: 'networkidle' });
      await guest.getByRole('button', { name: /Play over the local network|局域网对战/ }).click();
      await guest.getByPlaceholder(lang === 'zh' ? '你的名字' : 'Your name').fill(lang === 'zh' ? '家人' : 'Guest');
      await guest.locator('.code-field input').fill(roomCode);
      await guest.getByRole('button', { name: /Join the table|加入牌桌/ }).click();
    }
    await guest.waitForSelector('.waiting-card', { timeout: 10000 });
    await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
    await host.waitForTimeout(350);
    await host.screenshot({ path: path.join(dir, 'lan-host.png') });

    await host.getByRole('button', { name: /Start the game|开始对局/ }).click();
    await guest.waitForSelector('.xq-board', { timeout: 10000 });
    for (let index = 0; index < MATE.length; index += 1) {
      const [from, to] = MATE[index];
      await play(index % 2 === 0 ? host : guest, from, to);
    }
    await guest.waitForSelector('.result-banner', { timeout: 5000 });
    await guest.waitForTimeout(350);
    await guest.screenshot({ path: path.join(dir, 'lan-guest.png') });

    await host.close();
    await guest.close();
    await new Promise((resolve) => setTimeout(resolve, 600));
    console.log(`LAN screenshots ${lang}: ok`);
  }
  await closeBrowser(browser);
  console.log(`LAN screenshots written to ${OUT}`);
} finally {
  await stopRelay(relay);
}
