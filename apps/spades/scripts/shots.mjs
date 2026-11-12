import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5209';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.shots.init')) {
      localStorage.removeItem('familyarcade.spades.save');
      localStorage.removeItem('familyarcade.spades.record');
      sessionStorage.setItem('familyarcade.shots.init', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function startSolo(page) {
  await page.getByTestId('start-ai').click();
  await page.waitForTimeout(200);
  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="bid-cover"]', { timeout: 15000 });
  await page.getByTestId('reveal').click();
  await page.waitForTimeout(200);
  await page.getByTestId('bid-3').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'playing';
  }, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function seedRecord(page) {
  await page.evaluate(() => {
    const recent = [
      { winner: 1, scores: [420, 515], rounds: 9, mode: 'lan', at: Date.UTC(2026, 10, 2) },
      { winner: 0, scores: [500, 470], rounds: 7, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 5) },
      { winner: 0, scores: [510, 490], rounds: 8, mode: 'local', at: Date.UTC(2026, 10, 8) },
      { winner: 1, scores: [455, 505], rounds: 6, mode: 'ai', level: 'normal', at: Date.UTC(2026, 10, 10) },
    ];
    localStorage.setItem('familyarcade.spades.record', JSON.stringify({
      matches: 7,
      winsA: 4,
      winsB: 3,
      rounds: 52,
      byMode: { ai: 3, local: 2, lan: 2 },
      lastWinner: 1,
      recent,
    }));
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
  await setLang(page, lang);

  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-ai').click();
  await page.getByTestId('level-normal').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="bid-cover"]', { timeout: 15000 });
  await page.getByTestId('reveal').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-bid.png') });

  await page.getByTestId('bid-3').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '0';
  }, null, { timeout: 20000 });
  await page.locator('.hand .card[data-legal="true"]').first().click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.game-shell');
    return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '0';
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=round`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="round-sheet"]', { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'round.png') });

  await page.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="match-over"]', { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('rules').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await seedRecord(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('stats').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-lan').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: MOBILE.deviceScaleFactor,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await startSolo(mobile);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
