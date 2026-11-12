import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

async function freePort(start) {
  for (let port = start; port < start + 50; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No free LAN screenshot port found');
}

const PORT = await freePort(Number(process.env.LAN_SHOTS_PORT || 18928));
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
let relayListening = false;
relay.stdout.on('data', (chunk) => {
  relayLog += chunk.toString();
  if (relayLog.includes('Family Arcade LAN relay')) relayListening = true;
});
relay.stderr.on('data', (chunk) => { relayLog += chunk.toString(); });
relay.on('exit', () => { relayExited = true; });

async function waitForRelay() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (relayExited) throw new Error(`LAN relay stopped before listening\n${relayLog}`);
    if (!relayListening) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
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
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
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
      localStorage.removeItem('familyarcade.shogi.save');
    }, lang);
    await host.goto(BASE, { waitUntil: 'networkidle' });
    await host.getByRole('button', { name: /Same Wi-Fi|同一无线网络/ }).click();
    await host.getByPlaceholder(lang === 'zh' ? '主机' : 'Host').fill(lang === 'zh' ? '阿明' : 'Mira');
    await host.getByRole('button', { name: /Create room|创建房间/ }).click();
    await host.waitForSelector('.room-code.big', { timeout: 10000 });
    const invite = await host.locator('.invite-link').getAttribute('href');

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
    await host.screenshot({ path: path.join(dir, 'lan-host.png') });

    await host.getByRole('button', { name: /Start the game|开始对局/ }).click();
    await guest.waitForSelector('.board', { timeout: 10000 });
    await host.waitForTimeout(400);

    const move = async (page, from, to) => {
      await page.locator('.cell').nth(from).click();
      await page.locator('.cell').nth(to).click();
      await host.waitForTimeout(350);
    };

    await move(host, 58, 49);
    await move(guest, 22, 31);
    await move(host, 49, 40);
    await move(guest, 31, 40);
    await move(host, 57, 48);
    await guest.waitForTimeout(600);
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
