import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveFile(filePath: string, res: ServerResponse, immutable: boolean): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  });
}

const INSTRUCTION_HTML = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>Splendor 局域网服务器</title>
<body style="font-family:system-ui;background:#0b1120;color:#f8f2e6;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:560px;line-height:1.8">
<h2 style="color:#f0bf62">Splendor 局域网服务器已启动</h2>
<p>尚未找到前端构建产物。请先在项目根目录执行：</p>
<pre style="background:#1a2440;padding:12px;border-radius:8px">npm run build</pre>
<p>然后刷新本页面。若只想快速游戏，也可以直接：</p>
<pre style="background:#1a2440;padding:12px;border-radius:8px">npm run lan</pre>
<p style="opacity:.6">（npm run lan 会先构建再启动服务器）</p>
</div>
</body></html>`;

/** 极简静态文件服务器（含 SPA 回退与目录穿越防护） */
export function createStaticHandler(distDir: string) {
  const root = path.resolve(distDir);
  const indexHtml = path.join(root, 'index.html');
  const hasBuild = () => fs.existsSync(indexHtml);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === '/ws') {
      res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Upgrade Required');
      return;
    }
    if (!hasBuild()) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(INSTRUCTION_HTML);
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(root, '.' + pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    const immutable = pathname.startsWith('/assets/');
    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isFile()) {
        serveFile(filePath, res, immutable);
        return;
      }
      // SPA 回退：无扩展名的路径回退到 index.html
      if (!path.extname(pathname)) {
        serveFile(indexHtml, res, false);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    });
  };
}
