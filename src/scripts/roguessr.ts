// RoGuessr client: solo presets, custom mixes, friend rooms, quick match and ranked.
import { TYPES, ALL, ROUND_OPTS, TIME_OPTS, makeRounds, cleanConfig, points, fiftyFifty, tierOf } from '../lib/rounds.js';
import { avatarCard, avatarSVG, ITEMS, isUnlocked, RARITY } from '../lib/avatar.js';
import { loadProfile, profileCard, tierHTML, mountGoogle, type Profile } from './profile.ts';
import { GOOGLE_CLIENT_ID } from '../lib/config.js';

type Cfg = { types: string[]; rounds: number; time: number };
type P = { id: string; name: string; avatar: any; score: number; round: number; log: boolean[]; done: boolean; elo?: number | null };

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('rg-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('rg-' + k, JSON.stringify(v)); } catch {} };
const day = Math.floor(Date.now() / 864e5);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// View Transitions API for screen/round changes (falls back to an instant swap).
// The update callback runs asynchronously, so callers await it before reading the new DOM.
const transition = async (fn: () => void) => {
  if ((document as any).startViewTransition && !reduced) await (document as any).startViewTransition(fn).updateCallbackDone;
  else fn();
};
const show = (...ids: string[]) => transition(() => ['menu', 'ranked', 'lobby', 'game', 'over'].forEach((x) => ($(x).hidden = !ids.includes(x))));

const PRESETS: Record<string, Cfg> = {
  classic: { types: ['shot'], rounds: 5, time: 20 },
  daily: { types: ALL, rounds: 5, time: 20 },
  endless: { types: ALL, rounds: 5, time: 15 },
};
const ZOOM = [3.2, 2.2, 1.45, 1];
const PIXELS = [7, 12, 22, 256];

let profile: Profile | null = null;
let pool: any[] = [];
let mode = 'classic';
let cfg: Cfg = PRESETS.classic;
let seed: string | null = null;
let rounds: any[] = [];
let round: any;
let n = 0, score = 0, lives = 3, streak = 0, level = 0, left = 0, timer = 0, t0 = 0;
let seen: any[] = [], log: boolean[] = [];
let ws: WebSocket | null = null, vs: any = null, playedSeed = '', roster = new Map<string, P>();
let bot: P | null = null, botTimer = 0;
let before: Profile | null = null;
const challenge = params.get('c') ? { seed: params.get('c')!, score: +(params.get('s') || 0), cfg: cleanConfig({ types: (params.get('m') || 'shot').split(','), rounds: +(params.get('r') || 5), time: +(params.get('t') || 20) }) } : null;

const loadPool = async () => { if (!pool.length) pool = await fetch('/guessr.json').then((r) => r.json()); };
const send = (msg: object) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

// ---------- Menu ----------
async function refreshProfile(create = false) {
  profile = await loadProfile(create);
  $('profile').innerHTML = profileCard(profile);
  // Nudge players to save their progress with Google so it follows them to any device.
  const g = document.getElementById('gsave');
  if (g) mountGoogle(g, GOOGLE_CLIENT_ID, (p) => { profile = p; $('profile').innerHTML = profileCard(p); });
  return profile;
}
// Mode/rounds/timer picker, used for custom games ("cfg") and ranked challenges ("rcfg").
const DEFAULT_CFG: Record<string, Cfg> = { cfg: { types: ['shot', 'trivia', 'higher'], rounds: 7, time: 20 }, rcfg: { types: ALL, rounds: 7, time: 20 } };
const cfgOf = (p: string): Cfg => cleanConfig(read(p) ?? DEFAULT_CFG[p]);
const customCfg = () => cfgOf('cfg');
function renderCfg(p: string) {
  const c = cfgOf(p);
  $(`${p}-types`).innerHTML = ALL.map((t) => `<button type="button" class="rg-chip ${c.types.includes(t) ? 'on' : ''}" data-t="${t}">${TYPES[t].emoji} ${TYPES[t].name}</button>`).join('');
  $(`${p}-rounds`).innerHTML = ROUND_OPTS.map((r) => `<button type="button" class="${r === c.rounds ? 'on' : ''}" data-r="${r}">${r}</button>`).join('');
  $(`${p}-time`).innerHTML = TIME_OPTS.map((t) => `<button type="button" class="${t === c.time ? 'on' : ''}" data-s="${t}">${t}s</button>`).join('');
}
for (const p of ['cfg', 'rcfg']) {
  $(`${p}-types`).onclick = (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
    if (!t) return;
    const c = cfgOf(p);
    const types = c.types.includes(t) ? c.types.filter((x) => x !== t) : [...c.types, t];
    if (!types.length) return; // at least one mode
    write(p, { ...c, types });
    renderCfg(p);
  };
  $(`${p}-rounds`).onclick = (e) => { const r = (e.target as HTMLElement).dataset.r; if (r) { write(p, { ...cfgOf(p), rounds: +r }); renderCfg(p); } };
  $(`${p}-time`).onclick = (e) => { const v = (e.target as HTMLElement).dataset.s; if (v) { write(p, { ...cfgOf(p), time: +v }); renderCfg(p); } };
}
const cfgChips = (c: Cfg) => c.types.map((t) => `<span class="rg-chip on">${TYPES[t].emoji} ${TYPES[t].name}</span>`).join('') + `<span class="rg-chip">${c.rounds} rounds · ${c.time}s</span>`;

function showBests() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-best]')) {
    const m = el.dataset.best!;
    const b = read(m === 'daily' ? `daily-${day}` : `best-${m}`);
    el.textContent = b == null ? '' : m === 'daily' ? `✅ Today: ${b.toLocaleString('en')} pts` : `🏆 Best: ${b.toLocaleString('en')}${m === 'endless' ? ' in a row' : ' pts'}`;
  }
}

