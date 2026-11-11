import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const URL = `${BASE}/?tutorial=0&lang=en`;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function pickMove(page, colorIndex, { move = false } = {}) {
  const marbles = page.locator('g.hole').filter({
    has: page.locator(`circle[fill^="url(#sl-marble-${colorIndex})"]`),
  });
  const n = await marbles.count();
  for (let i = 0; i < n; i++) {
    await marbles.nth(i).click();
    await page.waitForTimeout(120);
    const target = page.locator('g.hole.is-legal').first();
    if (await target.count()) {
      if (move) {
        await target.click();
        await page.waitForTimeout(700);
      }
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('dialog', (d) => d.accept());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  assert(await page.getByTestId('mode-solo').count(), 'home did not render');

  // Solo: the AI should answer after the human's first move.
  await page.getByTestId('mode-solo').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(500);
  assert(await pickMove(page, 0, { move: true }), 'no legal human move');
  await page.waitForTimeout(3000);
  const turnText = await page.locator('.turn-banner small').innerText();
  assert(/Turn\s*[3-9]/.test(turnText) || /Turn\s*[1-9][0-9]/.test(turnText), `AI did not reply: ${turnText}`);
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(400);

  // Hot-seat: move and undo.
  await page.getByTestId('mode-hotseat').click();
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(500);
  assert(await pickMove(page, 0, { move: true }), 'hotseat: no legal move');
  const lastAfterMove = await page.locator('.game__last').innerText();
  assert(/Player 1/.test(lastAfterMove), `last move not shown: ${lastAfterMove}`);
  await page.getByTestId('undo').click();
  await page.waitForTimeout(400);
  const lastAfterUndo = await page.locator('.game__last').innerText();
  assert(!/Player 1/.test(lastAfterUndo), `undo did not clear last move: ${lastAfterUndo}`);
  await page.getByTestId('game-home').click();
  await page.waitForTimeout(400);

  // Win, stats, replay.
  const winSave = await readFile('docs/win-state.json', 'utf8');
  const winTarget = JSON.parse(await readFile('docs/win-target.json', 'utf8'));
  await page.evaluate((json) => localStorage.setItem('starleap.save.v1', json), winSave);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByTestId('continue-game').click();
  await page.waitForTimeout(500);
  await page.locator(`g.hole[data-hole="${winTarget.from}"]`).click();
  await page.waitForTimeout(200);
  await page.locator(`g.hole[data-hole="${winTarget.last}"]`).click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole('dialog');
  assert(await dialog.count(), 'win dialog did not appear');
  const dialogText = await dialog.innerText();
  assert(/wins/i.test(dialogText), `win dialog lacks winner: ${dialogText}`);
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('starleap.stats.v1') || '{}'));
  assert(stats.games === 1, `stats games expected 1, got ${stats.games}`);
  assert(stats.wins?.['Player 1'] === 1, `stats wins wrong: ${JSON.stringify(stats.wins)}`);

  await page.getByTestId('replay').click();
  await page.waitForTimeout(500);
  assert(await page.getByRole('heading', { name: /Replay/i }).count(), 'replay screen missing');
  await page.getByTestId('back').click();
  await page.waitForTimeout(300);
  assert(await page.getByRole('dialog').count(), 'back from replay should return to the finished game');

  // The finished game is kept in the last-ten history and can be replayed again.
  await page.getByTestId('modal-home').click();
  await page.getByTestId('home-stats').click();
  await page.waitForTimeout(500);
  const historyRows = page.locator('.history-row');
  const historyCount = await historyRows.count();
  assert(historyCount === 1, `history rows expected 1, got ${historyCount}`);
  await historyRows.first().click();
  await page.waitForTimeout(500);
  assert(await page.getByRole('heading', { name: /Replay/i }).count(), 'history replay did not open');
  await page.getByTestId('back').click();
  await page.waitForTimeout(300);
  await page.getByTestId('back').click();
  await page.waitForTimeout(300);

  // Mobile overflow.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(URL, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(500);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'mobile page overflows horizontally');

  assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('E2E OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
