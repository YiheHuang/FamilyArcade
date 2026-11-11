import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5182';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('familyarcade.e2e.init')) {
    localStorage.removeItem('familyarcade.flip.record');
    localStorage.removeItem('familyarcade.flip.save');
    sessionStorage.setItem('familyarcade.e2e.init', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// Hot-seat game played to a real finish, one legal move at a time.
await page.getByRole('button', { name: /Two players/ }).click();
let clicks = 0;
for (let turn = 0; turn < 100; turn += 1) {
  const legal = page.locator('.cell.legal');
  if ((await legal.count()) === 0) break;
  await legal.first().click();
  clicks += 1;
  await page.waitForTimeout(30);
}
assert(clicks >= 20, `game ended too early (${clicks} moves)`);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const resultText = await page.locator('.result-banner').innerText();
assert(/Black wins|White wins|A draw/.test(resultText), `bad result: ${resultText}`);

const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.flip.record') || '{}'),
);
assert(savedRecord.games === 1, 'record did not count the game');
assert(
  savedRecord.winsBlack + savedRecord.winsWhite + savedRecord.draws === 1,
  'record totals are inconsistent',
);

// Restart, then verify the keyboard path, undo and hint with a reason.
await page.getByRole('button', { name: /Play again/ }).click();
await page.waitForTimeout(120);
assert((await page.locator('.cell .disc').count()) === 4, 'restart did not reset the board');
await page.locator('.cell').nth(19).focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Enter');
await page.waitForTimeout(140);
assert((await page.locator('.cell .disc').count()) === 5, 'keyboard placement failed');
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(140);
assert((await page.locator('.cell .disc').count()) === 4, 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(300);
assert((await page.locator('.cell.hint').count()) === 1, 'hint square missing');
const hintText = await page.locator('.hint-card').innerText();
assert(/Corner|Safe shape|Momentum|Mobility|Best shape/.test(hintText), 'hint has no reason');

// Solo game: AI answers, then autosave survives a reload.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Begin game/ }).click();
await page.locator('.cell.legal').first().click();
await page.waitForTimeout(1200);
assert((await page.locator('.cell .disc').count()) >= 6, 'AI did not reply');

await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'continue card missing after reload',
);
await page.getByRole('button', { name: /Family record/ }).click();
await page.waitForTimeout(120);
assert(await page.locator('.record-hero').isVisible(), 'record screen missing');
await page.getByRole('button', { name: /^Close$/ }).click();

// Mobile layout is usable.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
mobile.on('pageerror', (error) => errors.push(`mobile: ${String(error)}`));
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.cell.legal').first().click();
await mobile.waitForTimeout(120);
assert((await mobile.locator('.cell .disc').count()) === 5, 'mobile move failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — full game, record, keyboard, undo, hint, AI, autosave, stats, mobile');
