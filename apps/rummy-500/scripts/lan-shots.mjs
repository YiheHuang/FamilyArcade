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
relay.stdout.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.stderr.on('data', (chunk) => {
  relayLog += chunk.toString();
});
relay.on('exit', () => {
  relayExited = true;
});

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

let browser;
try {
  await waitForRelay();
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const lang of ['en', 'zh']) {
    const dir = path.join(OUT, lang);
    await mkdir(dir, { recursive: true });
    const errors = [];

    const host = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    host.on('pageerror', (error) => errors.push(`host: ${error}`));
    host.on('console', (message) => {
      if (message.type() === 'error') errors.push(`host console: ${message.text()}`);
    });
    await host.addInitScript((value) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.removeItem('familyarcade.rummy-500.save');
    }, lang);
    await host.emulateMedia({ reducedMotion: 'reduce' });
    await host.goto(BASE, { waitUntil: 'networkidle' });
    await host.getByRole('button', { name: lang === 'zh' ? /局域网牌桌/ : /LAN night/ }).click();
    const hostName = lang === 'zh' ? '阿明' : 'Mira';
    await host.getByPlaceholder(lang === 'zh' ? '主机' : 'Host').fill(hostName);
    await host.getByRole('button', { name: lang === 'zh' ? /创建房间/ : /Create room/ }).click();
    await host.waitForSelector('.room-code.big', { timeout: 10000 });
    const invite = await host.locator('.invite-link').getAttribute('href');
    if (!invite) throw new Error('invite link missing');

    const guest = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    guest.on('pageerror', (error) => errors.push(`guest: ${error}`));
    guest.on('console', (message) => {
      if (message.type() === 'error') errors.push(`guest console: ${message.text()}`);
    });
    await guest.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
    await guest.emulateMedia({ reducedMotion: 'reduce' });
    await guest.goto(invite, { waitUntil: 'networkidle' });
    await guest.waitForSelector('.waiting-card', { timeout: 10000 });
    await host.waitForSelector('.status-pill.ready', { timeout: 10000 });
    await host.waitForSelector('.qr-card img', { timeout: 10000 });
    await host.waitForTimeout(400);
    await host.screenshot({ path: path.join(dir, 'lan-host.png') });

    await host.getByRole('button', { name: lang === 'zh' ? /开始发牌/ : /Deal the cards/ }).click();
    await guest.waitForSelector('.table-stage', { timeout: 10000 });
    await host.locator('.stock-pile').click();
    await host.waitForTimeout(250);
    await host.locator('.hand-scroll .playing-card').first().click();
    await host.getByRole('button', { name: lang === 'zh' ? '弃牌' : 'Discard', exact: true }).click();
    await guest.waitForFunction(
      () => {
        const text = document.querySelector('.turn-panel strong')?.textContent ?? '';
        return text.includes('Your turn') || text.includes('轮到你');
      },
      null,
      { timeout: 8000 },
    );
    await guest.waitForTimeout(350);
    await guest.screenshot({ path: path.join(dir, 'lan-guest.png') });

    await host.close();
    await guest.close();
    if (errors.length > 0) throw new Error(errors.join(' | '));
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`LAN screenshots ${lang}: ok`);
  }
  console.log(`LAN screenshots written to ${OUT}`);
} finally {
  if (browser) await browser.close();
  relay.kill();
}
