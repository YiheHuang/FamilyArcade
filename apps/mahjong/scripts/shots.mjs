import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5221';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function prepare(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.shots.init')) {
      localStorage.removeItem('familyarcade.mahjong.save');
      localStorage.removeItem('familyarcade.mahjong.record');
      sessionStorage.setItem('familyarcade.shots.init', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function startSolo(page) {
  await page.getByTestId('start-ai').click();
  await page.waitForTimeout(200);
  await page.getByTestId('level-hard').click();
  await page.getByTestId('begin').click();
  await page.waitForSelector('.game-shell', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function seedRecord(page) {
  await page.evaluate(() => {
    const recent = [
      { winner: 0, fan: 8, result: 'win', mode: 'ai', at: Date.UTC(2026, 10, 3) },
      { winner: 2, fan: 4, result: 'win', mode: 'local', at: Date.UTC(2026, 10, 5) },
      { winner: 0, fan: 13, result: 'win', mode: 'ai', at: Date.UTC(2026, 10, 7) },
      { winner: null, fan: 0, result: 'draw', mode: 'lan', at: Date.UTC(2026, 10, 8) },
    ];
    localStorage.setItem(
      'familyarcade.mahjong.record',
      JSON.stringify({
        games: 9,
        draws: 1,
        wins: [6, 1, 2, 0],
        byMode: { ai: 5, local: 2, lan: 2 },
        highestFan: 13,
        lastWinner: 0,
        recent,
      }),
    );
  });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[${lang}] console: ${message.text()}`);
  });
  await prepare(page, lang);

  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-ai').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForSelector('.game-shell', { timeout: 15000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=claim`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="claim-panel"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'claim.png') });

  await page.goto(`${BASE}/?demo=win`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="result-sheet"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('rules').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await seedRecord(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('stats').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-local').click();
  await page.waitForSelector('[data-testid="privacy-cover"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'privacy.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-lan').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: MOBILE.deviceScaleFactor,
  });
  await prepare(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await startSolo(mobile);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
