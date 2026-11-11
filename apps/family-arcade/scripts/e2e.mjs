import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5200';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(BASE, { waitUntil: 'networkidle' });
const cards = await page.locator('.card').count();
if (cards !== 27) throw new Error(`expected 27 cards, got ${cards}`);
await page.locator('input').fill('chess');
await page.waitForTimeout(200);
const filtered = await page.locator('.card').count();
if (filtered < 1) throw new Error('search returned no games');
await page.locator('input').fill('');
await page.getByRole('button', { name: '经典' }).click();
const classics = await page.locator('.card').count();
if (classics !== 2) throw new Error(`expected 2 classics, got ${classics}`);
await page.getByRole('button', { name: '全部' }).click();
if (errors.length) throw new Error(errors.join(' | '));
await browser.close();
console.log('HUB E2E OK — 27 cards, search, filters, no console errors');
