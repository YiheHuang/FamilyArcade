import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5209';
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
  if (!sessionStorage.getItem('familyarcade.e2e.init')) {
    localStorage.removeItem('familyarcade.spades.save');
    localStorage.removeItem('familyarcade.spades.record');
    sessionStorage.setItem('familyarcade.e2e.init', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

assert((await page.locator('h1').innerText()).includes('Spades'), 'home title missing');
assert(await page.getByTestId('start-ai').isVisible(), 'AI button missing');
await page.getByTestId('start-ai').click();
assert(await page.getByTestId('level-hard').isVisible(), 'AI levels missing');
await page.getByTestId('level-hard').click();
await page.getByTestId('begin').click();

// Every human bid starts behind a blind-nil cover.
await page.waitForSelector('[data-testid="bid-cover"]');
assert((await page.locator('.hand .card').count()) === 0, 'hand visible before reveal');
assert(await page.getByTestId('blind-nil').isVisible(), 'blind nil missing');
await page.getByTestId('reveal').click();
await page.waitForTimeout(150);
assert((await page.locator('.hand .card').count()) === 13, 'hand not revealed');
assert(await page.getByTestId('bid-panel').isVisible(), 'bid panel missing');
await page.getByTestId('bid-3').click();

await page.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '0';
}, null, { timeout: 15000 });
assert((await page.locator('.hand .card').count()) === 13, 'hand count changed before play');
const bidsText = await page.locator('.bid-list').innerText();
assert(bidsText.includes('3'), 'bids not listed');

// Lead one card; AI answers. The human should come back to the table.
await page.locator('.hand .card[data-legal="true"]').first().click();
await page.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-phase') === 'playing' && el?.getAttribute('data-turn') === '0';
}, null, { timeout: 15000 });
assert((await page.locator('.hand .card').count()) === 12, 'hand not reduced after play');
assert(Number(await page.getByTestId('trick-area').getAttribute('data-trick-count')) >= 0, 'trick area missing');

// Hint gives a legal highlighted card and a sentence with a reason.
await page.getByTestId('hint').click();
await page.waitForTimeout(200);
assert((await page.locator('.hand .card.hint').count()) === 1, 'hint card missing');
const hintToast = await page.locator('.toast').innerText();
assert(/Win|Lead|Follow|Duck|Trump|Cover|Play/i.test(hintToast), `hint reason missing: ${hintToast}`);

// Undo steps back to the human's previous decision.
await page.getByTestId('undo').click();
await page.waitForTimeout(200);
assert((await page.locator('.hand .card').count()) === 13, 'undo did not restore the hand');
assert((await page.getByTestId('trick-area').getAttribute('data-trick-count')) === '0', 'undo left the trick in place');

// Keyboard path: 1 plays the first legal card, U undoes it.
await page.keyboard.press('1');
await page.waitForTimeout(250);
assert((await page.locator('.hand .card').count()) === 12, 'number key did not play a card');
await page.keyboard.press('u');
await page.waitForTimeout(200);
assert((await page.locator('.hand .card').count()) === 13, 'U did not undo');

// Autosave and resume.
await page.keyboard.press('1');
await page.waitForTimeout(250);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('save-continue').isVisible(), 'continue card missing after reload');
await page.getByTestId('save-continue').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.game-shell').getAttribute('data-phase')) === 'playing', 'resume did not restore play');

// Hot-seat privacy: a new bidder must not see the next hand before revealing.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByTestId('start-local').click();
await page.waitForSelector('[data-testid="bid-cover"]');
assert((await page.locator('.hand .card').count()) === 0, 'hot-seat showed a hand too early');
await page.getByTestId('reveal').click();
await page.waitForTimeout(100);
assert((await page.locator('.hand .card').count()) === 13, 'hot-seat reveal failed');
await page.getByTestId('bid-3').click();
await page.waitForTimeout(200);
assert(await page.getByTestId('bid-cover').isVisible(), 'next seat cover missing');
assert((await page.locator('.hand .card').count()) === 0, 'next seat hand leaked');

