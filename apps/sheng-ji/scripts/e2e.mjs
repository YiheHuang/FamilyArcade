import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5223';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  if (!sessionStorage.getItem('sheng-ji-e2e-init')) {
    sessionStorage.setItem('sheng-ji-e2e-init', '1');
    localStorage.clear();
  }
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('h1').waitFor();

const englishHome = await page.locator('body').innerText();
assert(
  !/[\u4e00-\u9fff]/.test(englishHome.replace('中文', '')),
  'English home contains Chinese outside the language switch',
);
assert(await page.getByRole('heading', { name: 'Sheng Ji' }).isVisible(), 'home title missing');
assert(
  (await page.locator('.menu').innerText()).includes('Solo against the AI'),
  'solo menu item missing',
);

// Hot-seat: privacy curtain, hint, declare/pass, undo and autosave.
await page.getByRole('button', { name: /Four seats, one screen/ }).click();
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat gate missing');
assert((await page.locator('.hand .playing-card').count()) === 0, 'hot-seat hand leaked before reveal');
assert((await page.locator('.privacy-gate').innerText()).includes('Player 1'), 'wrong hot-seat player');
await page.getByRole('button', { name: /Show my hand/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.hand .playing-card').count()) > 0, 'hot-seat reveal did not show a hand');
await page.locator('.hint-button').click();
await page.waitForTimeout(160);
if (await page.locator('.declare-option.hinted').count()) {
  await page.locator('.declare-option.hinted').first().click();
} else {
  await page.locator('.pass-declare-button').click();
}
await page.waitForTimeout(400);
assert(await page.locator('.privacy-gate').isVisible(), 'next hot-seat gate missing');
assert((await page.locator('.privacy-gate').innerText()).includes('Player 2'), 'pass-the-device did not advance');
await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.undo-button').click();
await page.waitForTimeout(300);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat undo did not return to the previous seat');
assert((await page.locator('.privacy-gate').innerText()).includes('Player 1'), 'undo returned to the wrong seat');
assert((await page.locator('.hand .playing-card').count()) === 0, 'hot-seat undo leaked a hand');

await page.locator('.game-top .back').click();
await page.waitForTimeout(300);
assert(await page.getByRole('button', { name: /Continue the deal/ }).isVisible(), 'hot-seat autosave missing');
await page.getByRole('button', { name: /Continue the deal/ }).click();
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'resume did not restore privacy');
await page.locator('.game-top .back').click();
await page.waitForTimeout(250);

// Solo: finish a real deal by following the hint policy.
await page.getByRole('button', { name: /Solo against the AI/ }).click();
await page.locator('.level-card').nth(2).click();
await page.getByRole('button', { name: /Start the match/ }).click();
await page.waitForTimeout(500);

let humanActions = 0;
for (let step = 0; step < 420; step += 1) {
  if (await page.locator('.result-panel').isVisible().catch(() => false)) break;
  const hint = page.locator('.hint-button');
  if (!(await hint.isEnabled().catch(() => false))) {
    await page.waitForTimeout(180);
    continue;
  }
  await hint.click();
  await page.waitForTimeout(80);
  if (await page.locator('.declare-option.hinted').count()) {
    await page.locator('.declare-option.hinted').first().click();
    humanActions += 1;
  } else if (await page.locator('.declare-panel').count()) {
    await page.locator('.pass-declare-button').click();
    humanActions += 1;
  } else if (
    (await page.locator('.bury-panel').count()) > 0 &&
    (await page.locator('.bury-button').isEnabled().catch(() => false))
  ) {
    await page.locator('.bury-button').click();
    humanActions += 1;
  } else if (
    (await page.locator('.play-button').count()) > 0 &&
    (await page.locator('.play-button').isEnabled().catch(() => false))
  ) {
    await page.locator('.play-button').click();
    humanActions += 1;
  } else {
    await page.waitForTimeout(200);
    continue;
  }
  await page.waitForTimeout(180);
}
assert(await page.locator('.result-panel').isVisible(), `deal did not finish (${humanActions} human actions)`);
assert((await page.locator('.result-facts').innerText()).includes('points were in play'), 'deal result facts missing');
assert((await page.locator('.seat-badge').count()) === 4, 'table should show four seats');

const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.sheng-ji.record') || '{}'),
);
assert(record.deals === 1, `family record missing (${JSON.stringify(record)})`);
assert(record.byMode?.ai === 1, 'AI mode not recorded');
assert(record.recent?.[0]?.declarerPoints >= 0, 'deal summary not recorded');

