import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5189';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NAMES = {
  en: ['Mia', 'Leo', 'Zoe', 'Kai'],
  zh: ['小满', '阿禾', '乐乐', '果果'],
};

function stateFor(lang, positions, turn = 0) {
  const names = NAMES[lang];
  const players = names.map((name, seat) => ({
    seat,
    name,
    kind: 'human',
    level: 'normal',
    position: positions[seat] ?? 0,
  }));
  const lastMove = {
    seat: (turn + players.length - 1) % players.length,
    roll: 4,
    from: 54,
    raw: 58,
    to: 58,
    transport: 'none',
    overshoot: false,
    wins: false,
  };
  return {
    version: 1,
    players,
    turn,
    status: 'playing',
    winner: null,
    lastRoll: 4,
    lastMove,
    moves: [lastMove],
  };
}

function saveFor(lang, positions, turn = 0) {
  return {
    version: 2,
    mode: 'local',
    level: 'normal',
    savedAt: Date.now(),
    state: stateFor(lang, positions, turn),
  };
}

function recordFor(lang) {
  return {
    games: 12,
    wins: [7, 4, 1, 0],
    streak: 2,
    bestStreak: 4,
    lastWinner: 0,
    lastWinnerName: NAMES[lang][0],
  };
}

async function createPage(browser, lang, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? DESKTOP,
    deviceScaleFactor: options.viewport === MOBILE ? 2 : 1,
    isMobile: Boolean(options.mobile),
    hasTouch: Boolean(options.mobile),
  });
  await context.addInitScript(
    ({ lang, save, record, random, relayPort }) => {
      localStorage.setItem('familyarcade.lang', lang);
      if (save) localStorage.setItem('familyarcade.ladder-run.save', JSON.stringify(save));
      else localStorage.removeItem('familyarcade.ladder-run.save');
      if (record) localStorage.setItem('familyarcade.ladder-run.record', JSON.stringify(record));
      else localStorage.removeItem('familyarcade.ladder-run.record');
      if (typeof random === 'number') Math.random = () => random;
      if (relayPort) localStorage.setItem('familyarcade.shots.relay', String(relayPort));
    },
    {
      lang,
      save: options.save ?? null,
      record: options.record ?? null,
      random: typeof options.random === 'number' ? options.random : null,
      relayPort: options.relayPort ?? null,
    },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return { context, page, errors };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForRelay(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await delay(150);
  }
  return false;
}

