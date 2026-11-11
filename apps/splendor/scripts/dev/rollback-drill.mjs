#!/usr/bin/env node
/**
 * Rollback drill (Tauri shell).
 *
 * The update helper must never leave the family with a dead app:
 *   install → relaunch → wait for the boot beacon → no beacon ⇒ run the previous
 *   installer and report the failure.
 *
 * To exercise this without breaking anything we hand the helper:
 *   • installer:      our real silent installer (a harmless no-op re-install)
 *   • app_exe:        `cmd.exe /c exit`  → exits immediately, so no beacon ever arrives
 *   • prev_installer: a batch file that writes a marker → proves the rollback really ran
 *
 * Asserts: result json reports failure, the rollback marker exists and the helper log
 * shows the rollback path.
 *
 * Usage: node scripts/dev/rollback-drill.mjs   (needs a built app)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'splendor-desktop.exe');
const NSIS_DIR = path.join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const TMP = path.join(ROOT, 'data', 'tmp');
const DIR = path.join(TMP, 'app-profile-rollback-drill');

const log = (m) => console.log(`[rollback-drill] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!fs.existsSync(APP)) {
  log(`missing ${APP} — run: npm run build -w @splendor/desktop`);
  process.exit(1);
}
const installers = fs.existsSync(NSIS_DIR) ? fs.readdirSync(NSIS_DIR).filter((f) => f.endsWith('.exe')) : [];
if (installers.length === 0) {
  log('没有安装器可用：请先 npm run build -w @splendor/desktop');
  process.exit(1);
}
const installer = path.join(NSIS_DIR, installers.sort()[installers.length - 1]);

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, 'update-work'), { recursive: true });
fs.mkdirSync(path.join(DIR, 'logs'), { recursive: true });

// 回滚安装器 = 写一个标记文件
const rollbackMarker = path.join(DIR, 'update-work', 'rollback-ran.txt');
const rollbackScript = path.join(DIR, 'update-work', 'rollback-installer.cmd');
fs.writeFileSync(
  rollbackScript,
  `@echo off\r\necho rollback %date% %time% > "${rollbackMarker}"\r\nexit /b 0\r\n`,
  'utf8',
);

const job = {
  version: '9.9.9',
  installer,
  prev_installer: rollbackScript,
  app_exe: 'C:\\Windows\\System32\\cmd.exe',
  beacon: path.join(DIR, 'update-work', 'boot-ok.json'),
  result: path.join(DIR, 'update-work', 'last-result.json'),
  log: path.join(DIR, 'logs', 'update.log'),
  nonce: 'rollback-drill-nonce',
  args: ['/c', 'exit'],
};
const jobPath = path.join(DIR, 'update-work', 'job.json');
fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');

log('运行助手（安装装完后"应用"立刻退出 → 触发回滚）…');
const res = spawnSync(APP, ['--apply-update', jobPath], {
  env: { ...process.env, SPLENDOR_DATA_DIR: DIR },
  encoding: 'utf8',
  timeout: 240000,
});
log(`助手退出码 ${res.status}`);

const result = fs.existsSync(job.result) ? JSON.parse(fs.readFileSync(job.result, 'utf8')) : null;
const helperLog = fs.existsSync(job.log) ? fs.readFileSync(job.log, 'utf8') : '';
ok('助手写出了失败结果（未把坏版本留在机器上）', !!result && result.ok === false, JSON.stringify(result ?? '(无)'));
ok('失败原因指向"没等到启动回报"', /beacon|exited|did not/i.test(result?.reason ?? ''), result?.reason ?? '');
ok('回滚安装器确实被执行（标记文件存在）', fs.existsSync(rollbackMarker), rollbackMarker.replace(DIR, '<profile>'));
ok('助手日志记录了回滚过程', /回滚/.test(helperLog), helperLog.split('\n').filter(Boolean).slice(-2).join(' / '));

fs.rmSync(DIR, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass);
console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
process.exitCode = failed.length === 0 ? 0 : 1;
