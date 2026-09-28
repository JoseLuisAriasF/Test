// RoGuessr round engine. Shared by the browser and the VS Worker:
// same pool + seed + config => identical rounds, so the server can score ranked answers itself.

export const TYPES = {
  shot: { name: 'Screenshots', emoji: '📸', hints: 3, hint: 'Zoom out' },
  icon: { name: 'Pixel icons', emoji: '🧩', hints: 3, hint: 'Sharpen' },
  higher: { name: 'Higher or lower', emoji: '📈', hints: 0 },
  trivia: { name: 'Trivia', emoji: '❓', hints: 1, hint: '50:50' },
  code: { name: 'Codes', emoji: '🎁', hints: 1, hint: '50:50' },
  badge: { name: 'Badges', emoji: '🏅', hints: 1, hint: '50:50' },
};
export const ALL = Object.keys(TYPES);
export const MAXPTS = [5000, 3500, 2000, 1000]; // max points by hints used
export const ROUND_OPTS = [5, 7, 10, 15];
export const TIME_OPTS = [10, 15, 20, 30];

export const TIERS = [
  { min: 0, name: 'Bronze', e: '🥉', c: '#d08a52' },
  { min: 1100, name: 'Silver', e: '🥈', c: '#c9d1e0' },
  { min: 1250, name: 'Gold', e: '🥇', c: '#ffcc33' },
  { min: 1400, name: 'Platinum', e: '💠', c: '#3cc8ff' },
  { min: 1550, name: 'Diamond', e: '💎', c: '#b86cf5' },
  { min: 1700, name: 'Legend', e: '👑', c: '#ff5fa2' },
];
export const tierOf = (elo) => [...TIERS].reverse().find((t) => elo >= t.min);
export const nextTier = (elo) => TIERS.find((t) => t.min > elo) ?? null;

export function cleanConfig(c = {}) {
  const types = [...new Set((Array.isArray(c.types) ? c.types : []).filter((t) => t in TYPES))];
  return {
    types: types.length ? types : ['shot'],
    rounds: ROUND_OPTS.includes(+c.rounds) ? +c.rounds : 5,
    time: TIME_OPTS.includes(+c.time) ? +c.time : 20,
  };
}

export const points = (level, elapsedMs, time) => {
  const left = time - elapsedMs / 1000;
  return left <= 0 ? 0 : Math.round(MAXPTS[Math.min(level, 3)] * (0.5 + (0.5 * left) / time));
};

