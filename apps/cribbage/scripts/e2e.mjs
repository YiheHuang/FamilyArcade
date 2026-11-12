import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5211';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('crib-e2e-init')) {
    sessionStorage.setItem('crib-e2e-init', '1');
    localStorage.removeItem('familyarcade.cribbage.save');
    localStorage.removeItem('familyarcade.cribbage.record');
  }
  const original = window.setTimeout;
  window.setTimeout = (fn, ms, ...args) => original(fn, ms === 620 ? 20 : ms, ...args);
});
await page.goto(`${BASE}/?deal=12345`, { waitUntil: 'networkidle' });

// Hot-seat privacy: a handoff card appears before every private hand.
await page.getByRole('button', { name: /Hot-seat, one screen/ }).click();
await page.getByRole('button', { name: /Deal the first hand/ }).click();
assert(await page.locator('.handoff-card').isVisible(), 'hot-seat handoff missing');
assert((await page.locator('.handoff-card').innerText()).includes('Player 1'), 'wrong first seat');
await page.getByRole('button', { name: /I am Player 1/ }).click();
for (let index = 0; index < 2; index += 1) {
  await page.locator('.hand .playing-card').nth(index).click();
}
await page.getByRole('button', { name: /Send to crib/ }).click();
assert(await page.locator('.handoff-card').isVisible(), 'second seat handoff missing');
assert((await page.locator('.handoff-card').innerText()).includes('Player 2'), 'wrong second seat');
await page.getByRole('button', { name: /I am Player 2/ }).click();
for (let index = 0; index < 2; index += 1) {
  await page.locator('.hand .playing-card').nth(index).click();
}
await page.getByRole('button', { name: /Send to crib/ }).click();
await page.waitForSelector('.cut-stage');
await page.getByRole('button', { name: /Cut the deck/ }).click();
assert(await page.locator('.handoff-card').isVisible(), 'cut did not pass the device');
await page.getByRole('button', { name: /I am Player 1/ }).click();
const localLegal = page.locator('.hand .playing-card:not(.is-dim)');
assert((await localLegal.count()) > 0, 'no legal card in hot-seat');
await localLegal.first().click();
assert(await page.locator('.handoff-card').isVisible(), 'play did not pass the device');
await page.getByRole('button', { name: /I am Player 2/ }).click();
await page.getByRole('button', { name: /Undo/ }).click();
assert(await page.locator('.handoff-card').isVisible(), 'undo did not restore a private turn');
assert((await page.locator('.handoff-card').innerText()).includes('Player 1'), 'undo restored the wrong seat');
await page.getByRole('button', { name: /Home/ }).click();

// Rules are reachable and complete.
await page.getByRole('button', { name: /Rules/ }).click();
assert(await page.locator('.scoring-grid').isVisible(), 'scoring table missing');
assert((await page.locator('.rules-section').count()) >= 4, 'rule sections missing');
await page.getByRole('button', { name: /Close/ }).click();

// Solo game: discard, cut, hint with a reason, AI reply, autosave.
await page.getByRole('button', { name: /Solo against the computer/ }).click();
await page.getByRole('button', { name: /Deal the first hand/ }).click();
await page.locator('.hand .playing-card').nth(0).click();
await page.locator('.hand .playing-card').nth(1).click();
await page.getByRole('button', { name: /Send to crib/ }).click();
await page.waitForSelector('.cut-stage');
await page.getByRole('button', { name: /Cut the deck/ }).click();
await page.waitForSelector('.phase-chip');
assert((await page.locator('.phase-chip').innerText()).includes('PEGGING'), 'pegging did not start');
await page.getByRole('button', { name: /Hint/ }).click();
const hintToast = await page.locator('.toast').innerText();
assert(/point|fifteen|pair|run|count|safe|replies/i.test(hintToast), `hint reason missing: ${hintToast}`);
assert((await page.locator('.playing-card.is-hinted').count()) === 1, 'hint highlight missing');

