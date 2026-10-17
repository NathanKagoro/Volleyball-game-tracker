// Page wiring. All match rules live in logic.js; this file only reads the
// derived state and turns taps into events.

import {
  TEAMS, HOWS, EARNED, ERRORS, otherTeam, derive, addRally, amendLastRally, undo, substitute,
  setFirstServe, createMatch, parseRoster, formatRoster, importMatch, allowedHows, pressure, percent,
} from './logic.js';
import { textReport, exportJSON, fileStem, signed, statusLine } from './report.js';
import { momentumSvg, describeRally, CHART } from './chart.js';
import { sampleMatch } from './sample.js';

const $ = (id) => document.getElementById(id);
const KEY = 'vgt:match:v1';
const PREFS = 'vgt:prefs:v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dashC = '–';

// ---------------------------------------------------------------- storage

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return importMatch(JSON.parse(raw));
  } catch { /* unreadable or blocked storage: fall through to the sample */ }
  return sampleMatch();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(match)); } catch { /* private mode or full */ }
}
function loadPrefs() {
  try { return { buzz: true, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { buzz: true }; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
}

let match = load();
let state = derive(match);
const prefs = loadPrefs();

function commit(next, { quiet = false } = {}) {
  match = next;
  state = derive(match);
  save();
  render();
  if (!quiet) syncWakeLock();
}

// ---------------------------------------------------------------- helpers

const teamName = (t) => match.config.teams[t].name;
const playerName = (t, n) => match.config.teams[t].players.find((p) => p.number === n)?.name || '';
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k === 'dataset') Object.assign(e.dataset, v); else e.setAttribute(k, v === true ? '' : v);
  }
  if (text != null) e.textContent = text;
  return e;
};

let toastTimer;
function toast(text, ms = 2600) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

