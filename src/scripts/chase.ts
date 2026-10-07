// Blox Chase: Grand Chase-style PvP with Roblox-style fighters. Rooms like the classic: create one (1v1, 2v2, 3v3,
// free for all), friends join, everyone picks a fighter, the host starts. Your own fighter runs locally at 60 Hz
// (zero input lag); the others are drawn ~90 ms in the past, interpolated between their reports, so they move smoothly.
// Hits are claimed here and confirmed by the server, which owns the HP (worker/index.js, class Chase).
import { CHARS, CHAR_IDS, MAPS, MODES, KEY, TICK, MATCH_MS, MP_MAX, TIERS, STAT_NAMES, newFighter, step, activeHits, stepProj, projRect, hurtbox, overlap, isInv,
  applyHit, gainMp, landedHit, veilMul, damage, hitData, localHits, cpuInput, snap, unsnap, medalOf, medalSVG, blinkDist, chargeLevel, CALIBRATION, MMR_START } from '../lib/chase.js';
import { avatarSVG } from '../lib/avatar.js';
import { makeRenderer, Stage, touch } from './chase3d.ts';
import { loadProfile, saved, type Profile } from './profile.ts';
import { fullscreenButton, synth } from './gamekit.ts';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('bc-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('bc-' + k, JSON.stringify(v)); } catch {} };
const ICON: Record<string, string> = { daggers: '🗡️', claws: '🦅', nodachi: '⚡', greatsword: '⚔️', staff: '🥢', gauntlets: '🔥', spirit: '☯️', bow: '🏹', twinbow: '🎯', cannon: '💥', runesword: '🔷' };
const TEAM_COL = ['', '#ff4d5e', '#3c8cff'];
const SKILL_KEYS: [string, string][] = [['s1', 'A'], ['s2', 'S'], ['s3', 'D']];
const TECH: Record<string, string> = { rocket: 'Rocket', shadow: 'Shadow Step', mushidon: 'Mushidon', guan: 'Guan Step', vortex: 'Vortex Step' };
const SKILL_ICON: Record<string, string> = {
  'Phantom Cut': '🌑', 'Shadow Shuriken': '✴️', 'Void Execution': '💀', 'Chakram Storm': '🌀', 'Thunder Dive': '⚡', 'Storm Cyclone': '🌪️',
  'Rage Cleave': '🩸', 'Earth Sunder': '🌋', 'Blade of Eternity': '⚔️', 'Staff Vault': '🦘', 'Whirlwind Staff': '💫', 'Thousand Strikes': '👊',
  'Rising Dragon': '🐉', 'Burning Palm': '🔥', 'Inferno Barrage': '☄️', 'Spirit Wave': '🌊', 'Mirror Step': '🪞', 'Heaven Burst': '✨',
  'Multi Shot': '🏹', 'Arrow Rain': '🌧️', 'Storm Arrow': '💨', 'Twin Volley': '🎯', 'Gale Kick': '🦵', 'Hundred Arrows': '🎆',
  'Charged Bolt': '🔋', 'Scatter Blast': '💥', 'Arc Beam': '🔆', 'Rune Bolt': '🔷', 'Rune Barrier': '🛡️', 'Rune Judgment': '⚖️',
};
const DASH_ICON: Record<string, string> = { 'Phantom Blink': '👤', 'Flash Step': '⚡', 'Demon Step': '😈', 'Staff Glide': '🥢', 'Flame Burst': '🚀', 'Spirit Step': '👻', 'Elf Step': '🍃', 'Wind Step': '🌬️', 'Recoil Burst': '💢', 'Rune Step': '🔹' };
// A skill slot like the classic: square icon in the class colours, gold frame for the 3-bar super, MP pips under it.
function skillIcon(ch: string, k: string, size = 44) {
  const c = CHARS[ch], m = c.moves[k], lvl = m.mp / 100, id = `si${ch}${k}`;
  return `<svg class="si" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.glow}"/><stop offset=".55" stop-color="${c.col}"/><stop offset="1" stop-color="#0b0814"/></linearGradient></defs>`
    + `<rect x="2" y="2" width="44" height="44" rx="9" fill="url(#${id})" stroke="${lvl === 3 ? '#ffd23f' : '#d9defa'}" stroke-width="${lvl === 3 ? 3 : 1.5}"/><path d="M6 8q0-3 3-3h30q3 0 3 3v8q-18 6-36 0z" fill="rgba(255,255,255,.22)"/>`
    + `<text x="24" y="31" text-anchor="middle" font-size="21">${SKILL_ICON[m.cut] ?? '✦'}</text>${Array.from({ length: lvl }, (_, i) => `<rect x="${24 - lvl * 5 + i * 10 + 1}" y="39" width="8" height="4" rx="2" fill="#3cc8ff" stroke="#05121f"/>`).join('')}</svg>`;
}

// ---------- renderer ----------
const box = $('bc');
const canvas = $('bc-canvas') as HTMLCanvasElement;
const R = makeRenderer(canvas);
let stage = new Stage(R, read('map') ?? 0);
function resize() {
  const rc = canvas.getBoundingClientRect();
  R.setSize(rc.width, rc.height);
  stage.resize(rc.width, rc.height);
}
addEventListener('resize', resize);
fullscreenButton($('bc-fs'), box, () => requestAnimationFrame(resize));
function useMap(mi: number) {
  if (stage.mi === mi) return;
  stage.scene.traverse((o: any) => { o.geometry?.dispose?.(); });
  stage = new Stage(R, mi);
  resize();
}

// ---------- sound (a tiny synth, no files) ----------
const snd = synth('bc-mute');
const sfx = (k: string) => {
  if (k === 'swing') snd.noise(0.09, 0.05, 2600, 0, 1.2, 'highpass');
  else if (k === 'slash') snd.noise(0.12, 0.06, 1800, 0, 1, 'bandpass');
  else if (k === 'hit') { snd.noise(0.12, 0.16, 900); snd.note(160, 60, 0.12, 'square', 0.05); }
  else if (k === 'big') { snd.noise(0.3, 0.22, 500); snd.note(110, 40, 0.3, 'sawtooth', 0.07); }
  else if (k === 'burst') { snd.noise(0.35, 0.14, 700); snd.note(120, 500, 0.3, 'sawtooth', 0.05); }
  else if (k === 'rocket' || k === 'mushidon' || k === 'shadow' || k === 'guan') snd.noise(0.12, 0.07, k === 'shadow' ? 2200 : 1600, 0, 0.7, 'bandpass');
  else if (k === 'dash' || k === 'blink') snd.noise(0.16, 0.06, k === 'blink' ? 3200 : 1400, 0, 0.6, 'bandpass');
  else if (k === 'jump' || k === 'jump2') snd.note(k === 'jump' ? 300 : 420, 620, 0.1, 'triangle', 0.04);
  else if (k === 'skill') { snd.note(400, 900, 0.25, 'sawtooth', 0.04); snd.noise(0.25, 0.05, 2400); }
  else if (k === 'super') { [523, 659, 784].forEach((f, i) => snd.note(f, f * 1.5, 0.6, 'sawtooth', 0.035, i * 0.05)); snd.noise(0.6, 0.08, 1200); }
  else if (k === 'charge') snd.note(500, 900, 0.18, 'triangle', 0.05);
  else if (k === 'counter') { snd.note(900, 300, 0.25, 'square', 0.05); }
  else if (k === 'armor') snd.note(220, 200, 0.08, 'square', 0.05);
  else if (k === 'ko') { snd.note(200, 30, 0.9, 'sawtooth', 0.1); snd.noise(0.8, 0.2, 300); }
  else if (k === 'beep') snd.note(660, 660, 0.12, 'square', 0.05);
  else if (k === 'go') snd.note(880, 1760, 0.3, 'square', 0.06);
  else if (k === 'land' || k === 'thud') snd.noise(0.07, k === 'thud' ? 0.12 : 0.04, 300);
};
$('bc-mute').onclick = () => { $('bc-mute').textContent = snd.toggle() ? '🔇' : '🔊'; };
$('bc-mute').textContent = snd.muted ? '🔇' : '🔊';

// ---------- input: keyboard + touch ----------
// v = grab shortcut (the classic is ← + → + Z together, which also works)
// the classic layout: arrows move/jump/crouch, Z attacks (hold to charge MP), double tap to dash, A S D skills
const KEYMAP: Record<string, number> = { ArrowLeft: KEY.L, ArrowRight: KEY.R, ArrowUp: KEY.U, ArrowDown: KEY.D, ' ': KEY.J, z: KEY.A, c: KEY.X, a: KEY.S1, s: KEY.S2, d: KEY.S3, v: KEY.L | KEY.R | KEY.A };
let held = 0, touchBits = 0;
const playing = () => phase === 'fight' || phase === 'count';
addEventListener('keydown', (e) => {
  const b = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!b || !playing() || (e.target as HTMLElement)?.tagName === 'INPUT') return;
  e.preventDefault();
  held |= b;
});
addEventListener('keyup', (e) => { const b = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (b) held &= ~b; });
addEventListener('blur', () => { held = 0; touchBits = 0; });
for (const el of document.querySelectorAll<HTMLElement>('#bc-touch [data-k]')) {
  const b = el.dataset.k === 'G' ? KEY.L | KEY.R | KEY.A : KEY[el.dataset.k as keyof typeof KEY];
  const on = (e: PointerEvent) => { e.preventDefault(); touchBits |= b; el.classList.add('on'); el.setPointerCapture?.(e.pointerId); };
  const off = () => { touchBits &= ~b; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
}
const input = () => held | touchBits;

// ---------- state ----------
type Remote = { id: string; f: any; buf: { at: number; s: number[] }[]; dead: boolean; name: string; team: number };
type Info = { id: string; name: string; ch: string; team: number; avatar: any; maxHp: number; hp: number; ghost: number; el?: HTMLElement };
let phase: 'menu' | 'lobby' | 'count' | 'fight' | 'over' = 'menu';
let online = false;
let me: any = null; // my fighter (sim)
let foes: any[] = []; // local mode: CPU fighters (sim)
const remotes = new Map<string, Remote>();
let infos = new Map<string, Info>();
let projs: any[] = [];
let startAt = 0, matchMs = MATCH_MS;
let profile: Profile | null = null;
let myCh: string = CHARS[read('ch')] ? read('ch') : 'kael3';
let practice = { cpu: CHARS[read('cpu')] ? read('cpu') : 'ald3', map: read('map') ?? 0, lvl: read('lvl') ?? 3 };
const LEVELS = [['Free training (no opponent)', -1], ['Training Dummy', 0], ['CPU Easy', 0.55], ['CPU Normal', 1], ['CPU Hard', 1.6]] as const;
const lvlK = () => LEVELS[practice.lvl]?.[1] ?? 1;
const CAPS: [string, number][] = [['←', KEY.L], ['→', KEY.R], ['↑', KEY.U | KEY.J], ['↓', KEY.D], ['Z', KEY.A], ['C', KEY.X], ['A', KEY.S1], ['S', KEY.S2], ['D', KEY.S3]];
let combo = { n: 0, at: 0, dmg: 0 };
let myId = '';

// ---------- panels ----------
function show(id: string | null) {
  for (const p of document.querySelectorAll<HTMLElement>('.bc-panel')) p.hidden = p.id !== id;
  $('bc-hud').hidden = id !== null;
  box.classList.toggle('menu', id !== null);
}
function banner(big: string, small = '', ms = 1400, cls = '') {
  const b = $('bc-banner');
  b.innerHTML = `<b>${big}</b>${small ? `<span>${small}</span>` : ''}`;
  b.className = `bc-banner ${cls}`;
  void b.offsetWidth;
  b.classList.add('go');
  clearTimeout((b as any)._t);
  (b as any)._t = setTimeout(() => b.classList.remove('go'), ms);
}
function cutIn(f: any, name: string) {
  const c = $('bc-cut');
  c.innerHTML = `<i></i><i></i><b style="--c:${CHARS[f.ch].col}">${esc(name)}</b><small>${esc(CHARS[f.ch].name)}</small>`;
  c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
  clearTimeout((c as any)._t);
  (c as any)._t = setTimeout(() => c.classList.remove('go'), 950);
  stage.cut(f.x, f.y);
}
function number(x: number, y: number, text: string, cls = '') {
  const rc = canvas.getBoundingClientRect();
  const p = stage.toScreen(x, y, rc.width, rc.height);
  const el = document.createElement('span');
  el.className = `bc-num ${cls}`;
  el.textContent = text;
  el.style.left = `${p.x + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${p.y}px`;
  $('bc-nums').append(el);
  setTimeout(() => el.remove(), 900);
}
function comboHit(dmg: number) {
  const t = performance.now();
  combo = t - combo.at < 1300 ? { n: combo.n + 1, at: t, dmg: combo.dmg + dmg } : { n: 1, at: t, dmg };
  const el = $('bc-combo');
  if (combo.n >= 2) { el.innerHTML = `<b>${combo.n}</b><span>HIT COMBO</span><small>${combo.dmg} dmg</small>`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop', 'on'); }
}

// ---------- character select ----------
const statBars = (c: any) => STAT_NAMES.map((n, i) => `<div class="bc-stat"><span>${n}</span><i><u style="width:${c.stats[i] * 10}%;background:${c.col}"></u></i><b>${c.stats[i]}</b></div>`).join('');
// One card per hero; the jobs (classes) of that hero are tabs in the detail panel, like the classic.
const HEROES = [...new Set(CHAR_IDS.map((id) => CHARS[id].hero))];
const jobsOf = (hero: string) => CHAR_IDS.filter((id) => CHARS[id].hero === hero);
function renderGrid(sel: string, target: string, onPick: (id: string) => void) {
  const grid = $(target);
  grid.innerHTML = HEROES.map((h) => {
    const ids = jobsOf(h), shown = ids.includes(sel) ? sel : CHARS[read(`job-${h}`)]?.hero === h ? read(`job-${h}`) : ids[0], c = CHARS[shown];
    return `<button type="button" class="bc-fc${ids.includes(sel) ? ' on' : ''}" data-ch="${shown}" style="--c:${c.col};--g:${c.glow}"><span class="bc-ico">${ICON[c.weapon]}</span><b>${h}</b><small>${c.cls}</small><em>${ids.length} job${ids.length > 1 ? 's' : ''}</em></button>`;
  }).join('');
  for (const b of grid.querySelectorAll<HTMLElement>('[data-ch]')) b.onclick = () => onPick(b.dataset.ch!);
}
function renderDetail(id: string) {
  const c = CHARS[id];
  const jobs = jobsOf(c.hero);
  $('bc-detail').innerHTML = `<div class="bc-jobs">${jobs.map((j) => `<button type="button" data-job="${j}" class="${j === id ? 'on' : ''}" style="--c:${CHARS[j].col}"><small>${TIERS[CHARS[j].tier]}</small><b>${ICON[CHARS[j].weapon]} ${CHARS[j].cls}</b></button>`).join('')}</div><h3 style="--c:${c.col}">${ICON[c.weapon]} ${c.hero} <span>${c.cls}</span></h3><p class="bc-tier">${TIERS[c.tier]} · ${c.ranged ? 'Ranged' : 'Melee'} · ${c.hp} HP</p>
    <p class="bc-desc">${esc(c.desc)}</p><div class="bc-stats">${statBars(c)}</div>
    <ul class="bc-skills"><li class="dash"><span class="di">${DASH_ICON[c.dash.name] ?? '💨'}</span><b>${esc(c.dash.name)}</b><small>dash · <kbd>→</kbd><kbd>→</kbd></small></li>${SKILL_KEYS.map(([k, key]) => `<li>${skillIcon(id, k, 38)}<b>${esc(c.moves[k].cut)}</b><kbd>${key}</kbd></li>`).join('')}</ul>
    <p class="bc-tricks">${c.tricks.map((t: string) => `<span>⚡ ${esc(t)}</span>`).join('')}</p>`;
  for (const b of $('bc-detail').querySelectorAll<HTMLElement>('[data-job]')) b.onclick = () => pickMine(b.dataset.job!);
}
function pickMine(id: string) {
  myCh = id;
  write('ch', id);
  write(`job-${CHARS[id].hero}`, id);
  renderGrid(myCh, 'bc-grid', pickMine);
  renderDetail(id);
  showcase(id);
  if (online && ws?.readyState === 1) ws.send(JSON.stringify({ t: 'pick', ch: id }));
}

// ---------- menu showcase: the selected fighter shows off its moves behind the menus ----------
let show_f: any = null, showT = 0;
const SHOW = [[30, 0], [2, KEY.A], [6, 0], [2, KEY.A], [6, 0], [2, KEY.A], [6, 0], [2, KEY.A], [30, 0], [2, KEY.K], [24, 0], [2, KEY.S1], [60, 0], [2, KEY.U], [10, 0], [2, KEY.A], [50, 0], [2, KEY.S2], [80, 0], [2, KEY.S3], [110, 0]];
async function showcase(id: string) {
  for (const k of [...stage.fighters.keys()]) stage.removeFighter(k);
  projs = [];
  show_f = newFighter('show', id, (MAPS[stage.mi].x0 + MAPS[stage.mi].x1) / 2 - 6, 1);
  showT = 0;
  await stage.addFighter('show', id, profile?.avatar, true);
}
function showcaseTick() {
  if (!show_f) return;
  const total = SHOW.reduce((s, [n]) => s + n, 0);
  let t = showT++ % total, bits = 0;
  for (const [n, b] of SHOW) { if (t < n) { bits = b; break; } t -= n; }
  show_f.mp = MP_MAX;
  stage.zoom = { k: 1, x: show_f.x + 2, y: show_f.y, until: performance.now() + 200 }; // close-up
  const mid = (MAPS[stage.mi].x0 + MAPS[stage.mi].x1) / 2;
  if (show_f.st === 'idle' && Math.abs(show_f.x - mid) > 8) bits |= show_f.x > mid ? KEY.L : KEY.R;
  handle(show_f, step(show_f, bits, MAPS[stage.mi]), false);
  for (let i = projs.length - 1; i >= 0; i--) if (!stepProj(projs[i], MAPS[stage.mi])) projs.splice(i, 1);
}

// ---------- effects from sim events (shared by every mode) ----------
function handle(f: any, ev: any[], mine: boolean) {
  for (const e of ev) {
    if (e.proj) {
      e.proj.mi = f.mi;
      projs.push(e.proj);
      if (mine && online) ws?.send(JSON.stringify({ t: 'pr', mv: e.proj.mv, k: e.proj.k, x: e.proj.x, y: e.proj.y, vx: e.proj.vx, vy: e.proj.vy }));
      continue;
    }
    if (e === 'slash') for (const { rect, h } of activeHits(f)) if (h.a === f.t) stage.swing(rect, f.face, CHARS[f.ch].glow, CHARS[f.ch].moves[f.mv].anim);
    if (e === 'blink') stage.blink(f.x - f.face * blinkDist(f), f.x, f.y, CHARS[f.ch].glow);
    if (e === 'super' || e === 'skill') {
      const m = CHARS[f.ch].moves[f.mv];
      if (e === 'super' && phase !== 'menu') cutIn(f, m.cut);
      else if (phase !== 'menu') { const p = canvas.getBoundingClientRect(), s = stage.toScreen(f.x, f.y + 6.5, p.width, p.height); skillTag(s, m.cut, CHARS[f.ch].col); }
    }
    if (e === 'land' && f.vy < -0.5) stage.dust(f.x, f.y);
    if (e === 'burst') { stage.burst(f.x - f.face * 1.2, f.y + 2, '#ff8a2a', 26, 0.35); stage.shake = Math.max(stage.shake, 0.25); }
    if (TECH[e]) stage.dust(f.x, f.y);
    if (e === 'vortex') stage.burst(f.x, f.y + 2.5, CHARS[f.ch].glow, 18, 0.35);
    if (e === 'charge') { stage.burst(f.x, f.y + 2.5, CHARS[f.ch].glow, 24, 0.3); if (f === me) { const p = canvas.getBoundingClientRect(), s3 = stage.toScreen(f.x, f.y + 6, p.width, p.height); skillTag(s3, `MP ${chargeLevel(f)}`, '#3cc8ff'); } }
    // practice: name every movement tech as you do it, so you know you got the timing right
    const tech = e === 'dash' ? CHARS[f.ch].dash.name : e === 'rocket' && f.ill ? 'Illusion Step' : e === 'shadow' && f.ill ? 'Illusion Shadow' : TECH[e];
    if (tech && f === me && !online && phase === 'fight') { const p = canvas.getBoundingClientRect(), s2 = stage.toScreen(f.x, f.y + 6, p.width, p.height); skillTag(s2, tech, e === 'dash' ? CHARS[f.ch].col : '#ffd23f'); }
    if (phase !== 'menu' || e === 'super') sfx(e);
  }
}
function skillTag(p: { x: number; y: number }, name: string, col: string) {
  const el = document.createElement('span');
  el.className = 'bc-num skill';
  el.style.cssText = `left:${p.x}px;top:${p.y}px;--c:${col}`;
  el.textContent = name;
  $('bc-nums').append(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------- HUD ----------
function buildHud() {
  const list = [...infos.values()];
  $('bc-cards').innerHTML = list.map((p) => `<div class="bc-pc${p.id === myId ? ' me' : ''}" data-id="${p.id}" style="--c:${CHARS[p.ch].col};--t:${TEAM_COL[p.team] || CHARS[p.ch].col}">
    <span class="av">${avatarSVG(p.avatar, 40)}</span><b>${esc(p.name)}</b><small>${ICON[CHARS[p.ch].weapon]} ${CHARS[p.ch].cls}</small>
    <i class="hp"><u class="g"></u><u class="v"></u></i><i class="mp"><u></u><u></u><u></u></i></div>`).join('');
  for (const p of list) p.el = $('bc-cards').querySelector(`[data-id="${p.id}"]`) as HTMLElement;
  $('bc-skillbar').innerHTML = `<span><kbd>Z</kbd>Attack</span><span><kbd>←</kbd><kbd>→</kbd><kbd>Z</kbd> Grab</span><span><kbd>→</kbd><kbd>→</kbd>${DASH_ICON[CHARS[myCh].dash.name] ?? ''} ${esc(CHARS[myCh].dash.name)}</span><span><kbd>Z</kbd> hold: charge MP</span><span><kbd>C</kbd>Counter</span>${SKILL_KEYS.map(([k, key], i) => `<span class="slot" data-sk="${i}" title="${esc(CHARS[myCh].moves[k].cut)}">${skillIcon(myCh, k, 40)}<kbd>${key}</kbd></span>`).join('')}`;
  $('bc-inputs').hidden = online;
  $('bc-inputs').innerHTML = CAPS.map(([k]) => `<kbd>${k}</kbd>`).join('');
}
function updateHud() {
  for (const p of infos.values()) {
    if (!p.el) continue;
    const f = p.id === myId ? me : online ? remotes.get(p.id)?.f : foes.find((x) => x.id === p.id);
    p.ghost = Math.max(p.hp, p.ghost - p.maxHp * 0.006);
    (p.el.querySelector('.v') as HTMLElement).style.width = `${(p.hp / p.maxHp) * 100}%`;
    (p.el.querySelector('.g') as HTMLElement).style.width = `${(p.ghost / p.maxHp) * 100}%`;
    const mp = f?.mp ?? 0;
    const lv = f ? chargeLevel(f) : 0;
    p.el.querySelectorAll<HTMLElement>('.mp u').forEach((u, i) => { u.style.setProperty('--f', String(Math.max(0, Math.min(1, (mp - i * 100) / 100)))); u.classList.toggle('c', i < lv); });
    p.el.classList.toggle('dead', p.hp <= 0);
    p.el.classList.toggle('low', p.hp > 0 && p.hp / p.maxHp < 0.25);
  }
  if (me) document.querySelectorAll<HTMLElement>('#bc-skillbar [data-sk]').forEach((el) => el.classList.toggle('ready', me.mp >= (+el.dataset.sk! + 1) * 100));
  if (!online) { const b = input(); document.querySelectorAll('#bc-inputs kbd').forEach((k, i) => k.classList.toggle('on', !!(b & CAPS[i][1]))); }
  const left = Math.max(0, matchMs - (performance.now() - startAt));
  $('bc-timer').textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  $('bc-timer').classList.toggle('hurry', left < 20000);
  if (performance.now() - combo.at > 1300) $('bc-combo').classList.remove('on');
}

// ---------- local fight (practice vs CPU / training dummy) ----------
async function startLocal() {
  online = false;
  closeWs();
  useMap(practice.map);
  for (const k of [...stage.fighters.keys()]) stage.removeFighter(k);
  show_f = null;
  const map = MAPS[practice.map];
  myId = 'me';
  me = newFighter('me', myCh, map.spawns[0], 1, 1);
  const solo = lvlK() < 0;
  const cpu = newFighter('cpu', practice.cpu, map.spawns[1], -1, 2);
  foes = solo ? [] : [cpu];
  projs = [];
  infos = new Map([['me', { id: 'me', name: profile?.name ?? 'You', ch: myCh, team: 0, avatar: profile?.avatar, maxHp: me.hp, hp: me.hp, ghost: me.hp }]]);
  if (!solo) infos.set('cpu', { id: 'cpu', name: LEVELS[practice.lvl]?.[0] ?? 'CPU', ch: practice.cpu, team: 0, avatar: null, maxHp: cpu.hp, hp: cpu.hp, ghost: cpu.hp });
  await Promise.all([stage.addFighter('me', myCh, profile?.avatar, true), solo ? null : stage.addFighter('cpu', practice.cpu, { skin: 0, body: 'other', hair: 'hair-none', shirt: 'shirt-red' })]);
  matchMs = lvlK() <= 0 ? 3599000 : MATCH_MS;
  countdown(performance.now() + 3200);
}
function countdown(at: number) {
  startAt = at;
  phase = 'count';
  show(null);
  buildHud();
  box.classList.add('intro');
  let shown = 0;
  const tick = () => {
    if (phase !== 'count') return;
    const left = startAt - performance.now();
    if (left <= 0) { phase = 'fight'; box.classList.remove('intro'); banner('FIGHT!', '', 900, 'fight'); sfx('go'); return; }
    const k = Math.ceil(left / 1000);
    if (k <= 3 && k !== shown) { shown = k; banner(String(k), k === 3 ? MAPS[stage.mi].name : '', 800); sfx('beep'); }
    setTimeout(tick, 50);
  };
  tick();
}
function localTick() {
  const map = MAPS[stage.mi];
  const all = [me, ...foes];
  for (const f of all) {
    const bits = f === me ? input() : lvlK() <= 0 ? 0 : cpuInput(f, me, lvlK());
    handle(f, step(f, bits, map, all), f === me);
  }
  localHits(all, projs, map, (a: any, v: any, mv: string, k: number, h: any, dir: number) => {
    const dmg = damage(a.ch, v.ch, h, veilMul(a));
    v.hp = Math.max(0, v.hp - dmg);
    if (lvlK() === 0 && v.id === 'cpu') v.hp = Math.max(1, v.hp);
    landedHit(a, h);
    if (h.box && !CHARS[a.ch].moves[mv]?.mp) a.hs = Math.max(a.hs, 3); // hit-stop on basic hits only: multi-hit skills never slow down
    landed(a.id, v, h, dmg, dir);
    if (v.hp <= 0) ko(v.id);
    else if (applyHit(v, h, dir) === 'armor') sfx('armor');
  });
  // training dummy heals when you leave it alone
  if (lvlK() <= 0) { me.mp = MP_MAX; const d = foes[0]; if (d && d.st === 'idle' && performance.now() - combo.at > 2500) d.hp = Math.min(CHARS[d.ch].hp, d.hp + 20); } // training: infinite MP
  for (const f of all) infos.get(f.id)!.hp = f.hp;
  if (phase === 'fight' && (me.st === 'dead' || (foes.length && foes.every((f) => f.st === 'dead')) || performance.now() - startAt > matchMs)) endLocal();
}
function landed(by: string, v: any, h: any, dmg: number, dir: number) {
  const big = !!(h.launch || h.down || dmg >= 90);
  stage.hit(v.x + dir * -0.4, v.y + 2.8, CHARS[(by === myId ? me : online ? remotes.get(by)?.f : foes.find((f) => f.id === by))?.ch ?? v.ch]?.glow ?? '#fff', big);
  stage.flashFighter(v.id);
  number(v.x, v.y + 5.5, String(dmg), by === myId ? 'mine' : v.id === myId ? 'hurt' : '');
  sfx(big ? 'big' : 'hit');
  if (by === myId) comboHit(dmg);
}
function ko(id: string) {
  const f = id === myId ? me : online ? remotes.get(id)?.f : foes.find((x) => x.id === id);
  if (f) { f.st = 'dead'; f.hp = 0; f.vy = 0.5; f.vx = (f.face || 1) * -0.3; }
  if (online && remotes.get(id)) remotes.get(id)!.dead = true;
  const i = infos.get(id);
  if (i) i.hp = 0;
  banner('K.O.!', i ? `${esc(i.name)} is down` : '', 1600, 'ko');
  sfx('ko');
  stage.shake = 1.4;
}
function endLocal() {
  phase = 'over';
  const won = me.st !== 'dead' && (!foes.length || foes.every((f) => f.st === 'dead') || me.hp / CHARS[me.ch].hp >= foes[0].hp / CHARS[foes[0].ch].hp);
  if (won) { const best = read('wins') ?? {}; best[practice.cpu] = (best[practice.cpu] ?? 0) + 1; write('wins', best); }
  setTimeout(() => results(won ? 'VICTORY' : 'DEFEAT', won, [...infos.values()].map((p) => ({ ...p, line: `${p.hp} HP left` })), ''), 1400);
}
function results(title: string, won: boolean, rows: any[], extra: string) {
  phase = 'over';
  $('bc-res').innerHTML = `<h2 class="bc-big ${won ? 'win' : ''}">${title}</h2>${extra}`;
  $('bc-stand').innerHTML = rows.map((p, i) => `<li style="--k:${i};--c:${CHARS[p.ch].col}"><span class="av">${avatarSVG(p.avatar, 40)}</span><b>${esc(p.name)}<small>${ICON[CHARS[p.ch].weapon]} ${CHARS[p.ch].name}</small></b><em>${p.line}</em></li>`).join('');
  $('bc-again').textContent = online ? '🔄 Back to the room' : '🔄 Fight again';
  show('bc-over');
}

// ---------- online ----------
let ws: WebSocket | null = null, hubWs: WebSocket | null = null;
let room: any = null, roomList: any[] = [];
let newMode = 'duel', newMap = 0;
let lastSent = 0, lastSnap = '';
const wsUrl = (p: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${p}`;
function closeWs() { if (ws) { ws.onclose = null; ws.close(); ws = null; } }
async function openRooms() {
  online = true;
  show('bc-rooms');
  renderRooms();
  profile ??= await loadProfile(true);
  renderMenuProfile();
  if (hubWs && hubWs.readyState <= 1) return;
  hubWs = new WebSocket(wsUrl('/api/chase'));
  hubWs.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'rooms') { roomList = m.list; renderRooms(); } };
  hubWs.onclose = () => { hubWs = null; };
  hubWs.onerror = () => { $('bc-roomlist').innerHTML = '<li class="muted">⚠️ Online rooms are offline right now. Try Practice!</li>'; };
}
function renderRooms() {
  const list = $('bc-roomlist');
  list.innerHTML = roomList.length ? roomList.map((r) => `<li><span class="av">${avatarSVG(r.avatar, 40)}</span><div><b>${esc(r.host)}'s room</b><small>${MODES[r.mode]?.name ?? r.mode} · ${MAPS[r.map]?.name ?? ''} · ${(r.chs ?? []).map((c: string) => ICON[CHARS[c]?.weapon] ?? '').join('')}</small></div><span class="bc-count">${r.n}/${r.max}</span><button class="btn gold" type="button" data-join="${r.code}"${r.n >= r.max ? ' disabled' : ''}>Join</button></li>`).join('')
    : '<li class="muted">No open rooms yet. Create one and invite your friends! ⚔️</li>';
  for (const b of list.querySelectorAll<HTMLElement>('[data-join]')) b.onclick = () => connect(b.dataset.join!);
}
const newCode = () => Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');
function connect(code: string, mode = '', map = 0) {
  closeWs();
  online = true;
  const sock = new WebSocket(wsUrl(`/api/chase/${code}${mode ? `?mode=${mode}&map=${map}` : ''}`));
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', ...(saved() ?? {}), ch: myCh }));
  sock.onmessage = (e) => onNet(JSON.parse(e.data));
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (phase === 'fight' || phase === 'count') { banner('Disconnected', 'Connection lost', 2500); phase = 'over'; setTimeout(menu, 2500); }
    else if (phase === 'lobby') openRooms();
  };
  history.replaceState(null, '', `?room=${code}`);
}
function quickJoin() {
  const open = roomList.filter((r) => r.n < r.max);
  if (open.length) connect(open[0].code);
  else connect(newCode(), newMode, newMap);
}
async function onNet(m: any) {
  if (m.t === 'you') { myId = m.id; return; }
  if (m.t === 'full') { alert(m.msg); openRooms(); return; }
  if (m.t === 'note') { banner('⚠️', esc(m.msg), 2200); return; }
  if (m.t === 'lobby') {
    room = m;
    if (phase === 'menu') openLobby(); // the results screen stays up until "Back to the room"
    renderLobby();
    return;
  }
  if (m.t === 'start') return startOnline(m);
  if (m.t === 's') {
    const r = remotes.get(m.id);
    if (r) { r.buf.push({ at: performance.now(), s: m.s }); if (r.buf.length > 12) r.buf.shift(); }
    return;
  }
  if (m.t === 'pr') {
    const r = remotes.get(m.id), h = r && hitData(r.f.ch, m.mv, m.k);
    if (h) projs.push({ owner: m.id, team: r!.team, ch: r!.f.ch, mv: m.mv, k: m.k, kind: h.kind, x: m.x, y: m.y, vx: m.vx, vy: m.vy, life: h.life, w: h.size[0], h: h.size[1], pierce: h.pierce, grav: h.grav, hit: [], remote: true });
    return;
  }
  if (m.t === 'hit') {
    const i = infos.get(m.to);
    if (i) i.hp = m.hp;
    const att = m.by === myId ? me : remotes.get(m.by)?.f;
    const h = att && hitData(att.ch, m.mv, m.k);
    if (!h) return;
    const vic = m.to === myId ? me : remotes.get(m.to)?.f;
    if (m.to === myId) {
      me.hp = m.hp;
      if (m.hp > 0 && applyHit(me, h, m.dir) === 'armor') sfx('armor');
      stage.shake = Math.max(stage.shake, 0.5);
    }
    if (m.by === myId) { gainMp(me, h); comboHit(m.dmg); number(vic?.x ?? 0, (vic?.y ?? 0) + 5.5, String(m.dmg), 'mine'); return; } // spark already shown on contact
    if (vic) landed(m.by, vic, h, m.dmg, m.dir);
    return;
  }
  if (m.t === 'ko') return ko(m.id);
  if (m.t === 'left') {
    const r = remotes.get(m.id);
    if (r && (phase === 'fight' || phase === 'count')) { r.dead = true; r.f.st = 'dead'; }
    return;
  }
  if (m.t === 'end') {
    phase = 'over';
    const won = m.win.includes(myId);
    const rows = [...infos.values()].sort((a, b) => +m.win.includes(b.id) - +m.win.includes(a.id) || m.hp[b.id] / b.maxHp - m.hp[a.id] / a.maxHp).map((p) => {
      const st = m.stats[p.id] ?? { dmg: 0, kos: 0 }, a = m.after?.[p.id];
      return { ...p, line: `${m.win.includes(p.id) ? '🏆 ' : ''}${st.dmg} dmg · ${st.kos} KO${a ? ` · <span class="${a.delta >= 0 ? 'up' : 'down'}">${a.delta >= 0 ? '+' : ''}${a.delta} MMR</span>` : ''}` };
    });
    const mine = m.after?.[myId];
    let extra = '';
    if (mine && profile) {
      profile.ch = { ...(profile.ch ?? {}), mmr: mine.mmr, games: mine.games, wins: mine.wins } as any;
      const md = medalOf(mine.mmr, mine.games);
      extra = `<div class="bc-medal-res">${medalSVG(mine.mmr, mine.games, 72)}<div><b style="color:${md.c}">${md.name}${md.stars ? ` ${'★'.repeat(md.stars)}` : ''}</b><span>${md.calibrating ? `${md.left} calibration games left` : `${mine.mmr} MMR`} · <span class="${mine.delta >= 0 ? 'up' : 'down'}">${mine.delta >= 0 ? '+' : ''}${mine.delta}</span></span></div></div>`;
    } else if (!m.ranked) extra = '<p class="small muted">Not ranked: every player is on the same network.</p>';
    else if (!profile) extra = '<p class="small muted">Make a player card to earn MMR and medals.</p>';
    setTimeout(() => results(won ? 'VICTORY' : 'DEFEAT', won, rows, extra), 1500);
  }
}
function openLobby() {
  phase = 'lobby';
  show('bc-lobby');
  $('bc-lobby').classList.add('online');
  $('bc-lobby').classList.remove('local');
  useMap(room?.map ?? 0);
  pickMine(myCh);
}
function renderLobby() {
  if (!room) return;
  const host = room.host === myId;
  const mode = MODES[room.mode];
  $('bc-room-title').textContent = `${mode.name} · ${MAPS[room.map].name}`;
  ($('bc-link') as HTMLInputElement).value = `${location.origin}/chase/?room=${room.code}`;
  const slot = (p: any) => {
    const md = medalOf(p.mmr ?? MMR_START, p.games ?? 0);
    return `<li class="full${p.id === myId ? ' me' : ''}" style="--c:${CHARS[p.ch].col};--t:${TEAM_COL[p.team]}">${avatarSVG(p.avatar, 44)}<b>${esc(p.name)}${p.id === room.host ? ' 👑' : ''}</b><small>${ICON[CHARS[p.ch].weapon]} ${CHARS[p.ch].cls}</small><span class="md" title="${md.name}">${p.member ? medalSVG(p.mmr ?? MMR_START, p.games ?? 0, 26) : '<small>guest</small>'}</span></li>`;
  };
  const empty = (n: number) => Array.from({ length: Math.max(0, n) }, () => '<li><span class="empty">＋</span><small>Waiting…</small></li>').join('');
  if (mode.teams) {
    const side = (t: number) => room.players.filter((p: any) => p.team === t);
    $('bc-slots').innerHTML = [1, 2].map((t) => `<div class="bc-side t${t}"><h4>${t === 1 ? '🔴 Red' : '🔵 Blue'}</h4><ol class="bc-slots">${side(t).map(slot).join('')}${empty(mode.max / 2 - side(t).length)}</ol></div>`).join('');
  } else $('bc-slots').innerHTML = `<ol class="bc-slots">${room.players.map(slot).join('')}${empty(mode.max - room.players.length)}</ol>`;
  $('bc-team').hidden = !mode.teams;
  $('bc-hostcfg').hidden = !host;
  ($('bc-cfg-mode') as HTMLSelectElement).value = room.mode;
  ($('bc-cfg-map') as HTMLSelectElement).value = String(room.map);
  const ready = room.players.length >= 2 && (!mode.teams || new Set(room.players.map((p: any) => p.team)).size === 2);
  $('bc-start').hidden = !host;
  ($('bc-start') as HTMLButtonElement).disabled = !ready;
  $('bc-lobby-txt').textContent = host ? (ready ? 'Everyone in? Start the fight!' : 'Waiting for players… share the link!') : 'Pick your fighter. The host 👑 starts the fight.';
  if (stage.mi !== room.map) { useMap(room.map); showcase(myCh); }
}
async function startOnline(m: any) {
  useMap(m.map);
  for (const k of [...stage.fighters.keys()]) stage.removeFighter(k);
  show_f = null;
  remotes.clear();
  projs = [];
  infos = new Map();
  const mineR = m.roster.find((p: any) => p.id === myId);
  if (!mineR) return;
  for (const p of m.roster) {
    infos.set(p.id, { id: p.id, name: p.name, ch: p.ch, team: p.team, avatar: p.avatar, maxHp: CHARS[p.ch].hp, hp: p.hp, ghost: p.hp });
    const f = newFighter(p.id, p.ch, p.spawn, p.spawn < 0 ? 1 : -1, p.team);
    if (p.id === myId) me = f;
    else remotes.set(p.id, { id: p.id, f, buf: [], dead: false, name: p.name, team: p.team });
  }
  await Promise.all(m.roster.map((p: any) => stage.addFighter(p.id, p.ch, p.avatar, p.id === myId)));
  matchMs = MATCH_MS;
  countdown(performance.now() + (m.at - m.now));
}
// remote fighters are drawn 90 ms in the past, between the two reports around that moment
const DELAY = 90;
function remoteState(r: Remote, now: number) {
  if (r.dead) { r.f.st = 'dead'; return r.f; }
  const t = now - DELAY, b = r.buf;
  if (!b.length) return r.f;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].at > t) i--;
  const nb = b[i], pb = b[i - 1];
  unsnap(nb.s, r.f);
  if (pb && nb.at > t) {
    const k = Math.max(0, Math.min(1, (t - pb.at) / Math.max(1, nb.at - pb.at)));
    r.f.x = pb.s[0] + (nb.s[0] - pb.s[0]) * k;
    r.f.y = pb.s[1] + (nb.s[1] - pb.s[1]) * k;
  } else if (nb.at <= t) { // late report: extrapolate a little, then hold
    const dtk = Math.min(6, (t - nb.at) / TICK);
    r.f.x = nb.s[0] + nb.s[2] * dtk;
    r.f.y = Math.max(0, nb.s[1] + nb.s[3] * dtk);
    if (r.f.st === 'move' || r.f.st === 'dash') r.f.t = nb.s[7] + Math.floor(dtk);
  }
  return r.f;
}
function onlineTick(now: number) {
  const map = MAPS[stage.mi];
  const others = [...remotes.values()].map((r) => remoteState(r, now)).filter((f) => f.st !== 'dead');
  if (me.st !== 'dead') handle(me, step(me, phase === 'fight' ? input() : 0, map, [me, ...others]), true); // grabs see who you touch
  else step(me, 0, map);
  // my melee hits against what I see (attacker's view, like the original)
  if (me.st === 'move') {
    if (me.doneMi !== me.mi) { me.done = {}; me.doneMi = me.mi; }
    for (const { k, h, rect } of activeHits(me)) for (const v of others) {
      const tag = `${k}:${v.id}`;
      if (me.done[tag] || (v.team && v.team === me.team) || isInv(v) || !overlap(rect, hurtbox(v))) continue;
      me.done[tag] = 1;
      ws?.send(JSON.stringify({ t: 'hit', to: v.id, mv: me.mv, k, mi: me.mi }));
      stage.hit(v.x - (v.x > me.x ? 0.4 : -0.4), v.y + 2.8, CHARS[me.ch].glow, !!(h.launch || h.down));
      stage.flashFighter(v.id);
      sfx('hit');
      if (!CHARS[me.ch].moves[me.mv]?.mp) me.hs = Math.max(me.hs, 3);
      if (h.carry && me.sl > 0) me.sl--; // Lothus: a hook that lands gives the air slash back (MP comes with the server's confirmation)
    }
  }
  // projectiles: mine hit what I see; remote ones are only drawn (their owner reports the hits)
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (!stepProj(p, map)) { projs.splice(i, 1); continue; }
    const targets = p.remote ? [me, ...others].filter((f) => f.id !== p.owner && f.st !== 'dead') : others;
    for (const v of targets) {
      if ((v.team && v.team === p.team) || p.hit.includes(v.id) || isInv(v) || !overlap(projRect(p), hurtbox(v))) continue;
      p.hit.push(v.id);
      if (!p.remote) { ws?.send(JSON.stringify({ t: 'hit', to: v.id, mv: p.mv, k: p.k, mi: p.mi })); stage.hit(p.x, p.y, CHARS[p.ch].glow); sfx('hit'); }
      if (!p.pierce) { projs.splice(i, 1); break; }
    }
  }
  // my report: 20 per second, skipped while nothing changes
  const s = snap(me), key = s.join(',');
  if (ws?.readyState === 1 && now - lastSent > 48 && (key !== lastSnap || now - lastSent > 400)) { ws.send(JSON.stringify({ t: 's', s })); lastSent = now; lastSnap = key; }
}

