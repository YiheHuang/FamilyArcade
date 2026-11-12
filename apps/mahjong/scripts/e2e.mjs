import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5221';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitForHumanOrClaim(page, timeout = 25000) {
  await page.waitForFunction(() => {
    const shell = document.querySelector('.game-shell');
    if (!shell) return false;
    if (shell.getAttribute('data-phase') === 'over') return true;
    if (document.querySelector('[data-testid="claim-panel"]')) return true;
    return (
      shell.getAttribute('data-phase') === 'discard' &&
      shell.getAttribute('data-turn') === '0' &&
      document.querySelectorAll('.hand .hand-tile').length === 14
    );
  }, null, { timeout });
}

async function settleHuman(page) {
  for (let step = 0; step < 12; step += 1) {
    await waitForHumanOrClaim(page);
    const phase = await page.locator('.game-shell').getAttribute('data-phase');
    if (phase === 'over') return;
    if (await page.getByTestId('claim-panel').isVisible().catch(() => false)) {
      const pass = page.getByTestId('claim-pass');
      if (await pass.isVisible().catch(() => false)) {
        await pass.click();
        await page.waitForTimeout(200);
        continue;
      }
    }
    return;
  }
  throw new Error('human state did not settle');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('familyarcade.e2e.init')) {
    localStorage.removeItem('familyarcade.mahjong.save');
    localStorage.removeItem('familyarcade.mahjong.record');
    sessionStorage.setItem('familyarcade.e2e.init', '1');
  }
});
await page.goto(`${BASE}/?seed=42`, { waitUntil: 'networkidle' });

assert((await page.locator('h1').innerText()).trim() === 'Mahjong', 'home title missing');
assert(await page.getByTestId('start-ai').isVisible(), 'solo button missing');
assert(await page.getByTestId('start-local').isVisible(), 'hot-seat button missing');
assert(await page.getByTestId('start-lan').isVisible(), 'LAN button missing');

// Solo table: a real deal, a reasoned hint, a discard and undo.
await page.getByTestId('start-ai').click();
assert(await page.getByTestId('level-hard').isVisible(), 'AI levels missing');
await page.getByTestId('level-hard').click();
await page.getByTestId('begin').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.hand .hand-tile').count()) === 14, 'dealer should hold fourteen tiles');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'human dealer should start');

await page.getByTestId('hint').click();
await page.waitForTimeout(250);
assert((await page.locator('.hand-tile.hint').count()) === 1, 'hint tile missing');
const hintToast = await page.getByTestId('toast').innerText();
assert(/Discard|Win|Kong|Pong|Chow|Pass|shanten|fan/i.test(hintToast), `hint reason missing: ${hintToast}`);

await page.keyboard.press('1');
await page.waitForTimeout(120);
assert((await page.locator('.hand-tile.selected').count()) === 1, 'keyboard did not select a tile');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await settleHuman(page);
assert((await page.locator('.hand .hand-tile').count()) === 14, 'human did not draw back to fourteen');
assert((await page.getByTestId('undo').isEnabled()), 'undo should be available after a turn');

await page.getByTestId('undo').click();
await page.waitForTimeout(300);
assert((await page.locator('.hand .hand-tile').count()) === 14, 'undo did not restore the hand');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'undo did not restore the human turn');

// Keyboard discard, then undo again.
await page.keyboard.press('2');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await settleHuman(page);
await page.keyboard.press('u');
await page.waitForTimeout(250);
assert((await page.locator('.hand .hand-tile').count()) === 14, 'U did not undo');

// Autosave and resume.
await page.keyboard.press('1');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('save-continue').isVisible(), 'continue card missing after reload');
await page.getByTestId('save-continue').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.game-shell').getAttribute('data-phase')) !== 'over', 'resume restored a finished hand');

// Hot-seat privacy: the next seat sees a covered hand.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByTestId('start-local').click();
await page.waitForSelector('[data-testid="privacy-cover"]');
assert((await page.locator('.hand .hand-tile').count()) === 0, 'hot-seat leaked a hand before reveal');
await page.getByTestId('reveal').click();
await page.waitForTimeout(150);
assert((await page.locator('.hand .hand-tile').count()) === 14, 'hot-seat reveal failed');
await page.locator('.hand .hand-tile').first().click();
await page.getByTestId('discard').click();
await page.waitForTimeout(300);
assert(await page.getByTestId('privacy-cover').isVisible(), 'next seat cover missing');
assert((await page.locator('.hand .hand-tile').count()) === 0, 'next seat hand leaked');

