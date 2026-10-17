// Momentum chart as an SVG string. Pure, so it can be tested in Node, drawn
// inline on the page and rasterised to PNG from the same markup. Every style is
// an attribute, because an SVG drawn into a canvas cannot see the page's CSS.
//
// One panel per set. y is the set's running score difference (home minus
// away), x is the rally number within the set. A marker is filled when the
// point was earned (ace, kill, block, tip), hollow when it came from the
// opponent's error, and a small square when no detail was logged. Runs of three
// or more points are shaded in the scoring team's colour.

import { HOWS } from './logic.js';

export const CHART = {
  bg: '#0D0F12',
  panel: '#15181D',
  grid: '#2A2F37',
  zero: '#6B7480',
  ink: '#F2EFE6',
  muted: '#A4ACB6',
  line: '#C9CED6',
  home: '#FFD60A',
  away: '#63C5FF',
  font: "'Big Shoulders Display', 'Arial Narrow', Arial, sans-serif",
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (n) => Math.round(n * 10) / 10;
const minus = (n) => (n < 0 ? `−${-n}` : n > 0 ? `+${n}` : '0');

export function describeRally(match, rally) {
  const teams = match.config.teams;
  const won = teams[rally.winner].name;
  let detail = HOWS[rally.how].label;
  if (rally.player !== null) {
    const p = teams[rally.playerTeam].players.find((x) => x.number === rally.player);
    const who = `#${rally.player}${p && p.name ? ` ${p.name}` : ''}`;
    detail += rally.kind === 'earned' ? ` by ${who}` : ` by ${teams[rally.playerTeam].name} ${who}`;
  } else if (rally.kind === 'error') {
    detail += ` by ${teams[rally.playerTeam].name}`;
  }
  return `Point ${won}. ${detail}. ${rally.home}–${rally.away}`;
}

export function runsOf(rallies, min = 3) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= rallies.length; i += 1) {
    if (i === rallies.length || rallies[i].winner !== rallies[start].winner) {
      if (i - start >= min) out.push({ team: rallies[start].winner, from: start, to: i - 1, length: i - start });
      start = i;
    }
  }
  return out;
}

