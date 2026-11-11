import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  availableKnownPair,
  playAttempt,
  playGame,
  prepare,
  startLocal,
} from './harness.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:5190';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function shot(page, file) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: file });
}

async function run(lang) {
  const dir = path.join(OUT, lang);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const page = await browser.newPage({ viewport: DESKTOP });
  await prepare(page, lang, { sound: true });
  await page.goto(`${BASE}/?fast=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await shot(page, path.join(dir, 'home.png'));

  // AI setup: four seats, 6×6 deck, Hard selected.
  await page.getByRole('button', { name: /Solo \+ AI|单人挑战/ }).click();
  await page.waitForSelector('.setup-block');
  await page.locator('.picker').nth(2).click();
  await page.locator('.choice-card').nth(1).click();
  await page.locator('.level-card').nth(3).click();
  await page.waitForTimeout(280);
  await shot(page, path.join(dir, 'setup.png'));

  await page.locator('.back').first().click();
  await page.waitForTimeout(200);

  // A real four-player hot-seat table. Play until at least two pairs are open
  // and the table still remembers a pair (so the hint screenshot has two rings).
  await startLocal(page, { players: 4, size: 4 });
  const known = { byIndex: new Map(), byEmoji: new Map() };
  for (let i = 0; i < 16; i++) {
    const matched = await page.locator('.tile.matched').count();
    const pair = await availableKnownPair(page, known);
    if (matched >= 6 || (matched >= 4 && pair)) break;
    await playAttempt(page, known);
  }
  await page.waitForTimeout(320);
  await shot(page, path.join(dir, 'game.png'));

  await page.locator('.side-actions .secondary').nth(1).click();
  await page.waitForTimeout(420);
  await shot(page, path.join(dir, 'game-hint.png'));

  const finished = await playGame(page);
  if (!finished) throw new Error(`${lang}: game did not finish for the screenshot`);
  await page.waitForTimeout(450);
  await shot(page, path.join(dir, 'game-over.png'));

  await page.locator('.game-top .back').click();
  await page.waitForTimeout(300);
  await page.locator('.menu-links .text-button').nth(0).click();
  await page.waitForTimeout(300);
  await shot(page, path.join(dir, 'rules.png'));

  await page.locator('.back').first().click();
  await page.waitForTimeout(200);
  await page.locator('.menu-links .text-button').nth(1).click();
  await page.waitForTimeout(300);
  await shot(page, path.join(dir, 'stats.png'));

  // Real phone viewport, 2× density (780 × 1688 output).
  const mobile = await browser.newPage({
    viewport: MOBILE,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await prepare(mobile, lang, { sound: true });
  await mobile.goto(`${BASE}/?fast=1`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(350);
  await shot(mobile, path.join(dir, 'home-mobile.png'));

  await startLocal(mobile, { players: 2, size: 4 });
  const mobileKnown = { byIndex: new Map(), byEmoji: new Map() };
  for (let i = 0; i < 10; i++) {
    if ((await mobile.locator('.tile.matched').count()) >= 4) break;
    await playAttempt(mobile, mobileKnown);
  }
  await mobile.waitForTimeout(320);
  await shot(mobile, path.join(dir, 'game-mobile.png'));

  await browser.close();
  console.log(`screenshots ${lang}: ok`);
}

const only = process.argv[2];
if (!only || only === 'en') await run('en');
if (!only || only === 'zh') await run('zh');
