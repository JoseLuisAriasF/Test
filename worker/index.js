// RoGuessr backend. Only /api/* reaches this Worker; the rest of the site is static assets (free, unlimited).
//   Room        - one Durable Object per match (WebSocket hibernation). Scores every answer itself.
//   Matchmaker  - hands out open rooms for quick match / ranked queues.
//   Leaderboard - SQLite profiles: rating, stats (unlock cosmetics), avatar, optional Google link.
// Players never type text: names are generated, so there is no chat to moderate.
import { DurableObject } from 'cloudflare:workers';
import { makeRounds, cleanConfig, points, eloDeltas, TYPES } from '../src/lib/rounds.js';
import { sanitize, DEFAULT, SKINS } from '../src/lib/avatar.js';
import { verifyGoogleToken, googleKeys, hashId } from './google.js';
import { GOOGLE_CLIENT_ID } from '../src/lib/config.js';

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
    if (path === '/api/top') {
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
    return { id: r.id, name: r.name, avatar: sanitize(JSON.parse(r.av || 'null'), stats, rank), elo: r.elo, rank, ranked: r.ranked, google: !!r.gid, stats };
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
    // internal (only reachable from Room, never routed from the public Worker)
    if (path === '/verify') {
      const r = this.auth(body);
      return r ? Response.json(this.view(r)) : Response.json(null, { status: 404 });
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
