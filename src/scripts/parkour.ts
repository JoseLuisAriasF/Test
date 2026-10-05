// Infinite Parkour: an endless, seeded Roblox-style obby with your own avatar.
// Kid-friendly feel: coyote time, jump buffering, forgiving edges, one-way platforms, helper blocks after
// repeated falls. Falling plays a slow-motion movie shot, and a (rare) guardian angel may fly you back.
// Modes: weekly ranked run, endless, and online races between two PCs (ranked from the queue, casual with a friend
// link) shown N64-style: your view on top, your rival's live view on the bottom.
import * as THREE from 'three';
import {
  makeCourse, platPos, onTop, local, themeOf, themeIndex, stageOf, weekOf, THEMES,
  GRAVITY, JUMP, SPEED, BOUNCE, CP_EVERY, RACE_GOAL, angelChance, LAVA_HALF,
} from '../lib/parkour.js';
import { avatarSVG } from '../lib/avatar.js';
import { buildAvatar, animateRig, type Rig } from './avatar3d.ts';
import { holy, makeAngel, makePillar } from './angel.ts';
import { loadProfile, saved, type Profile } from './profile.ts';

const $ = (id: string) => document.getElementById(id)!;
const COYOTE = 0.15; // s you can still jump after running off an edge
const BUFFER = 0.15; // s a jump press is remembered before landing
const PAD = 0.55; // edge forgiveness (studs)
const FALL_SLOWMO = 1.5; // real seconds of slow motion when falling
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('pk-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('pk-' + k, JSON.stringify(v)); } catch {} };
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const fmtTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// ---------- renderer ----------
const canvas = $('pk-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.75));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#ffffff', 70, 300);
scene.add(new THREE.HemisphereLight('#ffffff', '#8a7fb0', 1.25));
const sun = new THREE.DirectionalLight('#fff3d6', 1.4);
sun.position.set(40, 90, 20);
scene.add(sun, sun.target);
const skies = THEMES.map((th) => {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});
const BOX = new THREE.BoxGeometry(1, 1, 1);
const EDGES = new THREE.EdgesGeometry(BOX);
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: string, e?: string) => {
  const k = c + (e ?? '');
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e ?? '#000000', emissiveIntensity: e ? 0.7 : 0 }));
  return mats.get(k)!;
};
const edgeMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 });
// a sea of clouds far below the course
const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, fog: false }));
cloudSea.rotation.x = -Math.PI / 2;
scene.add(cloudSea);

// ---------- course ----------
let course = makeCourse('menu');
let T = 0; // world clock (moving platforms, fades)
type Plat = any;
const meshes = new Map<number, THREE.Group>();
const fades = new Map<number, number>(); // platform index -> time it was stepped on
let helpers: Plat[] = [];
const assisted = new Set<number>(); // checkpoints that already got helper blocks
const SPHERE = new THREE.SphereGeometry(0.5, 12, 10);
const PAD_GEO = new THREE.CylinderGeometry(1.7, 1.9, 0.5, 20);
const ARROW_GEO = new THREE.ConeGeometry(0.5, 1.2, 4);
const helperMeshes: THREE.Object3D[] = [];
const bouncers = new Map<number, THREE.Object3D>();

function label(text: string, color = '#ffffff', scale = 6) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 38px Fredoka, system-ui';
  g.textAlign = 'center';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(text, 128, 46);
  g.fillStyle = color; g.fillText(text, 128, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(scale, scale / 4, 1);
  return s;
}

function buildPlat(p: Plat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BOX, p.type === 'fade' || p.type === 'helper' ? new THREE.MeshLambertMaterial({ color: p.c, transparent: true, opacity: p.type === 'helper' ? 0.55 : 0.85, emissive: p.type === 'helper' ? '#7fdcff' : '#000000', emissiveIntensity: 0.5 }) : mat(p.c));
  body.scale.set(p.w, 1.2, p.d);
  body.position.y = -0.6;
  const edges = new THREE.LineSegments(EDGES, edgeMat);
  edges.scale.copy(body.scale);
  edges.position.copy(body.position);
  g.add(body, edges);
  g.userData.body = body;
  if (p.type === 'lava') {
    const strip = new THREE.Mesh(BOX, mat('#ff3b30', '#ff2200'));
    strip.scale.set(p.w + 0.02, 0.3, LAVA_HALF * 2);
    strip.position.y = 0.02;
    g.add(strip);
    g.userData.lava = strip;
  }
  if (p.type === 'bounce') {
    const pad = new THREE.Mesh(PAD_GEO, mat('#b2ff59', '#5bd100'));
    pad.position.y = 0.25;
    g.add(pad);
    bouncers.set(p.i, pad);
  }
  if (p.type === 'move') {
    for (const s of [-1, 1]) {
      const arrow = new THREE.Mesh(ARROW_GEO, mat('#ffffff'));
      arrow.rotation.z = (s * Math.PI) / 2;
      arrow.position.set(-s * (p.w / 2 + 0.7), -0.4, 0);
      g.add(arrow);
    }
  }
  if (p.cp && p.i > 0) {
    const pole = new THREE.Mesh(BOX, mat('#eeeeee'));
    pole.scale.set(0.3, 7, 0.3);
    pole.position.set(p.w / 2 - 1, 3.5, 0);
    const flag = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: '#9aa0a6' }));
    flag.scale.set(0.12, 1.8, 2.8);
    flag.position.set(p.w / 2 - 1, 6, 1.4);
    g.add(pole, flag);
    g.userData.flag = flag;
    const th = themeOf(p.i);
    const tag = label(`${th.emoji} Stage ${stageOf(p.i) + 1}`, '#ffffff', 9);
    tag.position.set(0, 9, 0);
    g.add(tag);
    // floating themed decorations around each checkpoint
    const r = mulberry(p.i * 977);
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2, d = 22 + r() * 30;
      const deco = new THREE.Mesh(k % 2 ? BOX : SPHERE, mat(th.cols[k % 4]));
      deco.scale.setScalar(3 + r() * 5);
      deco.position.set(Math.cos(a) * d, -10 + r() * 30, Math.sin(a) * d);
      deco.userData.spin = 0.2 + r() * 0.6;
      g.add(deco);
    }
  }
  if (p.i === 0) {
    const tag = label('START', '#ffd23f', 8);
    tag.position.set(0, 6, 0);
    g.add(tag);
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.ry;
  return g;
}
function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o: any) => {
    if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
    if (o.isMesh && ![...mats.values()].includes(o.material)) o.material.dispose?.();
  });
}
function syncPlatforms() {
  const idx = racers.map((r) => r.at);
  const lo = Math.max(0, Math.min(...idx) - 8), hi = Math.max(...idx) + 34;
  course.ensure(hi + 1);
  for (const [i, g] of meshes) if (i < lo || i > hi) { scene.remove(g); disposeGroup(g); meshes.delete(i); bouncers.delete(i); }
  for (let i = lo; i <= hi; i++) if (!meshes.has(i)) { const g = buildPlat(course.plats[i]); meshes.set(i, g); scene.add(g); }
}
function clearCourse() {
  for (const g of meshes.values()) { scene.remove(g); disposeGroup(g); }
  meshes.clear(); bouncers.clear(); fades.clear();
  for (const h of helperMeshes) { scene.remove(h); disposeGroup(h); }
  helperMeshes.length = 0; helpers = []; assisted.clear();
}
const solid = (p: Plat) => {
  if (p.type !== 'fade') return true;
  const t0 = fades.get(p.i);
  return t0 == null || T - t0 < 0.9 || T - t0 > 2.8;
};
// Helper blocks: after 3 falls in a stage, soft glowing stepping stones appear in the long gaps.
function addHelpers(cp: number) {
  for (let i = cp + 1; i <= cp + CP_EVERY; i++) {
    const p = course.plats[i], q = course.plats[i - 1];
    if (!p || p.gap < 3.2 || q.type === 'bounce' || q.type === 'move' || p.type === 'move') continue;
    const along = q.d / 2 + p.gap / 2;
    const h = { i: -i, type: 'helper', w: 2.6, d: 2.6, ry: p.ry, x: q.x + Math.sin(p.ry) * along, z: q.z + Math.cos(p.ry) * along, y: q.y + Math.max(0, p.rise) * 0.5, c: '#bfefff' };
    helpers.push(h);
    const g = buildPlat(h);
    helperMeshes.push(g);
    scene.add(g);
    poof(h.x, h.y, h.z, '#bfefff', 10);
  }
}

