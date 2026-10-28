// Local gallery server: serves the workspace on 127.0.0.1, never .env or dotfiles. Supports byte
// ranges so browsers can scrub through slide-motion's MP4s.
// Copied verbatim between carousel-studio and slide-motion (scripts/lib/) - keep the two copies identical.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fail } from './workspace.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4',
};

export function serve(ws, port = 4173) {
  const root = path.resolve(ws);
  http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.resolve(root, '.' + (urlPath === '/' ? '/gallery.html' : urlPath));
    if (!file.startsWith(root + path.sep) || /(^|[\\/])\./.test(path.relative(root, file)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('Not found');
    }
    const size = fs.statSync(file).size;
    const head = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }).listen(port, '127.0.0.1', () => console.log(`Gallery: http://localhost:${port}/  (Ctrl+C to stop)`))
    .on('error', e => fail(e.code === 'EADDRINUSE' ? `port ${port} is in use - try --port ${port + 1}` : e.message));
}
