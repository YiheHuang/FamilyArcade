import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5205';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const blankHand = () => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });
const piece = (side, type, promoted = false) => ({ side, type, promoted });

function blankState(turn = 'b') {
  return {
    board: Array(81).fill(null),
    hands: { b: blankHand(), w: blankHand() },
    turn,
    status: 'playing',
    winner: null,
    check: false,
    moves: [],
    lastMove: null,
    positionCounts: {},
    endReason: null,
  };
}

function saved(state, mode = 'local', level = 'normal') {
  return { version: 1, state, mode, level, savedAt: Date.now() };
}

function promotionState() {
  const state = blankState();
  state.board[76] = piece('b', 'K');
  state.board[4] = piece('w', 'K');
  state.board[31] = piece('b', 'P');
  return state;
}

function dropState() {
  const state = blankState();
  state.board[76] = piece('b', 'K');
  state.board[4] = piece('w', 'K');
  state.hands.b.G = 1;
  return state;
}

function mateState() {
  const state = blankState();
  state.board[76] = piece('b', 'K');
  state.board[4] = piece('w', 'K');
  state.board[2] = piece('b', 'G');
  state.board[6] = piece('b', 'G');
  state.board[21] = piece('b', 'G');
  state.board[23] = piece('b', 'G');
  state.board[12] = piece('b', 'R');
  return state;
}

