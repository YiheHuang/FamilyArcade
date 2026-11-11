import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5185';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const OPENING = [
  0, 30, 5, 31, 6, 36, 1, 11, 37, 10, 40, 2, 32, 12, 41, 3, 33, 7, 13, 42, 4, 34, 14, 8,
];

async function setLang(page, lang) {
  await page.addInitScript((value) => {
    localStorage.setItem('familyarcade.lang', value);
    if (!sessionStorage.getItem('boxes.shots.started')) {
      localStorage.removeItem('familyarcade.boxes.save');
      localStorage.removeItem('familyarcade.boxes.record');
      sessionStorage.setItem('boxes.shots.started', '1');
    }
  }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(320);
}

async function clickEdge(page, edge) {
  await page.locator(`.edge[data-edge="${edge}"]`).click();
  await page.waitForTimeout(30);
}

async function playEdges(page, edges) {
  for (const edge of edges) await clickEdge(page, edge);
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

  // Setup screen.
  await page.getByRole('button', { name: /Play against the AI|和 AI 下一局/ }).click();
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(dir, 'setup.png') });

  // Back home, then a real hot-seat game with boxes claimed by both sides.
  await page.locator('.narrow-shell .back').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await page.waitForTimeout(200);
  await playEdges(page, OPENING);
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(dir, 'game.png') });

  // Hint card and the highlighted edge.
  await page.getByRole('button', { name: /^Hint$|^提示$/ }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(dir, 'game-hint.png') });

  // Finish every remaining line.
  const remaining = await page
    .locator('.edge[data-edge]')
    .evaluateAll((nodes) =>
      nodes.filter((node) => !node.classList.contains('drawn')).map((node) => Number(node.dataset.edge)),
    );
  for (const edge of remaining) await clickEdge(page, edge);
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(dir, 'game-over.png') });

  // Home now carries a real one-game record.
  await page.locator('.result-banner .secondary').click();
  await page.waitForTimeout(280);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, 'home.png') });

  // Family record.
  await page.getByRole('button', { name: /Family record|家庭战绩/ }).click();
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(dir, 'records.png') });

  // Rules.
  await page.locator('.narrow-shell .back').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Rules|^规则/ }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: path.join(dir, 'rules.png') });

  // Phone layout.
  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  mobile.on('pageerror', (error) => errors.push(String(error)));
  await setLang(mobile, lang);
  await mobile.screenshot({ path: path.join(dir, 'home-mobile.png') });
  await mobile.getByRole('button', { name: /Two players|两人同屏/ }).click();
  await playEdges(mobile, OPENING.slice(0, 10));
  await mobile.waitForTimeout(260);
  await mobile.screenshot({ path: path.join(dir, 'game-mobile.png') });

  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

await run('en');
await run('zh');