// ---------- Solo & match flow ----------
async function start(m: string, c: Cfg, s: string | null, startAt = Date.now() + 3000) {
  await loadPool();
  mode = m; cfg = c;
  seed = s ?? (m === 'endless' ? null : Math.random().toString(36).slice(2, 10));
  rounds = makeRounds(pool, seed, cfg, m === 'endless' ? 300 : cfg.rounds);
  n = 0; score = 0; lives = 3; streak = 0; seen = []; log = [];
  $('score').textContent = '0';
  $('challenge').hidden = true;
  await show('game');
  $('game').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderRivals();
  preload(rounds[0]);
  await countdown(startAt);
  next();
}

function countdown(until: number) {
  const box = $('count');
  box.hidden = false;
  return new Promise<void>((done) => {
    let last = '';
    const tick = () => {
      const ms = until - Date.now();
      const label = ms > 0 ? String(Math.min(3, Math.ceil(ms / 1000))) : 'GO!';
      if (label !== last) { box.innerHTML = `<span>${label}</span>`; last = label; }
      if (ms > -500) setTimeout(tick, 100); else { box.hidden = true; done(); }
    };
    tick();
  });
}

const preload = (r: any) => { if (r?.media?.shot) new Image().src = r.media.shot; if (r?.media?.icon) new Image().src = r.media.icon; };
const finished = () => (mode === 'endless' ? lives <= 0 : n >= cfg.rounds);

async function next() {
  round = rounds[n];
  n++;
  preload(rounds[n]);
  level = 0;
  left = cfg.time;
  const t = TYPES[round.type];
  $('round').textContent = mode === 'endless' ? `🔥 Streak ${streak}` : `Round ${n}/${cfg.rounds}`;
  $('lives').textContent = mode === 'endless' ? '❤️'.repeat(lives) + '🖤'.repeat(3 - lives) : '';
  $('after').hidden = true;
  $('q').textContent = round.q;
  $('secs').textContent = String(cfg.time);
  const hint = $('hint') as HTMLButtonElement;
  hint.hidden = !t.hints;
  hint.disabled = false;
  hint.textContent = `💡 ${t.hint} (max ${[3500, 2000, 1000][level].toLocaleString('en')})`;
  await transition(() => { renderMedia(round); renderOpts(round); });
  if (cfg.types.length > 1 || n === 1) await intro(round.type);
  await mediaReady();
  t0 = Date.now();
  if (mode === 'vs') send({ type: 'go', r: n });
  runTimer();
}

// Big animated banner announcing the round type.
function intro(type: string) {
  const el = $('intro');
  el.innerHTML = `<span>${TYPES[type].emoji}</span><b>${TYPES[type].name}</b>`;
  el.hidden = false;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  return new Promise<void>((r) => setTimeout(() => { el.hidden = true; r(); }, reduced ? 200 : 900));
}

