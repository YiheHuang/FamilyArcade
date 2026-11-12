import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5225';
const APP = new URL(BASE);
APP.searchParams.set('fast', '1');
const URL_APP = APP.toString();
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const OPENING = ['一心一意', '意气风发', '发扬光大', '大器晚成', '成千上万', '万紫千红'];
const FINISH = ['暗箭伤人', '人山人海', '海枯石烂', '烂醉如泥', '泥牛入海'];

async function prepare(page, lang) {
  await page.addInitScript(
    ({ language }) => {
      localStorage.setItem('familyarcade.lang', language);
      if (!sessionStorage.getItem('idiom-chain.shots.ready')) {
        localStorage.removeItem('familyarcade.idiom-chain.save');
        localStorage.removeItem('familyarcade.idiom-chain.record');
        sessionStorage.setItem('idiom-chain.shots.ready', '1');
      }
    },
    { language: lang },
  );
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(260);
}

async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(dir, name), animations: 'disabled' });
}

async function play(page, text) {
  await page.getByTestId('idiom-input').fill(text);
  await page.getByTestId('idiom-input').press('Enter');
  await page.waitForTimeout(110);
}

async function startLocal(page, { cover = false, players = 2 } = {}) {
  await page.getByTestId('start-local').click();
  await page.getByTestId(`players-${players}`).click();
  const pressed = await page.getByTestId('cover-toggle').getAttribute('aria-pressed');
  if (cover && pressed === 'false') await page.getByTestId('cover-toggle').click();
  if (!cover && pressed === 'true') await page.getByTestId('cover-toggle').click();
  await page.getByTestId('begin').click();
  await page.waitForSelector('.game-shell');
}

async function desktopShots(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await prepare(page, lang);
  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, dir, 'home.png');

  await page.getByTestId('start-solo').click();
  await page.getByTestId('players-3').click();
  await page.getByTestId('level-hard').click();
  await page.getByTestId('timer-20').click();
  await settle(page);
  await shot(page, dir, 'setup.png');

  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await startLocal(page, { cover: false, players: 2 });
  for (const text of OPENING) await play(page, text);
  await page.waitForTimeout(180);
  await shot(page, dir, 'game.png');

  await page.getByTestId('hint').click();
  await page.waitForSelector('[data-testid="hint-card"]');
  await settle(page);
  await shot(page, dir, 'game-hint.png');

  await page.getByTestId('home').click();
  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await startLocal(page, { cover: false, players: 2 });
  for (const text of FINISH) await play(page, text);
  await page.waitForSelector('[data-testid="result"]');
  await page.waitForTimeout(3000);
  await settle(page);
  await shot(page, dir, 'game-over.png');

  await page.getByTestId('home').click();
  await page.getByTestId('rules').click();
  await settle(page);
  await shot(page, dir, 'rules.png');

  await page.locator('.screen-top .back').click();
  await page.getByTestId('record').click();
  await settle(page);
  await shot(page, dir, 'record.png');

  await page.locator('.screen-top .back').click();
  await page.getByTestId('start-lan').click();
  await settle(page);
  await shot(page, dir, 'lan.png');

  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    isMobile: MOBILE.isMobile,
    hasTouch: MOBILE.hasTouch,
  });
  const mobile = await mobileContext.newPage();
  await prepare(mobile, lang);
  await mobile.goto(URL_APP, { waitUntil: 'networkidle' });
  await settle(mobile);
  await shot(mobile, dir, 'home-mobile.png');
  await startLocal(mobile, { cover: false, players: 2 });
  for (const text of ['一心一意', '意气风发', '发扬光大']) await play(mobile, text);
  await mobile.waitForTimeout(180);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await settle(mobile);
  await shot(mobile, dir, 'game-mobile.png');
  await mobileContext.close();
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await desktopShots(browser, 'en');
  await desktopShots(browser, 'zh');
} finally {
  await browser.close();
}
console.log('Screenshots OK — 20 real captures in docs/screenshots/{en,zh}');
