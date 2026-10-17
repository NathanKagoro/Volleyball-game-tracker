import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, addRally, amendLastRally, undo, derive, parseRoster, formatRoster,
  setIsWon, setTarget, substitute, setFirstServe, importMatch, pressure, allowedHows, playerTeamFor,
} from '../js/logic.js';
import { textReport, exportJSON, signed, statusLine } from '../js/report.js';
import { sampleMatch, generateMatch } from '../js/sample.js';

const six = (names = []) => ['1', '2', '3', '4', '5', '6'].map((number, i) => ({ number, name: names[i] ?? '' }));
const fresh = (opts = {}) => createMatch({
  bestOf: 3, firstServe: 'home',
  teams: { home: { name: 'Us', players: six() }, away: { name: 'Them', players: six() } },
  ...opts,
});

// Plays a string of rally winners: h = home, a = away. Detail is "other".
function play(match, seq) {
  let m = match;
  for (const c of seq.replace(/\s/g, '')) m = addRally(m, { winner: c === 'h' ? 'home' : 'away', how: 'other' });
  return m;
}
const times = (c, n) => c.repeat(n);
// Reaches a given score in the open set without ending it early.
function reach(match, home, away) {
  const both = Math.min(home, away);
  return play(match, times('ha', both) + times('h', home - both) + times('a', away - both));
}

// ---------------------------------------------------------------- set rules

test('set rule: 25 with a two-point lead, no cap', () => {
  assert.equal(setIsWon(25, 24, 25), false);
  assert.equal(setIsWon(25, 23, 25), true);
  assert.equal(setIsWon(24, 22, 25), false);
  assert.equal(setIsWon(26, 24, 25), true);
  assert.equal(setIsWon(31, 30, 25), false);
  assert.equal(setIsWon(32, 30, 25), true);
  assert.equal(setIsWon(15, 14, 15), false);
  assert.equal(setIsWon(16, 14, 15), true);
});

test('deciding set is the last possible set and is played to 15', () => {
  assert.deepEqual([0, 1, 2].map((i) => setTarget(3, i)), [25, 25, 15]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => setTarget(5, i)), [25, 25, 25, 25, 15]);
});

test('25-24 does not end the set (the original ended it at 25)', () => {
  const m = reach(fresh(), 25, 24);
  const s = derive(m);
  assert.equal(s.sets.length, 1);
  assert.equal(s.current.winner, null);
  assert.deepEqual([s.current.home, s.current.away], [25, 24]);
});

test('extended set is won at 27-25 and the next set starts at 0-0', () => {
  const m = play(reach(fresh(), 25, 25), 'hh');
  const s = derive(m);
  assert.equal(s.sets[0].winner, 'home');
  assert.deepEqual([s.sets[0].home, s.sets[0].away], [27, 25]);
  assert.equal(s.sets.length, 2);
  assert.deepEqual([s.current.home, s.current.away], [0, 0]);
  assert.equal(s.setsWon.home, 1);
});

test('best of 3 ends after two sets to one team; scoring after that is refused', () => {
  let m = play(fresh(), times('h', 25) + times('h', 25));
  const s = derive(m);
  assert.equal(s.complete, true);
  assert.equal(s.winner, 'home');
  assert.deepEqual(s.setsWon, { home: 2, away: 0 });
  // The original kept scoring and wrote a new report on every point after 25.
  assert.throws(() => addRally(m, { winner: 'away', how: 'other' }), /match is over/);
});

test('best of 3 deciding set: 15-14 continues, 16-14 wins the match', () => {
  let m = play(fresh(), times('h', 25) + times('a', 25));
  m = reach(m, 15, 14);
  let s = derive(m);
  assert.equal(s.current.index, 2);
  assert.equal(s.current.target, 15);
  assert.equal(s.complete, false);
  m = play(m, 'h');
  s = derive(m);
  assert.equal(s.complete, true);
  assert.equal(s.winner, 'home');
  assert.equal(statusLine(m, s), 'Us won 2–1');
});

test('best of 5 needs three sets and only the fifth goes to 15', () => {
  let m = fresh({ bestOf: 5 });
  m = play(m, times('h', 25) + times('a', 25) + times('h', 25) + times('a', 25));
  let s = derive(m);
  assert.equal(s.complete, false);
  assert.equal(s.current.index, 4);
  assert.equal(s.current.target, 15);
  m = play(m, times('a', 15));
  s = derive(m);
  assert.equal(s.winner, 'away');
  assert.deepEqual(s.setsWon, { home: 2, away: 3 });
});

