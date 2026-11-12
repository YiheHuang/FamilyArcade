import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5214';
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

const choose = async (piece) => {
  await page.locator(`.piece-slot[data-piece="${piece}"]`).click();
  await page.waitForTimeout(120);
};
const place = async (cell) => {
  await page.locator(`.cell[data-cell="${cell}"]`).click();
  await page.waitForTimeout(120);
};

// Local two-player game: Player 1 completes the top row.
await page.locator('[data-nav=local]').click();
for (const [piece, cell] of [[0, 0], [2, 1], [4, 2], [6, 3]]) {
  await choose(piece);
  await place(cell);
}
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert(
  (await page.locator('.result-banner').innerText()).includes('Player 1 wins'),
  'Player 1 win not shown',
);
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.quarto.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsP1 === 1, 'record not updated');
assert(savedRecord.byMode?.local === 1, 'local mode not recorded');

// Restart, then check undo and a hint.
await page.locator('[data-action=restart]').click();
await choose(0);
await place(0);
await page.locator('[data-action=undo]').click();
await page.waitForTimeout(150);
await page.locator('[data-action=undo]').click();
await page.waitForTimeout(150);
assert(
  (await page.locator('.piece-slot[data-piece="0"]').getAttribute('class')).includes('available'),
  'undo did not return the piece',
);
assert(
  (await page.locator('.cell[data-cell="0"]').getAttribute('class')).includes('empty-cell'),
  'undo did not empty the board',
);
await page.locator('[data-action=hint]').click();
await page.waitForTimeout(500);
assert((await page.locator('.piece-slot.hint').count()) === 1, 'hint missing');
assert((await page.locator('.toast').innerText()).length > 0, 'hint reason missing');

// AI game: human chooses, AI places and chooses, human places. Autosave follows.
await page.locator('[data-action=home]').click();
await page.locator('[data-nav=ai]').click();
await page.locator('[data-action=begin]').click();
await choose(0);
await page.waitForSelector('.cell.empty-cell:not([disabled])', { timeout: 8000 });
await page.locator('.cell.empty-cell:not([disabled])').first().click();
await page.waitForTimeout(1200);
assert((await page.locator('.cell .piece').count()) >= 2, 'AI did not reply');
const savedGame = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.quarto.save') || 'null'),
);
assert(savedGame && savedGame.state?.board?.length === 16, 'autosave missing');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.locator('[data-nav=continue]').isVisible(),
  'continue card missing after reload',
);
await page.locator('[data-nav=continue]').click();
await page.waitForTimeout(400);
assert(
  (await page.locator('.cell .piece').count()) >= 2,
  'continue did not restore the saved board',
);

// Mobile layout is usable.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.locator('[data-nav=local]').click();
await mobile.locator('.piece-slot[data-piece="0"]').click();
await mobile.locator('.cell[data-cell="0"]').click();
assert((await mobile.locator('.cell .piece').count()) === 1, 'mobile piece missing');
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — local win, record, undo, hint, AI reply, autosave, mobile');
