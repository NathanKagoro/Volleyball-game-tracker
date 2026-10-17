// A fictional match used as the landing state, so the app opens on a working
// scoreboard instead of an empty form. Teams, players and every rally are
// invented. The rallies are generated from a fixed seed through the same
// addRally() checks as live scoring, so the sample is always a valid match.

import { createMatch, addRally, derive, otherTeam } from './logic.js';

export const SAMPLE_SEED = 335;

const HOME = [
  ['4', 'Okafor'], ['7', 'Lindqvist'], ['9', 'Mwakyusa'], ['11', 'Patel'],
  ['12', 'Hughes'], ['15', 'Nowak'], ['2', 'Achieng'], ['18', 'Brennan'],
];
const AWAY = [
  ['1', 'Sato'], ['3', 'Fernandes'], ['6', 'Kimaro'], ['8', 'Dubois'],
  ['10', 'Whitlock'], ['13', 'Haile'], ['5', 'Petrov'], ['17', 'Ansah'],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(rand, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of table) { r -= w; if (r < 0) return value; }
  return table[table.length - 1][0];
}

// Outcome weights for the team that served and won (a break point) and for the
// team that received and won (a side-out).
const BREAK = [['ace', 16], ['kill', 30], ['block', 20], ['tip', 6], ['hit_error', 14], ['reception_error', 5], ['net_fault', 3], ['ball_handling', 2], ['out', 3], ['other', 1]];
const SIDE_OUT = [['serve_error', 20], ['kill', 46], ['tip', 8], ['block', 7], ['hit_error', 9], ['net_fault', 3], ['ball_handling', 2], ['out', 3], ['other', 2]];

const FRONT = [1, 2, 3]; // lineup indexes of positions 2, 3, 4
const BACK = [0, 4, 5];

function pickPlayer(rand, lineup, how) {
  if (how === 'ace' || how === 'serve_error') return lineup[0];
  if (how === 'other') return null;
  if (rand() < 0.04) return null; // now and then the scorer misses who it was
  const slots = how === 'reception_error' ? BACK : how === 'ball_handling' || how === 'out' ? [0, 1, 2, 3, 4, 5] : FRONT;
  return lineup[slots[Math.floor(rand() * slots.length)]];
}

// stopAt: { set, total } stops once the given set (0-based) has that many
// rallies, leaving the match in progress. Omit it to play the match out.
export function generateMatch(seed = SAMPLE_SEED, stopAt = { set: 2, total: 17 }) {
  const rand = mulberry32(seed);
  let match = createMatch({
    bestOf: 3,
    firstServe: 'home',
    sample: true,
    teams: {
      home: { name: 'Kestrels', players: HOME.map(([number, name]) => ({ number, name })) },
      away: { name: 'Quayside', players: AWAY.map(([number, name]) => ({ number, name })) },
    },
  });
  for (let guard = 0; guard < 400; guard += 1) {
    const state = derive(match);
    if (state.complete) break;
    const set = state.current;
    if (stopAt && set.index === stopAt.set && set.rallies.length >= stopAt.total) break;
    const serving = set.serving;
    // Receiving teams win most rallies; the home side is a touch stronger.
    const edge = serving === 'home' ? 0.41 : 0.37;
    const winner = rand() < edge ? serving : otherTeam(serving);
    const how = weighted(rand, winner === serving ? BREAK : SIDE_OUT);
    const kind = how === 'other' ? null : ['ace', 'kill', 'block', 'tip'].includes(how) ? winner : otherTeam(winner);
    const player = kind ? pickPlayer(rand, set.lineup[kind], how) : null;
    match = addRally(match, { winner, how, player });
  }
  return match;
}

export const sampleMatch = () => generateMatch();