await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue saved game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue saved game/ }).click();
await page.waitForSelector('.game-shell');

// Play the whole game. Human actions are simple legal choices; the AI plays itself.
let finished = false;
for (let step = 0; step < 1200; step += 1) {
  if (await page.locator('.result-card').isVisible().catch(() => false)) {
    finished = true;
    break;
  }
  if (await page.locator('.show-section').isVisible().catch(() => false)) {
    const next = page.getByRole('button', { name: /Next hand/ });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(20);
      continue;
    }
    await page.waitForTimeout(15);
    continue;
  }
  const confirm = page.getByRole('button', { name: /Send to crib/ });
  if (await confirm.isVisible().catch(() => false)) {
    if (!(await confirm.isEnabled().catch(() => false))) {
      const cards = page.locator('.hand .playing-card:not(.is-dim)');
      const count = await cards.count();
      for (let index = 0; index < Math.min(2, count); index += 1) {
        await cards.nth(index).click();
      }
      if (await confirm.isEnabled().catch(() => false)) await confirm.click();
    }
    await page.waitForTimeout(20);
    continue;
  }
  const cut = page.getByRole('button', { name: /Cut the deck/ });
  if (await cut.isVisible().catch(() => false)) {
    if (await cut.isEnabled().catch(() => false)) await cut.click();
    await page.waitForTimeout(20);
    continue;
  }
  const legal = page.locator('.hand .playing-card:not(.is-dim)');
  if ((await legal.count()) > 0) {
    await legal.first().click();
    await page.waitForTimeout(20);
    continue;
  }
  await page.waitForTimeout(15);
}
assert(finished, 'game did not finish');
const resultText = await page.locator('.result-card').innerText();
assert(/wins/i.test(resultText), `winner text missing: ${resultText}`);

const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.cribbage.record') || '{}'),
);
assert(record.games === 1, `record games ${record.games}`);
assert(Array.isArray(record.wins) && record.wins.reduce((a, b) => a + b, 0) === 1, 'record winner missing');
assert(record.byMode.ai === 1, 'record mode missing');
assert(record.recent?.length === 1, 'recent game missing');
assert(record.bestHand > 0, 'best hand missing');
assert(record.recent[0].scores.length === 2, 'scores missing from recent game');

await page.getByRole('button', { name: /^Home$/ }).click();
await page.getByRole('button', { name: /Family record/ }).click();
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent row missing');
assert((await page.locator('.mode-row').count()) === 3, 'mode split missing');

// Mobile is a first-class layout, not a squeezed desktop.
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobile = await mobileContext.newPage();
mobile.on('console', (message) => {
  if (message.type() === 'error') errors.push(`mobile: ${message.text()}`);
});
mobile.on('pageerror', (error) => errors.push(`mobile: ${String(error)}`));
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  localStorage.removeItem('familyarcade.cribbage.save');
});
await mobile.goto(`${BASE}/?deal=2468`, { waitUntil: 'networkidle' });
const heroBox = await mobile.locator('.hero-table').boundingBox();
assert(heroBox && heroBox.width > 300, `mobile hero too narrow: ${heroBox?.width}`);
assert(
  (await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1,
  'mobile home overflows',
);
await mobile.getByRole('button', { name: /Solo against the computer/ }).click();
await mobile.getByRole('button', { name: /Deal the first hand/ }).click();
await mobile.waitForSelector('.hand');
const handBox = await mobile.locator('.hand-panel').boundingBox();
assert(handBox && handBox.y + handBox.height <= 844, `mobile hand below the fold: ${handBox?.y}+${handBox?.height}`);
assert((await mobile.locator('.hand .playing-card').count()) === 6, 'mobile hand missing');
await mobile.locator('.hand .playing-card').nth(0).click();
assert(
  ((await mobile.locator('.hand .playing-card').nth(0).getAttribute('class')) || '').includes(
    'is-selected',
  ),
  'mobile card selection failed',
);

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — hot-seat privacy, rules, cut, hint reason, undo, autosave, full game, record, mobile');