// Next deal and autosave/resume after a reload.
await page.locator('.next-deal-button').click();
await page.waitForTimeout(700);
assert(/Deal 2/.test(await page.locator('.game-id').innerText()), 'next deal did not start');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('h1').waitFor();
assert(await page.getByRole('button', { name: /Continue the deal/ }).isVisible(), 'deal two was not saved');
await page.getByRole('button', { name: /Continue the deal/ }).click();
await page.waitForTimeout(350);
assert(/Deal 2/.test(await page.locator('.game-id').innerText()), 'resume lost deal two');

// Family record and rules.
await page.locator('.game-top .back').click();
await page.waitForTimeout(300);
await page.locator('.menu-links .text-button').nth(1).click();
await page.waitForTimeout(250);
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent deal missing');
assert((await page.locator('.tally-list li').count()) === 3, 'mode split missing');
await page.locator('.stats-shell .back').click();
await page.waitForTimeout(200);
await page.locator('.menu-links .text-button').nth(0).click();
await page.waitForTimeout(200);
assert((await page.locator('.rules-list li').count()) === 12, 'rules list missing');
assert((await page.locator('.score-row').count()) === 5, 'scoring table missing');
assert(/throw rule/i.test(await page.locator('.rules-extra').innerText()), 'throw rule missing');
await page.locator('.narrow-shell > .primary').click();
await page.waitForTimeout(200);

// The language switch is the only intentional cross-language control.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(250);
assert((await page.locator('h1').innerText()).includes('升级'), 'Chinese switch failed');
const chineseHome = await page.locator('body').innerText();
assert(!chineseHome.includes('Sheng Ji'), 'English title leaked into the Chinese UI');
assert(!chineseHome.includes('Solo against'), 'English menu leaked into the Chinese UI');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(250);
assert((await page.locator('h1').innerText()).includes('Sheng Ji'), 'English switch failed');

// Mobile layout and a real touch hint.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
mobile.setDefaultTimeout(15000);
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
mobile.on('pageerror', (error) => errors.push(String(error)));
await mobile.addInitScript(() => {
  if (!sessionStorage.getItem('sheng-ji-e2e-init')) {
    sessionStorage.setItem('sheng-ji-e2e-init', '1');
    localStorage.clear();
  }
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
await mobile.locator('h1').waitFor();
let overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Solo against the AI/ }).click();
await mobile.getByRole('button', { name: /Start the match/ }).click();
await mobile.waitForSelector('.felt', { timeout: 10000 });
overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile game overflows by ${overflow}px`);
const handBox = await mobile.locator('.hand').boundingBox();
assert(handBox && handBox.width > 300, `mobile hand too narrow: ${handBox?.width}`);
await mobile.waitForFunction(
  () => {
    const button = document.querySelector('.hint-button');
    return button instanceof HTMLButtonElement && !button.disabled;
  },
  null,
  { timeout: 15000 },
);
await mobile.locator('.hint-button').click();
await mobile.waitForTimeout(220);
const mobileSelected = await mobile.locator('.hand .playing-card.selected').count();
const mobileHintedDeclare = await mobile.locator('.declare-option.hinted').count();
assert(mobileSelected > 0 || mobileHintedDeclare > 0, 'mobile hint neither selected cards nor a declaration');
assert(
  (await mobile.locator('.hand .playing-card').count()) > 0,
  'mobile hand not rendered',
);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
console.log(
  `E2E OK — English-only home, hot-seat privacy/reveal/hint/undo/autosave, ${humanActions} solo actions, full deal, record, next deal, resume, stats, rules, language switch, mobile layout`,
);
process.exit(0);
