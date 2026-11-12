import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5220';
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
  window.__GUANDAN_FAST__ = true;
  localStorage.setItem('familyarcade.lang', 'en');
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const englishBody = await page.locator('body').innerText();
assert(!/[\u4e00-\u9fff]/.test(englishBody.replace('中文', '')), 'English home contains Chinese');
assert(await page.getByRole('heading', { name: 'Guandan' }).isVisible(), 'home title missing');

// Hot-seat: privacy, a real hand, a hint, undo and a pass.
await page.getByRole('button', { name: /Four-player hot-seat/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat gate missing');
assert((await page.locator('.hand .playing-card').count()) === 0, 'hot-seat hand leaked before reveal');
await page.getByRole('button', { name: /Show my hand/ }).click();
assert((await page.locator('.hand .playing-card').count()) === 27, 'hot-seat hand should have 27 cards');
await page.locator('.hint-button').click();
await page.waitForTimeout(160);
const firstHint = page.locator('.hand .playing-card.hint');
assert((await firstHint.count()) > 0, 'hot-seat hint did not mark cards');
const hintedIds = await firstHint.evaluateAll((els) =>
  els.map((element) => element.getAttribute('data-card')),
);
for (const id of hintedIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
await page.locator('.play-button').click();
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'next hot-seat player gate missing');

await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.undo-button').click();
await page.waitForTimeout(220);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat undo did not return to the previous seat');

await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.hint-button').click();
await page.waitForTimeout(160);
const replayHint = page.locator('.hand .playing-card.hint');
const replayIds = await replayHint.evaluateAll((els) =>
  els.map((element) => element.getAttribute('data-card')),
);
for (const id of replayIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
await page.locator('.play-button').click();
await page.waitForTimeout(220);
await page.getByRole('button', { name: /Show my hand/ }).click();
assert(await page.locator('.pass-button').isEnabled(), 'hot-seat follower could not pass');
await page.locator('.pass-button').click();
await page.waitForTimeout(250);
assert(await page.getByRole('button', { name: /Show my hand/ }).isVisible(), 'pass did not advance the seat');

await page.getByRole('button', { name: /Home/ }).click();
assert(await page.getByRole('button', { name: /Continue the match/ }).isVisible(), 'hot-seat autosave missing');

// Solo: finish a real round by following the hint policy.
await page.getByRole('button', { name: /Solo against the AI/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(500);

let humanActions = 0;
for (let step = 0; step < 900; step += 1) {
  if (await page.locator('.result-panel').isVisible().catch(() => false)) break;
  const hintButton = page.locator('.hint-button');
  if (!(await hintButton.isEnabled().catch(() => false))) {
    await page.waitForTimeout(90);
    continue;
  }
  await hintButton.click();
  await page.waitForTimeout(55);
  const hinted = page.locator('.hand .playing-card.hint');
  const count = await hinted.count();
  if (count > 0) {
    const cardIds = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of cardIds) {
      await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    }
    await page.locator('.play-button').click();
    humanActions += 1;
  } else if (await page.locator('.pass-button').isEnabled().catch(() => false)) {
    await page.locator('.pass-button').click();
    humanActions += 1;
  }
  await page.waitForTimeout(65);
}
assert(await page.locator('.result-panel').isVisible(), `round did not finish (${humanActions} human actions)`);
assert((await page.locator('.ranking-list li').count()) === 4, 'ranking should list four players');
assert((await page.locator('.gain-badge').innerText()).match(/^\+[123]$/), 'gain badge missing');
const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.guandan.record') || '{}'),
);
assert(record.rounds === 1, `family record missing (${JSON.stringify(record)})`);
assert(record.byMode?.ai === 1, 'AI mode not recorded');
assert(record.recent?.[0]?.order?.length === 4, 'round order not recorded');
assert(record.roundWins?.[0] + record.roundWins?.[1] === 1, 'round win not recorded');

// Next round: tribute may appear; start the round and check autosave.
await page.getByRole('button', { name: /Next round/ }).click();
await page.waitForTimeout(350);
const tributeVisible = await page.locator('.tribute-panel').isVisible().catch(() => false);
if (tributeVisible) {
  const tributeText = await page.locator('.tribute-panel').innerText();
  assert(/Tribute/.test(tributeText), 'tribute panel copy missing');
  await page.getByRole('button', { name: /Start the round/ }).click();
  await page.waitForTimeout(300);
}
assert(/round 2/i.test(await page.locator('.game-id').innerText()), 'round two did not start');
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.guandan.save') || '{}'),
);
assert(saved.version === 1 && saved.state?.round === 2, 'round two was not saved');

// Autosave/resume after a reload.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue the match/ }).isVisible(), 'round two was not saved');
await page.getByRole('button', { name: /Continue the match/ }).click();
await page.waitForTimeout(300);
assert(/round 2/i.test(await page.locator('.game-id').innerText()), 'resume lost the round');

// Record screen and rules.
await page.getByRole('button', { name: /Home/ }).click();
assert((await page.locator('.record-strip').innerText()).includes('1'), 'home record strip not updated');
await page.getByRole('button', { name: /Family record/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent round missing');
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /^Rules/ }).click();
assert((await page.locator('.rules-list li').count()) === 8, 'rules list missing');
assert((await page.locator('.combo-tile').count()) === 10, 'combination table missing');
await page.getByRole('button', { name: /Close/ }).click();

// Language switch is the only intentional cross-language control.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(200);
assert((await page.locator('h1').innerText()).includes('掼蛋'), 'Chinese switch failed');
const zhBody = await page.locator('body').innerText();
assert(!/Sound on|Solo against|Four-player|LAN table|Family record|Rules/.test(zhBody), 'Chinese UI leaked English copy');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(200);
assert((await page.locator('h1').innerText()).includes('Guandan'), 'English switch failed');

// Mobile layout and a real touch turn.
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
  window.__GUANDAN_FAST__ = true;
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
let overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Solo against the AI/ }).click();
await mobile.getByRole('button', { name: /Deal the cards/ }).click();
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
  { timeout: 12000 },
);
await mobile.locator('.hint-button').click();
await mobile.waitForTimeout(150);
const mobileCards = mobile.locator('.hand .playing-card.hint');
if ((await mobileCards.count()) > 0) {
  await mobileCards.first().click();
  assert((await mobile.locator('.hand .playing-card.selected').count()) === 1, 'mobile card selection failed');
} else {
  assert(await mobile.locator('.pass-button').isEnabled(), 'mobile hint was neither play nor pass');
}

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(
  'E2E OK — hot-seat privacy, hint, undo, pass, autosave, full AI round, record, tribute/next round, resume, stats, rules, language, mobile',
);