let ready: Promise<void> = Promise.resolve();
const mediaReady = () => ready;
function renderMedia(r: any) {
  const box = $('media');
  box.className = `rg-media m-${r.type}`;
  const m = r.media;
  ready = Promise.resolve();
  if (r.type === 'shot') {
    box.innerHTML = `<div class="rg-pan"><img id="shot" alt="Mystery Roblox screenshot"></div>`;
    const img = $('shot') as HTMLImageElement;
    img.style.transformOrigin = `${m.fx}% ${m.fy}%`;
    img.style.transform = `scale(${ZOOM[0]})`;
    ready = new Promise((ok) => { img.onload = img.onerror = () => { img.classList.add('ready'); ok(); }; });
    img.src = m.shot;
  } else if (r.type === 'icon') {
    box.innerHTML = `<canvas id="pix" width="256" height="256" aria-label="Pixelated game icon"></canvas>`;
    const img = new Image();
    ready = new Promise((ok) => { img.onload = () => { pixel.img = img; drawPixels(); ok(); }; img.onerror = () => ok(); });
    img.src = m.icon;
  } else if (r.type === 'higher') {
    box.innerHTML = `<div class="duo">${m.duo.map((d: any, i: number) => `<button type="button" class="duo-card" data-k="${r.opts[i].k}" style="--d:${i}"><img src="${d.i}" alt=""><b>${esc(d.t)}</b><span class="val">?</span></button>`).join('<span class="vs">VS</span>')}</div>`;
    box.querySelectorAll<HTMLButtonElement>('.duo-card').forEach((b) => (b.onclick = () => answer(b.dataset.k!)));
  } else if (r.type === 'trivia') {
    box.innerHTML = `<div class="tcard"><img src="${m.card.i}" alt=""><b>${esc(m.card.t)}</b></div>`;
  } else if (r.type === 'code') {
    box.innerHTML = `<div class="ticket"><small>🎁 SECRET CODE</small><kbd>${esc(m.text)}</kbd><span>${esc(m.sub || '')}</span></div>`;
  } else {
    box.innerHTML = `<div class="medal"><span class="m">🏅</span><b>${esc(m.text.replace(/^🏅\s*/, ''))}</b></div>`;
  }
}
const pixel: { img: HTMLImageElement | null } = { img: null };
function drawPixels() {
  const c = document.getElementById('pix') as HTMLCanvasElement | null;
  if (!c || !pixel.img) return;
  const size = PIXELS[level];
  const small = document.createElement('canvas');
  small.width = small.height = size;
  small.getContext('2d')!.drawImage(pixel.img, 0, 0, size, size);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, size, size, 0, 0, 256, 256);
}

function renderOpts(r: any) {
  const box = $('opts');
  box.hidden = r.type === 'higher';
  box.innerHTML = '';
  if (r.type === 'higher') return;
  for (const o of r.opts) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.type = 'button';
    b.dataset.k = o.k;
    b.textContent = o.t;
    b.onclick = () => answer(o.k);
    box.append(b);
  }
}

