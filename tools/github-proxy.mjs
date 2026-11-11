#!/usr/bin/env node
/**
 * Tiny CONNECT proxy that pins GitHub domains to reachable US IPs when the
 * local DNS answer is blackholed. Only used for repository publishing.
 */
import http from 'node:http';
import net from 'node:net';

const PINS = {
  'github.com': '140.82.112.3',
  'api.github.com': '140.82.112.6',
  'uploads.github.com': '140.82.112.6',
  'codeload.github.com': '140.82.112.3',
};

const server = http.createServer((_req, res) => {
  res.writeHead(405);
  res.end('CONNECT only');
});

server.on('connect', (req, socket, head) => {
  const [host, portText] = req.url.split(':');
  const port = Number(portText || 443);
  const target = PINS[host] || host;
  const upstream = net.connect(port, target, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(8888, '127.0.0.1', () => console.log('GitHub pin proxy on 127.0.0.1:8888'));
