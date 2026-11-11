#!/usr/bin/env node
/**
 * 发布助手：`npm run release -- 1.6.0`
 *
 * 1. 若版本号还没改：同步 package.json / tauri.conf.json / Cargo.toml
 * 2. 若发布说明还没写：生成模板并停下，等你填写后再跑一次
 * 3. 跑全部质量检查（npm run check）
 * 4. 提交、打 tag、推送 —— CI 会构建并发布 Release
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法：npm run release -- <版本号>，例如 npm run release -- 1.6.0');
  process.exit(1);
}

const files = {
  pkg: join(root, 'package.json'),
  conf: join(root, 'src-tauri', 'tauri.conf.json'),
  cargo: join(root, 'src-tauri', 'Cargo.toml'),
  notes: join(root, 'docs', `release-notes-v${version}.md`),
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, obj) => writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);

const steps = [];
const run = (cmd, args, opts = {}) => {
  // node >=20 refuses to spawn .cmd shims without a shell (npm.cmd on Windows)
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
};

// ---- 1. version bump (idempotent)
const pkg = readJson(files.pkg);
const prev = pkg.version;
let bumped = false;
if (pkg.version !== version) {
  pkg.version = version;
  writeJson(files.pkg, pkg);
  // tauri.conf.json and Cargo.toml are edited line-wise so their formatting
  // (compact arrays, comments) survives the bump
  const conf = readFileSync(files.conf, 'utf8');
  writeFileSync(
    files.conf,
    conf.replace(/^(\s*)"version":\s*"[^"]+"/m, `$1"version": "${version}"`),
    'utf8',
  );
  const cargo = readFileSync(files.cargo, 'utf8');
  writeFileSync(
    files.cargo,
    cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`),
    'utf8',
  );
  bumped = true;
  steps.push(`版本号 ${prev} → ${version}（package.json / tauri.conf.json / Cargo.toml）`);
}

// ---- 2. release notes
if (!existsSync(files.notes)) {
  const template = `# v${version}

## 更新内容

- 

## 说明

- 安装包见本页下方的 Assets（Windows 10/11 x64）
`;
  writeFileSync(files.notes, template, 'utf8');
  console.log(`已创建 ${files.notes}`);
  console.log('请填写更新内容，然后重新运行：npm run release -- ' + version);
  process.exit(0);
}

const notes = readFileSync(files.notes, 'utf8');
steps.push(`发布说明 docs/release-notes-v${version}.md 已存在（${notes.length} 字符）`);

// ---- 3. quality gate
console.log('\n运行质量检查（tsc + vitest + cargo test）…');
if (process.platform === 'win32') {
  run('cmd.exe', ['/c', 'npm', 'run', 'check']);
} else {
  run('npm', ['run', 'check']);
}

// ---- 4. commit + tag + push
run('git', ['add', '-A']);
run('git', ['commit', '-m', `发布 v${version}`]);
run('git', ['tag', '-a', `v${version}`, '-m', `Blokus v${version}`]);
run('git', ['push']);
run('git', ['push', 'origin', `v${version}`]);

console.log('\n完成：');
for (const s of steps) console.log(` - ${s}`);
console.log(` - 已推送 tag v${version}，CI 将构建并发布 Release（gh release view v${version} 查看）`);
