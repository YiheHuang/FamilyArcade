import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5192';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LANGS = process.env.LANG_CODE ? [process.env.LANG_CODE] : ['en', 'zh'];

const RECORDS = {
  en: { matches: 12, humanWins: 7, aiWins: 5, bestScore: 80, lastWinner: 'You', streak: 2 },
  zh: { matches: 12, humanWins: 7, aiWins: 5, bestScore: 80, lastWinner: '你', streak: 2 },
};

const LABELS = {
  en: {
    playAi: /Play against the AI/,
    rules: /^Rules/,
    stats: /^Family record/,
    hint: /^Hint$/,
    red: /^Red$/,
  },
  zh: {
    playAi: /和 AI/,
    rules: /^规则/,
    stats: /^家庭战绩/,
    hint: /^提示$/,
    red: /^红色$/,
  },
};

async function seed(page, lang) {
  await page.addInitScript(
    ({ code, record }) => {
      localStorage.setItem('familyarcade.lang', code);
      localStorage.setItem('familyarcade.color-chain.record', JSON.stringify(record));
      localStorage.removeItem('familyarcade.color-chain.save');
    },
    { code: lang, record: RECORDS[lang] },
  );
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const labels = LABELS[lang];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await seed(page, lang);

  // Home
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  // Setup
  await page.getByRole('button', { name: labels.playAi }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // Curated real mid-game from the engine
  await page.goto(`${BASE}/?demo=table`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: labels.hint }).click();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  // Wild colour choice
  await page.goto(`${BASE}/?demo=wild`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.hand .pcard[data-wild="true"]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-wild.png') });

  // Rules
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: labels.rules }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  // Family record
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: labels.stats }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  // Match end
  await page.goto(`${BASE}/?demo=final`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Phone
  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await seed(mobile, lang);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.goto(`${BASE}/?demo=table`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(650);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