// ---------- racers ----------
type Keys = { up: string[]; down: string[]; left: string[]; right: string[]; jump: string[] };
type Racer = {
  name: string; rig: Rig | null; tag?: THREE.Sprite; remote: boolean;
  x: number; y: number; z: number; vx: number; vz: number; vy: number; face: number; speed01: number;
  onGround: boolean; stand: Plat | null; standPos: { x: number; z: number } | null; coyote: number; buffer: number;
  at: number; best: number; cp: number; falls: number; cpFalls: number; angels: number;
  mode: 'wait' | 'play' | 'fall' | 'angel' | 'done'; fallT: number; ts: number; squash: number;
  keys?: Keys; jumpDown: boolean; lucky?: boolean; bestPos?: { x: number; y: number; z: number }; camera: THREE.PerspectiveCamera; cam: { yaw: number; pitch: number; dist: number; manual: number; pos: THREE.Vector3; look: THREE.Vector3; fov: number; freeze: THREE.Vector3 | null };
  view: HTMLElement; net?: { x: number; y: number; z: number; f: number; s: number; a: number };
};
let racers: Racer[] = [];
const held = new Set<string>();
const pressed = new Set<string>();
const KEYS_SOLO: Keys = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space'] };

function newRacer(name: string, view: HTMLElement, keys?: Keys, remote = false): Racer {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 900);
  return {
    name, rig: null, remote, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, face: 0, speed01: 0,
    onGround: true, stand: course.plats[0], standPos: null, coyote: 0, buffer: 0,
    at: 0, best: 0, cp: 0, falls: 0, cpFalls: 0, angels: 0, mode: 'wait', fallT: 0, ts: 1, squash: 0,
    keys, jumpDown: false, camera, cam: { yaw: Math.PI, pitch: 0.38, dist: 15, manual: 0, pos: new THREE.Vector3(0, 8, -15), look: new THREE.Vector3(), fov: 70, freeze: null },
    view,
  };
}
async function addRig(r: Racer, avatar: any, tagColor?: string) {
  r.rig = await buildAvatar(avatar);
  scene.add(r.rig.root);
  if (tagColor) {
    r.tag = label(r.name, tagColor, 7);
    scene.add(r.tag);
  }
}
function removeRacers() {
  for (const r of racers) { if (r.rig) scene.remove(r.rig.root); if (r.tag) { scene.remove(r.tag); disposeGroup(r.tag); } }
  racers = [];
}

addEventListener('keydown', (e) => {
  if (state !== 'play') return;
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());
// touch: joystick on the left, jump button on the right; mouse/finger drag turns the camera
let joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
let drag: { id: number; x: number } | null = null;
let touchJump = false;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const rc = canvas.getBoundingClientRect();
  if (e.pointerType === 'touch' && e.clientX - rc.left < rc.width * 0.5 && joy.id < 0) {
    joy = { x: 0, y: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY };
    const base = $('pk-joy');
    base.hidden = false;
    base.style.left = `${e.clientX - rc.left}px`;
    base.style.top = `${e.clientY - rc.top}px`;
  } else drag = { id: e.pointerId, x: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, len = Math.min(1, Math.hypot(dx, dy) / 50), a = Math.atan2(dy, dx);
    joy.x = Math.cos(a) * len; joy.y = Math.sin(a) * len;
    ($('pk-knob') as HTMLElement).style.transform = `translate(${joy.x * 34}px, ${joy.y * 34}px)`;
  } else if (drag?.id === e.pointerId && racers[0]) {
    racers[0].cam.manual -= (e.clientX - drag.x) * 0.006;
    drag.x = e.clientX;
  }
});
const endPointer = (e: PointerEvent) => {
  if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }; $('pk-joy').hidden = true; ($('pk-knob') as HTMLElement).style.transform = ''; }
  if (drag?.id === e.pointerId) drag = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
$('pk-jump').addEventListener('pointerdown', (e) => { touchJump = true; e.preventDefault(); });
$('pk-jump').addEventListener('pointerup', () => (touchJump = false));

