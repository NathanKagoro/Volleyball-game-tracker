// Match logic for the volleyball tracker. Pure: no DOM, no storage, no clock.
//
// A match is { version, config, events }. Events are the only thing that is
// ever written; the score, sets, rotation, runs and every statistic are derived
// from them by derive(). Undo removes the last event.

export const VERSION = 1;
export const TEAMS = ['home', 'away'];
export const otherTeam = (team) => (team === 'home' ? 'away' : 'home');

// How a rally can end. "earned" actions are credited to a player on the team
// that won the rally. "error" actions are charged to a player on the team that
// lost it. "other" carries no player, so logging never has to wait for detail.
export const HOWS = {
  ace: { label: 'Ace', short: 'Ace', kind: 'earned' },
  kill: { label: 'Kill', short: 'Kill', kind: 'earned' },
  block: { label: 'Block', short: 'Blk', kind: 'earned' },
  tip: { label: 'Tip', short: 'Tip', kind: 'earned' },
  serve_error: { label: 'Serving error', short: 'Srv', kind: 'error' },
  hit_error: { label: 'Hitting error', short: 'Hit', kind: 'error' },
  reception_error: { label: 'Passing error', short: 'Pass', kind: 'error' },
  net_fault: { label: 'Net or rotation fault', short: 'Net', kind: 'error' },
  ball_handling: { label: 'Ball handling', short: 'Hand', kind: 'error' },
  out: { label: 'Ball out', short: 'Out', kind: 'error' },
  other: { label: 'Other or unknown', short: 'Other', kind: 'other' },
};
export const EARNED = Object.keys(HOWS).filter((h) => HOWS[h].kind === 'earned');
export const ERRORS = Object.keys(HOWS).filter((h) => HOWS[h].kind === 'error');

export const playerKey = (team, number) => `${team}:${number}`;

// ---------------------------------------------------------------- roster

// Reads "7 Amina, 9, 12 Jo Lee" or one player per line. Returns the players it
// could read and a list of plain-language problems. Empty entries (a trailing
// comma, a blank line) never become players.
export function parseRoster(text) {
  const players = [];
  const errors = [];
  const seen = new Set();
  const tokens = String(text ?? '').split(/[,;\n\r]+/);
  for (const raw of tokens) {
    const token = raw.trim().replace(/\s+/g, ' ');
    if (!token) continue;
    const m = /^#?\s?(\d{1,3})(?:[\s.:-]+(.*))?$/.exec(token);
    if (!m) {
      errors.push(`"${token}" does not start with a shirt number.`);
      continue;
    }
    const number = String(parseInt(m[1], 10));
    const name = (m[2] ?? '').trim().slice(0, 24);
    if (seen.has(number)) {
      errors.push(`Number ${number} is listed twice.`);
      continue;
    }
    seen.add(number);
    players.push({ number, name });
  }
  return { players, errors };
}

export function formatRoster(players) {
  return players.map((p) => (p.name ? `${p.number} ${p.name}` : p.number)).join('\n');
}

function cleanTeam(team, fallbackName) {
  const name = String(team?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 24) || fallbackName;
  const players = [];
  const seen = new Set();
  for (const p of team?.players ?? []) {
    const raw = String(p?.number ?? '').trim();
    if (!/^\d{1,3}$/.test(raw)) throw new Error(`${name}: "${raw}" is not a shirt number.`);
    const number = String(parseInt(raw, 10));
    if (seen.has(number)) throw new Error(`${name}: number ${number} is listed twice.`);
    seen.add(number);
    players.push({ number, name: String(p?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 24) });
  }
  return { name, players };
}

// ---------------------------------------------------------------- match

export function createMatch({ bestOf = 3, teams = {}, firstServe = 'home', sample = false } = {}) {
  if (bestOf !== 3 && bestOf !== 5) throw new Error('A match is best of 3 or best of 5.');
  if (!TEAMS.includes(firstServe)) throw new Error('First serve must be one of the two teams.');
  const home = cleanTeam(teams.home, 'Us');
  const away = cleanTeam(teams.away, 'Opponent');
  if (home.name.toLowerCase() === away.name.toLowerCase()) {
    throw new Error('The two teams need different names.');
  }
  const config = { bestOf, firstServe, teams: { home, away } };
  if (sample) config.sample = true;
  return { version: VERSION, config, events: [] };
}

const hasPlayer = (match, team, number) =>
  match.config.teams[team].players.some((p) => p.number === String(number));

// The player a rally is about sits on the winning team for an earned point and
// on the losing team for an error.
export function playerTeamFor(winner, how) {
  const kind = HOWS[how]?.kind;
  if (kind === 'earned') return winner;
  if (kind === 'error') return otherTeam(winner);
  return null;
}

// Which endings are possible given who is serving: only the serving team can
// ace, and only the serving team can make a serving error.
export function allowedHows(serving, winner) {
  return Object.keys(HOWS).filter((how) => {
    if (how === 'ace') return winner === serving;
    if (how === 'serve_error') return winner !== serving;
    return true;
  });
}

