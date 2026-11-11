#!/usr/bin/env node
/**
 * Browser/dev LAN relay for Family Arcade games.
 *
 * The packaged Tauri app uses the shared Rust relay in `crates/lan-host`.
 * This Node server implements the same wire protocol so `npm run lan` works in
 * a plain browser and in Playwright tests.
 *
 *   node tools/lan-server.mjs --dist apps/triple/dist --port 8080
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const dist = path.resolve(option('dist', 'dist'));
const port = Number(option('port', '8080'));
const maxClients = 16;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

function serveFile(res, file) {
  const stream = createReadStream(file);
  stream.on('error', () => {
    res.writeHead(500);
    res.end('read error');
  });
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  stream.pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(dist, `.${pathname}`);
  if (!candidate.startsWith(dist)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    serveFile(res, candidate);
    return;
  }
  const index = path.join(dist, 'index.html');
  if (existsSync(index)) {
    serveFile(res, index);
    return;
  }
  res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    '<h1>Build the app first</h1><p>Run <code>npm run build</code>, then start the LAN server again.</p>',
  );
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 128 * 1024 });
/** @type {Map<number, {ws: import('ws').WebSocket, room: string, name: string}>} */
const clients = new Map();
let nextId = 1;
let hostId = null;

function send(ws, value) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value));
}

function broadcast(room, exceptId, value, to = null) {
  for (const [id, client] of clients) {
    if (client.room !== room) continue;
    if (id === exceptId) continue;
    if (to !== null && id !== to) continue;
    send(client.ws, value);
  }
}

wss.on('connection', (ws) => {
  if (clients.size >= maxClients) {
    send(ws, { t: 'error', code: 'full', msg: 'room is full' });
    ws.close();
    return;
  }
  const id = nextId++;
  clients.set(id, { ws, room: '', name: 'Player' });
  send(ws, { t: 'hello', id });

  ws.on('message', (buffer) => {
    let msg;
    try {
      msg = JSON.parse(buffer.toString());
    } catch {
      send(ws, { t: 'error', code: 'bad-json' });
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const kind = msg.t ?? '';

    if (kind === 'join') {
      const client = clients.get(id);
      if (!client) return;
      client.room = String(msg.room ?? '');
      client.name = String(msg.name ?? 'Player');
      if (hostId === null && msg.host === true) hostId = id;
      const isHost = hostId === id;
      console.log(`join id=${id} room=${client.room} host=${isHost} hostId=${hostId}`);
      broadcast(
        client.room,
        id,
        {
          t: 'peer-join',
          id,
          room: client.room,
          name: client.name,
          token: msg.token ?? null,
          code: msg.code ?? null,
          host: isHost,
        },
      );
      send(ws, { t: 'welcome', id, host: isHost, port });
      return;
    }

    const client = clients.get(id);
    if (!client || !client.room) {
      send(ws, { t: 'error', code: 'not-joined' });
      return;
    }
    const outgoing = { ...msg, from: id };
    if (hostId === id) {
      const to = typeof msg.to === 'number' ? msg.to : null;
      broadcast(client.room, id, outgoing, to);
    } else if (hostId !== null) {
      const host = clients.get(hostId);
      console.log(`guest id=${id} -> host id=${hostId} t=${kind}`);
      if (host) send(host.ws, outgoing);
    }
  });

  ws.on('close', () => {
    const client = clients.get(id);
    clients.delete(id);
    if (hostId === id) hostId = null;
    if (client?.room) {
      broadcast(client.room, id, { t: 'peer-leave', id, room: client.room });
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Family Arcade LAN relay: http://localhost:${port}  (dist: ${dist})`);
  console.log('Guests: open the shown URL on the same Wi-Fi, or scan the host QR code.');
});
