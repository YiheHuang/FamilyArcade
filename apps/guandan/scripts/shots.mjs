import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5220';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function closeBrowser(browser) {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function waitHumanTurn(page, timeout = 30000) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.hint-button');
      return (
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        !document.querySelector('.privacy-gate') &&
        !document.querySelector('.result-panel') &&
        !document.querySelector('.tribute-panel')
      );
    },
    null,
    { timeout },
  );
}

async function playHint(page) {
  await page.locator('.hint-button').click();
  await page.waitForTimeout(120);
  const hinted = page.locator('.hand .playing-card.hint');
  const count = await hinted.count();
  if (count > 0) {
    const ids = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of ids) {
      await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    }
    await page.locator('.play-button').click();
    return true;
  }
  if (await page.locator('.pass-button').isEnabled().catch(() => false)) {
    await page.locator('.pass-button').click();
    return true;
  }
  return false;
}

async function finishRound(page) {
  for (let step = 0; step < 900; step += 1) {
    if (await page.locator('.result-panel').isVisible().catch(() => false)) return;
    const hint = page.locator('.hint-button');
    if (!(await hint.isEnabled().catch(() => false))) {
      await page.waitForTimeout(90);
      continue;
    }
    await playHint(page);
    await page.waitForTimeout(70);
  }
  throw new Error('screenshot round did not finish');
}

async function makeDesktop(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await page.addInitScript((value) => {
    window.__GUANDAN_FAST__ = true;
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.guandan.save');
    localStorage.removeItem('familyarcade.guandan.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(dir, 'home.png') });

  await page.getByRole('button', { name: /Solo against|单人对抗/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  await page.getByRole('button', { name: /Deal the cards|发牌开局/ }).click();
  await page.waitForTimeout(500);
  await waitHumanTurn(page);
  await playHint(page);
  await page.waitForTimeout(350);
  try {
    await waitHumanTurn(page, 10000);
  } catch {
    /* the round may already be over */
  }
  await page.screenshot({ path: path.join(dir, 'game.png') });

  if (await page.locator('.hint-button').isEnabled().catch(() => false)) {
    await page.locator('.hint-button').click();
    await page.waitForTimeout(180);
  }
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  await finishRound(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Play on until a real tribute screen appears; a round is +2 or +3 about two
  // times in three, so this normally takes one or two extra rounds.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = page.getByRole('button', { name: /Next round|下一局/ });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(350);
    }
    if (await page.locator('.tribute-panel').isVisible().catch(() => false)) {
      await page.screenshot({ path: path.join(dir, 'tribute.png') });
      await page.getByRole('button', { name: /Start the round|开始本局/ }).click();
      await page.waitForTimeout(250);
      break;
    }
    await finishRound(page);
    await page.waitForTimeout(300);
  }

  await page.locator('.game-top .back').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, 'stats.png') });

  await page.locator('.stats-shell .back').click();
  await page.waitForTimeout(180);
  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(dir, 'rules.png') });
  await page.getByRole('button', { name: /Close|关闭/ }).click();
  await page.waitForTimeout(180);

  await page.getByRole('button', { name: /LAN table|局域网牌桌/ }).click();
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(dir, 'lan.png') });
  await context.close();
}

async function makeMobile(browser, lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext(MOBILE);
  const page = await context.newPage();
  await page.addInitScript((value) => {
    window.__GUANDAN_FAST__ = true;
    localStorage.setItem('familyarcade.lang', value);
    localStorage.removeItem('familyarcade.guandan.save');
    localStorage.removeItem('familyarcade.guandan.record');
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'home-mobile.png') });

  await page.getByRole('button', { name: /Solo against|单人对抗/ }).click();
  await page.getByRole('button', { name: /Deal the cards|发牌开局/ }).click();
  await page.waitForTimeout(450);
  await waitHumanTurn(page);
  await page.locator('.hint-button').click();
  await page.waitForTimeout(180);
  const hinted = page.locator('.hand .playing-card.hint');
  if ((await hinted.count()) > 0) {
    const ids = await hinted.evaluateAll((els) =>
      els.map((element) => element.getAttribute('data-card')),
    );
    for (const id of ids) {
      await page.locator(`.hand .playing-card[data-card="${id}"]`).click();
    }
  }
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(dir, 'game-mobile.png') });
  await context.close();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const only = process.env.SHOTS_ONLY || 'all';
for (const lang of ['en', 'zh']) {
  if (only !== 'mobile') await makeDesktop(browser, lang);
  if (only !== 'desktop') await makeMobile(browser, lang);
  console.log(`screenshots ${lang}: ok`);
}
await closeBrowser(browser);
console.log(`screenshots written to ${OUT}`);
process.exit(0);
