#!/usr/bin/env node
/** Build the three Family Arcade 3.0 launchers: offline, slim and Lite. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const drive = existsSync('T:\\') ? 'T:\\' : root;
const cwd = path.join(drive, 'apps', 'family-arcade');
const target = path.join(drive, 'target');
const bundleDir = path.join(target, 'release', 'bundle', 'nsis');
const releases = path.join(root, 'releases', 'family-arcade');
mkdirSync(releases, { recursive: true });
const cli = path.join(cwd, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

const builds = [
  {
    name: 'offline',
    args: ['build', '--bundles', 'nsis'],
    source: 'Family Arcade_3.0.0_x64-setup.exe',
    target: 'FamilyArcade_3.0.0_x64-setup.exe',
  },
  {
    name: 'slim',
    args: ['build', '--bundles', 'nsis', '--config', 'src-tauri/tauri.slim.conf.json'],
    source: 'Family Arcade Slim_3.0.0_x64-setup.exe',
    target: 'FamilyArcade_3.0.0_slim_x64-setup.exe',
  },
  {
    name: 'lite',
    args: [
      'build',
      '--features',
      'lite',
      '--bundles',
      'nsis',
      '--config',
      'src-tauri/tauri.lite.conf.json',
    ],
    source: 'Family Arcade Lite_3.0.0_x64-setup.exe',
    target: 'FamilyArcade_Lite_3.0.0_x64-setup.exe',
  },
];

for (const build of builds) {
  console.log(`\n=== ${build.name} ===`);
  let output = '';
  try {
    output = execFileSync(process.execPath, [cli, ...build.args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: target },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    });
    writeFileSync(path.join(root, 'releases', `hub-${build.name}-build.log`), output);
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    writeFileSync(path.join(root, 'releases', `hub-${build.name}-build.log`), output);
    console.error(`FAIL ${build.name}`);
    process.exitCode = 1;
    continue;
  }
  const built = path.join(bundleDir, build.source);
  if (!existsSync(built)) {
    console.error(`missing bundle ${built}`);
    process.exitCode = 1;
    continue;
  }
  const dest = path.join(releases, build.target);
  copyFileSync(built, dest);
  console.log(`${build.target}: ${(statSync(dest).size / 1024 / 1024).toFixed(2)} MB`);
}
console.log('\nthree launchers built');