async function shoot(page, lang, name) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function runLanguage(browser, lang) {
  const issues = [];

  // Home: a lived-in family record, no save.
  {
    const { context, page, errors } = await createPage(browser, lang, { record: recordFor(lang) });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('play-ai').waitFor();
    await delay(350);
    await shoot(page, lang, 'home');
    issues.push(...errors);
    await context.close();
  }

  // Setup: four seats, Companion selected.
  {
    const { context, page, errors } = await createPage(browser, lang, { record: recordFor(lang) });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('play-ai').waitFor();
    await page.getByTestId('play-ai').click();
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.locator('.level-card').filter({ hasText: lang === 'zh' ? '陪玩' : 'Companion' }).click();
    await delay(250);
    await shoot(page, lang, 'setup');
    issues.push(...errors);
    await context.close();
  }

  // Mid-game and hint.
  {
    const save = saveFor(lang, [34, 58, 12, 0], 0);
    const { context, page, errors } = await createPage(browser, lang, { save, record: recordFor(lang) });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('continue-game').waitFor();
    await page.getByTestId('continue-game').click();
    await page.waitForTimeout(450);
    await shoot(page, lang, 'game');
    await page.getByTestId('hint-button').click();
    await page.waitForTimeout(300);
    await shoot(page, lang, 'game-hint');
    issues.push(...errors);
    await context.close();
  }

  // Near-win, deterministic exact roll, result.
  {
    const save = saveFor(lang, [99, 87, 0, 0], 0);
    save.state.players[1].position = 87;
    save.state.lastMove = {
      seat: 1,
      roll: 3,
      from: 84,
      raw: 87,
      to: 87,
      transport: 'none',
      overshoot: false,
      wins: false,
    };
    save.state.moves = [save.state.lastMove];
    const { context, page, errors } = await createPage(browser, lang, {
      save,
      record: recordFor(lang),
      random: 0,
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('continue-game').waitFor();
    await page.getByTestId('continue-game').click();
    await page.waitForTimeout(350);
    await page.getByTestId('roll-button').click();
    await page.getByTestId('result-card').waitFor();
    await delay(500);
    await shoot(page, lang, 'game-over');
    issues.push(...errors);
    await context.close();
  }

  // Rules.
  {
    const { context, page, errors } = await createPage(browser, lang, { record: recordFor(lang) });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-rules').waitFor();
    await page.getByTestId('home-rules').click();
    await page.locator('.rules-list').waitFor();
    await delay(250);
    await shoot(page, lang, 'rules');
    issues.push(...errors);
    await context.close();
  }

  // Family record.
  {
    const { context, page, errors } = await createPage(browser, lang, { record: recordFor(lang) });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-record').waitFor();
    await page.getByTestId('home-record').click({ force: true });
    await page.locator('.record-table').waitFor();
    await delay(250);
    await shoot(page, lang, 'record');
    issues.push(...errors);
    await context.close();
  }

  // Mobile home and game.
  {
    const { context, page, errors } = await createPage(browser, lang, {
      viewport: MOBILE,
      mobile: true,
      record: recordFor(lang),
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('play-local').waitFor();
    await delay(300);
    await shoot(page, lang, 'home-mobile');
    issues.push(...errors);
    await context.close();
  }
  {
    const save = saveFor(lang, [34, 58, 12, 0], 1);
    const { context, page, errors } = await createPage(browser, lang, {
      viewport: MOBILE,
      mobile: true,
      save,
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('continue-game').waitFor();
    await page.getByTestId('continue-game').click();
    await page.waitForTimeout(450);
    await shoot(page, lang, 'game-mobile');
    issues.push(...errors);
    await context.close();
  }

  // LAN lobby with a real guest connected. Requires a built dist/.
  let relay = null;
  try {
    const port = await freePort();
    relay = spawn(process.execPath, ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', String(port)], {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: true,
    });
    const up = await waitForRelay(port);
    if (!up) throw new Error('relay did not start');
    const host = await createPage(browser, lang, { relayPort: port });
    await host.page.goto(`${BASE}/?lanPort=${port}`, { waitUntil: 'domcontentloaded' });
    await host.page.getByTestId('play-lan').waitFor();
    await host.page.getByTestId('play-lan').click();
    await host.page.getByTestId('setup-begin').click();
    await host.page.locator('.qr-card code').waitFor();

    const inviteText = await host.page.locator('.qr-card code').innerText();
    const guest = await createPage(browser, lang, {});
    await guest.page.goto(`http://${inviteText}`, { waitUntil: 'domcontentloaded' });
    await guest.page.getByTestId('guest-join').waitFor();
    await guest.page.getByTestId('guest-join').click();
    await host.page.getByTestId('lan-start').waitFor();
    for (let attempt = 0; attempt < 30; attempt++) {
      if (!(await host.page.getByTestId('lan-start').isDisabled())) break;
      await delay(150);
    }
    await delay(350);
    await shoot(host.page, lang, 'lan');
    issues.push(...host.errors, ...guest.errors);
    await guest.context.close();
    await host.context.close();
  } catch (error) {
    issues.push(`LAN screenshot skipped: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    relay?.kill();
  }

  return issues;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failures = 0;
for (const lang of ['en', 'zh']) {
  const issues = await runLanguage(browser, lang);
  if (issues.length) {
    failures += issues.length;
    console.error(`screenshots ${lang}: ${issues.length} issue(s)`);
    for (const issue of issues.slice(0, 8)) console.error(`  - ${issue}`);
  } else {
    console.log(`screenshots ${lang}: ok`);
  }
}
await browser.close();
if (failures) process.exitCode = 1;
