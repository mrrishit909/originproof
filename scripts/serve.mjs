#!/usr/bin/env node
// Read-only static server for the OriginProof UI. 127.0.0.1 only, no dependencies.
// Serves app/, fixtures/ and packages/ (engine source) from the repo root. Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = ['app', 'fixtures', 'packages'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css' };
const port = Number(process.argv[2] || 0);

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (path === '/') path = '/app/index.html';
  const file = resolve(ROOT, '.' + normalize(path));
  const top = file.slice(ROOT.length + 1).split(sep)[0];
  if (req.method !== 'GET' || !file.startsWith(ROOT + sep) || !ALLOWED.includes(top)) {
    res.writeHead(403); return res.end('forbidden');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/app/index.html`));