$('hint').onclick = () => {
  const max = TYPES[round.type].hints;
  if (level >= max) return;
  level++;
  if (mode === 'vs') send({ type: 'hint' });
  if (round.type === 'shot') ($('shot') as HTMLElement).style.transform = `scale(${ZOOM[level]})`;
  else if (round.type === 'icon') drawPixels();
  else for (const k of fiftyFifty(round)) $('opts').querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`)?.classList.add('gone');
  ($('hint') as HTMLButtonElement).disabled = level >= max;
  $('hint').textContent = level >= max ? '💡 Hint used' : `💡 ${TYPES[round.type].hint} (max ${[3500, 2000, 1000][level].toLocaleString('en')})`;
};

function runTimer() {
  clearInterval(timer);
  const tick = () => {
    left = Math.max(0, cfg.time - (Date.now() - t0) / 1000);
    $('secs').textContent = String(Math.ceil(left));
    $('secs').classList.toggle('hurry', left <= 5);
    const ring = $('ring') as unknown as SVGCircleElement;
    ring.style.strokeDashoffset = String(100 - (left / cfg.time) * 100);
    ring.style.stroke = left > cfg.time / 2 ? 'var(--green)' : left > 5 ? 'var(--gold)' : 'var(--red)';
    if (!left) answer(null);
  };
  tick();
  timer = window.setInterval(tick, 100);
}

function answer(k: string | null) {
  if (!round || !$('after').hidden) return;
  clearInterval(timer);
  $('secs').classList.remove('hurry');
  const ok = k === round.a;
  const pts = ok ? points(level, Date.now() - t0, cfg.time) : 0;
  seen.push(round.game);
  log.push(ok);
  if (mode === 'vs') send({ type: 'ans', r: n, pick: k });
  // reveal
  for (const b of document.querySelectorAll<HTMLButtonElement>('#opts button, .duo-card')) {
    b.disabled = true;
    if (b.dataset.k === round.a) b.classList.add('right');
    else if (b.dataset.k === k) b.classList.add('wrong');
  }
  if (round.type === 'shot') ($('shot') as HTMLElement).style.transform = 'scale(1)';
  if (round.type === 'icon') { level = 3; drawPixels(); }
  if (round.type === 'higher') document.querySelectorAll<HTMLElement>('.duo-card .val').forEach((v, i) => (v.textContent = round.media.duo[i].val));
  ($('hint') as HTMLButtonElement).disabled = true;
  pop(ok ? `+${pts.toLocaleString('en')}` : k ? '❌' : "⏰ Time's up!", ok);
  countUp(score, score + pts);
  score += pts;
  if (mode === 'endless') { if (ok) streak++; else lives--; }
  if (ok && left > cfg.time - 4) confetti(40);
  $('verdict').textContent = ok ? (left > cfg.time - 4 ? '⚡ Lightning fast!' : '✅ Correct!') : `❌ ${round.info}`;
  $('info').textContent = ok ? round.info : '';
  const codes = $('codes') as HTMLAnchorElement;
  codes.href = `/codes/${round.game.s}/`;
  codes.textContent = `🎁 ${round.game.t} codes`;
  $('next').textContent = finished() ? 'See results 🏁' : 'Next →';
  $('after').hidden = false;
  renderRivals();
}
$('next').onclick = () => (finished() ? finish() : next());

function pop(text: string, good: boolean) {
  const el = $('pop');
  el.textContent = text;
  el.animate(
    [{ opacity: 0, transform: 'scale(.4) rotate(-8deg)' }, { opacity: 1, transform: 'scale(1.2) rotate(3deg)', offset: 0.25 }, { opacity: 1, transform: 'scale(1)', offset: 0.6 }, { opacity: 0, transform: 'translateY(-50px)' }],
    { duration: 1200, easing: 'ease-out' },
  );
  if (!good) $('stage').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 });
}
function countUp(from: number, to: number, el = $('score')) {
  const s = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - s) / 700);
    el.textContent = Math.round(from + (to - from) * p).toLocaleString('en');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const RANKS = ['🐣 Noob', '🙂 Casual', '🎮 Gamer', '🔥 Pro', '👑 Roblox Legend'];
function finish() {
  show('over');
  const value = mode === 'endless' ? streak : score;
  const max = cfg.rounds * 5000;
  const pct = mode === 'endless' ? Math.min(1, streak / 20) : score / max;
  $('over-mode').textContent = ({ classic: '🎯 Classic', endless: '♾️ Endless', daily: `📅 Daily #${day - 20722}`, custom: '🎛️ Custom', challenge: '⚔️ Friend challenge', vs: vs?.ranked ? '🏆 Ranked battle' : '⚔️ Battle' } as Record<string, string>)[mode];
  $('over-rank').textContent = RANKS[Math.min(4, Math.floor(pct * 5))];
  $('over-score').textContent = mode === 'endless' ? `${streak} in a row` : `${score.toLocaleString('en')} pts`;
  $('dare').hidden = mode === 'endless' || mode === 'vs';
  $('again').textContent = mode === 'vs' ? (vs?.ranked ? '🏆 Back to challenges' : vs?.quick ? '🔎 Find new match' : '🔄 Rematch') : '🔄 Play again';
  ($('again') as HTMLButtonElement).disabled = false;
  $('elo').hidden = true;
  $('unlocks').hidden = true;
  let note = '';
  if (mode === 'challenge' && challenge) {
    const d = score - challenge.score;
    note = d > 0 ? `🏆 You beat your friend by ${d.toLocaleString('en')} points!` : d < 0 ? `😤 Your friend wins by ${(-d).toLocaleString('en')}. Rematch?` : '🤝 A perfect tie!';
  } else if (mode !== 'vs' && mode !== 'custom') {
    const key = mode === 'daily' ? `daily-${day}` : `best-${mode}`;
    const best = read(key);
    if (mode === 'daily' ? best == null : value > (best ?? -1)) write(key, value);
    note = mode === 'daily' ? (best == null ? 'Come back tomorrow for a new challenge!' : `Your first try today: ${best.toLocaleString('en')} pts`) : value > (best ?? -1) ? '🎉 New personal best!' : `Your best: ${best.toLocaleString('en')}`;
  }
  $('over-best').textContent = note;
  $('seen').innerHTML = [...new Map(seen.map((g) => [g.s, g])).values()].map((g) => `<a href="/codes/${g.s}/">${esc(g.t)}</a>`).join('');
  if (mode === 'vs') { if (bot) finishBot(); renderPodium(); } else { $('podium').hidden = true; if (pct >= 0.5) confetti(160); }
  showBests();
}

