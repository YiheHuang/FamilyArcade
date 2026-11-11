import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5191';
const SAVE_KEY = 'familyarcade.domino-line.save';
const RECORD_KEY = 'familyarcade.domino-line.record';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const tileKey = (tile) => `${tile.a}-${tile.b}`;

function legalFrom(state) {
  if (!state || state.phase !== 'playing') return [];
  const hand = state.hands[state.turn];
  if (state.board.length === 0) return hand.map((tile) => ({ tile, end: 'right' }));
  const { left, right } = state;
  const plays = [];
  const seen = new Set();
  const add = (tile, end) => {
    const key = `${end}:${tileKey(tile)}`;
    if (seen.has(key)) return;
    seen.add(key);
    plays.push({ tile, end });
  };
  for (const tile of hand) {
    if (tile.a === right || tile.b === right) add(tile, 'right');
    if (tile.a === left || tile.b === left) add(tile, 'left');
  }
  if (left === right) {
    const seenTile = new Set();
    return plays.filter((play) => {
      if (seenTile.has(tileKey(play.tile))) return false;
      seenTile.add(tileKey(play.tile));
      return true;
    });
  }
  return plays;
}

const nearEndSave = {
  version: 2,
  mode: 'local',
  level: 'normal',
  players: 2,
  savedAt: 1,
  state: {
    players: 2,
    target: 100,
    hands: [[{ a: 6, b: 6 }], [{ a: 1, b: 1 }, { a: 2, b: 3 }, { a: 4, b: 5 }]],
    boneyard: [],
    board: [
      { tile: { a: 2, b: 2 }, left: 2, right: 2 },
      { tile: { a: 2, b: 5 }, left: 2, right: 5 },
      { tile: { a: 5, b: 6 }, left: 5, right: 6 },
    ],
    left: 2,
    right: 6,
    turn: 0,
    phase: 'playing',
    round: 8,
    scores: [98, 90],
    passes: 0,
    roundWinner: null,
    roundPoints: 0,
    matchWinner: null,
    starter: 0,
    lastPlay: { seat: 1, end: 'right', tile: { a: 5, b: 6 }, outer: 6 },
  },
};

async function fresh(page, lang = 'en') {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.reload({ waitUntil: 'networkidle' });
}

async function saveOf(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
}

async function act(page) {
  const saved = await saveOf(page);
  if (!saved) throw new Error('no saved game');
  const state = saved.state;
  if (state.phase !== 'playing') return state;
  const plays = legalFrom(state);
  const before = JSON.stringify(state);
  if (plays.length > 0) {
    const play = plays[0];
    await page.locator(`.hand-tile[data-tile="${tileKey(play.tile)}"]`).click();
    await page.locator(play.end === 'left' ? '.play-left' : '.play-right').click();
  } else if (state.boneyard.length > 0) {
    await page.locator('.draw-btn').click();
  } else {
    await page.locator('.pass-btn').click();
  }
  await page.waitForFunction(
    ({ key, before: previous }) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      return JSON.stringify(JSON.parse(raw).state) !== previous;
    },
    { key: SAVE_KEY, before },
    { timeout: 5000 },
  );
  return (await saveOf(page)).state;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await fresh(page);
assert(await page.locator('h1').innerText() === 'Domino Line', 'home title missing');

// Hot-seat: hint, a real move, undo, then a complete round.
await page.locator('[data-action="local"]').click();
await page.locator('[data-action="begin"]').click();
await page.waitForSelector('[data-mode="local"]');
assert((await page.locator('.hand-tile').count()) === 7, 'two players should draw seven tiles');

await page.locator('.hint-btn').click();
await page.waitForTimeout(200);
assert(await page.locator('.toast').isVisible(), 'hint toast missing');
assert((await page.locator('.hand-tile.selected').count()) === 1, 'hint did not select a tile');
assert((await page.locator('.board-end.ready').count()) >= 1, 'hint did not mark an open end');

const afterMove = await act(page);
assert(afterMove.board.length === 1, 'first tile did not reach the line');
assert((await page.locator('.hand-tile').count()) === 7, 'hot-seat did not switch to player 2 hand');

