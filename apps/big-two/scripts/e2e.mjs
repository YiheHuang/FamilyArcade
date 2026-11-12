import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5222';
const APP = `${BASE}/?seed=17&fast=1`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitHuman(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.hint-button');
      return (
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        !document.querySelector('.privacy-gate') &&
        !document.querySelector('.result-panel')
      );
    },
    null,
    { timeout },
  );
}

async function playHint(page) {
  await page.locator('.hint-button').click();
  await page.waitForTimeout(90);
  const hinted = page.locator('.hand .playing-card.hint');
  const count = await hinted.count();
  if (count > 0) {
    const ids = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of ids) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    await page.locator('.play-button').click();
    return true;
  }
  if (await page.locator('.pass-button').isEnabled().catch(() => false)) {
    await page.locator('.pass-button').click();
    return true;
  }
  return false;
}

async function finishGame(page) {
  for (let step = 0; step < 700; step += 1) {
    if (await page.locator('.result-panel').isVisible().catch(() => false)) return;
    const hint = page.locator('.hint-button');
    if (!(await hint.isEnabled().catch(() => false))) {
      await page.waitForTimeout(120);
      continue;
    }
    await playHint(page);
    await page.waitForTimeout(120);
  }
  throw new Error('game did not finish');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('big-two-e2e-ready')) {
    localStorage.removeItem('familyarcade.big-two.save');
    localStorage.removeItem('familyarcade.big-two.record');
    sessionStorage.setItem('big-two-e2e-ready', '1');
  }
});
await page.goto(APP, { waitUntil: 'networkidle' });

const englishBody = await page.locator('body').innerText();
assert(!/[\u4e00-\u9fff]/.test(englishBody.replace('中文', '')), 'English home contains Chinese');
assert(await page.getByRole('heading', { name: 'Big Two' }).isVisible(), 'home title missing');

// Solo setup and a real turn.
await page.getByRole('button', { name: /Solo against the AI/ }).click();
assert(await page.locator('.level-card').count() === 4, 'four AI levels missing');
await page.getByRole('button', { name: /^Easy/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForSelector('.felt', { timeout: 10000 });
assert((await page.locator('.seat').count()) === 4, 'solo table should have four seats');
assert((await page.locator('.hand .playing-card').count()) === 13, 'solo hand should hold thirteen cards');

// A hint marks legal cards (or a legal pass) and the toast explains why.
await waitHuman(page);
await page.locator('.hint-button').click();
await page.waitForTimeout(120);
assert(await page.locator('.toast').isVisible(), 'hint reason missing');
const hintCount = await page.locator('.hand .playing-card.hint').count();
const hintPass = await page.locator('.pass-button.hinted').count();
assert(hintCount > 0 || hintPass > 0, 'hint marked nothing');
const beforeHand = await page.locator('.hand .playing-card').count();
if (hintCount > 0) {
  const ids = await page.locator('.hand .playing-card.hint').evaluateAll((els) =>
    els.map((element) => element.getAttribute('data-card')),
  );
  for (const id of ids) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
  assert((await page.locator('.hand .playing-card.selected').count()) === ids.length, 'selection failed');
  await page.locator('.play-button').click();
  await page.waitForTimeout(300);
  const afterHand = await page.locator('.hand .playing-card').count();
  assert(afterHand === beforeHand - ids.length, 'human play did not shed the selected cards');
} else {
  await page.locator('.pass-button').click();
  await page.waitForTimeout(300);
  assert((await page.locator('.hand .playing-card').count()) === beforeHand, 'a pass changed the hand');
}

// Undo rewinds the human move and the AI replies.
await waitHuman(page);
await page.locator('.undo-button').click();
await page.waitForTimeout(250);
assert((await page.locator('.hand .playing-card').count()) === 13, 'undo did not restore the hand');
assert(await page.locator('.hand .playing-card.hint').count() === 0, 'undo kept the hint');

// Autosave survives a reload.
await page.locator('.game-top .back').click();
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue the game/ }).isVisible(), 'autosave missing');
await page.getByRole('button', { name: /Continue the game/ }).click();
await page.waitForSelector('.felt', { timeout: 10000 });
assert((await page.locator('.hand .playing-card').count()) === 13, 'resume lost the hand');