// ---------- Live battles ----------
// Server results once the match ends (they don't know about the local bot, so add it back).
const everyone = (): P[] => {
  const base: P[] = vs?.results ? vs.results.map((r: P) => ({ ...r, done: true, round: cfg.rounds })) : [...roster.values()];
  return [...base, ...(bot ? [bot] : [])].sort((a, b) => b.score - a.score);
};
function renderRivals() {
  const box = $('rivals');
  if (mode !== 'vs') { box.innerHTML = ''; return; }
  const prev = new Map([...box.querySelectorAll<HTMLElement>('[data-id]')].map((el) => [el.dataset.id, el.dataset.score]));
  box.innerHTML = everyone().map((p) => {
    const me = p.id === vs?.you;
    return `<div class="rg-rival ${me ? 'me' : ''} ${prev.has(p.id) && prev.get(p.id) !== String(p.score) ? 'flash' : ''}" data-id="${p.id}" data-score="${p.score}">
      <span class="ra">${avatarSVG(p.avatar, 26)}</span><span class="nm">${esc(p.name)}${me ? ' (you)' : ''}</span>
      <div class="bar"><i style="width:${(p.score / (cfg.rounds * 5000)) * 100}%"></i></div>
      <span class="pts">${p.done ? '🏁 ' : `R${p.round}/${cfg.rounds} `}${p.score.toLocaleString('en')}</span></div>`;
  }).join('');
}

function renderPodium() {
  const box = $('podium');
  box.hidden = false;
  const list = everyone();
  const waiting = !vs?.results && list.some((p) => !p.done);
  const place = list.findIndex((p) => p.id === vs?.you) + 1;
  const sig = JSON.stringify(list.map((p) => [p.id, p.score]));
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = [list[1], list[0], list[2]].map((p, i) => (p ? `<div class="p${[2, 1, 3][i]}">${avatarCard(p.avatar, 54)}<b>${esc(p.name)}</b><span class="muted">${p.score.toLocaleString('en')}</span><div class="step">${[2, 1, 3][i]}</div></div>` : '')).join('');
  }
  $('over-rank').textContent = waiting ? '⏳ Waiting for the others…' : place === 1 ? '🏆 You won the battle!' : `You placed #${place}`;
  if (!waiting && place === 1 && !box.dataset.cheered) { box.dataset.cheered = '1'; confetti(220); }
  const host = vs?.host === vs?.you;
  ($('again') as HTMLButtonElement).disabled = !vs?.quick && !vs?.ranked && (!host || waiting);
  $('over-best').textContent = vs?.ranked && !vs?.live
    ? '🤖 No ranked rivals were online, so this was a practice match (rating unchanged). Try again in a moment!'
    : !vs?.quick && !vs?.ranked && !host ? 'Only the room host can start a rematch.' : '';
  if (vs?.results) afterMatch();
}

// Rating change + newly unlocked cosmetics, animated.
async function afterMatch() {
  if ($('elo').dataset.done === vs.seed) return;
  $('elo').dataset.done = vs.seed;
  const mine = vs.results.find((p: any) => p.id === vs.you);
  if (mine?.delta != null && mine.elo != null) {
    const from = mine.elo - mine.delta;
    const box = $('elo');
    box.hidden = false;
    const up = mine.delta >= 0;
    const t0 = tierOf(from), t1 = tierOf(mine.elo);
    box.innerHTML = `<div class="elo-num"><span id="elo-val">${from}</span> <b class="${up ? 'up' : 'down'}">${up ? '▲ +' : '▼ '}${mine.delta}</b></div>
      <div>${tierHTML(mine.elo)}</div>${t0.name !== t1.name ? `<div class="promo ${up ? '' : 'demo'}">${up ? `⬆️ PROMOTED TO ${t1.e} ${t1.name.toUpperCase()}!` : `⬇️ Dropped to ${t1.name}`}</div>` : ''}`;
    countUp(from, mine.elo, $('elo-val'));
    if (t0.name !== t1.name && up) confetti(260);
  }
  if (!before) return;
  const now = await refreshProfile();
  if (!now) return;
  const fresh = ITEMS.filter((i) => !isUnlocked(i, before!.stats, before!.rank) && isUnlocked(i, now.stats, now.rank));
  before = now;
  if (!fresh.length) return;
  const u = $('unlocks');
  u.hidden = false;
  u.innerHTML = `<h3>🎁 New cosmetics unlocked!</h3><div class="unl">${fresh.map((i, k) => `<a href="/avatar/?try=${i.id}" style="--k:${k}"><span class="rar rar-${i.r}">${RARITY[i.r as keyof typeof RARITY].name}</span><b>${esc(i.name)}</b></a>`).join('')}</div>`;
  confetti(120);
}

