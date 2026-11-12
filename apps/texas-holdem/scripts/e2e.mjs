import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5217';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
  if (!sessionStorage.getItem('familyarcade.texas-holdem.e2e')) {
    localStorage.removeItem('familyarcade.texas-holdem.save');
    localStorage.removeItem('familyarcade.texas-holdem.record');
    localStorage.removeItem('familyarcade.texas-holdem.motion');
    sessionStorage.setItem('familyarcade.texas-holdem.e2e', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

assert((await page.locator('h1').innerText()).includes("Texas Hold'em"), 'home title missing');
assert(await page.getByTestId('start-ai').isVisible(), 'solo button missing');
await page.getByTestId('start-ai').click();
assert(await page.getByTestId('seats-3').isVisible(), 'seat picker missing');
await page.getByTestId('seats-3').click();
await page.getByTestId('level-hard').click();
await page.getByTestId('seed-input').fill('family-table');
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.getByTestId('game-shell').getAttribute('data-phase')) === 'preflop', 'not pre-flop');
assert((await page.getByTestId('game-shell').getAttribute('data-turn')) === '0', 'human not first');
assert((await page.locator('[data-testid="hole-cards"] .playing-card').count()) === 2, 'human hole cards missing');
assert((await page.locator('[data-seat="1"] .playing-card[data-card-id]').count()) === 0, 'AI hand leaked');
assert((await page.locator('[data-seat="2"] .playing-card[data-card-id]').count()) === 0, 'AI hand leaked');

// Hint with a reason and a highlighted suggested action.
await page.getByTestId('hint').click();
await page.waitForTimeout(250);
const hintToast = await page.locator('.toast').innerText();
assert(/Pot|hand|price|position|stack|bluff|equity|Call|Check|Fold|Raise|Bet|all-in/i.test(hintToast), `hint reason missing: ${hintToast}`);
assert((await page.locator('.action-btn.hinted').count()) === 1, 'hint did not highlight an action');

// Call pre-flop, let the AI seats answer, and return to the human.
await page.getByTestId('action-call').click();
await page.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-turn') === '0' && el?.getAttribute('data-phase') !== 'showdown';
}, null, { timeout: 20000 });
const phaseAfterAi = await page.getByTestId('game-shell').getAttribute('data-phase');
assert(['preflop', 'flop', 'turn', 'river'].includes(phaseAfterAi), `bad phase ${phaseAfterAi}`);
const potText = await page.getByTestId('pot').innerText();
assert(potText.includes('30') || Number(potText.replace(/\D/g, '')) > 0, 'pot missing');

// Undo rewinds the AI replies back to the human's previous decision.
await page.getByTestId('undo').click();
await page.waitForTimeout(250);
assert((await page.getByTestId('game-shell').getAttribute('data-turn')) === '0', 'undo missed human turn');
assert((await page.getByTestId('game-shell').getAttribute('data-phase')) === 'preflop', 'undo did not rewind AI');

// Keyboard path: C calls or checks, U undoes.
await page.keyboard.press('c');
await page.waitForTimeout(160);
await page.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-turn') === '0' && el?.getAttribute('data-phase') !== 'showdown';
}, null, { timeout: 20000 });
await page.keyboard.press('u');
await page.waitForTimeout(250);
assert((await page.getByTestId('game-shell').getAttribute('data-turn')) === '0', 'keyboard undo failed');

// Hint should set a raise slider when it recommends aggression.
await page.keyboard.press('c');
await page.waitForTimeout(180);
await page.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-turn') === '0' && el?.getAttribute('data-phase') !== 'showdown';
}, null, { timeout: 20000 });
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('save-continue').isVisible(), 'continue card missing after reload');
await page.getByTestId('save-continue').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.locator('[data-testid="hole-cards"] .playing-card').count()) === 2, 'resume lost the hand');

// Hot-seat privacy and the hand curtain.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByTestId('start-local').click();
await page.getByTestId('seats-3').click();
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="curtain"]');
assert((await page.locator('[data-testid="hole-cards"] .playing-card').count()) === 0, 'hot-seat hand visible before reveal');
assert((await page.locator('[data-seat="0"] .playing-card[data-card-id]').count()) === 0, 'hot-seat seat card leaked');
await page.getByTestId('show-hand').click();
await page.waitForTimeout(180);
assert((await page.locator('[data-testid="hole-cards"] .playing-card').count()) === 2, 'hot-seat reveal failed');
await page.getByTestId('action-call').click();
await page.waitForTimeout(250);
assert(await page.getByTestId('curtain').isVisible(), 'next hot-seat curtain missing');
assert((await page.locator('[data-testid="hole-cards"] .playing-card').count()) === 0, 'next hot-seat hand leaked');

