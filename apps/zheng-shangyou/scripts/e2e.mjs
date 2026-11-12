import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5218';
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
});
await page.goto(BASE, { waitUntil: 'networkidle' });

const englishBody = await page.locator('body').innerText();
assert(!/[\u4e00-\u9fff]/.test(englishBody.replace('中文', '')), 'English home contains Chinese');
assert(await page.getByRole('heading', { name: 'Zheng Shangyou' }).isVisible(), 'home title missing');

// Hot-seat: a private hand, a revealed turn, a legal hint, a play, undo and pass.
await page.getByRole('button', { name: /Hot-seat/ }).click();
await page.getByRole('button', { name: /^3$/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(300);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat gate missing');
assert((await page.locator('.hand .playing-card').count()) === 0, 'hot-seat hand leaked before reveal');
await page.getByRole('button', { name: /Show my hand/ }).click();
assert((await page.locator('.hand .playing-card').count()) > 0, 'revealed hand missing');
await page.locator('.hint-button').click();
await page.waitForTimeout(200);
const firstHint = page.locator('.hand .playing-card.hint');
assert((await firstHint.count()) > 0, 'hot-seat hint did not mark cards');
const hintedIds = await firstHint.evaluateAll((els) =>
  els.map((element) => element.getAttribute('data-card')),
);
for (const id of hintedIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
await page.locator('.play-button').click();
await page.waitForTimeout(300);
assert(await page.locator('.privacy-gate').isVisible(), 'next hot-seat player gate missing');

await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.undo-button').click();
await page.waitForTimeout(250);
assert(await page.locator('.privacy-gate').isVisible(), 'hot-seat undo did not return to the previous seat');

await page.getByRole('button', { name: /Show my hand/ }).click();
await page.locator('.hint-button').click();
await page.waitForTimeout(200);
const replayHint = page.locator('.hand .playing-card.hint');
const replayIds = await replayHint.evaluateAll((els) =>
  els.map((element) => element.getAttribute('data-card')),
);
for (const id of replayIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
await page.locator('.play-button').click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: /Show my hand/ }).click();
assert(await page.locator('.pass-button').isEnabled(), 'follower could not pass');
await page.locator('.pass-button').click();
await page.waitForTimeout(250);
assert(await page.getByRole('button', { name: /Show my hand/ }).isVisible(), 'pass did not advance the seat');

await page.getByRole('button', { name: /Home/ }).click();
assert(await page.getByRole('button', { name: /Continue the round/ }).isVisible(), 'hot-seat autosave missing');

// Solo: finish a real six-player round by following the hint policy.
await page.getByRole('button', { name: /Solo against the AI/ }).click();
await page.getByRole('button', { name: /^6$/ }).click();
await page.getByRole('button', { name: /Deal the cards/ }).click();
await page.waitForTimeout(900);

let humanActions = 0;
for (let step = 0; step < 900; step += 1) {
  if (await page.locator('.result-panel').isVisible().catch(() => false)) break;
  const hintButton = page.locator('.hint-button');
  if (!(await hintButton.isEnabled().catch(() => false))) {
    await page.waitForTimeout(220);
    continue;
  }
  await hintButton.click();
  await page.waitForTimeout(120);
  const hinted = page.locator('.hand .playing-card.hint');
  const count = await hinted.count();
  if (count > 0) {
    const cardIds = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of cardIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    await page.locator('.play-button').click();
    humanActions += 1;
  } else if (await page.locator('.pass-button').isEnabled().catch(() => false)) {
    await page.locator('.pass-button').click();
    humanActions += 1;
  }
  await page.waitForTimeout(280);
}
assert(await page.locator('.result-panel').isVisible(), `round did not finish (${humanActions} human actions)`);
assert((await page.locator('.ranking-list li').count()) === 6, 'ranking should list six players');
const record = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.zheng-shangyou.record') || '{}'),
);
assert(record.rounds === 1, `family record missing (${JSON.stringify(record)})`);
assert(record.byMode?.ai === 1, 'AI mode not recorded');
assert(record.recent?.[0]?.order?.length === 6, 'round order not recorded');

// Next round: tribute screen, a return if needed, then a live round two.
await page.getByRole('button', { name: /Next round/ }).click();
await page.waitForTimeout(900);
assert(await page.locator('.tribute-panel').isVisible(), 'tribute panel missing');
if (await page.locator('.return-button').isVisible().catch(() => false)) {
  await page.locator('.hint-button').click();
  await page.waitForTimeout(150);
  const returnIds = await page.locator('.hand .playing-card.hint').evaluateAll((els) =>
    els.map((element) => element.getAttribute('data-card')),
  );
  assert(returnIds.length === 1, 'tribute hint did not suggest one card');
  for (const id of returnIds) await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
  assert(await page.locator('.return-button').isEnabled(), 'return button did not enable');
  await page.locator('.return-button').click();
  await page.waitForTimeout(500);
}
if (await page.locator('.start-tribute-button').isVisible().catch(() => false)) {
  await page.locator('.start-tribute-button').click();
}
await page.waitForTimeout(900);
assert(/round 2/i.test(await page.locator('.game-id').innerText()), 'round two did not start');

// Autosave/resume after a reload.
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue the round/ }).isVisible(), 'round two was not saved');
await page.getByRole('button', { name: /Continue the round/ }).click();
await page.waitForTimeout(400);
assert(/round 2/i.test(await page.locator('.game-id').innerText()), 'resume lost the round');

// Record screen and rules.
await page.getByRole('button', { name: /Home/ }).click();
assert((await page.locator('.record-strip').innerText()).includes('1'), 'home record strip not updated');
await page.getByRole('button', { name: /View record/ }).click();
await page.waitForTimeout(250);
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent round missing');
assert((await page.locator('.tally-list li').count()) >= 1, 'finish tally missing');
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Rules/ }).click();
assert((await page.locator('.rules-list li').count()) === 10, 'rules list missing');
await page.getByRole('button', { name: /Close/ }).click();

// Language switch is the only intentional cross-language control.
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(250);
assert((await page.locator('h1').innerText()).includes('争上游'), 'Chinese switch failed');
const chineseBody = (await page.locator('body').innerText()).replace('English', '');
assert(!/[A-Za-z]{2,}/.test(chineseBody), 'Chinese home contains English words');
await page.getByRole('button', { name: 'English' }).click();
await page.waitForTimeout(250);
assert((await page.locator('h1').innerText()).includes('Zheng Shangyou'), 'English switch failed');

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
  localStorage.setItem('familyarcade.lang', 'en');
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
let overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `mobile home overflows by ${overflow}px`);
await mobile.getByRole('button', { name: /Solo against the AI/ }).click();
await mobile.getByRole('button', { name: /^4$/ }).click();
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
await mobile.waitForTimeout(200);
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
  'E2E OK — hot-seat privacy, hint, undo, pass, autosave, full six-player AI round, tribute, resume, stats, rules, language, mobile',
);
