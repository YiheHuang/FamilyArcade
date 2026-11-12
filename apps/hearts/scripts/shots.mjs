import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5208';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const RECORD_SEED = {
  games: 14,
  wins: [6, 4, 2, 2],
  moons: 2,
  bestScore: 31,
  byMode: { ai: 8, local: 4, lan: 2 },
  recent: [
    { winnerSeat: 0, scores: [31, 54, 62, 77], mode: 'ai', level: 'normal', moons: 0, hands: 5, at: Date.UTC(2026, 10, 10, 18) },
    { winnerSeat: 2, scores: [82, 61, 46, 70], mode: 'local', moons: 1, hands: 6, at: Date.UTC(2026, 10, 9, 19) },
    { winnerSeat: 1, scores: [58, 39, 66, 91], mode: 'lan', moons: 0, hands: 4, at: Date.UTC(2026, 10, 8, 17) },
  ],
};

async function addLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
}

async function openPage(browser, viewport, lang) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor ?? 1 });
  const page = await context.newPage();
  await addLang(page, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page };
}

async function clean(page) {
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.hearts.save');
    localStorage.removeItem('familyarcade.hearts.record');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function buildSave(page, kind) {
  return page.evaluate(async (mode) => {
    const m = await import('/src/game/hearts.ts');
    let seed = mode === 'over' ? 917 : 773;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let state =
      mode === 'over'
        ? m.setup(rng, { scores: [100, 74, 63, 58], handNumber: 5 })
        : m.setup(rng, { scores: [42, 55, 38, 61], handNumber: 3 });
    while (state.phase === 'passing') {
      const seat = state.passSelections.findIndex((pick) => pick === null);
      state = m.passCards(state, seat, state.hands[seat].slice(0, 3)).state;
    }
    let guard = 0;
    if (mode === 'over') {
      while (state.phase === 'playing' && guard < 80) {
        guard += 1;
        const legal = m.legalCards(state, state.turn);
        state = m.playCard(state, state.turn, legal[0]).state;
      }
    } else {
      while (state.phase === 'playing' && guard < 80) {
        guard += 1;
        if (state.playedCards.length >= 20 && state.turn === 0) break;
        const legal = m.legalCards(state, state.turn);
        state = m.playCard(state, state.turn, legal[0]).state;
      }
    }
    return JSON.stringify({
      version: 1,
      state,
      mode: 'ai',
      level: 'normal',
      savedAt: Date.now(),
    });
  }, kind);
}

async function installSave(page, kind) {
  const saved = await buildSave(page, kind);
  await page.evaluate((value) => localStorage.setItem('familyarcade.hearts.save', value), saved);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue the last game|继续上一局/ }).click();
  await page.waitForTimeout(500);
}

async function screenshot(page, dir, name) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, name), animations: 'disabled' });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const { context, page } = await openPage(browser, DESKTOP, lang);
  await clean(page);
  await screenshot(page, dir, 'home.png');

  await page.getByRole('button', { name: /Solo against the computer|单人挑战电脑/ }).click();
  await screenshot(page, dir, 'setup.png');
  await page.getByRole('button', { name: /^Back$|^返回$/ }).click();

  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await screenshot(page, dir, 'rules.png');
  await page.locator('.back').click();

  await page.evaluate((seed) => {
    localStorage.setItem('familyarcade.hearts.record', JSON.stringify(seed));
  }, RECORD_SEED);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await screenshot(page, dir, 'stats.png');
  await page.locator('.back').click();

  await page.getByRole('button', { name: /Table over the local network|局域网牌桌/ }).click();
  await screenshot(page, dir, 'lan.png');
  await page.locator('.back').click();

  await installSave(page, 'mid');
  await screenshot(page, dir, 'game.png');
  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await screenshot(page, dir, 'game-hint.png');

  await page.evaluate(() => localStorage.removeItem('familyarcade.hearts.save'));
  await page.reload({ waitUntil: 'networkidle' });
  await installSave(page, 'over');
  await screenshot(page, dir, 'game-over.png');
  await context.close();

  const mobile = await openPage(browser, MOBILE, lang);
  await clean(mobile.page);
  await screenshot(mobile.page, dir, 'home-mobile.png');
  await installSave(mobile.page, 'mid');
  await screenshot(mobile.page, dir, 'game-mobile.png');
  await mobile.context.close();

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
