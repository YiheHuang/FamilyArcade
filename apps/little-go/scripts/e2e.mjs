import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5197';
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
await page.evaluate(() => {
  localStorage.removeItem('familyarcade.little-go.save');
  localStorage.removeItem('familyarcade.little-go.record');
});
await page.reload({ waitUntil: 'networkidle' });

// Bilingual UI and sound toggle.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(120);
assert((await page.evaluate(() => document.documentElement.lang)) === 'zh-CN', 'Chinese UI did not apply');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(120);
await page.getByRole('button', { name: /Sound on/ }).click();
assert(await page.getByRole('button', { name: /Sound off/ }).isVisible(), 'sound toggle failed');
await page.getByRole('button', { name: /Sound off/ }).click();

// A local game has 81 real intersections.
await page.getByRole('button', { name: /Two players, one device/ }).click();
assert((await page.locator('.go-point').count()) === 81, 'Go board must have 81 intersections');

// Keyboard path: arrows move the cursor, Enter places a stone.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await page.locator('.go-point.has-black').count()) === 1, 'keyboard placement failed');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(120);

// Four legal placements, then undo.
for (const point of [40, 30, 50, 22]) {
  await page.locator('.go-point').nth(point).click();
  await page.waitForTimeout(90);
}
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) === 4, 'placements failed');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) === 3, 'undo failed');

// Hint shows a highlighted point and a reason.
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(350);
assert((await page.locator('.go-point.hint').count()) === 1, 'hint point missing');
assert(await page.locator('.hint-note').isVisible(), 'hint reason missing');
assert((await page.locator('.hint-note').innerText()).length > 4, 'hint reason is empty');

// Two consecutive passes finish and score the game.
await page.locator('.go-point').nth(58).click();
await page.waitForTimeout(120);
await page.locator('.pass-button').click();
await page.waitForTimeout(160);
await page.locator('.pass-button').click();
await page.waitForTimeout(350);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const resultText = await page.locator('.result-banner').innerText();
assert(/wins by/.test(resultText), `score result not shown: ${resultText}`);
assert(await page.locator('.score-card').isVisible(), 'score card missing');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.little-go.record') || '{}'),
);
assert(savedRecord.version === 2 && savedRecord.games === 1, 'record not updated');

// Play again resets the board.
await page.getByRole('button', { name: /^Play again$/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) === 0, 'restart failed');

// AI replies, and the autosave survives a reload.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.locator('.level-card').filter({ hasText: 'Easy' }).click();
await page.getByRole('button', { name: /^Begin$/ }).click();
await page.waitForTimeout(200);
await page.locator('.go-point').nth(40).click();
await page.waitForTimeout(2200);
const aiStones = await page.locator('.go-point.has-black, .go-point.has-white').count();
assert(aiStones >= 2, 'AI did not reply');
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'autosave missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(300);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) >= 2, 'resume lost the board');

// Autosave survives a reload.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'autosave missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(300);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) >= 2, 'resume lost the board');

// Phone layout is usable: tap a point on a 390-wide screen.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players, one device/ }).click();
assert(await mobile.locator('.go-board').isVisible(), 'mobile board missing');
await mobile.locator('.go-point').nth(40).click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.go-point.has-black').count()) === 1, 'mobile tap failed');

// Rules and record screens render in both languages.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /How to play/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.rules-list li').count()) === 5, 'rules missing');
await page.getByRole('button', { name: /^Close$/ }).click();
await page.getByRole('button', { name: /Family record/ }).first().click();
await page.waitForTimeout(150);
assert((await page.locator('.stat-card').count()) === 4, 'record screen missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — board, placement, undo, hint, pass scoring, record, AI, autosave, keyboard, mobile, rules');
