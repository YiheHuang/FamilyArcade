import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../data/course.json');
const course = JSON.parse(readFileSync(file, 'utf8'));

function fail(message) {
  console.error(`data:verify FAILED — ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(course.version === 1, 'version must be 1');
assert(typeof course.source === 'string' && course.source.length > 10, 'source is required');
assert(course.count === 5, 'count must be 5');
assert(Array.isArray(course.balloons) && course.balloons.length === 5, 'exactly five balloons');
assert(course.trackLength === 20, 'trackLength must be 20');
assert(course.rounds === 4, 'rounds must be 4');
assert(course.tailwindPerPlayer === 2, 'tailwindPerPlayer must be 2');
assert(Array.isArray(course.startPositions) && course.startPositions.length === 5, 'start positions');
assert(course.startPositions.every((p) => p === 0), 'all balloons start at 0');

const ids = new Set();
const patterns = new Set(['stripes', 'dots', 'zigzag', 'rings', 'diamonds']);
for (const balloon of course.balloons) {
  assert(typeof balloon.id === 'string' && balloon.id.length > 0, 'balloon id');
  assert(!ids.has(balloon.id), `duplicate balloon id: ${balloon.id}`);
  ids.add(balloon.id);
  assert(typeof balloon.nameEn === 'string' && balloon.nameEn.trim(), `English name for ${balloon.id}`);
  assert(typeof balloon.nameZh === 'string' && balloon.nameZh.trim(), `Chinese name for ${balloon.id}`);
  assert(/^#[0-9a-f]{6}$/i.test(balloon.color), `colour for ${balloon.id}`);
  assert(/^#[0-9a-f]{6}$/i.test(balloon.light), `light colour for ${balloon.id}`);
  assert(patterns.has(balloon.pattern), `pattern for ${balloon.id}`);
}

assert(Array.isArray(course.windCards) && course.windCards.length === 5, 'five wind cards');
for (const value of course.windCards) {
  assert(Number.isInteger(value) && value >= 1 && value <= 3, `wind value ${value} outside 1–3`);
}
for (const value of [1, 2, 3]) {
  assert(course.windCards.includes(value), `wind deck is missing ${value}`);
}
assert([...course.windCards].sort().join(',') === '1,2,2,3,3', 'wind deck must be 1,2,2,3,3');

const scoring = course.scoring ?? {};
assert(scoring.roundLeader === 3, 'roundLeader must be 3');
assert(scoring.roundSecond === 1, 'roundSecond must be 1');
assert(scoring.overallLeader === 5, 'overallLeader must be 5');
assert(scoring.unusedTailwind === 1, 'unusedTailwind must be 1');

console.log(
  `course.json OK — ${course.balloons.length} balloons · ${course.trackLength} spaces · ${course.windCards.length} wind cards [${course.windCards.join(', ')}] · ${course.rounds} rounds`,
);
