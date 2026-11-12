import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5223';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

async function startSolo(page) {
  await page.locator('.menu .primary').click();
  await page.locator('.row-actions .primary').click();
  await page.waitForSelector('.felt', { timeout: 10000 });
}

async function advance(page, stop, max = 260) {
  for (let step = 0; step < max; step += 1) {
    if (await stop()) return true;
    const hint = page.locator('.hint-button');
    if (!(await hint.isEnabled().catch(() => false))) {
      await page.waitForTimeout(120);
      continue;
    }
    await hint.click();
    await page.waitForTimeout(70);
    if (await page.locator('.declare-option.hinted').count()) {
      await page.locator('.declare-option.hinted').first().click();
    } else if (await page.locator('.declare-panel').count()) {
      await page.locator('.pass-declare-button').click();
    } else if (
      (await page.locator('.bury-panel').count()) > 0 &&
      (await page.locator('.bury-button').isEnabled().catch(() => false))
    ) {
      await page.locator('.bury-button').click();
    } else if (
      (await page.locator('.play-button').count()) > 0 &&
      (await page.locator('.play-button').isEnabled().catch(() => false))
    ) {
      await page.locator('.play-button').click();
    } else {
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(140);
  }
  return stop();
}

async function reachLiveTrick(page) {
  return advance(page, async () => {
    const hasTrick = (await page.locator('.trick-area.has-trick').count()) > 0;
    const plays = await page.locator('.trick-play').count();
    const hintReady = await page.locator('.hint-button').isEnabled().catch(() => false);
    return hasTrick && plays >= 2 && hintReady;
  });
}

async function finishDeal(page) {
  return advance(page, async () => (await page.locator('.result-panel').count()) > 0);
}

async function makeDesktop(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.addInitScript(
    (value) => {
      if (!sessionStorage.getItem('sheng-ji-shots-init')) {
        sessionStorage.setItem('sheng-ji-shots-init', '1');
        localStorage.clear();
      }
      localStorage.setItem('familyarcade.lang', value);
    },
    lang,
  );
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.locator('.menu .primary').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.locator('.row-actions .primary').click();
  await page.waitForSelector('.felt');
  await reachLiveTrick(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  if (await page.locator('.hint-button').isEnabled().catch(() => false)) {
    await page.locator('.hint-button').click();
    await page.waitForTimeout(220);
  }
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await finishDeal(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.locator('.game-top .back').click();
  await page.waitForTimeout(250);
  await page.locator('.menu-links .text-button').nth(1).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
  await page.waitForTimeout(200);
  await page.locator('.menu-links .text-button').nth(0).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.locator('.narrow-shell > .primary').click();
  await page.waitForTimeout(200);
  await page.locator('.lan-menu-button').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await context.close();
}

async function makeMobile(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(MOBILE);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.addInitScript(
    (value) => {
      if (!sessionStorage.getItem('sheng-ji-shots-mobile-init')) {
        sessionStorage.setItem('sheng-ji-shots-mobile-init', '1');
        localStorage.clear();
      }
      localStorage.setItem('familyarcade.lang', value);
    },
    lang,
  );
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await startSolo(page);
  await page.waitForTimeout(350);
  await reachLiveTrick(page);
  if (await page.locator('.hint-button').isEnabled().catch(() => false)) {
    await page.locator('.hint-button').click();
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    const scoreboard = document.querySelector('.scoreboard');
    if (!(scoreboard instanceof HTMLElement)) return;
    window.scrollTo({ top: Math.max(0, scoreboard.getBoundingClientRect().top + window.scrollY - 10), behavior: 'auto' });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await context.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const only = process.env.SHOTS_ONLY || 'all';
for (const lang of ['en', 'zh']) {
  if (only !== 'mobile') await makeDesktop(browser, lang);
  if (only !== 'desktop') await makeMobile(browser, lang);
  console.log(`screenshots ${lang}: ok`);
}
await closeBrowser(browser);
console.log(`screenshots written to ${OUT}`);
process.exit(0);