// Chinese screen: visible prose is Chinese, with only the language switch and tiles in another script.
await page.getByTestId('language').click();
await page.waitForTimeout(250);
assert((await page.locator('.game-id strong').innerText()).includes('麻将'), 'Chinese game title missing');
const chineseText = (await page.locator('body').innerText()).replace('English', '');
const forbidden =
  /\b(FAMILY|Home|Solo|Four|Same|Rules|Family|Record|Hands|Wins|Draws|Highest|Hint|Undo|Discard|Sound|Motion|Computer|Dealer|Wall|Round|East|South|West|North|Pass|Pong|Chow|Kong|Self|Concealed|Added|Minimum|Fan|Seat|Table|Turn|Reveal|Hidden|Private|Waiting|Choose|Level|Start|Join|Host|Guest|Copy|Scan|Room|Name)\b/;
assert(!forbidden.test(chineseText), `English leaked into Chinese UI: ${chineseText.match(forbidden)?.[0]}`);
await page.getByTestId('language').click();
await page.waitForTimeout(150);

// Family record.
await page.evaluate(() => {
  const recent = [
    { winner: 0, fan: 8, result: 'win', mode: 'ai', at: Date.UTC(2026, 10, 3) },
    { winner: 2, fan: 4, result: 'win', mode: 'local', at: Date.UTC(2026, 10, 5) },
    { winner: null, fan: 0, result: 'draw', mode: 'lan', at: Date.UTC(2026, 10, 8) },
  ];
  localStorage.setItem(
    'familyarcade.mahjong.record',
    JSON.stringify({
      games: 7,
      draws: 1,
      wins: [4, 1, 2, 0],
      byMode: { ai: 3, local: 2, lan: 2 },
      highestFan: 13,
      lastWinner: 2,
      recent,
    }),
  );
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('stats').click();
assert((await page.getByTestId('record-games').innerText()).includes('7'), 'record total missing');
assert((await page.locator('.recent-row').count()) === 3, 'recent hands missing');
assert(await page.getByRole('button', { name: /Clear record/ }).isVisible(), 'clear record missing');

// Result sheet from a valid completed fixture.
await page.goto(`${BASE}/?demo=win`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="result-sheet"]');
assert((await page.locator('.result-card h2').innerText()).includes('win'), 'win sheet missing');
assert((await page.locator('.fan-row').count()) >= 3, 'fan rows missing');
assert(await page.getByTestId('play-again').isVisible(), 'play again missing');
assert(await page.getByTestId('change-level').isVisible(), 'change level missing');
await page.getByTestId('play-again').click();
await page.waitForTimeout(300);
assert((await page.locator('.game-shell').getAttribute('data-phase')) === 'discard', 'play again did not deal');
assert((await page.locator('.hand .hand-tile').count()) === 14, 'play again did not deal a hand');

// Claim fixture and a real claim pass.
await page.goto(`${BASE}/?demo=claim`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="claim-panel"]');
assert(await page.getByTestId('claim-peng').isVisible(), 'claim pong missing');
await page.getByTestId('claim-pass').click();
await page.waitForTimeout(400);
assert(!(await page.getByTestId('claim-panel').isVisible().catch(() => false)), 'claim panel did not close');

// Mobile: no overflow, a real hand and a real table.
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
  localStorage.removeItem('familyarcade.mahjong.save');
  localStorage.removeItem('familyarcade.mahjong.record');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByTestId('start-local').click();
await mobile.waitForSelector('[data-testid="privacy-cover"]');
await mobile.getByTestId('reveal').click();
await mobile.waitForTimeout(180);
assert((await mobile.locator('.hand .hand-tile').count()) === 14, 'mobile hand missing');
assert(await mobile.locator('.mahjong-table').isVisible(), 'mobile table missing');
const tileBox = await mobile.locator('.hand .hand-tile').first().boundingBox();
assert(tileBox && tileBox.width >= 28, `mobile tile too small: ${tileBox?.width}`);
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — solo deal, hint reason, draw/discard, undo, keyboard, autosave, hot-seat privacy, Chinese UI, record, win/claim fixtures, mobile');
