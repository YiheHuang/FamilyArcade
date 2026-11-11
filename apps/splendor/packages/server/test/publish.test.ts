import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAsarPayload } from '../src/asar-check.js';
import { startSplendorServer, type SplendorServerHandle, type StartServerOptions } from '../src/server.js';

/** Build a minimal but structurally valid asar archive (same layout as @electron/asar). */
function makeAsar(files: Record<string, string | Buffer>, version = '9.9.9'): Buffer {
  const entries: Array<{ name: string; data: Buffer; offset: number; size: number }> = [];
  const withPkg: Record<string, string | Buffer> = { 'package.json': JSON.stringify({ version }), ...files };
  let offset = 0;
  for (const [name, content] of Object.entries(withPkg)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    entries.push({ name, data, offset, size: data.length });
    offset += data.length;
  }
  const tree: Record<string, unknown> = { files: {} };
  for (const e of entries) {
    (tree.files as Record<string, unknown>)[e.name] = { size: e.size, offset: String(e.offset) };
  }
  const jsonBuf = Buffer.from(JSON.stringify(tree), 'utf8');
  const paddedPayload = 4 + jsonBuf.length + ((4 - ((4 + jsonBuf.length) % 4)) % 4);
  const blockSize = 4 + paddedPayload;
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(blockSize, 4);
  head.writeUInt32LE(paddedPayload, 8);
  head.writeUInt32LE(jsonBuf.length, 12);
  const pad = Buffer.alloc(paddedPayload - 4 - jsonBuf.length);
  return Buffer.concat([head, jsonBuf, pad, ...entries.map((e) => e.data)]);
}

const tmpDirs: string[] = [];
const handles: SplendorServerHandle[] = [];

afterEach(async () => {
  for (const h of handles.splice(0)) await h.close();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splendor-publish-'));
  tmpDirs.push(dir);
  return dir;
}

async function boot(updatesDir?: string, allowPublish = false): Promise<SplendorServerHandle> {
  const dir = tmpDir();
  const options: StartServerOptions = {
    port: 0,
    clientDir: path.join(dir, 'no-client'),
    saveFile: path.join(dir, 'rooms.json'),
    allowUpdatePublish: allowPublish,
    appVersion: '2.2.0',
    onLog: () => {},
  };
  if (updatesDir) options.updatesDir = updatesDir;
  const handle = await startSplendorServer(options);
  handles.push(handle);
  return handle;
}

describe('更新源与上传通道', () => {
  it('asar 头校验：合格 / 缺文件 / 截断', () => {
    const good = makeAsar({ 'dist/main.cjs': 'console.log(1)' });
    expect(checkAsarPayload(good)).toBeNull();
    const missing = makeAsar({ 'dist/other.cjs': 'x' });
    expect(checkAsarPayload(missing)).toMatch(/missing dist\/main\.cjs/);
    expect(checkAsarPayload(Buffer.alloc(8))).toMatch(/too small/);
    const truncated = good.subarray(0, 12);
    expect(checkAsarPayload(truncated)).not.toBeNull();
  });

  it('welcome 通告更新源：未配置 / 已配置但无包 / 有包', async () => {
    const none = await boot();
    const ws1 = await greet(none);
    expect(ws1.updates ?? false).toBe(false);

    const dir = tmpDir();
    const empty = await boot(dir);
    const ws2 = await greet(empty);
    expect(ws2.updates).toBe(true);
    expect(ws2.updateVersion ?? null).toBeNull();
    expect(ws2.updatePublish).toBe(false);

    fs.writeFileSync(path.join(dir, 'update.json'), JSON.stringify({ version: '2.2.0' }), 'utf8');
    // 更新源版本有 3 秒缓存（避免每次握手都读盘），稍等再问
    await new Promise((r) => setTimeout(r, 3100));
    const ws3 = await greet(empty);
    expect(ws3.updateVersion).toBe('2.2.0');
  });

  it('上传通道：默认关闭返回 400；开启后可上传、校验 sha256、落盘并保留 .prev', async () => {
    const dir = tmpDir();
    const handle = await boot(dir, false);
    const payload = makeAsar({ 'dist/main.cjs': 'ok', 'dist/chunk.bin': Buffer.alloc(20480) }, '3.0.0');
    const sha = crypto.createHash('sha256').update(payload).digest('hex');

    const denied = await publish(handle, payload, '3.0.0', sha);
    expect(denied.status).toBe(400);
    expect(String(denied.body.error)).toMatch(/disabled/);

    handle.setAllowUpdatePublish(true);
    const badSha = await publish(handle, payload, '3.0.0', 'f'.repeat(64));
    expect(badSha.status).toBe(400);
    expect(String(badSha.body.error)).toMatch(/sha256/);

    const wrongShape = await publish(handle, makeAsar({ 'dist/other.cjs': 'x' }), '3.0.0', crypto.createHash('sha256').update(makeAsar({ 'dist/other.cjs': 'x' })).digest('hex'));
    expect(wrongShape.status).toBe(400);

    const ok = await publish(handle, payload, '3.0.0', sha);
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'app.asar')).equals(payload)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'update.json'), 'utf8')) as { version: string; sha256: string };
    expect(manifest.version).toBe('3.0.0');
    expect(manifest.sha256).toBe(sha);

    // 再上传一版 → 旧包保留为 app.asar.prev
    const payload2 = makeAsar({ 'dist/main.cjs': 'ok2', 'dist/chunk.bin': Buffer.alloc(20480) }, '3.1.0');
    const sha2 = crypto.createHash('sha256').update(payload2).digest('hex');
    const ok2 = await publish(handle, payload2, '3.1.0', sha2);
    expect(ok2.status).toBe(200);
    expect(fs.existsSync(path.join(dir, 'app.asar.prev'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'app.asar')).equals(payload2)).toBe(true);

    // 上传后 welcome 里版本更新
    const ws = await greet(handle);
    expect(ws.updateVersion).toBe('3.1.0');
  });
});

/** 连上服务器并取回 welcome 消息 */
async function greet(handle: SplendorServerHandle): Promise<Record<string, unknown>> {
  const { WebSocket } = await import('ws');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('welcome timeout'));
    }, 5000);
    ws.on('message', (data) => {
      clearTimeout(timer);
      const msg = JSON.parse(String(data)) as Record<string, unknown>;
      ws.close();
      resolve(msg);
    });
    ws.on('error', reject);
  });
}

async function publish(
  handle: SplendorServerHandle,
  payload: Buffer,
  version: string,
  sha256: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: handle.port,
        path: '/updates/publish',
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': payload.length,
          'x-splendor-version': version,
          'x-splendor-sha256': sha256,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          } catch {
            body = {};
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}
