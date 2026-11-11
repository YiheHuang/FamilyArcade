import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5185';
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
  if (!sessionStorage.getItem('boxes.e2e.started')) {
    localStorage.removeItem('familyarcade.boxes.save');
    localStorage.removeItem('familyarcade.boxes.record');
    sessionStorage.setItem('boxes.e2e.started', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });
assert((await page.locator('h1').innerText()).includes('Boxes'), 'home title missing');
assert((await page.locator('.edge').count()) === 60, 'hero board should show 60 lines');

// ---------- Hot-seat: draw, undo, hint, then finish all 60 lines ----------
await page.getByRole('button', { name: /Two players/ }).click();
await page.waitForTimeout(250);
assert(await page.locator('.board').isVisible(), 'hot-seat board missing');
assert((await page.locator('.edge[data-edge]').count()) === 60, 'game board should have 60 lines');

await page.locator('.edge[data-edge="0"]').click();
await page.waitForTimeout(120);
assert((await page.locator('.edge.drawn').count()) === 1, 'drawing a line failed');
assert((await page.locator('.edge[data-edge="0"]').getAttribute('class')).includes('drawn'), 'line not marked drawn');

await page.keyboard.press('u');
await page.waitForTimeout(120);
assert((await page.locator('.edge.drawn').count()) === 0, 'undo failed');
assert((await page.locator('.edge[data-edge="0"]').getAttribute('class')).includes('drawn') === false, 'undone line still drawn');

await page.keyboard.press('h');
await page.waitForTimeout(200);
assert(await page.locator('.hint-card').isVisible(), 'hint card missing');
assert((await page.locator('.edge.hint').count()) === 1, 'hinted line missing');
const hintText = await page.locator('.hint-card').innerText();
assert(hintText.length > 20, 'hint has no reason');

const order = Array.from({ length: 60 }, (_, edge) => edge);
for (const edge of order) {
  await page.locator(`.edge[data-edge="${edge}"]`).click();
}
await page.waitForTimeout(350);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing after 60 lines');
const resultText = await page.locator('.result-banner').innerText();
assert(/wins|draw/i.test(resultText), 'result banner has no winner');
let record = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.boxes.record') || '{}'));
assert(record.games === 1, `record games expected 1, got ${record.games}`);
assert(Array.isArray(record.recent) && record.recent.length === 1, 'recent result missing');
assert(record.boxesP1 + record.boxesP2 === 25, 'record box total should be 25');

// Undo the finished game and check that its result is removed again.
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.result-banner').count()) === 0, 'result banner should disappear after undo');
record = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.boxes.record') || '{}'));
assert(record.games === 0, 'undoing a finished game should revoke its record row');

// ---------- Solo AI, autosave and resume ----------
await page.getByRole('button', { name: /Home/ }).first().click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
assert(await page.locator('.level-card').count() === 4, 'four AI levels missing');
await page.getByRole('button', { name: /^Begin$/ }).click();
await page.locator('.edge[data-edge="0"]').click();
await page.waitForTimeout(1100);
assert((await page.locator('.edge.drawn').count()) >= 2, 'AI did not reply');

await page.waitForTimeout(250);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing after reload');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(300);
assert(await page.locator('.board').isVisible(), 'resumed board missing');

// ---------- Language toggle ----------
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(200);
assert((await page.locator('.game-id strong').innerText()).includes('点格棋'), 'Chinese game title missing');
await page.locator('.game-top .back').click();
await page.waitForTimeout(200);
assert((await page.locator('h1').innerText()).includes('点格棋'), 'Chinese home title missing');

// ---------- Mobile layout ----------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobileErrors = [];
mobile.on('console', (message) => {
  if (message.type() === 'error') mobileErrors.push(message.text());
});
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.removeItem('familyarcade.boxes.save');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.edge[data-edge="0"]').click();
await mobile.waitForTimeout(150);
assert((await mobile.locator('.edge.drawn').count()) === 1, 'mobile drawing failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `mobile console errors: ${mobileErrors.join(' | ')}`);
await browser.close();
console.log('E2E OK — hot-seat, 60 lines, record, undo, hint, AI, autosave, resume, i18n, mobile');
