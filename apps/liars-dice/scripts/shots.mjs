import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5224';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

function sampleRecord(lang) {
  const name = lang === 'zh' ? '米拉' : 'Mira';
  const base = {
    games: 12,
    byMode: { ai: 6, local: 3, lan: 3 },
    wins: { '@you': 5, '@ai1': 4, '@p2': 2, [name]: 1 },
    lastWinner: '@you',
  };
  const rows = [
    ['@you', 'ai', 'normal', 2, 5],
    ['@ai1', 'local', null, 4, 7],
    [name, 'lan', null, 5, 9],
    ['@p2', 'local', null, 3, 8],
    ['@you', 'ai', 'hard', 2, 11],
  ];
  const recent = rows.map(([winner, mode, level, playerCount, round], index) => ({
    winner,
    standings: [winner, '@ai1', '@p2', name].slice(0, Math.max(2, playerCount)),
    playerCount,
    mode,
    ...(level ? { level } : {}),
    round,
    at: Date.now() - index * 86_400_000,
  }));
  return { ...base, recent };
}

async function desktop(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addInitScript(
    ({ value, record }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.setItem('familyarcade.liars-dice.record', JSON.stringify(record));
      localStorage.removeItem('familyarcade.liars-dice.save');
    },
    { value: lang, record: sampleRecord(lang) },
  );
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-solo').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.goto(`${BASE}/?demo=game`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="current-bid"]', { timeout: 10000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForSelector('[data-testid="hint-card"]', { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=reveal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="reveal-panel"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'reveal.png') });

  await page.goto(`${BASE}/?demo=gameover`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="result-panel"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(200);

  await page.getByTestId('start-lan').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await context.close();
}

async function mobile(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(MOBILE);
  await context.addInitScript(
    ({ value, record }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.setItem('familyarcade.liars-dice.record', JSON.stringify(record));
      localStorage.removeItem('familyarcade.liars-dice.save');
    },
    { value: lang, record: sampleRecord(lang) },
  );
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await page.goto(`${BASE}/?demo=game`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="own-dice"]', { timeout: 10000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await context.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const only = process.env.SHOTS_ONLY || 'all';
for (const lang of ['en', 'zh']) {
  if (only !== 'mobile') await desktop(browser, lang);
  if (only !== 'desktop') await mobile(browser, lang);
  console.log(`screenshots ${lang}: ok`);
}
await closeBrowser(browser);
console.log(`screenshots written to ${OUT}`);
process.exit(0);
