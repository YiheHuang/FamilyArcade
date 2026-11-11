import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5188';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function stateOf(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.race-home.save');
    return raw ? JSON.parse(raw) : null;
  });
}

async function rollOrMove(page, limit = 40) {
  for (let i = 0; i < limit; i++) {
    const roll = page.locator('.roll-button');
    if (await roll.isEnabled()) {
      await roll.click();
      await page.waitForTimeout(30);
      continue;
    }
    const legal = page.locator('.pawn.legal');
    if (await legal.count()) {
      await legal.first().click();
      await page.waitForTimeout(40);
      return true;
    }
    await page.waitForTimeout(60);
  }
  return false;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});
await context.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

// Home and bilingual UI.
await page.goto(BASE, { waitUntil: 'networkidle' });
assert((await page.locator('h1').innerText()) === 'Race Home', 'home title missing');
assert(await page.getByRole('button', { name: /Play with AI/ }).isVisible(), 'AI button missing');
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(120);
assert((await page.locator('h1').innerText()) === '飞行棋', 'Chinese title missing');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(120);

// Hot-seat: roll, hint, move, undo, autosave and continue.
await page.goto(`${BASE}/?seed=e2e-hotseat`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Hot-seat/ }).click();
await page.getByRole('button', { name: /Start the race/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.pawn').count()) === 8, 'two-player board should have eight pawns');

let hinted = false;
for (let i = 0; i < 40 && !hinted; i++) {
  const roll = page.locator('.roll-button');
  if (await roll.isEnabled()) {
    await roll.click();
    await page.waitForTimeout(40);
    continue;
  }
  if (await page.locator('.pawn.legal').count()) {
    await page.getByRole('button', { name: /^Hint$/ }).click();
    await page.waitForTimeout(80);
    assert((await page.locator('.pawn.hint').count()) === 1, 'hint pawn missing');
    hinted = true;
  } else {
    await page.waitForTimeout(80);
  }
}
assert(hinted, 'never reached a state with a legal pawn for the hint');
await page.locator('.pawn.hint').click();
await page.waitForTimeout(150);
const afterMove = await stateOf(page);
assert(afterMove && afterMove.state.moves >= 1, 'move was not autosaved');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(150);
const afterUndo = await stateOf(page);
assert(afterUndo && afterUndo.state.moves === afterMove.state.moves - 1, 'undo did not restore the previous state');
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last race/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last race/ }).click();
await page.waitForTimeout(250);
assert(await page.locator('.board').isVisible(), 'board missing after continue');

// AI answers and the game keeps moving.
await page.goto(`${BASE}/?seed=e2e-ai`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Play with AI/ }).click();
await page.getByRole('button', { name: /Start the race/ }).click();
await page.waitForTimeout(250);
for (let i = 0; i < 22; i++) {
  const roll = page.locator('.roll-button');
  if (await roll.isEnabled()) {
    await roll.click();
    await page.waitForTimeout(60);
  }
  const legal = page.locator('.pawn.legal');
  if (await legal.count()) {
    await legal.first().click();
    await page.waitForTimeout(1000);
  } else {
    await page.waitForTimeout(650);
  }
}
const aiState = await stateOf(page);
assert(aiState, 'AI game should autosave');
assert(aiState.state.rolls >= 3, `AI game did not progress (${aiState?.state?.rolls} rolls)`);

// Full hot-seat game: finish, show the result and update the family record.
const recordBefore = await page.evaluate(() => {
  const raw = localStorage.getItem('familyarcade.race-home.record');
  return raw ? JSON.parse(raw).games : 0;
});
await page.goto(`${BASE}/?seed=racehome&full=1`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Hot-seat/ }).click();
await page.getByRole('button', { name: /Start the race/ }).click();
await page.waitForTimeout(150);
let steps = 0;
let finished = false;
for (; steps < 2600; steps++) {
  if (await page.locator('.result-banner').count()) {
    finished = true;
    break;
  }
  const roll = page.locator('.roll-button');
  if (await roll.isEnabled()) {
    await roll.click();
    await page.waitForTimeout(8);
    continue;
  }
  const legal = page.locator('.pawn.legal');
  if (await legal.count()) {
    await legal.first().click();
    await page.waitForTimeout(10);
    continue;
  }
  await page.waitForTimeout(20);
}
assert(finished, `full game did not finish in ${steps} steps`);
const banner = await page.locator('.result-banner').innerText();
assert(/wins the race/i.test(banner), `result banner wrong: ${banner}`);
const record = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.race-home.record') || '{}'));
const totalWins = Object.values(record.wins || {}).reduce((a, b) => a + b, 0);
assert(record.games === recordBefore + 1, 'record game count not incremented');
assert(totalWins === record.games, 'record colour wins do not add up');
assert(record.bestRolls > 0, 'record best roll count missing');

// Stats screen and rules screen render.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Family record/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.stat-card').count()) === 4, 'record stats missing');
assert(await page.locator('.record-card').isVisible(), 'record bars missing');
await page.getByRole('button', { name: /Back/ }).click();
await page.getByRole('button', { name: /Rules/ }).click();
await page.waitForTimeout(120);
assert((await page.locator('.rules-list li').count()) === 6, 'rules list missing');
await page.getByRole('button', { name: /Close/ }).click();

// Mobile layout: no horizontal overflow, board is usable.
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
});
await mobileContext.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
const mobile = await mobileContext.newPage();
const mobileErrors = [];
mobile.on('console', (message) => {
  if (message.type() === 'error') mobileErrors.push(message.text());
});
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
await mobile.goto(`${BASE}/?seed=e2e-mobile`, { waitUntil: 'networkidle' });
const overflow = await mobile.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
assert(!overflow, 'mobile page overflows horizontally');
await mobile.getByRole('button', { name: /Hot-seat/ }).click();
await mobile.getByRole('button', { name: /Start the race/ }).click();
await mobile.waitForTimeout(200);
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.roll-button').click();
await mobile.waitForTimeout(120);
assert((await mobile.locator('.die').getAttribute('data-value')) !== null, 'mobile die missing');
assert(await rollOrMove(mobile, 20), 'mobile could not make a move');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `mobile console errors: ${mobileErrors.join(' | ')}`);
await browser.close();
console.log('E2E OK — home, zh/en, hot-seat, hint, undo, autosave, AI, full game, record, rules, mobile');
