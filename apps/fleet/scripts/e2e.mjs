import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5194';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  if (!sessionStorage.getItem('fleet-e2e-ready')) {
    localStorage.clear();
    sessionStorage.setItem('fleet-e2e-ready', '1');
  }
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const readSave = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.fleet.save');
    return raw ? JSON.parse(raw) : null;
  });

const waitForPlayerTurn = async (timeout = 8000) => {
  await page.waitForFunction(
    (limit) => {
      const raw = localStorage.getItem('familyarcade.fleet.save');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      return saved.state.phase === 'finished' || saved.state.turn === 0;
    },
    timeout,
    { timeout },
  );
};

// ---------- Home ----------
assert((await page.locator('h1').innerText()).includes('Fleet'), 'home title missing');
assert(await page.getByTestId('play-ai').isVisible(), 'solo button missing');
assert(await page.getByTestId('play-local').isVisible(), 'hot-seat button missing');
assert(await page.getByTestId('play-lan').isVisible(), 'LAN button missing');

// ---------- Solo setup, placement, battle ----------
await page.getByTestId('play-ai').click();
assert(await page.locator('.level-card').count() === 4, 'four AI levels expected');
await page.locator('[data-level="easy"]').click();
await page.getByTestId('begin').click();
assert(await page.getByTestId('auto-place').isVisible(), 'placement dock missing');
await page.getByTestId('auto-place').click();
assert((await page.locator('.own-board .cell.ship').count()) === 17, 'auto-place should occupy 17 cells');
await page.getByTestId('ready').click();
await page.waitForSelector('.enemy-board', { timeout: 5000 });
assert((await page.locator('.enemy-board .cell').count()) === 100, 'enemy chart should have 100 cells');
assert((await page.locator('.own-board .cell.ship').count()) === 17, 'own fleet should survive placement');

// ---------- Hint ----------
await page.getByTestId('hint').click();
await page.waitForTimeout(250);
assert((await page.locator('.cell.hint').count()) === 1, 'hint cell missing');
assert((await page.locator('.toast').innerText()).includes('Hint'), 'hint reason toast missing');

// ---------- Fire, AI reply, undo ----------
const save = await readSave();
assert(save && save.state.boards[1].ships.length === 5, 'AI fleet not saved');
const aiCells = save.state.boards[1].ships.flatMap((ship) => ship.cells);
assert(aiCells.length === 17, 'AI fleet should occupy 17 cells');
await page.locator(`.enemy-board .cell[data-cell="${aiCells[0]}"]`).click();
await page.waitForFunction(
  () => {
    const raw = localStorage.getItem('familyarcade.fleet.save');
    if (!raw) return false;
    return JSON.parse(raw).state.moves.length >= 2;
  },
  null,
  { timeout: 6000 },
);
assert((await page.locator('.enemy-board .cell.mark-hit, .enemy-board .cell.mark-sunk').count()) >= 1, 'shot result missing');
assert((await page.locator('.own-board .cell.mark-miss, .own-board .cell.mark-hit').count()) >= 1, 'AI reply missing');
await page.getByTestId('undo').click();
await page.waitForFunction(
  () => {
    const raw = localStorage.getItem('familyarcade.fleet.save');
    return raw ? JSON.parse(raw).state.moves.length === 0 : false;
  },
  null,
  { timeout: 4000 },
);

// ---------- Autosave and reload ----------
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('continue').isVisible(), 'Continue card missing after reload');
await page.getByTestId('continue').click();
await page.waitForSelector('.enemy-board', { timeout: 5000 });

