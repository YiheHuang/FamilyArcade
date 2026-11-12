import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5222';
const APP = `${BASE}/?seed=17&fast=1`;
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

async function waitHuman(page, timeout = 25000) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.hint-button');
      return (
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        !document.querySelector('.privacy-gate') &&
        !document.querySelector('.result-panel')
      );
    },
    null,
    { timeout },
  );
}

async function playHint(page) {
  await page.locator('.hint-button').click();
  await page.waitForTimeout(100);
  const hinted = page.locator('.hand .playing-card.hint');
  const count = await hinted.count();
  if (count > 0) {
    const ids = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of ids) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    await page.locator('.play-button').click();
    return true;
  }
  if (await page.locator('.pass-button').isEnabled().catch(() => false)) {
    await page.locator('.pass-button').click();
    return true;
  }
  return false;
}

async function finishGame(page) {
  for (let step = 0; step < 700; step += 1) {
    if (await page.locator('.result-panel').isVisible().catch(() => false)) return;
    const hint = page.locator('.hint-button');
    if (!(await hint.isEnabled().catch(() => false))) {
      await page.waitForTimeout(120);
      continue;
    }
    await playHint(page);
    await page.waitForTimeout(110);
  }
  throw new Error('screenshot round did not finish');
}

async function makeDesktop(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.big-two.save');
    localStorage.removeItem('familyarcade.big-two.record');
  }, lang);
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Solo against|单人对抗/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Deal the cards|发牌开局/ }).click();
  await page.waitForSelector('.felt', { timeout: 10000 });
  await waitHuman(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.locator('.hint-button').click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await finishGame(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.locator('.result-actions .text-button').click();
  await page.getByRole('button', { name: /View record|查看战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(180);

  await page.getByRole('button', { name: /Wi-Fi table|局域网牌桌/ }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await context.close();
}

async function makeMobile(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(MOBILE);
  await context.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.big-two.save');
  }, lang);
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await page.getByRole('button', { name: /Solo against|单人对抗/ }).click();
  await page.getByRole('button', { name: /Deal the cards|发牌开局/ }).click();
  await page.waitForSelector('.felt', { timeout: 10000 });
  await waitHuman(page);
  await page.locator('.hint-button').click();
  await page.waitForTimeout(200);
  const hinted = page.locator('.hand .playing-card.hint');
  if ((await hinted.count()) > 0) {
    await hinted.first().dispatchEvent('click');
  }
  await page.waitForTimeout(3400);
  await page.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await context.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const lang of ['en', 'zh']) {
  await makeDesktop(browser, lang);
  await makeMobile(browser, lang);
  console.log(`screenshots ${lang}: ok`);
}
await closeBrowser(browser);
console.log(`screenshots written to ${OUT}`);
process.exit(0);
