import { test } from 'node:test';
import assert from 'node:assert/strict';
import { momentumSvg, runsOf, describeRally } from '../js/chart.js';
import { createMatch, addRally, derive } from '../js/logic.js';
import { sampleMatch } from '../js/sample.js';

test('one panel per set played and one hover title per rally', () => {
  const m = sampleMatch();
  const s = derive(m);
  const { svg } = momentumSvg(m, s, { width: 360 });
  assert.equal((svg.match(/<title>Set /g) || []).length, s.rallies.length);
  assert.match(svg, /Set 1 {2}26–24/);
  assert.match(svg, /Set 3 {2}9–8/);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 360 /);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('empty match draws an empty first set without errors', () => {
  const m = createMatch({ teams: { home: { name: 'A' }, away: { name: 'B' } } });
  const { svg } = momentumSvg(m, derive(m), { width: 1200, stacked: false });
  assert.match(svg, /Set 1</);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('team names are escaped in the SVG', () => {
  const m = createMatch({ teams: { home: { name: 'A&B <x>' }, away: { name: 'C' } } });
  const { svg } = momentumSvg(m, derive(m), { width: 600 });
  assert.match(svg, /A&amp;B &lt;x&gt;/);
});

test('runs of three or more are found per team', () => {
  const r = (w) => ({ winner: w });
  const runs = runsOf(['home', 'home', 'home', 'away', 'away', 'away', 'away', 'home'].map(r));
  assert.deepEqual(runs.map((x) => [x.team, x.from, x.to, x.length]), [['home', 0, 2, 3], ['away', 3, 6, 4]]);
});

test('rally descriptions name the player and their team for errors', () => {
  let m = createMatch({ firstServe: 'away', teams: { home: { name: 'Us', players: [{ number: '4', name: 'Ama' }] }, away: { name: 'Them', players: [{ number: '4' }] } } });
  m = addRally(m, { winner: 'away', how: 'reception_error', player: '4' });
  m = addRally(m, { winner: 'away', how: 'kill', player: '4' });
  const s = derive(m);
  assert.equal(describeRally(m, s.rallies[0]), 'Point Them. Passing error by Us #4 Ama. 0–1');
  assert.equal(describeRally(m, s.rallies[1]), 'Point Them. Kill by #4. 0–2');
});