// ---------- menus ----------
function renderMenuProfile() {
  const el = $('bc-me');
  if (!profile) { el.innerHTML = '<span class="small muted">Playing as a guest · <a href="/avatar/">make a player card</a> to earn medals</span>'; return; }
  const c = (profile as any).ch ?? { mmr: MMR_START, games: 0, wins: 0 };
  const md = medalOf(c.mmr, c.games);
  el.innerHTML = `${medalSVG(c.mmr, c.games, 54)}<div><b>${esc(profile.name)}</b><span style="color:${md.c}">${md.name}${md.stars ? ` ${'★'.repeat(md.stars)}` : ''}</span><small>${md.calibrating ? `${md.left} calibration games left` : `${c.mmr} MMR`} · 🏆 ${c.wins} wins · ${c.games} fights</small></div>`;
}
function menu() {
  phase = 'menu';
  online = false;
  closeWs();
  me = null; foes = []; remotes.clear(); projs = [];
  show('bc-menu');
  history.replaceState(null, '', location.pathname);
  showcase(myCh);
  renderMenuProfile();
}
function openPractice() {
  online = false;
  closeWs();
  phase = 'lobby';
  show('bc-lobby');
  $('bc-lobby').classList.add('local');
  $('bc-lobby').classList.remove('online');
  useMap(practice.map);
  ($('bc-p-map') as HTMLSelectElement).value = String(practice.map);
  ($('bc-p-cpu') as HTMLSelectElement).value = practice.cpu;
  ($('bc-p-lvl') as HTMLSelectElement).value = String(practice.lvl);
  pickMine(myCh);
}
const opts = (list: [string, string][]) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('bc-p-map').innerHTML = $('bc-cfg-map').innerHTML = $('bc-new-map').innerHTML = opts(MAPS.map((m, i) => [String(i), m.name]));
$('bc-cfg-mode').innerHTML = $('bc-new-mode').innerHTML = opts(Object.entries(MODES).map(([k, m]) => [k, `${m.name} (${m.max} players)`]));
$('bc-p-cpu').innerHTML = opts(CHAR_IDS.map((id) => [id, CHARS[id].name]));
$('bc-p-lvl').innerHTML = opts(LEVELS.map(([n], i) => [String(i), n]));
$('bc-p-map').onchange = (e) => { practice.map = +(e.target as HTMLSelectElement).value; write('map', practice.map); useMap(practice.map); showcase(myCh); };
$('bc-p-cpu').onchange = (e) => { practice.cpu = (e.target as HTMLSelectElement).value; write('cpu', practice.cpu); };
$('bc-p-lvl').onchange = (e) => { practice.lvl = +(e.target as HTMLSelectElement).value; write('lvl', practice.lvl); };
$('bc-new-mode').onchange = (e) => { newMode = (e.target as HTMLSelectElement).value; };
$('bc-new-map').onchange = (e) => { newMap = +(e.target as HTMLSelectElement).value; };
$('bc-cfg-mode').onchange = (e) => ws?.send(JSON.stringify({ t: 'cfg', mode: (e.target as HTMLSelectElement).value, map: room?.map }));
$('bc-cfg-map').onchange = (e) => ws?.send(JSON.stringify({ t: 'cfg', mode: room?.mode, map: +(e.target as HTMLSelectElement).value }));
$('bc-go-online').onclick = openRooms;
$('bc-go-practice').onclick = openPractice;
$('bc-create').onclick = () => connect(newCode(), newMode, newMap);
$('bc-quick').onclick = quickJoin;
$('bc-rooms-back').onclick = menu;
$('bc-fight').onclick = startLocal;
$('bc-start').onclick = () => ws?.send(JSON.stringify({ t: 'start' }));
$('bc-team').onclick = () => ws?.send(JSON.stringify({ t: 'team' }));
$('bc-copy').onclick = () => { navigator.clipboard?.writeText(($('bc-link') as HTMLInputElement).value); $('bc-copy').textContent = '✅ Copied!'; setTimeout(() => ($('bc-copy').textContent = '📤 Copy link'), 1500); };
$('bc-lobby-back').onclick = () => (online ? openRooms() : menu());
$('bc-again').onclick = () => (online ? (room ? (openLobby(), renderLobby()) : openRooms()) : startLocal());
$('bc-back').onclick = menu;
$('bc-leave').onclick = () => { if (confirm('Leave the fight?')) menu(); };

