import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5186';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pits = (south, north) => {
  const slots = Array(14).fill(0);
  south.forEach((value, index) => { slots[index] = value; });
  north.forEach((value, index) => { slots[index + 7] = value; });
  return slots;
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
  if (!sessionStorage.getItem('familyarcade.e2e-clean')) {
    localStorage.removeItem('familyarcade.sowing.save');
    localStorage.removeItem('familyarcade.sowing.record');
    sessionStorage.setItem('familyarcade.e2e-clean', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });
assert(await page.getByRole('heading', { name: 'Sowing' }).isVisible(), 'home title missing');
assert(await page.locator('.mancala').first().isVisible(), 'home board missing');

// A real local move, undo and hint.
await page.getByRole('button', { name: /Two players/ }).click();
await page.locator('.pit[data-pit="0"]').click();
await page.waitForTimeout(180);
assert((await page.locator('.pit[data-pit="1"] .pit-count').innerText()) === '5', 'sowing did not move a seed');
assert((await page.locator('.turn-bar strong').innerText()).includes('Player 2'), 'turn did not switch');
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.pit[data-pit="0"] .pit-count').innerText()) === '4', 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(500);
assert((await page.locator('.pit.hint').count()) === 1, 'hint highlight missing');
assert((await page.locator('.toast').innerText()).length > 0, 'hint toast missing');

// Leave the local game; the autosave is offered on home.
await page.locator('.pit[data-pit="0"]').click();
await page.waitForTimeout(180);
await page.getByRole('button', { name: /Home/ }).click();
await page.waitForTimeout(200);
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');

// AI answers a human move.
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('.pit[data-pit="0"]').click();
await page.waitForFunction(
  () => {
    const text = document.querySelector('.turn-bar p')?.textContent ?? '';
    const match = text.match(/Move (\d+)/);
    return match ? Number(match[1]) >= 2 : false;
  },
  { timeout: 12000 },
);
assert((await page.locator('.pit.last').count()) >= 1, 'AI move marker missing');

// Autosave survives a reload and still offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue did not survive reload');

// Seed a near-end local game and verify finish + family record.
await page.evaluate((payload) => {
  localStorage.setItem('familyarcade.sowing.save', JSON.stringify(payload.save));
  localStorage.setItem('familyarcade.sowing.record', JSON.stringify(payload.record));
}, {
  save: {
    version: 2,
    mode: 'local',
    level: 'normal',
    savedAt: Date.now(),
    state: {
      pits: pits([0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1]),
      stores: [30, 11],
      turn: 0,
      status: 'playing',
      winner: null,
      moves: [],
      last: null,
      first: 0,
    },
  },
  record: { games: 3, wins0: 2, wins1: 1, draws: 0, streak: 1, lastWinner: 0 },
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.locator('.pit[data-pit="5"]').click();
await page.waitForTimeout(300);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('Player 1 wins'), 'winner text missing');
assert((await page.locator('.result-banner').innerText()).includes('31 — 17'), 'final score missing');
const record = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.sowing.record') || '{}'));
assert(record.games === 4 && record.wins0 === 3, 'record not updated after finish');

// Record screen and rules screen.
await page.getByRole('button', { name: /Home/ }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Family record/ }).click();
assert(await page.locator('.record-grid').isVisible(), 'record screen missing');
await page.getByRole('button', { name: /Back/ }).click();
await page.getByRole('button', { name: /Rules/ }).click();
assert((await page.locator('.rules-list li').count()) === 6, 'rules list missing');
await page.getByRole('button', { name: /Close/ }).click();

// Mobile layout is usable and has no horizontal overflow.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('familyarcade.e2e-clean')) {
    localStorage.removeItem('familyarcade.sowing.save');
    localStorage.removeItem('familyarcade.sowing.record');
    sessionStorage.setItem('familyarcade.e2e-clean', '1');
  }
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.mancala').isVisible(), 'mobile board missing');
await mobile.locator('.pit[data-pit="0"]').click();
await mobile.waitForTimeout(180);
assert((await mobile.locator('.pit[data-pit="1"] .pit-count').innerText()) === '5', 'mobile sowing failed');
assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile horizontal overflow');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — local move, undo, hint, autosave, AI reply, finish, record, rules, mobile');