function buzz(pattern) {
  if (prefs.buzz && 'vibrate' in navigator) { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------- flip digits

function flipTo(node, value) {
  const v = String(value);
  const old = node.dataset.v;
  if (old === v) return;
  node.dataset.v = v;
  const card = (cls, text) => `<span class="${cls}"><span>${text}</span></span>`;
  if (old === undefined || reduceMotion.matches) {
    node.innerHTML = card('f-top', v) + card('f-bot', v);
    return;
  }
  node.innerHTML = card('f-top', v) + card('f-bot', old) + card('f-flap f-flap-top', old) + card('f-flap f-flap-bot', v);
  clearTimeout(node._t);
  node._t = setTimeout(() => { node.innerHTML = card('f-top', v) + card('f-bot', v); }, 420);
}

// ---------------------------------------------------------------- render

// Court spots: lineup index 0 is position 1 (server), index k is position k+1.
function renderSpots(team) {
  const box = $(`spots-${team}`);
  const lineup = state.current.lineup[team];
  const serving = state.current.serving === team && !state.complete;
  box.replaceChildren();
  lineup.forEach((num, i) => {
    const spot = el('span', { class: `spot p${i + 1}${i === 0 && serving ? ' serving' : ''}` });
    spot.append(el('span', { class: 'spot-n' }, num));
    if (i === 0 && serving) spot.append(el('span', { class: 'ball', 'aria-hidden': 'true' }));
    box.append(spot);
  });
}

function renderPlates(list, { live }) {
  list.replaceChildren();
  state.sets.forEach((s) => {
    const done = s.winner !== null;
    const isNow = !done && !state.complete;
    if (!done && !isNow) return;
    if (!done && live) return; // the open set is on the big board
    const li = el('li', { class: `plate${done ? ` won-${s.winner}` : ' plate-now'}` });
    li.append(el('span', { class: 'plate-set' }, `Set ${s.index + 1}`));
    const sc = el('span', { class: 'plate-score' });
    sc.append(el('span', { class: 'led' }, String(s.home)), el('span', { class: 'plate-dash', 'aria-hidden': 'true' }), el('span', { class: 'led' }, String(s.away)));
    sc.setAttribute('aria-label', `${teamName('home')} ${s.home}, ${teamName('away')} ${s.away}${done ? `, won by ${teamName(s.winner)}` : ', in play'}`);
    li.append(sc);
    list.append(li);
  });
  if (live && !list.children.length) {
    list.append(el('li', { class: 'plate plate-empty' }, state.current.deciding ? `Deciding set, to ${state.current.target}` : `Best of ${match.config.bestOf}, sets to 25`));
  }
}

function render() {
  const s = state.current;
  document.body.classList.toggle('is-sample', Boolean(match.config.sample));
  $('sample-strip').hidden = !match.config.sample;
  for (const t of TEAMS) {
    $(`name-${t}`).textContent = teamName(t);
    $(`half-name-${t}`).textContent = teamName(t);
    flipTo($(`flip-${t}`), s[t]);
    $(`sets-${t}`).textContent = String(state.setsWon[t]);
    const run = state.teams[t].currentRun;
    $(`run-${t}`).textContent = run >= 2 ? `Run ${run}` : '';
    renderSpots(t);
    const half = $(`half-${t}`);
    half.disabled = state.complete;
    half.setAttribute('aria-label', `Point ${teamName(t)}${s.serving === t ? ', serving' : ''}`);
    document.querySelectorAll(`.kh-${t}`).forEach((n) => { n.textContent = teamName(t); });
    $(`fs-${t}`).textContent = teamName(t);
  }
  $('board-set').textContent = state.complete ? 'Final' : `Set ${s.index + 1}`;
  const p = pressure(match, state);
  const alert = $('board-alert');
  alert.textContent = p ? `${p.type === 'match' ? 'Match' : 'Set'} point` : '';
  alert.dataset.team = p ? p.team : '';
  $('board-text').textContent = state.complete
    ? `${statusLine(match, state)}.`
    : `Set ${s.index + 1}: ${teamName('home')} ${s.home}, ${teamName('away')} ${s.away}. Sets ${state.setsWon.home} to ${state.setsWon.away}. ${teamName(s.serving)} to serve.`;
  renderPlates($('plates'), { live: true });

  const banner = $('court-banner');
  if (state.complete) {
    banner.hidden = false;
    banner.innerHTML = '';
    banner.append(el('strong', {}, `${statusLine(match, state)}`), el('a', { href: '#stats' }, 'See the match report'));
  } else banner.hidden = true;

  $('undo').disabled = match.events.length === 0;
  const anyBench = TEAMS.some((t) => state.bench[t].length);
  $('open-subs').disabled = state.complete || !anyBench;
  $('swap-serve').hidden = state.complete || s.rallies.length > 0;

  if (document.body.dataset.view === 'stats') renderStats();
}

// ---------------------------------------------------------------- stats

function renderStats() {
  $('stats-status').textContent = `${teamName('home')} v ${teamName('away')}, best of ${match.config.bestOf}. ${statusLine(match, state)}.`;
  renderPlates($('stats-plates'), { live: false });
  drawChart();

  // rally table
  const table = $('rally-table');
  table.replaceChildren();
  table.append(el('caption', { class: 'sr-only' }, 'Every rally in order, with the score after it'));
  const head = el('tr');
  for (const h of ['Set', 'Rally', 'Won by', 'How', 'Player', 'Score', 'Lead']) head.append(el('th', { scope: 'col' }, h));
  const thead = el('thead'); thead.append(head); table.append(thead);
  const body = el('tbody');
  for (const r of state.rallies) {
    const tr = el('tr', { class: `row-${r.winner}` });
    const who = r.player === null ? '' : `${r.playerTeam === r.winner ? '' : `${teamName(r.playerTeam)} `}#${r.player}${playerName(r.playerTeam, r.player) ? ` ${playerName(r.playerTeam, r.player)}` : ''}`;
    for (const c of [r.setIndex + 1, r.inSet, teamName(r.winner), HOWS[r.how].label, who, `${r.home}${dashC}${r.away}`, signed(r.net)]) tr.append(el('td', {}, String(c)));
    body.append(tr);
  }
  table.append(body);

  // team breakdown
  const tb = $('teams-break');
  tb.replaceChildren();
  for (const t of TEAMS) {
    const x = state.teams[t];
    const card = el('div', { class: `team-card team-${t}` });
    card.append(el('h3', {}, teamName(t)));
    const big = el('p', { class: 'team-points' });
    big.append(el('span', { class: 'led' }, String(x.points)), el('span', {}, ' points'));
    card.append(big);
    const total = Math.max(x.points, 1);
    const bar = el('div', { class: 'split', role: 'img', 'aria-label': `${x.earned} earned, ${x.opponentErrors} from opponent errors, ${x.other} other` });
    for (const [k, v] of [['earned', x.earned], ['errors', x.opponentErrors], ['other', x.other]]) {
      if (v) { const seg = el('span', { class: `seg-${k}` }); seg.style.flexGrow = String(v / total); bar.append(seg); }
    }
    card.append(bar);
    const dl = el('dl', { class: 'facts' });
    const fact = (k, v) => { dl.append(el('dt', {}, k), el('dd', {}, v)); };
    const earnedBits = EARNED.filter((h) => x.byHow[h]).map((h) => `${HOWS[h].label.toLowerCase()} ${x.byHow[h]}`).join(', ');
    const errBits = ERRORS.filter((h) => x.byHow[h]).map((h) => `${HOWS[h].label.toLowerCase()} ${x.byHow[h]}`).join(', ');
    fact('Earned', `${x.earned}${earnedBits ? ` (${earnedBits})` : ''}`);
    fact('From their errors', `${x.opponentErrors}${errBits ? ` (${errBits})` : ''}`);
    if (x.other) fact('No detail', String(x.other));
    const so = percent(x.sideOuts, x.receptions);
    const bp = percent(x.serveWon, x.serves);
    fact('Side-out', so === null ? 'not yet' : `${so}% (${x.sideOuts} of ${x.receptions})`);
    fact('Won on own serve', bp === null ? 'not yet' : `${bp}% (${x.serveWon} of ${x.serves})`);
    fact('Longest run', x.longestRun.length ? `${x.longestRun.length}, set ${x.longestRun.setIndex + 1}` : 'none');
    fact('Current run', x.currentRun ? String(x.currentRun) : 'none');
    card.append(dl);
    tb.append(card);
  }

  // players
  const wrap = $('players');
  wrap.replaceChildren();
  const cols = [...EARNED, ...ERRORS];
  for (const t of TEAMS) {
    const box = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': `${teamName(t)} players` });
    const tbl = el('table', { class: `players-table team-${t}` });
    tbl.append(el('caption', {}, teamName(t)));
    const hr = el('tr');
    hr.append(el('th', { scope: 'col', class: 'sticky' }, 'Player'));
    for (const h of cols) hr.append(el('th', { scope: 'col', title: HOWS[h].label, class: HOWS[h].kind === 'error' ? 'err' : '' }, HOWS[h].short));
    for (const h of ['Pts', 'Err', 'Net', 'Serves']) hr.append(el('th', { scope: 'col', class: 'sum' }, h));
    const th0 = el('thead'); th0.append(hr); tbl.append(th0);
    const tbody = el('tbody');
    for (const p of match.config.teams[t].players) {
      const r = state.players[`${t}:${p.number}`];
      const tr = el('tr');
      const th = el('th', { scope: 'row', class: 'sticky' });
      th.append(el('span', { class: 'shirt' }, p.number), document.createTextNode(p.name ? ` ${p.name}` : ''));
      tr.append(th);
      for (const h of cols) {
        const v = r.earned[h] ?? r.errors[h];
        tr.append(el('td', { class: v ? '' : 'zero' }, v ? String(v) : '.'));
      }
      tr.append(el('td', { class: 'sum' }, String(r.points)), el('td', { class: 'sum' }, String(r.errorCount)), el('td', { class: `sum net${r.net < 0 ? ' neg' : ''}` }, signed(r.net)), el('td', { class: 'sum' }, String(r.serves)));
      tbody.append(tr);
    }
    tbl.append(tbody);
    box.append(tbl);
    wrap.append(box);
  }

  $('report-text').textContent = textReport(match);
}

let chartWidth = 0;
function drawChart() {
  const box = $('chart');
  const w = Math.max(300, Math.floor(box.clientWidth || 340));
  chartWidth = w;
  const { svg } = momentumSvg(match, state, { width: w });
  box.innerHTML = svg;
}
new ResizeObserver(() => {
  if (document.body.dataset.view !== 'stats') return;
  const w = Math.floor($('chart').clientWidth);
  if (Math.abs(w - chartWidth) > 8) drawChart();
}).observe($('chart'));

// ---------------------------------------------------------------- scoring flow

let pending = null; // { team, opener }

function score(team, opener) {
  if (state.complete) return;
  const before = state;
  try {
    commit(addRally(match, { winner: team, how: 'other' }));
  } catch (err) { toast(err.message); return; }
  buzz(30);
  whistle();
  const last = state.rallies[state.rallies.length - 1];
  const setEnded = before.current.index !== state.current.index || state.complete;
  if (setEnded) {
    const done = before.current;
    const msg = state.complete ? `${statusLine(match, state)}.` : `Set ${done.index + 1} to ${teamName(team)}, ${last.home}${dashC}${last.away}.`;
    toast(msg, 4000);
    buzz([60, 60, 120]);
  }
  openPicker(team, opener, last);
}

function whistle() {
  if (reduceMotion.matches) return;
  const c = $('court');
  c.classList.remove('whistle');
  void c.offsetWidth;
  c.classList.add('whistle');
}

function pickButton(label, extra = {}, sub) {
  const b = el('button', { type: 'button', class: 'pick', ...extra });
  b.append(el('span', { class: 'pick-l' }, label));
  if (sub) b.append(el('span', { class: 'pick-s' }, sub));
  return b;
}

function openPicker(team, opener, rally) {
  pending = { team, opener, serving: rally.serving };
  const dlg = $('picker');
  dlg.dataset.team = team;
  $('picker-h').textContent = `Point ${teamName(team)}`;
  $('picker-sub').textContent = `${rally.home}${dashC}${rally.away}. How did it end?`;
  $('grp-earned').textContent = `${teamName(team)} won it`;
  $('grp-error').textContent = `${teamName(otherTeam(team))} error`;
  const ok = allowedHows(rally.serving, team);
  const fill = (box, hows) => {
    box.replaceChildren();
    for (const h of hows.filter((x) => ok.includes(x))) {
      const b = pickButton(HOWS[h].label, { dataset: { how: h } });
      b.addEventListener('click', () => chooseHow(h));
      box.append(b);
    }
  };
  fill($('how-earned'), EARNED);
  fill($('how-error'), ERRORS);
  $('pick-how').hidden = false;
  $('pick-who').hidden = true;
  if (!dlg.open) dlg.showModal();
  $('how-earned').querySelector('button')?.focus();
}

function chooseHow(how) {
  const team = pending.team;
  const pTeam = HOWS[how].kind === 'earned' ? team : otherTeam(team);
  // An ace or a serving error belongs to whoever was serving; no need to ask.
  if ((how === 'ace' || how === 'serve_error')) {
    const server = state.rallies[state.rallies.length - 1].server;
    if (server !== null) { finish(how, server); return; }
  }
  const roster = match.config.teams[pTeam].players;
  if (!roster.length) { finish(how, null); return; }
  pending.how = how;
  const last = state.rallies[state.rallies.length - 1];
  // The line-up as it was during the rally: if the winner just won the serve
  // back it has since rotated, so use the line-up from before the side-out.
  const lineup = lineupDuring(pTeam, last);
  $('grp-who').textContent = `${HOWS[how].label}: which ${teamName(pTeam)} player?`;
  const court = $('who-court');
  const bench = $('who-bench');
  court.replaceChildren();
  bench.replaceChildren();
  for (const n of lineup) court.append(numberButton(pTeam, n));
  const rest = roster.map((p) => p.number).filter((n) => !lineup.includes(n));
  for (const n of rest) bench.append(numberButton(pTeam, n));
  $('grp-bench').hidden = rest.length === 0;
  $('grp-bench').textContent = lineup.length ? 'Bench' : 'Players';
  $('pick-how').hidden = true;
  $('pick-who').hidden = false;
  court.querySelector('button')?.focus() || bench.querySelector('button')?.focus();
}

function lineupDuring(team, rally) {
  const set = state.sets[rally.setIndex];
  const now = set.lineup[team];
  if (rally.winner === team && rally.serving !== team && now.length > 1) return [now[now.length - 1], ...now.slice(0, -1)];
  return now;
}

function numberButton(team, n) {
  const name = playerName(team, n);
  const b = pickButton(`#${n}`, { dataset: { n }, 'aria-label': `Number ${n}${name ? ` ${name}` : ''}` }, name || null);
  b.addEventListener('click', () => finish(pending.how, n));
  return b;
}

function finish(how, player) {
  try {
    commit(amendLastRally(match, { how, player }), { quiet: true });
    const last = state.rallies[state.rallies.length - 1];
    toast(describeRally(match, last));
  } catch (err) { toast(err.message); }
  closePicker();
}

function closePicker() {
  const dlg = $('picker');
  if (dlg.open) dlg.close();
}

$('picker').addEventListener('close', () => {
  const opener = pending?.opener;
  pending = null;
  if (opener && !opener.disabled) opener.focus();
  else $('undo').focus();
});
$('picker').addEventListener('click', (e) => { if (e.target === $('picker')) closePicker(); });
$('pick-skip').addEventListener('click', closePicker);
$('pick-unknown').addEventListener('click', () => finish(pending.how, null));
$('pick-back').addEventListener('click', () => { const p = pending; openPicker(p.team, p.opener, state.rallies[state.rallies.length - 1]); });
$('pick-undo').addEventListener('click', () => { closePicker(); doUndo(); });

for (const t of TEAMS) $(`half-${t}`).addEventListener('click', (e) => score(t, e.currentTarget));

function doUndo() {
  if (!match.events.length) return;
  const last = match.events[match.events.length - 1];
  commit(undo(match));
  buzz(15);
  if (last.t === 'rally') toast(`Took back the last point. ${state.current.home}${dashC}${state.current.away}.`);
  else if (last.t === 'sub') toast(`Took back the substitution of #${last.in} for #${last.out}.`);
  else toast('Took back the serve change.');
}
$('undo').addEventListener('click', doUndo);

$('swap-serve').addEventListener('click', () => {
  try {
    commit(setFirstServe(match, otherTeam(state.current.serving)));
    toast(`${teamName(state.current.serving)} to serve first in set ${state.current.index + 1}.`);
  } catch (err) { toast(err.message); }
});

// ---------------------------------------------------------------- substitutions

const subs = { team: 'home', out: null, in: null };
function renderSubs() {
  for (const t of TEAMS) {
    const b = $(`subs-team-${t}`);
    b.textContent = teamName(t);
    b.setAttribute('aria-pressed', String(subs.team === t));
    b.disabled = state.bench[t].length === 0;
  }
  const fill = (box, nums, key) => {
    box.replaceChildren();
    for (const n of nums) {
      const name = playerName(subs.team, n);
      const b = pickButton(`#${n}`, { 'aria-pressed': String(subs[key] === n), 'aria-label': `Number ${n}${name ? ` ${name}` : ''}` }, name || null);
      b.addEventListener('click', () => { subs[key] = n; renderSubs(); box.querySelector('[aria-pressed="true"]')?.focus(); });
      box.append(b);
    }
  };
  fill($('subs-out'), state.current.lineup[subs.team], 'out');
  fill($('subs-in'), state.bench[subs.team], 'in');
  $('subs-confirm').disabled = !(subs.out && subs.in);
}
$('open-subs').addEventListener('click', () => {
  subs.team = state.bench.home.length ? 'home' : 'away';
  subs.out = null; subs.in = null;
  $('subs-msg').textContent = '';
  renderSubs();
  $('subs').showModal();
  $(`subs-team-${subs.team}`).focus();
});
for (const t of TEAMS) $(`subs-team-${t}`).addEventListener('click', () => { subs.team = t; subs.out = null; subs.in = null; renderSubs(); });
$('subs-confirm').addEventListener('click', () => {
  try {
    commit(substitute(match, subs.team, subs.out, subs.in));
    toast(`${teamName(subs.team)}: #${subs.in} on for #${subs.out}.`);
    $('subs').close();
  } catch (err) { $('subs-msg').textContent = err.message; }
});
$('subs').addEventListener('close', () => $('open-subs').focus());

// ---------------------------------------------------------------- confirm

function confirmBox(title, text, yes) {
  const dlg = $('confirm');
  $('confirm-h').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-yes').textContent = yes;
  dlg.returnValue = '';
  const back = document.activeElement;
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); back?.focus?.(); }, { once: true });
  });
}

