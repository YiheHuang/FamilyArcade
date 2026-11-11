import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5188';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function readSave(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.race-home.save');
    return raw ? JSON.parse(raw) : null;
  });
}

async function setupPage(context, lang, seed) {
  const page = await context.newPage();
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(`${BASE}/?seed=${seed}`, { waitUntil: 'networkidle' });
  return page;
}

async function clickStart(page, kind, count = 2) {
  await page.getByRole('button', { name: kind === 'ai' ? /Play with AI|和 AI 比赛/ : /Hot-seat|同屏热座/ }).click();
  await page.locator('.segmented button').nth(count - 2).click();
  await page.getByRole('button', { name: /Start the race|开始比赛/ }).click();
  await page.waitForTimeout(200);
}

async function playTo(page, targetRolls, requireMove, maxSteps = 4000) {
  let state = null;
  for (let step = 0; step < maxSteps; step++) {
    if (await page.locator('.result-banner').count()) return { over: true, state };
    state = await readSave(page);
    const rolls = state?.state?.rolls ?? 0;
    if (rolls >= targetRolls) {
      if (!requireMove) return { over: false, state };
      if (state?.state?.phase === 'move' && (await page.locator('.pawn.legal').count()) > 0) {
        return { over: false, state };
      }
    }
    const roll = page.locator('.roll-button');
    if (await roll.isEnabled()) {
      await roll.click();
      await page.waitForTimeout(6);
      continue;
    }
    const legal = page.locator('.pawn.legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.waitForTimeout(8);
      continue;
    }
    await page.waitForTimeout(15);
  }
  return { over: await page.locator('.result-banner').count() > 0, state: await readSave(page) };
}

async function playToEnd(page, maxSteps = 6000) {
  for (let step = 0; step < maxSteps; step++) {
    if (await page.locator('.result-banner').count()) return true;
    const roll = page.locator('.roll-button');
    if (await roll.isEnabled()) {
      await roll.click();
      await page.waitForTimeout(4);
      continue;
    }
    const legal = page.locator('.pawn.legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.waitForTimeout(5);
      continue;
    }
    await page.waitForTimeout(15);
  }
  return (await page.locator('.result-banner').count()) > 0;
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: DESKTOP,
    locale: lang === 'zh' ? 'zh-CN' : 'en-US',
    reducedMotion: 'reduce',
  });
  await context.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.race-home.save');
    localStorage.removeItem('familyarcade.race-home.record');
  }, lang);

  // Setup screen: four seats, Hard selected.
  const setup = await setupPage(context, lang, `shots-${lang}`);
  await setup.getByRole('button', { name: /Play with AI|和 AI 比赛/ }).click();
  await setup.locator('.segmented button').nth(2).click();
  await setup.getByRole('button', { name: /Hard|挑战/ }).first().click();
  await setup.waitForTimeout(250);
  await setup.screenshot({ path: path.join(dir, 'setup.png') });
  await setup.close();

  // Mid-game: four hot-seat players, enough rolls to fill the ring.
  const mid = await setupPage(context, lang, `shots-${lang}`);
  await clickStart(mid, 'local', 4);
  const midState = await playTo(mid, 150, true, 2600);
  await mid.waitForTimeout(3000);
  await mid.screenshot({ path: path.join(dir, 'game.png') });
  await mid.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await mid.waitForTimeout(400);
  await mid.screenshot({ path: path.join(dir, 'game-hint.png') });
  console.log(`${lang}: mid-game rolls=${midState.state?.state?.rolls ?? '?'} over=${midState.over}`);
  await mid.close();

  // A complete two-player race for the result screen.
  const finish = await setupPage(context, lang, 'racehome');
  await clickStart(finish, 'local', 2);
  const done = await playToEnd(finish);
  if (!done) throw new Error(`${lang}: game-over screenshot game did not finish`);
  await finish.waitForTimeout(3000);
  await finish.screenshot({ path: path.join(dir, 'game-over.png') });

  // Restart, make a couple of moves, then return home: record + continue card.
  await finish.getByRole('button', { name: /Race again|再来一局/ }).click();
  await finish.waitForTimeout(150);
  await playTo(finish, 3, false, 300);
  await finish.getByRole('button', { name: /Home|主页/ }).first().click();
  await finish.waitForTimeout(350);
  await finish.screenshot({ path: path.join(dir, 'home.png') });

  await finish.getByRole('button', { name: /Family record|家庭战绩/ }).first().click();
  await finish.waitForTimeout(250);
  await finish.screenshot({ path: path.join(dir, 'stats.png') });
  await finish.getByRole('button', { name: /Back|返回/ }).click();
  await finish.getByRole('button', { name: /Rules|规则/ }).first().click();
  await finish.waitForTimeout(200);
  await finish.screenshot({ path: path.join(dir, 'rules.png') });
  await finish.getByRole('button', { name: /Close|关闭/ }).click();
  await finish.getByRole('button', { name: /LAN night|局域网之夜/ }).click();
  await finish.waitForTimeout(250);
  await finish.screenshot({ path: path.join(dir, 'lan.png') });
  await finish.close();

  // Phone: real 390×844 viewport at 2×.
  const mobileContext = await browser.newContext({
    viewport: MOBILE,
    locale: lang === 'zh' ? 'zh-CN' : 'en-US',
    reducedMotion: 'reduce',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobileContext.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.race-home.save');
    localStorage.removeItem('familyarcade.race-home.record');
  }, lang);
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${BASE}/?seed=shots-mobile-${lang}`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await clickStart(mobile, 'local', 4);
  await playTo(mobile, 86, true, 2200);
  await mobile.waitForTimeout(2800);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await mobile.close();

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await run('en');
await run('zh');
