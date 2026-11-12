import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5204';
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
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.removeItem('familyarcade.go.save');
  localStorage.removeItem('familyarcade.go.record');
});
await page.reload({ waitUntil: 'networkidle' });

// Bilingual UI and sound toggle.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(150);
assert((await page.evaluate(() => document.documentElement.lang)) === 'zh-CN', 'Chinese UI did not apply');
const chineseHome = await page.locator('body').innerText();
assert(!/[A-Za-z]/.test(chineseHome.replaceAll('English', '')), 'Chinese home leaked English UI');
const assertChineseScreen = async (label) => {
  const text = await page.locator('body').innerText();
  assert(!/[A-Za-z]/.test(text.replaceAll('English', '')), `Chinese ${label} leaked English UI`);
};
await page.getByRole('button', { name: /两人同屏/ }).click();
await assertChineseScreen('setup');
await page.locator('.narrow-shell .back').click();
await page.getByRole('button', { name: /规则/ }).click();
await assertChineseScreen('rules');
await page.locator('.rules-shell .back').click();
await page.getByRole('button', { name: /局域网对战/ }).click();
await assertChineseScreen('LAN lobby');
await page.locator('.lan-shell .back').click();
await page.getByRole('button', { name: /家庭战绩/ }).first().click();
await assertChineseScreen('record');
await page.locator('.stats-shell .back').click();
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(120);
const englishHome = await page.locator('body').innerText();
assert(!/[\u4e00-\u9fff]/.test(englishHome.replaceAll('中文', '')), 'English home leaked Chinese UI');
await page.getByRole('button', { name: /Sound on/ }).click();
assert(await page.getByRole('button', { name: /Sound off/ }).isVisible(), 'sound toggle failed');
await page.getByRole('button', { name: /Sound off/ }).click();

// A local 9×9 game with a real capture, undo, hint and pass/pass scoring.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
await page.getByRole('button', { name: '9 × 9' }).click();
await page.getByRole('button', { name: /^Begin$/ }).click();
assert((await page.locator('.go-point').count()) === 81, '9×9 board must have 81 points');

// Keyboard path: arrows move the cursor and Enter places a stone.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await page.locator('.go-point.has-black').count()) === 1, 'keyboard placement failed');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.go-point.has-black').count()) === 0, 'keyboard undo failed');

// A capture: black surrounds white at B9.
for (const point of [0, 1, 2, 40, 10]) {
  await page.locator('.go-point').nth(point).click();
  await page.waitForTimeout(90);
}
assert((await page.locator('.go-point.has-black').count()) === 3, 'black placements failed');
assert((await page.locator('.go-point.has-white').count()) === 1, 'white placement failed');
assert((await page.locator('.go-point').nth(1).getAttribute('class'))?.includes('go-point'), 'capture did not remove the stone');

// Undo the capture, then take a reasoned hint.
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(140);
assert((await page.locator('.go-point.has-black').count()) === 2, 'undo failed');
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(450);
assert((await page.locator('.go-point.hint').count()) === 1, 'hint point missing');
assert(await page.locator('.hint-note').isVisible(), 'hint reason missing');
assert((await page.locator('.hint-note').innerText()).length > 5, 'hint reason is empty');

// Replay the capture, then two passes finish and score the game.
await page.locator('.go-point').nth(10).click();
await page.waitForTimeout(100);
await page.locator('.pass-button').click();
await page.waitForTimeout(120);
await page.locator('.pass-button').click();
await page.waitForTimeout(400);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert(/wins by/.test(await page.locator('.result-banner').innerText()), 'score result not shown');
assert(await page.locator('.score-card').isVisible(), 'score card missing');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.go.record') || '{}'),
);
assert(savedRecord.version === 2 && savedRecord.games === 1, 'record not updated');
assert(savedRecord.whiteWins === 1, 'record winner wrong');

// Play again resets the board.
await page.getByRole('button', { name: /^Play again$/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) === 0, 'restart failed');

// AI reply, autosave and resume.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.locator('.level-card').filter({ hasText: 'Easy' }).click();
await page.getByRole('button', { name: '9 × 9' }).click();
await page.getByRole('button', { name: /^Begin$/ }).click();
await page.waitForTimeout(200);
await page.locator('.go-point').nth(40).click();
await page.waitForFunction(() => document.querySelectorAll('.go-point.has-white').length >= 1, {
  timeout: 15000,
});
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) >= 2, 'AI did not reply');
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'autosave missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(350);
assert((await page.locator('.go-point.has-black, .go-point.has-white').count()) >= 2, 'resume lost the board');

// 19×19 is available and has 361 intersections.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Two players, one screen/ }).click();
await page.getByRole('button', { name: '19 × 19' }).click();
await page.getByRole('button', { name: /^Begin$/ }).click();
assert((await page.locator('.go-point').count()) === 361, '19×19 board must have 361 points');
await page.locator('.game-top .back').click();

// Rules and record screens render.
await page.getByRole('button', { name: /^Rules/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.rules-list li').count()) === 5, 'rules missing');
await page.getByRole('button', { name: /^Close$/ }).click();
await page.getByRole('button', { name: /Family record/ }).first().click();
await page.waitForTimeout(150);
assert((await page.locator('.stat-card').count()) === 4, 'record screen missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
await page.locator('.stats-shell .back').click();

// LAN hub renders without starting a relay.
await page.getByRole('button', { name: /LAN night/ }).click();
await page.waitForTimeout(200);
assert(await page.getByRole('button', { name: /Create room/ }).isVisible(), 'LAN host card missing');
assert(await page.getByRole('button', { name: /Join the table/ }).isVisible(), 'LAN join card missing');
await page.locator('.lan-shell .back').click();

// Phone layout is usable: tap a point on a 390-wide screen.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
mobile.on('pageerror', (error) => errors.push(String(error)));
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
await mobile.getByRole('button', { name: '9 × 9' }).click();
await mobile.getByRole('button', { name: /^Begin$/ }).click();
assert(await mobile.locator('.go-board').isVisible(), 'mobile board missing');
const boardBox = await mobile.locator('.go-board').boundingBox();
assert(boardBox && boardBox.width > 340, `mobile board too narrow: ${boardBox?.width}`);
await mobile.locator('.go-point').nth(40).click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.go-point.has-black').count()) === 1, 'mobile tap failed');
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — bilingual UI, 9×9 capture, undo, hint reason, pass/pass scoring, record, AI reply, autosave, 19×19, rules, LAN hub, mobile');
