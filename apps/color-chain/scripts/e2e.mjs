import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5192';
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

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);

// Home and setup
assert(await page.getByRole('heading', { name: 'Color Chain' }).isVisible(), 'home title missing');
await page.getByRole('button', { name: /Play against the AI/ }).click();
assert(await page.getByRole('button', { name: /Deal the cards/ }).isVisible(), 'setup begin missing');
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(400);
assert((await page.locator('.hand .pcard').count()) === 7, 'solo hand should start with 7 cards');
assert(await page.locator('.table-centre').isVisible(), 'table missing');
assert(await page.locator('.opponent').count() === 3, 'solo default should have 3 AI opponents');

// Hint always explains a reason
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(450);
assert(await page.locator('.toast').isVisible(), 'hint reason missing');
const hintCards = await page.locator('.pcard.is-hint').count();
assert(hintCards <= 1, 'hint should highlight at most one card');

// Draw, then pass; solo AI should reply.
if (await page.locator('.draw-stack').isEnabled()) {
  await page.locator('.draw-stack').click();
  await page.waitForTimeout(250);
  assert(await page.locator('.drawn-met').isVisible(), 'drawn note missing');
  const passButton = page.getByRole('button', { name: /^Pass$/ });
  assert(await passButton.isEnabled(), 'pass should be available after drawing');
  await passButton.click();
  await page.waitForTimeout(1700);
  assert((await page.locator('.table-talk li').count()) > 0, 'table talk empty after moves');
}

// Undo back to the human turn.
const undoButton = page.getByRole('button', { name: /^Undo$/ });
if (await undoButton.isEnabled()) {
  await undoButton.click();
  await page.waitForTimeout(300);
  assert((await page.locator('.hand .pcard').count()) >= 7, 'undo lost the hand');
}

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const continueButton = page.getByRole('button', { name: /Continue last match/ });
assert(await continueButton.isVisible(), 'continue card missing after reload');
await continueButton.click();
await page.waitForTimeout(350);
assert(await page.locator('.table-centre').isVisible(), 'resume did not reach the table');

// Hot-seat game with a real move or draw.
await page.getByRole('button', { name: /^← Home$/ }).click();
await page.getByRole('button', { name: /Pass & play/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(350);
assert(await page.locator('.opponent').count() === 3, 'hot-seat should show 3 opponents');
const playable = page.locator('.hand .pcard.is-playable');
if ((await playable.count()) > 0) {
  await playable.first().click();
  await page.waitForTimeout(250);
  if (await page.locator('.color-modal').isVisible()) {
    await page.getByRole('button', { name: /^Red$/ }).click();
    await page.waitForTimeout(250);
  }
} else {
  await page.locator('.draw-stack').click();
  await page.waitForTimeout(250);
  const pass = page.getByRole('button', { name: /^Pass$/ });
  if (await pass.isEnabled()) await pass.click();
  await page.waitForTimeout(250);
}
assert((await page.locator('.table-talk li').count()) > 0, 'hot-seat table talk missing');
if (await page.getByRole('button', { name: /^Undo$/ }).isEnabled()) {
  await page.getByRole('button', { name: /^Undo$/ }).click();
  await page.waitForTimeout(250);
}

// Curated engine states: match end, wild picker, hint highlight.
await page.goto(`${BASE}/?demo=final`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
assert(await page.locator('.end-card').isVisible(), 'match end panel missing');
assert((await page.locator('.end-card').innerText()).includes('win the match'), 'match winner text missing');
assert((await page.locator('.score-table li').count()) === 4, 'final table should list 4 players');

await page.goto(`${BASE}/?demo=wild`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
await page.locator('.hand .pcard[data-wild="true"]').first().click();
await page.waitForTimeout(250);
assert(await page.locator('.color-modal').isVisible(), 'wild colour picker missing');
await page.getByRole('button', { name: /^Blue$/ }).click();
await page.waitForTimeout(300);
assert((await page.locator('.color-modal').count()) === 0, 'wild colour picker did not close');
assert((await page.locator('.table-talk').innerText()).includes('Wild'), 'wild play not logged');

await page.goto(`${BASE}/?demo=table`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(500);
assert((await page.locator('.pcard.is-hint').count()) === 1, 'curated hint did not highlight a card');

// Phone layout.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mobileErrors = [];
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.reload({ waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Pass & play/ }).click();
await mobile.getByRole('button', { name: /Deal the cards/ }).click();
await mobile.waitForTimeout(350);
assert(await mobile.locator('.hand').isVisible(), 'mobile hand missing');
assert((await mobile.locator('.hand .pcard').count()) === 7, 'mobile hand count wrong');
assert(await mobile.locator('.table-centre').isVisible(), 'mobile table missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `mobile errors: ${mobileErrors.join(' | ')}`);
await browser.close();
console.log('E2E OK — solo, draw/pass, hint, undo, autosave, hot-seat, final, wild, demo hint, mobile');
