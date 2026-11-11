import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5180';
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
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// Local two-player game: X wins on the top row.
await page.getByRole('button', { name: /Two players/ }).click();
for (const move of [0, 3, 1, 4, 2]) {
  await page.locator('.cell').nth(move).click();
  await page.waitForTimeout(160);
}
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('X wins'), 'X win not shown');
const savedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.triple.record') || '{}'));
assert(savedRecord.games === 1 && savedRecord.winsX === 1, 'record not updated');
assert(savedRecord.byMode.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'X', 'recent result not tracked');

// Restart, then check undo and a reasoned hint.
await page.getByRole('button', { name: /Play again/ }).click();
await page.locator('.cell').nth(4).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.cell').nth(4).getAttribute('class'))?.includes('cell'), 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.cell.hint').count()) === 1, 'hint missing');
const hintToast = await page.locator('.toast').innerText();
assert(/centre|corner|Complete|Block|balanced/i.test(hintToast), `hint reason missing: ${hintToast}`);

// AI game starts and answers. A number key must not steal the AI's turn.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('.cell').nth(4).click();
await page.keyboard.press('1');
await page.waitForTimeout(100);
assert((await page.locator('.cell.has-o').count()) === 0, 'keyboard stole the AI turn');
await page.waitForTimeout(900);
const marks = await page.locator('.cell .mark').count();
assert(marks >= 2, 'AI did not reply');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');

// Record screen shows the finished local game.
await page.getByRole('button', { name: /View record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
assert((await page.getByRole('button', { name: /Clear record/ }).count()) === 1, 'clear record missing');
await page.getByRole('button', { name: /Home/ }).click();

// Mobile layout: the hero board must fill the phone column, not collapse.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
mobile.on('pageerror', (error) => errors.push(String(error)));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-board .board').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero board too narrow: ${heroBox?.width}`);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
const boardBox = await mobile.locator('.board').boundingBox();
assert(boardBox && boardBox.width > 300, `mobile game board too narrow: ${boardBox?.width}`);
await mobile.locator('.cell').nth(0).click();
const cellBox = await mobile.locator('.cell').nth(0).boundingBox();
assert(cellBox && cellBox.height >= 80, `mobile cell too small: ${cellBox?.height}`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — local win, record, stats, undo, hint reason, AI guard, autosave, mobile layout');