function startBot(startAt: number) {
  bot = { id: 'bot', name: 'RoboNoob (bot)', avatar: { skin: 0, face: 'face-grin', shirt: 'shirt-green', hair: 'hair-none', hat: 'hat-phones' }, score: 0, round: 0, log: [], done: false };
  let nextAt = startAt + 5000 + Math.random() * 9000;
  clearInterval(botTimer);
  botTimer = window.setInterval(() => {
    if (!bot || bot.done || Date.now() < nextAt) return;
    const ok = Math.random() < 0.65;
    bot.score += ok ? 1500 + Math.floor(Math.random() * 3000) : 0;
    bot.round++; bot.log.push(ok); bot.done = bot.round >= cfg.rounds;
    nextAt = Date.now() + 5000 + Math.random() * 9000;
    renderRivals();
  }, 500);
}
function finishBot() {
  while (bot && !bot.done) { bot.score += Math.random() < 0.65 ? 1500 + Math.floor(Math.random() * 3000) : 0; bot.round++; bot.done = bot.round >= cfg.rounds; }
  clearInterval(botTimer);
}

let pendingCfg: Cfg | null = null;
let clockOffset = 0; // server clock minus device clock
const baseTitle = document.title;
let searchT0 = 0, searchTimer = 0;
const stopSearch = () => { clearInterval(searchTimer); document.title = baseTitle; $('radar').hidden = true; };

async function joinRoom(code: string, opts: { quick?: boolean; ranked?: boolean; cfg?: Cfg; tries?: number } = {}) {
  ws?.close();
  await loadPool();
  profile ??= await refreshProfile(!!opts.ranked);
  before = profile;
  pendingCfg = opts.cfg ?? null;
  vs = null; bot = null; playedSeed = ''; roster = new Map();
  show('lobby');
  $('lobby-code').textContent = code;
  $('lobby-status').textContent = 'Connecting…';
  $('lobby-players').innerHTML = '';
  const q = new URLSearchParams();
  if (opts.quick) q.set('quick', '1');
  if (opts.ranked) q.set('ranked', '1');
  if (opts.ranked && opts.cfg) { q.set('types', opts.cfg.types.join(',')); q.set('rounds', String(opts.cfg.rounds)); q.set('time', String(opts.cfg.time)); }
  if (profile) { q.set('pid', profile.id); q.set('tok', profile.tok); }
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${code}?${q}`);
  ws = sock;
  sock.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'error') {
      // Matchmaking races (room filled or started as we arrived): quietly look for another one.
      if (opts.quick && /full|started/.test(msg.msg) && (opts.tries ?? 0) < 3) { queue((opts.tries ?? 0) + 1); return; }
      alert(msg.msg);
      opts.ranked ? openBoard() : leave();
      return;
    }
    if (msg.type === 'scored') { score = msg.total; $('score').textContent = score.toLocaleString('en'); return; }
    // Device clocks can be minutes off: convert server times to this device's clock.
    if (msg.now) clockOffset = msg.now - Date.now();
    vs = msg;
    onState();
  };
  sock.onclose = () => { if (ws === sock && !$('lobby').hidden) $('lobby-status').textContent = 'Disconnected. Try again!'; };
  history.replaceState(null, '', opts.quick ? location.pathname : `?room=${code}`);
  stopSearch();
  if (opts.ranked) {
    searchT0 = Date.now();
    searchTimer = window.setInterval(() => vs && !$('lobby').hidden && renderSearch(), 1000);
  }
}

// A posted ranked challenge waits as long as it takes for someone to accept it: radar + timer.
function renderSearch() {
  const alone = vs.players.length < 2;
  const t = Math.floor((Date.now() - searchT0) / 1000);
  $('radar').hidden = !alone;
  $('lobby-status').textContent = alone
    ? `⏳ Your challenge is on the board. Waiting for someone to accept… ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
    : '⚔️ Challenge accepted! Get ready…';
  document.title = alone ? baseTitle : '⚔️ Challenge accepted! · RoGuessr';
}

