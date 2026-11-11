import { chromium } from 'playwright';
import { clickSquare, playCheckmateLine } from './game-line.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5198';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// Hot-seat game to a real Black checkmate, including a promotion choice.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
let promotionSeen = false;
promotionSeen = await playCheckmateLine(page, async () => {
  await page.locator('.promotion-card').waitFor({ state: 'visible' });
});
assert(promotionSeen, 'promotion dialog missing');
assert(await page.locator('.promotion-card').isVisible().catch(() => false) === false, 'promotion dialog did not close');
await page.locator('.result-banner').waitFor({ state: 'visible' });
const resultText = await page.locator('.result-banner').innerText();
assert(resultText.includes('Black wins'), `checkmate result wrong: ${resultText}`);
assert(await page.locator('.square.in-check').count() === 1, 'checkmated king not marked');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.mini-chess.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsB === 1, 'family record not updated');

// Restart, undo, hint, and a full keyboard move.
await page.getByRole('button', { name: /Play again/ }).click();
assert((await page.locator('.result-banner').count()) === 0, 'restart left the result banner');
await clickSquare(page, 'e2', 100);
await clickSquare(page, 'e3', 100);
await page.locator('.side-actions .secondary').first().click();
await page.waitForTimeout(120);
const e2Class = await page.locator('[data-square="24"]').getAttribute('class');
const e3Class = await page.locator('[data-square="19"]').getAttribute('class');
assert(e2Class?.includes('has-w'), 'undo did not restore the pawn');
assert(!e3Class?.includes('has-w'), 'undo left the pawn on e3');

await page.locator('.side-actions .secondary').nth(1).click();
await page.locator('.hint-from').first().waitFor({ state: 'visible', timeout: 20000 });
assert((await page.locator('.hint-to').count()) === 1, 'hint target missing');

await page.locator('.square[data-square="24"]').focus();
await page.keyboard.press('Enter');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await page.waitForTimeout(180);
assert((await page.locator('.move-list').innerText()).includes('e2–e3'), 'keyboard move missing');

// AI game answers, then autosave survives a reload.
await page.locator('.game-top .back').click();
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'local save did not offer Continue',
);
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.locator('.row-actions .primary').click();
await clickSquare(page, 'e2', 100);
await clickSquare(page, 'e4', 100);
await page.waitForTimeout(1800);
const aiMoves = await page.locator('.move-list li').count();
assert(aiMoves >= 2, 'AI did not answer');
await page.reload({ waitUntil: 'networkidle' });
assert(
  await page.getByRole('button', { name: /Continue last game/ }).isVisible(),
  'AI save did not survive reload',
);
await page.getByRole('button', { name: /Continue last game/ }).click();
assert(await page.locator('.board').isVisible(), 'resumed board missing');
assert((await page.locator('.move-list li').count()) >= 2, 'resumed move log missing');

// Record screen and bilingual toggle.
await page.locator('.game-top .back').click();
await page.locator('.menu-links .text-button').nth(1).click();
const gamesStat = await page.locator('.stat-card.accent strong').innerText();
assert(Number(gamesStat) >= 1, 'stats screen did not show the finished game');
await page.locator('.narrow-shell > .back').click();
await page.getByRole('button', { name: '中文' }).click();
assert((await page.locator('h1').innerText()).includes('迷你棋'), 'Chinese UI did not load');
await page.getByRole('button', { name: 'English' }).click();
assert((await page.locator('h1').innerText()).includes('Mini Chess'), 'English UI did not return');

// Mobile layout is usable and shows legal targets.
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobile = await mobileContext.newPage();
const mobileErrors = [];
mobile.on('console', (message) => {
  if (message.type() === 'error') mobileErrors.push(message.text());
});
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await clickSquare(mobile, 'e2', 120);
assert((await mobile.locator('.square.target').count()) === 2, 'mobile legal targets missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `mobile console errors: ${mobileErrors.join(' | ')}`);
await browser.close();
console.log('E2E OK — checkmate, promotion, record, restart, undo, hint, keyboard, AI, autosave, stats, bilingual, mobile');
