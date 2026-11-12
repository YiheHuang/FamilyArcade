import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5224';
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

await page.addInitScript(() => localStorage.setItem('familyarcade.lang', 'en'));
await page.goto(BASE, { waitUntil: 'networkidle' });

const englishBody = await page.locator('body').innerText();
assert(!/[\u4e00-\u9fff]/.test(englishBody.replace('中文', '')), 'English home contains Chinese');
assert(await page.getByRole('heading', { name: "Liar's Dice" }).isVisible(), 'home title missing');

// Hot-seat: private cup, bid, next-seat gate, undo and a reasoned hint.
await page.getByTestId('start-local').click();
await page.getByRole('button', { name: /^3$/ }).click();
await page.getByTestId('toggle-spot').click();
await page.getByTestId('begin-game').click();
await page.waitForSelector('.privacy-gate', { timeout: 10000 });
assert((await page.locator('.dice-tray .die').count()) === 0, 'hot-seat dice leaked before lift');
await page.getByTestId('lift-cup').click();
await page.waitForTimeout(120);
assert((await page.locator('.dice-tray .die').count()) === 5, 'hot-seat hand missing after lift');
// The keyboard path is a complete path: quantity, face, raise.
await page.keyboard.press(']');
await page.keyboard.press('2');
await page.keyboard.press('r');
await page.waitForSelector('.privacy-gate', { timeout: 10000 });
const keyboardBid = await page.getByTestId('current-bid').evaluate((node) => ({
  quantity: node.getAttribute('data-quantity'),
  face: node.getAttribute('data-face'),
}));
assert(keyboardBid.quantity === '2' && keyboardBid.face === '2', `keyboard bid failed: ${JSON.stringify(keyboardBid)}`);
assert((await page.locator('.dice-tray .die').count()) === 0, 'next hot-seat hand leaked');
await page.getByTestId('undo').click();
await page.waitForTimeout(200);
assert(await page.locator('.privacy-gate').isVisible(), 'undo did not return to the previous seat');
await page.getByTestId('lift-cup').click();
await page.getByTestId('hint').click();
await page.waitForSelector('[data-testid="hint-card"]', { timeout: 5000 });
assert((await page.getByTestId('hint-card').innerText()).length > 20, 'hint reason missing');
const hintAction = await page.getByTestId('hint-card').getAttribute('data-action');
if (hintAction === 'bid') {
  await page.getByTestId('raise').click();
} else if (hintAction === 'challenge') {
  await page.getByTestId('challenge').click();
} else {
  await page.getByTestId('spot').click();
}
await page.waitForTimeout(300);

// Autosave and resume.
await page.locator('.game-top .back').click();
await page.waitForSelector('[data-testid="continue-game"]', { timeout: 5000 });
await page.getByTestId('continue-game').click();
await page.waitForTimeout(250);
assert(await page.locator('.game-shell').isVisible(), 'resume did not return to the table');
await page.locator('.game-top .back').click();

// Solo: finish a real two-player game by following the hint policy.
await page.getByTestId('start-solo').click();
await page.getByRole('button', { name: /^2$/ }).click();
await page.getByTestId('begin-game').click();
await page.waitForTimeout(500);

let humanActions = 0;
for (let step = 0; step < 500; step += 1) {
  if (await page.getByTestId('result-panel').isVisible().catch(() => false)) break;
  if (await page.getByTestId('reveal-panel').isVisible().catch(() => false)) {
    await page.getByTestId('next-round').click();
    await page.waitForTimeout(280);
    continue;
  }
  const hintButton = page.getByTestId('hint');
  if (!(await hintButton.isEnabled().catch(() => false))) {
    await page.waitForTimeout(220);
    continue;
  }
  await hintButton.click();
  await page.waitForTimeout(120);
  const card = page.getByTestId('hint-card');
  if (!(await card.count())) {
    await page.waitForTimeout(200);
    continue;
  }
  const action = await card.getAttribute('data-action');
  if (action === 'bid') {
    await page.getByTestId('raise').click();
  } else if (action === 'challenge') {
    await page.getByTestId('challenge').click();
  } else {
    await page.getByTestId('spot').click();
  }
  humanActions += 1;
  await page.waitForTimeout(320);
}
assert(await page.getByTestId('result-panel').isVisible(), `solo game did not finish (${humanActions} actions)`);
assert((await page.getByTestId('result-panel').innerText()).length > 12, 'result panel empty');
const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.liars-dice.record') || '{}'),
);
assert(record.games === 1, `family record missing (${JSON.stringify(record)})`);
assert(record.byMode?.ai === 1, 'AI mode not recorded');
assert(Array.isArray(record.recent) && record.recent.length === 1, 'recent game not recorded');
assert(record.recent[0].playerCount === 2, 'winner order not recorded');

// Record screen: stats, recent game and the clear confirmation.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Family record/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
assert((await page.locator('.tally-list li').count()) >= 1, 'winner tally missing');
await page.getByRole('button', { name: /Clear record/ }).click();
assert(await page.getByRole('button', { name: /Confirm clear/ }).isVisible(), 'clear confirm missing');
await page.getByRole('button', { name: /Keep record/ }).click();
await page.locator('.stats-shell .back').click();

// Rules: twelve lines, both table options and controls.
await page.getByRole('button', { name: /Rules/ }).click();
assert((await page.locator('.rules-list li').count()) === 12, 'rules list missing');
const rulesText = await page.locator('.rules-screen, .narrow-shell').innerText();
assert(/Spot on/.test(rulesText), 'spot-on rule missing');
assert(/Ones wild/.test(rulesText), 'wild-one rule missing');
await page.getByRole('button', { name: /Close/ }).click();

// Language switch is the only intentional cross-language control.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(200);
assert((await page.locator('h1').innerText()).includes('吹牛骰'), 'Chinese switch failed');
const chineseBody = await page.locator('body').innerText();
assert(!/[A-Za-z]/.test(chineseBody.replace('English', '')), 'Chinese home contains English words');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(200);
assert((await page.locator('h1').innerText()).includes("Liar's Dice"), 'English switch failed');

// Mobile layout and a real touch bid.
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
let overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByTestId('start-local').click();
await mobile.getByRole('button', { name: /^4$/ }).click();
await mobile.getByTestId('begin-game').click();
await mobile.waitForSelector('.privacy-gate', { timeout: 10000 });
overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile gate overflows by ${overflow}px`);
await mobile.getByTestId('lift-cup').click();
await mobile.waitForTimeout(150);
assert((await mobile.locator('.dice-tray .die').count()) === 5, 'mobile hand missing');
overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile game overflows by ${overflow}px`);
await mobile.getByTestId('hint').click();
await mobile.waitForSelector('[data-testid="hint-card"]', { timeout: 5000 });
const mobileAction = await mobile.getByTestId('hint-card').getAttribute('data-action');
if (mobileAction === 'bid') {
  await mobile.getByTestId('raise').click();
} else if (mobileAction === 'challenge') {
  await mobile.getByTestId('challenge').click();
} else {
  await mobile.getByTestId('spot').click();
}
await mobile.waitForTimeout(350);
assert(await mobile.getByTestId('current-bid').isVisible(), 'mobile bid did not reach the table');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  `E2E OK — hot-seat privacy, bid, undo, reasoned hint, autosave, full AI game (${humanActions} human actions), record, stats, rules, language, mobile`,
);
