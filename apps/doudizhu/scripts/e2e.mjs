import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5216';
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
    localStorage.removeItem('familyarcade.doudizhu.save');
    localStorage.removeItem('familyarcade.doudizhu.record');
    sessionStorage.setItem('familyarcade.e2e.init', '1');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

assert((await page.locator('h1').innerText()).includes('Dou Dizhu'), 'English title missing');
assert((await page.locator('.mast-actions').innerText()).includes('中文'), 'language switch missing');
assert(!(await page.locator('.mast-actions').innerText()).includes('English'), 'English screen shows the EN switch');
await page.screenshot({ path: 'docs/screenshots/en/home.png' });

// Solo: setup, four levels, bid three, play a hinted combination.
await page.getByTestId('start-ai').click();
assert((await page.locator('.level-card').count()) === 4, 'expected four AI levels');
await page.getByTestId('level-hard').click();
await page.screenshot({ path: 'docs/screenshots/en/setup.png' });
await page.getByTestId('begin').click();
await page.waitForSelector('[data-testid="bid-3"]', { timeout: 10000 });
assert((await page.locator('.hand .playing-card').count()) === 17, 'bid hand should hold 17 cards');
await page.screenshot({ path: 'docs/screenshots/en/game-bid.png' });
await page.getByTestId('bid-3').click();
await page.waitForFunction(
  () => document.querySelector('.game-shell')?.getAttribute('data-phase') === 'playing' &&
    document.querySelector('.game-shell')?.getAttribute('data-turn') === '0',
  null,
  { timeout: 10000 },
);
assert((await page.locator('.hand .playing-card').count()) === 20, 'landlord should hold 20 cards');
await page.getByTestId('hint').click();
await page.waitForTimeout(250);
const hintToast = await page.locator('.toast').innerText();
assert(hintToast.length > 8, 'reasoned hint text missing');
assert((await page.locator('.hand .playing-card.is-selected').count()) > 0, 'hint did not select cards');
await page.screenshot({ path: 'docs/screenshots/en/game-hint.png' });
await page.getByTestId('play').click();
await page.waitForFunction(
  () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '0' &&
    document.querySelector('.game-shell')?.getAttribute('data-phase') === 'playing',
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(250);
await page.screenshot({ path: 'docs/screenshots/en/game.png' });

// Undo returns to the human decision before the play.
await page.getByTestId('undo').click();
await page.waitForTimeout(250);
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'undo did not return to seat 0');
assert((await page.locator('.hand .playing-card').count()) === 20, 'undo did not restore the hand');
await page.getByTestId('hint').click();
await page.waitForTimeout(150);
await page.getByTestId('play').click();
await page.waitForTimeout(450);

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('continue').isVisible(), 'continue card missing');
await page.getByTestId('continue').click();
await page.waitForTimeout(300);
assert(await page.locator('.game-shell').isVisible(), 'resume did not open the table');

// Hot-seat privacy: cover, reveal, bid, cover again, play.
await page.locator('.game-top .back').click();
await page.getByTestId('start-local').click();
await page.waitForSelector('[data-testid="privacy-cover"]', { timeout: 10000 });
assert((await page.locator('.hand .playing-card').count()) === 0, 'covered hand leaked into the DOM');
await page.getByTestId('reveal').click();
await page.waitForTimeout(150);
assert((await page.locator('.hand .playing-card').count()) === 17, 'hot-seat hand should be 17');
await page.getByTestId('bid-3').click();
await page.waitForTimeout(250);
assert(await page.getByTestId('privacy-cover').isVisible(), 'second seat was not covered after bidding');
await page.getByTestId('reveal').click();
await page.waitForTimeout(150);
assert((await page.locator('.hand .playing-card').count()) === 20, 'hot-seat landlord should hold 20');
await page.getByTestId('hint').click();
await page.waitForTimeout(150);
await page.getByTestId('play').click();
await page.waitForTimeout(250);
assert(await page.getByTestId('privacy-cover').isVisible(), 'next hot-seat turn was not covered');

// Keyboard path: reveal, bid with 3, reveal, select card 1, Enter plays.
await page.keyboard.press('Escape');
await page.getByTestId('start-local').click();
await page.getByTestId('reveal').click();
await page.keyboard.press('3');
await page.waitForTimeout(220);
assert(await page.getByTestId('privacy-cover').isVisible(), 'keyboard bid did not advance');
await page.getByTestId('reveal').click();
await page.waitForTimeout(150);
await page.keyboard.press('1');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
assert(await page.getByTestId('privacy-cover').isVisible(), 'keyboard play did not advance');

// A valid finished round fixture renders the result and scoring.
await page.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="result"]', { timeout: 10000 });
const resultText = await page.getByTestId('result').innerText();
assert(/Landlord|Farmers/i.test(resultText) && /Stake/i.test(resultText), 'result panel incomplete');
await page.screenshot({ path: 'docs/screenshots/en/game-over.png' });
await page.getByTestId('result').getByRole('button', { name: 'Home' }).click();
await page.waitForTimeout(200);

// Seed a family record and read the record screen.
await page.evaluate(() => {
  localStorage.setItem('familyarcade.doudizhu.record', JSON.stringify({
    games: 7,
    landlordWins: 4,
    farmerWins: 3,
    totalStake: 74,
    bestStake: 24,
    byMode: { ai: 3, local: 2, lan: 2 },
    lastWinner: 'farmers',
    recent: [
      { side: 'farmers', winnerSeat: 2, stake: 12, bombs: 2, spring: true, mode: 'lan', at: Date.UTC(2026, 10, 11) },
      { side: 'landlord', winnerSeat: 0, stake: 6, bombs: 1, spring: false, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 10) },
      { side: 'farmers', winnerSeat: 1, stake: 3, bombs: 0, spring: false, mode: 'local', at: Date.UTC(2026, 10, 8) },
    ],
  }));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('stats').click();
await page.waitForTimeout(200);
assert((await page.locator('.stat-card').first().innerText()).includes('7'), 'family record games missing');
assert((await page.locator('.recent-row').count()) === 3, 'family record recent rows missing');
await page.screenshot({ path: 'docs/screenshots/en/stats.png' });

// Rules are bilingual and complete.
await page.locator('.stats-shell .back').click();
await page.getByTestId('rules').click();
await page.waitForTimeout(200);
assert((await page.locator('.rule-card').count()) >= 10, 'rules cards missing');
await page.screenshot({ path: 'docs/screenshots/en/rules.png' });

// LAN hub renders both host and guest paths.
await page.locator('.rules-shell .back').click();
await page.getByTestId('start-lan').click();
await page.waitForTimeout(250);
assert(await page.getByTestId('lan-create').isVisible(), 'LAN host card missing');
await page.screenshot({ path: 'docs/screenshots/en/lan.png' });
await page.locator('.lan-shell .back').click();

// Mobile: privacy and hand still usable at 390×844.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(`mobile: ${message.text()}`);
});
mobile.on('pageerror', (error) => errors.push(`mobile: ${String(error)}`));
await mobile.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByTestId('start-local').click();
await mobile.getByTestId('reveal').click();
await mobile.getByTestId('bid-3').click();
await mobile.getByTestId('reveal').click();
await mobile.waitForTimeout(200);
assert(await mobile.locator('.hand').isVisible(), 'mobile hand missing');
assert((await mobile.locator('.hand .playing-card').count()) === 20, 'mobile landlord hand incomplete');
await mobile.screenshot({ path: 'docs/screenshots/en/game-mobile.png' });

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — solo, bidding, landlord hand, hint reason, undo, autosave, hot-seat privacy, keyboard, result, record, rules, LAN hub, mobile');