// ---------- sound (tiny WebAudio synth, no files) ----------
let audio: AudioContext | null = null;
let muted = !!read('muted');
function sfx(kind: string) {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    const note = (f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06, at = 0) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + at);
      o.frequency.exponentialRampToValueAtTime(f1, now + at + dur);
      g.gain.setValueAtTime(vol, now + at);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      o.connect(g).connect(audio!.destination);
      o.start(now + at); o.stop(now + at + dur);
    };
    if (kind === 'jump') note(300, 620, 0.14);
    if (kind === 'land') note(160, 90, 0.08, 'triangle', 0.08);
    if (kind === 'boing') note(180, 900, 0.35, 'sine', 0.12);
    if (kind === 'cp') [523, 659, 784, 1047].forEach((f, i) => note(f, f, 0.18, 'square', 0.05, i * 0.09));
    if (kind === 'fall') note(700, 90, 1.4, 'sine', 0.08);
    if (kind === 'angel') { // heavenly choir: a slow rising major chord with a shimmer on top
      [262, 330, 392, 523, 659].forEach((f, i) => { note(f, f * 1.003, 3.2, 'sine', 0.035, i * 0.18); note(f * 2, f * 2.006, 2.6, 'triangle', 0.012, 0.3 + i * 0.18); });
      [1568, 2093, 2637].forEach((f, i) => note(f, f, 0.6, 'sine', 0.02, 0.9 + i * 0.25));
    }
    if (kind === 'bell') [1047, 1319, 1568, 2093].forEach((f, i) => note(f, f, 1.2, 'sine', 0.04, i * 0.07));
    if (kind === 'go') note(880, 880, 0.35, 'square', 0.06);
    if (kind === 'tick') note(440, 440, 0.12, 'square', 0.05);
    if (kind === 'win') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, f, 0.2, 'square', 0.05, i * 0.12));
  } catch {}
}
$('pk-mute').onclick = () => { muted = !muted; write('muted', muted); $('pk-mute').textContent = muted ? '🔇' : '🔊'; };
$('pk-mute').textContent = muted ? '🔇' : '🔊';

// ---------- particles ----------
let bits: { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: number }[] = [];
function poof(x: number, y: number, z: number, color = '#ffffff', n = 12, speed = 8) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(BOX, mat(color));
    m.scale.setScalar(0.35 + Math.random() * 0.45);
    m.position.set(x, y + 0.3, z);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    bits.push({ m, v: new THREE.Vector3(Math.cos(a) * speed * Math.random(), 3 + Math.random() * speed, Math.sin(a) * speed * Math.random()), life: 0.6 + Math.random() * 0.5, spin: Math.random() * 8 });
  }
}
function burst(x: number, y: number, z: number) {
  for (const c of ['#ff5fa2', '#ffd23f', '#3ecf8e', '#5ee7ff', '#b388ff']) poof(x, y, z, c, 9, 14);
}

// ---------- the guardian angel ----------
// A "miracle" moment: time stops, a golden pillar of light opens from the sky, the angel descends through it,
// catches you and flies you back to the platform you fell from.
function shockRing(x: number, y: number, z: number) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.2, 40).rotateX(-Math.PI / 2), holy('#fff0b3', 0.9));
  ring.position.set(x, y + 0.15, z);
  scene.add(ring);
  rings.push({ m: ring, t: 0 });
}
let rings: { m: THREE.Mesh; t: number }[] = [];
type AngelRun = { r: Racer; g: THREE.Group; pillar: THREE.Group; t: number; from: THREE.Vector3; safe: Plat; landed: boolean };
let angelRuns: AngelRun[] = [];
// The platform you fell from (a vanishing, bouncy or lava block is not a safe spot, so use the one before).
function safePlat(r: Racer) {
  for (let i = r.at; i > 0; i--) {
    const p = course.plats[i];
    if (!['fade', 'bounce', 'lava'].includes(p.type)) return p;
  }
  return course.plats[0];
}

// ---------- game state ----------
type Mode = 'weekly' | 'endless' | 'online';
type State = 'menu' | 'play' | 'summary';
let state: State = 'menu';
let mode: Mode = 'weekly';
let runStart = 0, startAt = 0, lastSubmit = 0, lastNet = 0;
let profile: Profile | null = null;
let ws: WebSocket | null = null;
let raceOver = false;
let clockOffset = 0;
let myId = '';
let raceRanked = false;

