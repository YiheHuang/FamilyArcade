import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5210';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const track = (page, tag) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${tag}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${tag}: ${String(error)}`));
};

async function open(lang = 'en', viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  track(page, lang);
  await page.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

async function goPath(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(320);
}

// 1. Local hot-seat: privacy, draw, discard, undo, hint.
const local = await open();
await local.getByRole('button', { name: /Pass and play/ }).click();
await local.getByRole('button', { name: /Deal the cards/ }).click();
await local.waitForTimeout(250);
assert(await local.locator('.privacy-panel').isVisible(), 'local privacy panel missing');
assert((await local.locator('.privacy-panel').innerText()).includes('Player 1'), 'privacy should name Player 1');
await local.getByRole('button', { name: /Show my hand/ }).click();
assert((await local.locator('.hand-scroll .playing-card').count()) === 13, 'local hand should start at 13');
await local.locator('.stock-pile').click();
await local.waitForTimeout(180);
assert((await local.locator('.hand-scroll .playing-card').count()) === 14, 'draw should add one card');
assert((await local.locator('.drawn-note').innerText()).length > 0, 'drawn note missing');
await local.locator('.hand-scroll .playing-card').first().click();
await local.getByRole('button', { name: 'Discard', exact: true }).click();
await local.waitForTimeout(220);
assert(await local.locator('.privacy-panel').isVisible(), 'privacy panel should return for Player 2');
assert((await local.locator('.privacy-panel').innerText()).includes('Player 2'), 'privacy should name Player 2');
await local.getByRole('button', { name: /Show my hand/ }).click();
await local.getByRole('button', { name: 'Undo', exact: true }).click();
await local.waitForTimeout(220);
assert((await local.locator('.privacy-panel').innerText()).includes('Player 1'), 'undo should restore Player 1');
await local.getByRole('button', { name: /Show my hand/ }).click();
assert((await local.locator('.hand-scroll .playing-card').count()) === 14, 'undo should restore the drawn hand');
await local.getByRole('button', { name: 'Hint', exact: true }).click();
await local.waitForTimeout(220);
assert((await local.locator('.toast').count()) === 1, 'hint toast missing');
assert((await local.locator('.toast').innerText()).length > 0, 'hint reason missing');

// 2. Demo mid-game: meld, lay off, hint, undo.
const demo = await open();
await goPath(demo, '/?demo=mid');
const meldsBefore = await demo.locator('.meld-group').count();
const handBefore = await demo.locator('.hand-scroll .playing-card').count();
assert(handBefore === 8, `demo hand should have eight cards, got ${handBefore}`);
for (const name of ['6 of hearts', '6 of diamonds', '6 of spades']) {
  await demo.getByRole('button', { name, exact: true }).click();
}
await demo.getByRole('button', { name: 'Meld selected', exact: true }).click();
await demo.waitForTimeout(220);
assert((await demo.locator('.meld-group').count()) === meldsBefore + 1, 'meld action did not add a meld');
assert((await demo.locator('.hand-scroll .playing-card').count()) === handBefore - 3, 'meld did not remove three cards');
await demo.getByRole('button', { name: 'J of hearts', exact: true }).click();
assert((await demo.locator('.meld-group.can-layoff').count()) >= 1, 'lay-off target not highlighted');
await demo.locator('.meld-group.can-layoff').first().click();
await demo.waitForTimeout(220);
assert((await demo.locator('.hand-scroll .playing-card').count()) === handBefore - 4, 'lay-off did not remove a card');
await demo.getByRole('button', { name: 'Hint', exact: true }).click();
await demo.waitForTimeout(220);
assert((await demo.locator('.toast').innerText()).length > 0, 'demo hint reason missing');
await demo.getByRole('button', { name: 'Undo', exact: true }).click();
await demo.waitForTimeout(160);
await demo.getByRole('button', { name: 'Undo', exact: true }).click();
await demo.waitForTimeout(160);
assert((await demo.locator('.hand-scroll .playing-card').count()) === handBefore, 'demo undo should restore the hand');

// 3. Game over, record and replay.
const over = await open();
await goPath(over, '/?demo=over');
assert(await over.locator('.round-sheet').isVisible(), 'game-over sheet missing');
assert((await over.locator('.round-sheet').innerText()).includes('Winner'), 'game-over winner missing');
const savedRecord = await over.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.rummy-500.record') || '{}'),
);
assert(savedRecord.games >= 1, 'finished game was not recorded');
await over.getByRole('button', { name: 'Play again', exact: true }).click();
await over.waitForTimeout(300);
assert((await over.locator('.round-sheet').count()) === 0, 'play again should clear the result sheet');
assert((await over.locator('.hand-scroll .playing-card').count()) === 7, 'replay should deal a three-player hand');
await over.getByRole('button', { name: /Home/ }).click();
await over.getByRole('button', { name: /Family record/ }).click();
await over.waitForTimeout(220);
assert(await over.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await over.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await over.locator('.recent-row').count()) >= 1, 'recent game missing');

