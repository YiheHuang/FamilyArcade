export const FILES = 'abcde';

export function squareIndex(name) {
  return (6 - Number(name[1])) * 5 + FILES.indexOf(name[0]);
}

// A deterministic hot-seat game from the opening to a Black checkmate.
// It also exercises a pawn promotion (a2–a1=R) and several captures.
export const CHECKMATE_LINE = [
  ['b2', 'b3'],
  ['e5', 'e4'],
  ['c2', 'c3'],
  ['d5', 'd3'],
  ['a2', 'a4'],
  ['b5', 'a4'],
  ['e2', 'd3'],
  ['a4', 'b3'],
  ['c1', 'a3'],
  ['e4', 'd3'],
  ['a3', 'b4'],
  ['e6', 'e1'],
  ['d1', 'e1'],
  ['c5', 'b4'],
  ['c3', 'b4'],
  ['c6', 'b5'],
  ['a1', 'a2'],
  ['b3', 'a2'],
  ['b1', 'c3'],
  ['a2', 'a1'],
  ['c3', 'b1'],
  ['d6', 'e6'],
  ['b4', 'a5'],
  ['a1', 'b1'],
];

export async function clickSquare(page, name, wait = 70) {
  await page.locator(`.square[data-square="${squareIndex(name)}"]`).click();
  if (wait) await page.waitForTimeout(wait);
}

export async function playCheckmateLine(page, onPromotion) {
  let promotionSeen = false;
  for (const [from, to] of CHECKMATE_LINE) {
    await clickSquare(page, from, 40);
    await clickSquare(page, to, 40);
    if (from === 'a2' && to === 'a1') {
      await page.locator('.promotion-card').waitFor({ state: 'visible' });
      promotionSeen = true;
      if (onPromotion) await onPromotion();
      await page.locator('.promotion-choice').first().click();
      await page.waitForTimeout(80);
    }
  }
  return promotionSeen;
}