function show(id: string | null) {
  for (const s of ['pk-menu', 'pk-wait', 'pk-summary']) $(s).hidden = s !== id;
  $('pk-tools').hidden = id !== null;
}
function viewBanner(r: Racer, title: string, sub = '', ms = 2400) {
  const b = r.view.querySelector<HTMLElement>('.pk-banner')!;
  b.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  b.style.animationDuration = `${ms}ms`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
function setSplit(on: boolean) {
  $('pk-v1').hidden = !on;
  $('pk-split').hidden = !on;
  $('pk').classList.toggle('split', on);
  resize();
}

async function start(m: Mode, seed?: string) {
  mode = m;
  removeRacers();
  clearCourse();
  angelRuns.forEach((a) => scene.remove(a.g));
  angelRuns = [];
  raceOver = false;
  course = makeCourse(seed ?? (m === 'weekly' ? `week${weekOf()}` : Math.random().toString(36).slice(2, 8)));
  course.ensure(40);
  show(null);
  if (m === 'weekly' || m === 'online') profile = await loadProfile(true);
  if (m === 'weekly' && saved()) fetch('/api/parkour/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved()) }).catch(() => {});
  else profile ??= await loadProfile(false);
  const me = newRacer(profile?.name ?? 'You', $('pk-v0'), KEYS_SOLO);
  racers = [me];
  await addRig(me, profile?.avatar, m === 'online' ? '#ff5fa2' : undefined);
  setSplit(m === 'online');
  $('pk-jump').hidden = !touch;
  $('pk-end').textContent = m === 'weekly' || m === 'endless' ? '🏁 End run' : '🚪 Leave';
  for (const r of racers) updateHud(r);
  state = 'play';
  syncPlatforms();
  if (m !== 'online') countdown(Date.now() + 3200);
}
function countdown(at: number) {
  startAt = at;
  for (const r of racers) { r.mode = 'wait'; }
  let last = -1;
  const tick = () => {
    if (state !== 'play') return;
    const left = Math.ceil((startAt - (Date.now() + clockOffset)) / 1000);
    if (left !== last) {
      last = left;
      for (const r of racers) if (!r.remote) viewBanner(r, left > 0 ? String(left) : 'GO!', left > 0 ? (mode === 'online' ? `First to platform ${RACE_GOAL} wins!` : 'Jump to the next platform!') : '', 900);
      if (mode === 'online' && racers[1]) viewBanner(racers[1], left > 0 ? String(left) : 'GO!', '', 900);
      sfx(left > 0 ? 'tick' : 'go');
    }
    if (left <= 0) {
      for (const r of racers) r.mode = 'play';
      runStart = performance.now();
      return;
    }
    setTimeout(tick, 100);
  };
  tick();
}

function updateHud(r: Racer) {
  const th = themeOf(r.at);
  r.view.querySelector('.pk-name')!.textContent = r.name;
  r.view.querySelector('.pk-stage')!.textContent = `${th.emoji} Stage ${stageOf(r.at) + 1} · ${th.name}`;
  r.view.querySelector('.pk-count')!.textContent = `🧱 ${r.best}${mode === 'online' ? ` / ${RACE_GOAL}` : ''} · ⬆ ${Math.max(0, Math.round(course.plats[r.best]?.y ?? 0))}m`;
  if (racers.length === 2) {
    ($(`pk-prog${racers.indexOf(r)}`) as HTMLElement).style.left = `${Math.min(100, (r.best / RACE_GOAL) * 100)}%`;
  }
}

// ---------- physics ----------
function inputOf(r: Racer) {
  let ix = 0, iz = 0, jump = false, jumpHeld = false;
  const k = r.keys!;
  const any = (list: string[]) => list.some((c) => held.has(c));
  if (any(k.up)) iz -= 1;
  if (any(k.down)) iz += 1;
  if (any(k.left)) ix -= 1;
  if (any(k.right)) ix += 1;
  jumpHeld = any(k.jump);
  jump = k.jump.some((c) => pressed.has(c));
  if (r === racers[0]) {
    ix += joy.x; iz += joy.y;
    if (touchJump && !r.jumpDown) jump = true;
    jumpHeld ||= touchJump;
  }
  r.jumpDown = jumpHeld;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  return { ix, iz, jump };
}

function stepRacer(r: Racer, rdt: number) {
  const dt = rdt * r.ts;
  if (r.mode === 'wait' || r.mode === 'done' || r.mode === 'angel') return;
  const inp = r.mode === 'play' ? inputOf(r) : { ix: 0, iz: 0, jump: false };
  // move relative to the camera
  const fx = -Math.sin(r.cam.yaw), fz = -Math.cos(r.cam.yaw);
  const mx = fx * -inp.iz + -fz * inp.ix, mz = fz * -inp.iz + fx * inp.ix;
  const k = Math.min(1, dt * (r.onGround ? 14 : 8));
  r.vx += (mx * SPEED - r.vx) * k;
  r.vz += (mz * SPEED - r.vz) * k;
  const moving = Math.hypot(mx, mz) > 0.05;
  if (moving) r.face = lerpAngle(r.face, Math.atan2(mx, mz), Math.min(1, dt * 14));
  r.speed01 += ((moving && r.onGround ? 1 : 0) - r.speed01) * Math.min(1, dt * 10);
  // ride moving platforms
  if (r.onGround && r.stand?.type === 'move') {
    const now = platPos(r.stand, T);
    if (r.standPos) { r.x += now.x - r.standPos.x; r.z += now.z - r.standPos.z; }
    r.standPos = now;
  } else r.standPos = null;
  r.x += r.vx * dt;
  r.z += r.vz * dt;
  // jump: coyote time + buffer so "I pressed it!" always works
  r.coyote = r.onGround ? COYOTE : r.coyote - dt;
  r.buffer = inp.jump ? BUFFER : r.buffer - dt;
  if (r.buffer > 0 && r.coyote > 0 && r.mode === 'play') {
    r.vy = JUMP; r.onGround = false; r.stand = null; r.coyote = 0; r.buffer = 0; r.squash = -0.18;
    sfx('jump');
  }
  if (r.onGround) {
    const p = r.stand;
    if (!p || !solid(p) || !onTop(p, r.x, r.z, PAD, ...xz(p))) { r.onGround = false; r.stand = null; }
    else {
      r.y = p.y;
      if (p.type === 'lava' && Math.abs(local(p, r.x, r.z, ...xz(p)).lz) < LAVA_HALF) { die(r, true); return; }
    }
  }
  if (!r.onGround) {
    r.vy = Math.max(-110, r.vy - GRAVITY * dt);
    const ny = r.y + r.vy * dt;
    let landed: Plat | null = null;
    if (r.vy <= 0 && r.mode === 'play') { // while falling in slow motion you pass through everything
      for (const p of candidates(r)) {
        // ledge assist: coming down just below a top edge still lands you on it (like Roblox's step-up)
        if (solid(p) && r.y >= p.y - 1.2 && ny <= p.y && onTop(p, r.x, r.z, r.y < p.y - 0.3 ? 0.25 : PAD, ...xz(p)) && (!landed || p.y > landed.y)) landed = p;
      }
    }
    if (landed) land(r, landed);
    else r.y = ny;
  }
  // fell off?
  const ref = Math.min(course.plats[r.at].y, course.plats[r.at + 1]?.y ?? Infinity);
  if (r.mode === 'play' && r.y < ref - 12) die(r, false);
  if (r.mode === 'fall') {
    r.fallT += rdt;
    if (r.lucky ? r.fallT > 0.45 : r.fallT > FALL_SLOWMO) { r.fallT = -1e9; afterFall(r); } // a lucky fall: the angel catches you mid-air
  }
}
const xz = (p: Plat): [number, number] => { const q = platPos(p, T); return [q.x, q.z]; };
function candidates(r: Racer) {
  const out: Plat[] = [];
  for (let i = Math.max(0, r.at - 3); i <= r.at + 4; i++) if (course.plats[i]) out.push(course.plats[i]);
  return out.concat(helpers);
}
function land(r: Racer, p: Plat) {
  const hard = r.vy < -70;
  r.y = p.y; r.vy = 0; r.onGround = true; r.stand = p; r.standPos = null;
  r.squash = hard ? 0.28 : 0.16;
  if (hard) poof(r.x, p.y, r.z);
  if (p.i >= 0) {
    r.at = p.i;
    if (p.i > r.best) { r.best = p.i; r.bestPos = { x: r.x, y: r.y, z: r.z }; updateHud(r); onProgress(r); }
  }
  if (p.type === 'fade' && !fades.has(p.i)) fades.set(p.i, T);
  if (p.type === 'bounce') {
    r.vy = BOUNCE; r.onGround = false; r.stand = null; r.squash = -0.3;
    const pad = bouncers.get(p.i);
    if (pad) pad.userData.boing = 1;
    sfx('boing');
    return;
  }
  sfx('land');
  if (p.cp && p.i > r.cp) checkpoint(r, p);
}
function checkpoint(r: Racer, p: Plat) {
  r.cp = p.i; r.cpFalls = 0;
  const flag = meshes.get(p.i)?.userData.flag as THREE.Mesh | undefined;
  if (flag) (flag.material as THREE.MeshLambertMaterial).color.set('#3ecf8e');
  burst(p.x, p.y + 1, p.z);
  sfx('cp');
  const th = themeOf(p.i);
  viewBanner(r, `Stage ${stageOf(p.i) + 1}!`, `${th.emoji} ${th.name} · checkpoint saved`);
  if (mode === 'weekly') submit();
}
function onProgress(r: Racer) {
  if (mode === 'online' && r === racers[0]) netEvent(''); // tell the server right away (it decides who won)
}
function die(r: Racer, lava: boolean) {
  r.mode = 'fall';
  r.fallT = 0;
  r.falls++; r.cpFalls++;
  r.ts = reduced ? 1 : 0.28;
  r.onGround = false; r.stand = null;
  if (lava) { r.vy = 38; poof(r.x, r.y, r.z, '#ff3b30', 16); }
  r.cam.freeze = r.cam.pos.clone().add(new THREE.Vector3(0, 4, 0));
  r.lucky = Math.random() < angelChance(r.cpFalls);
  r.view.classList.add('cine');
  sfx('fall');
  if (mode === 'online') netEvent('fall');
}
function afterFall(r: Racer) {
  if (r.lucky) {
    r.mode = 'angel'; // time stops for you while the miracle happens
    r.ts = 1;
    r.angels++;
    r.cpFalls = Math.max(0, r.cpFalls - 1); // a saved fall doesn't count
    write('angels', (read('angels') ?? 0) + 1);
    const g = makeAngel();
    g.position.set(r.x, r.y + 60, r.z);
    g.scale.setScalar(1.35);
    const pillar = makePillar();
    pillar.position.set(r.x, r.y - 6, r.z);
    scene.add(g, pillar);
    angelRuns.push({ r, g, pillar, t: 0, from: new THREE.Vector3(r.x, r.y, r.z), safe: safePlat(r), landed: false });
    r.view.classList.add('divine');
    viewBanner(r, '😇 Divine rescue!', 'An angel is taking you back ✨', 3800);
    sfx('angel');
    if (mode === 'online') netEvent('angel');
    return;
  }
  flash(r);
  setTimeout(() => respawn(r), 180);
}
function respawn(r: Racer, p: Plat = course.plats[r.cp]) {
  const [px, pz] = xz(p);
  Object.assign(r, { x: px, y: p.y, z: pz, vx: 0, vz: 0, vy: 0, onGround: true, stand: p, standPos: null, at: p.i, mode: raceOver ? 'done' : 'play', ts: 1, lucky: false });
  r.cam.freeze = null;
  r.cam.fov = 70;
  r.view.classList.remove('cine', 'divine');
  if (p.i !== r.cp) return; // the angel put you back where you were: no extra help needed
  poof(px, p.y, pz, '#ffffff', 16);
  if (r.cpFalls >= 3 && !assisted.has(r.cp) && (mode === 'weekly' || mode === 'endless')) { // races stay fair: no helpers
    assisted.add(r.cp);
    addHelpers(r.cp);
    viewBanner(r, '🤝 Helper blocks!', 'Glowing blocks appeared to help you', 2600);
  } else if (r.cpFalls === 3) viewBanner(r, 'You got this! 💪', 'Tip: jump at the very edge of the platform', 2600);
}
function flash(r: Racer) {
  const f = r.view.querySelector<HTMLElement>('.pk-flash')!;
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}

// ---------- run end, ranking ----------
async function submit() {
  if (mode !== 'weekly' || !saved() || !racers[0] || Date.now() - lastSubmit < 3000) return null;
  lastSubmit = Date.now();
  const r = racers[0];
  const best = read(`week-${weekOf()}`) ?? 0;
  if (r.best > best) write(`week-${weekOf()}`, r.best);
  try {
    const res = await fetch('/api/parkour', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...saved(), wk: weekOf(), score: r.best, ...r.bestPos }) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
$('pk-end').onclick = async () => {
  if (state !== 'play') return;
  const r = racers[0];
  if (mode === 'online') { ws?.close(); summary('🚪 You left the race', raceRanked ? 'Leaving a ranked race counts as a loss.' : ''); return; }
  lastSubmit = 0;
  const res = mode === 'weekly' && r.best > 0 ? await submit() : null;
  const key = mode === 'weekly' ? `week-${weekOf()}` : 'endless';
  const prev = read(key) ?? 0;
  if (r.best > prev) write(key, r.best);
  summary(`🧱 ${r.best} platforms!`, `Stage ${stageOf(r.best) + 1} · ${fmtTime(performance.now() - runStart)} · ${r.falls} falls${r.angels ? ` · 😇 ${r.angels} angel${r.angels > 1 ? 's' : ''}` : ''}${res?.rank ? `<br>🏆 You are <b>#${res.rank}</b> this week!` : ''}${r.best > prev ? '<br>🎉 New personal best!' : `<br>Your best: ${prev}`}`);
};
function summary(title: string, body: string) {
  state = 'summary';
  for (const r of racers) r.mode = 'done';
  ws?.close(); ws = null;
  setSplit(false);
  show('pk-summary');
  $('pk-sum').innerHTML = `<h2>${title}</h2><p>${body}</p>`;
  loadTop();
}
$('pk-again').onclick = () => (mode === 'online' ? online() : start(mode));
function menuScene() {
  clearCourse();
  course = makeCourse('menu');
  course.ensure(40);
  for (let i = 0; i < 30; i++) { const g = buildPlat(course.plats[i]); meshes.set(i, g); scene.add(g); }
}
$('pk-back').onclick = () => { state = 'menu'; removeRacers(); menuScene(); show('pk-menu'); loadTop(); };

async function loadTop() {
  const lists = document.querySelectorAll<HTMLElement>('.pk-toplist');
  try {
    const d = await fetch('/api/parkour/top').then((r) => r.json());
    const me = saved()?.id;
    const html = d.top.length
      ? d.top.slice(0, 10).map((p: any, i: number) => `<li class="${p.id === me ? 'me' : ''}"><b>${['🥇', '🥈', '🥉'][i] ?? i + 1}</b>${avatarSVG(p.avatar, 30)}<span>${p.name}</span><em>🧱 ${p.score}</em></li>`).join('')
      : '<li class="muted">Nobody yet this week. Be the first! 🚀</li>';
    lists.forEach((l) => (l.innerHTML = html));
    $('pk-racers').innerHTML = d.racers?.length
      ? d.racers.slice(0, 10).map((p: any, i: number) => `<li class="${p.id === me ? 'me' : ''}"><b>${['🥇', '🥈', '🥉'][i] ?? i + 1}</b>${avatarSVG(p.avatar, 30)}<span>${p.name}</span><em>⚔️ ${p.elo}</em></li>`).join('')
      : '<li class="muted">No ranked races yet. Be the first champion! ⚔️</li>';
  } catch { lists.forEach((l) => (l.innerHTML = '<li class="muted">Ranking offline</li>')); }
}

// ---------- online race ----------
function netEvent(e: string) { if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'p', ...netState(racers[0]), e })); }
const netState = (r: Racer) => ({ x: +r.x.toFixed(2), y: +r.y.toFixed(2), z: +r.z.toFixed(2), f: +r.face.toFixed(2), s: +r.speed01.toFixed(2), a: r.onGround ? 0 : 1, i: r.best });
function wsUrl(path: string) { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`; }
async function online(code?: string, host = false) {
  mode = 'online';
  show('pk-wait');
  $('pk-invite').hidden = !host;
  $('pk-waittxt').textContent = host ? 'Send this link to your friend. The race starts when they join!' : code ? 'Joining the race… ⚡' : 'Looking for a rival… 🔎';
  profile = await loadProfile(true);
  if (!profile) { $('pk-waittxt').textContent = 'Could not load your profile. Try again!'; return; }
  myId = profile.id;
  if (code) return joinRace(code);
  const lobby = new WebSocket(wsUrl('/api/race'));
  ws = lobby;
  lobby.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'match') joinRace(m.code); };
}
function joinRace(code: string) {
  const sock = new WebSocket(wsUrl(`/api/race/${code}`));
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', ...saved() }));
  sock.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'full') { $('pk-waittxt').textContent = 'That race is full or already started 😕'; return; }
    if (m.t === 'start') {
      clockOffset = m.now - Date.now();
      raceRanked = m.ranked;
      const rival = m.players.find((p: any) => p.id !== myId), mine = m.players.find((p: any) => p.id === myId);
      await start('online', m.seed);
      racers[0].name = `${racers[0].name}${raceRanked ? ` · ⚔️ ${mine?.elo ?? ''}` : ''}`;
      updateHud(racers[0]);
      const r = newRacer(`${rival?.name ?? 'Rival'}${raceRanked ? ` · ⚔️ ${rival?.elo ?? ''}` : ''}`, $('pk-v1'), undefined, true);
      racers.push(r);
      await addRig(r, rival?.avatar, '#5ee7ff');
      updateHud(r);
      countdown(m.at);
    }
    const rival = racers[1];
    if (m.t === 'p' && rival) {
      rival.net = m;
      if (m.i > rival.best) { rival.best = m.i; rival.at = m.i; updateHud(rival); }
      if (m.e === 'angel') viewBanner(rival, '😇 An angel saved them!', '', 2600);
      if (m.e === 'fall') { rival.view.classList.add('cine'); setTimeout(() => rival.view.classList.remove('cine'), 1600); }
    }
    if (m.t === 'end') {
      raceOver = true;
      const won = m.winner === myId;
      sfx(won ? 'win' : 'fall');
      if (won) burst(racers[0].x, racers[0].y + 2, racers[0].z);
      const d = m.deltas?.[myId];
      const rating = m.ranked && d != null ? `<br><span class="pk-elo ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d} ⚔️</span> Race rating: <b>${m.elo?.[myId] ?? '?'}</b>${d === 0 ? '<br><small class="muted">Same network as your rival: no rating change</small>' : ''}` : '<br>Casual race (no rating change)';
      viewBanner(racers[0], won ? '🏆 You win!' : '😅 They won!', m.forfeit ? (won ? 'Your rival left the race' : '') : '', 2600);
      setTimeout(() => summary(won ? '🏆 You won the race!' : '😅 Your rival won!', `${m.forfeit && won ? 'Your rival gave up.' : `Finished in ${fmtTime(m.ms)}.`}${rating}`), m.forfeit ? 600 : 2000);
    }
    if (m.t === 'left' && !raceOver) { $('pk-waittxt').textContent = 'Your rival left before the start. Looking again… 🔎'; }
  };
  sock.onclose = () => { if (ws === sock && state === 'play' && !raceOver) summary('📡 Connection lost', 'Try another race!'); };
  $('pk-waittxt').textContent = 'Rival found! Getting ready… ⚡';
}
$('pk-friend').onclick = () => {
  const code = Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join('');
  ($('pk-link') as HTMLInputElement).value = `${location.origin}/parkour/?race=${code}`;
  online(code, true);
};
$('pk-copy').onclick = async () => {
  const link = ($('pk-link') as HTMLInputElement).value;
  try { navigator.share ? await navigator.share({ text: `Race me in BibiBox Parkour! ${link}` }) : await navigator.clipboard.writeText(link); $('pk-copy').textContent = '✅ Copied!'; } catch {}
};
$('pk-cancel').onclick = () => { ws?.close(); ws = null; show('pk-menu'); };