function checkRally(match, state, rally) {
  if (state.winner) throw new Error('The match is over. Start a new match to keep scoring.');
  const { winner, how = 'other' } = rally;
  if (!TEAMS.includes(winner)) throw new Error('A rally needs a winner.');
  if (!HOWS[how]) throw new Error(`Unknown way to end a rally: ${how}.`);
  const serving = state.current.serving;
  if (!allowedHows(serving, winner).includes(how)) {
    throw new Error(how === 'ace'
      ? 'Only the serving team can score an ace.'
      : 'Only the serving team can make a serving error.');
  }
  const team = playerTeamFor(winner, how);
  let player = rally.player == null || rally.player === '' ? null : String(rally.player);
  if (!team) player = null;
  if (player !== null && !hasPlayer(match, team, player)) {
    throw new Error(`Number ${player} is not on the ${match.config.teams[team].name} roster.`);
  }
  return { t: 'rally', winner, how, player };
}

export function addRally(match, rally) {
  const event = checkRally(match, derive(match), rally);
  return { ...match, events: [...match.events, event] };
}

// Replace the detail of the rally that was just logged. The point itself is
// scored on the first tap; this fills in how it ended and who did it.
export function amendLastRally(match, { how, player }) {
  const last = match.events[match.events.length - 1];
  if (!last || last.t !== 'rally') throw new Error('There is no rally to add detail to.');
  return addRally(undo(match), { winner: last.winner, how, player });
}

export function undo(match) {
  if (!match.events.length) return match;
  return { ...match, events: match.events.slice(0, -1) };
}

// The first server of a set can be corrected until its first rally is played.
export function setFirstServe(match, team) {
  const state = derive(match);
  if (state.winner) throw new Error('The match is over.');
  if (!TEAMS.includes(team)) throw new Error('First serve must be one of the two teams.');
  if (state.current.rallies.length) throw new Error('The set has started, so the first server is fixed.');
  return { ...match, events: [...match.events, { t: 'serve', team }] };
}

export function substitute(match, team, out, inn) {
  const state = derive(match);
  if (state.winner) throw new Error('The match is over.');
  if (!TEAMS.includes(team)) throw new Error('Pick a team.');
  const off = String(out);
  const on = String(inn);
  const court = state.current.lineup[team];
  if (!court.includes(off)) throw new Error(`Number ${off} is not on court.`);
  if (!hasPlayer(match, team, on)) throw new Error(`Number ${on} is not on the roster.`);
  if (court.includes(on)) throw new Error(`Number ${on} is already on court.`);
  return { ...match, events: [...match.events, { t: 'sub', team, out: off, in: on }] };
}

// Rebuilds a match from untrusted data (storage, an imported file) by replaying
// every event through the same checks as live scoring.
export function importMatch(data) {
  if (!data || typeof data !== 'object' || !data.config || !Array.isArray(data.events)) {
    throw new Error('That is not a match file.');
  }
  let match = createMatch({ ...data.config, sample: Boolean(data.config.sample) });
  for (const e of data.events) {
    if (e?.t === 'rally') match = addRally(match, e);
    else if (e?.t === 'sub') match = substitute(match, e.team, e.out, e.in);
    else if (e?.t === 'serve') match = setFirstServe(match, e.team);
    else throw new Error('The match file has an event this app does not know.');
  }
  return match;
}

// ---------------------------------------------------------------- derive

export const setTarget = (bestOf, index) => (index === bestOf - 1 ? 15 : 25);

// A set is won at the target with a two-point lead. There is no cap.
export function setIsWon(a, b, target) {
  return Math.max(a, b) >= target && Math.abs(a - b) >= 2;
}

function emptyTeamStats() {
  const byHow = {};
  for (const h of Object.keys(HOWS)) byHow[h] = 0;
  return {
    points: 0, earned: 0, opponentErrors: 0, other: 0, byHow,
    errorsMade: 0,
    serves: 0, serveWon: 0, receptions: 0, sideOuts: 0,
    currentRun: 0,
    longestRun: { length: 0, setIndex: null, from: null, to: null },
  };
}

function emptyPlayerStats(team, p) {
  const earned = {};
  const errors = {};
  for (const h of EARNED) earned[h] = 0;
  for (const h of ERRORS) errors[h] = 0;
  return { key: playerKey(team, p.number), team, number: p.number, name: p.name, earned, errors, points: 0, errorCount: 0, net: 0, serves: 0 };
}

