import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5203';
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
  if (!sessionStorage.getItem('chess.e2e.cleared')) {
    localStorage.removeItem('familyarcade.chess.save');
    localStorage.removeItem('familyarcade.chess.record');
    sessionStorage.setItem('chess.e2e.cleared', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

async function move(from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.waitForTimeout(60);
  await page.locator(`[data-square="${to}"]`).click();
  await page.waitForTimeout(140);
}

// English home must be pure English apart from the language switch.
const enHome = (await page.locator('body').innerText()).replaceAll('中文', '');
assert(!/[\u4e00-\u9fff]/.test(enHome), 'English UI contains Chinese');
assert(/Chess/.test(enHome), 'English title missing');

// Local game: Scholar's Mate.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
for (const [from, to] of [
  ['e2', 'e4'],
  ['e7', 'e5'],
  ['f1', 'c4'],
  ['b8', 'c6'],
  ['d1', 'h5'],
  ['g8', 'f6'],
  ['h5', 'f7'],
]) {
  await move(from, to);
}
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const banner = await page.locator('.result-banner').innerText();
assert(/White wins/.test(banner), `white win not shown: ${banner}`);
assert(/Checkmate/.test(banner), `checkmate reason missing: ${banner}`);
const enGame = (await page.locator('body').innerText()).replaceAll('中文', '');
assert(!/[\u4e00-\u9fff]/.test(enGame), 'English game UI contains Chinese');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.chess.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.whiteWins === 1, 'record not updated');
assert(savedRecord.byMode?.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'w', 'recent result not tracked');

// Restart, undo and a reasoned hint.
await page.getByRole('button', { name: /Play again/ }).click();
await move('e2', 'e4');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('[data-square="e2"] .piece').count()) === 1, 'undo did not restore e2');
assert((await page.locator('[data-square="e4"] .piece').count()) === 0, 'undo left e4 occupied');
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.square.hint-to').count()) === 1, 'hint destination missing');
const hintToast = await page.locator('.toast').innerText();
assert(/centre|develop|material|check|Try|checkmate/i.test(hintToast), `hint reason missing: ${hintToast}`);

// Keyboard path: arrow keys move focus across the board.
await page.locator('[data-square="e2"]').focus();
await page.keyboard.press('ArrowUp');
const focusedSquare = await page.evaluate(() =>
  document.activeElement?.getAttribute('data-square'),
);
assert(focusedSquare === 'e3', `arrow key focus moved to ${focusedSquare}`);

// Computer game: the AI answers and autosave survives a reload.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play the computer/ }).click();
assert(await page.getByRole('button', { name: /Normal/ }).isVisible(), 'level choice missing');
await page.getByRole('button', { name: /Start game/ }).click();
await move('e2', 'e4');
await page.waitForFunction(
  () => {
    try {
      const saved = JSON.parse(localStorage.getItem('familyarcade.chess.save') || '{}');
      return Array.isArray(saved.state?.moves) && saved.state.moves.length >= 2;
    } catch {
      return false;
    }
  },
  null,
  { timeout: 15000 },
);
const savedAfterAi = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.chess.save') || '{}'),
);
assert(savedAfterAi.state.turn === 'w', 'AI should hand the turn back to White');
assert(savedAfterAi.state.moves.length >= 2, 'AI did not reply');

await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');

// Family record screen shows the finished local game.
await page.getByRole('button', { name: /Family record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
assert((await page.getByRole('button', { name: /Clear record/ }).count()) === 1, 'clear record missing');
await page.getByRole('button', { name: /Home/ }).click();

// Chinese home must be pure Chinese apart from the language switch.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(150);
assert((await page.locator('h1').innerText()) === '国际象棋', 'Chinese title missing');
const zhHome = (await page.locator('body').innerText()).replaceAll('English', '');
assert(/[\u4e00-\u9fff]/.test(zhHome), 'Chinese UI did not switch');
assert(!/[A-Za-z]{2,}/.test(zhHome), `Chinese UI contains an English word: ${zhHome.match(/[A-Za-z]{2,}/)?.[0]}`);

// The Chinese game screen is also pure Chinese, including the move record.
await page.getByRole('button', { name: '两人同屏' }).click();
await move('e2', 'e4');
await move('e7', 'e5');
await move('g1', 'f3');
const zhGame = (await page.locator('body').innerText()).replaceAll('English', '');
assert(!/[A-Za-z]{2,}/.test(zhGame), `Chinese game contains an English word: ${zhGame.match(/[A-Za-z]{2,}/)?.[0]}`);
assert((await page.locator('.notation-row').count()) >= 3, 'Chinese move record missing');

// Other Chinese screens: setup, rules, record and the LAN hub.
await page.getByRole('button', { name: /主页/ }).click();
await page.getByRole('button', { name: '和电脑下棋' }).click();
const zhSetup = await page.locator('body').innerText();
assert(!/[A-Za-z]{2,}/.test(zhSetup), 'Chinese setup contains an English word');
await page.getByRole('button', { name: /返回/ }).first().click();
await page.getByRole('button', { name: /规则/ }).click();
const zhRules = await page.locator('body').innerText();
assert(!/[A-Za-z]{2,}/.test(zhRules), `Chinese rules contain an English word: ${zhRules.match(/[A-Za-z]{2,}/)?.[0]}`);
await page.getByRole('button', { name: '关闭' }).click();
await page.getByRole('button', { name: /家庭战绩/ }).click();
const zhStats = await page.locator('body').innerText();
assert(!/[A-Za-z]{2,}/.test(zhStats), `Chinese record contains an English word: ${zhStats.match(/[A-Za-z]{2,}/)?.[0]}`);
await page.getByRole('button', { name: /主页/ }).click();
await page.getByRole('button', { name: '局域网对战' }).click();
const zhLan = await page.locator('body').innerText();
assert(!/[A-Za-z]{2,}/.test(zhLan), 'Chinese LAN screen contains an English word');
await page.getByRole('button', { name: /返回/ }).first().click();
await page.getByRole('button', { name: 'English' }).click();

// Mobile layout: board fills the phone column and a move works.
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
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('chess.e2e.cleared')) {
    localStorage.removeItem('familyarcade.chess.save');
    localStorage.removeItem('familyarcade.chess.record');
    sessionStorage.setItem('chess.e2e.cleared', '1');
  }
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-board .board').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero board too narrow: ${heroBox?.width}`);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
const boardBox = await mobile.locator('.board').boundingBox();
assert(boardBox && boardBox.width > 300, `mobile game board too narrow: ${boardBox?.width}`);
const cellBox = await mobile.locator('[data-square="e2"]').boundingBox();
assert(cellBox && cellBox.height >= 36, `mobile square too small: ${cellBox?.height}`);
await mobile.locator('[data-square="e2"]').click();
await mobile.locator('[data-square="e4"]').click();
await mobile.waitForTimeout(150);
assert((await mobile.locator('[data-square="e4"] .piece').count()) === 1, 'mobile move failed');
const mobileOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
assert(mobileOverflow <= 1, `mobile game overflows by ${mobileOverflow}px`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — local mate, record, undo, hint reason, AI reply, autosave, stats, EN/ZH purity, mobile',
);
