import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5193';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page, 'desktop');
await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE + '/?seed=2026', { waitUntil: 'networkidle' });

assert(await page.getByRole('button', { name: /Play against the AI/ }).isVisible(), 'home menu missing');
assert(await page.locator('.hero-die').count() === 5, 'hero dice missing');

// Hot-seat setup with real names.
await page.getByRole('button', { name: /Pass and play/ }).click();
assert(await page.locator('.name-fields input').count() === 2, 'two name fields expected');
await page.locator('.name-fields input').nth(0).fill('Mama');
await page.locator('.name-fields input').nth(1).fill('Nora');
await page.getByRole('button', { name: /Roll the first hand/ }).click();
await page.locator('.dice-stage').waitFor();
assert((await page.locator('.turn-bar strong').innerText()).includes("Mama's turn"), 'hot-seat turn missing');

// Roll, hold, reroll, score.
await page.locator('.roll-button').click();
await page.waitForTimeout(250);
assert((await page.locator('.die').count()) === 5, 'five dice expected');
await page.locator('.die').nth(0).click();
assert((await page.locator('.die.held').count()) === 1, 'hold did not stick');
await page.locator('.roll-button').click();
await page.waitForTimeout(250);
assert((await page.locator('.die.held').count()) === 1, 'held die was not preserved');
const firstOpen = page.locator('.category-row:not([disabled])').first();
await firstOpen.click();
await page.waitForTimeout(250);
assert((await page.locator('.score-cell.filled').count()) === 1, 'score not filled');
assert((await page.locator('.turn-bar strong').innerText()).includes("Nora's turn"), 'turn did not pass');

// Undo returns to the open box, then hint highlights a category.
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.score-cell.filled').count()) === 0, 'undo did not clear the box');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(200);
assert(await page.locator('.hint-card').isVisible(), 'hint card missing');
assert((await page.locator('.category-row.hinted').count()) === 1, 'hint category not highlighted');
await page.locator('.category-row:not([disabled])').first().click();
await page.waitForTimeout(200);

// Play the remaining 25 turns to reach a real final scorecard.
for (let turn = 0; turn < 25; turn += 1) {
  await page.locator('.roll-button').click();
  await page.waitForTimeout(15);
  await page.locator('.category-row:not([disabled])').first().click();
  await page.waitForTimeout(15);
}
await page.waitForTimeout(300);
assert(await page.locator('.result-panel').isVisible(), 'game-over panel missing');
assert((await page.locator('.score-cell.filled').count()) === 26, 'final scorecard is not full');
const savedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.five-dice.record') || '{}'));
assert(savedRecord.games === 1 && savedRecord.history.length === 1, 'family record not updated');
assert((await page.locator('.result-panel').innerText()).length > 10, 'result text missing');

// AI game: human rolls and scores, then the AI takes its whole turn.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Roll the first hand/ }).click();
await page.locator('.roll-button').click();
await page.waitForTimeout(300);
await page.locator('.category-row:not([disabled])').first().click();
await page.waitForTimeout(6000);
assert((await page.locator('.score-cell.filled').count()) >= 2, 'AI did not score its turn');
assert((await page.locator('.turn-bar strong').innerText()).includes('Your turn'), 'turn did not return to the human');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue/ }).click();
assert(await page.locator('.dice-stage').isVisible(), 'resume did not open the game');

// Chinese UI switch.
await page.getByRole('button', { name: /中文/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('h1, .game-id strong').first().innerText()).includes('五骰'), 'Chinese title missing');

// Mobile layout: setup, roll, scorecard.
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobile = await mobileContext.newPage();
watch(mobile, 'mobile');
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE + '/?seed=99', { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Pass and play/ }).click();
await mobile.getByRole('button', { name: /Roll the first hand/ }).click();
await mobile.locator('.roll-button').click();
await mobile.waitForTimeout(250);
assert(await mobile.locator('.scorecard').isVisible(), 'mobile scorecard missing');
await mobile.locator('.category-row:not([disabled])').first().click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.score-cell.filled').count()) === 1, 'mobile score failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — setup, roll/hold, score, undo, hint, full game, AI, autosave, zh UI, mobile');
