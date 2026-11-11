import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const lang = process.env.LANG_CODE || 'en';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const host = await browser.newPage({ viewport: DESKTOP });
host.on('dialog', (dialog) => dialog.accept());
await host.goto(`${BASE}/?tutorial=0&lang=${lang}`, { waitUntil: 'networkidle' });
await host.evaluate(() => localStorage.clear());
await host.reload({ waitUntil: 'networkidle' });
await host.waitForTimeout(400);
await host.getByTestId('mode-lan').click();
await host.getByTestId('lan-create').click();
await host.getByTestId('lan-invite').waitFor({ timeout: 12000 });

const invite = `http://${await host.getByTestId('lan-invite').innerText()}`;
const guestUrl = `${invite}&lang=${lang}`;
const guest = await browser.newPage({ viewport: DESKTOP });
guest.on('dialog', (dialog) => dialog.accept());
await guest.goto(guestUrl, { waitUntil: 'networkidle' });
await guest.getByTestId('lan-guest-status').waitFor({ timeout: 12000 });
await host.waitForTimeout(500);

await mkdir(path.join(OUT, lang), { recursive: true });
await host.screenshot({ path: path.join(OUT, lang, 'lan-host.png') });
await guest.screenshot({ path: path.join(OUT, lang, 'lan-guest.png') });
await browser.close();
console.log(`LAN screenshots written to ${OUT}/${lang}`);