for (const b of document.querySelectorAll<HTMLElement>('[data-pk]')) {
  b.onclick = () => {
    const m = b.dataset.pk!;
    if (m === 'online') online();
    else start(m as Mode);
  };
}

// ---------- camera + render ----------
function updateCamera(r: Racer, dt: number) {
  const cam = r.cam;
  const target = new THREE.Vector3(r.x, r.y + 3.2, r.z);
  if (r.mode === 'fall' && cam.freeze) {
    // movie shot: the camera stops and watches you fall, zooming in slowly
    cam.pos.lerp(cam.freeze, Math.min(1, dt * 3));
    cam.look.lerp(target, Math.min(1, dt * 8));
    cam.fov += (38 - cam.fov) * Math.min(1, dt * 1.5);
  } else {
    const next = course.plats[Math.min(r.at + 1, course.plats.length - 1)];
    const [nx, nz] = xz(next);
    if (Math.hypot(nx - r.x, nz - r.z) > 1.5) {
      const want = Math.atan2(nx - r.x, nz - r.z) + Math.PI + cam.manual;
      cam.yaw = lerpAngle(cam.yaw, want, Math.min(1, dt * (r.remote ? 3 : 1.8)));
    }
    if (!drag) cam.manual *= 1 - Math.min(1, dt * 0.35);
    const lookUp = r.mode === 'angel' ? -0.2 : next.y - r.y > 3 ? 0.18 : 0; // bounce pads: look up at the target; rescue: wide shot
    const dist = r.mode === 'angel' ? 26 : cam.dist;
    const pos = new THREE.Vector3(
      target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch - lookUp) * dist,
      target.y + Math.sin(cam.pitch - lookUp) * dist,
      target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch - lookUp) * dist,
    );
    cam.pos.lerp(pos, Math.min(1, dt * 7));
    cam.look.lerp(target, Math.min(1, dt * 12));
    cam.fov += (70 - cam.fov) * Math.min(1, dt * 3);
  }
  r.camera.position.copy(cam.pos);
  r.camera.lookAt(cam.look);
  if (Math.abs(r.camera.fov - cam.fov) > 0.01) { r.camera.fov = cam.fov; r.camera.updateProjectionMatrix(); }
}
function resize() {
  const rc = canvas.getBoundingClientRect();
  renderer.setSize(rc.width, rc.height, false);
}
addEventListener('resize', resize);
const menuCam = new THREE.PerspectiveCamera(60, 1, 0.3, 900);