export function momentumSvg(match, state, { width = 360, stacked = width < 640, title = true } = {}) {
  const teams = match.config.teams;
  const sets = state.sets.filter((s, i) => s.rallies.length || i === 0);
  const peak = Math.max(5, ...state.rallies.map((r) => Math.abs(r.net)));
  const yMax = Math.ceil(peak / 5) * 5;
  const pad = { l: 34, r: 12, t: 28, b: 22 };
  const headH = title ? 64 : 8;
  const panelH = stacked ? 150 : 210;
  const gap = stacked ? 14 : 0;
  const cols = stacked ? 1 : sets.length;
  const rows = stacked ? sets.length : 1;
  const totalRallies = sets.reduce((s, x) => s + Math.max(x.rallies.length, 10), 0);
  const plotW = width - pad.l - pad.r;
  const height = headH + rows * panelH + (rows - 1) * gap + 34;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(CHART.font)}" role="img" aria-labelledby="mtitle mdesc">`);
  const summary = sets.filter((s) => s.rallies.length).map((s) => `set ${s.index + 1} ${s.home}–${s.away}`).join(', ');
  parts.push(`<title id="mtitle">Momentum, ${esc(teams.home.name)} v ${esc(teams.away.name)}</title>`);
  parts.push(`<desc id="mdesc">Running score difference after each rally, one panel per set: ${esc(summary || 'no rallies yet')}. The rally table below has the same data.</desc>`);
  parts.push(`<rect width="${width}" height="${height}" fill="${CHART.bg}"/>`);

  if (title) {
    parts.push(`<text x="${pad.l - 22}" y="26" fill="${CHART.ink}" font-size="22" font-weight="800">Momentum</text>`);
    // legend: team swatches, then marker shapes
    let lx = pad.l - 22;
    const ly = 48;
    for (const t of ['home', 'away']) {
      parts.push(`<rect x="${lx}" y="${ly - 9}" width="12" height="12" rx="2" fill="${CHART[t]}"/>`);
      parts.push(`<text x="${lx + 17}" y="${ly + 2}" fill="${CHART.ink}" font-size="14" font-weight="700">${esc(teams[t].name)}</text>`);
      lx += 26 + teams[t].name.length * 7.5;
    }
    const shapes = [['filled', 'earned'], ['ring', 'their error'], ['square', 'no detail']];
    for (const [shape, label] of shapes) {
      if (lx + 80 > width && width < 520) break;
      parts.push(marker(shape, lx + 5, ly - 3, CHART.muted));
      parts.push(`<text x="${lx + 14}" y="${ly + 2}" fill="${CHART.muted}" font-size="13" font-weight="600">${label}</text>`);
      lx += 20 + label.length * 6.4;
    }
  }

  sets.forEach((set, k) => {
    const col = stacked ? 0 : k;
    const row = stacked ? k : 0;
    const share = stacked ? 1 : Math.max(set.rallies.length, 10) / totalRallies;
    const before = stacked ? 0 : sets.slice(0, k).reduce((s, x) => s + Math.max(x.rallies.length, 10), 0) / totalRallies;
    const x0 = pad.l + plotW * before;
    const w = plotW * share - (stacked || col === cols - 1 ? 0 : 8);
    const y0 = headH + row * (panelH + gap);
    const top = y0 + pad.t;
    const h = panelH - pad.t - pad.b;
    const n = Math.max(set.rallies.length, stacked ? 30 : 10);
    const sx = (i) => x0 + 6 + (i / n) * (w - 12);
    const sy = (v) => top + h / 2 - (v / yMax) * (h / 2);

    parts.push(`<rect x="${r1(x0)}" y="${y0}" width="${r1(w)}" height="${panelH}" fill="${CHART.panel}" rx="3"/>`);
    const label = set.rallies.length ? `Set ${set.index + 1}  ${set.home}–${set.away}` : `Set ${set.index + 1}`;
    const tag = set.winner ? `  to ${teams[set.winner].name}` : set.rallies.length && !state.complete && set === state.current ? '  in play' : '';
    parts.push(`<text x="${r1(x0 + 8)}" y="${y0 + 18}" fill="${CHART.ink}" font-size="15" font-weight="800">${esc(label)}<tspan fill="${CHART.muted}" font-weight="600">${esc(tag)}</tspan></text>`);

    // grid and axis labels (left axis on the first panel of each row only)
    for (let v = -yMax; v <= yMax; v += 5) {
      const y = r1(sy(v));
      parts.push(`<line x1="${r1(x0)}" x2="${r1(x0 + w)}" y1="${y}" y2="${y}" stroke="${v === 0 ? CHART.zero : CHART.grid}" stroke-width="${v === 0 ? 1.5 : 1}"${v === 0 ? '' : ' stroke-dasharray="2 3"'}/>`);
      if (col === 0) parts.push(`<text x="${pad.l - 6}" y="${y + 4}" fill="${CHART.muted}" font-size="12" text-anchor="end" font-weight="600">${minus(v)}</text>`);
    }
    if (col === 0) {
      parts.push(`<text x="${r1(x0 + w - 6)}" y="${r1(top + 10)}" fill="${CHART.muted}" font-size="12" text-anchor="end" font-weight="600">${esc(teams.home.name)} ahead</text>`);
      parts.push(`<text x="${r1(x0 + w - 6)}" y="${r1(top + h - 2)}" fill="${CHART.muted}" font-size="12" text-anchor="end" font-weight="600">${esc(teams.away.name)} ahead</text>`);
    }

    // runs of three or more
    const step = (w - 12) / n;
    for (const run of runsOf(set.rallies)) {
      const a = sx(run.from + 0.5);
      const b = sx(run.to + 1.5);
      parts.push(`<rect x="${r1(a)}" y="${top}" width="${r1(Math.max(b - a, 2))}" height="${r1(h)}" fill="${CHART[run.team]}" fill-opacity="0.16"/>`);
      if (run.length >= 4) parts.push(`<text x="${r1((a + b) / 2)}" y="${top - 3}" fill="${CHART[run.team]}" font-size="12" font-weight="800" text-anchor="middle">${run.length}</text>`);
    }

    // x ticks
    const every = n > 40 ? 10 : 5;
    for (let i = every; i <= n; i += every) {
      parts.push(`<text x="${r1(sx(i))}" y="${y0 + panelH - 6}" fill="${CHART.muted}" font-size="11" text-anchor="middle" font-weight="600">${i}</text>`);
    }

    if (!set.rallies.length) return;
    const pts = [[sx(0), sy(0)], ...set.rallies.map((r, i) => [sx(i + 1), sy(r.net)])];
    parts.push(`<polyline points="${pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ')}" fill="none" stroke="${CHART.line}" stroke-width="2" stroke-linejoin="round"/>`);
    const size = step < 5 ? 'small' : 'normal';
    set.rallies.forEach((r, i) => {
      const [x, y] = pts[i + 1];
      const shape = r.kind === 'earned' ? 'filled' : r.kind === 'error' ? 'ring' : 'square';
      parts.push(`<g>${marker(shape, x, y, CHART[r.winner], size)}<circle cx="${r1(x)}" cy="${r1(y)}" r="${Math.max(6, step / 2)}" fill="transparent"><title>Set ${set.index + 1}, rally ${r.inSet}. ${esc(describeRally(match, r))}</title></circle></g>`);
    });
  });

  const fy = height - 12;
  parts.push(`<text x="${pad.l - 22}" y="${fy}" fill="${CHART.muted}" font-size="12" font-weight="600">Rally number in the set. Shaded: runs of 3 or more, longer runs numbered.</text>`);
  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}

function marker(shape, x, y, color, size = 'normal') {
  const r = size === 'small' ? 3 : 4.2;
  const X = r1(x);
  const Y = r1(y);
  if (shape === 'filled') return `<circle cx="${X}" cy="${Y}" r="${r}" fill="${color}" stroke="${CHART.panel}" stroke-width="1.5"/>`;
  if (shape === 'ring') return `<circle cx="${X}" cy="${Y}" r="${r - 0.6}" fill="${CHART.panel}" stroke="${color}" stroke-width="2"/>`;
  const s = r * 1.3;
  return `<rect x="${r1(x - s / 2)}" y="${r1(y - s / 2)}" width="${r1(s)}" height="${r1(s)}" fill="${color}" stroke="${CHART.panel}" stroke-width="1"/>`;
}
