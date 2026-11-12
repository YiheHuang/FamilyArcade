import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5206';
const SAVE_KEY = 'familyarcade.intl-draughts.save';
const RECORD_KEY = 'familyarcade.intl-draughts.record';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const emptyBoard = () => Array(100).fill(null);
const position = (board, turn = 'W') => ({
  board,
  turn,
  status: 'playing',
  winner: null,
  winReason: null,
  drawReason: null,
  plies: 0,
  quietPlies: 0,
  lastMove: null,
  first: 'W',
  repetitions: {},
});
const saved = (state) => ({
  version: 1,
  state,
  mode: 'local',
  level: 'normal',
  savedAt: Date.now(),
});

async function loadSave(page, state) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: SAVE_KEY, value: saved(state) },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue last game/ }).click();
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
await page.evaluate(({ save, record }) => {
  localStorage.removeItem(save);
  localStorage.removeItem(record);
}, { save: SAVE_KEY, record: RECORD_KEY });
await page.reload({ waitUntil: 'networkidle' });

// Home and the real 10×10 board.
assert((await page.locator('h1').innerText()).includes('International Draughts'), 'home title missing');
assert((await page.locator('.board .square').count()) === 100, 'home board is not 10×10');
assert((await page.locator('.board .square.dark').count()) === 50, 'home board has the wrong dark-square count');
assert((await page.locator('.board .piece').count()) === 32, 'hero position should show 32 pieces');
const english = (await page.locator('body').innerText()).replace('中文', '');
assert(!/[\u4e00-\u9fff]/.test(english), 'English UI contains Chinese text');

// Hot-seat: a quiet move, its target dots, undo, hint and keyboard focus path.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
assert((await page.locator('.board .piece').count()) === 40, 'game should start with 40 pieces');
assert((await page.locator('.turn-copy').innerText()).includes('White to move'), 'White should move first');
await page.locator('[data-square="61"]').click();
assert((await page.locator('.square.target').count()) === 2, 'opening move should show two landings');
assert((await page.locator('.square.selected').count()) === 1, 'selected piece is not marked');
await page.locator('[data-square="50"]').click();
await page.waitForTimeout(150);
assert((await page.locator('[data-square="50"] .piece').count()) === 1, 'piece did not move to 50');
assert((await page.locator('[data-square="61"] .piece').count()) === 0, 'from square should be empty');
assert((await page.locator('.turn-copy').innerText()).includes('Black to move'), 'turn should pass to Black');
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('[data-square="61"] .piece').count()) === 1, 'undo did not restore the piece');
assert((await page.locator('.turn-copy').innerText()).includes('White to move'), 'undo did not restore White');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.square.hint-from').count()) === 1, 'hint start is not highlighted');
assert((await page.locator('.square.hint-path').count()) >= 1, 'hint landing is not highlighted');
assert((await page.locator('.toast').innerText()).length > 8, 'hint reason missing');
await page.locator('[data-square="63"]').click();
assert((await page.locator('.square.selected').count()) === 1, 'keyboard-path selection failed');
await page.keyboard.press('Escape');
assert((await page.locator('.square.selected').count()) === 0, 'Escape did not clear the selection');

// Autosave survives a reload and resumes the position.
await page.locator('[data-square="61"]').click();
await page.locator('[data-square="50"]').click();
await page.waitForTimeout(150);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
assert((await page.locator('[data-square="50"] .piece').count()) === 1, 'resume lost the position');

