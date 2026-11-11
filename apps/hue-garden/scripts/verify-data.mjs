import { readFileSync } from 'node:fs';

const path = 'data/tiles.json';
const data = JSON.parse(readFileSync(path, 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

if (data.version !== 1) fail(`version must be 1, got ${data.version}`);
if (typeof data.source !== 'string' || data.source.length < 10) fail('source must be a sentence');
if (data.count !== 108) fail(`count must be 108, got ${data.count}`);

const colors = data.colors;
const shapes = data.shapes;
if (!Array.isArray(colors) || colors.length !== 6) fail('need exactly six colours');
if (!Array.isArray(shapes) || shapes.length !== 6) fail('need exactly six shapes');
if (!Array.isArray(data.items)) fail('items must be an array');

const items = Array.isArray(data.items) ? data.items : [];
const combos = new Set();
let total = 0;
const perColor = Object.fromEntries((colors || []).map((c) => [c, 0]));
const perShape = Object.fromEntries((shapes || []).map((s) => [s, 0]));

for (const item of items) {
  if (!colors.includes(item.color)) fail(`unknown colour ${item.color}`);
  if (!shapes.includes(item.shape)) fail(`unknown shape ${item.shape}`);
  const key = `${item.color}/${item.shape}`;
  if (combos.has(key)) fail(`duplicate combo ${key}`);
  combos.add(key);
  if (item.copies !== 3) fail(`${key} copies must be 3, got ${item.copies}`);
  total += item.copies;
  if (perColor[item.color] !== undefined) perColor[item.color] += item.copies;
  if (perShape[item.shape] !== undefined) perShape[item.shape] += item.copies;
}

if (items.length !== 36) fail(`need 36 combos, got ${items.length}`);
if (total !== 108) fail(`total copies must be 108, got ${total}`);
for (const color of colors || []) {
  if (perColor[color] !== 18) fail(`colour ${color} must have 18 tiles, got ${perColor[color]}`);
}
for (const shape of shapes || []) {
  if (perShape[shape] !== 18) fail(`shape ${shape} must have 18 tiles, got ${perShape[shape]}`);
}
for (const color of colors || []) {
  for (const shape of shapes || []) {
    if (!combos.has(`${color}/${shape}`)) fail(`missing combo ${color}/${shape}`);
  }
}

if (errors.length > 0) {
  console.error(`data:verify FAILED (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `data:verify OK — ${items.length} combos, ${total} tiles, 18 per colour, 18 per shape, 3 copies each`,
);