export function derive(match) {
  const { config, events } = match;
  const setsToWin = Math.ceil(config.bestOf / 2);
  const rosterHas = { home: new Set(), away: new Set() };
  const players = {};
  const teams = { home: emptyTeamStats(), away: emptyTeamStats() };
  // Who is on court, in starting order, with substitutions applied.
  const court = { home: [], away: [] };
  for (const team of TEAMS) {
    for (const p of config.teams[team].players) {
      rosterHas[team].add(p.number);
      players[playerKey(team, p.number)] = emptyPlayerStats(team, p);
    }
    court[team] = config.teams[team].players.slice(0, 6).map((p) => p.number);
  }

  const state = { sets: [], setsWon: { home: 0, away: 0 }, winner: null, rallies: [], ignored: 0, setsToWin };
  let set = null;
  const openSet = () => {
    const index = state.sets.length;
    const firstServe = index === 0 ? config.firstServe : otherTeam(state.sets[index - 1].firstServe);
    set = {
      index, target: setTarget(config.bestOf, index), deciding: index === config.bestOf - 1,
      home: 0, away: 0, winner: null, firstServe, serving: firstServe, rallies: [],
      // lineup[team][0] is the server (position 1), then positions 2 to 6.
      lineup: { home: [...court.home], away: [...court.away] },
      run: { team: null, length: 0 },
    };
    state.sets.push(set);
  };
  openSet();

  for (const e of events) {
    if (state.winner) { state.ignored += 1; continue; }

    if (e.t === 'serve') {
      if (set.rallies.length === 0 && TEAMS.includes(e.team)) { set.firstServe = e.team; set.serving = e.team; }
      continue;
    }
    if (e.t === 'sub') {
      for (const list of [court[e.team], set.lineup[e.team]]) {
        const i = list ? list.indexOf(e.out) : -1;
        if (i >= 0) list[i] = e.in;
      }
      continue;
    }
    if (e.t !== 'rally' || !TEAMS.includes(e.winner)) continue;

    const how = HOWS[e.how] ? e.how : 'other';
    const kind = HOWS[how].kind;
    const winner = e.winner;
    const loser = otherTeam(winner);
    const serving = set.serving;
    const server = set.lineup[serving][0] ?? null;
    const playerTeam = playerTeamFor(winner, how);
    const player = playerTeam && e.player != null && rosterHas[playerTeam].has(String(e.player)) ? String(e.player) : null;

    set[winner] += 1;
    if (set.run.team === winner) set.run.length += 1;
    else set.run = { team: winner, length: 1 };

    const rally = {
      n: state.rallies.length + 1, setIndex: set.index, inSet: set.rallies.length + 1,
      winner, how, kind, playerTeam, player, serving, server,
      home: set.home, away: set.away, net: set.home - set.away, run: set.run.length,
    };
    set.rallies.push(rally);
    state.rallies.push(rally);

    // team tallies
    const tw = teams[winner];
    tw.points += 1;
    tw.byHow[how] += 1;
    if (kind === 'earned') tw.earned += 1;
    else if (kind === 'error') { tw.opponentErrors += 1; teams[loser].errorsMade += 1; }
    else tw.other += 1;
    teams[serving].serves += 1;
    teams[otherTeam(serving)].receptions += 1;
    if (winner === serving) tw.serveWon += 1; else tw.sideOuts += 1;
    if (set.run.length > tw.longestRun.length) {
      tw.longestRun = { length: set.run.length, setIndex: set.index, from: rally.inSet - set.run.length + 1, to: rally.inSet };
    }

    // player tallies
    if (server !== null) players[playerKey(serving, server)].serves += 1;
    if (player !== null) {
      const ps = players[playerKey(playerTeam, player)];
      if (kind === 'earned') { ps.earned[how] += 1; ps.points += 1; }
      else { ps.errors[how] += 1; ps.errorCount += 1; }
      ps.net = ps.points - ps.errorCount;
    }

    // side-out: the receiving team wins the serve and rotates one place
    if (winner !== serving) {
      set.serving = winner;
      const l = set.lineup[winner];
      if (l.length > 1) l.push(l.shift());
    }

    if (setIsWon(set.home, set.away, set.target)) {
      set.winner = winner;
      state.setsWon[winner] += 1;
      if (state.setsWon[winner] >= setsToWin) state.winner = winner;
      else openSet();
    }
  }

  state.current = set;
  state.complete = state.winner !== null;
  for (const team of TEAMS) {
    teams[team].currentRun = !state.complete && set.run.team === team ? set.run.length : 0;
  }
  state.teams = teams;
  state.players = players;
  state.bench = {};
  for (const team of TEAMS) {
    state.bench[team] = config.teams[team].players.map((p) => p.number).filter((n) => !set.lineup[team].includes(n));
  }
  return state;
}

// Set point or match point for the open set, or null.
export function pressure(match, state = derive(match)) {
  if (state.complete) return null;
  const s = state.current;
  for (const team of TEAMS) {
    const mine = s[team] + 1;
    const theirs = s[otherTeam(team)];
    if (setIsWon(mine, theirs, s.target) && mine > theirs) {
      return { team, type: state.setsWon[team] + 1 >= state.setsToWin ? 'match' : 'set' };
    }
  }
  return null;
}

export function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