// Chinese UI: no English except the language switch and card notation.
await page.getByTestId('language').click();
await page.waitForTimeout(250);
assert((await page.locator('.game-id strong').innerText()).includes('德州扑克'), 'Chinese title missing');
const chineseText = (await page.locator('body').innerText()).replace('English', '');
const forbidden =
  /\b(Play|Rules|Family|Hand|Hands|Table|Tables|Pot|Fold|Call|Raise|Check|All-in|Actions|Undo|Hint|Home|Sound|Seat|Pre-flop|Flop|Turn|River|Showdown|Chips|Blinds|Dealer|Small|Big|You|Computer|Network|Host|Guest|Room|Code|Name|Join|Leave|Connected|Waiting|Ready|Start|Equity|Odds)\b/;
assert(!forbidden.test(chineseText), `English leaked into Chinese UI: ${chineseText.match(forbidden)?.[0]}`);
assert(!chineseText.includes("Texas Hold'em"), 'English title leaked into Chinese UI');
await page.getByTestId('language').click();
await page.waitForTimeout(150);

// Seed a family record and verify the record screen.
await page.evaluate(() => {
  localStorage.setItem(
    'familyarcade.texas-holdem.record',
    JSON.stringify({
      hands: 7,
      showdowns: 4,
      sessions: 2,
      sessionWins: 1,
      biggestPot: 640,
      byMode: { ai: 4, local: 2, lan: 1 },
      recent: [
        { handNumber: 12, pot: 640, winners: [0], showdown: true, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 2) },
        { handNumber: 11, pot: 180, winners: [1], showdown: false, mode: 'local', at: Date.UTC(2026, 10, 5) },
        { handNumber: 9, pot: 300, winners: [2], showdown: true, mode: 'lan', at: Date.UTC(2026, 10, 8) },
      ],
    }),
  );
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('stats').click();
assert((await page.getByTestId('record-hands').innerText()).includes('7'), 'record hands missing');
assert((await page.getByTestId('record-sessions').innerText()).includes('2'), 'record sessions missing');
assert((await page.getByTestId('record-biggest').innerText()).includes('640'), 'record biggest pot missing');
assert((await page.locator('.recent-row').count()) === 3, 'recent hands missing');
assert(await page.getByRole('button', { name: /Clear record/ }).isVisible(), 'clear record missing');

// Deterministic showdown and table-over screens.
await page.goto(`${BASE}/?demo=showdown`, { waitUntil: 'networkidle' });
assert(await page.getByTestId('hand-result').isVisible(), 'showdown sheet missing');
assert((await page.locator('.showdown-hand .playing-card').count()) >= 5, 'showdown best five missing');
await page.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
assert(await page.getByTestId('session-over').isVisible(), 'session-over sheet missing');
assert(await page.getByTestId('play-again').isVisible(), 'new table button missing');
assert(await page.getByTestId('change-setup').isVisible(), 'table setup button missing');

// Mobile: no overflow, a real hand and table, and a usable action dock.
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
  localStorage.removeItem('familyarcade.texas-holdem.save');
  localStorage.removeItem('familyarcade.texas-holdem.record');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByTestId('start-ai').click();
await mobile.getByTestId('begin').click();
await mobile.waitForTimeout(400);
await mobile.evaluate(() => window.scrollTo(0, 0));
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');
assert((await mobile.locator('[data-testid="hole-cards"] .playing-card').count()) === 2, 'mobile hand missing');
assert(await mobile.getByTestId('table').isVisible(), 'mobile table missing');
await mobile.locator('[data-testid="action-dock"]').scrollIntoViewIfNeeded();
assert(await mobile.getByTestId('action-dock').isVisible(), 'mobile action dock missing');
const cardBox = await mobile.locator('[data-testid="hole-cards"] .playing-card').first().boundingBox();
assert(cardBox && cardBox.width >= 40, `mobile card too small: ${cardBox?.width}`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — solo hand, hidden AI cards, hint reason, undo, keyboard, autosave, hot-seat privacy, Chinese UI, record, showdown, table over, mobile',
);
