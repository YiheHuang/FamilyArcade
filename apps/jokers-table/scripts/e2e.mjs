import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5219';
let checks = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  checks += 1;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const makePage = async (lang = 'en', viewport = { width: 1440, height: 1000 }) => {
  const page = await browser.newPage({ viewport });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.e2e.init')) {
      localStorage.removeItem('familyarcade.jokers-table.save');
      localStorage.removeItem('familyarcade.jokers-table.record');
      sessionStorage.setItem('familyarcade.e2e.init', '1');
    }
  }, lang);
  return page;
};

async function startSolo(page, seed = '20261112') {
  await page.getByTestId('start-solo').click();
  await page.getByTestId('seed-input').fill(seed);
  await page.getByTestId('begin').click();
  await page.waitForSelector('[data-testid="game-shell"]');
}

async function playFourSingles(page) {
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.hand .pcard').first().click();
    await page.getByTestId('play').click();
    await page.waitForTimeout(120);
    if ((await page.getByTestId('blind-result').count()) > 0) return;
  }
}

const page = await makePage();
await page.goto(BASE, { waitUntil: 'networkidle' });

// Home and solo setup.
assert((await page.locator('h1').innerText()).includes("Joker's Table"), 'home title missing');
assert(await page.getByTestId('start-solo').isVisible(), 'solo entry missing');
await page.getByTestId('start-solo').click();
assert(await page.getByTestId('deck-ivory').isVisible(), 'deck choices missing');
assert(await page.getByTestId('seed-input').isVisible(), 'seed input missing');
await page.getByTestId('seed-input').fill('20261112');
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.getByTestId('game-shell').getAttribute('data-phase')) === 'blind', 'game did not start');
assert((await page.locator('.hand .pcard').count()) === 8, 'eight-card hand missing');
assert((await page.getByTestId('score-value').innerText()) === '0', 'score did not start at zero');

// Hint with a reason and highlighted cards.
await page.getByTestId('hint').click();
await page.waitForTimeout(200);
assert((await page.locator('.pcard.hint').count()) > 0, 'hint cards missing');
const hintToast = await page.locator('.toast').innerText();
assert(/pays|clears/i.test(hintToast), `hint reason missing: ${hintToast}`);
assert((await page.getByTestId('hand-preview').innerText()).length > 0, 'hand preview missing');

// Play, score, undo.
await page.getByTestId('play').click();
await page.waitForTimeout(250);
const scored = Number((await page.getByTestId('score-value').innerText()).replace(/,/g, ''));
assert(scored > 0, 'playing did not score');
assert((await page.getByTestId('breakdown').isVisible()), 'score breakdown missing');
await page.getByTestId('undo').click();
await page.waitForTimeout(200);
assert((await page.getByTestId('score-value').innerText()) === '0', 'undo did not restore the score');
assert((await page.locator('.hand .pcard').count()) === 8, 'undo did not restore the hand');

// Keyboard path: 1 selects, P plays, U undoes.
await page.keyboard.press('1');
await page.waitForTimeout(80);
assert((await page.getByTestId('selected-count').innerText()).includes('1'), 'number key did not select');
await page.keyboard.press('p');
await page.waitForTimeout(200);
assert(Number((await page.getByTestId('score-value').innerText()).replace(/,/g, '')) > 0, 'P did not play');
await page.keyboard.press('u');
await page.waitForTimeout(200);
assert((await page.getByTestId('score-value').innerText()) === '0', 'U did not undo');

// Discard, then autosave and resume.
await page.locator('.hand .pcard').first().click();
await page.getByTestId('discard').click();
await page.waitForTimeout(200);
assert((await page.locator('.hand .pcard').count()) === 8, 'discard did not refill the hand');
const discardsBefore = await page.locator('.discard-pip').count();
assert(discardsBefore === 2, `discard count wrong: ${discardsBefore}`);
await page.locator('.hand .pcard').first().click();
await page.getByTestId('play').click();
await page.waitForTimeout(200);
assert(Number((await page.getByTestId('score-value').innerText()).replace(/,/g, '')) > 0, 'second play did not score');
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('save-continue').isVisible(), 'autosave continue missing');
await page.getByTestId('save-continue').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.getByTestId('game-shell').getAttribute('data-phase')) === 'blind', 'resume did not return to the blind');
assert((await page.locator('.hand .pcard').count()) === 8, 'resume lost the hand');

// Clear the real blind with hints, then enter the real shop and advance.
for (let attempt = 0; attempt < 4; attempt += 1) {
  if ((await page.getByTestId('blind-result').count()) > 0) break;
  await page.getByTestId('hint').click();
  await page.getByTestId('play').click();
  await page.waitForTimeout(220);
}
assert(await page.getByTestId('blind-result').isVisible(), 'real blind did not resolve');
assert((await page.getByTestId('blind-result').innerText()).includes('Blind cleared'), 'real blind was not cleared');
await page.getByTestId('continue').click();
await page.waitForSelector('[data-testid="shop"]');
assert(await page.getByTestId('shop').isVisible(), 'real shop did not open');
await page.getByTestId('leave-shop').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.getByTestId('game-shell').getAttribute('data-blind-index')) === '1', 'next blind did not start');

