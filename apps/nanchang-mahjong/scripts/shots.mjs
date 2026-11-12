import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5226';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const RELAY = 'http://127.0.0.1:8080';

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

async function relayUp() {
  try {
    const response = await fetch(RELAY, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

let relay = null;
if (!(await relayUp())) {
  try {
    await access(path.resolve('dist/index.html'));
    relay = spawn(
      process.execPath,
      ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', '8080'],
      { stdio: 'ignore' },
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await relayUp()) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch {
    relay = null;
  }
}

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('familyarcade.shots.init')) {
      localStorage.removeItem('familyarcade.nanchang-mahjong.save');
      localStorage.removeItem('familyarcade.nanchang-mahjong.record');
      sessionStorage.setItem('familyarcade.shots.init', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

async function waitForHuman(page) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await page.getByTestId('claim-panel').count()) {
      await page.getByTestId('pass').click().catch(() => {});
    }
    const currentPhase = await page.locator('.game-shell').getAttribute('data-phase');
    const currentTurn = await page.locator('.game-shell').getAttribute('data-turn');
    if ((currentPhase === 'draw' || currentPhase === 'discard') && currentTurn === '0') return;
    if (currentPhase === 'hand-over' || currentPhase === 'game-over') return;
    await page.waitForTimeout(250);
  }
}

async function ensureLive(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentPhase = await page.locator('.game-shell').getAttribute('data-phase');
    if (currentPhase === 'draw' || currentPhase === 'discard') return currentPhase;
    if (await page.getByTestId('next-hand').count()) {
      await page.getByTestId('next-hand').click();
    } else if (await page.getByTestId('play-again').count()) {
      await page.getByTestId('play-again').click();
    } else {
      return currentPhase;
    }
    await page.waitForTimeout(350);
    await waitForHuman(page);
  }
  return page.locator('.game-shell').getAttribute('data-phase');
}

async function seedRecord(page) {
  await page.evaluate(() => {
    const recent = [
      { winner: 0, pattern: 'seven-star', deltas: [32, -12, -8, -12], hand: 4, mode: 'ai', level: 'hard', at: Date.UTC(2026, 10, 1) },
      { winner: 2, pattern: 'basic', deltas: [-4, -4, 12, -4], hand: 3, mode: 'local', at: Date.UTC(2026, 10, 4) },
      { winner: 1, pattern: 'small-seven-pairs', deltas: [-8, 24, -8, -8], hand: 2, mode: 'lan', at: Date.UTC(2026, 10, 7) },
      { winner: 0, pattern: 'thirteen-scattered', deltas: [18, -6, -6, -6], hand: 5, mode: 'ai', level: 'normal', at: Date.UTC(2026, 10, 9) },
    ];
    localStorage.setItem(
      'familyarcade.nanchang-mahjong.record',
      JSON.stringify({ hands: 12, wins: [5, 3, 3, 1], bestScore: 32, byMode: { ai: 6, local: 3, lan: 3 }, lastWinner: 0, recent }),
    );
  });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: DESKTOP });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await setLang(page, lang);

  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByTestId('start-ai').click();
  await page.getByTestId('level-normal').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByTestId('begin').click();
  await page.waitForTimeout(450);
  await page.locator('.hand .tile').first().click();
  await page.getByTestId('discard').click();
  await waitForHuman(page);
  const livePhase = await ensureLive(page);
  if (livePhase === 'draw') {
    await page.getByTestId('draw').click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: path.join(dir, 'game-live.png') });

  await page.evaluate(() => localStorage.removeItem('familyarcade.nanchang-mahjong.record'));
  await page.goto(`${BASE}/?demo=mid`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'game.png') });
  await page.getByTestId('hint').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await page.goto(`${BASE}/?demo=end`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="score-sheet"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  await page.goto(`${BASE}/?demo=over`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="match-over"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'match-over.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('rules').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedRecord(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('record').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'record.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByTestId('start-lan').click();
  await page.getByTestId('lan-create').click();
  await page.waitForSelector('.room-code.big', { timeout: 15000 });
  const invite = await page.getByTestId('invite-link').getAttribute('href');
  let guest = null;
  if (invite) {
    guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await guest.addInitScript((value) => localStorage.setItem('familyarcade.lang', value), lang);
    await guest.goto(invite, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await guest?.close();

  const mobile = await browser.newPage({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: MOBILE.deviceScaleFactor,
  });
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.goto(`${BASE}/?demo=mid`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(450);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  await closeBrowser(browser);
  console.log(`screenshots ${lang}: ok${errors.length ? ` (errors: ${errors.slice(0, 2).join(' | ')})` : ''}`);
}

await run('en');
await run('zh');
if (relay) relay.kill();
process.exit(0);
