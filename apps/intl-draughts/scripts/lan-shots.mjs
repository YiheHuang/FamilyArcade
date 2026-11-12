import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.LAN_SHOTS_PORT || 18928);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve('docs/screenshots');

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

async function clickSquare(page, index) {
  await page.locator(`[data-square="${index}"]`).click();
  await page.waitForTimeout(140);
}

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const lang of ['en', 'zh']) {
    const zh = lang === 'zh';
    const dir = path.join(OUT, lang);
    await mkdir(dir, { recursive: true });

    const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await host.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
    await host.goto(BASE, { waitUntil: 'networkidle' });
    await host.getByRole('button', { name: zh ? /局域网对战/ : /Play on the local network/ }).click();
    const hostName = zh ? '阿明' : 'Mira';
    await host.getByPlaceholder(zh ? '主机' : 'Host').fill(hostName);
    await host.getByRole('button', { name: zh ? /创建房间/ : /Create room/ }).click();
    await host.waitForSelector('.room-code.big', { timeout: 10000 });
    const room = (await host.locator('.room-code.big').innerText()).replace(/\s+/g, '');
    const guestName = zh ? '家人' : 'Guest';
    const invite = `http://127.0.0.1:${PORT}/?lan=${room}&code=${room}&name=${encodeURIComponent(guestName)}`;

    const guest = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await guest.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
    await guest.goto(invite, { waitUntil: 'networkidle' });
    await guest.waitForSelector('.waiting-card', { timeout: 10000 });
    await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
    await host.waitForTimeout(400);
    if (zh) {
      const hostText = (await host.locator('body').innerText()).replace('English', '');
      if (/[A-Za-z]/.test(hostText)) {
        throw new Error(`Chinese LAN host contains English: ${hostText.match(/[A-Za-z]+/g)}`);
      }
    }
    await host.screenshot({ path: path.join(dir, 'lan-host.png') });

    await host.getByRole('button', { name: zh ? /开始对局/ : /Start the game/ }).click();
    await guest.waitForSelector('.board', { timeout: 10000 });
    for (const [side, from, to] of [
      ['host', 69, 58],
      ['guest', 30, 41],
      ['host', 67, 56],
    ]) {
      const page = side === 'host' ? host : guest;
      await clickSquare(page, from);
      await clickSquare(page, to);
      await host.waitForTimeout(300);
    }
    await clickSquare(guest, 34);
    await guest.waitForTimeout(400);
    if (zh) {
      const guestText = (await guest.locator('body').innerText()).replace('English', '');
      if (/[A-Za-z]/.test(guestText)) {
        throw new Error(`Chinese LAN guest contains English: ${guestText.match(/[A-Za-z]+/g)}`);
      }
    }
    await guest.screenshot({ path: path.join(dir, 'lan-guest.png') });

    await host.close();
    await guest.close();
    await new Promise((resolve) => setTimeout(resolve, 600));
    console.log(`LAN screenshots ${lang}: ok`);
  }
  await closeBrowser(browser);
  console.log(`LAN screenshots written to ${OUT}`);
  process.exit(0);
} finally {
  relay.kill();
}
