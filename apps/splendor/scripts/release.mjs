#!/usr/bin/env node
/**
 * One-command release for the Tauri shell.
 *
 *   npm run release                     # patch bump of the Tauri version
 *   npm run release -- --version 2.4.0
 *   npm run release -- --dry            # everything except commit/tag/push
 *   npm run release -- --skip-tests
 *   npm run release -- --yes
 *
 * Outputs (packages/desktop/release/):
 *   Splendor-Setup-<version>.exe     installer (also attached to the GitHub release)
 *   updates/update.json              signed update manifest
 *   updates/Splendor-Setup-<v>.exe   payload served over the LAN
 *   updates/Splendor-Setup-prev.exe  previous payload, used for automatic rollback
 *
 * Signing: Ed25519. The private key lives outside the repo
 * (%APPDATA%/Splendor/keys/ed25519-private.pem or $SPLENDOR_SIGNING_KEY);
 * the matching public key is compiled into the app (`update.rs`). Without a key
 * the manifest is still written but marked unsigned (sha256 only).
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_CONF = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json');
const CARGO_TOML = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'Cargo.toml');
const NSIS_DIR = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const OUT_DIR = path.join(ROOT, 'packages', 'desktop', 'release');
const UPDATES_DIR = path.join(OUT_DIR, 'updates');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = flag('dry');
const skipTests = flag('skip-tests');
const assumeYes = flag('yes');
const log = (m) => console.log(`[release] ${m}`);

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  const res = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts });
  if (res.status !== 0) throw new Error(`command failed (${res.status}): ${cmd}`);
}
function capture(cmd) {
  const res = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });
  return (res.stdout ?? '').trim();
}
async function confirm(question) {
  if (assumeYes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const bumpPatch = (v) => {
  const parts = v.split('.').map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join('.');
};

function signingKey() {
  if (process.env.SPLENDOR_SIGNING_KEY && fs.existsSync(process.env.SPLENDOR_SIGNING_KEY)) {
    return fs.readFileSync(process.env.SPLENDOR_SIGNING_KEY, 'utf8');
  }
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const pem = path.join(appData, 'Splendor', 'keys', 'ed25519-private.pem');
  if (fs.existsSync(pem)) return fs.readFileSync(pem, 'utf8');
  return null;
}

(async () => {
  const dirty = capture('git status --porcelain');
  if (dirty && !dry) {
    log('working tree is not clean:');
    console.log(dirty.split('\n').slice(0, 10).join('\n'));
    log('commit or stash first (or use --dry)');
    process.exit(1);
  }

  const conf = JSON.parse(fs.readFileSync(TAURI_CONF, 'utf8'));
  const current = conf.version;
  const next = value('version') ?? bumpPatch(current);
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    log(`invalid version: ${next}`);
    process.exit(1);
  }
  const tag = `v${next}`;
  log(`version ${current} -> ${next}`);
  if (!(await confirm(`build and release ${tag} (Tauri shell)?`))) {
    log('aborted');
    process.exit(1);
  }

  // 1) version bump（Tauri 配置与 Cargo.toml 保持一致）
  fs.writeFileSync(TAURI_CONF, fs.readFileSync(TAURI_CONF, 'utf8').replace(`"version": "${current}"`, `"version": "${next}"`), 'utf8');
  fs.writeFileSync(CARGO_TOML, fs.readFileSync(CARGO_TOML, 'utf8').replace(`version = "${current}"`, `version = "${next}"`, 1), 'utf8');

  // 2) checks
  if (!skipTests) {
    run('npm run typecheck');
    run('npm test');
  }

  // 3) build client + Tauri installer
  run('npm run build');
  run('npm run build -w @splendor/desktop');

  // 4) collect installer
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const built = fs
    .readdirSync(NSIS_DIR)
    .filter((f) => f.endsWith('.exe'))
    .map((f) => path.join(NSIS_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!built) throw new Error(`no installer found in ${NSIS_DIR}`);
  const installerName = `Splendor-Setup-${next}.exe`;
  const installerPath = path.join(OUT_DIR, installerName);
  fs.copyFileSync(built, installerPath);
  const bytes = fs.readFileSync(installerPath);
  const digest = sha256(bytes);
  log(`${installerName} · ${(bytes.length / 1024 / 1024).toFixed(2)} MB · sha256 ${digest.slice(0, 16)}…`);

  // 5) update bundle（含上一版负载，供自动回滚）
  fs.mkdirSync(UPDATES_DIR, { recursive: true });
  const prevPayload = path.join(UPDATES_DIR, 'Splendor-Setup-prev.exe');
  const currentPayload = path.join(UPDATES_DIR, installerName);
  // 旧负载转为 prev：优先按现有清单指向的包，保证回滚的是"上一版"
  let previousPayload = '';
  try {
    const prevManifest = JSON.parse(fs.readFileSync(path.join(UPDATES_DIR, 'update.json'), 'utf8'));
    if (typeof prevManifest.installer === 'string') previousPayload = prevManifest.installer;
  } catch {
    previousPayload = '';
  }
  if (!previousPayload || !fs.existsSync(path.join(UPDATES_DIR, previousPayload))) {
    previousPayload =
      fs
        .readdirSync(UPDATES_DIR)
        .filter((f) => f.startsWith('Splendor-Setup-') && f.endsWith('.exe') && f !== 'Splendor-Setup-prev.exe')
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .pop() ?? '';
  }
  if (previousPayload && fs.existsSync(path.join(UPDATES_DIR, previousPayload))) {
    fs.copyFileSync(path.join(UPDATES_DIR, previousPayload), prevPayload);
  }
  fs.copyFileSync(installerPath, currentPayload);
  // 清掉更早的载荷，更新源目录只留"当前 + 回滚"
  for (const stale of fs.readdirSync(UPDATES_DIR)) {
    const isPayload = stale.startsWith('Splendor-Setup-') && stale.endsWith('.exe') && stale !== 'Splendor-Setup-prev.exe';
    if (isPayload && stale !== installerName) {
      fs.rmSync(path.join(UPDATES_DIR, stale), { force: true });
    }
  }

  const key = signingKey();
  let signature = '';
  if (key) {
    const priv = crypto.createPrivateKey(key);
    signature = crypto.sign(null, Buffer.from(digest, 'hex'), priv).toString('base64');
    log(`manifest signed (Ed25519, ${signature.slice(0, 12)}…)`);
  } else {
    log('no signing key found — manifest written with sha256 only (unsigned)');
  }
  const manifest = {
    version: next,
    installer: installerName,
    sha256: digest,
    size: bytes.length,
    signature,
    createdAt: new Date().toISOString(),
    notes: value('notes') ?? '',
  };
  fs.writeFileSync(path.join(UPDATES_DIR, 'update.json'), JSON.stringify(manifest, null, 2), 'utf8');
  log(`update bundle ready: ${UPDATES_DIR}`);

  // 6) optional delivery to the family's update folder
  let updateDir = process.env.SPLENDOR_UPDATE_DIR ?? '';
  const localCfg = path.join(ROOT, '.release.json');
  if (!updateDir && fs.existsSync(localCfg)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(localCfg, 'utf8'));
      updateDir = typeof cfg?.updateDir === 'string' ? cfg.updateDir : '';
    } catch {
      log('.release.json is not valid JSON (ignored)');
    }
  }
  if (updateDir) {
    if (!fs.existsSync(updateDir)) throw new Error(`update source folder not found: ${updateDir}`);
    for (const name of fs.readdirSync(UPDATES_DIR)) {
      fs.copyFileSync(path.join(UPDATES_DIR, name), path.join(updateDir, name));
    }
    log(`delivered the update bundle to ${updateDir}`);
  } else {
    log('no update source folder configured (SPLENDOR_UPDATE_DIR / .release.json) — skipped delivery');
  }

  if (dry) {
    log('dry run: skipped commit/tag/push');
    return;
  }
  if (capture('git status --porcelain')) {
    run('git add -A');
    run(`git commit -m "v${next}"`);
  } else {
    log('no changes to commit');
  }
  if (capture(`git tag -l ${tag}`)) {
    log(`tag ${tag} already exists — skipping tag/push`);
    return;
  }
  run(`git tag -a ${tag} -m "Splendor Family Edition ${tag} (Tauri shell)"`);
  run('git push origin HEAD');
  run(`git push origin ${tag}`);
  log(`done — the release workflow will publish ${tag}`);
})().catch((err) => {
  log(`failed: ${String(err)}`);
  process.exit(1);
});