// ---------- frame loop: fixed 60 Hz simulation, render every frame ----------
let last = performance.now(), acc = 0, slow = 0;
function render(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * 1000;
  let ticks = 0;
  while (acc >= TICK && ticks < 5) {
    acc -= TICK; ticks++;
    if (phase === 'menu' || phase === 'lobby') showcaseTick();
    else if (me && (phase === 'fight' || phase === 'count' || phase === 'over')) {
      if (online) onlineTick(now);
      else if (phase !== 'count') localTick();
    }
  }
  if (ticks === 5) acc = 0;
  const fs = phase === 'menu' || phase === 'lobby' ? (show_f ? [show_f] : []) : me ? [me, ...(online ? [...remotes.values()].map((r) => remoteState(r, now)) : foes)] : [];
  stage.update(dt, fs, projs);
  if (me && phase !== 'menu' && phase !== 'lobby') updateHud();
  R.draw(stage);
  // adaptive quality: drop bloom + shadows if this device can't keep up
  slow = dt > 0.026 ? slow + dt : Math.max(0, slow - dt * 0.5);
  if (slow > 2.5 && R.bloom) { R.dropBloom(); resize(); }
}
function frame(now: number) { render(now); requestAnimationFrame(frame); }
resize();
(async () => {
  profile = await loadProfile(false);
  menu();
  requestAnimationFrame(frame);
  const code = new URLSearchParams(location.search).get('room');
  if (code && /^[A-Z0-9]{5}$/.test(code)) { profile ??= await loadProfile(true); renderMenuProfile(); connect(code); }
})();

