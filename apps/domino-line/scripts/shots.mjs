import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5191/?seed=2701';
const OUT = path.resolve('docs/screenshots');
const SAVE_KEY = 'familyarcade.domino-line.save';
const RECORD_KEY = 'familyarcade.domino-line.record';
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

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

const seededRecord = {
  matches: 3,
  rounds: 21,
  wins: [2, 1, 0, 0],
  bestScore: 118,
  streak: 2,
  lastWinner: 0,
};

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

async function prepare(page, lang, { record = false, save = null } = {}) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ value, recordKey, saveKey, recordData, saveData }) => {
      localStorage.clear();
      localStorage.setItem('familyarcade.lang', value);
      if (recordData) localStorage.setItem(recordKey, JSON.stringify(recordData));
      if (saveData) localStorage.setItem(saveKey, JSON.stringify(saveData));
    },
    {
      value: lang,
      recordKey: RECORD_KEY,
      saveKey: SAVE_KEY,
      recordData: record ? seededRecord : null,
      saveData: save,
    },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

async function saveOf(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
}

async function act(page) {
  const saved = await saveOf(page);
  if (!saved) return;
  const state = saved.state;
  if (state.phase !== 'playing') return;
  const plays = legalFrom(state);
  if (plays.length > 0) {
    const play = plays[0];
    await page.locator(`.hand-tile[data-tile="${tileKey(play.tile)}"]`).click();
    await page.locator(play.end === 'left' ? '.play-left' : '.play-right').click();
  } else if (state.boneyard.length > 0) {
    await page.locator('.draw-btn').click();
  } else {
    await page.locator('.pass-btn').click();
  }
  await page.waitForTimeout(140);
}

async function startHotSeat(page) {
  await page.locator('[data-action="local"]').click();
  await page.locator('[data-action="begin"]').click();
  await page.waitForSelector('.hand-tile');
  await page.waitForTimeout(200);
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });

  await prepare(page, lang, { record: true });
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.locator('[data-action="solo"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.locator('.back').first().click();
  await startHotSeat(page);
  for (let move = 0; move < 5; move += 1) await act(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.locator('.hint-btn').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.locator('.game-top .back').click();
  await page.locator('[data-action="rules"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.locator('.rules-shell .primary').click();
  await page.locator('[data-action="stats"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.evaluate(
    ({ saveKey, saveData, recordKey, recordData }) => {
      localStorage.setItem(saveKey, JSON.stringify(saveData));
      localStorage.setItem(recordKey, JSON.stringify(recordData));
    },
    { saveKey: SAVE_KEY, saveData: nearEndSave, recordKey: RECORD_KEY, recordData: seededRecord },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
  await page.locator('.hand-tile[data-tile="6-6"]').click();
  await page.locator('.play-right').click();
  await page.waitForSelector('.result-panel.match-over');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  const mobile = await browser.newPage({
    viewport: MOBILE,
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  await prepare(mobile, lang, { record: true });
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await startHotSeat(mobile);
  await act(mobile);
  await act(mobile);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
