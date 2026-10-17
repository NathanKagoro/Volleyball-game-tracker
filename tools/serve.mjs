// Static server that mimics GitHub Pages serving the site at /Volleyball-game-tracker/.
// node tools/serve.mjs [dir] [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/Volleyball-game-tracker/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

export function startServer(dir, port) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === BASE.slice(0, -1)) { res.writeHead(301, { location: BASE }); return res.end(); }
    if (!p.startsWith(BASE)) { res.writeHead(404); return res.end('outside base'); }
    let file = path.join(root, p.slice(BASE.length));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      return res.end(fs.readFileSync(path.join(root, '404.html')));
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = '.', port = '4390'] = process.argv.slice(2);
  await startServer(dir, Number(port));
  console.log(`http://127.0.0.1:${port}${BASE}`);
}
