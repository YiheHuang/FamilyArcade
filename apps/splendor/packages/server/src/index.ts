import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSplendorServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const SAVE_FILE = process.env.SPLENDOR_SAVE ?? path.resolve(__dirname, '../../../data/lan-rooms.json');
const UPDATES_DIR = process.env.SPLENDOR_UPDATES ?? path.resolve(__dirname, '../../../data/updates');
const PORT = Number(process.env.PORT ?? 8080);

const handle = await startSplendorServer({
  port: PORT,
  clientDir: CLIENT_DIST,
  saveFile: SAVE_FILE,
  updatesDir: UPDATES_DIR,
  onLog: (line) => console.log(`[splendor] ${line}`),
});

console.log('┌──────────────────────────────────────────────┐');
console.log('│  Splendor LAN server is running               │');
console.log('└──────────────────────────────────────────────┘');
console.log(`  Local:     ${handle.localUrl}`);
for (const u of handle.lanUrls) console.log(`  LAN:       ${u}`);
console.log(`  Room save: ${handle.saveFile}`);
console.log(`  Updates:   ${UPDATES_DIR}  (drop app.asar + update.json here to serve auto-updates)`);
if (!handle.hasClient) {
  console.log('  ! Client build not found — run `npm run build` (or `npm run lan`) first');
}

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  console.log('\n[splendor] Shutting down and saving rooms…');
  await handle.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
