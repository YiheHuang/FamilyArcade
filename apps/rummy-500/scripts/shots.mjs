import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5210';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function seedRecord(lang) {
  const now = Date.now();
  return {
    games: 4,
    bestScore: 512,
    byMode: { ai: 2, local: 1, lan: 1 },
    recent: [
      {
        at: now - 2 * 86400000,
        mode: 'local',
        players: 3,
        winner: 0,
        winnerName: lang === 'zh' ? '阿宁' : 'Avery',
        score: 478,
        rounds: 6,
      },
      {
        at: now - 4 * 86400000,
        mode: 'ai',
        level: 'normal',
        players: 2,
        winner: 1,
        winnerName: '',
        score: 505,
        rounds: 8,
      },
      {
        at: now - 6 * 86400000,
        mode: 'lan',
        players: 4,
        winner: 0,
        winnerName: lang === 'zh' ? '阿明' : 'Mira',
        score: 500,
        rounds: 7,
      },
      {
        at: now - 9 * 86400000,
        mode: 'ai',
        level: 'companion',
        players: 2,
        winner: 0,
        winnerName: '',
        score: 420,
        rounds: 5,
      },
    ],
  };
}

async function openPage(browser, lang, mobile = false) {
  const page = await browser.newPage(mobile ? MOBILE : { viewport: DESKTOP });
  page.on('pageerror', (error) => console.log(`pageerror ${lang}: ${error}`));
  await page.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(
    (value) => {
      localStorage.setItem('familyarcade.rummy-500.record', JSON.stringify(value));
      localStorage.removeItem('familyarcade.rummy-500.save');
    },
    seedRecord(lang),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
}

async function go(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const lang of ['en', 'zh']) {
    const dir = path.join(OUT, lang);
    await mkdir(dir, { recursive: true });
    const page = await openPage(browser, lang);
    await page.screenshot({ path: path.join(dir, 'home.png') });

    await page.getByRole('button', { name: lang === 'zh' ? /和电脑玩/ : /Play against the AI/ }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, 'setup.png') });

    await go(page, '/');
    await page.getByRole('button', { name: lang === 'zh' ? /同屏传牌/ : /Pass and play/ }).click();
    await page.getByRole('button', { name: lang === 'zh' ? /发牌/ : /Deal the cards/ }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(dir, 'privacy.png') });

    await go(page, '/?demo=mid');
    await page.screenshot({ path: path.join(dir, 'game.png') });

    await page.getByRole('button', { name: lang === 'zh' ? '提示' : 'Hint' }).click();
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(dir, 'game-hint.png') });

    await go(page, '/?demo=over');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(dir, 'game-over.png') });

    await go(page, '/');
    await page.getByRole('button', { name: lang === 'zh' ? /规则/ : /Rules/ }).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(dir, 'rules.png') });
    await page.getByRole('button', { name: lang === 'zh' ? '关闭' : 'Close' }).click();
    await page.getByRole('button', { name: lang === 'zh' ? /家庭战绩/ : /Family record/ }).click();
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(dir, 'stats.png') });

    await go(page, '/');
    await page.getByRole('button', { name: lang === 'zh' ? /局域网牌桌/ : /LAN night/ }).click();
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(dir, 'lan.png') });

    const mobile = await openPage(browser, lang, true);
    await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
    await go(mobile, '/?demo=mobile');
    await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

    await page.close();
    await mobile.close();
    console.log(`screenshots ${lang}: ok`);
  }
  console.log(`screenshots written to ${OUT}`);
} finally {
  await browser.close();
}
