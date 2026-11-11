import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5199';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const SEED_WINNERS = ['B', 'R', 'B', 'R', 'B', 'R', 'R'];
const SEED_HISTORY = SEED_WINNERS.map((winner, index) => ({
  winner,
  at: Date.UTC(2026, 10, 3 + index, 18, 30),
}));

async function setLang(page, lang) {
  await page.addInitScript(
    ({ value, history }) => {
      localStorage.setItem('familyarcade.lang', value);
      if (!sessionStorage.getItem('familyarcade.shots.seeded')) {
        localStorage.removeItem('familyarcade.hex.save');
        localStorage.setItem(
          'familyarcade.hex.record',
          JSON.stringify({
            games: 7,
            redWins: 4,
            blueWins: 3,
            streak: 2,
            lastWinner: 'R',
            history,
          }),
        );
        sessionStorage.setItem('familyarcade.shots.seeded', '1');
      }
    },
    { value: lang, history: SEED_HISTORY },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

async function clickCell(page, index) {
  await page.locator('.hex-cell').nth(index).click();
  await page.waitForTimeout(45);
}

async function playMoves(page, moves) {
  for (const move of moves) await clickCell(page, move);
}

const MIDGAME = [
  [60, 59],
  [61, 49],
  [50, 48],
  [51, 38],
  [40, 39],
  [41, 27],
  [71, 72],
  [82, 83],
  [81, 84],
  [92, 94],
  [28, 93],
  [18, 105],
].flat();

const RED_COLUMN = [5, 16, 27, 38, 49, 60, 71, 82, 93, 104, 115];
const BLUE_COLUMN = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];
const VICTORY = [];
for (let i = 0; i < RED_COLUMN.length; i++) {
  VICTORY.push(RED_COLUMN[i]);
  if (i < BLUE_COLUMN.length) VICTORY.push(BLUE_COLUMN[i]);
}

const MOBILE_GAME = [60, 59, 61, 49, 50, 48];

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setLang(page, lang);
  console.log(`  ${lang}: home`);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Play against|和 AI/ }).click();
  await page.waitForTimeout(250);
  console.log(`  ${lang}: setup`);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Back|返回/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await playMoves(page, MIDGAME);
  await page.waitForTimeout(300);
  console.log(`  ${lang}: game`);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: /Hint|提示/ }).click();
  await page.waitForTimeout(900);
  console.log(`  ${lang}: hint`);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await playMoves(page, VICTORY);
  await page.waitForTimeout(350);
  console.log(`  ${lang}: game-over`);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.getByRole('button', { name: /Home|主页/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Rules|规则/ }).click();
  await page.waitForTimeout(200);
  console.log(`  ${lang}: rules`);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(150);

  console.log(`  ${lang}: stats`);
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  await setLang(mobile, lang);
  console.log(`  ${lang}: home-mobile`);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await playMoves(mobile, MOBILE_GAME);
  await mobile.waitForTimeout(250);
  console.log(`  ${lang}: game-mobile`);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
