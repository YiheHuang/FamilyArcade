import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5211';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function initPage(context, lang) {
  const page = await context.newPage();
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('crib-shots-init')) {
      sessionStorage.setItem('crib-shots-init', '1');
      localStorage.removeItem('familyarcade.cribbage.save');
      localStorage.removeItem('familyarcade.cribbage.record');
    }
    const original = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => original(fn, ms === 620 ? 20 : ms, ...args);
  }, lang);
  return page;
}

async function playToEnd(page, dir, lang) {
  let countShot = false;
  let overShot = false;
  for (let step = 0; step < 1600; step += 1) {
    if (await page.locator('.result-card').isVisible().catch(() => false)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(dir, 'game-over.png') });
      overShot = true;
      break;
    }

    if (await page.locator('.show-section').isVisible().catch(() => false)) {
      if (!countShot) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(dir, 'game-count.png') });
        countShot = true;
      }
      const next = page.getByRole('button', { name: /Next hand|下一局/ });
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        await page.waitForTimeout(25);
        continue;
      }
      await page.waitForTimeout(20);
      continue;
    }

    const confirm = page.getByRole('button', { name: /Send to crib|放入弃牌堆/ });
    if (await confirm.isVisible().catch(() => false)) {
      if (!(await confirm.isEnabled().catch(() => false))) {
        const cards = page.locator('.hand .playing-card:not(.is-dim)');
        const count = await cards.count();
        for (let index = 0; index < Math.min(2, count); index += 1) {
          await cards.nth(index).click();
        }
        if (await confirm.isEnabled().catch(() => false)) await confirm.click();
      }
      await page.waitForTimeout(20);
      continue;
    }

    const cut = page.getByRole('button', { name: /Cut the deck|切牌/ });
    if (await cut.isVisible().catch(() => false)) {
      if (await cut.isEnabled().catch(() => false)) await cut.click();
      await page.waitForTimeout(20);
      continue;
    }

    const legal = page.locator('.hand .playing-card:not(.is-dim)');
    if ((await legal.count()) > 0) {
      await legal.first().click();
      await page.waitForTimeout(20);
      continue;
    }
    await page.waitForTimeout(20);
  }
  if (!overShot) throw new Error(`game did not finish for ${lang}`);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await initPage(context, lang);
  await page.goto(`${BASE}/?deal=12345`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Solo against the computer|和电脑对局/ }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Deal the first hand|开始发牌/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: /Send to crib|放入弃牌堆/ }).click();
  await page.waitForSelector('.cut-stage');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'game-cut.png') });

  await page.getByRole('button', { name: /Cut the deck|切牌/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-peg.png') });

  await playToEnd(page, dir, lang);

  await page.getByRole('button', { name: /^Home$|^主页$/ }).click();
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();

  await page.getByRole('button', { name: /LAN table|局域网牌桌/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await initPage(mobileContext, lang);
  await mobile.goto(`${BASE}/?deal=2468`, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Solo against the computer|和电脑对局/ }).click();
  await mobile.getByRole('button', { name: /Deal the first hand|开始发牌/ }).click();
  await mobile.waitForTimeout(250);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
