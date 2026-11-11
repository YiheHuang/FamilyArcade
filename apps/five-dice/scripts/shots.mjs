import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5193';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SEED = 23;

const WORDS = {
  en: {
    playAi: /Play against the AI/,
    pass: /Pass and play/,
    begin: /Roll the first hand/,
    rules: /Rules/,
    record: /Family record/,
    close: /^Close$/,
    back: /← Back/,
    hint: /^Hint$/,
    names: ['Mama', 'Papa', 'Nora'],
    recordData: {
      games: 7,
      bestScore: 248,
      bestBy: 'Papa',
      ties: 1,
      lastWinner: 'Papa',
      streak: 2,
      streakBy: 'Papa',
      history: [
        { at: 1, players: ['Mama', 'Papa', 'Nora', 'Theo'], scores: [212, 248, 231, 198], winner: 'Papa', tied: false },
        { at: 3, players: ['Mama', 'Nora'], scores: [186, 201], winner: 'Nora', tied: false },
        { at: 6, players: ['Papa', 'Nora', 'Theo'], scores: [177, 177, 164], winner: 'Papa & Nora', tied: true },
        { at: 9, players: ['Mama', 'Papa'], scores: [224, 219], winner: 'Mama', tied: false },
      ],
    },
  },
  zh: {
    playAi: /和 AI 玩一局/,
    pass: /同屏热座/,
    begin: /掷下第一手/,
    rules: /规则/,
    record: /家庭战绩/,
    close: /^关闭$/,
    back: /← 返回/,
    hint: /^提示$/,
    names: ['妈妈', '爸爸', '小诺'],
    recordData: {
      games: 7,
      bestScore: 248,
      bestBy: '爸爸',
      ties: 1,
      lastWinner: '爸爸',
      streak: 2,
      streakBy: '爸爸',
      history: [
        { at: 1, players: ['妈妈', '爸爸', '小诺', '小乐'], scores: [212, 248, 231, 198], winner: '爸爸', tied: false },
        { at: 3, players: ['妈妈', '小诺'], scores: [186, 201], winner: '小诺', tied: false },
        { at: 6, players: ['爸爸', '小诺', '小乐'], scores: [177, 177, 164], winner: '爸爸、小诺', tied: true },
        { at: 9, players: ['妈妈', '爸爸'], scores: [224, 219], winner: '妈妈', tied: false },
      ],
    },
  },
};

function makeRecord(lang) {
  const data = WORDS[lang].recordData;
  const now = Date.now();
  return {
    ...data,
    history: data.history.map((row) => ({
      ...row,
      at: now - row.at * 86400000,
    })),
  };
}

