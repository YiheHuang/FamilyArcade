import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5216';
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
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.shots.init')) {
      localStorage.removeItem('familyarcade.doudizhu.save');
      localStorage.removeItem('familyarcade.doudizhu.record');
      sessionStorage.setItem('familyarcade.shots.init', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function seedRecord(page) {
  await page.evaluate(() => {
    localStorage.setItem('familyarcade.doudizhu.record', JSON.stringify({
      games: 7,
      landlordWins: 4,
      farmerWins: 3,
      totalStake: 74,
      bestStake: 24,
      byMode: { ai: 3, local: 2, lan: 2 },
      lastWinner: 'farmers',
      recent: [
        { side: 'farmers', winnerSeat: 2, stake: 12, bombs: 2, spring: true, mode: 'lan', at: Date.UTC(2026, 10, 11) },
        { side: 'landlord', winnerSeat: 0, stake: 6, bombs: 1, spring: false, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 10) },
        { side: 'farmers', winnerSeat: 1, stake: 3, bombs: 0, spring: false, mode: 'local', at: Date.UTC(2026, 10, 8) },
        { side: 'landlord', winnerSeat: 0, stake: 24, bombs: 3, spring: true, mode: 'local', at: Date.UTC(2026, 10, 6) },
      ],
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
  page.on('pageerror', (error) => console.log(`[${lang}] pageerror: ${String(error)}`));
  await setLang(page, lang);

  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-ai').click();
  await page.getByTestId('level-normal').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="bid-3"]', { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-bid.png') });

  await page.getByTestId('bid-3').click();
  await page.waitForFunction(
    () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'playing' &&
      document.querySelector('.game-shell')?.getAttribute('data-turn') === '0',
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="result"]', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-local').click();
  await page.waitForSelector('[data-testid="privacy-cover"]', { timeout: 10000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'privacy.png') });

  await page.locator('.game-top .back').click();
  await page.getByTestId('rules').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.locator('.rules-shell .back').click();
  await seedRecord(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('stats').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
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
  await mobile.getByTestId('start-local').click();
  await mobile.getByTestId('reveal').click();
  await mobile.getByTestId('bid-3').click();
  await mobile.getByTestId('reveal').click();
  await mobile.waitForTimeout(300);
  await mobile.mouse.move(2, 2);
  await mobile.waitForTimeout(150);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
