// Copies only the files visitors need into _site/, exactly what Pages publishes.
import fs from 'node:fs';
import path from 'node:path';

const out = '_site';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', '404.html', 'css', 'js', 'fonts', 'assets']) {
  fs.cpSync(item, path.join(out, item), { recursive: true });
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const size = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((s, f) => s + size(path.join(p, f)), 0) : fs.statSync(p).size);
console.log(`built ${out}/ (${Math.round(size(out) / 1024)} KB)`);
