import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5187';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function nearWin(side) {
  const points = Array(24).fill(0);
  if (side === 'W') {
    points[0] = 1;
    points[16] = -1;
    points[17] = -2;
    points[18] = -2;
    points[19] = -2;
    points[20] = -2;
    points[21] = -2;
    points[22] = -2;
    points[23] = -2;
  } else {
    points[23] = -1;
    points[0] = 2;
    points[1] = 2;
    points[2] = 2;
    points[3] = 2;
    points[4] = 2;
    points[5] = 2;
    points[6] = 2;
    points[7] = 1;
  }
  return {
    version: 1,
    mode: 'local',
    level: 'normal',
    savedAt: Date.now(),
    state: {
      points,
      bar: { W: 0, B: 0 },
      off: side === 'W' ? { W: 14, B: 0 } : { W: 0, B: 14 },
      turn: side,
      status: 'awaiting-roll',
      dice: [],
      roll: null,
      winner: null,
      first: 'W',
      turnNo: 41,
      lastMove: null,
      turnMoves: [],
      log: [],
    },
  };
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
  localStorage.removeItem('familyarcade.tables.save');
  localStorage.removeItem('familyarcade.tables.record');
});
await page.reload({ waitUntil: 'networkidle' });

// Local two-player game: roll, hint, make a hinted move, undo it.
await page.getByRole('button', { name: /Two players/ }).click();
assert((await page.locator('.point').count()) === 24, 'expected 24 backgammon points');
assert(await page.getByRole('button', { name: /^Roll dice$/ }).isVisible(), 'roll button missing');
await page.getByRole('button', { name: /^Roll dice$/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.die').count()) >= 2, 'dice not shown');
await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.point.hinted').count()) >= 1, 'hint highlight missing');
const target = page.locator('.point.target').first();
assert(await target.isVisible(), 'hint target missing');
await target.click();
await page.waitForTimeout(350);
assert((await page.locator('.move-log li').count()) >= 1, 'move log did not update');
await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(250);
const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.tables.save') || 'null'));
assert(undone && undone.state.log.length === 0, 'undo did not restore the previous position');

// Finish a near-complete game from an autosave fixture and verify the record.
await page.getByRole('button', { name: /← Home/ }).click();
await page.evaluate((fixture) => {
  localStorage.setItem('familyarcade.tables.save', JSON.stringify(fixture));
}, nearWin('W'));
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.getByRole('button', { name: /^Roll dice$/ }).click();
await page.waitForTimeout(250);
await page.locator('[data-point="0"]').click();
await page.getByTestId('off-white').click();
await page.waitForTimeout(450);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('Ivory wins'), 'white win not shown');
const savedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.tables.record') || '{}'));
assert(savedRecord.games === 1 && savedRecord.winsW === 1, 'record not updated');

// AI: a full human turn, then the AI answers, then autosave/resume.
await page.getByRole('button', { name: /← Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
assert(await page.getByRole('button', { name: /^Begin$/ }).isVisible(), 'AI setup missing');
await page.getByRole('button', { name: /^Begin$/ }).click();
await page.getByRole('button', { name: /^Roll dice$/ }).click();
await page.waitForTimeout(250);
for (let step = 0; step < 4; step += 1) {
  const hintButton = page.getByRole('button', { name: /^Hint$/ });
  if (!(await hintButton.isEnabled())) break;
  await hintButton.click();
  await page.waitForTimeout(180);
  const moveTarget = page.locator('.point.target').first();
  if ((await moveTarget.count()) === 0) break;
  await moveTarget.click();
  await page.waitForTimeout(320);
}
await page.waitForFunction(
  () => {
    const saved = JSON.parse(localStorage.getItem('familyarcade.tables.save') || 'null');
    return Boolean(saved && saved.state.turn === 'W' && saved.state.log.length >= 2);
  },
  undefined,
  { timeout: 10000 },
);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'AI autosave missing');

// Mobile layout is usable.
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
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.getByRole('button', { name: /^Roll dice$/ }).click();
await mobile.waitForTimeout(250);
await mobile.getByRole('button', { name: /^Hint$/ }).click();
await mobile.waitForTimeout(200);
assert((await mobile.locator('.point.target').count()) >= 1, 'mobile hint target missing');
await mobile.locator('.point.target').first().click();

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — board, roll, hint, move, undo, finish, record, AI, autosave, mobile');
