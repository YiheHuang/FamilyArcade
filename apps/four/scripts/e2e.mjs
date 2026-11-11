import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5181';
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
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('h1').waitFor({ state: 'visible' });
await page.evaluate(() => {
  localStorage.removeItem('familyarcade.four.save');
  localStorage.removeItem('familyarcade.four.record');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('h1').waitFor({ state: 'visible' });

const drop = async (column, target = page) => {
  await target.locator('.col').nth(column).click();
  await target.waitForTimeout(120);
};

assert(await page.getByRole('heading', { name: 'Four' }).isVisible(), 'home title missing');

// Local hot-seat: red takes the bottom row.
await page.getByRole('button', { name: /Two players, one screen/ }).click();
for (const column of [0, 6, 1, 6, 2, 6, 3]) await drop(column);
assert(await page.locator('.result-banner').isVisible(), 'result banner missing');
assert((await page.locator('.result-banner').innerText()).includes('Red wins'), 'red win not shown');
const savedRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('familyarcade.four.record') || '{}'));
assert(savedRecord.games === 1 && savedRecord.redWins === 1, 'record not updated');
assert(savedRecord.recent?.length === 1, 'recent record missing');

// Restart, undo and hint.
await page.getByRole('button', { name: /Play again/ }).click();
assert((await page.locator('.slot .disc').count()) === 0, 'restart did not clear the board');
await drop(3);
assert((await page.locator('.slot .disc').count()) === 1, 'drop failed');
await page.getByRole('button', { name: /Undo/ }).click();
await page.waitForTimeout(120);
assert((await page.locator('.slot .disc').count()) === 0, 'undo failed');
await page.getByRole('button', { name: /Hint/ }).click();
await page.waitForTimeout(150);
assert((await page.locator('.col.hint').count()) === 1, 'hint column missing');
assert(await page.locator('.hint-note').isVisible(), 'hint reason missing');

// AI game starts and answers.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Play against the AI/ }).click();
await page.getByRole('button', { name: /Begin/ }).click();
await drop(3);
await page.waitForTimeout(1000);
assert((await page.locator('.slot .disc').count()) >= 2, 'AI did not reply');

// Autosave survives a reload and offers Continue.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Continue last game/ }).waitFor({ state: 'visible' });
assert(await page.getByRole('button', { name: /Continue last game/ }).isVisible(), 'continue card missing');
await page.getByRole('button', { name: /Continue last game/ }).click();
assert((await page.locator('.slot .disc').count()) >= 2, 'resume lost the board');

// Keyboard path drops a disc.
const beforeKeys = await page.locator('.slot .disc').count();
await page.keyboard.press('2');
await page.waitForTimeout(1000);
assert((await page.locator('.slot .disc').count()) > beforeKeys, 'keyboard drop failed');

// Family record screen.
await page.getByRole('button', { name: /Home/ }).click();
await page.getByRole('button', { name: /Family record/ }).click();
assert(await page.getByRole('heading', { name: 'The family record' }).isVisible(), 'stats title missing');
assert((await page.locator('.stat-card.feature strong').innerText()) === '1', 'stats games wrong');
assert((await page.locator('.recent-list li').count()) === 1, 'recent list wrong');

// Guest deep link opens the join screen (no server needed until Join).
const guest = await browser.newPage({ viewport: { width: 900, height: 800 } });
await guest.goto(`${BASE}/?lan=TEST&code=1234&name=Guest`, { waitUntil: 'domcontentloaded' });
await guest.getByRole('heading', { name: 'Join the table' }).waitFor({ state: 'visible' });
assert(await guest.getByRole('heading', { name: 'Join the table' }).isVisible(), 'guest screen missing');
assert((await guest.getByLabel('Your name').inputValue()) === 'Guest', 'guest name not prefilled');
assert((await guest.getByLabel('Room code').inputValue()) === '1234', 'room code not prefilled');

// Mobile layout is usable.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
await mobile.locator('h1').waitFor({ state: 'visible' });
await mobile.getByRole('button', { name: /Two players, one screen/ }).click();
assert(await mobile.locator('.board').isVisible(), 'mobile board missing');
await mobile.locator('.col').nth(4).click();
await mobile.waitForTimeout(150);
assert((await mobile.locator('.slot .disc').count()) === 1, 'mobile drop failed');

assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
await browser.close();
console.log('E2E OK — home, local win, record, restart, undo, hint, AI, autosave, keyboard, stats, guest link, mobile');
