import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5206';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SAVE_KEY = 'familyarcade.intl-draughts.save';
const RECORD_KEY = 'familyarcade.intl-draughts.record';

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
}

async function setLang(page, lang) {
  await page.addInitScript(
    ({ value }) => {
      localStorage.setItem('familyarcade.lang', value);
    },
    { value: lang },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function clickSquare(page, index) {
  await page.locator(`[data-square="${index}"]`).click();
  await page.waitForTimeout(120);
}

async function makeMoves(page, moves) {
  for (const [from, to] of moves) {
    await clickSquare(page, from);
    await clickSquare(page, to);
  }
}

function winState() {
  const board = Array(100).fill(null);
  board[90] = 'W';
  board[54] = 'b';
  return {
    board,
    turn: 'W',
    status: 'playing',
    winner: null,
    winReason: null,
    drawReason: null,
    plies: 0,
    quietPlies: 0,
    lastMove: null,
    first: 'W',
    repetitions: {},
  };
}

function demoRecord() {
  const day = 86_400_000;
  const now = Date.now();
  return {
    games: 9,
    winsWhite: 4,
    winsBlack: 3,
    draws: 2,
    streak: 2,
    bestStreak: 3,
    lastWinner: 'B',
    byMode: { ai: 4, local: 3, lan: 2 },
    recent: [
      { winner: 'B', mode: 'ai', level: 'hard', moves: 58, at: now - day * 0.2 },
      { winner: 'W', mode: 'local', moves: 41, at: now - day * 1.1 },
      { winner: 'draw', mode: 'lan', moves: 50, at: now - day * 2.4 },
      { winner: 'W', mode: 'ai', level: 'normal', moves: 33, at: now - day * 3.6 },
    ],
  };
}

async function run(lang) {
  const zh = lang === 'zh';
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await setLang(page, lang);
  await page.evaluate(
    ({ save, record }) => {
      localStorage.removeItem(save);
      localStorage.removeItem(record);
    },
    { save: SAVE_KEY, record: RECORD_KEY },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: zh ? /和电脑下一局/ : /Play against the computer/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.locator('.back').click();
  await page.getByRole('button', { name: zh ? /两人同屏/ : /Two players, one screen/ }).click();
  await page.waitForTimeout(300);
  // A quiet, capture-free opening so the screenshot is a real live position.
  await makeMoves(page, [
    [69, 58],
    [30, 41],
    [67, 56],
    [32, 43],
  ]);
  await clickSquare(page, 63);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  const selectedBeforeEscape = await page.locator('.square.selected').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const hintCount = await page.getByRole('button', { name: zh ? /提示/ : /Hint/ }).count();
  if (hintCount === 0) {
    throw new Error(`Hint missing after Escape; selected before=${selectedBeforeEscape}, screen h1=${await page.locator('h1').count()}`);
  }
  await page.getByRole('button', { name: zh ? /提示/ : /Hint/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: zh ? /主页/ : /Home/ }).click();
  await page.getByRole('button', { name: zh ? /规则/ : /Rules/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: zh ? /关闭/ : /Close/ }).click();

  // Finish a real game from an autosaved one-piece ending.
  await page.evaluate(
    ({ save, state }) => {
      localStorage.setItem(
        save,
        JSON.stringify({ version: 1, state, mode: 'local', level: 'normal', savedAt: Date.now() }),
      );
      localStorage.removeItem('familyarcade.intl-draughts.record');
    },
    { save: SAVE_KEY, state: winState() },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: zh ? /继续上局/ : /Continue last game/ }).click();
  await clickSquare(page, 90);
  await clickSquare(page, 45);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // A full family record for the record screen (real local data, not a mockup).
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: RECORD_KEY, value: demoRecord() },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: zh ? /查看战绩/ : /View record/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.getByRole('button', { name: zh ? /主页/ : /Home/ }).click();
  await page.getByRole('button', { name: zh ? /局域网对战/ : /Play on the local network/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'lan.png') });

  const mobile = await browser.newPage({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: zh ? /两人同屏/ : /Two players, one screen/ }).click();
  await clickSquare(mobile, 63);
  await mobile.waitForTimeout(250);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
process.exit(0);
