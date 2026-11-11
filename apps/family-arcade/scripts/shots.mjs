import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5200';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const lang of ['en', 'zh']) {
  const dir = path.resolve('docs/screenshots', lang);
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'home.jpg'), type: 'jpeg', quality: 86 });
  await page.getByRole('button', { name: '经典' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'classics.jpg'), type: 'jpeg', quality: 86 });
  await page.getByRole('button', { name: '全部' }).click();
  await page.locator('input').fill('go');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'search.jpg'), type: 'jpeg', quality: 86 });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.jpg'), type: 'jpeg', quality: 86 });
  await page.close();
  await mobile.close();
  console.log(`hub screenshots ${lang}: ok`);
}
await browser.close();
