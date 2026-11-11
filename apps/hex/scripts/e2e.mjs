import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5199';
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
  if (!sessionStorage.getItem('hex.e2e.started')) {
    localStorage.removeItem('familyarcade.hex.save');
    localStorage.removeItem('familyarcade.hex.record');
    sessionStorage.setItem('hex.e2e.started', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// Hot-seat game: Red connects column 6 from north to south while Blue builds
// the far-west edge. The final move must finish the game and update the record.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
const redColumn = [5, 16, 27, 38, 49, 60, 71, 82, 93, 104, 115];
const blueColumn = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];
const moves = [];
for (let i = 0; i < redColumn.length; i++) {
  moves.push(redColumn[i]);
  if (i < blueColumn.length) moves.push(blueColumn[i]);
}
for (const move of moves) {
  await page.locator('.hex-cell').nth(move).click();
  await page.waitForTimeout(40);
}
await page.waitForTimeout(200);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('Red wins'), 'Red win not shown');
assert((await page.locator('.hex-cell.winning').count()) === 11, 'winning path not highlighted');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.hex.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.redWins === 1, 'record not updated');

// Restart, undo, hint and the hint reason.
await page.getByRole('button', { name: /Play again/ }).click();
await page.locator('.hex-cell').nth(60).click();
await page.waitForTimeout(80);
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(80);
assert((await page.locator('.hex-cell.has-red').count()) === 0, 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(700);
assert((await page.locator('.hex-cell.hint').count()) === 1, 'hint missing');
assert((await page.locator('.coach-card').innerText()).length > 20, 'coach reason missing');

// AI game starts, answers, autosaves and resumes.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
assert(await page.getByRole('button', { name: /Begin game/ }).isVisible(), 'setup screen missing');
await page.getByRole('button', { name: /Begin game/ }).click();
await page.locator('.hex-cell').nth(60).click();
await page.waitForTimeout(1500);
const marks = await page.locator('.hex-cell.has-red, .hex-cell.has-blue').count();
assert(marks >= 2, 'AI did not reply');

await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'continue card missing',
);

// Keyboard path: continue, focus an empty hex, arrow to another, place it.
await page.getByRole('button', { name: /Continue last game/ }).click();
const empty = page.locator('.hex-cell:not(:disabled)').first();
await empty.focus();
await page.keyboard.press('ArrowDown');
const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-index'));
assert(focused !== null, 'arrow key did not focus a hex');
const beforeKeyboard = await page.locator('.hex-cell.has-red, .hex-cell.has-blue').count();
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const afterKeyboard = await page.locator('.hex-cell.has-red, .hex-cell.has-blue').count();
assert(afterKeyboard > beforeKeyboard, 'keyboard placement failed');

// Mobile layout is usable.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
assert(await mobile.locator('.hex-board').isVisible(), 'mobile board missing');
await mobile.locator('.hex-cell').nth(60).click();
await mobile.waitForTimeout(100);
assert((await mobile.locator('.hex-cell.has-red').count()) === 1, 'mobile move failed');
const overflow = await mobile.evaluate(() => document.body.scrollWidth - innerWidth);
assert(overflow <= 1, `mobile horizontal overflow: ${overflow}px`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — hot-seat win, record, undo, hint, AI, autosave, keyboard, mobile');
