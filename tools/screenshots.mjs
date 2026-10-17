// Screenshots of the built site at 1440, 390 and 360 px wide, plus the point
// picker and the stats screen. Fails on any console error or failed request.
// node tools/screenshots.mjs [dir] [port]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { startServer, BASE } from './serve.mjs';

const [dir = '_site', port = '4391'] = process.argv.slice(2);
const chrome = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const server = await startServer(dir, Number(port));
const url = `http://127.0.0.1:${port}${BASE}`;
fs.mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const problems = [];
const sizes = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '360', width: 360, height: 800, mobile: true },
  { name: '360x640', width: 360, height: 640, mobile: true },
  { name: 'landscape', width: 740, height: 360, mobile: true },
];
try {
  for (const s of sizes) {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${s.name}: console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${s.name}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${s.name}: ${r.status()} ${r.url()}`); });
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `shots/court-${s.name}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1);
    if (overflow) problems.push(`${s.name}: the live scoring screen scrolls`);
    if (s.name === '360' || s.name === '1440') {
      await page.click('#half-home');
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: `shots/picker-${s.name}.png` });
      await page.keyboard.press('Escape');
      await page.goto(`${url}#stats`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 200));
      await page.screenshot({ path: `shots/stats-${s.name}.png`, fullPage: true });
      await page.goto(`${url}#setup`, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: `shots/setup-${s.name}.png`, fullPage: true });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (wide) problems.push(`${s.name}: horizontal scroll on a secondary screen`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('screenshots written to shots/');
