import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5177';
const LAN_PORT = Number(process.env.LAN_PORT || 8090);
const LAN_BASE = process.env.LAN_URL || `http://localhost:${LAN_PORT}`;
const OUT = path.resolve('docs/screenshots');
const LANGS = process.env.LANG_CODE ? [process.env.LANG_CODE] : ['en', 'zh'];
const VIEWPORT = { width: 1440, height: 1000 };

async function waitForLan(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${LAN_BASE}/`);
      if (response.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureLanRelay() {
  if (await waitForLan(1000)) return null;
  if (!existsSync(path.resolve('dist', 'index.html'))) {
    throw new Error('LAN screenshots need dist/index.html; run npm run build first');
  }
  const relay = spawn(
    process.execPath,
    ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(LAN_PORT)],
    { cwd: process.cwd(), stdio: 'ignore' },
  );
  if (!(await waitForLan())) {
    relay.kill();
    throw new Error(`LAN relay did not start on ${LAN_BASE}`);
  }
  return relay;
}

const STATS = {
  en: {
    names: ['Maya', 'Leo', 'Nana', 'Sam'],
    wins: { Maya: 6, Leo: 4, Nana: 3, Sam: 1 },
  },
  zh: {
    names: ['小满', '阿禾', '外婆', '小北'],
    wins: { 小满: 6, 阿禾: 4, 外婆: 3, 小北: 1 },
  },
};

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('dialog', (dialog) => dialog.accept());

  for (const lang of LANGS) {
    const dir = path.join(OUT, lang);
    await mkdir(dir, { recursive: true });
    const url = `${BASE}/?tutorial=0&lang=${lang}`;

    // Home
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(dir, 'home.png') });

    // Setup
    await page.getByTestId('mode-hotseat').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, 'setup.png') });

    // Curated real game state, round 2 summary
    await page.goto(`${url}&demo=summary`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3300);
    await page.screenshot({ path: path.join(dir, 'game.png') });

    // Secret support panel
    await page.goto(`${url}&demo=support`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.getByTestId('privacy-open').click();
    await page.waitForTimeout(250);
    await page.getByTestId('balloon-choice-2').click();
    await page.getByTestId('tailwind-toggle').click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(dir, 'game-select.png') });

    // Rules
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.getByTestId('home-rules').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(dir, 'rules.png') });

    // Settings
    await page.getByTestId('back').click();
    await page.waitForTimeout(350);
    await page.getByTestId('home-settings').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, 'settings.png') });

    // Stats with local-only demo numbers
    await page.getByTestId('back').click();
    await page.waitForTimeout(350);
    const data = STATS[lang];
    await page.evaluate(
      ({ names, wins }) => {
        localStorage.setItem(
          'balloonrally.stats.v1',
          JSON.stringify({
            version: 1,
            games: 14,
            wins,
            highestScore: 21,
            currentStreak: 2,
            bestStreak: 4,
            lastWinner: names[0],
            favorites: { ember: 13, sunny: 9, mint: 8, pebble: 6, puff: 4 },
            tailwindsUsed: 37,
            correctSupports: 42,
          }),
        );
      },
      data,
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByTestId('home-stats').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, 'stats.png') });

    // End / ranking
    await page.goto(`${url}&demo=end`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(dir, 'game-over.png') });

    // Mobile portrait — the real support choice screen
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await mobile.goto(url, { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(700);
    await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
    await mobile.goto(`${url}&demo=support`, { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(700);
    await mobile.getByTestId('privacy-open').click();
    await mobile.getByTestId('balloon-choice-1').click();
    await mobile.waitForTimeout(300);
    await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });
    await mobile.close();
  }

  const relay = await ensureLanRelay();
  try {
    for (const lang of LANGS) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const host = await context.newPage();
      await host.goto(`${LAN_BASE}/?tutorial=0&lang=${lang}`, { waitUntil: 'networkidle' });
      await host.getByTestId('mode-lan').click();
      await host.getByTestId('lan-create').click();
      await host.waitForSelector('[data-testid="lan-code"]', { timeout: 8000 });
      const invite = await host.locator('.lan-qr code').innerText();
      const guest = await context.newPage();
      await guest.goto(`http://${invite}&tutorial=0&lang=${lang}`, { waitUntil: 'networkidle' });
      await guest.getByTestId('lan-join').click();
      await guest.waitForSelector('[data-testid="lan-players"]', { timeout: 8000 });
      await host.waitForTimeout(500);
      const dir = path.join(OUT, lang);
      await mkdir(dir, { recursive: true });
      await host.screenshot({ path: path.join(dir, 'lan-host.png') });
      await guest.screenshot({ path: path.join(dir, 'lan-guest.png') });
      await context.close();
    }
  } finally {
    relay?.kill();
  }

  await browser.close();
  console.log('screenshots written to', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
