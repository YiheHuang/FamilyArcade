/**
 * Shared Playwright helpers for Pair Up's real-browser checks and screenshots.
 * The app uses ?fast=1 to shorten the two staged delays (not the visuals).
 */

export async function prepare(page, lang = 'en', { sound = false } = {}) {
  await page.addInitScript(
    ({ language, audio }) => {
      localStorage.setItem('familyarcade.lang', language);
      localStorage.setItem('familyarcade.pair-up.sound', audio ? 'on' : 'off');
      if (!sessionStorage.getItem('pair-up.test-ready')) {
        localStorage.removeItem('familyarcade.pair-up.save');
        localStorage.removeItem('familyarcade.pair-up.record');
        sessionStorage.setItem('pair-up.test-ready', '1');
      }
    },
    { language: lang, audio: sound },
  );
}

export async function snapshotTiles(page) {
  return page.locator('.tile').evaluateAll((elements) =>
    elements.map((element) => {
      const emoji = element.querySelector('.tile-emoji')?.textContent?.trim() ?? null;
      return {
        index: Number(element.dataset.index),
        faceUp: element.classList.contains('face-up'),
        matched: element.classList.contains('matched'),
        disabled: element.disabled,
        emoji,
      };
    }),
  );
}

function learn(known, tiles) {
  for (const tile of tiles) {
    if (!tile.faceUp || !tile.emoji) continue;
    known.byIndex.set(tile.index, tile.emoji);
    const set = known.byEmoji.get(tile.emoji) ?? new Set();
    set.add(tile.index);
    known.byEmoji.set(tile.emoji, set);
  }
}

function knownPair(known, available) {
  const allowed = new Set(available.map((tile) => tile.index));
  for (const [emoji, indices] of known.byEmoji) {
    const hits = [...indices].filter((index) => allowed.has(index));
    if (hits.length >= 2) return { emoji, indices: hits.slice(0, 2) };
  }
  return null;
}

async function clickTile(page, index) {
  await page.locator('.tile').nth(index).click();
  await page.waitForTimeout(90);
}

async function availableTiles(page) {
  const tiles = await snapshotTiles(page);
  return tiles.filter((tile) => !tile.faceUp && !tile.matched && !tile.disabled);
}

export async function startLocal(page, { players = 2, size = 4, names = [] } = {}) {
  await page.getByRole('button', { name: /Pass & play|同屏轮流/ }).click();
  await page.waitForSelector('.setup-block');
  if (players !== 2) {
    await page.locator('.picker').nth(players - 2).click();
    await page.waitForTimeout(80);
  }
  if (size === 6) {
    await page.locator('.choice-card').nth(1).click();
  }
  for (let i = 0; i < names.length; i++) {
    const input = page.locator('.name-input input').nth(i);
    if (await input.count()) await input.fill(names[i]);
  }
  await page.locator('.row-actions .primary').first().click();
  await page.waitForSelector('.tile-grid .tile');
}

export async function startAi(page, { players = 2, size = 4, level = 'normal' } = {}) {
  await page.getByRole('button', { name: /Solo \+ AI|单人挑战/ }).click();
  await page.waitForSelector('.setup-block');
  if (players !== 2) {
    await page.locator('.picker').nth(players - 2).click();
    await page.waitForTimeout(80);
  }
  if (size === 6) await page.locator('.choice-card').nth(1).click();
  const levelOrder = ['companion', 'easy', 'normal', 'hard'];
  await page.locator('.level-card').nth(levelOrder.indexOf(level)).click();
  await page.locator('.row-actions .primary').first().click();
  await page.waitForSelector('.tile-grid .tile');
}

/** Play one pair attempt using only cards that have actually been seen. */
export async function playAttempt(page, known) {
  const tiles = await snapshotTiles(page);
  learn(known, tiles);
  const available = tiles.filter((tile) => !tile.faceUp && !tile.matched && !tile.disabled);
  if (available.length === 0) return { ok: false, matched: false };

  const pair = knownPair(known, available);
  const unknown = available.filter((tile) => !known.byIndex.has(tile.index));
  const first = pair?.indices[0] ?? unknown[0]?.index ?? available[0].index;
  await clickTile(page, first);
  learn(known, await snapshotTiles(page));

  const afterFirst = await snapshotTiles(page);
  const open = afterFirst.find((tile) => tile.faceUp && !tile.matched);
  const stillAvailable = afterFirst.filter(
    (tile) => !tile.faceUp && !tile.matched && !tile.disabled,
  );
  let second = null;
  if (open?.emoji) {
    const mates = known.byEmoji.get(open.emoji) ?? new Set();
    second = stillAvailable.find((tile) => mates.has(tile.index))?.index ?? null;
  }
  if (second === null) {
    const unknownSecond = stillAvailable.filter((tile) => !known.byIndex.has(tile.index));
    second = unknownSecond[0]?.index ?? stillAvailable[0]?.index ?? null;
  }
  if (second === null) return { ok: false, matched: false };

  await clickTile(page, second);
  await page.waitForTimeout(50);
  const revealed = await snapshotTiles(page);
  learn(known, revealed);
  const matched = revealed.some((tile) => tile.matched);
  // The mismatched pair turns back after 130 ms in fast mode.
  await page.waitForTimeout(260);
  return { ok: true, matched };
}

export async function playAttempts(page, count, known = { byIndex: new Map(), byEmoji: new Map() }) {
  for (let i = 0; i < count; i++) {
    if (await page.locator('.result-banner').isVisible().catch(() => false)) break;
    await playAttempt(page, known);
  }
  return known;
}

/** A pair the table has already seen and can still flip. */
export async function availableKnownPair(page, known) {
  return knownPair(known, await availableTiles(page));
}

export async function playGame(page, maxAttempts = 60) {
  const known = { byIndex: new Map(), byEmoji: new Map() };
  for (let i = 0; i < maxAttempts; i++) {
    if (await page.locator('.result-banner').isVisible().catch(() => false)) return true;
    const result = await playAttempt(page, known);
    if (!result.ok) await page.waitForTimeout(120);
  }
  return page.locator('.result-banner').isVisible();
}

export async function readSave(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.pair-up.save');
    return raw ? JSON.parse(raw) : null;
  });
}

export async function readRecord(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('familyarcade.pair-up.record');
    return raw ? JSON.parse(raw) : null;
  });
}

export async function expectNoErrors(errors) {
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`);
}