async function seedPage(browser, seed, lang = 'en') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => console.log('PAGE ERROR', String(error)));
  await page.addInitScript(
    ({ langValue, payload }) => {
      localStorage.setItem('familyarcade.lang', langValue);
      localStorage.removeItem('familyarcade.shogi.save');
      localStorage.removeItem('familyarcade.shogi.record');
      if (payload) localStorage.setItem('familyarcade.shogi.save', JSON.stringify(payload));
    },
    { langValue: lang, payload: seed },
  );
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('familyarcade.shogi.save');
    localStorage.removeItem('familyarcade.shogi.record');
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Home: English only, no explanatory subtitle under the heading.
  assert((await page.locator('h1').innerText()) === 'Shogi', 'English title missing');
  assert((await page.locator('.subtitle').count()) === 0, 'explanatory subtitle should not be present');
  const homeText = (await page.locator('body').innerText()).replace('中文', '');
  assert(!/[\u4e00-\u9fff]/.test(homeText), 'Chinese text leaked into the English UI');

  // Local game: real moves for both sides.
  await page.getByRole('button', { name: /Two players/ }).click();
  assert((await page.locator('.cell').count()) === 81, 'board should have 81 squares');
  assert((await page.locator('.piece').count()) === 40, 'initial board should have 40 pieces');
  assert((await page.locator('.turn-copy strong').innerText()).includes('Black'), 'Black should move first');

  await page.locator('.cell').nth(58).click();
  assert((await page.locator('.cell.target').count()) === 1, 'pawn should have one forward target');
  await page.locator('.cell').nth(49).click();
  await page.waitForTimeout(120);
  assert((await page.locator('.turn-copy strong').innerText()).includes('White'), 'White turn not shown');

  await page.getByRole('button', { name: /^Undo$/ }).click();
  await page.waitForTimeout(120);
  assert((await page.locator('.turn-copy strong').innerText()).includes('Black'), 'undo failed');

  await page.getByRole('button', { name: /^Hint$/ }).click();
  await page.waitForTimeout(1200);
  assert((await page.locator('.cell.hint').count()) >= 1, 'hint highlight missing');
  assert((await page.locator('.toast').innerText()).length > 3, 'hint reason missing');

  // Keyboard path: move a pawn with arrows and Enter.
  await page.locator('.turn-copy strong').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert((await page.locator('.turn-copy strong').innerText()).includes('White'), 'keyboard move failed');

  // Solo game: AI replies, autosave survives reload.
  await page.getByRole('button', { name: /Home/ }).click();
  await page.getByRole('button', { name: /Play the computer/ }).click();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await page.getByRole('button', { name: /Begin/ }).click();
  await page.locator('.cell').nth(58).click();
  await page.locator('.cell').nth(49).click();
  await page.waitForFunction(
    () => document.querySelector('.turn-copy strong')?.textContent?.includes('Your move'),
    null,
    { timeout: 20000 },
  );
  assert((await page.locator('.piece').count()) === 40, 'AI move changed the piece count unexpectedly');
  assert((await page.locator('.cell.last-to').count()) === 1, 'AI last move marker missing');

  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'autosave card missing');
  await page.getByRole('button', { name: /Continue last game/ }).click();
  assert((await page.locator('.piece').count()) === 40, 'resumed game lost pieces');

  // Promotion dialog and promoted glyph.
  const promotePage = await seedPage(browser, saved(promotionState()));
  await promotePage.getByRole('button', { name: /Continue last game/ }).click();
  await promotePage.locator('.cell').nth(31).click();
  await promotePage.locator('.cell').nth(22).click();
  assert(await promotePage.locator('.promotion-dialog').isVisible(), 'promotion dialog missing');
  await promotePage.getByRole('button', { name: /^Promote$/ }).click();
  await promotePage.waitForTimeout(150);
  assert((await promotePage.locator('.piece.is-promoted').count()) === 1, 'promotion not applied');

  // Drop from hand.
  const dropPage = await seedPage(browser, saved(dropState()));
  await dropPage.getByRole('button', { name: /Continue last game/ }).click();
  assert((await dropPage.locator('.hand-piece').count()) === 1, 'hand piece missing');
  await dropPage.locator('.hand-piece').first().click();
  await dropPage.locator('.cell').nth(40).click();
  await dropPage.waitForTimeout(150);
  assert((await dropPage.locator('.cell').nth(40).locator('.piece').count()) === 1, 'drop failed');

  // Checkmate, family record and recent result.
  const matePage = await seedPage(browser, saved(mateState()));
  await matePage.getByRole('button', { name: /Continue last game/ }).click();
  await matePage.locator('.cell').nth(12).click();
  await matePage.locator('.cell').nth(13).click();
  await matePage.getByRole('button', { name: /Keep unpromoted/ }).click();
  await matePage.waitForTimeout(200);
  assert(await matePage.locator('.result-banner').isVisible(), 'checkmate banner missing');
  assert((await matePage.locator('.result-banner').innerText()).includes('Black wins'), 'winner missing');
  const record = await matePage.evaluate(() =>
    JSON.parse(localStorage.getItem('familyarcade.shogi.record') || '{}'),
  );
  assert(record.games === 1 && record.winsBlack === 1, 'record not updated');
  await matePage.getByRole('button', { name: /Home/ }).click();
  await matePage.getByRole('button', { name: /Family record/ }).click();
  assert(await matePage.locator('.stat-card.total').isVisible(), 'stats screen missing');
  assert((await matePage.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
  assert((await matePage.locator('.recent-row').count()) === 1, 'recent game missing');

  // Chinese screen: no Latin text other than the language switch.
  const zh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await zh.addInitScript(() => localStorage.setItem('familyarcade.lang', 'zh'));
  await zh.goto(BASE, { waitUntil: 'networkidle' });
  const zhText = (await zh.locator('body').innerText()).replace('English', '');
  assert(!/[A-Za-z]/.test(zhText), 'English text leaked into the Chinese UI');
  assert((await zh.locator('h1').innerText()) === '将棋', 'Chinese title missing');

  // Mobile layout: usable 9×9 board with real touch targets.
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
    localStorage.removeItem('familyarcade.shogi.save');
  });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
  await mobile.getByRole('button', { name: /Two players/ }).click();
  const boardBox = await mobile.locator('.board').boundingBox();
  assert(boardBox && boardBox.width > 300, `mobile board too narrow: ${boardBox?.width}`);
  const cellBox = await mobile.locator('.cell').first().boundingBox();
  assert(cellBox && cellBox.height >= 35, `mobile cell too small: ${cellBox?.height}`);
  await mobile.locator('.cell').nth(58).click();
  await mobile.locator('.cell').nth(49).click();
  await mobile.waitForTimeout(150);
  assert((await mobile.locator('.turn-copy strong').innerText()).includes('White'), 'mobile move failed');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  console.log('E2E OK — local, keyboard, hint, undo, AI, autosave, promotion, drop, mate, record, bilingual UI, mobile');
} finally {
  await browser.close();
}