async function install(page, lang) {
  await page.addInitScript(
    ({ lang: value, record }) => {
      localStorage.setItem('familyarcade.lang', value);
      localStorage.setItem('familyarcade.five-dice.record', JSON.stringify(record));
      localStorage.removeItem('familyarcade.five-dice.save');
    },
    { lang, record: makeRecord(lang) },
  );
  await page.goto(`${BASE}/?seed=${SEED}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

function score(dice, index) {
  const counts = Array(7).fill(0);
  for (const die of dice) counts[die] += 1;
  const sum = dice.reduce((total, die) => total + die, 0);
  if (index < 6) return counts[index + 1] * (index + 1);
  const highest = Math.max(...counts.slice(1));
  const pairs = counts.slice(1).filter((count) => count === 2).length;
  const triples = counts.slice(1).filter((count) => count === 3).length;
  if (index === 6) return highest >= 3 ? sum : 0;
  if (index === 7) return highest >= 4 ? sum : 0;
  if (index === 8) return triples === 1 && pairs === 1 ? 25 : 0;
  if (index === 9) {
    for (let start = 1; start <= 3; start += 1) {
      let ok = true;
      for (let face = start; face < start + 4; face += 1) if (!counts[face]) ok = false;
      if (ok) return 30;
    }
    return 0;
  }
  if (index === 10) {
    for (let start = 1; start <= 2; start += 1) {
      let ok = true;
      for (let face = start; face < start + 5; face += 1) if (!counts[face]) ok = false;
      if (ok) return 40;
    }
    return 0;
  }
  if (index === 11) return highest === 5 ? 50 : 0;
  return sum;
}

function keepMask(dice) {
  const counts = Array(7).fill(0);
  for (const die of dice) counts[die] += 1;
  const mask = dice.map((die) => counts[die] >= 2);
  if (mask.some(Boolean)) return mask;
  const present = new Set(dice);
  let bestStart = 1;
  let bestLength = 0;
  for (let start = 1; start <= 6; start += 1) {
    let length = 0;
    while (start + length <= 6 && present.has(start + length)) length += 1;
    if (length > bestLength) {
      bestLength = length;
      bestStart = start;
    }
  }
  if (bestLength >= 2) {
    const result = [false, false, false, false, false];
    for (let face = bestStart; face < bestStart + bestLength; face += 1) {
      const index = dice.findIndex((die, position) => die === face && !result[position]);
      if (index >= 0) result[index] = true;
    }
    return result;
  }
  const highest = Math.max(...dice);
  return dice.map((die) => die === highest);
}

async function readDice(page) {
  return page.locator('.die').evaluateAll((elements) =>
    elements.map((element) => {
      const label = element.getAttribute('aria-label') ?? '';
      const tail = label.split(/[:：]/).pop() ?? '';
      const match = tail.match(/(\d+)/);
      return match ? Number(match[1]) : 0;
    }),
  );
}

async function setHolds(page, mask) {
  const pressed = await page
    .locator('.die')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-pressed') === 'true'));
  for (let index = 0; index < 5; index += 1) {
    if (Boolean(pressed[index]) !== Boolean(mask[index])) {
      await page.locator('.die').nth(index).click();
      await page.waitForTimeout(25);
    }
  }
}

async function bestOpenRow(page, dice) {
  const rows = page.locator('.category-row');
  let best = -1;
  let points = -Infinity;
  for (let index = 0; index < 13; index += 1) {
    const row = rows.nth(index);
    if (await row.isDisabled()) continue;
    const value = score(dice, index);
    if (value > points) {
      points = value;
      best = index;
    }
  }
  return best;
}

async function scoreBest(page) {
  const dice = await readDice(page);
  const best = await bestOpenRow(page, dice);
  if (best < 0) throw new Error('no open score row');
  await page.locator('.category-row').nth(best).click();
  await page.waitForTimeout(35);
}

async function run(lang) {
  const words = WORDS[lang];
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await install(page, lang);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: words.record }).last().click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'record.png') });
  await page.getByRole('button', { name: words.close }).click();
  await page.waitForTimeout(150);

  await page.getByRole('button', { name: words.rules }).last().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: words.close }).click();
  await page.waitForTimeout(150);

  // AI setup screen: three seats, named human, Normal level.
  await page.getByRole('button', { name: words.playAi }).click();
  await page.locator('.segmented button').nth(1).click();
  await page.locator('.name-fields input').first().fill(words.names[0]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'setup.png') });
  await page.getByRole('button', { name: words.back }).click();
  await page.waitForTimeout(150);

  // Real hot-seat game with three players.
  await page.getByRole('button', { name: words.pass }).click();
  const nameInputs = page.locator('.name-fields input');
  for (let index = 0; index < 3; index += 1) {
    await nameInputs.nth(index).fill(words.names[index]);
  }
  await page.getByRole('button', { name: words.begin }).click();
  await page.locator('.dice-stage').waitFor();

  for (let turn = 0; turn < 6; turn += 1) {
    await page.locator('.roll-button').click();
    await page.waitForTimeout(80);
    await scoreBest(page);
  }

  // Turn seven: keep the three sixes, roll into a full house, keep all five.
  await page.locator('.roll-button').click();
  await page.waitForTimeout(100);
  let dice = await readDice(page);
  await setHolds(page, keepMask(dice));
  await page.locator('.roll-button').click();
  await page.waitForTimeout(120);
  dice = await readDice(page);
  await setHolds(page, keepMask(dice));
  await page.waitForTimeout(200);
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  await page.getByRole('button', { name: words.hint }).click();
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await scoreBest(page);
  let guard = 0;
  while (!(await page.locator('.result-panel').isVisible()) && guard < 45) {
    await page.locator('.roll-button').click();
    await page.waitForTimeout(60);
    await scoreBest(page);
    guard += 1;
  }
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Mobile: home and a live two-player turn.
  const mobileContext = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await mobileContext.newPage();
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(`mobile: ${message.text()}`);
  });
  mobile.on('pageerror', (error) => errors.push(`mobile: ${String(error)}`));
  await install(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: words.pass }).click();
  const mobileNames = mobile.locator('.name-fields input');
  await mobileNames.nth(0).fill(words.names[0]);
  await mobileNames.nth(1).fill(words.names[2]);
  await mobile.getByRole('button', { name: words.begin }).click();
  await mobile.locator('.dice-stage').waitFor();
  await mobile.locator('.roll-button').click();
  await mobile.waitForTimeout(100);
  const mobileDice = await readDice(mobile);
  await setHolds(mobile, keepMask(mobileDice));
  await mobile.locator('.roll-button').click();
  await mobile.waitForTimeout(350);
  const mobileFinalDice = await readDice(mobile);
  await setHolds(mobile, keepMask(mobileFinalDice));
  await mobile.waitForTimeout(150);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await mobileContext.close();
  await context.close();
  await browser.close();
  if (errors.length > 0) throw new Error(`console errors (${lang}): ${errors.join(' | ')}`);
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');


