#!/usr/bin/env node
/**
 * data:verify — checks the card catalogue before build/test.
 * Rules checked:
 *  - 6 dessert types, 12 copies each, 72 cards total
 *  - ids are unique, continuous 0..71, and every item points at a real type
 *  - copy numbers are 1..12 per type
 *  - every card is worth exactly 1 leftover point
 *  - names/colours/shapes exist, and colours look like hex values
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('data/cards.json');
const raw = await readFile(file, 'utf8');
const errors = [];
const fail = (message) => {
  errors.push(message);
};

let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  fail(`cards.json is not valid JSON: ${error.message}`);
  data = {};
}

if (data.version !== 1) fail(`version must be 1, got ${JSON.stringify(data.version)}`);
if (typeof data.source !== 'string' || data.source.trim().length < 10) {
  fail('source must be a non-empty sentence');
}
if (!Array.isArray(data.types) || data.types.length !== 6) {
  fail(`expected 6 dessert types, got ${Array.isArray(data.types) ? data.types.length : typeof data.types}`);
}
if (!Array.isArray(data.items) || data.items.length !== 72) {
  fail(`expected 72 cards, got ${Array.isArray(data.items) ? data.items.length : typeof data.items}`);
}
if (data.count !== 72) fail(`count must be 72, got ${JSON.stringify(data.count)}`);

const types = Array.isArray(data.types) ? data.types : [];
const items = Array.isArray(data.items) ? data.items : [];
const typeIds = new Set();
const seenType = new Map();

for (const type of types) {
  if (!type || typeof type.id !== 'string' || !/^[a-z][a-z-]*$/.test(type.id)) {
    fail(`bad type id: ${JSON.stringify(type?.id)}`);
    continue;
  }
  if (typeIds.has(type.id)) fail(`duplicate type id: ${type.id}`);
  typeIds.add(type.id);
  if (typeof type.zh !== 'string' || !type.zh) fail(`type ${type.id}: missing zh name`);
  if (typeof type.en !== 'string' || !type.en) fail(`type ${type.id}: missing en name`);
  for (const key of ['color', 'deep', 'light']) {
    if (typeof type[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(type[key])) {
      fail(`type ${type.id}: ${key} is not a 6-digit hex colour`);
    }
  }
  if (typeof type.shape !== 'string' || !type.shape) fail(`type ${type.id}: missing shape`);
  if (type.copies !== 12) fail(`type ${type.id}: copies must be 12, got ${JSON.stringify(type.copies)}`);
}

const ids = new Set();
const byType = new Map();
for (const item of items) {
  if (!item || !Number.isInteger(item.id)) {
    fail(`card id must be an integer: ${JSON.stringify(item)}`);
    continue;
  }
  if (item.id < 0 || item.id > 71) fail(`card id out of range: ${item.id}`);
  if (ids.has(item.id)) fail(`duplicate card id: ${item.id}`);
  ids.add(item.id);
  if (!typeIds.has(item.type)) fail(`card ${item.id}: unknown type ${JSON.stringify(item.type)}`);
  if (!Number.isInteger(item.copy) || item.copy < 1 || item.copy > 12) {
    fail(`card ${item.id}: copy must be 1..12, got ${JSON.stringify(item.copy)}`);
  }
  if (item.value !== 1) fail(`card ${item.id}: value must be 1, got ${JSON.stringify(item.value)}`);
  byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
  seenType.set(`${item.type}:${item.copy}`, (seenType.get(`${item.type}:${item.copy}`) ?? 0) + 1);
}

for (let id = 0; id < 72; id++) {
  if (!ids.has(id)) fail(`missing card id: ${id}`);
}
for (const type of types) {
  const count = byType.get(type.id) ?? 0;
  if (count !== 12) fail(`type ${type.id}: expected 12 cards, got ${count}`);
  for (let copy = 1; copy <= 12; copy++) {
    const seen = seenType.get(`${type.id}:${copy}`) ?? 0;
    if (seen !== 1) fail(`type ${type.id}: copy ${copy} appears ${seen} times`);
  }
}
if (ids.size !== 72) fail(`unique card ids must be 72, got ${ids.size}`);

if (errors.length > 0) {
  console.error(`data:verify FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('data:verify OK');
console.log(`  types: ${types.length} (${types.map((t) => `${t.id}×12`).join(', ')})`);
console.log(`  cards: ${items.length}, ids 0..71 unique, every type has 12 copies`);
console.log('  source:', data.source);