// ---------- Finish the whole battle (Easy AI cannot win in 16 replies) ----------
const restored = await readSave();
const targets = restored.state.boards[1].ships.flatMap((ship) => ship.cells);
for (const cell of targets) {
  await waitForPlayerTurn();
  if (await page.locator('.result-banner').count()) break;
  await page.locator(`.enemy-board .cell[data-cell="${cell}"]`).click();
}
await page.waitForSelector('.result-banner', { timeout: 8000 });
await page.waitForTimeout(350);
const banner = await page.locator('.result-banner').innerText();
assert(banner.includes('You win'), `unexpected result: ${banner.replace(/\n/g, ' | ')}`);
assert((await page.locator('.enemy-board .cell.mark-sunk').count()) === 17, 'all 17 enemy hull cells should be sunk');
const record = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.fleet.record') || '{}'));
assert(record.games === 1 && record.aiWins === 1, 'family record not updated');
assert((await page.evaluate(() => localStorage.getItem('familyarcade.fleet.save'))) === null, 'save should clear after a finished game');

// Home after a finished game must not offer Continue.
await page.getByRole('button', { name: /^Home$/ }).click();
await page.waitForTimeout(250);
assert((await page.getByTestId('continue').count()) === 0, 'finished game should not offer Continue');

// ---------- Hot-seat with a real privacy pass ----------
await page.getByTestId('play-local').click();
await page.getByTestId('auto-place').click();
await page.getByTestId('ready').click();
await page.waitForSelector('.pass-overlay', { timeout: 3000 });
assert((await page.locator('.pass-card').innerText()).includes('Player 2'), 'setup pass should name Player 2');
await page.getByTestId('pass-ready').click();
await page.getByTestId('auto-place').click();
await page.getByTestId('ready').click();
await page.waitForSelector('.pass-overlay', { timeout: 3000 });
assert((await page.locator('.pass-card').innerText()).includes('Player 1'), 'start pass should name Player 1');
await page.getByTestId('pass-ready').click();
await page.locator('.enemy-board .cell[data-cell="55"]').click();
await page.waitForSelector('.pass-overlay', { timeout: 3000 });
assert((await page.locator('.pass-card').innerText()).includes('Last shot'), 'turn pass should show the last shot');
await page.getByTestId('pass-ready').click();
await page.locator('.enemy-board .cell[data-cell="56"]').click();
await page.waitForSelector('.pass-overlay', { timeout: 3000 });
await page.getByTestId('pass-ready').click();
await page.getByTestId('undo').click();
await page.waitForFunction(
  () => {
    const raw = localStorage.getItem('familyarcade.fleet.save');
    return raw ? JSON.parse(raw).state.moves.length === 1 : false;
  },
  null,
  { timeout: 4000 },
);
await page.waitForSelector('.pass-overlay', { timeout: 3000 });
assert((await page.locator('.pass-card').innerText()).includes('Player 2'), 'undo must hand the device back to the restored player');

// ---------- Mobile ----------
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobile = await mobileContext.newPage();
const mobileErrors = [];
mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
await mobile.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByTestId('play-ai').click();
await mobile.getByTestId('begin').click();
await mobile.getByTestId('auto-place').click();
await mobile.getByTestId('ready').click();
await mobile.waitForSelector('.enemy-board', { timeout: 5000 });
assert(await mobile.locator('.enemy-board').isVisible(), 'mobile enemy chart missing');
const widths = await mobile.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth,
}));
assert(widths.scroll <= widths.client + 1, `mobile horizontal overflow: ${widths.scroll}/${widths.client}`);
const mobileSave = await mobile.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.fleet.save')));
const mobileTarget = mobileSave.state.boards[1].ships[0].cells[0];
await mobile.locator(`.enemy-board .cell[data-cell="${mobileTarget}"]`).click();
await mobile.waitForTimeout(1400);
assert((await mobile.locator('.enemy-board .cell.mark-hit, .enemy-board .cell.mark-sunk').count()) >= 1, 'mobile shot failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
assert(mobileErrors.length === 0, `mobile errors: ${mobileErrors.join(' | ')}`);
await browser.close();
console.log('E2E OK — home, solo setup, placement, battle, hint, AI reply, undo, autosave/resume, full win, record, hot-seat pass, mobile');
