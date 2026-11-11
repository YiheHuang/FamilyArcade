import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const LAN_PORT = Number(process.env.LAN_PORT || 8080);
const OUT = path.resolve('docs/screenshots');

async function isOurRelay(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    const html = await response.text();
    return html.includes('Star Leap');
  } catch {
    return false;
  }
}

async function ensureRelay() {
  if (await isOurRelay(LAN_PORT)) return null;
  const child = spawn(process.execPath, ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(LAN_PORT)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`LAN relay on ${LAN_PORT} did not start`)), 10000);
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.includes('LAN relay')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`LAN relay exited (${code}). Port ${LAN_PORT} may already be used by another app.`));
    });
  });
  return child;
}

async function loadSave(page, file) {
  const json = await readFile(path.resolve(file), 'utf8');
  await page.evaluate((value) => localStorage.setItem('starleap.save.v1', value), json);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(700);
}

async function selectFirstLegal(page, colorIndex) {
  const marbles = page.locator('g.hole').filter({
    has: page.locator(`circle[fill^="url(#sl-marble-${colorIndex})"]`),
  });
  const count = await marbles.count();
  for (let i = 0; i < count; i++) {
    await marbles.nth(i).click();
    await page.waitForTimeout(140);
    if (await page.locator('g.hole.is-legal').count()) {
      await page.locator('g.hole.is-legal').first().hover();
      await page.waitForTimeout(180);
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('dialog', (dialog) => dialog.accept());
  const lang = process.env.LANG_CODE || 'en';
  const url = `${BASE}/?tutorial=0&lang=${lang}`;
  const p1 = lang === 'zh' ? '玩家 1' : 'Player 1';
  const p2 = lang === 'zh' ? '玩家 2' : 'Player 2';

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await mkdir(path.join(OUT, lang), { recursive: true });
  await page.screenshot({ path: path.join(OUT, lang, 'home.png') });

  // Real LAN host lobby + a phone that really joined the room.
  const relay = await ensureRelay();
  let guest = null;
  try {
    await page.getByTestId('mode-lan').click();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="lan-room-code"]');
      return el && el.textContent !== '····';
    });
    await page.waitForSelector('[data-testid="lan-qr"] img');

    const inviteText = (await page.getByTestId('lan-invite-url').innerText()).trim();
    const invite = new URL(`http://${inviteText}`);
    invite.searchParams.set('tutorial', '0');
    invite.searchParams.set('lang', lang);
    guest = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await guest.goto(invite.toString(), { waitUntil: 'networkidle' });
    await guest.waitForSelector('[data-testid="lan-token"]');
    await page.waitForFunction(() => {
      const seat = document.querySelector('[data-testid="lan-seat-1"]');
      return seat && seat.className.includes('is-online');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, lang, 'lan-host.png') });
    await guest.waitForTimeout(300);
    await guest.screenshot({ path: path.join(OUT, lang, 'lan-guest.png') });
    await guest.close();
    guest = null;
    await page.getByRole('button', { name: /Back to home|返回主页/ }).click();
    await page.waitForTimeout(500);
  } finally {
    if (guest) await guest.close();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (relay) relay.kill();
  }

  // Setup screen
  await page.getByTestId('mode-hotseat').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, lang, 'setup.png') });

  // Curated mid-game
  await page.evaluate(() => localStorage.clear());
  await loadSave(page, `docs/demo-state.${lang}.json`);
  await page.screenshot({ path: path.join(OUT, lang, 'game.png') });
  if (await selectFirstLegal(page, 0)) {
    await page.screenshot({ path: path.join(OUT, lang, 'game-select.png') });
  }

  // Rules
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(500);
  await page.getByTestId('home-rules').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, lang, 'rules.png') });

  // Settings
  await page.getByTestId('back').click();
  await page.waitForTimeout(400);
  await page.getByTestId('home-settings').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, lang, 'settings.png') });

  // Finish the near-win position, then replay it.
  await page.getByTestId('back').click();
  await page.waitForTimeout(400);
  await loadSave(page, lang === 'zh' ? 'docs/win-state.zh.json' : 'docs/win-state.json');
  const target = JSON.parse(await readFile('docs/win-target.json', 'utf8'));
  await page.locator(`g.hole[data-hole="${target.from}"]`).click();
  await page.waitForTimeout(200);
  await page.locator(`g.hole[data-hole="${target.last}"]`).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, lang, 'game-over.png') });
  await page.getByTestId('modal-home').click();
  await page.waitForTimeout(400);

  // Filled stats screen (local-only demo data).
  const historyEntry = await readFile(`docs/history-demo.${lang}.json`, 'utf8');
  await page.evaluate(
    ({ p1, p2, historyEntry }) => {
      localStorage.setItem(
        'starleap.stats.v1',
        JSON.stringify({
          version: 1,
          games: 12,
          wins: { [p1]: 7, [p2]: 5 },
          currentStreak: 2,
          bestStreak: 4,
          lastWinner: p1,
          seatWins: [7, 5, 0, 0],
          favoriteSeat: 0,
        }),
      );
      localStorage.setItem('starleap.history.v1', JSON.stringify([JSON.parse(historyEntry)]));
    },
    { p1, p2, historyEntry },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, lang, 'stats.png') });

  // Mobile home + game
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  mobile.on('dialog', (dialog) => dialog.accept());
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: path.join(OUT, lang, 'home-mobile.png') });
  await mobile.getByTestId('mode-hotseat').click();
  await mobile.waitForTimeout(500);
  await mobile.getByTestId('start-game').click();
  await mobile.waitForTimeout(900);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.waitForTimeout(200);
  await mobile.screenshot({ path: path.join(OUT, lang, 'game-mobile.png') });

  await browser.close();
  console.log('screenshots written to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
