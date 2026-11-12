import { chromium } from 'playwright';
import { GAME_SEQUENCE } from './sequence.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5213';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${error}`));
};

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page, 'desktop');
await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const hex = (q, r) => `.hex[data-key="${q},${r}"]`;
const hand = (player, kind) => `.hand-piece[data-kind="${kind}"][data-player="${player}"]`;

async function move(pageToUse, move, index, wait = 70) {
  const player = index % 2 === 0 ? 'W' : 'B';
  if (move.type === 'place') {
    await pageToUse.locator(hand(player, move.kind)).click();
    await pageToUse.waitForTimeout(20);
    await pageToUse.locator(hex(move.at.q, move.at.r)).click();
  } else {
    await pageToUse.locator(hex(move.from.q, move.from.r)).click();
    await pageToUse.waitForTimeout(20);
    await pageToUse.locator(hex(move.to.q, move.to.r)).click();
  }
  await pageToUse.waitForTimeout(wait);
}

// Hot-seat: undo after two moves, then a reasoned hint.
await page.getByRole('button', { name: 'Two players, one screen', exact: true }).click();
await move(page, GAME_SEQUENCE[0], 0);
await move(page, GAME_SEQUENCE[1], 1);
assert((await page.locator('.piece-layer').count()) === 2, 'two opening pieces expected');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.piece-layer').count()) === 1, 'undo did not remove the last piece');
assert((await page.locator('.hand-piece[data-kind="beetle"][data-player="B"]').isDisabled()) === false, 'undo did not restore the turn');
await move(page, GAME_SEQUENCE[1], 1);
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(450);
assert((await page.locator('.hex.hint, .hex.hint-from').count()) >= 1, 'hint highlight missing');
const hintToast = await page.locator('.toast').innerText();
assert(
  /surround|queen|ant|beetle|grasshopper|spider|hive|space/i.test(hintToast),
  `hint reason missing: ${hintToast}`,
);

// A full deterministic hot-seat game. Amber surrounds the Onyx queen.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: 'Two players, one screen', exact: true }).click();
for (let index = 0; index < GAME_SEQUENCE.length; index += 1) {
  await move(page, GAME_SEQUENCE[index], index, 45);
}
await page.waitForTimeout(300);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
const banner = await page.locator('.result-banner').innerText();
assert(banner.includes('Amber wins'), `Amber win not shown: ${banner}`);
assert(/Onyx queen is surrounded/i.test(banner), 'surround result missing');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.hive.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsW === 1, 'record not updated');
assert(savedRecord.byMode?.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'W', 'recent result not tracked');
assert(savedRecord.recent?.[0]?.moves === GAME_SEQUENCE.length, 'move count not tracked');

// AI game starts and answers. A number key must not steal the AI's turn.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play the computer/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator(hand('W', 'ant')).click();
await page.locator(hex(0, 0)).click();
await page.keyboard.press('2');
await page.waitForTimeout(120);
assert((await page.locator('.hand-piece.selected').count()) === 0, 'keyboard stole the AI turn');
await page.waitForTimeout(1500);
assert((await page.locator('.piece-layer').count()) >= 2, 'AI did not reply');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');

// Record screen shows the finished local game, not the unfinished AI game.
await page.getByRole('button', { name: /View record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
assert((await page.getByRole('button', { name: /Clear record/ }).count()) === 1, 'clear record missing');

// Mobile layout: board and hexes stay usable.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
watch(mobile, 'mobile');
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.removeItem('familyarcade.hive.save');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: 'Two players, one screen', exact: true }).click();
assert(await mobile.locator('.hive-board').isVisible(), 'mobile board missing');
const boardBox = await mobile.locator('.hive-board').boundingBox();
assert(boardBox && boardBox.width > 300, `mobile board too narrow: ${boardBox?.width}`);
await mobile.locator(hand('W', 'ant')).click();
await mobile.locator(hex(0, 0)).click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.piece-layer').count()) === 1, 'mobile placement failed');
const hexBox = await mobile.locator(hex(0, 0)).boundingBox();
assert(hexBox && hexBox.height >= 60, `mobile hex too small: ${hexBox?.height}`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — win, record, stats, undo, hint reason, AI guard, autosave, keyboard, mobile');