test('best of 5: a fourth set to 15 does not end it', () => {
  let m = play(fresh({ bestOf: 5 }), times('h', 25) + times('a', 25) + times('h', 25));
  m = play(m, times('a', 15));
  const s = derive(m);
  assert.equal(s.sets[3].winner, null);
  assert.equal(s.current.index, 3);
});

test('only best of 3 or 5 is accepted', () => {
  assert.throws(() => fresh({ bestOf: 4 }), /best of 3 or best of 5/);
});

test('set point and match point are flagged', () => {
  let m = reach(fresh(), 24, 22);
  assert.deepEqual(pressure(m), { team: 'home', type: 'set' });
  m = play(m, 'h' + times('h', 24));
  assert.deepEqual(pressure(m), { team: 'home', type: 'match' });
  assert.equal(pressure(reach(fresh(), 24, 24)), null);
});

// ---------------------------------------------------------------- players and causes

test('players are keyed by team and number, so two number 1s stay separate', () => {
  let m = fresh();
  m = addRally(m, { winner: 'home', how: 'kill', player: '1' });
  m = addRally(m, { winner: 'away', how: 'kill', player: '1' });
  m = addRally(m, { winner: 'away', how: 'kill', player: '1' });
  const s = derive(m);
  assert.equal(s.players['home:1'].earned.kill, 1);
  assert.equal(s.players['away:1'].earned.kill, 2);
  assert.equal(Object.keys(s.players).length, 12);
});

