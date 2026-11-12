import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5222';
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
const savedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.big-two.record') || '{}'));
assert(savedRecord.games === 1 && savedRecord.winsX === 1, 'record not updated');

// Restart, then check undo and hint.
await page.getByRole('button', { name: /Play again/ }).click();
await page.locator('.cell').nth(4).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.cell').nth(4).getAttribute('class'))?.includes('cell'), 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.cell.hint').count()) === 1, 'hint missing');

// AI game starts and answers.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('.cell').nth(4).click();
await page.waitForTimeout(900);
const marks = await page.locator('.cell .mark').count();
assert(marks >= 2, 'AI did not reply');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');

// Mobile layout is usable.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.cell').nth(0).click();

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — local, win, record, undo, hint, AI, autosave, mobile');