function onState() {
  if (vs.seed === playedSeed) for (const p of vs.players) roster.set(p.id, p);
  if (vs.phase === 'playing' && vs.seed !== playedSeed) {
    playedSeed = vs.seed;
    stopSearch();
    roster = new Map(vs.players.map((p: P) => [p.id, p]));
    bot = null;
    $('elo').dataset.done = '';
    const localStart = vs.startAt - clockOffset;
    if (vs.bot) startBot(localStart);
    start('vs', vs.cfg, vs.seed, localStart);
    return;
  }
  if (mode === 'vs' && playedSeed) {
    renderRivals();
    if (!$('over').hidden) renderPodium();
    return;
  }
  // lobby
  const host = vs.host === vs.you;
  $('lobby-players').innerHTML = vs.players.map((p: any) => `<div class="rg-player ${p.id === vs.you ? 'me' : ''}">${avatarCard(p.avatar, 58)}<b>${esc(p.name)}</b>${p.elo != null ? tierHTML(p.elo) : ''}${p.id === vs.host ? '<span class="small muted">👑 host</span>' : ''}</div>`).join('');
  ($('lobby-start') as HTMLButtonElement).hidden = !host || vs.quick || vs.ranked; // ranked starts only when accepted
  $('lobby-invite').hidden = vs.quick && !vs.ranked;
  $('lobby-reroll').hidden = !!vs.players.find((p: any) => p.id === vs.you)?.member;
  const c = pendingCfg ?? vs.cfg;
  $('lobby-cfg').innerHTML = (vs.ranked ? '<span class="rg-chip on">🏆 Ranked 1v1</span>' : '') + (c ? cfgChips(c) : '');
  if (vs.ranked) return renderSearch();
  $('lobby-status').textContent = vs.quick
    ? `🔎 Finding players… ${vs.players.length} joined. Battle starts in a few seconds!`
    : host ? (vs.players.length > 1 ? 'Everyone here? Press start!' : 'Invite friends with the code, or start solo vs a bot.') : '⏳ Waiting for the host to start…';
}

function leave() {
  stopSearch();
  ws?.close(); ws = null; vs = null; bot = null; mode = 'classic';
  clearInterval(botTimer); clearInterval(timer);
  history.replaceState(null, '', location.pathname);
  show('menu');
}

async function queue(tries = 0) {
  const r = await fetch('/api/quick').then((x) => x.json()).catch(() => null);
  r?.code ? joinRoom(r.code, { quick: true, tries }) : alert('Live battles are offline right now. Try a solo mode!');
}

