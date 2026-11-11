import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5183';
const demo = JSON.parse(
  readFileSync(new URL('./demo-game.json', import.meta.url), 'utf8'),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function playMove(page, move, wait = 24) {
  for (const square of [move.from, ...move.path.slice(1)]) {
    await page.locator('.square').nth(square).click();
    await page.waitForTimeout(wait);
  }
}

async function playSequence(page, from = 0, to = demo.moves.length) {
  for (let index = from; index < to; index++) {
    await playMove(page, demo.moves[index]);
  }
}

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
assert((await page.locator('h1').innerText()).includes('Draughts'), 'home title missing');

// A complete hot-seat game from the opening to a Red win.
await page.getByRole('button', { name: /Two players/ }).click();
await page.waitForTimeout(200);
await playSequence(page);
await page.waitForTimeout(300);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert(
  (await page.locator('.result-banner').innerText()).includes('Red wins'),
  'Red win not shown',
);
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.draughts.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.redWins === 1, 'record not updated');

await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Family record/ }).click();
assert(
  (await page.locator('.stat-grid').innerText()).includes('1'),
  'family record screen missing the game',
);
await page.getByRole('button', { name: /Back/ }).click();

// Solo game: move, AI reply, undo, hint.
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Easy/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.waitForTimeout(250);
await page.locator('.square').nth(42).click();
await page.waitForTimeout(120);
assert((await page.locator('.square.target').count()) >= 1, 'move targets missing');
await page.locator('.square').nth(33).click();
await page.waitForTimeout(1600);
const afterReply = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.draughts.save') || '{}'),
);
assert(afterReply.state?.plies >= 2, 'AI did not reply');
assert((await page.locator('.turn-bar strong').innerText()).includes('Your turn'), 'turn did not return');

await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(250);
const afterUndo = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.draughts.save') || '{}'),
);
assert(afterUndo.state?.plies === 0, 'undo did not return to the opening');

await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(600);
assert((await page.locator('.square.hint').count()) >= 2, 'hint path missing');
assert(await page.locator('.toast').isVisible(), 'hint reason missing');
await page.keyboard.press('Escape');

// Keyboard path: focus a piece, Enter to select, focus a landing, Enter to move.
await page.locator('.square[aria-label^="c3,"]').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await page.locator('.square.target').count()) >= 1, 'keyboard selection failed');
await page.locator('.square[aria-label^="b4,"]').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(1600);
const keyboardSave = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.draughts.save') || '{}'),
);
assert(keyboardSave.state?.plies >= 2, 'keyboard move or AI reply failed');

// Autosave survives a reload and Continue resumes the game.
await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'continue card missing after reload',
);
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(400);
assert(
  !(await page.locator('.move-line').innerText()).includes('No moves yet'),
  'resumed game lost its moves',
);

// Mobile layout and a real tap-to-move path.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
await mobile.waitForTimeout(250);
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.square').nth(42).click();
await mobile.waitForTimeout(120);
await mobile.locator('.square').nth(33).click();
await mobile.waitForTimeout(200);
assert(
  (await mobile.locator('.move-line').innerText()).includes('c3-b4'),
  'mobile move failed',
);
const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
assert(overflow <= 1, `mobile page overflows by ${overflow}px`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — full game, record, AI, undo, hint, autosave, mobile');
