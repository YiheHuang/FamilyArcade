import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5219';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { viewport: { width: 1440, height: 1000 } };
const MOBILE = {
  viewport: { width: 390, height: 844 },
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

async function makePage(browser, lang, pageOptions = DESKTOP) {
  const page = await browser.newPage(pageOptions);
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[${lang}] console: ${message.text()}`);
  });
  page.on('pageerror', (error) => console.log(`[${lang}] pageerror: ${String(error)}`));
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.jokers-table.save');
    localStorage.setItem(
      'familyarcade.jokers-table.record',
      JSON.stringify({
        runs: 7,
        wins: 4,
        losses: 3,
        bestScore: 18420,
        bestAnte: 6,
        byMode: { solo: 3, rivals: 1, hotseat: 2, lan: 1 },
        recent: [
          { mode: 'solo', result: 'win', score: 18420, ante: 6, at: Date.UTC(2026, 10, 10) },
          { mode: 'lan', result: 'loss', score: 9200, ante: 4, at: Date.UTC(2026, 10, 11) },
          { mode: 'hotseat', result: 'win', score: 12480, ante: 5, at: Date.UTC(2026, 10, 8) },
        ],
      }),
    );
  }, lang);
  return page;
}

async function startSolo(page) {
  await page.getByTestId('start-solo').click();
  await page.getByTestId('seed-input').fill('20261112');
  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="game-shell"]', { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await makePage(browser, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-rivals').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="game-shell"]', { timeout: 15000 });
  await page.waitForTimeout(350);
  const cards = page.locator('.hand .pcard');
  for (let index = 0; index < 3; index += 1) await cards.nth(index).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });
  await page.getByTestId('hint').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=shop`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="shop"]', { timeout: 15000 });
  await page.locator('.offer-card').nth(0).getByTestId('buy-offer').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'shop.png') });

  await page.goto(`${BASE}/?demo=compare`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="compare"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'compare.png') });

  await page.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="end"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('stats').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('rules').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-lan').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await makePage(browser, lang, MOBILE);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await startSolo(mobile);
  await mobile.locator('.hand .pcard').nth(0).click();
  await mobile.locator('.hand .pcard').nth(1).click();
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
