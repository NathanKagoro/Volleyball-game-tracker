// Drives the real page through a scoring session in headless Chrome:
// tap, picker, keyboard, undo, Escape, persistence, setup validation,
// new-match confirmation, substitution and chart export.
// node tools/flow.mjs   (expects _site/ to be built)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { startServer, BASE } from './serve.mjs';

const chrome = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const server = await startServer('_site', 4394);
const url = `http://127.0.0.1:4394${BASE}`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 360, height: 700, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  const score = () => page.evaluate(() => [document.querySelector('#flip-home').dataset.v, document.querySelector('#flip-away').dataset.v].join('-'));
  const open = (id) => page.evaluate((i) => document.getElementById(i).open, id);

  assert.equal(await score(), '9-8', 'lands on the sample');
  assert.equal(await page.$eval('#sample-strip', (e) => e.hidden), false);

  // tap, then kill, then a player: three taps
  await page.tap('#half-home');
  await wait(50);
  assert.equal(await score(), '10-8', 'point is on the board at once');
  assert.equal(await open('picker'), true);
  const focused = await page.evaluate(() => document.activeElement.dataset.how);
  assert.equal(focused, 'ace', 'focus moves into the picker');
  await page.click('#how-earned [data-how="kill"]');
  await page.click('#who-court button');
  assert.equal(await open('picker'), false);
  const last = await page.evaluate(() => JSON.parse(localStorage.getItem('vgt:match:v1')).events.at(-1));
  assert.equal(last.how, 'kill');
  assert.ok(last.player, 'player recorded');

  // Escape keeps the point with no detail
  await page.tap('#half-away');
  await page.keyboard.press('Escape');
  await wait(50);
  assert.equal(await open('picker'), false);
  assert.equal(await score(), '10-9');

  // keyboard: Z undoes, O scores
  await page.keyboard.press('z');
  assert.equal(await score(), '10-8');
  await page.keyboard.press('o');
  assert.equal(await open('picker'), true);
  await page.click('#pick-undo');
  assert.equal(await score(), '10-8', 'wrong-side undo');

  // a serving error is charged to the server without asking who
  const serving = await page.evaluate(() => document.querySelector('.spot.serving')?.closest('.half').dataset.team);
  const receiver = serving === 'home' ? 'away' : 'home';
  await page.tap(`#half-${receiver}`);
  await page.click('#how-error [data-how="serve_error"]');
  assert.equal(await open('picker'), false, 'two taps for a serving error');

  // persistence across reload
  const before = await score();
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await score(), before);

  // substitution
  await page.tap('#open-subs');
  await page.click('#subs-out button');
  await page.click('#subs-in button');
  await page.click('#subs-confirm');
  assert.equal(await open('subs'), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vgt:match:v1')).events.at(-1).t), 'sub');

  // setup validation
  await page.goto(`${url}#setup`);
  await page.type('#home-roster', '4, 4, Sam');
  await page.click('.btn-go');
  const err = await page.$eval('#home-roster-err', (e) => e.textContent);
  assert.match(err, /listed twice/);
  assert.match(err, /"Sam"/);

  // a real match, then replacing it asks first
  await page.$eval('#home-roster', (e) => { e.value = '1\n2\n3\n4\n5\n6\n7 Ama'; });
  await page.$eval('#away-roster', (e) => { e.value = '1,2,3,4,5,6'; });
  await page.type('#home-name', 'Us');
  await page.type('#away-name', 'Them');
  await page.click('.btn-go');
  await wait(50);
  assert.equal(await score(), '0-0');
  assert.equal(await page.$eval('#sample-strip', (e) => e.hidden), true);
  await page.keyboard.press('u');
  await page.keyboard.press('Escape');
  await page.goto(`${url}#setup`);
  await page.click('#load-sample');
  assert.equal(await open('confirm'), true, 'confirms before replacing a real match');
  await page.keyboard.press('Escape');
  await wait(50);
  assert.equal(await open('confirm'), false);
  await page.goto(`${url}#court`);
  assert.equal(await score(), '1-0', 'cancelling kept the match');

  // play the set out from 1-0: 24-23, then 25-23 ends set 1
  for (let i = 0; i < 23; i += 1) { await page.keyboard.press('u'); await page.keyboard.press('Escape'); await page.keyboard.press('o'); await page.keyboard.press('Escape'); }
  await page.keyboard.press('u'); await page.keyboard.press('Escape');
  assert.equal(await score(), '0-0', '25-23 wins set 1 and the board resets');
  assert.equal(await page.$eval('#board-set', (e) => e.textContent), 'Set 2');
  const plates = await page.$$eval('#plates .plate:not(.plate-empty)', (p) => p.length);
  assert.equal(plates, 1, 'set 1 plate hangs');

  // stats and chart export
  await page.goto(`${url}#stats`);
  await wait(100);
  assert.ok(await page.$('#chart svg'));
  assert.ok(await page.$$eval('#rally-table tbody tr', (r) => r.length) >= 48);
  await page.click('#download-png');
  await page.waitForFunction(() => document.querySelector('#export-msg').textContent !== '', { timeout: 8000 });
  assert.equal(await page.$eval('#export-msg', (e) => e.textContent), 'Chart downloaded.');
  await page.close();
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('flow ok');
