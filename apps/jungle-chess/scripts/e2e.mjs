import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5207';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const DEN_WIN = [
  [46, 45], // Red leopard leaves the back rank
  [0, 7], // Blue lion steps out
  [45, 38], // Red leopard up the centre column
  [6, 13], // Blue tiger steps out
  [38, 31], // Red leopard
  [8, 1], // Blue dog
  [31, 24], // Red leopard
  [12, 5], // Blue cat
  [24, 17], // Red leopard
  [18, 19], // Blue wolf
  [17, 10], // Red leopard enters the trap
  [20, 27], // Blue elephant
  [10, 3], // Red leopard enters the den
];

async function clickMoves(page, moves) {
  for (const [from, to] of moves) {
    await page.locator('.cell').nth(from).click();
    await page.waitForTimeout(80);
    await page.locator('.cell').nth(to).click();
    await page.waitForTimeout(110);
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
  if (!sessionStorage.getItem('e2e-cleared')) {
    localStorage.removeItem('familyarcade.jungle-chess.record');
    localStorage.removeItem('familyarcade.jungle-chess.save');
    sessionStorage.setItem('e2e-cleared', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

assert((await page.locator('h1').innerText()).includes('Jungle Chess'), 'home title missing');

// A full hot-seat game decided by reaching the den.
await page.getByRole('button', { name: /Two players/ }).click();
await clickMoves(page, DEN_WIN);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const banner = await page.locator('.result-banner').innerText();
assert(/Red wins/.test(banner), `Red win not shown: ${banner}`);
assert(/reached the den/.test(banner), `den reason not shown: ${banner}`);
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.jungle-chess.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsX === 1, 'record not updated');
assert(savedRecord.byMode.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'X', 'recent result not tracked');

// Restart, then check selection, undo and a reasoned hint.
await page.getByRole('button', { name: /Play again/ }).click();
await page.locator('.cell').nth(46).click();
await page.waitForTimeout(100);
assert((await page.locator('.cell.destination').count()) >= 2, 'legal destinations not shown');
await page.locator('.cell').nth(45).click();
await page.waitForTimeout(120);
assert((await page.locator('.cell').nth(45).locator('.piece').count()) === 1, 'move not played');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(120);
assert((await page.locator('.cell').nth(46).locator('.piece').count()) === 1, 'undo failed');
assert((await page.locator('.cell').nth(45).locator('.piece').count()) === 0, 'undo left piece behind');

// Keyboard path: focus, select, arrow to a destination, commit.
await page.locator('.cell').nth(46).focus();
await page.keyboard.press('Enter');
await page.keyboard.press('ArrowLeft');
assert(
  (await page.evaluate(() => document.activeElement?.getAttribute('data-index'))) === '45',
  'arrow key did not move focus',
);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
assert((await page.locator('.cell').nth(45).locator('.piece').count()) === 1, 'keyboard move failed');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(120);

await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.cell.hint-from').count()) === 1, 'hint source missing');
assert((await page.locator('.cell.hint-to').count()) === 1, 'hint target missing');
const hintToast = await page.locator('.toast').innerText();
assert(hintToast.length > 4, 'hint reason missing');

// Computer game replies, then autosave offers a resume after reload.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the computer/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('.cell').nth(46).click();
await page.locator('.cell').nth(45).click();
await page.waitForTimeout(1400);
const turnText = await page.locator('.turn-copy strong').innerText();
assert(/Your move/i.test(turnText), `computer did not reply: ${turnText}`);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Family record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
await page.getByRole('button', { name: /Home/ }).click();

// Language switch and a clean language screen.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(150);
assert((await page.locator('h1').innerText()).includes('斗兽棋'), 'Chinese title missing');
let chineseText = await page.locator('body').innerText();
chineseText = chineseText.replace('English', '');
assert(!/[A-Za-z]/.test(chineseText), `Chinese home contains English: ${chineseText}`);
assert((await page.getByRole('button', { name: 'English' }).count()) === 1, 'English switch missing');
await page.getByRole('button', { name: /两人同屏/ }).click();
await page.waitForTimeout(150);
let chineseGameText = await page.locator('body').innerText();
chineseGameText = chineseGameText.replace('English', '');
assert(!/[A-Za-z]/.test(chineseGameText), `Chinese game contains English: ${chineseGameText}`);
await page.getByRole('button', { name: /主页/ }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(150);
let englishText = await page.locator('body').innerText();
englishText = englishText.replace('中文', '');
assert(!/[\u4e00-\u9fff]/.test(englishText), `English home contains Chinese: ${englishText}`);

// Mobile layout is usable, with a 7×9 board that keeps its cell size.
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
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-board .board').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero board too narrow: ${heroBox?.width}`);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
const boardBox = await mobile.locator('.board').boundingBox();
assert(boardBox && boardBox.width > 300, `mobile game board too narrow: ${boardBox?.width}`);
const cellBox = await mobile.locator('.cell').nth(0).boundingBox();
assert(cellBox && cellBox.height >= 38, `mobile cell too small: ${cellBox?.height}`);
await mobile.locator('.cell').nth(46).click();
assert((await mobile.locator('.cell.destination').count()) >= 2, 'mobile selection failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — den win, record, selection, keyboard move, undo, hint reason, computer reply, autosave, stats, bilingual screens, mobile 7×9 board',
);
