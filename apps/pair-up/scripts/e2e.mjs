import { chromium } from 'playwright';
import {
  expectNoErrors,
  playAttempt,
  playGame,
  prepare,
  readRecord,
  readSave,
  snapshotTiles,
  startLocal,
} from './harness.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5190';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await prepare(page, 'en');
await page.goto(`${BASE}/?fast=1`, { waitUntil: 'networkidle' });
assert((await page.locator('h1').innerText()).includes('Pair Up'), 'home did not render');

// A complete hot-seat game, played by a real memory strategy in the browser.
await startLocal(page, { players: 2, size: 4 });
assert((await page.locator('.tile').count()) === 16, '4×4 deck should have 16 cards');
const finished = await playGame(page);
assert(finished, 'local game did not finish');
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const resultText = await page.locator('.result-banner').innerText();
assert(/wins|tie|获胜|平局/i.test(resultText), `result text missing: ${resultText}`);
const record = await readRecord(page);
assert(record && record.games === 1, 'family record was not updated');
assert(record.localWins + record.ties === 1, 'hot-seat result was not recorded');

// Play again, then check undo and a hint.
await page.locator('.result-banner .primary').click();
await page.waitForSelector('.tile-grid .tile');
await page.locator('.tile').nth(0).click();
await page.waitForTimeout(150);
assert((await page.locator('.tile.face-up').count()) === 1, 'first flip did not open');
await page.locator('.side-actions .secondary').nth(0).click();
await page.waitForTimeout(150);
assert((await page.locator('.tile.face-up').count()) === 0, 'undo did not close the card');
await page.locator('.side-actions .secondary').nth(1).click();
await page.waitForTimeout(200);
assert((await page.locator('.tile.hint').count()) >= 1, 'hint did not highlight a card');

// Solo: keep flipping until the human turn ends, then let the AI answer.
await page.locator('.game-top .back').click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Solo \+ AI|单人挑战/ }).click();
await page.locator('.row-actions .primary').first().click();
await page.waitForSelector('.tile-grid .tile');
const known = { byIndex: new Map(), byEmoji: new Map() };
for (let i = 0; i < 6; i++) {
  await playAttempt(page, known);
  await page.waitForTimeout(180);
  const saved = await readSave(page);
  if (!saved || saved.state.turn !== 0) break;
}
const beforeAi = (await readSave(page))?.state.reveals.length ?? 0;
await page.waitForTimeout(1400);
const aiSave = await readSave(page);
assert(aiSave, 'solo game was not autosaved');
const aiReveals = aiSave.state.reveals.filter((reveal) => reveal.seat === 1);
assert(aiReveals.length >= 1, `AI did not take a flip (before ${beforeAi}, reveals ${aiSave.state.reveals.length})`);

// Autosave survives a reload and offers a Continue card.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game|继续上局/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game|继续上局/ }).click();
await page.waitForSelector('.tile-grid .tile');
assert((await snapshotTiles(page)).length === 16, 'resumed board lost cards');

// Phone layout is usable and cards respond to touch.
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
await prepare(mobile, 'en');
await mobile.goto(`${BASE}/?fast=1`, { waitUntil: 'networkidle' });
await startLocal(mobile, { players: 2, size: 4 });
assert(await mobile.locator('.tile-grid').isVisible(), 'mobile board missing');
await mobile.locator('.tile').nth(0).click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.tile.face-up').count()) === 1, 'mobile flip failed');

await expectNoErrors(errors);
await browser.close();
console.log('E2E OK — full hot-seat game, record, undo, hint, AI reply, autosave, resume, mobile');