// ---------- ranking ----------
(async () => {
  const el = $('bc-rank');
  const data = await fetch('/api/chase/top').then((r) => r.json()).catch(() => null);
  const top = data?.top ?? [];
  if (!top.length) { el.innerHTML = `<p class="muted center">No ranked fighters yet. Play ${CALIBRATION} online fights to get your medal and be the first #1! 👑</p>`; return; }
  el.innerHTML = top.map((p: any, i: number) => {
    const md = medalOf(p.mmr, p.games);
    return `<div class="bc-rrow neu" style="animation-delay:${Math.min(i, 20) * 0.03}s"><span class="pos">#${i + 1}</span>${medalSVG(p.mmr, p.games, 44)}<span class="av">${avatarSVG(p.avatar, 40)}</span>
      <span class="nm"><b>${esc(p.name)}</b><small style="color:${md.c}">${md.name}${md.stars ? ` ${'★'.repeat(md.stars)}` : ''}</small></span>
      <span class="st"><b>${p.mmr}</b><small>MMR</small></span><span class="st"><b>${p.wins}</b><small>wins · ${Math.round((p.wins / Math.max(1, p.games)) * 100)}%</small></span><span class="st hide-s"><b>${p.kos}</b><small>KOs</small></span></div>`;
  }).join('');
})();
if (import.meta.env.DEV) (window as any).bc = { get me() { return me; }, get foes() { return foes; }, get phase() { return phase; }, get stage() { return stage; }, input, run(ms: number, bits = 0) { touchBits = bits; const t0 = last; for (let t = 16.7; t <= ms; t += 16.7) render(t0 + t); last = performance.now(); touchBits = 0; } };
