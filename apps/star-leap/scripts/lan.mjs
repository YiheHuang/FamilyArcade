#!/usr/bin/env node
/**
 * Thin wrapper around the shared Family Arcade relay.
 *
 * Defaults to :8080 (the documented LAN path). Set LAN_PORT to use another
 * port when 8080 is already occupied by another app.
 */
import { spawn } from 'node:child_process';

const port = String(process.env.LAN_PORT || '8080');
const child = spawn(
  process.execPath,
  ['../../tools/lan-server.mjs', '--dist', 'dist', '--port', port],
  { stdio: 'inherit' },
);

const stop = () => {
  if (!child.killed) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
