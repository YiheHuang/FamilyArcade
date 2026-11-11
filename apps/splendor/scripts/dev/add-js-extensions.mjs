#!/usr/bin/env node
// 一次性工具：为 packages/engine/src 下所有 TS 文件的相对导入补全 .js 扩展名
// （使 tsc 构建产物可被 Node 直接以 ESM 方式引用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'packages', 'engine', 'src');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let changedFiles = 0;
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let changed = false;
  const next = text.replace(/(from\s+'(\.\.?\/[^']+)')/g, (full, quoted, spec) => {
    if (spec.endsWith('.js') || spec.endsWith('.json')) return full;
    // 检查目标是否存在
    const candidates = [path.resolve(dir, spec + '.ts'), path.resolve(dir, spec, 'index.ts')];
    if (candidates.some((c) => fs.existsSync(c))) {
      changed = true;
      const isDirIndex = !fs.existsSync(path.resolve(dir, spec + '.ts')) && fs.existsSync(path.resolve(dir, spec, 'index.ts'));
      const replaced = isDirIndex ? spec + '/index.js' : spec + '.js';
      return `from '${replaced}'`;
    }
    return full;
  });
  if (changed) {
    fs.writeFileSync(file, next, 'utf8');
    changedFiles++;
    console.log('updated', path.relative(ROOT, file));
  }
}
console.log(`done: ${changedFiles} files`);