// Hot-seat privacy cover and pass to the next seat.
await page.getByRole('button', { name: /Home/ }).click();
await page.waitForTimeout(150);
await page.getByTestId('start-hotseat').click();
await page.getByTestId('players-2').click();
await page.getByTestId('seed-input').fill('20261112');
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="handoff"]');
assert((await page.locator('.hand .pcard').count()) === 0, 'hot-seat hand leaked before reveal');
await page.getByTestId('show-hand').click();
await page.waitForSelector('[data-testid="game-shell"]');
assert((await page.locator('.hand .pcard').count()) === 8, 'hot-seat hand missing after reveal');
await playFourSingles(page);
assert(await page.getByTestId('blind-result').isVisible(), 'hot-seat blind did not resolve');
await page.getByTestId('continue').click();
await page.waitForSelector('[data-testid="handoff"]');
assert((await page.locator('.hand .pcard').count()) === 0, 'next hot-seat hand leaked');

// Rival table: human plus two AI rivals play the same blind and compare.
await page.getByRole('button', { name: /Home/ }).click();
await page.waitForTimeout(150);
await page.getByTestId('start-rivals').click();
await page.getByTestId('level-hard').click();
await page.getByTestId('rivals-2').click();
await page.getByTestId('seed-input').fill('20261112');
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="game-shell"]');
await playFourSingles(page);
await page.getByTestId('continue').click();
await page.waitForSelector('[data-testid="compare"]', { timeout: 15000 });
assert((await page.locator('[data-testid="compare-row"]').count()) === 3, 'rival comparison missing seats');
assert(/loses a heart|Tied at the bottom/.test(await page.getByTestId('compare').innerText()), 'rival verdict missing');
await page.getByTestId('continue-compare').click();
await page.waitForSelector('[data-testid="shop"]');
assert(await page.getByTestId('shop').isVisible(), 'rival table did not reach shop');

// Record screen from a seeded family record.
await page.evaluate(() => {
  localStorage.setItem('familyarcade.jokers-table.record', JSON.stringify({
    runs: 7,
    wins: 4,
    losses: 3,
    bestScore: 18420,
    bestAnte: 6,
    byMode: { solo: 3, rivals: 1, hotseat: 2, lan: 1 },
    recent: [
      { mode: 'solo', result: 'win', score: 18420, ante: 6, at: Date.UTC(2026, 10, 10) },
      { mode: 'lan', result: 'loss', score: 9200, ante: 4, at: Date.UTC(2026, 10, 11) },
    ],
  }));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('stats').click();
assert((await page.getByTestId('record-matches').innerText()) === '7', 'record total missing');
assert((await page.locator('.recent-row').count()) === 2, 'recent record rows missing');
assert(await page.getByTestId('clear-record').isVisible(), 'clear record missing');

// Shop demo: buy a joker, then buy an enhancement and choose a card.
await page.goto(`${BASE}/?demo=shop`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="shop"]');
assert((await page.locator('[data-testid="offer"]').count()) === 3, 'shop offers missing');
const firstOffer = page.locator('.offer-card').nth(0);
await firstOffer.getByTestId('buy-offer').click();
await page.waitForTimeout(200);
assert((await page.locator('[data-testid="joker-sundial"]').count()) >= 1, 'bought joker missing');
const thirdOffer = page.locator('.offer-card').nth(2);
await thirdOffer.getByTestId('buy-offer').click();
await page.waitForSelector('[data-testid="deck-picker"]');
assert((await page.locator('[data-testid="deck-card"]').count()) === 52, 'deck picker missing cards');
await page.locator('[data-testid="deck-card"]').first().click();
await page.waitForTimeout(200);
assert((await page.getByTestId('shop').innerText()).includes('Enhanced cards 1'), 'enhancement was not applied');

// Compare demo and continuation to shop.
await page.goto(`${BASE}/?demo=compare`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="compare"]');
assert((await page.locator('[data-testid="compare-row"]').count()) === 3, 'compare rows missing');
assert(/loses a heart|Tied at the bottom/.test(await page.getByTestId('compare').innerText()), 'compare verdict missing');
await page.getByTestId('continue-compare').click();
await page.waitForSelector('[data-testid="shop"]');
assert(await page.getByTestId('shop').isVisible(), 'compare did not continue to shop');

// End demo.
await page.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="end"]');
assert(await page.getByTestId('play-again').isVisible(), 'end screen action missing');

// Chinese UI: no English words beyond the language switch.
const zh = await makePage('zh');
await zh.goto(BASE, { waitUntil: 'networkidle' });
assert((await zh.locator('h1').innerText()).includes('小丑牌桌'), 'Chinese title missing');
await startSolo(zh);
const chineseText = (await zh.getByTestId('game-shell').innerText()).replace('English', '');
const forbidden = /\b(Solo|Run|Rivals|Hot-seat|LAN|Shop|Rules|Family|Record|Home|Back|Play|Discard|Hint|Undo|Ante|Blind|Boss|Score|Money|Hands|Discards|Chips|Mult|Target|Seed|Jokers|Empty|Round|Total|Best|Final|Continue|Sound|Motion)\b/;
assert(!forbidden.test(chineseText), `English leaked into Chinese UI: ${chineseText.match(forbidden)?.[0]}`);

// Mobile layout.
const mobile = await makePage('en', {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await startSolo(mobile);
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');
assert((await mobile.locator('.hand .pcard').count()) === 8, 'mobile hand missing');
const cardBox = await mobile.locator('.hand .pcard').first().boundingBox();
assert(Boolean(cardBox && cardBox.width >= 30), `mobile card too small: ${cardBox?.width}`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`E2E OK — ${checks} checks: solo, hint, undo, keyboard, discard, autosave, hot-seat privacy, rivals, record, shop, compare, end, Chinese UI, mobile`);