// Solo against the computer: the AI answers with a legal move and autosaves.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the computer/ }).click();
assert(await page.getByRole('button', { name: /Normal/ }).isVisible(), 'level cards missing');
await page.getByRole('button', { name: /Normal/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('[data-square="61"]').click();
await page.locator('[data-square="50"]').click();
await page.waitForFunction(
  (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      return JSON.parse(raw).state.plies >= 2;
    } catch {
      return false;
    }
  },
  SAVE_KEY,
  { timeout: 15000 },
);
assert((await page.locator('.turn-copy strong').innerText()).includes('Your turn'), 'AI did not hand the turn back');
assert((await page.locator('.board .piece').count()) === 40, 'AI move changed the piece count without a capture');
assert((await page.locator('.square.last-to').count()) === 1, 'AI last move is not marked');

// Mandatory capture in the real UI: only the maximum capture is offered.
await page.getByRole('button', { name: /Home/ }).click();
const captureBoard = emptyBoard();
captureBoard[41] = 'w';
captureBoard[32] = 'b';
captureBoard[81] = 'b';
await loadSave(page, position(captureBoard));
await page.locator('[data-square="41"]').click();
assert((await page.locator('.square.target').count()) === 1, 'a forced capture should offer one landing');
assert((await page.locator('[data-square="23"].target').count()) === 1, 'forced capture landing missing');
await page.locator('[data-square="30"]').click();
await page.waitForTimeout(120);
assert((await page.locator('[data-square="41"] .piece').count()) === 1, 'a quiet move escaped the capture rule');
await page.locator('[data-square="23"]').click();
await page.waitForTimeout(150);
assert((await page.locator('[data-square="23"] .piece').count()) === 1, 'forced capture did not land');
assert((await page.locator('.board .piece').count()) === 2, 'captured piece was not removed');

// A flying-king capture finishes the game and writes the family record.
await page.getByRole('button', { name: /Home/ }).click();
await page.evaluate((record) => localStorage.removeItem(record), RECORD_KEY);
const winBoard = emptyBoard();
winBoard[90] = 'W';
winBoard[54] = 'b';
await loadSave(page, position(winBoard));
await page.locator('[data-square="90"]').click();
assert((await page.locator('.square.target').count()) === 5, 'flying king should offer five landings');
await page.locator('[data-square="45"]').click();
await page.waitForTimeout(200);
const banner = await page.locator('.result-banner').innerText();
assert(banner.includes('White wins'), `win banner wrong: ${banner}`);
assert(banner.includes('Every Black piece has been captured'), 'capture reason missing');
const savedRecord = await page.evaluate(
  (key) => JSON.parse(localStorage.getItem(key) || '{}'),
  RECORD_KEY,
);
assert(savedRecord.games === 1 && savedRecord.winsWhite === 1, 'record not updated');
assert(savedRecord.byMode?.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'W', 'recent result not tracked');

// The record screen shows the result and clears honestly.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /View record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
assert((await page.locator('.recent-row').innerText()).includes('1 move'), 'move count grammar missing');
await page.getByRole('button', { name: /Clear record/ }).click();
await page.getByRole('button', { name: /Confirm clear/ }).click();
assert(await page.locator('.empty-card').isVisible(), 'record did not clear');
await page.getByRole('button', { name: /Home/ }).click();

// Chinese UI: no Latin words except the language switch.
await page.getByRole('button', { name: /中文/ }).click();
const zhHome = (await page.locator('body').innerText()).replace('English', '');
assert((await page.locator('h1').innerText()) === '国际跳棋', 'Chinese title missing');
assert(!/[A-Za-z]/.test(zhHome), `Chinese home contains English: ${zhHome.match(/[A-Za-z]+/g)}`);
await page.getByRole('button', { name: /两人同屏/ }).click();
const zhGame = (await page.locator('body').innerText()).replace('English', '');
assert(!/[A-Za-z]/.test(zhGame), `Chinese game contains English: ${zhGame.match(/[A-Za-z]+/g)}`);
await page.getByRole('button', { name: /主页/ }).click();
await page.getByRole('button', { name: /规则/ }).click();
const zhRules = (await page.locator('body').innerText()).replace('English', '');
assert(!/[A-Za-z]/.test(zhRules), 'Chinese rules contain English');

// Mobile layout: the 10×10 board is still readable and does not overflow.
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
await mobile.addInitScript((keys) => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.removeItem(keys.save);
}, { save: SAVE_KEY });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-board .board').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero board too narrow: ${heroBox?.width}`);
const homeOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(homeOverflow <= 1, `mobile home overflows by ${homeOverflow}px`);
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
const boardBox = await mobile.locator('.board').boundingBox();
assert(boardBox && boardBox.width > 320, `mobile game board too narrow: ${boardBox?.width}`);
const squareBox = await mobile.locator('.square.dark').first().boundingBox();
assert(squareBox && squareBox.height >= 30, `mobile square too small: ${squareBox?.height}`);
await mobile.locator('[data-square="61"]').click();
assert((await mobile.locator('.square.target').count()) === 2, 'mobile selection targets missing');
await mobile.locator('[data-square="50"]').click();
assert((await mobile.locator('[data-square="50"] .piece').count()) === 1, 'mobile move failed');
const gameOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(gameOverflow <= 1, `mobile game overflows by ${gameOverflow}px`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — real 10×10 board, quiet move, undo, reasoned hint, keyboard clear, autosave, AI reply, mandatory capture, flying-king win, record, bilingual UI, mobile',
);