const hasRealMatch = () => !match.config.sample && match.events.length > 0;
async function replaceWith(next, what) {
  if (hasRealMatch()) {
    const ok = await confirmBox(
      'Replace this match?',
      `${teamName('home')} v ${teamName('away')} has ${state.rallies.length} rallies logged (${statusLine(match, state)}). ${what} clears it from this phone. Download the match file first if you want to keep it.`,
      'Replace it',
    );
    if (!ok) return false;
  }
  commit(next);
  return true;
}

// ---------------------------------------------------------------- setup

function fillSetup() {
  // Start from the current teams unless this is the sample.
  const src = match.config.sample ? null : match.config;
  $('home-name').value = src ? src.teams.home.name : '';
  $('away-name').value = src ? src.teams.away.name : '';
  $('home-roster').value = src ? formatRoster(src.teams.home.players) : '';
  $('away-roster').value = src ? formatRoster(src.teams.away.players) : '';
  document.querySelector(`input[name=bestOf][value="${src ? src.bestOf : 3}"]`).checked = true;
  $('pref-buzz').checked = prefs.buzz;
  for (const id of ['home-roster-err', 'away-roster-err', 'setup-err']) $(id).textContent = '';
}

$('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let bad = false;
  const read = (t) => {
    const r = parseRoster($(`${t}-roster`).value);
    $(`${t}-roster-err`).textContent = r.errors.join(' ');
    $(`${t}-roster`).setAttribute('aria-invalid', String(r.errors.length > 0));
    if (r.errors.length) bad = true;
    return r.players;
  };
  const home = read('home');
  const away = read('away');
  $('setup-err').textContent = '';
  if (bad) { $('setup-err').textContent = 'Fix the player lists above, then start the match.'; return; }
  let next;
  try {
    next = createMatch({
      bestOf: Number(new FormData(e.target).get('bestOf')),
      firstServe: new FormData(e.target).get('firstServe'),
      teams: { home: { name: $('home-name').value, players: home }, away: { name: $('away-name').value, players: away } },
    });
  } catch (err) { $('setup-err').textContent = err.message; return; }
  if (await replaceWith(next, 'Starting a new match')) { location.hash = '#court'; toast(`New match. ${teamName(state.current.serving)} to serve.`); }
});
$('pref-buzz').addEventListener('change', (e) => { prefs.buzz = e.target.checked; savePrefs(); });
$('load-sample').addEventListener('click', async () => {
  if (await replaceWith(sampleMatch(), 'Loading the sample')) location.hash = '#court';
});
for (const t of TEAMS) {
  $(`${t}-name`).addEventListener('input', (e) => { $(`fs-${t}`).textContent = e.target.value.trim() || (t === 'home' ? 'Home side' : 'Away side'); });
}