test('the report lists each player once, under their own team', () => {
  let m = fresh();
  m = addRally(m, { winner: 'home', how: 'block', player: '3' });
  const r = textReport(m);
  // The bundled legacy report printed every player twice with both teams merged.
  assert.equal(r.match(/^ {2}#3 /gm).length, 2);
  const [usPart, themPart] = r.split('Them players');
  assert.match(usPart.split('Us players')[1], /#3 .* 1 {4}\. {4}\. {4}\./);
  assert.doesNotMatch(themPart, /#3 [^\n]*\b1\b/);
});

test('errors are charged to a player on the losing team', () => {
  let m = fresh({ firstServe: 'away' });
  m = addRally(m, { winner: 'away', how: 'reception_error', player: '4' });
  const s = derive(m);
  assert.equal(s.rallies[0].playerTeam, 'home');
  assert.equal(s.players['home:4'].errors.reception_error, 1);
  assert.equal(s.players['away:4'].errorCount, 0);
  assert.equal(s.teams.away.opponentErrors, 1);
  assert.equal(s.teams.home.errorsMade, 1);
  assert.equal(playerTeamFor('away', 'kill'), 'away');
  assert.equal(playerTeamFor('away', 'hit_error'), 'home');
  assert.equal(playerTeamFor('away', 'other'), null);
});

test('a player who is not on the right roster is refused', () => {
  const m = fresh();
  assert.throws(() => addRally(m, { winner: 'home', how: 'kill', player: '9' }), /not on the Us roster/);
});

test('"other" never carries a player, and any action can skip the player', () => {
  let m = fresh();
  m = addRally(m, { winner: 'home', how: 'other', player: '3' });
  m = addRally(m, { winner: 'home', how: 'kill' });
  const s = derive(m);
  assert.equal(s.rallies[0].player, null);
  assert.equal(s.rallies[1].player, null);
  assert.equal(s.teams.home.earned, 1);
  assert.equal(s.teams.home.other, 1);
});

test('aces only for the serving team, serving errors only by the serving team', () => {
  const m = fresh({ firstServe: 'home' });
  assert.throws(() => addRally(m, { winner: 'away', how: 'ace' }), /serving team can score an ace/);
  assert.throws(() => addRally(m, { winner: 'home', how: 'serve_error' }), /serving team can make a serving error/);
  assert.deepEqual(allowedHows('home', 'home').includes('serve_error'), false);
  assert.deepEqual(allowedHows('home', 'away').includes('ace'), false);
  const s = derive(addRally(m, { winner: 'home', how: 'ace', player: '1' }));
  assert.equal(s.players['home:1'].earned.ace, 1);
});

test('net contribution is points won minus errors', () => {
  let m = fresh();
  m = addRally(m, { winner: 'home', how: 'kill', player: '2' });
  m = addRally(m, { winner: 'home', how: 'kill', player: '2' });
  m = addRally(m, { winner: 'away', how: 'hit_error', player: '2' });
  m = addRally(m, { winner: 'away', how: 'hit_error', player: '2' });
  m = addRally(m, { winner: 'away', how: 'net_fault', player: '2' });
  const p = derive(m).players['home:2'];
  assert.equal(p.points, 2);
  assert.equal(p.errorCount, 3);
  assert.equal(p.net, -1);
  assert.equal(signed(p.net), '−1');
});

// ---------------------------------------------------------------- serve and rotation

test('serve passes on a side-out and the receiving team rotates', () => {
  let m = fresh({ firstServe: 'home' });
  let s = derive(m);
  assert.equal(s.current.serving, 'home');
  assert.deepEqual(s.current.lineup.away, ['1', '2', '3', '4', '5', '6']);
  m = play(m, 'a');
  s = derive(m);
  assert.equal(s.current.serving, 'away');
  assert.deepEqual(s.current.lineup.away, ['2', '3', '4', '5', '6', '1']);
  assert.equal(s.rallies[0].server, '1');
  m = play(m, 'a');
  s = derive(m);
  assert.deepEqual(s.current.lineup.away, ['2', '3', '4', '5', '6', '1'], 'no rotation while holding serve');
  assert.equal(s.rallies[1].server, '2');
});

test('side-out and serve-won percentages count the right rallies', () => {
  // home serves first: h (break), a (side-out), a (break), h (side-out), h (break)
  const s = derive(play(fresh(), 'haahh'));
  assert.deepEqual([s.teams.home.serves, s.teams.home.serveWon], [3, 2]);
  assert.deepEqual([s.teams.away.serves, s.teams.away.serveWon], [2, 1]);
  assert.deepEqual([s.teams.home.receptions, s.teams.home.sideOuts], [2, 1]);
  assert.deepEqual([s.teams.away.receptions, s.teams.away.sideOuts], [3, 1]);
  assert.equal(s.players['home:1'].serves, 2);
  assert.equal(s.players['home:2'].serves, 1);
});

test('first server alternates by set and can be corrected before a set starts', () => {
  let m = setFirstServe(fresh({ firstServe: 'home' }), 'away');
  assert.equal(derive(m).current.serving, 'away');
  m = play(m, 'a');
  assert.throws(() => setFirstServe(m, 'home'), /set has started/);
  m = play(m, times('a', 24));
  const s = derive(m);
  assert.equal(s.current.index, 1);
  assert.equal(s.current.firstServe, 'home');
});

test('a new set starts unrotated with substitutions kept', () => {
  let m = createMatch({ teams: { home: { name: 'A', players: [...six(), { number: '9' }] }, away: { name: 'B', players: six() } } });
  m = substitute(m, 'home', '3', '9');
  let s = derive(m);
  assert.deepEqual(s.current.lineup.home, ['1', '2', '9', '4', '5', '6']);
  assert.deepEqual(s.bench.home, ['3']);
  assert.throws(() => substitute(m, 'home', '3', '1'), /not on court/);
  assert.throws(() => substitute(m, 'home', '1', '9'), /already on court/);
  m = play(m, 'a' + 'h' + times('h', 24));
  s = derive(m);
  assert.equal(s.current.index, 1);
  assert.deepEqual(s.current.lineup.home, ['1', '2', '9', '4', '5', '6']);
});

test('a team with no roster still scores, with no server named', () => {
  const m = createMatch({ teams: { home: { name: 'Us', players: six() }, away: { name: 'Them', players: [] } }, firstServe: 'away' });
  const s = derive(addRally(m, { winner: 'home', how: 'serve_error' }));
  assert.equal(s.rallies[0].server, null);
  assert.equal(s.current.home, 1);
});

// ---------------------------------------------------------------- runs

test('current and longest run per team, reset at a new set', () => {
  let m = play(fresh(), 'hhhaah');
  let s = derive(m);
  assert.equal(s.teams.home.longestRun.length, 3);
  assert.equal(s.teams.away.longestRun.length, 2);
  assert.equal(s.teams.home.currentRun, 1);
  assert.equal(s.teams.away.currentRun, 0);
  m = play(fresh(), times('h', 25) + 'h');
  s = derive(m);
  assert.equal(s.teams.home.longestRun.length, 25);
  assert.equal(s.teams.home.currentRun, 1, 'the run restarts in set 2');
  assert.equal(s.rallies[25].run, 1);
});

// ---------------------------------------------------------------- undo and amend

test('undo removes the last event and everything re-derives', () => {
  let m = reach(fresh(), 24, 23);
  m = play(m, 'h');
  assert.equal(derive(m).sets.length, 2);
  m = undo(m);
  const s = derive(m);
  assert.equal(s.sets.length, 1);
  assert.deepEqual([s.current.home, s.current.away], [24, 23]);
  assert.equal(undo(fresh()).events.length, 0);
});

test('undo reopens a finished match', () => {
  const m = play(fresh(), times('h', 50));
  assert.equal(derive(m).complete, true);
  assert.equal(derive(undo(m)).complete, false);
});

test('amending the last rally adds detail without changing the winner', () => {
  let m = play(fresh(), 'h');
  m = amendLastRally(m, { how: 'block', player: '5' });
  const s = derive(m);
  assert.equal(m.events.length, 1);
  assert.equal(s.rallies[0].winner, 'home');
  assert.equal(s.players['home:5'].earned.block, 1);
  // After a side-out, an ace is impossible for the team that just won the serve.
  const n = play(fresh(), 'a');
  assert.throws(() => amendLastRally(n, { how: 'ace', player: '1' }), /ace/);
  assert.equal(derive(amendLastRally(n, { how: 'serve_error', player: '1' })).players['home:1'].errors.serve_error, 1);
});

test('amending the rally that won the match is allowed', () => {
  let m = play(fresh(), times('h', 50));
  m = amendLastRally(m, { how: 'kill', player: '2' });
  assert.equal(derive(m).players['home:2'].earned.kill, 1);
});

// ---------------------------------------------------------------- roster input

test('roster input trims, ignores blank entries and keeps optional names', () => {
  const r = parseRoster('  7  Amina ,, 9,\n\n 12   Jo   Lee ,#4 ,');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.players, [
    { number: '7', name: 'Amina' }, { number: '9', name: '' }, { number: '12', name: 'Jo Lee' }, { number: '4', name: '' },
  ]);
  assert.equal(formatRoster(r.players), '7 Amina\n9\n12 Jo Lee\n4');
});

test('roster input rejects duplicates (07 is 7) and entries without a number', () => {
  const r = parseRoster('7, 07 Sam, Amina, 1234');
  assert.deepEqual(r.players, [{ number: '7', name: '' }]);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /listed twice/);
  assert.match(r.errors[1], /"Amina"/);
});

test('the same number on both teams is fine; within a team it is refused', () => {
  assert.doesNotThrow(() => fresh());
  assert.throws(() => createMatch({ teams: { home: { name: 'A', players: [{ number: '1' }, { number: ' 1 ' }] }, away: { name: 'B', players: [] } } }), /listed twice/);
  assert.throws(() => createMatch({ teams: { home: { name: 'Same' }, away: { name: ' same ' } } }), /different names/);
  const m = createMatch({ teams: { home: { name: '   ' }, away: {} } });
  assert.deepEqual([m.config.teams.home.name, m.config.teams.away.name], ['Us', 'Opponent']);
});

// ---------------------------------------------------------------- import, export, sample

test('import replays events through the same checks', () => {
  const m = sampleMatch();
  const back = importMatch(JSON.parse(exportJSON(m)));
  assert.deepEqual(derive(back).current.home, derive(m).current.home);
  assert.equal(back.events.length, m.events.length);
  const bad = JSON.parse(exportJSON(m));
  bad.events.push({ t: 'rally', winner: 'home', how: 'kill', player: '99' });
  assert.throws(() => importMatch(bad), /roster/);
  assert.throws(() => importMatch({}), /not a match file/);
  assert.throws(() => importMatch({ config: m.config, events: [{ t: 'nope' }] }), /does not know/);
});

test('the sample is a fictional, valid match in its deciding set', () => {
  const m = sampleMatch();
  const s = derive(m);
  assert.equal(m.config.sample, true);
  assert.equal(s.complete, false);
  assert.equal(s.current.index, 2);
  assert.deepEqual(s.sets.map((x) => [x.home, x.away]), [[26, 24], [21, 25], [9, 8]]);
  assert.equal(s.ignored, 0);
  assert.match(textReport(m), /Sample match: the teams, players and rallies are fictional/);
  assert.equal(derive(generateMatch(335, null)).complete, true);
});

test('text report: result, sets, breakdown and signed net', () => {
  let m = fresh();
  m = addRally(m, { winner: 'home', how: 'ace', player: '1' });
  m = addRally(m, { winner: 'away', how: 'hit_error', player: '3' });
  m = addRally(m, { winner: 'home', how: 'other' });
  const r = textReport(m, { date: '17 October 2026' });
  assert.match(r, /Us v Them, best of 3/);
  assert.match(r, /17 October 2026/);
  assert.match(r, /Result: In progress: sets Us 0–0 Them, set 1 at 2–1/);
  assert.match(r, /Us: 2 points\n {2}Earned: +1 \(ace 1\)/);
  assert.match(r, /Them: 1 points\n {2}Earned: +0\n {2}Opponent errors: +1 \(hitting error 1\)/);
  assert.match(r, /#3 {2}.* −1\n/);
});
