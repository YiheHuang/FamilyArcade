import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5194';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(lang, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript((value) => {
    localStorage.clear();
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return { context, page, errors };
}

async function readSave(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.fleet.save');
    return raw ? JSON.parse(raw) : null;
  });
}

async function finishBattle(page) {
  const save = await readSave(page);
  if (!save) throw new Error('no save before battle');
  const targets = save.state.boards[1].ships.flatMap((ship) => ship.cells);
  for (const cell of targets) {
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem('familyarcade.fleet.save');
        if (!raw) return false;
        const saved = JSON.parse(raw);
        return saved.state.phase === 'finished' || saved.state.turn === 0;
      },
      null,
      { timeout: 8000 },
    );
    if (await page.locator('.result-banner').count()) break;
    await page.locator(`.enemy-board .cell[data-cell="${cell}"]`).click();
  }
  await page.waitForSelector('.result-banner', { timeout: 8000 });
  await page.waitForTimeout(2800);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const { context, page, errors } = await open(lang, DESKTOP);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('play-ai').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForTimeout(300);
  await page.getByTestId('auto-place').click();
  await page.waitForTimeout(2900);
  await page.screenshot({ path: path.join(dir, 'placement.png') });

  await page.getByTestId('ready').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByTestId('hint').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await finishBattle(page);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /^Home$|^主页$/ }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('rules').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(250);
  await page.getByTestId('stats').click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  if (errors.length) throw new Error(`${lang} errors: ${errors.join(' | ')}`);
  await context.close();
  console.log(`screenshots ${lang}: desktop ok`);
}

async function runMobile(lang) {
  const dir = path.join(OUT, lang);
  const { context, page, errors } = await open(lang, MOBILE);
  await page.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await page.getByTestId('play-ai').click();
  await page.getByTestId('begin').click();
  await page.getByTestId('auto-place').click();
  await page.getByTestId('ready').click();
  await page.waitForSelector('.enemy-board', { timeout: 5000 });
  await page.waitForTimeout(3000);

  const save = await readSave(page);
  const target = save.state.boards[1].ships[0].cells[0];
  await page.locator(`.enemy-board .cell[data-cell="${target}"]`).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-mobile.png') });

  if (errors.length) throw new Error(`${lang} mobile errors: ${errors.join(' | ')}`);
  await context.close();
  console.log(`screenshots ${lang}: mobile ok`);
}

for (const lang of ['en', 'zh']) {
  await run(lang);
  await runMobile(lang);
}

await browser.close();
console.log('screenshots: 20 PNGs written to docs/screenshots/{en,zh}');
