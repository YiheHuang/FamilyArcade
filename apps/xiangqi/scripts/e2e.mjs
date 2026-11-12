import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5202';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// A short, legal cooperative mate: Black mates Red in 14 plies.
const MATE = [
  [70, 7],
  [8, 7],
  [64, 1],
  [0, 1],
  [58, 49],
  [3, 13],
  [56, 47],
  [19, 73],
  [85, 76],
  [25, 23],
  [88, 69],
  [7, 79],
  [76, 67],
  [1, 64],
];

function point(page, index) {
  return page.locator(`.xq-point[data-index="${index}"]`);
}

async function play(page, from, to) {
  await point(page, from).click();
  await point(page, to).click();
  await page.waitForTimeout(120);
}

async function playMate(page) {
  for (const [from, to] of MATE) await play(page, from, to);
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
await page.evaluate(() => {
  localStorage.removeItem('familyarcade.xiangqi.record');
  localStorage.removeItem('familyarcade.xiangqi.save');
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.reload({ waitUntil: 'networkidle' });

// English copy is English-only apart from the language switch.
const homeText = (await page.locator('body').innerText()).replaceAll('中文', '');
assert(!/[\u3400-\u9fff]/.test(homeText), `English home has Chinese copy: ${homeText}`);

// A complete hot-seat game ends in checkmate and updates the family record.
await page.getByRole('button', { name: /Two players/ }).click();
await playMate(page);
await page.waitForTimeout(300);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const banner = await page.locator('.result-banner').innerText();
assert(/Black wins/i.test(banner), `Black win not shown: ${banner}`);
assert(/Checkmate/i.test(banner), `Checkmate reason missing: ${banner}`);
const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.xiangqi.record') || '{}'),
);
assert(record.games === 1 && record.winsBlack === 1, 'record not updated');
assert(record.byMode?.local === 1, 'local mode not recorded');
assert(record.recent?.[0]?.winner === 'B', 'recent result not recorded');

// Undo restores the piece; a hint explains itself with two highlighted points.
await page.getByRole('button', { name: /Play again/ }).click();
await play(page, 64, 67);
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await point(page, 64).locator('.xq-glyph').innerText()) === 'C', 'undo did not restore the cannon');
assert((await point(page, 67).locator('.xq-glyph').count()) === 0, 'undo left the destination occupied');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(900);
assert((await page.locator('.hint-from').count()) === 1, 'hint origin missing');
assert((await page.locator('.hint-to').count()) === 1, 'hint destination missing');
const hintToast = await page.locator('.toast').innerText();
assert(/Checkmate|Take|check|Improve|Save|legal/i.test(hintToast), `hint reason missing: ${hintToast}`);

// Keyboard path moves the board cursor and can complete a move.
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(100);
assert((await page.locator('.is-cursor').count()) === 1, 'keyboard cursor missing');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await point(page, 49).locator('.xq-disc-r').count()) === 1, 'keyboard move failed');

// AI reply and autosave.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play the computer/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await play(page, 54, 45);
await page.waitForTimeout(1300);
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.xiangqi.save') || 'null'),
);
assert(saved?.state?.moves?.length >= 2, `AI did not reply or save: ${JSON.stringify(saved?.state?.moves)}`);
assert(saved.state.turn === 'R', 'AI reply did not hand the turn back');

await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(200);
assert((await point(page, 45).locator('.xq-disc-r').count()) === 1, 'resumed board missing the red soldier');

// Record screen shows the finished local game and can be cleared.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /View record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
await page.getByRole('button', { name: /Clear record/ }).click();
await page.getByRole('button', { name: /Confirm clear/ }).click();
await page.waitForTimeout(150);
const cleared = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.xiangqi.record') || '{}'),
);
assert(cleared.games === 0, 'record was not cleared');
await page.getByRole('button', { name: /Home/ }).click();

// Chinese copy is Chinese-only apart from the language switch.
const zh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
zh.on('console', (message) => {
  if (message.type() === 'error') errors.push(`zh: ${message.text()}`);
});
zh.on('pageerror', (error) => errors.push(`zh: ${String(error)}`));
await zh.addInitScript(() => localStorage.setItem('familyarcade.lang', 'zh'));
await zh.goto(BASE, { waitUntil: 'networkidle' });
const assertZhClean = async (where) => {
  const text = (await zh.locator('body').innerText()).replaceAll('English', '');
  assert(!/[A-Za-z]/.test(text), `Chinese ${where} has English copy: ${text}`);
};
await assertZhClean('home');
await zh.getByRole('button', { name: /和电脑下一局/ }).click();
await zh.waitForTimeout(150);
await assertZhClean('setup');
await zh.goto(BASE, { waitUntil: 'networkidle' });
await zh.getByRole('button', { name: /^两人同屏/ }).click();
await zh.waitForTimeout(150);
await assertZhClean('game');
await zh.getByRole('button', { name: /主页/ }).click();
await zh.getByRole('button', { name: /规则/ }).click();
await zh.waitForTimeout(150);
await assertZhClean('rules');
await zh.getByRole('button', { name: /^关闭/ }).click();
await zh.getByRole('button', { name: /查看战绩/ }).click();
await zh.waitForTimeout(150);
await assertZhClean('record');
await zh.getByRole('button', { name: /主页/ }).click();
await zh.getByRole('button', { name: /^局域网对战/ }).click();
await zh.waitForTimeout(150);
await assertZhClean('LAN lobby');

// Mobile layout: full-width board, large touch points, no horizontal overflow.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(`mobile: ${message.text()}`);
});
mobile.on('pageerror', (error) => errors.push(`mobile: ${String(error)}`));
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-board .xq-board').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero board too narrow: ${heroBox?.width}`);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Two players/ }).click();
await mobile.waitForTimeout(150);
const boardBox = await mobile.locator('.xq-board').boundingBox();
assert(boardBox && boardBox.width > 330, `mobile board too narrow: ${boardBox?.width}`);
const pointBox = await mobile.locator('.xq-point[data-index="64"]').boundingBox();
assert(pointBox && pointBox.width >= 34, `mobile touch point too small: ${pointBox?.width}`);
await play(mobile, 64, 67);
assert((await mobile.locator('.xq-point[data-index="67"] .xq-disc-r').count()) === 1, 'mobile move failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — checkmate, record, undo, hint reason, keyboard, AI autosave, language purity, mobile');
