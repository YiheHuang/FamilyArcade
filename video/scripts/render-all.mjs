#!/usr/bin/env node
/**
 * Render every Promo-<slug>-<lang> composition. Four jobs at a time, each
 * Remotion process uses 3 browser tabs. Skips existing >1 MB files unless --force.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const games = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'games.json'), 'utf8'));
const force = process.argv.includes('--force');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(root, 'out');
const logDir = path.join(root, 'out', 'logs');
mkdirSync(outDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const jobs = [];
let jobIndex = 0;
for (const game of games) {
  if (only && !game.slug.includes(only)) continue;
  for (const lang of ['en', 'zh']) {
    const id = `Promo-${game.slug}-${lang}`;
    const output = path.join(outDir, `${game.slug}-${lang}.mp4`);
    if (!force && existsSync(output) && statSync(output).size > 1_000_000) {
      console.log(`skip ${id}`);
      continue;
    }
    jobs.push({ id, output, port: 3200 + jobIndex++, log: path.join(logDir, `${game.slug}-${lang}.log`) });
  }
}

let index = 0;
let failed = 0;

function renderOne(job) {
  return new Promise((resolve) => {
    const log = [];
    const child = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'),
        'render',
        'src/index.ts',
        job.id,
        job.output,
        '--codec=h264',
        '--crf=20',
        '--pixel-format=yuv420p',
        '--audio-codec=aac',
        '--audio-bitrate=160k',
        '--concurrency=3',
        `--port=${job.port}`,
        '--log=error',
        `--browser-executable=${chrome}`,
      ],
      { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk) => log.push(chunk.toString()));
    child.stderr.on('data', (chunk) => log.push(chunk.toString()));
    child.on('exit', (code) => {
      writeFileSync(job.log, log.join(''));
      if (code !== 0) {
        failed += 1;
        console.error(`FAIL ${job.id} (see ${job.log})`);
      } else {
        const size = existsSync(job.output) ? statSync(job.output).size : 0;
        console.log(`ok ${job.id} ${(size / 1048576).toFixed(1)} MB`);
      }
      resolve();
    });
  });
}

async function worker(workerId) {
  while (index < jobs.length) {
    const job = jobs[index++];
    console.log(`[${workerId}] render ${job.id}`);
    await renderOne(job);
  }
}

const workers = Number(process.env.RENDER_JOBS ?? 4);
await Promise.all(Array.from({ length: workers }, (_, index) => worker(index + 1)));
console.log(`render done: ${jobs.length - failed}/${jobs.length}, failed ${failed}`);
if (failed > 0) process.exit(1);
