import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5182';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function setLang(page, lang, clearRecord) {
  await page.addInitScript(
    ({ value, clear }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.removeItem('familyarcade.flip.save');
      if (clear) localStorage.removeItem('familyarcade.flip.record');
    },
    { value: lang, clear: clearRecord },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function clickLegal(page, bias = 0) {
  const cells = page.locator('.cell.legal');
  const count = await cells.count();
  if (count === 0) return false;
  await cells.nth((bias * 3 + 1) % count).click();
  await page.waitForTimeout(30);
  return true;
}

async function playMoves(page, moves) {
  for (let index = 0; index < moves; index += 1) {
    const played = await clickLegal(page, index);
    if (!played) break;
  }
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang, true);

  // AI setup.
  await page.getByRole('button', { name: /Play against|和 AI/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // A real AI game, a few exchanges in.
  await page.getByRole('button', { name: /Begin|开始/ }).click();
  for (let round = 0; round < 3; round += 1) {
    const played = await clickLegal(page, round + 2);
    if (!played) break;
    await page.waitForTimeout(950);
  }
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  // Full hot-seat game to a genuine result.
  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  for (let turn = 0; turn < 100; turn += 1) {
    const played = await clickLegal(page, turn);
    if (!played) break;
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Family record from the finished game.
  await page.locator('.result-actions .secondary').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });
  await page.getByRole('button', { name: /^Close$|^关闭$/ }).click();
  await page.waitForTimeout(120);

  // Rules.
  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(200);

  // Home with a full record strip.
  await page.screenshot({ path: path.join(dir, 'home.png') });

  // Mobile home and game.
  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang, false);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await playMoves(mobile, 6);
  await mobile.waitForTimeout(200);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
