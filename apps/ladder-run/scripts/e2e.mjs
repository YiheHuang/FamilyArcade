import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5189';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const nearSave = {
  version: 2,
  mode: 'local',
  level: 'normal',
  savedAt: Date.now(),
  state: {
    version: 1,
    players: [
      { seat: 0, name: 'Mia', kind: 'human', level: 'normal', position: 99 },
      { seat: 1, name: 'Leo', kind: 'human', level: 'normal', position: 87 },
    ],
    turn: 0,
    status: 'playing',
    winner: null,
    lastRoll: 3,
    lastMove: { seat: 1, roll: 3, from: 84, raw: 87, to: 87, transport: 'none', overshoot: false, wins: false },
    moves: [{ seat: 1, roll: 3, from: 84, raw: 87, to: 87, transport: 'none', overshoot: false, wins: false }],
  },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

// ---------------------------------------------------------------- hot-seat
const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await desktopCtx.newPage();
watch(page, 'desktop');
await desktopCtx.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByTestId('play-local').waitFor();
assert(await page.getByTestId('play-local').isVisible(), 'home did not render');
await page.getByTestId('play-local').click();
assert((await page.locator('.screen-title').innerText()).includes('Set the table'), 'setup screen missing');
await page.getByRole('button', { name: '3', exact: true }).click();
assert((await page.locator('.name-card').count()) === 3, 'three-player setup did not expand');
await page.getByTestId('setup-begin').click();
assert((await page.locator('.tile').count()) === 100, 'board does not have 100 squares');
assert((await page.locator('.turn-bar').innerText()).includes("Player 1's turn"), 'player 1 should start');
await page.getByTestId('roll-button').click();
await page.waitForTimeout(700);
assert((await page.locator('.last-card').innerText()).includes('Player 1 rolled'), 'roll not recorded');
assert((await page.locator('.tile--last').count()) === 1, 'last square not highlighted');
const savedAfterRoll = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.ladder-run.save') || 'null'));
assert(savedAfterRoll?.version === 2 && savedAfterRoll.state.moves.length === 1, 'autosave missing after roll');

await page.getByTestId('undo-button').click();
await page.waitForTimeout(250);
assert((await page.locator('.last-card').innerText()).includes('No roll yet'), 'undo did not remove the roll');
assert((await page.locator('.tile--last').count()) === 0, 'undo left the last-square highlight');

await page.getByTestId('hint-button').click();
await page.waitForTimeout(250);
assert(await page.getByTestId('hint-card').isVisible(), 'hint card missing');
assert((await page.locator('.hint-chip').count()) === 6, 'hint should show six faces');
await page.locator('.hint-card .text-button').click();

await page.keyboard.press('r');
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'domcontentloaded' });
assert(await page.getByTestId('continue-game').isVisible(), 'continue card missing after reload');
await page.getByTestId('continue-game').click();
await page.waitForTimeout(300);
assert((await page.locator('.last-card').innerText()).includes('rolled'), 'resumed game lost its last roll');
await page.getByTestId('game-home').click();
await page.waitForTimeout(300);

await page.getByTestId('home-rules').click();
assert((await page.locator('.rules-list li').count()) === 6, 'rules should list six rules');
await page.locator('.rules-shell .back').click();

// ---------------------------------------------------------------- AI + 4 seats
const aiCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const aiPage = await aiCtx.newPage();
watch(aiPage, 'ai');
await aiCtx.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  Math.random = () => 0.2;
});
await aiPage.goto(BASE, { waitUntil: 'domcontentloaded' });
await aiPage.getByTestId('play-ai').waitFor();
await aiPage.getByTestId('play-ai').click();
await aiPage.getByRole('button', { name: '4', exact: true }).click();
assert((await aiPage.locator('.name-card').count()) === 4, 'four-player AI setup did not expand');
await aiPage.locator('.level-card').filter({ hasText: 'Companion' }).click();
await aiPage.getByTestId('setup-begin').click();
await aiPage.getByTestId('roll-button').click();
await aiPage.waitForTimeout(3600);
const aiRows = await aiPage.locator('.player-row__pos').allInnerTexts();
assert(aiRows.length === 4, 'AI table should have four players');
assert(aiRows[1] === '2', 'first AI did not roll automatically');
assert(aiRows[2] === '2', 'second AI did not roll automatically');
assert(aiRows[3] === '2', 'third AI did not roll automatically');
assert((await aiPage.locator('.note-card').innerText()).length > 0, 'companion note missing');
await aiPage.getByTestId('game-home').click();

// ---------------------------------------------------------------- win, record, rematch
const winCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const winPage = await winCtx.newPage();
watch(winPage, 'win');
await winCtx.addInitScript((save) => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.setItem('familyarcade.ladder-run.save', JSON.stringify(save));
  Math.random = () => 0;
}, nearSave);
await winPage.goto(BASE, { waitUntil: 'domcontentloaded' });
await winPage.getByTestId('continue-game').waitFor();
await winPage.getByTestId('continue-game').click();
await winPage.waitForTimeout(250);
await winPage.getByTestId('roll-button').click();
await winPage.waitForTimeout(850);
assert(await winPage.getByTestId('result-card').isVisible(), 'result card missing after exact finish');
assert((await winPage.getByTestId('result-card').innerText()).includes('Mia wins'), 'winner name missing');
const record = await winPage.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.ladder-run.record') || '{}'));
assert(record.games === 1 && record.wins?.[0] === 1, 'family record did not update');
assert(record.lastWinnerName === 'Mia', 'record winner name missing');
assert((await winPage.evaluate(() => localStorage.getItem('familyarcade.ladder-run.save'))) === null, 'finished save was not cleared');
await winPage.getByRole('button', { name: 'Play again' }).click();
await winPage.waitForTimeout(400);
assert((await winPage.getByTestId('result-card').count()) === 0, 'rematch did not close the result card');
assert((await winPage.locator('.tile--last').count()) === 0, 'rematch did not reset the board');
await winPage.getByTestId('game-home').click();
await winPage.getByTestId('home-record').click();
assert((await winPage.locator('.record-row').count()) === 4, 'record screen missing seat rows');

// ---------------------------------------------------------------- mobile
const mobileCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mobile = await mobileCtx.newPage();
watch(mobile, 'mobile');
await mobileCtx.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  Math.random = () => 0.5;
});
await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
await mobile.getByTestId('play-local').waitFor();
await mobile.getByTestId('play-local').click();
await mobile.getByTestId('setup-begin').click();
assert(await mobile.locator('.board-panel').isVisible(), 'mobile board missing');
assert(await mobile.locator('.mobile-roll').isVisible(), 'mobile roll dock missing');
await mobile.locator('.mobile-roll .primary').click();
await mobile.waitForTimeout(700);
assert((await mobile.locator('.player-row').first().innerText()).includes('4'), 'mobile roll did not move player 1');

// ---------------------------------------------------------------- zh smoke
const zhCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const zhPage = await zhCtx.newPage();
watch(zhPage, 'zh');
await zhCtx.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'zh');
});
await zhPage.goto(BASE, { waitUntil: 'domcontentloaded' });
await zhPage.locator('.subtitle').waitFor();
assert((await zhPage.locator('.subtitle').innerText()).includes('蛇梯棋'), 'Chinese home copy missing');
assert((await zhPage.locator('body').innerText()).includes('家庭战绩'), 'Chinese UI missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — 100-square board, hot-seat, roll, undo, hint, autosave/resume, 4-seat AI, companion, exact finish, record, rematch, rules, mobile, Chinese');
