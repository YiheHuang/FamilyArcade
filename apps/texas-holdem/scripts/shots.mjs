import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5217';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const RECORD = {
  hands: 7,
  showdowns: 4,
  sessions: 2,
  sessionWins: 1,
  biggestPot: 640,
  byMode: { ai: 4, local: 2, lan: 1 },
  recent: [
    { handNumber: 12, pot: 640, winners: [0], showdown: true, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 2) },
    { handNumber: 11, pot: 180, winners: [1], showdown: false, mode: 'local', at: Date.UTC(2026, 10, 5) },
    { handNumber: 9, pot: 300, winners: [2], showdown: true, mode: 'lan', at: Date.UTC(2026, 10, 8) },
    { handNumber: 7, pot: 460, winners: [0, 2], showdown: true, mode: 'ai', level: 'normal', at: Date.UTC(2026, 10, 10) },
  ],
};

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function bootPage(browser, options, lang) {
  const page = await browser.newPage(options);
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[${lang}] console: ${message.text()}`);
  });
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.setItem('familyarcade.texas-holdem.motion', 'on');
    if (!sessionStorage.getItem('familyarcade.texas-holdem.shots')) {
      localStorage.removeItem('familyarcade.texas-holdem.save');
      localStorage.removeItem('familyarcade.texas-holdem.record');
      sessionStorage.setItem('familyarcade.texas-holdem.shots', '1');
    }
  }, lang);
  return page;
}

async function seedRecord(page) {
  await page.evaluate((record) => {
    localStorage.setItem('familyarcade.texas-holdem.record', JSON.stringify(record));
  }, RECORD);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await bootPage(browser, { viewport: DESKTOP }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedRecord(page);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-ai').click();
  await page.getByTestId('seats-4').click();
  await page.getByTestId('level-normal').click();
  await page.getByTestId('seed-input').fill('2026');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.goto(`${BASE}/?demo=table`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=showdown`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hand-result"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'showdown.png') });

  await page.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="session-over"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('stats').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('rules').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-lan').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await bootPage(browser, MOBILE, lang);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await mobile.goto(`${BASE}/?demo=table`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(350);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