// ---------- Ranked challenge board ----------
// Live list pushed by the server over WebSocket (no polling). Each card shows the creator, the modes
// they picked and what you win or lose - you decide whether to accept.
let boardWs: WebSocket | null = null;
let board: any[] = [];
const stakes = (mine: number, theirs: number) => {
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return { win: Math.round(40 * (1 - expected)), lose: Math.round(40 * expected) };
};
function renderBoard() {
  $('ranked-count').textContent = String(board.length);
  $('ranked-list').innerHTML = board.length
    ? board.map((c, k) => {
        const mine = c.host.id === profile?.id;
        const st = profile ? stakes(profile.elo, c.host.elo) : null;
        const mins = Math.max(0, Math.floor((Date.now() - c.at) / 60000));
        return `<div class="rk-card" style="animation-delay:${k * 0.05}s">
          ${avatarCard(c.host.avatar, 56)}
          <div class="grow"><b>${esc(c.host.name)}</b> ${tierHTML(c.host.elo)} <span class="small muted">⭐ ${c.host.elo} · ${mins ? `${mins} min ago` : 'just now'}</span>
            <div class="rg-chips" style="margin-top:6px">${cfgChips(c.cfg)}</div>
            ${st && !mine ? `<span class="small"><span class="up">Win +${st.win}</span> · <span class="down">Lose −${st.lose}</span></span>` : ''}
          </div>
          ${mine ? '<span class="pill">Your challenge</span>' : `<button type="button" class="btn play" data-accept="${c.code}">Accept ⚔️</button>`}
        </div>`;
      }).join('')
    : '<p class="muted" style="text-align:center">No open challenges right now. Post yours and it shows up here for everyone! 👆</p>';
}
async function openBoard() {
  ws?.close(); ws = null; vs = null;
  stopSearch();
  history.replaceState(null, '', location.pathname);
  show('ranked');
  renderCfg('rcfg');
  profile ??= await refreshProfile(true);
  boardWs?.close();
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ranked`);
  boardWs = sock;
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'board') { board = m.list; renderBoard(); } };
  sock.onclose = () => { if (boardWs === sock && !$('ranked').hidden) setTimeout(() => !$('ranked').hidden && openBoard(), 3000); };
}
const closeBoard = () => { const b = boardWs; boardWs = null; b?.close(); };
$('ranked-list').onclick = (e) => {
  const code = (e.target as HTMLElement).closest<HTMLElement>('[data-accept]')?.dataset.accept;
  if (code) { closeBoard(); joinRoom(code, { ranked: true }); }
};
$('ranked-create').onclick = () => {
  if (!profile) return alert('Could not create your player card. Try again!');
  closeBoard();
  joinRoom(code5(), { ranked: true, cfg: cfgOf('rcfg') });
};
$('ranked-back').onclick = () => { closeBoard(); show('menu'); };
const code5 = () => Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');

// ---------- Wiring ----------
$('play-ranked').onclick = openBoard;
$('play-quick').onclick = () => queue();
for (const b of document.querySelectorAll<HTMLElement>('[data-preset]')) b.onclick = () => start(b.dataset.preset!, PRESETS[b.dataset.preset!], b.dataset.preset === 'daily' ? `d${day}` : null);
$('custom-solo').onclick = () => start('custom', customCfg(), null);
$('custom-room').onclick = () => joinRoom(code5(), { cfg: customCfg() });
$('join').onsubmit = (e) => { e.preventDefault(); const c = ($('join-code') as HTMLInputElement).value.trim().toUpperCase(); if (/^[A-Z0-9]{5}$/.test(c)) joinRoom(c); };
$('lobby-start').onclick = () => send({ type: 'start', cfg: pendingCfg ?? vs?.cfg ?? PRESETS.classic });
$('lobby-reroll').onclick = () => send({ type: 'reroll' });
$('lobby-leave').onclick = () => (vs?.ranked ? openBoard() : leave());
$('lobby-invite').onclick = () => shareText(`⚔️ Battle me in RoGuessr! Room ${$('lobby-code').textContent}\n${location.origin}/guessr/?room=${$('lobby-code').textContent}`, $('lobby-invite'));
$('again').onclick = () => {
  if (mode !== 'vs') return start(mode, cfg, mode === 'challenge' || mode === 'daily' ? seed : null);
  if (vs?.ranked) return openBoard();
  if (vs?.quick) return queue();
  send({ type: 'start', cfg });
};
$('back').onclick = leave;
$('ch-go').onclick = () => challenge && start('challenge', challenge.cfg, challenge.seed);

async function shareText(text: string, btn: HTMLElement) {
  try { navigator.share ? await navigator.share({ text }) : await navigator.clipboard.writeText(text); btn.textContent = '✅ Copied!'; } catch {}
}
$('share').onclick = () => {
  const head = mode === 'endless' ? `♾️ ${streak} in a row` : `${score.toLocaleString('en')}/${(cfg.rounds * 5000).toLocaleString('en')}`;
  shareText(`🕵️ RoGuessr ${mode === 'daily' ? `Daily #${day - 20722}` : mode} - ${head}\n${log.map((ok) => (ok ? '🟩' : '🟥')).join('')}\nCan you beat me? ${location.origin}/guessr/`, $('share'));
};
$('dare').onclick = () => shareText(`⚔️ I scored ${score.toLocaleString('en')} in RoGuessr - can you beat me?\n${location.origin}/guessr/?c=${seed}&s=${score}&m=${cfg.types.join(',')}&r=${cfg.rounds}&t=${cfg.time}`, $('dare'));

// Tiny confetti burst (no library).
function confetti(count: number) {
  if (reduced) return;
  const c = $('confetti') as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#6d7ff0', '#ff5fa2', '#3ecf8e', '#ffcc33', '#3cc8ff', '#ff8a3d'];
  const bits = Array.from({ length: count }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6 }));
  const s = performance.now();
  const frame = (t: number) => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) { b.vy += 0.45; b.x += b.vx; b.y += b.vy; b.a += 0.2; ctx.fillStyle = b.c; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore(); }
    if (t - s < 2500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
  };
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
renderCfg('cfg');
renderCfg('rcfg');
showBests();
refreshProfile();
if (challenge) { $('ch-score').textContent = `${challenge.score.toLocaleString('en')} points`; $('challenge').hidden = false; }
const roomParam = params.get('room')?.toUpperCase();
if (roomParam && /^[A-Z0-9]{5}$/.test(roomParam)) joinRoom(roomParam);
