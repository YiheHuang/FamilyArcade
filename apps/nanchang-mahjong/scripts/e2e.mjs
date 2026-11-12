import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5226';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, tag) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${tag}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${tag}: ${String(error)}`));
};

async function open(lang = 'en', viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  watch(page, lang);
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.e2e.init')) {
      localStorage.removeItem('familyarcade.nanchang-mahjong.save');
      localStorage.removeItem('familyarcade.nanchang-mahjong.record');
      sessionStorage.setItem('familyarcade.e2e.init', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

async function phase(page) {
  return page.locator('.game-shell').getAttribute('data-phase');
}

async function turn(page) {
  return page.locator('.game-shell').getAttribute('data-turn');
}

async function passHumanClaims(page) {
  if (await page.getByTestId('claim-panel').count()) {
    const pass = page.getByTestId('pass');
    if (await pass.count()) await pass.click().catch(() => {});
  }
}

async function waitForHuman(page, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await passHumanClaims(page);
    const currentPhase = await phase(page);
    const currentTurn = await turn(page);
    if ((currentPhase === 'draw' || currentPhase === 'discard') && currentTurn === '0') {
      return currentPhase;
    }
    if (currentPhase === 'hand-over' || currentPhase === 'game-over') return currentPhase;
    await page.waitForTimeout(250);
  }
  throw new Error('human turn was not reached');
}

async function drawAndDiscard(page) {
  const current = await phase(page);
  if (current === 'draw') {
    await page.getByTestId('draw').click();
    await page.waitForFunction(
      () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'discard',
      null,
      { timeout: 8000 },
    );
  }
  assert((await page.locator('.hand .tile').count()) === 14, 'hand should hold fourteen before discard');
  await page.locator('.hand .tile').first().click();
  await page.getByTestId('discard').click();
  await page.waitForTimeout(350);
}

// 1. Home, solo setup and a real deal.
const page = await open('en');
assert((await page.locator('h1').innerText()).includes('Nanchang Mahjong'), 'home title missing');
assert(await page.getByTestId('start-ai').isVisible(), 'solo button missing');
await page.getByTestId('start-ai').click();
assert(await page.getByTestId('level-hard').isVisible(), 'AI levels missing');
await page.getByTestId('level-hard').click();
await page.getByTestId('begin').click();
await page.waitForSelector('.game-shell');
assert((await phase(page)) === 'discard', 'dealer should start ready to discard');
assert((await turn(page)) === '0', 'seat 0 should be the test dealer');
assert((await page.locator('.hand .tile').count()) === 14, 'dealer should hold fourteen tiles');
assert((await page.locator('.spirit-card').innerText()).includes('True spirit'), 'spirit card missing');
const wallText = await page.locator('.table-meta').innerText();
assert(wallText.includes('49') && wallText.includes('34'), 'wall counts missing');

// 2. Discard, answer the AI, then draw, hint, undo and draw again.
await page.locator('.hand .tile').first().click();
await page.getByTestId('discard').click();
const afterDiscard = await waitForHuman(page);
assert(afterDiscard === 'draw' || afterDiscard === 'discard', 'human turn missing after discard');
await page.getByTestId('draw').click();
await page.waitForTimeout(220);
assert((await page.locator('.hand .tile').count()) === 14, 'draw should add one tile');
await page.getByTestId('hint').click();
await page.waitForTimeout(250);
const hintToast = await page.locator('.toast').innerText();
assert(hintToast.length > 12, `hint reason missing: ${hintToast}`);
const hintDebug = {
  handHint: await page.locator('.hand .tile.hint').count(),
  kongPanel: await page.getByTestId('kong-panel').count(),
  winButton: await page.getByTestId('win').count(),
  claimPanel: await page.getByTestId('claim-panel').count(),
  phase: await phase(page),
  selected: await page.locator('.hand-head .muted').innerText(),
};
assert(
  hintDebug.handHint === 1 || hintDebug.kongPanel > 0 || hintDebug.winButton > 0 || hintDebug.claimPanel > 0,
  `hint did not highlight a legal action: ${JSON.stringify(hintDebug)}`,
);
await page.getByTestId('undo').click();
await page.waitForTimeout(250);
assert((await page.locator('.hand .tile').count()) === 13, 'undo should remove the drawn tile');
assert((await phase(page)) === 'draw', 'undo should restore the draw phase');
await page.getByTestId('draw').click();
await page.waitForTimeout(220);

// 3. Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('save-continue').isVisible(), 'continue card missing after reload');
await page.getByTestId('save-continue').click();
await page.waitForSelector('.game-shell');
assert((await phase(page)) === 'discard', 'resume did not restore the discard phase');
assert((await page.locator('.hand .tile').count()) === 14, 'resume did not restore the hand');

// 4. Hot-seat privacy curtains.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByTestId('start-local').click();
await page.waitForTimeout(300);
assert(await page.getByTestId('privacy-panel').isVisible(), 'hot-seat privacy panel missing');
assert((await page.locator('.hand .tile').count()) === 0, 'hot-seat leaked a hand before reveal');
assert((await page.getByTestId('privacy-panel').innerText()).includes('Seat 1'), 'privacy should name Seat 1');
await page.getByTestId('privacy-reveal').click();
await page.waitForTimeout(180);
assert((await page.locator('.hand .tile').count()) === 14, 'hot-seat reveal failed');
await page.locator('.hand .tile').first().click();
await page.getByTestId('discard').click();
await page.waitForTimeout(350);
assert(await page.getByTestId('privacy-panel').isVisible(), 'next-seat privacy panel missing');
assert(/Seat [2-4]/.test(await page.getByTestId('privacy-panel').innerText()), 'privacy should name the next seat');
assert((await page.locator('.hand .tile').count()) === 0, 'next-seat hand leaked');
await page.getByTestId('privacy-reveal').click();
await page.waitForTimeout(120);

// 5. Chinese home and rules: only the language switch may be English.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByTestId('language').click();
await page.waitForTimeout(250);
assert((await page.locator('h1').innerText()).includes('南昌麻将'), 'Chinese title missing');
const chineseHome = (await page.locator('body').innerText()).replace('English', '');
const forbidden = /\b(Nanchang|Mahjong|Play|Rules|Family|Record|Home|Hand|Dealer|Wall|Spirit|True|Secondary|Draw|Discard|Hint|Undo|Sound|Motion|Solo|Hot-seat|LAN|AI|East|South|West|North)\b/;
assert(!forbidden.test(chineseHome), `English leaked onto the Chinese home: ${chineseHome.match(forbidden)?.[0]}`);
await page.getByTestId('rules').click();
await page.waitForTimeout(250);
assert((await page.locator('.screen-title').innerText()).includes('规则'), 'Chinese rules title missing');
const chineseRules = (await page.locator('body').innerText()).replace('English', '');
assert(!forbidden.test(chineseRules), `English leaked into Chinese rules: ${chineseRules.match(forbidden)?.[0]}`);
await page.getByRole('button', { name: /关闭/ }).click();
await page.getByTestId('language').click();
await page.waitForTimeout(200);

// 6. Seeded family record.
await page.evaluate(() => {
  const recent = [
    { winner: 0, pattern: 'seven-star', deltas: [32, -12, -8, -12], hand: 4, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 1) },
    { winner: 2, pattern: 'basic', deltas: [-4, -4, 12, -4], hand: 3, mode: 'local', at: Date.UTC(2026, 10, 4) },
    { winner: 1, pattern: 'small-seven-pairs', deltas: [-8, 24, -8, -8], hand: 2, mode: 'lan', at: Date.UTC(2026, 10, 7) },
  ];
  localStorage.setItem(
    'familyarcade.nanchang-mahjong.record',
    JSON.stringify({ hands: 7, wins: [3, 2, 1, 1], bestScore: 32, byMode: { ai: 3, local: 2, lan: 2 }, lastWinner: 1, recent }),
  );
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('record').click();
assert((await page.getByTestId('record-hands').innerText()).includes('7'), 'record total missing');
assert((await page.locator('.recent-row').count()) === 3, 'recent hands missing');
assert(await page.getByTestId('clear-record').isVisible(), 'clear record missing');

// 7. Demo score sheet and match over.
const demoEnd = await open('en');
await demoEnd.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
assert(await demoEnd.getByTestId('score-sheet').isVisible(), 'score sheet missing');
assert(await demoEnd.getByTestId('next-hand').isVisible(), 'next-hand button missing');
await demoEnd.getByTestId('next-hand').click();
await demoEnd.waitForTimeout(300);
assert((await phase(demoEnd)) === 'discard', 'next hand did not deal');
const demoOver = await open('en');
await demoOver.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
assert(await demoOver.getByTestId('match-over').isVisible(), 'match-over sheet missing');
assert(await demoOver.getByTestId('play-again').isVisible(), 'play-again button missing');

// 8. Hint on a rich demo hand.
const demoMid = await open('en');
await demoMid.goto(`${BASE}/?demo=mid`, { waitUntil: 'networkidle' });
await demoMid.getByTestId('hint').click();
await demoMid.waitForTimeout(250);
assert((await demoMid.locator('.tile.hint').count()) === 1, 'demo hint did not highlight a tile');
assert((await demoMid.locator('.toast').innerText()).length > 12, 'demo hint reason missing');

// 9. Mobile: no overflow, a real table and a real hand.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
watch(mobile, 'mobile');
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.removeItem('familyarcade.nanchang-mahjong.save');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByTestId('start-ai').click();
await mobile.getByTestId('begin').click();
await mobile.waitForSelector('.game-shell');
await mobile.evaluate(() => window.scrollTo(0, 0));
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');
assert((await mobile.locator('.hand .tile').count()) === 14, 'mobile hand missing');
const cardBox = await mobile.locator('.hand .tile').first().boundingBox();
assert(cardBox && cardBox.width >= 30, `mobile tile too small: ${cardBox?.width}`);
assert(await mobile.locator('.table').isVisible(), 'mobile table missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — deal, draw, discard, hint reason, undo, autosave, hot-seat privacy, Chinese UI, record, score sheet, match over, mobile');
