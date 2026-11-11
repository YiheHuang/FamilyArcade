import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5195';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const SEED_RECORD = {
  games: 14,
  cracked: 9,
  held: 5,
  bestGuesses: 4,
  lastOutcome: 'breaker',
  streak: 2,
  recent: [
    'breaker', 'held', 'breaker', 'breaker', 'held', 'breaker',
    'breaker', 'held', 'breaker', 'setter', 'breaker', 'breaker',
  ],
};

const T = {
  en: {
    solo: /Solo · crack the code/,
    local: /Two players/,
    start: /Start game/,
    lock: /Lock the code/,
    breaker: /codebreaker/i,
    submit: /Submit guess/,
    hint: /^Hint$/,
  },
  zh: {
    solo: /单人 · 破解密码/,
    local: /两人同屏/,
    start: /开始游戏/,
    lock: /锁定密码/,
    breaker: /破解者/,
    submit: /提交猜测/,
    hint: /^提示$/,
  },
};

async function prepare(page, lang) {
  await page.addInitScript(
    ([language, record]) => {
      localStorage.setItem('familyarcade.lang', language);
      localStorage.removeItem('familyarcade.codebreak.save');
      localStorage.setItem('familyarcade.codebreak.record', JSON.stringify(record));
    },
    [lang, SEED_RECORD],
  );
}

async function fill(page, indices) {
  for (const index of indices) {
    await page.locator('.palette-btn').nth(index).click();
  }
}

async function openLocal(page, text, secret) {
  await page.getByRole('button', { name: text.local }).click();
  await page.waitForTimeout(140);
  await fill(page, secret);
  await page.getByRole('button', { name: text.lock }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: text.breaker }).click();
  await page.waitForTimeout(160);
}

async function guess(page, text, indices) {
  await fill(page, indices);
  await page.getByRole('button', { name: text.submit }).click();
  await page.waitForTimeout(180);
}

async function shot(page, file) {
  await page.screenshot({ path: path.join(OUT, file), animations: 'disabled' });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const text = T[lang];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await prepare(page, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await shot(page, path.join(lang, 'home.png'));

  // AI setup.
  await page.getByRole('button', { name: text.solo }).click();
  await page.waitForTimeout(220);
  await shot(page, path.join(lang, 'setup.png'));

  // Mid-game with two clues and a partial draft.
  await page.getByRole('button', { name: text.start }).click();
  await page.waitForTimeout(220);
  await guess(page, text, [0, 0, 1, 1]);
  await guess(page, text, [3, 3, 4, 4]);
  await fill(page, [1, 2]);
  await page.waitForTimeout(180);
  await shot(page, path.join(lang, 'game.png'));

  // Hint with a reason.
  await page.getByRole('button', { name: text.hint }).click();
  await page.waitForTimeout(350);
  await shot(page, path.join(lang, 'game-hint.png'));

  // A real finished local round with a revealed secret.
  await page.getByRole('button', { name: /←/ }).click();
  await page.waitForTimeout(220);
  await openLocal(page, text, [0, 1, 2, 3]);
  await guess(page, text, [0, 4, 4, 4]);
  await guess(page, text, [1, 1, 2, 2]);
  await guess(page, text, [0, 1, 2, 3]);
  await page.locator('.result-card').waitFor();
  await page.waitForTimeout(250);
  await shot(page, path.join(lang, 'game-over.png'));

  // Rules.
  await page.getByRole('button', { name: /←/ }).click();
  await page.waitForTimeout(180);
  await page.locator('.menu-links button').first().click();
  await page.waitForTimeout(220);
  await shot(page, path.join(lang, 'rules.png'));

  // Family record.
  await page.locator('.back').click();
  await page.waitForTimeout(180);
  await page.locator('.record-strip').click();
  await page.waitForTimeout(220);
  await shot(page, path.join(lang, 'record.png'));

  // Phone.
  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await prepare(mobile, lang);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(280);
  await shot(mobile, path.join(lang, 'home-mobile.png'));
  await openLocal(mobile, text, [0, 1, 2, 3]);
  await guess(mobile, text, [0, 4, 4, 4]);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.waitForTimeout(220);
  await shot(mobile, path.join(lang, 'game-mobile.png'));

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