// Chinese screen: no English words beyond the language switch and card notation.
await page.getByTestId('language').click();
await page.waitForTimeout(200);
assert((await page.locator('.game-id strong').innerText()).includes('黑桃皇后'), 'Chinese game title missing');
const chineseText = (await page.locator('body').innerText()).replace('English', '');
const forbidden = /\b(Spades|Play|Rules|Family|Matches|Bids|Undo|Hint|Network|Host|Guest|Match|Contract|Tricks|Bags|Score|Round|Dealer|Nil|Blind|Hot-seat|With|Local|AI)\b/;
assert(!forbidden.test(chineseText), `English leaked into Chinese UI: ${chineseText.match(forbidden)?.[0]}`);
await page.getByTestId('language').click();
await page.waitForTimeout(150);

// Seed a record and verify the record screen.
await page.evaluate(() => {
  const recent = [
    { winner: 1, scores: [420, 515], rounds: 9, mode: 'lan', at: Date.UTC(2026, 10, 2) },
    { winner: 0, scores: [500, 470], rounds: 7, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 5) },
    { winner: 1, scores: [455, 505], rounds: 6, mode: 'local', at: Date.UTC(2026, 10, 10) },
  ];
  localStorage.setItem('familyarcade.spades.record', JSON.stringify({
    matches: 7,
    winsA: 4,
    winsB: 3,
    rounds: 52,
    byMode: { ai: 3, local: 2, lan: 2 },
    lastWinner: 1,
    recent,
  }));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('stats').click();
assert((await page.getByTestId('record-matches').innerText()).includes('7'), 'record total missing');
assert((await page.locator('.recent-row').count()) === 3, 'recent matches missing');
assert(await page.getByRole('button', { name: /Clear record/ }).isVisible(), 'clear record missing');

// Round-over and match-over fixtures render real screens.
await page.goto(`${BASE}/?demo=round`, { waitUntil: 'networkidle' });
assert(await page.getByTestId('round-sheet').isVisible(), 'round sheet missing');
assert(await page.getByTestId('next-round').isVisible(), 'next round button missing');
await page.getByTestId('next-round').click();
await page.waitForTimeout(200);
assert((await page.locator('.game-shell').getAttribute('data-phase')) === 'bidding', 'next round did not deal');
await page.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
assert(await page.getByTestId('match-over').isVisible(), 'match-over sheet missing');
assert(await page.getByTestId('play-again').isVisible(), 'play-again button missing');
assert(await page.getByTestId('change-level').isVisible(), 'change-level button missing');

// Mobile: no overflow, a real hand, and a real table.
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
  localStorage.removeItem('familyarcade.spades.save');
  localStorage.removeItem('familyarcade.spades.record');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByTestId('start-ai').click();
await mobile.getByTestId('begin').click();
await mobile.waitForSelector('[data-testid="bid-cover"]');
await mobile.getByTestId('reveal').click();
await mobile.waitForTimeout(150);
await mobile.getByTestId('bid-3').click();
await mobile.waitForFunction(() => {
  const el = document.querySelector('.game-shell');
  return el?.getAttribute('data-phase') === 'playing';
}, null, { timeout: 15000 });
await mobile.evaluate(() => window.scrollTo(0, 0));
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');
assert((await mobile.locator('.hand .card').count()) === 13, 'mobile hand missing');
const cardBox = await mobile.locator('.hand .card').first().boundingBox();
assert(cardBox && cardBox.width >= 40, `mobile card too small: ${cardBox?.width}`);
assert(await mobile.locator('.felt').isVisible(), 'mobile table missing');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — bidding, play, hint reason, undo, keyboard, autosave, hot-seat privacy, Chinese UI, record, round/match end, mobile');
