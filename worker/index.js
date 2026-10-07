// RoGuessr backend. Only /api/* reaches this Worker; the rest of the site is static assets (free, unlimited).
//   Room        - one Durable Object per match (WebSocket hibernation). Scores every answer itself.
//   Matchmaker  - hands out open rooms for quick match / ranked queues.
//   Leaderboard - SQLite profiles: rating, stats (unlock cosmetics), avatar, optional Google link; weekly parkour board.
//   Race        - Infinite Parkour online races: the 'lobby' instance pairs players, one instance per race relays positions.
//   Chase       - Blox Chase PvP rooms: the 'lobby' instance lists open rooms, one instance per room keeps the real HP.
// Players never type text: names are generated, so there is no chat to moderate.
import { DurableObject } from 'cloudflare:workers';
import { makeRounds, cleanConfig, points, eloDeltas, TYPES } from '../src/lib/rounds.js';
import { sanitize, DEFAULT, SKINS } from '../src/lib/avatar.js';
import { verifyGoogleToken, googleKeys, hashId } from './google.js';
import { GOOGLE_CLIENT_ID } from '../src/lib/config.js';
import { weekOf, makeCourse, RACE_GOAL, MIN_MS_PER_PLAT } from '../src/lib/parkour.js';
import { MAPS as GOLF_MAPS, verifyRun } from '../src/lib/golf.js';
import { CHARS, CHAR_IDS, MAPS as CHASE_MAPS, MODES, MATCH_MS, MMR_START, CALIBRATION, reach, hitData, damage, isInv, mmrDeltas, ST, MV } from '../src/lib/chase.js';
import { MAX_PLAYERS as NIGHT_MAX, botName, newRounds, roundStart, roundFinish, roundEnd, humansDone, fastForward, ROUND_GAP } from '../src/lib/typer.js';

