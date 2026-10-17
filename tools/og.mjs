// Renders the Open Graph preview (1200x630) from the live page itself.
// node tools/og.mjs   (expects _site/ to be built)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { startServer, BASE } from './serve.mjs';

const chrome = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const server = await startServer('_site', 4393);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:4393${BASE}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: `
  .topbar, .sample-strip, .controls, .half-key { display: none !important; }
  body[data-view='court'] { height: 630px; }
  .view-court { padding-top: 22px; }
  .og-title { grid-area: controls; margin: 0; text-align: center; font: 900 46px/1 'Big Shoulders Display', sans-serif; text-transform: uppercase; color: #000; letter-spacing: 0.02em; }
` });
await page.evaluate(() => {
  const h = document.createElement('p');
  h.className = 'og-title';
  h.textContent = 'Volleyball game tracker: score it from the bench';
  document.getElementById('view-court').append(h);
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'assets/og.png', type: 'png' });
await browser.close();
server.close();
console.log('assets/og.png', Math.round(fs.statSync('assets/og.png').size / 1024), 'KB');