// Hot-seat privacy, reveal, hint, undo and the next curtain.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Hot-seat, one screen/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForSelector('.felt', { timeout: 10000 });
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat gate missing');
assert((await page.locator('.hand .playing-card').count()) === 0, 'hot-seat hand leaked before reveal');
await page.getByRole('button', { name: /Show my hand/ }).click();
assert((await page.locator('.hand .playing-card').count()) === 13, 'revealed hand missing');
await waitHuman(page);
await page.locator('.hint-button').click();
await page.waitForTimeout(100);
const hotHint = page.locator('.hand .playing-card.hint');
assert((await hotHint.count()) > 0 || (await page.locator('.pass-button.hinted').count()) > 0, 'hot-seat hint empty');
if ((await hotHint.count()) > 0) {
  const ids = await hotHint.evaluateAll((els) => els.map((element) => element.getAttribute('data-card')));
  for (const id of ids) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
  await page.locator('.play-button').click();
} else {
  await page.locator('.pass-button').click();
}
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'next hot-seat curtain missing');
await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.undo-button').click();
await page.waitForTimeout(200);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat undo did not return to the previous seat');

// Finish a full solo game with the hint policy and record it.
await page.locator('.game-top .back').click();
await page.getByRole('button', { name: /Solo against the AI/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForSelector('.felt', { timeout: 10000 });
await finishGame(page);
await page.waitForTimeout(200);
assert(await page.locator('.result-panel').isVisible(), 'result panel missing');
const resultText = await page.locator('.result-panel').innerText();
assert(/wins|You win/.test(resultText), 'winner line missing');
assert((await page.locator('.score-row').count()) === 4, 'score table should list four seats');
const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.big-two.record') || '{}'),
);
assert(record.games === 1, `family record missing (${JSON.stringify(record)})`);
assert(record.byMode?.ai === 1, 'AI mode not recorded');
assert(Array.isArray(record.recent) && record.recent.length === 1, 'recent game missing');
assert(typeof record.bestGain === 'number' && record.bestGain > 0, 'best gain missing');

// Stats, rules and the language switch.
await page.locator('.result-actions .text-button').click();
await page.getByRole('button', { name: /View record/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent row missing');
assert((await page.locator('.tally-list li').count()) >= 1, 'winner tally missing');
await page.locator('.stats-shell .back').click();
await page.getByRole('button', { name: /Rules/ }).click();
assert((await page.locator('.rules-list li').count()) === 10, 'rules list missing');
assert((await page.locator('.combo-row').count()) === 8, 'combination table missing');
await page.getByRole('button', { name: /Close/ }).click();
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(180);
assert((await page.locator('h1').innerText()).includes('大老二'), 'Chinese switch failed');
assert((await page.locator('body').innerText()).includes('大老二'), 'Chinese copy missing');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(180);
assert((await page.locator('h1').innerText()).includes('Big Two'), 'English switch failed');

// Mobile layout and a real touch selection.
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
  if (!sessionStorage.getItem('big-two-e2e-ready')) {
    localStorage.removeItem('familyarcade.big-two.save');
    sessionStorage.setItem('big-two-e2e-ready', '1');
  }
});
await mobile.goto(APP, { waitUntil: 'networkidle' });
let overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Solo against the AI/ }).click();
await mobile.getByRole('button', { name: /Deal the cards/ }).click();
await mobile.waitForSelector('.felt', { timeout: 10000 });
overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile game overflows by ${overflow}px`);
const handBox = await mobile.locator('.hand').boundingBox();
assert(handBox && handBox.width > 300, `mobile hand too narrow: ${handBox?.width}`);
await waitHuman(mobile, 25000);
await mobile.locator('.hint-button').click();
await mobile.waitForTimeout(120);
const mobileHint = mobile.locator('.hand .playing-card.hint');
if ((await mobileHint.count()) > 0) {
  await mobileHint.first().dispatchEvent('click');
  assert((await mobile.locator('.hand .playing-card.selected').count()) === 1, 'mobile card selection failed');
} else {
  assert(await mobile.locator('.pass-button').isEnabled(), 'mobile hint was neither play nor pass');
}

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — solo deal, hint reason, play, undo, autosave, hot-seat privacy, full game, scoring, record, stats, rules, language, mobile',
);