// 4. AI replies, and autosave survives a reload.
const ai = await open();
await ai.getByRole('button', { name: /Play against the AI/ }).click();
await ai.getByRole('button', { name: /Easy/ }).click();
await ai.getByRole('button', { name: /Deal the cards/ }).click();
await ai.locator('.stock-pile').click();
await ai.waitForTimeout(180);
await ai.locator('.hand-scroll .playing-card').first().click();
await ai.getByRole('button', { name: 'Discard', exact: true }).click();
await ai.waitForTimeout(250);
assert((await ai.locator('.turn-panel strong').innerText()).includes('AI 1'), 'AI turn did not start');
await ai.waitForFunction(
  () => document.querySelector('.turn-panel strong')?.textContent?.includes('Your turn'),
  null,
  { timeout: 9000 },
);
assert((await ai.locator('.opponent .opp-count').innerText()).length > 0, 'AI hand count missing');
await ai.reload({ waitUntil: 'networkidle' });
await ai.waitForTimeout(250);
assert(await ai.getByRole('button', { name: /Continue last game/ }).isVisible(), 'autosave did not offer Continue');
await ai.getByRole('button', { name: /Continue last game/ }).click();
await ai.waitForTimeout(250);
assert(await ai.locator('.table-stage').isVisible(), 'resume did not open the table');

// 5. Mobile layout.
const mobile = await open('en', {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const homeOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
assert(homeOverflow <= 1, `mobile home overflows by ${homeOverflow}px`);
await mobile.getByRole('button', { name: /Pass and play/ }).click();
await mobile.getByRole('button', { name: /Deal the cards/ }).click();
await mobile.getByRole('button', { name: /Show my hand/ }).click();
await mobile.locator('.stock-pile').click();
await mobile.waitForTimeout(220);
assert((await mobile.locator('.hand-scroll .playing-card').count()) === 14, 'mobile draw failed');
const playOverflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
assert(playOverflow <= 1, `mobile game overflows by ${playOverflow}px`);

// 6. Chinese UI.
const zh = await open('zh');
assert((await zh.locator('h1').innerText()).includes('五百分拉米'), 'Chinese title missing');
await zh.getByRole('button', { name: /同屏传牌/ }).click();
assert((await zh.locator('.screen-title').innerText()).includes('同屏牌桌'), 'Chinese setup title missing');
await zh.getByRole('button', { name: /发牌/ }).click();
assert((await zh.locator('.privacy-panel').innerText()).includes('把设备传给'), 'Chinese privacy copy missing');
await zh.getByRole('button', { name: /看我的牌/ }).click();
assert((await zh.locator('.hand-scroll .playing-card').count()) === 13, 'Chinese hand missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — local privacy/draw/discard/undo/hint, meld/lay-off, game over/record/replay, AI, autosave, mobile, Chinese UI',
);
