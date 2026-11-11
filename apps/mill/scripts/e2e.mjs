import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5184';
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
  if (!sessionStorage.getItem('familyarcade.e2e.boot')) {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.mill.save');
    localStorage.removeItem('familyarcade.mill.record');
    sessionStorage.setItem('familyarcade.e2e.boot', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// Home, real board and all three local routes.
assert(await page.getByRole('heading', { name: 'Mill' }).isVisible(), 'home title missing');
assert((await page.locator('.mill-board .point').count()) === 24, 'home board needs 24 points');
await page.getByRole('button', { name: /Two players, one screen/ }).click();
await page.waitForTimeout(200);
assert(await page.locator('.game-shell').isVisible(), 'hot-seat did not start');

// Keyboard path: focus point 0, Enter places, U undoes.
await page.locator('.point[data-point="0"]').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await page.locator('.point[data-point="0"]').getAttribute('class'))?.includes('p-w'), 'keyboard placement failed');
await page.keyboard.press('u');
await page.waitForTimeout(150);
assert(!(await page.locator('.point[data-point="0"]').getAttribute('class'))?.includes('p-w'), 'keyboard undo failed');

// Play a real mill: W 0-1-2, B 8-9, then capture.
for (const point of [0, 8, 1, 9, 2]) {
  await page.locator(`.point[data-point="${point}"]`).click();
  await page.waitForTimeout(120);
}
assert((await page.locator('.turn-bar').innerText()).includes('Mill!'), 'mill not announced');
assert((await page.locator('.capture-target').count()) === 2, 'capture targets missing');
const captionAll = await page.locator('.capture-all').count();
assert(captionAll === 0, 'all-in-mills note should only appear when every rival is in a mill');

await page.locator('.point[data-point="8"]').click();
await page.waitForTimeout(200);
assert(!(await page.locator('.point[data-point="8"]').getAttribute('class'))?.includes('p-b'), 'capture failed');
assert((await page.locator('.turn-bar').innerText()).includes('Black to place'), 'turn did not pass');

// Undo the capture, then capture again and ask for a hint.
await page.getByRole('button', { name: 'Undo', exact: true }).click();
await page.waitForTimeout(200);
assert((await page.locator('.point[data-point="8"]').getAttribute('class'))?.includes('p-b'), 'undo did not restore captured man');
assert((await page.locator('.turn-bar').innerText()).includes('Mill!'), 'undo did not restore capture state');
await page.locator('.point[data-point="8"]').click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'Hint', exact: true }).click();
await page.waitForTimeout(900);
assert(await page.locator('.hint-panel.has-hint').isVisible(), 'hint panel not marked');
assert((await page.locator('.point.hint-point').count()) === 1, 'hint highlight missing');

// Autosave survives reload and restores the board.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.point[data-point="2"]').getAttribute('class'))?.includes('p-w'), 'resume lost the board');
assert(!(await page.locator('.point[data-point="8"]').getAttribute('class'))?.includes('p-b'), 'resume lost the capture');

// Finish a real game from a valid saved position, one capture from victory.
await page.evaluate(() => {
  const board = Array(24).fill(null);
  board[16] = 'W';
  board[18] = 'W';
  board[19] = 'W';
  board[20] = 'W';
  board[0] = 'B';
  board[1] = 'B';
  board[4] = 'B';
  const state = {
    board,
    turn: 'W',
    phase: 'moving',
    status: 'playing',
    winner: null,
    winReason: null,
    pendingCapture: 'B',
    hand: { W: 0, B: 0 },
    onBoard: { W: 4, B: 3 },
    quiet: 0,
    moveCount: 20,
    last: { by: 'W', from: null, to: 19, capture: false, mill: [18, 19, 20] },
    first: 'W',
  };
  localStorage.setItem(
    'familyarcade.mill.save',
    JSON.stringify({ version: 2, state, mode: 'local', level: 'normal', human: 'W', savedAt: Date.now() }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(250);
await page.locator('.point[data-point="0"]').click();
await page.waitForTimeout(300);
assert(await page.locator('.result-card').isVisible(), 'result card missing');
assert((await page.locator('.result-card').innerText()).includes('White wins'), 'White win not shown');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.mill.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsW === 1, 'family record not updated');

// Stats screen shows the finished game.
await page.getByRole('button', { name: 'Home', exact: true }).first().click();
await page.getByRole('button', { name: /Family record/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.stats-total strong').innerText()) === '1', 'stats total wrong');
assert((await page.locator('.recent-list li').count()) === 1, 'recent result missing');
await page.getByRole('button', { name: /Back/ }).click();

// AI game: human places, Companion answers.
await page.getByRole('button', { name: /Solo against the AI/ }).click();
await page.getByRole('button', { name: /Companion/ }).click();
await page.getByRole('button', { name: /Begin game/ }).click();
await page.waitForTimeout(250);
await page.locator('.point[data-point="4"]').click();
await page.waitForTimeout(1200);
const marks = await page.locator('.point .stone').count();
assert(marks >= 2, 'AI did not reply');
assert(/companion/i.test(await page.locator('.game-shell').innerText()), 'AI level missing from header');

// Mobile layout is usable and does not overflow horizontally.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.addInitScript(() => {
  if (!sessionStorage.getItem('familyarcade.e2e.boot')) {
    localStorage.setItem('familyarcade.lang', 'en');
    localStorage.removeItem('familyarcade.mill.save');
    localStorage.removeItem('familyarcade.mill.record');
    sessionStorage.setItem('familyarcade.e2e.boot', '1');
  }
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
assert(await mobile.locator('.mill-board').isVisible(), 'mobile board missing');
await mobile.locator('.point[data-point="0"]').tap();
await mobile.waitForTimeout(150);
assert(
  (await mobile.locator('.point[data-point="0"]').getAttribute('class'))?.includes('p-w'),
  'mobile tap failed',
);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert(!overflow, 'mobile page overflows horizontally');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — home, keyboard, mill, capture, undo, hint, autosave, win, record, stats, AI, mobile');