export const compact = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const hash = (s) => {
  let x = 2166136261;
  for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  // fmix32 finalizer: FNV alone barely changes the high bits when only the last char differs.
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

// pool item: { id, t: title, s: slug, g: genre, i: icon, c: creator, y: year, n: playing, v: visits, sh: [shots], cd: [{c, r}], b: [badge names] }
export function makeRounds(pool, seed, cfg, count = cfg.rounds) {
  const R = (key) => (seed ? hash(`${seed}:${key}`) : Math.random());
  const shuffle = (list, key) => list.map((x) => [R(`${key}:${x?.id ?? x}`), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  let used = new Set();
  const nextGame = (k, ok) => {
    let list = pool.filter((g) => !used.has(g.id) && ok(g));
    if (!list.length) list = pool.filter(ok);
    const g = shuffle(list, `g${k}`)[0];
    if (g) used.add(g.id);
    return g;
  };
  const titleOpts = (g, k) => {
    const same = shuffle(pool.filter((x) => x.id !== g.id && x.g === g.g), `s${k}`);
    const other = shuffle(pool.filter((x) => x.id !== g.id && x.g !== g.g), `o${k}`);
    return shuffle([g, ...[...same.slice(0, 2), ...other].slice(0, 3)], `q${k}`).map((x) => ({ k: String(x.id), t: x.t }));
  };
  const labelOpts = (right, wrong, k) => shuffle([right, ...shuffle([...new Set(wrong)].filter((w) => w !== right), `w${k}`).slice(0, 3)], `q${k}`).map((t) => ({ k: t, t }));
  const base = (type, g, extra) => ({ type, a: String(g.id), game: { t: g.t, s: g.s }, ...extra });

  const build = {
    shot(k) {
      const g = nextGame(k, (x) => x.sh?.length);
      return g && base('shot', g, {
        q: 'Which Roblox game is this?',
        media: { shot: g.sh[Math.floor(R(`p${k}`) * g.sh.length)], fx: 20 + R(`x${k}`) * 60, fy: 25 + R(`y${k}`) * 50 },
        opts: titleOpts(g, k), info: `${g.t} · ${compact(g.n)} playing now`,
      });
    },
    icon(k) {
      const g = nextGame(k, (x) => x.i);
      return g && base('icon', g, { q: 'Whose game icon is this?', media: { icon: g.i }, opts: titleOpts(g, k), info: `${g.t} by ${g.c}` });
    },
    higher(k) {
      const a = nextGame(k, () => true);
      const metric = R(`m${k}`) < 0.6 ? 'n' : 'v';
      const b = a && shuffle(pool.filter((x) => x.id !== a.id && x[metric] !== a[metric]), `h${k}`)[0];
      if (!b) return null;
      const win = a[metric] > b[metric] ? a : b;
      const duo = shuffle([a, b], `d${k}`);
      return base('higher', win, {
        q: metric === 'n' ? 'Which game has MORE players right now?' : 'Which game has MORE total visits?',
        media: { duo: duo.map((x) => ({ t: x.t, i: x.i, val: compact(x[metric]) })) },
        opts: duo.map((x) => ({ k: String(x.id), t: x.t })),
        info: duo.map((x) => `${x.t}: ${compact(x[metric])}`).join(' vs '),
      });
    },
    trivia(k) {
      const g = nextGame(k, () => true);
      if (!g) return null;
      const kind = ['creator', 'genre', 'year'][Math.floor(R(`k${k}`) * 3)];
      const card = { card: { t: g.t, i: g.i } };
      if (kind === 'creator') return { ...base('trivia', g, { q: `Who made ${g.t}?`, media: card, info: `${g.t} is made by ${g.c}` }), a: g.c, opts: labelOpts(g.c, pool.map((x) => x.c), k) };
      if (kind === 'genre') return { ...base('trivia', g, { q: `What type of game is ${g.t}?`, media: card, info: `${g.t} is a ${g.g} game` }), a: g.g, opts: labelOpts(g.g, pool.map((x) => x.g), k) };
      const years = [-3, -2, -1, 1, 2, 3].map((d) => String(g.y + d)).filter((y) => +y <= new Date().getUTCFullYear() && +y >= 2006);
      return { ...base('trivia', g, { q: `When did ${g.t} come out?`, media: card, info: `${g.t} launched in ${g.y}` }), a: String(g.y), opts: labelOpts(String(g.y), years, k) };
    },
    code(k) {
      const g = nextGame(k, (x) => x.cd?.length);
      const c = g && g.cd[Math.floor(R(`c${k}`) * g.cd.length)];
      return g && base('code', g, { q: 'Which game is this code for?', media: { text: c.c, sub: c.r }, opts: titleOpts(g, k), info: `${c.c} works in ${g.t}!` });
    },
    badge(k) {
      const g = nextGame(k, (x) => x.b?.length);
      const b = g && g.b[Math.floor(R(`b${k}`) * g.b.length)];
      return g && base('badge', g, { q: 'Which game has this badge?', media: { text: `🏅 ${b}` }, opts: titleOpts(g, k), info: `"${b}" is a ${g.t} badge` });
    },
  };

  const rounds = [];
  for (let k = 0; k < count; k++) {
    const type = cfg.types[Math.floor(R(`t${k}`) * cfg.types.length)];
    rounds.push(build[type](k) ?? build.shot(k));
  }
  return rounds;
}

// 50:50 hint: which options to hide (deterministic, never the answer).
export const fiftyFifty = (round) => round.opts.filter((o) => o.k !== round.a).slice(0, 2).map((o) => o.k);

// Multiplayer Elo: every pair of real players is a mini-match on final score.
export function eloDeltas(players, K = 40) {
  const out = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const a of players)
    for (const b of players) {
      if (a === b || (a.ip && a.ip === b.ip)) continue; // same network: don't let alts farm rating
      const expected = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
      const actual = a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
      out[a.id] += (K * (actual - expected)) / (players.length - 1);
    }
  return Object.fromEntries(Object.entries(out).map(([id, d]) => [id, Math.round(d)]));
}