const clock = new THREE.Clock();
function frame() {
  const rdt = Math.min(0.05, clock.getDelta());
  T += rdt;
  // world animation
  for (const [i, g] of meshes) {
    const p = course.plats[i];
    if (p.type === 'move') { const q = platPos(p, T); g.position.x = q.x; g.position.z = q.z; }
    if (p.type === 'fade') {
      const t0 = fades.get(i), body = g.userData.body as THREE.Mesh, m = body.material as THREE.MeshLambertMaterial;
      if (t0 == null) { g.visible = true; m.opacity = 0.85; g.position.x = p.x; }
      else {
        const k = T - t0;
        g.visible = k < 0.9 || k > 2.8;
        m.opacity = k < 0.9 ? 0.85 - k * 0.6 : 0.85;
        g.position.x = p.x + (k < 0.9 ? Math.sin(k * 60) * 0.12 : 0); // shake before vanishing
        if (k > 3.2) fades.delete(i);
      }
    }
    if (g.userData.lava) (g.userData.lava.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(T * 5) * 0.3;
    for (const c of g.children) if (c.userData.spin) { c.rotation.y += rdt * c.userData.spin; c.rotation.x += rdt * c.userData.spin * 0.5; }
    if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(T * 3 + i) * 0.25;
  }
  for (const pad of bouncers.values()) {
    const b = pad.userData.boing ?? 0;
    pad.scale.y = 1 + Math.sin(b * 20) * b * 1.2;
    pad.userData.boing = Math.max(0, b - rdt * 1.5);
  }
  bits = bits.filter((b) => {
    b.life -= rdt;
    b.v.y -= 30 * rdt;
    b.m.position.addScaledVector(b.v, rdt);
    b.m.rotation.x += b.spin * rdt;
    b.m.scale.multiplyScalar(1 - rdt * 1.6);
    if (b.life <= 0) scene.remove(b.m);
    return b.life > 0;
  });
  // angels
  angelRuns = angelRuns.filter((a) => {
    a.t += rdt;
    const r = a.r, t = a.t, u = a.g.userData;
    const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
    // wings: open wide while descending, then slow majestic flaps
    const open = Math.min(1, Math.max(0, (t - 0.5) / 0.8));
    const flap = Math.sin(t * (t < 1.7 ? 5 : 9)) * 0.45 * open;
    u.wings[0].rotation.y = flap - (1 - open) * 1.2;
    u.wings[1].rotation.y = -flap + (1 - open) * 1.2;
    u.wings.forEach((w: THREE.Group) => w.scale.setScalar(0.3 + 0.7 * open));
    u.halo.rotation.z += rdt * 3;
    u.glow.material.opacity = 0.7 + Math.sin(t * 6) * 0.3;
    u.light.intensity = Math.min(4, t * 4);
    // the pillar of light opens, its rays turn slowly
    const P = a.pillar;
    const width = t < 0.6 ? ease(t / 0.6) : t > 4.2 ? Math.max(0.01, 1 - (t - 4.2) / 0.8) : 1 + Math.sin(t * 4) * 0.06;
    P.scale.set(width, 1, width);
    P.userData.rays.rotation.y += rdt * 0.8;
    const safe = a.safe, [sx, sz] = xz(safe);
    if (t < 0.7) { // time stops, light from heaven
      Object.assign(r, { x: a.from.x, y: a.from.y + Math.sin(t * 3) * 0.2, z: a.from.z });
      a.g.position.set(a.from.x, a.from.y + 60 - t * 20, a.from.z);
    } else if (t < 1.7) { // the angel descends through the light
      const k = ease((t - 0.7) / 1);
      a.g.position.set(a.from.x, a.from.y + 46 * (1 - k) + 3.2, a.from.z);
      r.y = a.from.y + k * 0.8;
      if (Math.random() < 0.6) poof(a.g.position.x + (Math.random() - 0.5) * 6, a.g.position.y + 3, a.g.position.z + (Math.random() - 0.5) * 6, Math.random() < 0.5 ? '#fff3a0' : '#ffffff', 1, 2);
    } else if (t < 3.9) { // caught! flying you back on a gentle arc
      const k = ease((t - 1.7) / 2.2);
      const top = Math.max(a.from.y, safe.y) + 10;
      const x = a.from.x + (sx - a.from.x) * k, z = a.from.z + (sz - a.from.z) * k;
      const y = (1 - k) ** 2 * (a.from.y + 0.8) + 2 * (1 - k) * k * top + k * k * (safe.y + 0.3);
      Object.assign(r, { x, y, z });
      r.face = lerpAngle(r.face, Math.atan2(sx - a.from.x, sz - a.from.z), Math.min(1, rdt * 4));
      a.g.position.set(x, y + 3.2, z);
      a.g.rotation.y = r.face;
      P.position.set(x, y - 6, z);
      if (Math.random() < 0.8) poof(x - Math.sin(r.face) * 2, y + 3, z - Math.cos(r.face) * 2, ['#fff3a0', '#ffffff', '#ffd23f'][Math.floor(Math.random() * 3)], 1, 2);
    } else { // set down softly, then return to the sky
      if (!a.landed) {
        a.landed = true;
        respawn(r, safe);
        shockRing(sx, safe.y, sz);
        burst(sx, safe.y + 1, sz);
        sfx('bell');
      }
      a.g.position.y += rdt * (8 + (t - 3.9) * 30);
      u.light.intensity = Math.max(0, 4 - (t - 3.9) * 5);
    }
    if (t > 5) { scene.remove(a.g, a.pillar); disposeGroup(a.g); disposeGroup(a.pillar); return false; }
    return true;
  });
  rings = rings.filter((g) => {
    g.t += rdt;
    g.m.scale.setScalar(1 + g.t * 14);
    (g.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - g.t * 1.1);
    if (g.t > 0.9) { scene.remove(g.m); (g.m.material as THREE.Material).dispose(); return false; }
    return true;
  });
  // racers
  if (state === 'play') {
    for (const r of racers) {
      if (r.remote) {
        if (r.net) {
          const k = Math.min(1, rdt * 10);
          r.x += (r.net.x - r.x) * k; r.y += (r.net.y - r.y) * k; r.z += (r.net.z - r.z) * k;
          r.face = lerpAngle(r.face, r.net.f, k);
          r.speed01 = r.net.s; r.onGround = !r.net.a;
        }
      } else stepRacer(r, rdt);
      if (r.rig) {
        r.rig.root.position.set(r.x, r.y, r.z);
        r.rig.root.rotation.y = r.face;
        r.squash *= 1 - Math.min(1, rdt * 10);
        r.rig.root.scale.set(1 + r.squash * 0.5, 1 - r.squash, 1 + r.squash * 0.5);
        animateRig(r.rig, T, r.speed01, !r.onGround || r.mode === 'angel');
        if (r.mode === 'angel') { r.rig.armL.rotation.x = r.rig.armR.rotation.x = Math.PI; }
      }
      if (r.tag) r.tag.position.set(r.x, r.y + 7.2, r.z);
      updateCamera(r, rdt);
    }
    pressed.clear();
    if (mode === 'online' && ws?.readyState === 1 && racers[0] && performance.now() - lastNet > 100 && racers[0].mode !== 'wait') {
      lastNet = performance.now();
      ws.send(JSON.stringify({ t: 'p', ...netState(racers[0]) }));
    }
    if (racers.length) syncPlatforms();
    const lead = racers[0];
    if (lead) {
      cloudSea.position.set(lead.x, course.plats[lead.cp].y - 45, lead.z);
      sun.position.set(lead.x + 40, lead.y + 90, lead.z + 20);
      sun.target.position.set(lead.x, lead.y, lead.z);
    }
  }
  render();
  requestAnimationFrame(frame);
}
function render() {
  const rc = canvas.getBoundingClientRect();
  const W = rc.width, H = rc.height;
  if (state !== 'play' || !racers.length) {
    // menu: slow orbit over the first platforms
    const a = T * 0.12;
    scene.background = skies[Math.floor(T / 8) % skies.length];
    (scene.fog as THREE.Fog).color.set(THEMES[Math.floor(T / 8) % THEMES.length].sky[1]);
    const c = course.plats[12] ?? course.plats[0];
    menuCam.aspect = W / H; menuCam.updateProjectionMatrix();
    menuCam.position.set(c.x + Math.sin(a) * 60, c.y + 30, c.z + Math.cos(a) * 60);
    menuCam.lookAt(c.x, c.y, c.z);
    cloudSea.position.set(c.x, -45, c.z);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, menuCam);
    return;
  }
  const split = racers.length === 2;
  renderer.setScissorTest(true);
  racers.forEach((r, i) => {
    const h = split ? H / 2 : H;
    const y = split ? (i === 0 ? H / 2 : 0) : 0; // WebGL origin is bottom-left: player 1 on top
    r.camera.aspect = W / h;
    r.camera.updateProjectionMatrix();
    const s = themeIndex(r.at);
    scene.background = skies[s];
    (scene.fog as THREE.Fog).color.set(THEMES[s].sky[1]);
    renderer.setViewport(0, y, W, h);
    renderer.setScissor(0, y, W, h);
    renderer.render(scene, r.camera);
  });
}

// boot: a live course spins behind the menu
(async () => {
  resize();
  menuScene();
  show('pk-menu');
  const wkBest = read(`week-${weekOf()}`), endless = read('endless'), angels = read('angels');
  $('pk-best').textContent = [wkBest ? `🏆 This week: ${wkBest}` : '', endless ? `♾️ Endless: ${endless}` : '', angels ? `😇 Angels seen: ${angels}` : ''].filter(Boolean).join(' · ');
  loadProfile(false).then((p) => { if (p) $('pk-rating').textContent = `⚔️ Your race rating: ${p.pk?.elo ?? 1000} · ${p.pk?.wins ?? 0} wins`; });
  frame();
  loadTop();
  const race = params.get('race');
  if (race && /^[A-Z0-9]{5}$/.test(race)) {
    $('pk-joinbox').hidden = false;
    $('pk-join').onclick = () => { $('pk-joinbox').hidden = true; online(race); };
  }
})();