const ADJ = ['Turbo', 'Sneaky', 'Mega', 'Cosmic', 'Happy', 'Ninja', 'Golden', 'Rapid', 'Brave', 'Lucky', 'Epic', 'Shiny', 'Silly', 'Mighty', 'Pixel', 'Rocket'];
const ANIMAL = ['Panda', 'Fox', 'Dragon', 'Noob', 'Tiger', 'Penguin', 'Shark', 'Bunny', 'Robot', 'Owl', 'Frog', 'Unicorn', 'Dino', 'Cat', 'Wolf', 'Bee'];
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789'; // no vowels: room codes can't spell words
const MAX_PLAYERS = 6;
const QUICK_WAIT = 15000; // casual quick match: start (with a bot if alone) after this
const COUNTDOWN = 3500;
const XFER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: easy to read and type
const MIN_RANKED = 3; // ranked games before you appear on the leaderboard / can hold a top spot

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const newName = () => `${pick(ADJ)} ${pick(ANIMAL)} ${Math.floor(Math.random() * 90) + 10}`;
const roomCode = () => Array.from({ length: 5 }, () => pick(CODE_CHARS)).join('');
const guestAvatar = () => sanitize({ ...DEFAULT, skin: Math.floor(Math.random() * SKINS.length), body: pick(['boy', 'girl', 'other']), hair: pick(['hair-short', 'hair-long', 'hair-pony', 'hair-bun', 'hair-curly']) }, {}, 0);
const lb = (env) => env.LB.get(env.LB.idFromName('global'));
const mm = (env, path, body) => env.MATCH.get(env.MATCH.idFromName('global')).fetch(`https://mm${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/api/quick' || (path === '/api/ranked' && req.headers.get('Upgrade') === 'websocket')) return env.MATCH.get(env.MATCH.idFromName('global')).fetch(req);
    if (['/api/me', '/api/avatar', '/api/login', '/api/transfer', '/api/redeem'].includes(path)) {
      if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
      return lb(env).fetch(req);
    }
    if (path === '/api/parkour' || path === '/api/parkour/start' || path === '/api/golf' || path === '/api/golf/start') {
      if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
      return lb(env).fetch(req);
    }
    if (path === '/api/race' || /^\/api\/race\/[A-Z0-9]{5}$/.test(path)) {
      if (req.headers.get('Upgrade') !== 'websocket') return Response.json({ error: 'WebSocket only' }, { status: 426 });
      return env.RACE.get(env.RACE.idFromName(path === '/api/race' ? 'lobby' : path.slice(10))).fetch(req);
    }
    if (path === '/api/night' || /^\/api\/night\/[A-Z0-9]{5}$/.test(path)) {
      if (req.headers.get('Upgrade') !== 'websocket') return Response.json({ error: 'WebSocket only' }, { status: 426 });
      return env.NIGHT.get(env.NIGHT.idFromName(path === '/api/night' ? 'lobby' : path.slice(11))).fetch(req);
    }
    if (path === '/api/chase' || /^\/api\/chase\/[A-Z0-9]{5}$/.test(path)) {
      if (req.headers.get('Upgrade') !== 'websocket') return Response.json({ error: 'WebSocket only' }, { status: 426 });
      return env.CHASE.get(env.CHASE.idFromName(path === '/api/chase' ? 'lobby' : path.slice(11))).fetch(req);
    }
    if (path === '/api/top' || path === '/api/parkour/top' || path === '/api/golf/top' || path === '/api/chase/top') {
      const cache = caches.default;
      let res = await cache.match(req);
      if (!res) {
        res = new Response((await lb(env).fetch(req)).body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } });
        ctx.waitUntil(cache.put(req, res.clone()));
      }
      return res;
    }
    const m = path.match(/^\/api\/room\/([A-Z0-9]{5})$/);
    if (m && req.headers.get('Upgrade') === 'websocket') return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};

// Casual quick match hands out open rooms. Ranked is a live board of 1v1 challenges: a player posts one
// with the modes they picked, everyone watching the board gets it pushed over WebSocket and can accept it.
export class Matchmaker extends DurableObject {
  async challenges() {
    const all = (await this.ctx.storage.get('challenges')) ?? {};
    for (const [code, c] of Object.entries(all)) if (Date.now() - c.at > 30 * 60000) delete all[code]; // safety net
    return all;
  }
  board(all) {
    return JSON.stringify({ type: 'board', list: Object.values(all).sort((a, b) => b.at - a.at) });
  }
  async publish(all) {
    await this.ctx.storage.put('challenges', all);
    const msg = this.board(all);
    for (const w of this.ctx.getWebSockets()) try { w.send(msg); } catch {}
  }
  webSocketMessage() {} // the board is read-only for viewers

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ranked') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.send(this.board(await this.challenges()));
      return new Response(null, { status: 101, webSocket: client });
    }
    // internal, from Room
    if (url.pathname === '/open') {
      const c = await req.json();
      const all = await this.challenges();
      all[c.code] = { ...c, at: Date.now() };
      await this.publish(all);
      return new Response('ok');
    }
    if (url.pathname === '/close') {
      const all = await this.challenges();
      if (all[url.searchParams.get('code')]) {
        delete all[url.searchParams.get('code')];
        await this.publish(all);
      }
      return new Response('ok');
    }
    // casual quick match: rooms auto-start after QUICK_WAIT, so stop filling them just before
    const now = Date.now();
    let open = await this.ctx.storage.get('casual');
    if (!open || open.n >= MAX_PLAYERS || now - open.at > QUICK_WAIT - 3000) open = { code: roomCode(), n: 0, at: now };
    open.n++;
    await this.ctx.storage.put('casual', open);
    return Response.json({ code: open.code });
  }
}

export class Room extends DurableObject {
  async load() {
    return (await this.ctx.storage.get('room')) ?? { phase: 'lobby', seed: null, cfg: null, startAt: 0, quick: false, ranked: false, live: false, bot: false, roster: [], scores: {}, results: null };
  }
  save(room) {
    return this.ctx.storage.put('room', room);
  }
  players(except) {
    return this.ctx.getWebSockets().filter((w) => w !== except).map((w) => w.deserializeAttachment()).filter(Boolean).sort((a, b) => a.joined - b.joined);
  }
  // Same seed + config + pool as the browsers => same rounds, so answers can be checked here.
  async rounds(room) {
    if (this.memo?.seed !== room.seed) {
      const pool = await this.env.ASSETS.fetch('https://assets.local/guessr.json').then((r) => r.json());
      this.memo = { seed: room.seed, rounds: makeRounds(pool, room.seed, room.cfg) };
    }
    return this.memo.rounds;
  }

  // Every event that touches room state runs strictly in order. Without this, an await on an outside
  // fetch (question pool, leaderboard) lets the next message run on stale state: a "go" for round 2
  // arriving while round 1 is being scored was dropped, and every later answer with it.
  serial(fn) {
    const run = (this.chain ?? Promise.resolve()).then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }
  fetch(req) { return this.serial(() => this.join(req)); }
  webSocketMessage(ws, raw) { return this.serial(() => this.onMessage(ws, raw)); }
  webSocketClose(ws) { return this.serial(() => this.onClose(ws)); }
  alarm() { return this.serial(() => this.onAlarm()); }

  async join(req) {
    const url = new URL(req.url);
    const room = await this.load();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const reject = (msg) => {
      server.send(JSON.stringify({ type: 'error', msg }));
      server.close(4000, 'rejected');
      return new Response(null, { status: 101, webSocket: client });
    };
    const count = this.players(server).length;
    if (count >= MAX_PLAYERS) return reject('This room is full!');
    if (room.ranked && count >= 2) return reject('Someone already accepted this challenge. Pick another one!');
    if (room.phase === 'playing') return reject('This game already started. Try another room!');

    const id = url.searchParams.get('pid');
    const tok = url.searchParams.get('tok');
    const profile = id && tok ? await lb(this.env).fetch('https://lb/verify', { method: 'POST', body: JSON.stringify({ id, tok }) }).then((r) => (r.ok ? r.json() : null)) : null;
    const wantsRanked = url.searchParams.has('ranked');
    if ((wantsRanked || room.ranked) && !profile) return reject('Create your player card to play Ranked!');
    if (profile && this.players(server).some((p) => p.pid === profile.id)) return reject('You are already in this room in another tab.');

    room.code ??= url.pathname.split('/').pop();
    if (count === 0 && url.searchParams.has('quick')) {
      room.quick = true;
      await this.ctx.storage.setAlarm(Date.now() + QUICK_WAIT);
    }
    if (count === 0 && wantsRanked) {
      // The creator posts a 1v1 challenge with the modes they picked; it starts when someone accepts.
      room.ranked = true;
      room.cfg = cleanConfig({ types: (url.searchParams.get('types') || '').split(','), rounds: url.searchParams.get('rounds'), time: url.searchParams.get('time') });
    }
    await this.save(room);
    const ip = req.headers.get('CF-Connecting-IP') ?? '';
    server.serializeAttachment({
      id: crypto.randomUUID().slice(0, 8), pid: profile?.id ?? null, name: profile?.name ?? newName(), avatar: profile?.avatar ?? guestAvatar(),
      elo: profile?.elo ?? null, ip: ip ? (await hashId(ip)).slice(0, 10) : '', score: 0, round: 0, log: [], done: false, cur: null, streak: 0, best: 0, joined: Date.now(),
    });
    this.broadcast(room);
    if (room.ranked && room.phase === 'lobby') {
      if (count === 0) await mm(this.env, '/open', { code: room.code, cfg: room.cfg, host: { name: profile.name, avatar: profile.avatar, elo: profile.elo, id: profile.id } });
      else await this.begin(room, room.cfg); // challenge accepted: fight!
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = await this.load();
    const me = ws.deserializeAttachment();
    if (!me) return;
    const playing = room.phase === 'playing';

    if (m.type === 'reroll' && !playing && !me.pid) {
      Object.assign(me, { name: newName(), avatar: guestAvatar() });
    } else if (m.type === 'start' && !playing && !room.quick && !room.ranked && this.players()[0]?.id === me.id) {
      return this.begin(room, cleanConfig(m.cfg));
    } else if (m.type === 'go' && playing && m.r === me.round + 1 && !me.cur) {
      me.cur = { r: m.r, t0: Date.now(), level: 0 };
    } else if (m.type === 'hint' && playing && me.cur) {
      const round = (await this.rounds(room))[me.cur.r - 1];
      if (me.cur.level < TYPES[round.type].hints) me.cur.level++;
    } else if (m.type === 'ans' && playing && me.cur?.r === m.r) {
      const round = (await this.rounds(room))[m.r - 1];
      const ok = m.pick === round.a;
      const pts = ok ? points(me.cur.level, Date.now() - me.cur.t0, room.cfg.time) : 0;
      me.score += pts;
      me.round = m.r;
      me.log.push(ok);
      me.streak = ok ? me.streak + 1 : 0;
      me.best = Math.max(me.best, me.streak);
      me.cur = null;
      me.done = me.round >= room.cfg.rounds;
      room.scores[me.id] = me.score; // kept even if this player leaves, so rage-quitting still counts as a loss
      ws.send(JSON.stringify({ type: 'scored', r: m.r, ok, pts, total: me.score }));
    } else return;

    ws.serializeAttachment(me);
    if (room.phase === 'playing' && this.players().every((p) => p.done)) return this.finish(room);
    await this.save(room);
    this.broadcast(room);
  }

  async begin(room, cfg) {
    const players = this.players();
    for (const w of this.ctx.getWebSockets()) {
      const p = w.deserializeAttachment();
      if (p) w.serializeAttachment({ ...p, score: 0, round: 0, log: [], done: false, cur: null, streak: 0, best: 0, delta: undefined });
    }
    Object.assign(room, {
      phase: 'playing', seed: crypto.randomUUID().slice(0, 12), cfg, startAt: Date.now() + COUNTDOWN,
      bot: players.length === 1, live: room.ranked && players.length > 1, scores: {}, results: null,
      roster: players.map(({ id, pid, name, avatar, elo, ip }) => ({ id, pid, name, avatar, elo, ip })),
    });
    await this.save(room);
    await this.ctx.storage.setAlarm(room.startAt + room.cfg.rounds * (room.cfg.time + 10) * 1000);
    if (room.ranked) await mm(this.env, `/close?code=${room.code}`);
    this.broadcast(room);
  }

  async finish(room) {
    room.phase = 'over';
    const live = new Map(this.players().map((p) => [p.id, p]));
    const final = room.roster.map((p) => ({ ...p, score: room.scores[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
    const deltas = room.live ? eloDeltas(final.filter((p) => p.pid)) : {};
    const reports = final.filter((p) => p.pid && live.has(p.id)).map((p) => {
      const s = live.get(p.id);
      return {
        id: p.pid, delta: deltas[p.id] ?? 0, ranked: room.live ? 1 : 0, won: final.length > 1 && final[0].id === p.id && p.score > 0 ? 1 : 0,
        correct: s.log.filter(Boolean).length, streak: s.best, perfect: s.log.length === room.cfg.rounds && s.log.every(Boolean) ? 1 : 0,
      };
    });
    // Leavers in ranked still lose their rating.
    for (const p of final) if (p.pid && !live.has(p.id) && room.live) reports.push({ id: p.pid, delta: deltas[p.id] ?? 0, ranked: 1, won: 0, correct: 0, streak: 0, perfect: 0 });
    const updated = reports.length ? await lb(this.env).fetch('https://lb/result', { method: 'POST', body: JSON.stringify(reports) }).then((r) => r.json()).catch(() => ({})) : {};
    room.results = final.map(({ id, pid, name, avatar, score }) => ({ id, name, avatar, score, delta: room.live && pid ? deltas[id] ?? 0 : null, elo: pid ? updated[pid] ?? null : null }));
    await this.save(room);
    this.broadcast(room);
  }

  async onAlarm() {
    const room = await this.load();
    if (room.phase === 'lobby' && room.quick && this.players().length) return this.begin(room, cleanConfig({ types: Object.keys(TYPES), rounds: 7, time: 20 }));
    if (room.phase === 'playing') return this.finish(room);
  }

  async onClose(ws) {
    const left = this.players(ws);
    const room = await this.load();
    if (room.ranked && room.phase === 'lobby') await mm(this.env, `/close?code=${room.code}`); // creator gave up waiting
    if (!left.length) return this.ctx.storage.deleteAll();
    if (room.phase === 'playing' && left.every((p) => p.done)) return this.finish(room);
    this.broadcast(room, ws);
  }

  broadcast(room, except) {
    const players = this.players(except).map(({ id, name, avatar, elo, score, round, log, done, pid }) => ({ id, name, avatar, elo, score, round, log, done, member: !!pid }));
    const { phase, seed, cfg, startAt, quick, ranked, live, bot, results } = room;
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      const you = w.deserializeAttachment()?.id;
      try { w.send(JSON.stringify({ type: 'state', now: Date.now(), phase, seed, cfg, startAt, quick, ranked, live, bot, results, you, host: players[0]?.id, players })); } catch {}
    }
  }
}

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS p (
      id TEXT PRIMARY KEY, tok TEXT NOT NULL, gid TEXT UNIQUE, name TEXT, av TEXT,
      elo INTEGER DEFAULT 1000, peak INTEGER DEFAULT 1000, ranked INTEGER DEFAULT 0, wins INTEGER DEFAULT 0,
      games INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, perfect INTEGER DEFAULT 0, at INTEGER)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS p_elo ON p(ranked, elo)');
    // Transfer code: lets players without Google (e.g. under 13) move their profile to another device.
    try { this.sql.exec('ALTER TABLE p ADD COLUMN xfer TEXT'); } catch {} // already there
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS p_xfer ON p(xfer)');
    // Infinite Parkour weekly board: best platform reached on the week's course (ties: faster wins).
    // Parkour ranked races: a separate rating so racing and RoGuessr don't mix.
    for (const col of ['pkelo INTEGER DEFAULT 1000', 'pkwins INTEGER DEFAULT 0', 'pkgames INTEGER DEFAULT 0']) {
      try { this.sql.exec(`ALTER TABLE p ADD COLUMN ${col}`); } catch {} // already there
    }
    this.sql.exec('CREATE TABLE IF NOT EXISTS pkrun (id TEXT PRIMARY KEY, wk INTEGER, t0 INTEGER)'); // server-timed weekly runs
    this.sql.exec('CREATE TABLE IF NOT EXISTS pk (wk INTEGER, id TEXT, score INTEGER, ms INTEGER, at INTEGER, PRIMARY KEY (wk, id))');
    // Golf Climb speedruns: one open run per player (server clock + the seed of the angel's luck), best time per map.
    this.sql.exec('CREATE TABLE IF NOT EXISTS golfrun (id TEXT PRIMARY KEY, mi INTEGER, nonce TEXT, t0 INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS golf (mi INTEGER, id TEXT, ms INTEGER, shots INTEGER, at INTEGER, PRIMARY KEY (mi, id))');
    // Blox Chase PvP: ranked MMR (medals), wins and KOs.
    for (const col of ['chwins INTEGER DEFAULT 0', 'chgames INTEGER DEFAULT 0', 'chkos INTEGER DEFAULT 0', 'chmmr INTEGER DEFAULT 1000', 'chpeak INTEGER DEFAULT 1000']) {
      try { this.sql.exec(`ALTER TABLE p ADD COLUMN ${col}`); } catch {} // already there
    }
    this.sql.exec('CREATE INDEX IF NOT EXISTS p_chmmr ON p(chmmr)');
  }
  row(id) {
    return this.sql.exec('SELECT * FROM p WHERE id = ?', String(id)).toArray()[0];
  }
  auth(body) {
    const r = body?.id && this.row(body.id);
    return r && r.tok === body.tok ? r : null;
  }
  rank(r) {
    // Ties broken by wins, then by who got there first, so exactly one player holds each spot (and its cosmetics).
    if (r.ranked < MIN_RANKED) return 0;
    return this.sql.exec(
      'SELECT COUNT(*) AS n FROM p WHERE ranked >= ? AND (elo > ? OR (elo = ? AND (wins > ? OR (wins = ? AND id < ?))))',
      MIN_RANKED, r.elo, r.elo, r.wins, r.wins, r.id,
    ).one().n + 1;
  }
  view(r, rank = this.rank(r)) {
    const stats = { games: r.games, wins: r.wins, correct: r.correct, streak: r.streak, perfect: r.perfect, peak: r.peak };
    return { id: r.id, name: r.name, avatar: sanitize(JSON.parse(r.av || 'null'), stats, rank), elo: r.elo, rank, ranked: r.ranked, google: !!r.gid, stats, pk: { elo: r.pkelo ?? 1000, wins: r.pkwins ?? 0, games: r.pkgames ?? 0 }, ch: { wins: r.chwins ?? 0, games: r.chgames ?? 0, kos: r.chkos ?? 0, mmr: r.chmmr ?? 1000, peak: r.chpeak ?? 1000 } };
  }
  create(gid = null) {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    this.sql.exec('INSERT INTO p (id, tok, gid, name, av, at) VALUES (?, ?, ?, ?, ?, ?)', id, crypto.randomUUID().replace(/-/g, ''), gid, newName(), JSON.stringify(guestAvatar()), Date.now());
    return this.row(id);
  }
  withTok(r) {
    return Response.json({ ...this.view(r), tok: r.tok });
  }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (path === '/api/me') {
      let r = this.auth(body) ?? this.create();
      if (body.reroll) {
        this.sql.exec('UPDATE p SET name = ? WHERE id = ?', newName(), r.id);
        r = this.row(r.id);
      }
      return this.withTok(r);
    }
    if (path === '/api/login') {
      let payload;
      try { payload = await verifyGoogleToken(body.credential, GOOGLE_CLIENT_ID, googleKeys); } catch (e) {
        console.error('google login rejected:', e.message); // detail stays in the logs, not in the page
        return Response.json({ error: 'Google sign-in failed. Please try again.' }, { status: 401 });
      }
      const gid = await hashId(payload.sub);
      let r = this.sql.exec('SELECT * FROM p WHERE gid = ?', gid).toArray()[0];
      if (!r) {
        const guest = this.auth(body);
        if (guest && !guest.gid) {
          this.sql.exec('UPDATE p SET gid = ? WHERE id = ?', gid, guest.id); // keep the guest's progress
          r = this.row(guest.id);
        } else r = this.create(gid);
      }
      return this.withTok(r);
    }
    if (path === '/api/transfer') {
      const r = this.auth(body);
      if (!r) return Response.json({ error: 'Unknown player' }, { status: 401 });
      let code = body.renew ? null : r.xfer;
      if (!code) {
        const bytes = crypto.getRandomValues(new Uint8Array(12)); // 12 x 5 bits = 60 bits
        code = [...bytes].map((b) => XFER_CHARS[b % 32]).join('');
        this.sql.exec('UPDATE p SET xfer = ? WHERE id = ?', code, r.id); // renewing kills the old code
      }
      return Response.json({ code: `BIBI-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` });
    }
    if (path === '/api/redeem') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^BIBI/, '');
      const r = code.length === 12 && this.sql.exec('SELECT * FROM p WHERE xfer = ?', code).toArray()[0];
      if (!r) return Response.json({ error: 'That code does not exist. Check it and try again!' }, { status: 404 });
      return this.withTok(r);
    }
    if (path === '/api/avatar') {
      const r = this.auth(body);
      if (!r) return Response.json({ error: 'Unknown player' }, { status: 401 });
      const v = this.view(r);
      this.sql.exec('UPDATE p SET av = ? WHERE id = ?', JSON.stringify(sanitize(body.avatar, v.stats, v.rank)), r.id);
      return this.withTok(this.row(r.id));
    }
    if (path === '/api/top') {
      const rows = this.sql.exec('SELECT * FROM p WHERE ranked >= ? ORDER BY elo DESC, wins DESC, id ASC LIMIT 100', MIN_RANKED).toArray();
      return Response.json({ top: rows.map((r, i) => ({ ...this.view(r, i + 1), stats: undefined, wins: r.wins, ranked: r.ranked })), total: this.sql.exec('SELECT COUNT(*) AS n FROM p WHERE ranked >= ?', MIN_RANKED).one().n });
    }
    if (path === '/api/parkour/start') {
      const r = this.auth(body);
      if (!r) return Response.json({ error: 'Unknown player' }, { status: 401 });
      this.sql.exec('INSERT INTO pkrun (id, wk, t0) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET wk = excluded.wk, t0 = excluded.t0', r.id, weekOf(), Date.now());
      return Response.json({ ok: true });
    }
    if (path === '/api/parkour') {
      const r = this.auth(body);
      if (!r) return Response.json({ error: 'Unknown player' }, { status: 401 });
      const wk = weekOf(), score = Math.floor(+body.score);
      if (body.wk !== wk) return Response.json({ error: 'A new week started! Play the new course.' }, { status: 409 });
      // Anti-cheat: the server times the run itself, and the reported spot must be that platform of this week's course.
      const run = this.sql.exec('SELECT * FROM pkrun WHERE id = ? AND wk = ?', r.id, wk).toArray()[0];
      const ms = run ? Date.now() - run.t0 : 0;
      const p = score >= 1 && score <= 5000 && (this.course?.seed === `week${wk}` ? this.course : (this.course = makeCourse(`week${wk}`))).ensure(score + 1)[score];
      const near = p && Math.hypot(+body.x - p.x, +body.z - p.z) <= 12 && Math.abs(+body.y - p.y) <= 4;
      if (!near || ms < score * MIN_MS_PER_PLAT || ms > 864e5) return Response.json({ error: 'Run rejected' }, { status: 400 });
      this.sql.exec(
        `INSERT INTO pk (wk, id, score, ms, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (wk, id) DO UPDATE SET score = excluded.score, ms = excluded.ms, at = excluded.at
         WHERE excluded.score > pk.score OR (excluded.score = pk.score AND excluded.ms < pk.ms)`,
        wk, r.id, score, ms, Date.now(),
      );
      const best = this.sql.exec('SELECT score, ms FROM pk WHERE wk = ? AND id = ?', wk, r.id).one();
      const rank = this.sql.exec('SELECT COUNT(*) AS n FROM pk WHERE wk = ? AND (score > ? OR (score = ? AND ms < ?))', wk, best.score, best.score, best.ms).one().n + 1;
      return Response.json({ ...best, rank });
    }
    if (path === '/api/parkour/top') {
      const wk = weekOf();
      const rows = this.sql.exec('SELECT p.*, pk.score AS pscore, pk.ms AS pms FROM pk JOIN p ON p.id = pk.id WHERE pk.wk = ? ORDER BY pk.score DESC, pk.ms ASC LIMIT 50', wk).toArray();
      const racers = this.sql.exec('SELECT * FROM p WHERE pkgames > 0 ORDER BY pkelo DESC, pkwins DESC, id ASC LIMIT 20').toArray();
      return Response.json({
        wk,
        top: rows.map((r) => ({ id: r.id, name: r.name, avatar: this.view(r).avatar, score: r.pscore, ms: r.pms })),
        racers: racers.map((r) => ({ id: r.id, name: r.name, avatar: this.view(r).avatar, elo: r.pkelo, wins: r.pkwins, games: r.pkgames })),
      });
    }
    if (path === '/api/golf/start') {
      const r = this.auth(body), mi = Math.floor(+body.mi);
      if (!r || !GOLF_MAPS[mi]) return Response.json({ error: 'Unknown player or map' }, { status: 400 });
      const nonce = crypto.randomUUID().slice(0, 12);
      this.sql.exec('INSERT INTO golfrun (id, mi, nonce, t0) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET mi = excluded.mi, nonce = excluded.nonce, t0 = excluded.t0', r.id, mi, nonce, Date.now());
      return Response.json({ nonce });
    }
    if (path === '/api/golf') {
      const r = this.auth(body), mi = Math.floor(+body.mi);
      const run = r && this.sql.exec('SELECT * FROM golfrun WHERE id = ? AND mi = ?', r.id, mi).toArray()[0];
      if (!run) return Response.json({ error: 'No climb in progress on this map' }, { status: 400 });
      // Anti-cheat: replay every shot on the same map with the same luck. The ball must really end in the cup,
      // and the server's own clock can't be faster than the ball's flight time.
      const v = verifyRun(mi, run.nonce, body.shots);
      const ms = Date.now() - run.t0;
      if (!v || ms < (v.ticks * 1000) / 120 - 1000 || ms > 864e5) return Response.json({ error: 'Run rejected' }, { status: 400 });
      this.sql.exec('DELETE FROM golfrun WHERE id = ?', r.id); // one submit per climb
      this.sql.exec(
        `INSERT INTO golf (mi, id, ms, shots, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (mi, id) DO UPDATE SET ms = excluded.ms, shots = excluded.shots, at = excluded.at
         WHERE excluded.ms < golf.ms`,
        mi, r.id, ms, v.shots, Date.now(),
      );
      const best = this.sql.exec('SELECT ms FROM golf WHERE mi = ? AND id = ?', mi, r.id).one().ms;
      const rank = this.sql.exec('SELECT COUNT(*) AS n FROM golf WHERE mi = ? AND ms < ?', mi, best).one().n + 1;
      return Response.json({ ms, best, rank });
    }
    if (path === '/api/golf/top') {
      const mi = Math.floor(+new URL(req.url).searchParams.get('m')) || 0;
      const rows = this.sql.exec('SELECT p.*, golf.ms AS gms, golf.shots AS gshots FROM golf JOIN p ON p.id = golf.id WHERE golf.mi = ? ORDER BY golf.ms ASC LIMIT 20', mi).toArray();
      return Response.json({ mi, top: rows.map((r) => ({ id: r.id, name: r.name, avatar: this.view(r).avatar, ms: r.gms, shots: r.gshots })) });
    }
    if (path === '/api/chase/top') {
      // calibrated players by MMR, then wins
      const rows = this.sql.exec('SELECT * FROM p WHERE chgames >= ? ORDER BY chmmr DESC, chwins DESC, id ASC LIMIT 100', CALIBRATION).toArray();
      return Response.json({ top: rows.map((r) => ({ id: r.id, name: r.name, avatar: this.view(r).avatar, mmr: r.chmmr, peak: r.chpeak, wins: r.chwins, games: r.chgames, kos: r.chkos })), total: this.sql.exec('SELECT COUNT(*) AS n FROM p WHERE chgames >= ?', CALIBRATION).one().n });
    }
    // internal (only reachable from Room, never routed from the public Worker)
    if (path === '/chresult') {
      const out = {};
      for (const x of Array.isArray(body) ? body : []) {
        const d = Math.max(-80, Math.min(80, x.delta | 0));
        this.sql.exec('UPDATE p SET chwins = chwins + ?, chgames = chgames + 1, chkos = chkos + ?, chmmr = MAX(0, chmmr + ?), chpeak = MAX(chpeak, chmmr + ?), at = ? WHERE id = ?', x.won ? 1 : 0, Math.min(3, x.kos | 0), d, d, Date.now(), String(x.id));
        const r = this.row(x.id);
        if (r) out[x.id] = { wins: r.chwins, games: r.chgames, mmr: r.chmmr };
      }
      return Response.json(out);
    }
    if (path === '/verify') {
      const r = this.auth(body);
      return r ? Response.json(this.view(r)) : Response.json(null, { status: 404 });
    }
    if (path === '/pkresult') {
      const out = {};
      for (const x of Array.isArray(body) ? body : []) {
        this.sql.exec('UPDATE p SET pkelo = MAX(0, pkelo + ?), pkwins = pkwins + ?, pkgames = pkgames + 1, at = ? WHERE id = ?', x.delta | 0, x.won ? 1 : 0, Date.now(), String(x.id));
        const r = this.row(x.id);
        if (r) out[x.id] = r.pkelo;
      }
      return Response.json(out);
    }
    if (path === '/result') {
      const out = {};
      for (const x of Array.isArray(body) ? body : []) {
        this.sql.exec(
          `UPDATE p SET elo = MAX(0, elo + ?), peak = MAX(peak, elo + ?), ranked = ranked + ?, wins = wins + ?, games = games + 1,
           correct = correct + ?, streak = MAX(streak, ?), perfect = perfect + ?, at = ? WHERE id = ?`,
          x.delta | 0, x.delta | 0, x.ranked | 0, x.won | 0, x.correct | 0, x.streak | 0, x.perfect | 0, Date.now(), String(x.id),
        );
        const r = this.row(x.id);
        if (r) out[x.id] = r.elo;
      }
      return Response.json(out);
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

// Infinite Parkour online races between two PCs. Instance 'lobby' pairs players for RANKED races (it arms the race
// server-side, so a friend link can never be ranked). A race instance accepts 2 verified profiles, starts both at the
// same moment and relays positions (~10/s). The server decides the winner: first to reach RACE_GOAL, no faster than
// humanly possible, or the one still there if the other leaves. Ranked races move the parkour rating (Elo).
export class Race extends DurableObject {
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/arm') { await this.ctx.storage.put('ranked', true); return new Response('ok'); } // internal: lobby only
    const code = path.split('/')[3];
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (!code) {
      const waiting = this.ctx.getWebSockets().filter((w) => w !== server && w.readyState === WebSocket.OPEN);
      if (waiting.length) {
        const race = roomCode();
        await this.env.RACE.get(this.env.RACE.idFromName(race)).fetch('https://race/arm', { method: 'POST' });
        const msg = JSON.stringify({ t: 'match', code: race });
        for (const w of [waiting[0], server]) { w.send(msg); w.close(1000, 'matched'); }
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.ctx.getWebSockets().length > 2 || (await this.ctx.storage.get('start'))) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(1000, 'full');
    } else {
      const ip = req.headers.get('CF-Connecting-IP') ?? '';
      server.serializeAttachment({ code, ip: ip ? (await hashId(ip)).slice(0, 10) : '' });
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  async finish(winner, forfeit = false) {
    if (await this.ctx.storage.get('winner')) return;
    await this.ctx.storage.put('winner', winner);
    const start = await this.ctx.storage.get('start');
    const ranked = !!(await this.ctx.storage.get('ranked'));
    const players = (await this.ctx.storage.get('players')) ?? [];
    let deltas = {}, elo = {};
    if (ranked && players.length === 2) {
      deltas = eloDeltas(players.map((p) => ({ ...p, score: p.id === winner ? 1 : 0 })), 32); // same network => 0 (no alt farming)
      elo = await lb(this.env).fetch('https://lb/pkresult', { method: 'POST', body: JSON.stringify(players.map((p) => ({ id: p.id, delta: deltas[p.id], won: p.id === winner }))) }).then((r) => r.json());
    }
    const msg = JSON.stringify({ t: 'end', winner, ms: Date.now() - start, forfeit, ranked, deltas, elo });
    for (const w of this.ctx.getWebSockets()) w.send(msg);
  }
  others(ws) { return this.ctx.getWebSockets().filter((w) => w !== ws); }
  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;
    if (m.t === 'hello' && !me.id) {
      const v = await lb(this.env).fetch('https://lb/verify', { method: 'POST', body: JSON.stringify({ id: m.id, tok: m.tok }) }).then((r) => (r.ok ? r.json() : null));
      if (!v || this.others(ws).some((w) => w.deserializeAttachment()?.id === v.id)) { ws.close(1008, 'bad profile'); return; }
      ws.serializeAttachment({ ...me, id: v.id, name: v.name, avatar: v.avatar, elo: v.pk.elo, i: 0 });
      const players = this.ctx.getWebSockets().map((w) => w.deserializeAttachment()).filter((p) => p?.id);
      if (players.length === 2 && !(await this.ctx.storage.get('start'))) {
        const start = Date.now() + 4000;
        const ranked = !!(await this.ctx.storage.get('ranked'));
        await this.ctx.storage.put({ start, players: players.map(({ id, elo, ip }) => ({ id, elo, ip })) });
        const msg = JSON.stringify({ t: 'start', at: start, now: Date.now(), seed: me.code, goal: RACE_GOAL, ranked, players: players.map(({ id, name, avatar, elo }) => ({ id, name, avatar, elo })) });
        for (const w of this.ctx.getWebSockets()) w.send(msg);
      }
      return;
    }
    if (m.t === 'p' && me.id) {
      const start = await this.ctx.storage.get('start');
      if (!start || (await this.ctx.storage.get('winner'))) return;
      // anti-cheat: progress only counts if you are really standing near that platform of this race's course,
      // a few platforms at a time, and not faster than humanly possible
      this.course ??= makeCourse(me.code);
      let i = Math.min(Math.floor(+m.i) || 0, RACE_GOAL);
      const p = i > me.i && this.course.ensure(i + 1)[i];
      if (!p || i > me.i + 3 || Math.hypot(+m.x - p.x, +m.z - p.z) > 12 || Math.abs(+m.y - p.y) > 4 || Date.now() - start < i * MIN_MS_PER_PLAT) i = me.i;
      if (i !== me.i) ws.serializeAttachment({ ...me, i });
      const out = JSON.stringify({ t: 'p', x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, f: +m.f || 0, s: +m.s || 0, a: m.a ? 1 : 0, e: String(m.e ?? '').slice(0, 8), i });
      for (const w of this.others(ws)) w.send(out);
      if (i >= RACE_GOAL && Date.now() - start >= RACE_GOAL * MIN_MS_PER_PLAT) await this.finish(me.id);
    }
  }
  async webSocketClose(ws) {
    const me = ws.deserializeAttachment();
    const rest = this.others(ws);
    const stayer = rest.map((w) => w.deserializeAttachment()).find((p) => p?.id);
    // leaving a started race = losing it (so rage-quitting can't dodge a ranked loss)
    if (me?.id && stayer && (await this.ctx.storage.get('start'))) await this.finish(stayer.id, true);
    else if (me?.id) for (const w of rest) w.send(JSON.stringify({ t: 'left' }));
    if (me?.code && !rest.length) await this.ctx.storage.deleteAll(); // race over: leave nothing behind
  }
}

// Night Shift typing rooms (max 4). Instance 'lobby' is the hub: it keeps the live list of open rooms and pushes it
// to everyone browsing. Every other instance is one room, in one of two modes:
//   surv   - survival: everyone types their own prompts, the server only relays progress (casual, nothing to cheat for)
//   rounds - same prompt for everyone, the server times who finishes last (bots are computed from the seed) and takes
//            a heart from them; most hearts wins. Pure rules in src/lib/typer.js, shared with the offline game.
const NIGHT_QUICK_WAIT = 15000;
export class Night extends DurableObject {
  players(except) {
    return this.ctx.getWebSockets().filter((w) => w !== except).map((w) => w.deserializeAttachment()).filter((p) => p?.name).sort((a, b) => a.joined - b.joined);
  }
  send(msg, except) { const raw = JSON.stringify(msg); for (const w of this.ctx.getWebSockets()) if (w !== except) try { w.send(raw); } catch {} }
  hub(body) { return this.env.NIGHT.get(this.env.NIGHT.idFromName('lobby')).fetch('https://hub/hub', { method: 'POST', body: JSON.stringify(body) }).catch(() => {}); }
  async room() { return (await this.ctx.storage.get('room')) ?? {}; }
  async lobby(except) {
    const room = await this.room();
    const players = this.players(except).map(({ id, name, avatar }) => ({ id, name, avatar }));
    this.send({ t: 'lobby', code: room.code, mode: room.mode, quick: !!room.quick, bots: room.bots !== false, host: players[0]?.id, players, startAt: room.quickAt ?? 0, now: Date.now() }, except);
    if (players.length) await this.hub({ code: room.code, mode: room.mode, quick: !!room.quick, bots: room.bots !== false, n: players.length, host: players[0].name, avatar: players[0].avatar });
  }
  serial(fn) { const run = (this.chain ?? Promise.resolve()).then(fn, fn); this.chain = run.catch(() => {}); return run; }
  fetch(req) { return this.serial(() => this.onFetch(req)); }
  webSocketMessage(ws, raw) { return this.serial(() => this.onMessage(ws, raw)); }
  webSocketClose(ws) { return this.serial(() => this.onClose(ws)); }
  alarm() { return this.serial(() => this.onAlarm()); }

  async onFetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/hub') { // internal: a room opened, changed or closed
      const b = await req.json();
      const rooms = (await this.ctx.storage.get('rooms')) ?? {};
      if (b.close) delete rooms[b.code]; else rooms[b.code] = { ...b, at: Date.now() };
      for (const [c, x] of Object.entries(rooms)) if (Date.now() - x.at > 20 * 60000) delete rooms[c];
      await this.ctx.storage.put('rooms', rooms);
      this.send({ t: 'rooms', list: Object.values(rooms).sort((a, b) => b.at - a.at) });
      return new Response('ok');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (url.pathname === '/api/night') { // browsing: get the room list now and every time it changes
      const rooms = (await this.ctx.storage.get('rooms')) ?? {};
      server.send(JSON.stringify({ t: 'rooms', list: Object.values(rooms).sort((a, b) => b.at - a.at) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    const room = await this.room();
    room.code ??= url.pathname.slice(11);
    room.phase ??= 'lobby';
    if (room.phase !== 'lobby' || this.players(server).length >= NIGHT_MAX) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!this.players(server).length && !room.mode) { // the creator picks the rules
      room.mode = url.searchParams.get('mode') === 'rounds' ? 'rounds' : 'surv';
      room.bots = true;
      if (url.searchParams.has('quick')) { room.quick = true; room.quickAt = Date.now() + NIGHT_QUICK_WAIT; await this.ctx.storage.setAlarm(room.quickAt); }
    }
    await this.ctx.storage.put('room', room);
    server.serializeAttachment({ joined: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }
  async begin() {
    const room = await this.room();
    if (room.phase !== 'lobby') return;
    const humans = this.players();
    if (!humans.length) return;
    const seed = crypto.randomUUID().slice(0, 10);
    const bots = room.bots !== false ? NIGHT_MAX - humans.length : 0;
    const roster = [
      ...humans.map(({ id, name, avatar }) => ({ id, name, avatar })),
      ...Array.from({ length: bots }, (_, k) => ({ id: `bot${k}`, bot: k, name: botName(seed, k), avatar: guestAvatar() })),
    ];
    Object.assign(room, { phase: 'play', seed, at: Date.now() + 5000 });
    let first = null;
    if (room.mode === 'rounds') {
      room.rs = newRounds(roster, room.at);
      first = roundStart(room.rs, seed, room.at);
      room.next = 'end';
      await this.ctx.storage.setAlarm(room.rs.at + room.rs.limit + 300);
    }
    await this.ctx.storage.put('room', room);
    await this.hub({ code: room.code, close: true });
    this.send({ t: 'start', mode: room.mode, seed, at: room.at, now: Date.now(), roster, round: first });
  }
  async endRound(room) {
    const rs = room.rs;
    if (!rs || rs.endedR === rs.r) return;
    rs.endedR = rs.r;
    const msg = roundEnd(rs, room.seed, Date.now());
    if (!rs.over && fastForward(rs, room.seed, Date.now())) Object.assign(msg, { over: true, ff: true });
    if (rs.over) { room.phase = 'over'; room.next = null; }
    else { room.next = 'start'; await this.ctx.storage.setAlarm(Date.now() + ROUND_GAP); }
    await this.ctx.storage.put('room', room);
    this.send({ ...msg, now: Date.now() });
  }
  async onAlarm() {
    const room = await this.room();
    if (room.phase === 'lobby' && room.quick) return this.begin();
    if (room.phase !== 'play' || room.mode !== 'rounds') return;
    if (room.next === 'end') return this.endRound(room);
    if (room.next === 'start') {
      const msg = roundStart(room.rs, room.seed, Date.now());
      room.next = 'end';
      await this.ctx.storage.setAlarm(room.rs.at + room.rs.limit + 300);
      await this.ctx.storage.put('room', room);
      this.send({ ...msg, now: Date.now() });
    }
  }
  async onMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;
    const room = await this.room();
    if (m.t === 'hello' && !me.name) {
      const v = m.id && m.tok ? await lb(this.env).fetch('https://lb/verify', { method: 'POST', body: JSON.stringify({ id: m.id, tok: m.tok }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (v && this.players(ws).some((p) => p.pid === v.id)) { ws.send(JSON.stringify({ t: 'full', dup: true })); ws.close(1000, 'dup'); return; }
      const id = crypto.randomUUID().slice(0, 8);
      ws.serializeAttachment({ ...me, id, pid: v?.id ?? null, name: v?.name ?? newName(), avatar: v?.avatar ?? guestAvatar() });
      ws.send(JSON.stringify({ t: 'you', id }));
      if (this.players().length >= NIGHT_MAX && room.phase === 'lobby') return this.begin();
      return this.lobby();
    }
    if (!me.name) return;
    const host = this.players()[0]?.id === me.id;
    if (m.t === 'bots' && host && room.phase === 'lobby' && !room.quick) { room.bots = !!m.on; await this.ctx.storage.put('room', room); return this.lobby(); }
    if (m.t === 'start' && host && room.phase === 'lobby') return this.begin();
    if (room.phase !== 'play' || me.dead) return;
    if (m.t === 'fin' && room.mode === 'rounds' && m.r === room.rs.r) {
      const ms = roundFinish(room.rs, me.id, Date.now());
      if (ms == null) return;
      await this.ctx.storage.put('room', room);
      this.send({ t: 'fin', id: me.id, r: room.rs.r, ms });
      if (humansDone(room.rs)) await this.endRound(room);
      return;
    }
    // progress relay: prompt (or round) index, char index, power, score; 'dead' once
    if (m.t === 's' || m.t === 'dead') {
      const out = { t: m.t, id: me.id, i: Math.max(0, m.i | 0), c: Math.max(0, m.c | 0), hp: Math.max(0, Math.min(100, +m.hp || 0)), sc: Math.max(0, m.sc | 0), e: ['bad', 'done', 'perfect'].includes(m.e) ? m.e : '', ms: Math.max(0, m.ms | 0) };
      if (m.t === 'dead') ws.serializeAttachment({ ...me, dead: true });
      this.send(out, ws);
    }
  }
  async onClose(ws) {
    const me = ws.deserializeAttachment();
    const room = await this.room();
    if (me?.name) this.send({ t: 'left', id: me.id }, ws);
    const left = this.players(ws);
    if (!left.length) {
      if (room.code && room.phase === 'lobby') await this.hub({ code: room.code, close: true });
      await this.ctx.storage.deleteAll();
      return;
    }
    if (room.phase === 'lobby') return this.lobby(ws);
    if (room.mode === 'rounds' && room.phase === 'play' && me?.id && room.rs.lives[me.id] > 0) { // leaving = out of the match
      room.rs.lives[me.id] = 0;
      await this.ctx.storage.put('room', room);
      if (humansDone(room.rs)) await this.endRound(room);
    }
  }
}

// Blox Chase PvP rooms (up to 6: 1v1, 2v2, 3v3 or free for all). Instance 'lobby' is the hub: the live list of open rooms. Every other instance is one
// room: players pick a fighter, the host starts, each browser simulates its own fighter and relays it (~20/s).
// The server keeps the only real HP: an attacker claims a hit, the server checks the move exists for that fighter and
// could reach from the attacker's last position to the victim's (who must not be invulnerable), applies the damage from
// the shared move data (src/lib/chase.js) and decides KOs and the winner. Ranked MMR (mmrDeltas) only moves between different networks.
const CHASE_BUDGET = 650, CHASE_REFILL = 0.24; // damage per attacker: a bucket of 650 refilling 240/s (a full combo + a super)
const fiveCode = /^[A-Z0-9]{5}$/;
const isInvSnap = (ch, v) => isInv({ ch, st: v.st, mv: v.mv, t: v.t });
export class Chase extends DurableObject {
  players(except) {
    return this.ctx.getWebSockets().filter((w) => w !== except).map((w) => w.deserializeAttachment()).filter((p) => p?.name).sort((a, b) => a.joined - b.joined);
  }
  send(msg, except) { const raw = JSON.stringify(msg); for (const w of this.ctx.getWebSockets()) if (w !== except) try { w.send(raw); } catch {} }
  hub(body) { return this.env.CHASE.get(this.env.CHASE.idFromName('lobby')).fetch('https://hub/hub', { method: 'POST', body: JSON.stringify(body) }).catch(() => {}); }
  async room() { return (this.r ??= (await this.ctx.storage.get('room')) ?? {}); }
  save() { return this.ctx.storage.put('room', this.r); }
  async lobby(except) {
    const room = await this.room();
    const players = this.players(except).map(({ id, name, avatar, ch, team, pid, mmr, games }) => ({ id, name, avatar, ch, team, member: !!pid, mmr, games }));
    this.send({ t: 'lobby', code: room.code, mode: room.mode, map: room.map, host: players[0]?.id, players, now: Date.now() }, except);
    if (players.length) await this.hub({ code: room.code, mode: room.mode, map: room.map, n: players.length, max: MODES[room.mode].max, host: players[0].name, avatar: players[0].avatar, chs: players.map((p) => p.ch) });
  }
  serial(fn) { const run = (this.chain ?? Promise.resolve()).then(fn, fn); this.chain = run.catch(() => {}); return run; }
  fetch(req) { return this.serial(() => this.onFetch(req)); }
  webSocketMessage(ws, raw) { return this.serial(() => this.onMessage(ws, raw)); }
  webSocketClose(ws) { return this.serial(() => this.onClose(ws)); }
  alarm() { return this.serial(() => this.onAlarm()); }

  async onFetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/hub') { // internal: a room opened, changed or closed
      const b = await req.json();
      const rooms = (await this.ctx.storage.get('rooms')) ?? {};
      if (b.close) delete rooms[b.code]; else rooms[b.code] = { ...b, at: Date.now() };
      for (const [c, x] of Object.entries(rooms)) if (Date.now() - x.at > 20 * 60000) delete rooms[c];
      await this.ctx.storage.put('rooms', rooms);
      this.send({ t: 'rooms', list: Object.values(rooms).sort((a, b) => b.at - a.at) });
      return new Response('ok');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    if (url.pathname === '/api/chase') { // browsing the room list
      const rooms = (await this.ctx.storage.get('rooms')) ?? {};
      server.send(JSON.stringify({ t: 'rooms', list: Object.values(rooms).sort((a, b) => b.at - a.at) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    const room = await this.room();
    const code = url.pathname.slice(11);
    if (!room.code) { // a brand new room: whoever opens it picks the rules
      const mode = url.searchParams.get('mode');
      Object.assign(room, { code, phase: 'lobby', mode: MODES[mode] ? mode : 'duel', map: Math.min(CHASE_MAPS.length - 1, Math.max(0, url.searchParams.get('map') | 0)) });
      await this.save();
    }
    if (room.phase !== 'lobby' || this.players(server).length >= MODES[room.mode].max) {
      server.send(JSON.stringify({ t: 'full', msg: room.phase === 'play' ? 'This fight already started. Pick another room!' : 'This room is full!' }));
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const ip = req.headers.get('CF-Connecting-IP') ?? '';
    server.serializeAttachment({ joined: Date.now(), ip: ip ? (await hashId(ip)).slice(0, 10) : '' });
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    if (!me) return;
    const room = await this.room();
    if (m.t === 'hello' && !me.name) {
      const v = m.id && m.tok ? await lb(this.env).fetch('https://lb/verify', { method: 'POST', body: JSON.stringify({ id: m.id, tok: m.tok }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (v && this.players(ws).some((p) => p.pid === v.id)) { ws.send(JSON.stringify({ t: 'full', msg: 'You are already in this room in another tab.' })); ws.close(1000, 'dup'); return; }
      const others = this.players(ws);
      const id = crypto.randomUUID().slice(0, 8);
      const team = others.filter((p) => p.team === 1).length <= others.filter((p) => p.team === 2).length ? 1 : 2;
      ws.serializeAttachment({ ...me, id, pid: v?.id ?? null, name: v?.name ?? newName(), avatar: v?.avatar ?? guestAvatar(), ch: CHARS[m.ch] ? m.ch : pick(CHAR_IDS), team, mmr: v?.ch.mmr ?? MMR_START, games: v?.ch.games ?? 0 });
      ws.send(JSON.stringify({ t: 'you', id }));
      return this.lobby();
    }
    if (!me.name) return;
    const host = this.players()[0]?.id === me.id;
    if (room.phase === 'lobby') {
      if (m.t === 'pick' && CHARS[m.ch]) { ws.serializeAttachment({ ...me, ch: m.ch }); return this.lobby(); }
      if (m.t === 'team') {
        const to = me.team === 1 ? 2 : 1;
        if (this.players().filter((p) => p.team === to).length >= MODES[room.mode].max / 2) return; // that side is full
        ws.serializeAttachment({ ...me, team: to });
        return this.lobby();
      }
      if (m.t === 'cfg' && host) {
        if (MODES[m.mode] && this.players().length <= MODES[m.mode].max) room.mode = m.mode;
        if (CHASE_MAPS[m.map]) room.map = m.map | 0;
        await this.save();
        return this.lobby();
      }
      if (m.t === 'start' && host) return this.begin();
      return;
    }
    if (room.phase !== 'play' || !(me.id in room.hp)) return;
    this.pos ??= new Map(); this.seen ??= new Set(); this.bucket ??= new Map(); this.veil ??= new Map(); // memory only: lost if the room is evicted mid-fight
    if (m.t === 's' && Array.isArray(m.s) && m.s.length >= 12) {
      const s = m.s.slice(0, 15).map((v) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : 0));
      const prev = this.pos.get(me.id), now = Date.now();
      // positions can't jump further than the fastest dash/blink allows since the last report (no teleport hacks)
      if (!prev || Math.hypot(s[0] - prev.x, s[1] - prev.y) <= ((now - prev.at) / 16.7) * 1.6 + 13) this.pos.set(me.id, { x: s[0], y: s[1], st: ST[s[5]] ?? 'idle', mv: MV[s[6]] ?? '', t: s[7], at: now });
      else { prev.at = now; s[0] = prev.x; s[1] = prev.y; }
      if (CHARS[me.ch].moves[MV[s[6]]]?.veil && !(this.veil.get(me.id)?.until > now)) this.veil.set(me.id, { until: now + 8000, mi: null }); // Phantom Veil buff
      return this.send({ t: 's', id: me.id, s }, ws);
    }
    if (m.t === 'pr' && hitData(me.ch, m.mv, m.k | 0)) {
      const n = (v, lim) => Math.max(-lim, Math.min(lim, +v || 0));
      return this.send({ t: 'pr', id: me.id, mv: m.mv, k: m.k | 0, x: n(m.x, 60), y: n(m.y, 60), vx: n(m.vx, 3), vy: n(m.vy, 3) }, ws);
    }
    if (m.t === 'hit') return this.hit(room, me, m);
  }

  async hit(room, me, m) {
    const to = String(m.to), k = m.k | 0;
    const h = hitData(me.ch, m.mv, k), r = reach(me.ch, m.mv, k);
    const a = this.pos.get(me.id), v = this.pos.get(to);
    const vic = room.roster.find((p) => p.id === to);
    if (!h || !r || !a || !v || !vic || !(room.hp[me.id] > 0) || !(room.hp[to] > 0)) return;
    if (MODES[room.mode].teams && vic.team === me.team) return;
    if (['down', 'up', 'dead'].includes(a.st)) return; // can't attack while lying on the floor
    if (isInvSnap(vic.ch, v)) return;
    if (Math.abs(a.x - v.x) > r.x || Math.abs(a.y - v.y) > r.y) return;
    const tag = `${me.id}:${m.mi | 0}:${k}:${to}`;
    if (this.seen.has(tag)) return;
    this.seen.add(tag);
    const vb = this.veil.get(me.id);
    let mul = 1;
    if (vb && vb.until > Date.now()) { vb.mi ??= m.mi | 0; if (vb.mi === (m.mi | 0)) mul = 1.3; else this.veil.delete(me.id); } // first attack after the veil: +30%
    const dmg = damage(me.ch, vic.ch, h, mul);
    const b = this.bucket.get(me.id) ?? { n: CHASE_BUDGET, at: Date.now() };
    b.n = Math.min(CHASE_BUDGET, b.n + (Date.now() - b.at) * CHASE_REFILL);
    b.at = Date.now();
    this.bucket.set(me.id, b);
    if (b.n < dmg) return; // ponytail: a damage bucket instead of tracking every fighter's MP server-side
    b.n -= dmg;
    room.hp[to] = Math.max(0, room.hp[to] - dmg);
    room.stats[me.id].dmg += dmg;
    this.send({ t: 'hit', by: me.id, to, mv: m.mv, k, dmg, hp: room.hp[to], dir: a.x <= v.x ? 1 : -1 });
    if (room.hp[to] <= 0) {
      room.stats[me.id].kos++;
      this.send({ t: 'ko', id: to, by: me.id });
      if (this.decided(room)) return this.end(room);
    }
    await this.save();
  }

  // the fight is over when one fighter (or one team) is left
  decided(room) {
    const alive = room.roster.filter((p) => room.hp[p.id] > 0);
    return MODES[room.mode].teams ? new Set(alive.map((p) => p.team)).size <= 1 : alive.length <= 1;
  }
  async begin() {
    const room = await this.room();
    const players = this.players();
    if (room.phase !== 'lobby' || players.length < 2 || players.length > MODES[room.mode].max) return;
    if (MODES[room.mode].teams && new Set(players.map((p) => p.team)).size < 2) return this.send({ t: 'note', msg: 'Both teams need at least one player!' });
    const spawns = CHASE_MAPS[room.map].spawns;
    const teams = MODES[room.mode].teams;
    const side = (p) => players.filter((q) => q.team === p.team).indexOf(p); // teams: red spawns on the left, blue on the right
    const spawnOf = (p, i) => (teams ? spawns.filter((x) => (p.team === 1 ? x < 0 : x > 0))[side(p) % 3] : spawns[i % spawns.length]);
    const roster = players.map((p, i) => ({ id: p.id, pid: p.pid, ip: p.ip, name: p.name, avatar: p.avatar, ch: p.ch, team: teams ? p.team : 0, spawn: spawnOf(p, i), mmr: p.mmr, games: p.games }));
    Object.assign(room, { phase: 'play', at: Date.now() + 4000, roster, hp: Object.fromEntries(roster.map((p) => [p.id, CHARS[p.ch].hp])), stats: Object.fromEntries(roster.map((p) => [p.id, { dmg: 0, kos: 0 }])) });
    this.pos = new Map(); this.seen = new Set(); this.bucket = new Map(); this.veil = new Map();
    await this.save();
    await this.ctx.storage.setAlarm(room.at + MATCH_MS + 500);
    await this.hub({ code: room.code, close: true });
    this.send({ t: 'start', at: room.at, now: Date.now(), map: room.map, mode: room.mode, roster: roster.map(({ pid, ip, ...p }) => ({ ...p, hp: room.hp[p.id] })) });
  }
  async end(room) {
    if (room.phase !== 'play') return;
    const ratio = (p) => room.hp[p.id] / CHARS[p.ch].hp;
    let win;
    if (MODES[room.mode].teams) {
      const score = (t) => room.roster.filter((p) => p.team === t).reduce((s, p) => s + ratio(p), 0);
      const best = score(1) >= score(2) ? 1 : 2;
      win = room.roster.filter((p) => p.team === best).map((p) => p.id);
    } else win = [[...room.roster].sort((a, b) => ratio(b) - ratio(a))[0].id];
    const ranked = new Set(room.roster.map((p) => p.ip)).size >= 2; // same network => nothing counts (no alt farming)
    // finish order: winners first, then by HP left. Guests play, but only player cards have a rating.
    const members = room.roster.filter((p) => p.pid).map((p) => ({ ...p, score: (win.includes(p.id) ? 2 : 0) + ratio(p) }));
    const deltas = ranked ? mmrDeltas(members) : {};
    const reports = ranked ? members.map((p) => ({ id: p.pid, won: win.includes(p.id), kos: room.stats[p.id].kos, delta: deltas[p.id] })) : [];
    const updated = reports.length ? await lb(this.env).fetch('https://lb/chresult', { method: 'POST', body: JSON.stringify(reports) }).then((r) => r.json()).catch(() => ({})) : {};
    room.phase = 'lobby';
    await this.save();
    const after = Object.fromEntries(room.roster.filter((p) => updated[p.pid]).map((p) => [p.id, { ...updated[p.pid], delta: deltas[p.id] }]));
    for (const w of this.ctx.getWebSockets()) { const a = w.deserializeAttachment(); if (after[a?.id]) w.serializeAttachment({ ...a, mmr: after[a.id].mmr, games: after[a.id].games }); }
    this.send({ t: 'end', win, ranked, hp: room.hp, stats: room.stats, after });
    await this.lobby();
  }
  async onAlarm() {
    const room = await this.room();
    if (room.phase === 'play' && Date.now() >= room.at + MATCH_MS) return this.end(room);
  }
  async onClose(ws) {
    const me = ws.deserializeAttachment();
    const room = await this.room();
    if (me?.name) this.send({ t: 'left', id: me.id }, ws);
    const left = this.players(ws);
    if (!left.length) {
      if (room.code) await this.hub({ code: room.code, close: true });
      this.r = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (room.phase === 'lobby') return this.lobby(ws);
    if (room.phase === 'play' && room.hp?.[me?.id] > 0) { // leaving = KO (rage-quitting still loses)
      room.hp[me.id] = 0;
      this.send({ t: 'ko', id: me.id, by: null });
      if (this.decided(room)) return this.end(room);
      await this.save();
    }
  }
}