await page.locator('.undo-btn').click();
await page.waitForTimeout(200);
const undone = await saveOf(page);
assert(undone.state.board.length === 0, 'undo did not restore the board');
assert(undone.state.turn === 0, 'undo did not restore the turn');

let round = await saveOf(page);
for (let step = 0; step < 90 && round.state.phase === 'playing'; step += 1) {
  round = { state: await act(page) };
}
assert(round.state.phase !== 'playing', 'hot-seat round never finished');
assert(await page.locator('.result-panel').isVisible(), 'round result panel missing');
assert((await page.locator('.result-panel .primary').innerText()).toLowerCase().includes('next round'), 'next round button missing');
const roundWinner = round.state.roundWinner;
assert(roundWinner !== null, 'round winner not stored');
assert(
  roundWinner === -1 || round.state.scores[roundWinner] > 0,
  'round points were not awarded',
);

const roundNumber = round.state.round;
await page.locator('.result-panel .primary').click();
await page.waitForTimeout(250);
const next = await saveOf(page);
assert(next.state.round === roundNumber + 1, 'next round did not advance');
assert(next.state.board.length === 0, 'next round did not clear the table');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.locator('[data-action="continue"]').isVisible(), 'continue card missing after reload');
await page.locator('[data-action="continue"]').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.game-shell').getAttribute('data-phase')) === 'playing', 'resume did not return to play');

// Solo AI replies and autosaves.
await page.locator('.game-top .back').click();
await page.locator('[data-action="solo"]').click();
await page.locator('[data-action="begin"]').click();
await page.waitForSelector('[data-mode="ai"]');
const aiStart = await saveOf(page);
assert(aiStart.state.turn === 0, 'solo game did not start on the human seat');
const humanState = { state: await act(page) };
await page.waitForFunction(
  (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const state = JSON.parse(raw).state;
    return state.turn === 0 || state.phase !== 'playing';
  },
  SAVE_KEY,
  { timeout: 15000 },
);
const aiAfter = await saveOf(page);
assert(
  aiAfter.state.board.length > humanState.state.board.length ||
    aiAfter.state.boneyard.length < humanState.state.boneyard.length,
  'AI did not answer',
);

await page.reload({ waitUntil: 'networkidle' });
assert(await page.locator('[data-action="continue"]').isVisible(), 'solo autosave missing');

// Seeded near-end match: finish, record the result, and show the match panel.
await page.evaluate(
  ({ key, recordKey, seed }) => {
    localStorage.setItem(key, JSON.stringify(seed));
    localStorage.removeItem(recordKey);
  },
  { key: SAVE_KEY, recordKey: RECORD_KEY, seed: nearEndSave },
);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('[data-action="continue"]').click();
await page.locator('.hand-tile[data-tile="6-6"]').click();
await page.locator('.play-right').click();
await page.waitForSelector('.result-panel.match-over');
assert((await page.locator('.result-panel h2').innerText()).includes('wins the match'), 'match winner missing');
const record = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), RECORD_KEY);
assert(record.matches === 1, 'family record matches not updated');
assert(record.wins?.[0] === 1, 'family record seat win not updated');
assert(record.bestScore === 114, 'family record best score not updated');
assert((await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)) === null, 'save not cleared after match');

// Mobile layout is usable and can place a tile.
const mobile = await context.newPage();
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
mobile.on('pageerror', (error) => errors.push(String(error)));
await mobile.setViewportSize({ width: 390, height: 844 });
await fresh(mobile);
await mobile.locator('[data-action="local"]').click();
await mobile.locator('[data-action="begin"]').click();
await mobile.waitForSelector('.hand-tile');
assert(await mobile.locator('.hand').isVisible(), 'mobile hand missing');
await mobile.locator('.hand-tile').first().click();
await mobile.locator('.play-right').click();
await mobile.waitForTimeout(250);
const mobileSave = await mobile.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), SAVE_KEY);
assert(mobileSave.state.board.length === 1, 'mobile could not place a tile');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — home, hot-seat, hint, undo, full round, next round, autosave, solo AI, match record, mobile');
