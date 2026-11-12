import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5208';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
}

async function open(viewport = { width: 1280, height: 900 }, lang = 'en') {
  const page = await browser.newPage({ viewport });
  watch(page);
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

async function clean(page) {
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.hearts.save');
    localStorage.removeItem('familyarcade.hearts.record');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function selectFirstThree(page) {
  const cards = page.locator('.hand-rack .playing-card');
  assert((await cards.count()) === 13, 'expected a thirteen-card hand');
  for (let index = 0; index < 3; index += 1) await cards.nth(index).click();
}

async function passSeat(page) {
  await page.locator('.privacy-card .primary').click();
  await selectFirstThree(page);
  await page.getByRole('button', { name: /Pass three cards/ }).click();
  await page.locator('.privacy-card').waitFor({ state: 'visible' });
}

const page = await open();
await clean(page);

// English copy has no Chinese except the language switch.
const englishText = (await page.locator('body').innerText()).replaceAll('中文', '');
assert(!/[\u3400-\u9fff]/.test(englishText), 'Chinese text found in the English UI');
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(200);
assert((await page.locator('html').getAttribute('lang')) === 'zh-CN', 'document language did not switch');
assert((await page.locator('h1').innerText()).includes('红心大战'), 'Chinese title missing');
const chineseText = (await page.locator('body').innerText()).replaceAll('English', '');
const latinWords = chineseText.match(/[A-Za-z]{2,}/g) ?? [];
assert(latinWords.length === 0, `English words found in the Chinese UI: ${latinWords.join(', ')}`);
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(150);

// Solo game: pass, hint, play, undo, autosave.
await page.getByRole('button', { name: /Solo against the computer/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.locator('.hand-rack').waitFor({ state: 'visible' });
await selectFirstThree(page);
await page.getByRole('button', { name: /Pass three cards/ }).click();
await page.locator('.pass-bar').waitFor({ state: 'detached', timeout: 15000 });
await page.waitForFunction(() => Boolean(document.querySelector('.hand-rack .playing-card.is-legal')), null, {
  timeout: 15000,
});
assert((await page.locator('.hand-rack .playing-card.is-legal').count()) > 0, 'no legal card on the human turn');

await page.getByRole('button', { name: /^Hint$/ }).click();
await page.waitForTimeout(350);
assert((await page.locator('.playing-card.is-hint').count()) === 1, 'hint did not highlight a card');
assert((await page.locator('.hint-note').innerText()).length > 0, 'hint reason missing');
await page.locator('.playing-card.is-hint').click();
await page.waitForTimeout(3500);
assert((await page.locator('.hand-rack .playing-card').count()) === 12, 'human card was not played');

await page.getByRole('button', { name: /^Undo$/ }).click();
await page.waitForTimeout(350);
assert((await page.locator('.hand-rack .playing-card').count()) === 13, 'undo did not restore the hand');
assert((await page.locator('.hand-rack .playing-card.is-legal').count()) > 0, 'undo did not return the human turn');

await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue the last game/ }).isVisible(), 'autosave card missing');
await page.getByRole('button', { name: /Continue the last game/ }).click();
await page.waitForTimeout(300);
assert(await page.locator('.hand-rack').isVisible(), 'resumed game did not open');

// Four-player hot-seat with a private curtain for each seat.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Four players, one screen/ }).click();
await page.locator('.privacy-card').waitFor({ state: 'visible' });
assert((await page.locator('.privacy-card h2').innerText()).includes('Player 1'), 'first privacy curtain missing');
await page.locator('.privacy-card .primary').click();
await selectFirstThree(page);
await page.getByRole('button', { name: /Pass three cards/ }).click();
await page.locator('.privacy-card').waitFor({ state: 'visible' });
assert((await page.locator('.privacy-card h2').innerText()).includes('Player 2'), 'second privacy curtain missing');

// Privacy-safe undo: return the device to the previous seat.
await page.locator('.privacy-undo').click();
await page.waitForTimeout(200);
assert((await page.locator('.privacy-card h2').innerText()).includes('Player 1'), 'privacy undo did not return to player one');
await page.locator('.privacy-card .primary').click();
await selectFirstThree(page);
await page.getByRole('button', { name: /Pass three cards/ }).click();
await passSeat(page);
await passSeat(page);
await page.locator('.privacy-card .primary').click();
assert((await page.locator('.hand-rack .playing-card').count()) === 13, 'hot-seat deal did not hold thirteen cards');
assert((await page.locator('.hand-rack .playing-card.is-legal').count()) >= 1, 'hot-seat leader has no legal card');

// A near-finished saved game records the result after the final card.
await page.getByRole('button', { name: /Home/ }).click();
await page.evaluate(async () => {
  const m = await import('/src/game/hearts.ts');
  let seed = 404;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let state = m.setup(rng, { scores: [100, 0, 0, 0] });
  while (state.phase === 'passing') {
    const seat = state.passSelections.findIndex((pick) => pick === null);
    state = m.passCards(state, seat, state.hands[seat].slice(0, 3)).state;
  }
  let guard = 0;
  while (state.playedCards.length < 48 && state.phase === 'playing' && guard < 80) {
    guard += 1;
    const legal = m.legalCards(state, state.turn);
    state = m.playCard(state, state.turn, legal[0]).state;
  }
  state = { ...state, turn: 0, leader: 0, trick: [], scores: [100, 0, 0, 0] };
  localStorage.setItem(
    'familyarcade.hearts.save',
    JSON.stringify({ version: 1, state, mode: 'ai', level: 'normal', savedAt: Date.now() }),
  );
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Continue the last game/ }).click();
await page.locator('.hand-rack').waitFor({ state: 'visible' });
assert((await page.locator('.hand-rack .playing-card').count()) === 1, 'near-end hand should have one card');
await page.locator('.hand-rack .playing-card.is-legal').first().click();
await page.locator('.result-overlay').waitFor({ state: 'visible', timeout: 15000 });
assert((await page.locator('.result-card h2').innerText()).includes('Game over'), 'game over dialog missing');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.hearts.record') || '{}'),
);
assert(savedRecord.games >= 1, 'record was not written');
assert(Array.isArray(savedRecord.wins) && savedRecord.wins.length === 4, 'record wins missing');
assert(Array.isArray(savedRecord.recent) && savedRecord.recent.length >= 1, 'record history missing');

// Mobile layout and privacy.
const mobile = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await clean(mobile);
await mobile.getByRole('button', { name: /Four players, one screen/ }).click();
await mobile.locator('.privacy-card .primary').click();
assert((await mobile.locator('.hand-rack .playing-card').count()) === 13, 'mobile hand missing');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert(overflow <= 1, `mobile layout overflows by ${overflow}px`);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — bilingual, solo pass, hint, play, undo, autosave, hot-seat privacy, privacy undo, record, mobile');
