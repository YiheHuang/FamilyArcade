import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5201';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page, 'desktop');
await page.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('e2e.fresh')) {
    sessionStorage.setItem('e2e.fresh', '1');
    localStorage.removeItem('familyarcade.gomoku.save');
    localStorage.removeItem('familyarcade.gomoku.record');
  }
});
await page.goto(BASE, { waitUntil: 'networkidle' });

// The English page may only contain Chinese in the language switch.
const englishText = await page.evaluate(() => document.body.innerText);
assert(!/[\u4e00-\u9fff]/.test(englishText.replace('中文', '')), 'English UI contains Chinese');

// Local two-player game: Black wins on the top row with five stones.
await page.getByRole('button', { name: /Two players/ }).click();
for (const move of [0, 15, 1, 16, 2, 17, 3, 18, 4]) {
  await page.locator('.cell').nth(move).click();
  await page.waitForTimeout(120);
}
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('Black wins'), 'Black win not shown');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.gomoku.record') || '{}'),
);
assert(savedRecord.games === 1 && savedRecord.winsBlack === 1, 'record not updated');
assert(savedRecord.byMode.local === 1, 'record mode not tracked');
assert(savedRecord.recent?.[0]?.winner === 'B', 'recent result not tracked');

// Restart, then check undo, a reasoned hint and keyboard placement.
await page.getByRole('button', { name: /Play again/ }).click();
await page.locator('.cell').nth(112).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.cell.has-b').count()) === 0, 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.cell.hint').count()) === 1, 'hint missing');
const hintToast = await page.locator('.toast').innerText();
assert(/centre|center/i.test(hintToast), `hint reason missing: ${hintToast}`);

await page.locator('.cell').nth(112).focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert((await page.locator('.cell.has-b').count()) === 1, 'keyboard placement failed');
assert((await page.locator('.cell').nth(113).getAttribute('class'))?.includes('has-b'), 'arrow cursor failed');

// AI game starts and answers. Autosave survives a reload.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the computer/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await page.locator('.cell').nth(112).click();
await page.waitForTimeout(1800);
assert((await page.locator('.cell .stone').count()) >= 2, 'computer did not reply');

await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
await page.waitForTimeout(200);
assert((await page.locator('.cell .stone').count()) >= 2, 'resumed game lost stones');

// Record screen shows the finished local game and clears in two steps.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /View record/ }).click();
assert(await page.locator('.stat-card.total').isVisible(), 'stats screen missing');
assert((await page.locator('.stat-card.total').innerText()).includes('1'), 'stats total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent game missing');
await page.getByRole('button', { name: /Clear record/ }).click();
assert(await page.getByRole('button', { name: /Yes, clear it/ }).isVisible(), 'clear confirmation missing');
await page.getByRole('button', { name: /Yes, clear it/ }).click();
assert(await page.locator('.empty-card').isVisible(), 'record was not cleared');
await page.getByRole('button', { name: /Home/ }).click();

// Chinese page: no Latin letters other than the English language switch.
const zh = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
watch(zh, 'zh');
await zh.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'zh');
  if (!sessionStorage.getItem('e2e.fresh')) {
    sessionStorage.setItem('e2e.fresh', '1');
    localStorage.removeItem('familyarcade.gomoku.save');
    localStorage.removeItem('familyarcade.gomoku.record');
  }
});
await zh.goto(BASE, { waitUntil: 'networkidle' });
const chineseText = await zh.evaluate(() => document.body.innerText);
const latinOutsideSwitch = chineseText.replace(/English/g, '');
assert(!/[A-Za-z]/.test(latinOutsideSwitch), `Chinese UI contains Latin text: ${latinOutsideSwitch.slice(0, 160)}`);
const overflow = await zh.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `Chinese mobile home overflows by ${overflow}px`);

// Mobile layout is a first-class board.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
watch(mobile, 'mobile');
await mobile.addInitScript(() => {
  localStorage.setItem('familyarcade.lang', 'en');
  if (!sessionStorage.getItem('e2e.fresh')) {
    sessionStorage.setItem('e2e.fresh', '1');
    localStorage.removeItem('familyarcade.gomoku.save');
    localStorage.removeItem('familyarcade.gomoku.record');
  }
});
await mobile.goto(BASE, { waitUntil: 'networkidle' });
const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(mobileOverflow <= 1, `mobile home overflows by ${mobileOverflow}px`);
await mobile.getByRole('button', { name: /Two players/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
assert((await mobile.locator('.cell').count()) === 225, 'mobile board should have 225 points');
const boardBox = await mobile.locator('.board').boundingBox();
assert(boardBox && boardBox.width > 330, `mobile board too narrow: ${boardBox?.width}`);
await mobile.locator('.cell').nth(112).click();
await mobile.waitForTimeout(120);
assert((await mobile.locator('.cell.has-b').count()) === 1, 'mobile move failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — EN/ZH purity, local win, record, undo, hint reason, keyboard, AI, autosave, mobile');
