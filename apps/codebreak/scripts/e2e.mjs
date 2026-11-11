import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5195';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function newPage(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('familyarcade.lang', 'en');
  });
  return page;
}

async function fillPalette(page, indices) {
  for (const index of indices) {
    await page.locator('.palette-btn').nth(index).click();
  }
}

async function lockLocalSecret(page, indices) {
  await fillPalette(page, indices);
  await page.getByRole('button', { name: /Lock the code/ }).click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: /codebreaker/i }).click();
  await page.waitForTimeout(150);
}

const page = await newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

// ---- Local game: P1 sets a hidden code, P2 cracks it.
await page.getByRole('button', { name: /Two players/ }).click();
await page.waitForTimeout(150);
assert(await page.locator('.picker-slots').isVisible(), 'setter picker missing');
await fillPalette(page, [0, 0, 0, 0]);
await page.getByRole('button', { name: /Lock the code/ }).click();
await page.waitForTimeout(150);
assert(await page.getByText('The code is locked.').isVisible(), 'handoff screen missing');
await page.getByRole('button', { name: /codebreaker/i }).click();
await page.waitForTimeout(150);
assert(await page.locator('.guess-board').isVisible(), 'guess board missing');
assert(
  (await page.locator('.secret-card .peg-hidden').count()) === 4,
  'secret was not hidden from the breaker',
);

await fillPalette(page, [0, 0, 0, 0]);
await page.getByRole('button', { name: /Submit guess/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.guess-row.done').count()) === 1, 'guess row not recorded');
assert((await page.locator('.clue-count').first().innerText()).includes('4B 0W'), 'four black missing');
assert((await page.locator('.result-card').innerText()).includes('Code cracked!'), 'cracked result missing');
assert(
  (await page.locator('.secret-card .peg-red').count()) === 4,
  'secret not revealed after the round',
);
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.codebreak.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.cracked === 1, 'family record not updated');
assert(savedRecord.bestGuesses === 1, 'best guess count not updated');

// ---- Restart swaps roles; undo and hint work in a live local round.
await page.getByRole('button', { name: /Play again/ }).click();
await page.waitForTimeout(150);
await lockLocalSecret(page, [0, 1, 2, 3]);
await fillPalette(page, [4, 4, 4, 4]);
await page.getByRole('button', { name: /Submit guess/ }).click();
await page.waitForTimeout(180);
assert((await page.locator('.guess-row.done').count()) === 1, 'second-round guess missing');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.guess-row.done').count()) === 0, 'undo did not remove the guess');
await fillPalette(page, [4, 4, 4, 4]);
await page.getByRole('button', { name: /Submit guess/ }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(300);
assert(await page.locator('.hint-card').isVisible(), 'hint card missing');
assert((await page.locator('.hint-card').innerText()).includes('possible'), 'hint reason missing');
await page.getByRole('button', { name: /Use this guess/ }).click();
await page.waitForTimeout(120);
assert((await page.locator('.picker-slot.filled').count()) === 4, 'hint did not fill the draft');
await page.getByRole('button', { name: /Submit guess/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.guess-row.done').count()) === 2, 'hinted guess not submitted');

// ---- Solo as the breaker; autosave survives a reload.
await page.getByRole('button', { name: /← Home/ }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Solo · crack the code/ }).click();
await page.waitForTimeout(100);
await page.getByRole('button', { name: /Start game/ }).click();
await page.waitForTimeout(150);
assert(await page.locator('.guess-board').isVisible(), 'solo breaker board missing');
await fillPalette(page, [1, 1, 2, 2]);
await page.getByRole('button', { name: /Submit guess/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.guess-row.done').count()) === 1, 'solo guess missing');

await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'continue card missing after reload',
);
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.guess-row.done').count()) === 1, 'resumed guess missing');

// ---- Solo as the setter; the AI guesses from the public clues only.
await page.getByRole('button', { name: /← Home/ }).click();
await page.waitForTimeout(120);
await page.getByRole('button', { name: /Solo · crack the code/ }).click();
await page.waitForTimeout(100);
await page.getByRole('button', { name: /The AI cracks my code/ }).click();
await page.getByRole('button', { name: /Start game/ }).click();
await page.waitForTimeout(150);
await fillPalette(page, [0, 1, 2, 3]);
await page.getByRole('button', { name: /Lock the code/ }).click();
await page.waitForTimeout(1000);
assert((await page.locator('.guess-row.done').count()) >= 1, 'AI did not make a guess');
await page.waitForTimeout(900);
assert((await page.locator('.guess-row.done').count()) >= 2, 'AI did not continue guessing');

// ---- Mobile layout is playable.
const mobile = await newPage({ width: 390, height: 844 });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
await mobile.waitForTimeout(120);
assert(await mobile.locator('.picker-slots').isVisible(), 'mobile picker missing');
await fillPalette(mobile, [0, 1, 2, 3]);
await mobile.getByRole('button', { name: /Lock the code/ }).click();
await mobile.waitForTimeout(100);
await mobile.getByRole('button', { name: /codebreaker/i }).click();
await mobile.waitForTimeout(120);
assert(await mobile.locator('.guess-board').isVisible(), 'mobile board missing');
assert(await mobile.locator('.action-panel').last().isVisible(), 'mobile guess picker missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — local hidden code, win, record, swap, undo, hint, solo breaker, autosave, AI breaker, mobile');
