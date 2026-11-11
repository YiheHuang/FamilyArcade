#!/usr/bin/env node
// Structural gate for data/tiles.json. Keep this dependency-free so CI can run
// it before installing anything else.
import { readFileSync } from 'node:fs';

const FILE = new URL('../data/tiles.json', import.meta.url);
const EDGES = new Set(['city', 'road', 'field']);
const CENTERS = new Set(['city', 'road', 'monastery', 'field']);
const DIRECTIONS = ['N', 'E', 'S', 'W'];

const errors = [];
const notes = [];

let data;
try {
  data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (error) {
  console.error('FAIL: data/tiles.json is not valid JSON');
  console.error(String(error));
  process.exit(1);
}

if (data.version !== 1) errors.push(`version must be 1 (got ${data.version})`);
if (typeof data.source !== 'string' || data.source.length < 10) errors.push('source is missing');
if (!Number.isInteger(data.count) || data.count < 48 || data.count > 60) {
  errors.push(`count must be an integer 48–60 (got ${data.count})`);
}
if (!Array.isArray(data.types) || data.types.length < 10) errors.push('need at least 10 tile types');

const ids = new Set();
let copies = 0;
const edgeTally = { city: 0, road: 0, field: 0 };
const centerTally = { city: 0, road: 0, monastery: 0, field: 0 };

for (const type of data.types ?? []) {
  if (!type.id || typeof type.id !== 'string') {
    errors.push('tile type without id');
    continue;
  }
  if (ids.has(type.id)) errors.push(`duplicate tile id: ${type.id}`);
  ids.add(type.id);
  if (!type.name?.zh || !type.name?.en) errors.push(`${type.id}: missing bilingual name`);
  if (!Array.isArray(type.edges) || type.edges.length !== 4) {
    errors.push(`${type.id}: edges must have 4 entries`);
    continue;
  }
  const copiesForTally = Number.isInteger(type.copies) && type.copies > 0 ? type.copies : 1;
  type.edges.forEach((edge, i) => {
    if (!EDGES.has(edge)) errors.push(`${type.id}: bad ${DIRECTIONS[i]} edge "${edge}"`);
    edgeTally[edge] = (edgeTally[edge] ?? 0) + copiesForTally;
  });
  if (!CENTERS.has(type.center)) errors.push(`${type.id}: bad center "${type.center}"`);
  centerTally[type.center] = (centerTally[type.center] ?? 0) + copiesForTally;
  if (!Number.isInteger(type.copies) || type.copies < 1) {
    errors.push(`${type.id}: copies must be a positive integer`);
  } else {
    copies += type.copies;
  }
  if (type.center === 'city' && !type.edges.includes('city')) {
    errors.push(`${type.id}: a city centre needs a city edge`);
  }
  if (type.center === 'road' && !type.edges.includes('road')) {
    errors.push(`${type.id}: a road centre needs a road edge`);
  }
}

if (copies !== data.count) errors.push(`sum(copies)=${copies} but count=${data.count}`);
if (!data.startTile?.type || !ids.has(data.startTile.type)) {
  errors.push('startTile.type must reference a tile type');
}
if (![0, 1, 2, 3].includes(data.startTile?.rot)) errors.push('startTile.rot must be 0–3');
if (data.tileSize !== 100) errors.push('tileSize must be 100 (the renderer assumes it)');

const start = data.types.find((t) => t.id === data.startTile?.type);
if (start) {
  const typesOnStart = new Set(start.edges);
  notes.push(`start ${start.id}: ${start.edges.join('/')}`);
  notes.push(`start edge coverage: ${[...typesOnStart].join(', ')}`);
  if (typesOnStart.size < 3) {
    errors.push('start tile must offer at least three different edge types (placeability)');
  }
}

for (const edge of EDGES) {
  if (edgeTally[edge] === 0) errors.push(`no ${edge} edges in the set`);
  notes.push(`${edge} edges: ${edgeTally[edge]}`);
}
if (edgeTally.field < data.count * 0.5) errors.push('not enough field edges for a coherent field network');
if (edgeTally.city < data.count * 0.55) errors.push('not enough city edges');
if (edgeTally.road < data.count * 0.5) errors.push('not enough road edges');

notes.push(`centre features: ${JSON.stringify(centerTally)}`);
notes.push(`tile types: ${ids.size}, total copies: ${copies}`);

// Rotation signatures (a symmetric tile legitimately has fewer than four).
let signatures = 0;
for (const type of data.types ?? []) {
  const seen = new Set();
  for (let r = 0; r < 4; r++) {
    const rotated = type.edges.map((_, i) => type.edges[(i - r + 4) % 4]);
    seen.add(`${rotated.join('/')}/${type.center}`);
  }
  signatures += seen.size;
  if (seen.size < 1) errors.push(`${type.id}: no rotation signature`);
}
notes.push(`distinct rotation signatures: ${signatures}`);

if (errors.length > 0) {
  console.error('FAIL data/tiles.json');
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log('PASS data/tiles.json');
for (const note of notes) console.log(`  · ${note}`);