// ---------------------------------------------------------------- export

const msg = (text) => { $('export-msg').textContent = text; };
function download(name, blob) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const reportNow = () => textReport(match, { date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) });

$('share-report').addEventListener('click', async () => {
  const text = reportNow();
  const file = new File([exportJSON(match)], `${fileStem(match)}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: 'Match report', text, files: [file] }); msg('Shared.'); return; }
    if (navigator.share) { await navigator.share({ title: 'Match report', text }); msg('Shared.'); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  download(`${fileStem(match)}-report.txt`, new Blob([text], { type: 'text/plain' }));
  msg('This browser cannot share, so the report was downloaded instead.');
});
$('copy-report').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(reportNow()); msg('Report copied.'); } catch { msg('Copying is blocked here. Use the download or the preview below.'); }
});
$('download-report').addEventListener('click', () => { download(`${fileStem(match)}-report.txt`, new Blob([reportNow()], { type: 'text/plain' })); msg('Report downloaded.'); });
$('download-json').addEventListener('click', () => { download(`${fileStem(match)}.json`, new Blob([exportJSON(match)], { type: 'application/json' })); msg('Match file downloaded.'); });
$('download-png').addEventListener('click', async () => {
  const { svg, width, height } = momentumSvg(match, state, { width: 1200, stacked: false });
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const c = document.createElement('canvas');
    c.width = width * 2; c.height = height * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = CHART.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    download(`${fileStem(match)}-momentum.png`, blob);
    msg('Chart downloaded.');
  } catch { msg('The chart could not be turned into an image in this browser.'); }
  finally { URL.revokeObjectURL(url); }
});

// ---------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea, select')) return;
  if (document.body.dataset.view !== 'court') return;
  const k = e.key.toLowerCase();
  if (k === 'u' || k === 'arrowleft') { e.preventDefault(); score('home', $('half-home')); }
  else if (k === 'o' || k === 'arrowright') { e.preventDefault(); score('away', $('half-away')); }
  else if (k === 'z') { e.preventDefault(); doUndo(); }
});

// ---------------------------------------------------------------- wake lock

let wakeLock = null;
async function syncWakeLock() {
  const want = document.body.dataset.view === 'court' && !state.complete && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { wakeLock = null; /* refused: battery saver, no gesture yet, or not allowed */ }
  } else if (!want && wakeLock) {
    try { await wakeLock.release(); } catch { /* ignore */ }
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', syncWakeLock);
document.addEventListener('pointerdown', () => { if (!wakeLock) syncWakeLock(); }, { passive: true });

// ---------------------------------------------------------------- routing

function route() {
  const v = (location.hash.replace('#', '') || 'court');
  const view = ['court', 'stats', 'setup'].includes(v) ? v : 'court';
  document.body.dataset.view = view;
  for (const name of ['court', 'stats', 'setup']) $(`view-${name}`).hidden = name !== view;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (view === 'setup') fillSetup();
  render();
  syncWakeLock();
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// Another tab changed the match: follow it.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  try { match = e.newValue ? importMatch(JSON.parse(e.newValue)) : sampleMatch(); state = derive(match); render(); } catch { /* ignore */ }
});

if (!matchMedia('(hover: hover) and (pointer: fine)').matches) $('keys-hint').hidden = true;
route();
