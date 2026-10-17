// Plain-text match report and JSON export. Pure.

import { derive, HOWS, EARNED, ERRORS, TEAMS, percent } from './logic.js';

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
export const dash = '–';

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

export function scoreLine(sets) {
  return sets.filter((s) => s.rallies.length).map((s) => `${s.home}${dash}${s.away}`).join(', ');
}

export function statusLine(match, state = derive(match)) {
  const { home, away } = match.config.teams;
  const name = (t) => match.config.teams[t].name;
  if (state.complete) {
    const w = state.winner;
    const l = w === 'home' ? 'away' : 'home';
    return `${name(w)} won ${state.setsWon[w]}${dash}${state.setsWon[l]}`;
  }
  const s = state.current;
  const sets = `sets ${home.name} ${state.setsWon.home}${dash}${state.setsWon.away} ${away.name}`;
  return `In progress: ${sets}, set ${s.index + 1} at ${s.home}${dash}${s.away}`;
}

function teamBlock(match, state, team) {
  const t = state.teams[team];
  const name = match.config.teams[team].name;
  const earned = EARNED.filter((h) => t.byHow[h]).map((h) => `${HOWS[h].label.toLowerCase()} ${t.byHow[h]}`).join(', ');
  const errs = ERRORS.filter((h) => t.byHow[h]).map((h) => `${HOWS[h].label.toLowerCase()} ${t.byHow[h]}`).join(', ');
  const lines = [`${name}: ${t.points} points`];
  lines.push(`  Earned:           ${t.earned}${earned ? ` (${earned})` : ''}`);
  lines.push(`  Opponent errors:  ${t.opponentErrors}${errs ? ` (${errs})` : ''}`);
  if (t.other) lines.push(`  Other or unknown: ${t.other}`);
  const so = percent(t.sideOuts, t.receptions);
  const bp = percent(t.serveWon, t.serves);
  lines.push(`  Side-out:         ${so === null ? 'n/a' : `${so}% (${t.sideOuts} of ${t.receptions} receptions)`}`);
  lines.push(`  Won on own serve: ${bp === null ? 'n/a' : `${bp}% (${t.serveWon} of ${t.serves} serves)`}`);
  const lr = t.longestRun;
  lines.push(`  Longest run:      ${lr.length ? `${lr.length} in set ${lr.setIndex + 1}` : 'none'}`);
  return lines.join('\n');
}

function playerTable(match, state, team) {
  const name = match.config.teams[team].name;
  const rows = match.config.teams[team].players.map((p) => state.players[`${team}:${p.number}`]);
  const cols = [...EARNED, ...ERRORS];
  const head = `  ${pad('No', 4)}${pad('Name', 14)}${cols.map((h) => lpad(HOWS[h].short, 5)).join('')}${lpad('Pts', 5)}${lpad('Err', 5)}${lpad('Net', 5)}`;
  const body = rows.map((r) => {
    const cells = cols.map((h) => lpad((r.earned[h] ?? r.errors[h]) || '.', 5)).join('');
    return `  ${pad(`#${r.number}`, 4)}${pad(r.name || '', 14)}${cells}${lpad(r.points, 5)}${lpad(r.errorCount, 5)}${lpad(signed(r.net), 5)}`;
  });
  const unknown = state.rallies.filter((x) => x.playerTeam === team && x.player === null).length;
  const out = [`${name} players`, head, ...body];
  if (unknown) out.push(`  ${unknown} action${unknown === 1 ? '' : 's'} logged without a player.`);
  return out.join('\n');
}

export function textReport(match, { date } = {}) {
  const state = derive(match);
  const { home, away } = match.config.teams;
  const lines = [];
  lines.push('VOLLEYBALL MATCH REPORT');
  lines.push(`${home.name} v ${away.name}, best of ${match.config.bestOf}`);
  if (date) lines.push(date);
  if (match.config.sample) lines.push('Sample match: the teams, players and rallies are fictional.');
  lines.push('');
  lines.push(`Result: ${statusLine(match, state)}`);
  const sl = scoreLine(state.sets);
  lines.push(`Sets:   ${sl || 'no rallies yet'} (${home.name} first)`);
  lines.push(`Rallies logged: ${state.rallies.length}`);
  lines.push('');
  lines.push('HOW POINTS WERE WON');
  for (const t of TEAMS) { lines.push(teamBlock(match, state, t)); lines.push(''); }
  lines.push('PLAYERS');
  lines.push('Points: Ace, Kill, Blk = block, Tip. Errors: Srv = serving, Hit = hitting, Pass = passing,');
  lines.push('Net = net or rotation fault, Hand = ball handling, Out = ball out. Net = points minus errors.');
  lines.push('');
  for (const t of TEAMS) { lines.push(playerTable(match, state, t)); lines.push(''); }
  return lines.join('\n').trimEnd() + '\n';
}

export function exportJSON(match) {
  return JSON.stringify({ app: 'volleyball-game-tracker', ...match }, null, 2);
}

export function fileStem(match) {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
  return `${slug(match.config.teams.home.name)}-v-${slug(match.config.teams.away.name)}`;
}
