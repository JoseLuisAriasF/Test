// Golf Climb: a Roblox-style "Golfing Over It". Side-view 2.5D: the ball lives on the z = 0 plane
// (deterministic sim in lib/golf.js, replayed by the server for the speedrun ranking), the world is 3D blocks
// with stud textures, PBR lighting and soft shadows. Your avatar walks to the ball after every shot.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MAPS, getMap, makeSim, shotFrom, R, ANGEL_DELAY } from '../lib/golf.js';
import { avatarSVG } from '../lib/avatar.js';
import { buildAvatar, animateRig, type Rig } from './avatar3d.ts';
import { makeAngel, makePillar, holy } from './angel.ts';
import { loadProfile, saved } from './profile.ts';
import { fullscreenButton, synth, studTexture, studBox } from './gamekit.ts';
import { buildScenery } from './golfworld.ts';

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('gf-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { v == null ? localStorage.removeItem('gf-' + k) : localStorage.setItem('gf-' + k, JSON.stringify(v)); } catch {} };
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}`;
const FALL_QUOTES = [
  'Oof.', 'Gravity always wins… for now.', 'Every fall is part of the climb.', 'The mountain is not angry. Probably.',
  'Breathe. Aim. Try again.', 'Even pros fall right there.', 'Not a noob move. Character development.', 'The view from the bottom is nice too.',
  'You know the way now.', 'Plot twist: the floor missed you.',
];

// ---------- renderer ----------
const box = $('gf');
const canvas = $('gf-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
scene.fog = new THREE.Fog('#ffffff', 140, 420);
const hemi = new THREE.HemisphereLight('#ffffff', '#4a3f5a', 0.75);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1200);
// bloom on desktop: lava, crystals, lights and the ball's glow shine like in the Night Shift pizzeria
const composer = touch ? null : new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.3, 1.15)); // only real light sources glow
  composer.addPass(new OutputPass());
}

const STUDS = studTexture(renderer);
function skyTexture(top: string, bottom: string) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- world ----------
const world = new THREE.Group();
scene.add(world);
let map = getMap(0)!;
const animated: { o: THREE.Object3D; kind: string; base?: number; t?: number }[] = [];
let flag: THREE.Mesh | null = null;
let sceneryTick: ((T: number, dt: number, focus: THREE.Vector3) => void) | null = null;
function disposeAll(o: THREE.Object3D) {
  o.traverse((x: any) => {
    x.geometry?.dispose?.();
    for (const m of [x.material].flat()) { if (m && m.map && m.map !== STUDS) m.map.dispose(); m?.dispose?.(); }
  });
}
function surfMat(k: string, color: string) {
  const base = { color, map: STUDS } as THREE.MeshStandardMaterialParameters;
  if (k === 'ice') return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.05, metalness: 0, transmission: 0.35, thickness: 1.5, clearcoat: 1, envMapIntensity: 1.6 });
  if (k === 'metal') return new THREE.MeshStandardMaterial({ ...base, roughness: 0.3, metalness: 0.75 });
  if (k === 'lava') return new THREE.MeshStandardMaterial({ color: '#ff3d00', emissive: '#ff2a00', emissiveIntensity: 2.2, roughness: 0.6 });
  if (k === 'bounce') return new THREE.MeshStandardMaterial({ ...base, emissive: '#1fbf6a', emissiveIntensity: 0.5, roughness: 0.4 });
  if (k === 'sand') return new THREE.MeshStandardMaterial({ ...base, roughness: 1 });
  if (k === 'soft') return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') }); // fur, frosting, clouds
  return new THREE.MeshStandardMaterial({ ...base, roughness: 0.62 });
}
function buildWorld(i: number) {
  disposeAll(world);
  world.clear();
  animated.length = 0;
  map = getMap(i)!;
  const m = MAPS[i];
  const r = mulberry(i * 7919 + 13);
  scene.background = skyTexture(m.sky[0], m.sky[1]);
  (scene.fog as THREE.Fog).color.set(m.sky[1]).lerp(new THREE.Color(m.sky[0]), 0.35); // haze in the sky's own colour, not white
  const night = ['volcano', 'space', 'factory'].includes(m.id);
  (scene.fog as THREE.Fog).near = m.id === 'sky' ? 150 : 220;
  (scene.fog as THREE.Fog).far = 700;
  renderer.toneMappingExposure = ['candy', 'sky', 'frozen', 'pirate'].includes(m.id) ? 0.72 : 0.9;
  hemi.intensity = night ? 0.55 : 0.75;
  sun.intensity = night ? 1.3 : 2;
  sun.color.set(m.id === 'volcano' ? '#ffb38a' : night ? '#c9d4ff' : '#fff1d6');
  // the climbing parts
  for (const p of map.parts) {
    const len = p.hl * 2, h = p.ht * 2, wall = false;
    const D = p.z ?? 8;
    const mesh = new THREE.Mesh(studBox(len, h, D), surfMat(p.k, p.c));
    mesh.position.set(p.cx, p.cy, D >= 60 ? -20 : 0);
    mesh.rotation.z = Math.atan2(p.uy, p.ux);
    mesh.castShadow = !wall; mesh.receiveShadow = true;
    world.add(mesh);
    if (p.k === 'lava') { animated.push({ o: mesh, kind: 'lava' }); const l = new THREE.PointLight('#ff5a1f', 18, 16, 1.6); l.position.set(p.cx, p.cy, 3); world.add(l); }
    if (p.k === 'bounce') animated.push({ o: mesh, kind: 'bounce', base: mesh.scale.y, t: 9 });
  }
  // this mountain's own world: props, far scenery, particles
  sceneryTick = buildScenery(world, map, m, r, STUDS);
  // the hole, a flag and a glowing finish ring
  const cup = map.cup;
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 32), new THREE.MeshBasicMaterial({ color: '#050505' }));
  hole.position.set(cup.x, cup.y + 0.02, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 10), new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 0.6, roughness: 0.3 }));
  pole.position.set(cup.x, cup.y + 3.5, 0);
  const fgeo = new THREE.PlaneGeometry(3.2, 2, 16, 4);
  fgeo.translate(1.6, 0, 0);
  flag = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ color: '#ff3b5c', side: THREE.DoubleSide, roughness: 0.7 }));
  flag.position.set(cup.x + 0.1, cup.y + 6, 0);
  flag.userData.base = fgeo.attributes.position.array.slice();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cup.x, cup.y + 0.15, 0);
  animated.push({ o: ring, kind: 'ring' });
  world.add(hole, pole, flag, ring);
}
function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- ball, trail, aim arrow ----------
const ballMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
const tmpC = new THREE.Color();
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), ballMat);
ball.castShadow = true;
scene.add(ball);
const TRAIL = 36;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
trail.frustumCulled = false;
scene.add(trail);
const ready = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
scene.add(ready);
const arrow = new THREE.Group();
const arrowMat = new THREE.MeshBasicMaterial({ color: '#3ecf8e', transparent: true, opacity: 0.92, depthTest: false });
const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1, 0.35), arrowMat);
const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 4), arrowMat);
arrow.add(shaft, head);
arrow.renderOrder = 10;
arrow.visible = false;
scene.add(arrow);

// ---------- avatar with a golf club ----------
let rig: Rig | null = null;
let rigFace = 1, swing = 0;
async function makeRig() {
  const p = await loadProfile(false);
  rig = await buildAvatar(p?.avatar);
  const club = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.8, roughness: 0.25 }));
  stick.position.y = -1.7;
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: '#37474f', metalness: 0.7, roughness: 0.3 }));
  ch.position.set(0, -3.4, 0.3);
  club.add(stick, ch);
  club.position.y = -1.8;
  rig.armR.add(club);
  rig.root.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
  rig.root.scale.setScalar(0.62);
  scene.add(rig.root);
  placeRig();
}
function placeRig() {
  if (!rig) return;
  const next = map.stops.find((st: any) => st.y > sim.y - R + 1);
  rigFace = next ? Math.sign(((next.x0 + next.x1) / 2) - sim.x) || 1 : 1;
  rig.root.position.set(sim.x - rigFace * 1.3, sim.y - R, -1.2);
  rig.root.rotation.y = rigFace > 0 ? Math.PI / 2 : -Math.PI / 2;
  rig.root.visible = true;
}

// ---------- particles ----------
let bits: { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: number }[] = [];
const BIT = new THREE.BoxGeometry(1, 1, 1);
const bitMats = new Map<string, THREE.Material>();
function poof(x: number, y: number, color = '#ffffff', n = 10, speed = 7, z = 0) {
  if (reduced) return;
  if (!bitMats.has(color)) bitMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 }));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(BIT, bitMats.get(color));
    m.scale.setScalar(0.15 + Math.random() * 0.3);
    m.position.set(x, y, z);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    bits.push({ m, v: new THREE.Vector3(Math.cos(a) * speed * Math.random(), 2 + Math.random() * speed, (Math.random() - 0.5) * speed), life: 0.5 + Math.random() * 0.6, spin: Math.random() * 9 });
  }
}
const burst = (x: number, y: number) => ['#ff5fa2', '#ffd23f', '#3ecf8e', '#5ee7ff', '#b388ff'].forEach((c) => poof(x, y, c, 12, 13));

// ---------- sound ----------
const sound = synth('gf-muted');
function sfx(kind: string, k = 1) {
  if (kind === 'shoot') { sound.noise(0.14, 0.18 * k + 0.05, 2600, 0, 0.7, 'highpass'); sound.note(380, 720 + 400 * k, 0.09, 'triangle', 0.05); }
  if (kind === 'hit') { sound.noise(0.07, Math.min(0.32, k / 110), 700, 0, 1.2); sound.note(210, 120, 0.07, 'sine', Math.min(0.1, k / 300)); }
  if (kind === 'fall') sound.note(950, 110, 1.8, 'sine', 0.07);
  if (kind === 'burn') { sound.noise(0.6, 0.25, 3200, 0, 0.6, 'highpass'); sound.note(300, 80, 0.5, 'sawtooth', 0.04); }
  if (kind === 'angel') { [262, 330, 392, 523, 659].forEach((f, i) => { sound.note(f, f * 1.003, 3.2, 'sine', 0.035, i * 0.18); sound.note(f * 2, f * 2.006, 2.6, 'triangle', 0.012, 0.3 + i * 0.18); }); [1568, 2093, 2637].forEach((f, i) => sound.note(f, f, 0.6, 'sine', 0.02, 0.9 + i * 0.25)); }
  if (kind === 'bell') [1047, 1319, 1568, 2093].forEach((f, i) => sound.note(f, f, 1.2, 'sine', 0.04, i * 0.07));
  if (kind === 'hole') { sound.note(1500, 1500, 0.12, 'sine', 0.08); sound.note(1100, 1100, 0.12, 'sine', 0.06, 0.1); [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => sound.note(f, f, 0.22, 'square', 0.045, 0.3 + i * 0.12)); }
  if (kind === 'tick') sound.note(440, 440, 0.12, 'square', 0.05);
  if (kind === 'go') sound.note(880, 880, 0.35, 'square', 0.06);
  if (kind === 'oof') { sound.note(260, 150, 0.25, 'square', 0.06); sound.note(200, 110, 0.3, 'square', 0.05, 0.12); }
}
$('gf-mute').onclick = () => { $('gf-mute').textContent = sound.toggle() ? '🔇' : '🔊'; };
$('gf-mute').textContent = sound.muted ? '🔇' : '🔊';

// ---------- game state ----------
type State = 'menu' | 'intro' | 'play' | 'angel' | 'won';
let state: State = 'menu';
let mi = 0;
let sim = makeSim(0, '');
let nonce = '', ranked = false;
let shots: [number, number, number][] = [];
let t0 = 0, endMs = 0;
let timeScale = 1, slowUntil = 0, acc = 0, T = 0;
let dist = 40, zoomOut = false;
let lastRestY = 0, falls = 0;
const prev = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 10, 60), camLook = new THREE.Vector3();
let intro: { t: number; asked: boolean } | null = null;

function show(id: string | null) {
  for (const s of ['gf-menu', 'gf-summary']) $(s).hidden = s !== id;
  const playing = id === null;
  $('gf-tools').hidden = !playing; $('gf-hud').hidden = !playing; $('gf-meter').hidden = !playing;
}
function banner(title: string, sub = '', ms = 2600) {
  const b = $('gf-banner');
  b.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  b.style.animationDuration = `${ms}ms`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
function flash(color: string) {
  const f = $('gf-flash');
  f.style.background = color;
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
const view = $('gf-view');
const elapsed = () => (state === 'won' ? endMs : t0 ? performance.now() - t0 : 0);
const saveRun = () => { if (t0 && state !== 'won') write('run', { mi, nonce, ranked, shots, falls, ms: elapsed() }); };

async function startMap(i: number, resume?: { nonce: string; ranked: boolean; shots: [number, number, number][]; ms: number; falls?: number }) {
  mi = i;
  buildWorld(i);
  show(null);
  shots = resume?.shots ?? [];
  falls = resume?.falls ?? 0;
  ball.visible = true;
  $('gf-shots').textContent = `${shots.length} shot${shots.length === 1 ? '' : 's'}`;
  nonce = resume?.nonce ?? '';
  ranked = resume?.ranked ?? false;
  sim = makeSim(i, nonce);
  for (const [t, a, b] of shots) { while (!sim.rest && sim.tick < t) sim.step(); sim.shoot(a / 100, b / 100); } // fast-forward a saved climb
  while (!sim.rest) sim.step();
  lastRestY = sim.y;
  ball.position.set(sim.x, sim.y, 0);
  trailReset();
  if (!rig) makeRig(); else placeRig();
  $('gf-map').textContent = `${MAPS[i].emoji} ${MAPS[i].name}`;
  zoomOut = false; dist = 40;
  if (resume) {
    t0 = performance.now() - resume.ms;
    state = 'play';
    banner('Welcome back! 💪', 'Your climb continues');
    return;
  }
  // intro: the camera starts at the flag and flies down the whole mountain to your ball
  t0 = 0;
  state = 'intro';
  intro = { t: 0, asked: false };
  banner(`${MAPS[i].emoji} ${MAPS[i].name}`, `Get the ball to the flag · ${map.stops.length - 1} ledges`, 3000);
}
// The speedrun clock and the luck of the angel come from the server (asked right at GO), so the ranking can trust them.
async function begin() {
  const p = saved() ?? (await loadProfile(true));
  nonce = 'local-' + Math.random().toString(36).slice(2, 10);
  ranked = false;
  try {
    const res = await fetch('/api/golf/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(saved() ?? p), mi }) });
    if (res.ok) { nonce = (await res.json()).nonce; ranked = true; }
  } catch {}
  sim = makeSim(mi, nonce);
  if (state === 'intro') go();
}
function go() {
  intro = null;
  state = 'play';
  t0 = performance.now();
  banner('GO! ⛳', ranked ? 'Speedrun clock is running' : 'Practice run (offline: no ranking)', 1600);
  sfx('go');
  saveRun();
}

// ---------- aiming (drag back like a slingshot, anywhere on screen) ----------
let aim: { id: number; x: number; y: number; dx: number; dy: number; p: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state === 'intro' && intro) { intro.t = 99; return; } // tap skips the fly-over
  if (state !== 'play' || !sim.canHit() || e.button > 0) return; // from rest, or again in the air while the ball is white
  aim = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, p: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!aim || e.pointerId !== aim.id) return;
  const rc = canvas.getBoundingClientRect();
  const full = Math.min(rc.width, rc.height) * 0.34;
  aim.dx = -(e.clientX - aim.x); aim.dy = e.clientY - aim.y;
  aim.p = Math.min(1, Math.hypot(aim.dx, aim.dy) / full);
});
const release = (e: PointerEvent) => {
  if (!aim || e.pointerId !== aim.id) return;
  const a = aim;
  aim = null;
  if (a.p < 0.05 || state !== 'play' || !sim.canHit()) return; // a tiny drag cancels
  shoot(shotFrom(a.dx, a.dy, a.p), a.p);
};
addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => (aim = null));
addEventListener('keydown', (e) => { if (e.key === 'Escape') aim = null; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); aim = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(22, Math.min(130, dist * (1 + Math.sign(e.deltaY) * 0.12))); }, { passive: false });
$('gf-zoom').onclick = () => { zoomOut = !zoomOut; dist = zoomOut ? 110 : 40; $('gf-zoom').textContent = zoomOut ? '🔍' : '🔭'; };

function shoot(v: [number, number], power: number) {
  const fromRest = sim.rest, tick = sim.tick;
  if (!sim.shoot(v[0] / 100, v[1] / 100)) return;
  shots.push([tick, v[0], v[1]]);
  if (fromRest) { lastRestY = sim.y; swing = 1; }
  else { // an air hit: a shockwave ring where the ball was struck
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 40), holy('#ffffff', 0.9));
    ring.position.set(sim.x, sim.y, 0.3);
    scene.add(ring);
    animated.push({ o: ring, kind: 'shock', t: 0 });
    poof(sim.x, sim.y, '#ffffff', 8, 6);
  }
  sfx('shoot', power);
  $('gf-shots').textContent = `${shots.length} shot${shots.length === 1 ? '' : 's'}`;
  saveRun();
}

// ---------- sim events ----------
function onEvent(ev: string | null) {
  if (sim.impact > 7) { sfx('hit', sim.impact); if (sim.impact > 25) poof(sim.x, sim.y - R, MAPS[mi].cols[0], 5, 4); }
  if (!ev) return;
  if (ev === 'rest') {
    const drop = lastRestY - sim.y;
    if (drop > 10) {
      sfx('oof');
      banner(FALL_QUOTES[Math.floor(Math.random() * FALL_QUOTES.length)], `📉 −${Math.round(drop)} studs`, 3000);
    }
    timeScale = 1; view.classList.remove('cine');
    placeRig();
    poof(sim.x - rigFace * 1.3, sim.y - R + 0.5, '#ffffff', 8, 4, -1.2);
    saveRun();
  }
  if (ev === 'fall') {
    falls++;
    sfx('fall');
    view.classList.add('cine');
    timeScale = reduced ? 1 : 0.32;
    slowUntil = T + (sim.angelAt > 0 ? 99 : 1.3);
  }
  if (ev === 'burn') {
    sfx('burn');
    flash('#ff5a1f');
    poof(prev.x, prev.y, '#ff6d00', 18, 9);
    poof(prev.x, prev.y, '#333333', 10, 5);
    banner('🔥 Too hot!', 'Back to your last spot');
    placeRig();
    saveRun();
  }
  if (ev === 'angel') startAngel();
  if (ev === 'hole') win();
}

// ---------- the guardian angel ----------
let angelRun: { g: THREE.Group; pillar: THREE.Group; t: number; from: THREE.Vector3; to: THREE.Vector3; landed: boolean } | null = null;
function startAngel() {
  state = 'angel';
  timeScale = 1;
  const g = makeAngel(), pillar = makePillar();
  g.scale.setScalar(0.75);
  const from = prev.clone(), to = new THREE.Vector3(sim.x, sim.y, 0);
  g.position.set(from.x, from.y + 50, 0.5);
  pillar.position.set(from.x, from.y - 6, -0.5);
  scene.add(g, pillar);
  angelRun = { g, pillar, t: 0, from, to, landed: false };
  view.classList.add('divine');
  banner('😇 Divine rescue!', 'An angel caught your ball ✨', 3800);
  sfx('angel');
  write('angels', (read('angels') ?? 0) + 1);
}
function stepAngel(dt: number) {
  const a = angelRun!;
  a.t += dt;
  const t = a.t, u = a.g.userData, P = a.pillar;
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const open = Math.min(1, Math.max(0, (t - 0.5) / 0.8));
  const flap = Math.sin(t * (t < 1.7 ? 5 : 9)) * 0.45 * open;
  u.wings[0].rotation.y = flap - (1 - open) * 1.2;
  u.wings[1].rotation.y = -flap + (1 - open) * 1.2;
  u.wings.forEach((w: THREE.Group) => w.scale.setScalar(0.3 + 0.7 * open));
  u.halo.rotation.z += dt * 3;
  u.glow.material.opacity = 0.7 + Math.sin(t * 6) * 0.3;
  u.light.intensity = Math.min(30, t * 30);
  const width = t < 0.6 ? ease(t / 0.6) : t > 4.2 ? Math.max(0.01, 1 - (t - 4.2) / 0.8) : 1 + Math.sin(t * 4) * 0.06;
  P.scale.set(width, 1, width);
  P.userData.rays.rotation.y += dt * 0.8;
  const hand = (x: number, y: number) => ball.position.set(x, y + 0.4, 0.9);
  if (t < 0.7) { ball.position.copy(a.from).setY(a.from.y + Math.sin(t * 3) * 0.15); a.g.position.set(a.from.x, a.from.y + 50 - t * 18, 0.5); }
  else if (t < 1.7) { const k = ease((t - 0.7) / 1); a.g.position.set(a.from.x, a.from.y + 38 * (1 - k) + 1.2, 0.5); if (k > 0.95) hand(a.from.x, a.from.y); }
  else if (t < 3.9) {
    const k = ease((t - 1.7) / 2.2), top = Math.max(a.from.y, a.to.y) + 8;
    const x = a.from.x + (a.to.x - a.from.x) * k;
    const y = (1 - k) ** 2 * a.from.y + 2 * (1 - k) * k * top + k * k * a.to.y;
    a.g.position.set(x, y + 1.2, 0.5);
    a.g.rotation.y = a.to.x > a.from.x ? 0.5 : -0.5;
    P.position.set(x, y - 6, -0.5);
    hand(x, y);
    if (Math.random() < 0.7) poof(x - (a.to.x > a.from.x ? 1.5 : -1.5), y + 2, ['#fff3a0', '#ffffff', '#ffd23f'][Math.floor(Math.random() * 3)], 1, 2);
  } else {
    if (!a.landed) {
      a.landed = true;
      ball.position.set(a.to.x, a.to.y, 0);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.8, 40), holy('#fff0b3', 0.9));
      ring.position.set(a.to.x, a.to.y - R + 0.1, 0);
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      animated.push({ o: ring, kind: 'shock', t: 0 });
      burst(a.to.x, a.to.y + 1);
      sfx('bell');
      placeRig();
      view.classList.remove('divine', 'cine');
      state = 'play';
      saveRun();
    }
    a.g.position.y += dt * (8 + (t - 3.9) * 30);
    u.light.intensity = Math.max(0, 30 - (t - 3.9) * 40);
  }
  if (t > 5) { scene.remove(a.g, a.pillar); disposeAll(a.g); disposeAll(a.pillar); angelRun = null; }
}

// ---------- finish + ranking ----------
async function win() {
  state = 'won';
  endMs = performance.now() - t0;
  ball.visible = false; // dropped in the cup
  sfx('hole');
  burst(map.cup.x, map.cup.y + 1.5);
  setTimeout(() => burst(map.cup.x, map.cup.y + 3), 350);
  banner('⛳ HOLE!', fmt(endMs), 2400);
  write('run', null);
  const done = new Set<number>(read('done') ?? []);
  done.add(mi);
  write('done', [...done]);
  const bests = read('best') ?? {};
  const pb = !bests[mi] || endMs < bests[mi];
  if (pb) { bests[mi] = Math.round(endMs); write('best', bests); }
  let res: any = null;
  if (ranked) {
    try {
      const r = await fetch('/api/golf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...saved(), mi, shots }) });
      res = r.ok ? await r.json() : { error: (await r.json().catch(() => ({}))).error ?? 'Run not accepted' };
    } catch { res = { error: 'Ranking offline' }; }
  }
  setTimeout(() => {
    show('gf-summary');
    const rankLine = res?.rank ? `<p>🏆 You are <b>#${res.rank}</b> on ${MAPS[mi].name}!${res.ms > Math.round(endMs) + 1500 ? ` <small class="muted">(server time ${fmt(res.ms)})</small>` : ''}</p>` : res?.error ? `<p class="small muted">${res.error}</p>` : ranked ? '' : '<p class="small muted">Practice run: play online to enter the ranking.</p>';
    $('gf-sum').innerHTML = `<h2>${MAPS[mi].emoji} ${MAPS[mi].name} cleared!</h2><div class="gf-big">${fmt(endMs)}</div><p>⛳ ${shots.length} shots · ${falls ? `📉 ${falls} fall${falls > 1 ? 's' : ''}` : '🧘 no falls!'}${sim.angels ? ` · 😇 ${sim.angels} angel${sim.angels > 1 ? 's' : ''}` : ''}</p>${pb ? '<p>🎉 New personal best!</p>' : `<p class="small muted">Your best: ${fmt(bests[mi])}</p>`}${rankLine}`;
    ($('gf-next') as HTMLButtonElement).hidden = mi >= MAPS.length - 1;
    loadTop(mi, $('gf-top2'));
  }, 1800);
}
async function loadTop(i: number, el: HTMLElement) {
  try {
    const d = await fetch(`/api/golf/top?m=${i}`).then((r) => r.json());
    const me = saved()?.id;
    el.innerHTML = d.top?.length
      ? d.top.slice(0, 10).map((p: any, k: number) => `<li class="${p.id === me ? 'me' : ''}"><b>${['🥇', '🥈', '🥉'][k] ?? k + 1}</b>${avatarSVG(p.avatar, 30)}<span>${p.name} <small class="muted">${p.shots} shots</small></span><em>⏱️ ${fmt(p.ms)}</em></li>`).join('')
      : '<li class="muted">Nobody has climbed this one yet. Be the first! 🚀</li>';
  } catch { el.innerHTML = '<li class="muted">Ranking offline</li>'; }
}

// ---------- menu ----------
function menu() {
  state = 'menu';
  aim = null;
  if (rig) rig.root.visible = false;
  ball.visible = true;
  show('gf-menu');
  const done = new Set<number>(read('done') ?? []), bests = read('best') ?? {};
  $('gf-maps').innerHTML = MAPS.map((m, i) => {
    const open = i === 0 || done.has(i - 1) || done.has(i);
    return `<button class="gf-mapbtn ${done.has(i) ? 'done' : ''}" data-map="${i}" type="button" style="--a:${m.sky[0]};--b:${m.cols[0]}" ${open ? '' : 'disabled'}><i>${open ? m.emoji : '🔒'}</i><b>${i + 1}. ${m.name}</b><small>${getMap(i)!.stops.length - 1} ledges${bests[i] ? ` · ⏱️ ${fmt(bests[i])}` : ''}</small></button>`;
  }).join('');
  for (const b of document.querySelectorAll<HTMLElement>('[data-map]')) b.onclick = () => { write('run', null); startMap(+b.dataset.map!); };
  const run = read('run');
  $('gf-continue').hidden = !run || !MAPS[run.mi];
  if (run && MAPS[run.mi]) {
    $('gf-continue').innerHTML = `<button class="btn gold" id="gf-cont" type="button">▶️ Continue your climb on ${MAPS[run.mi].emoji} ${MAPS[run.mi].name} (${fmt(run.ms)})</button>${run.ranked ? '<p class="small muted" style="margin:6px 0 0">The ranked clock kept running on the server. Restart the map for a clean speedrun.</p>' : ''}`;
    $('gf-cont').onclick = () => startMap(run.mi, run);
  }
  const sel = $('gf-board-map') as HTMLSelectElement;
  sel.value = String(Math.min(MAPS.length - 1, Math.max(0, ...[...done].map((d) => d))));
  loadTop(+sel.value, $('gf-top'));
  menuMap();
}
function menuMap() { buildWorld(+($('gf-board-map') as HTMLSelectElement).value); }
($('gf-board-map') as HTMLSelectElement).onchange = (e) => { loadTop(+(e.target as HTMLSelectElement).value, $('gf-top')); menuMap(); };
$('gf-menu-btn').onclick = () => { saveRun(); menu(); };
$('gf-back').onclick = menu;
$('gf-restart').onclick = () => { if (confirm('Restart this mountain from the bottom?')) { write('run', null); startMap(mi); } };
$('gf-again').onclick = () => { ball.visible = true; startMap(mi); };
$('gf-next').onclick = () => { ball.visible = true; startMap(mi + 1); };

// ---------- camera + render loop ----------
function resize() {
  const rc = canvas.getBoundingClientRect();
  renderer.setSize(rc.width, rc.height, false);
  composer?.setSize(rc.width, rc.height);
  camera.aspect = rc.width / Math.max(1, rc.height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
fullscreenButton($('gf-fs'), box, () => requestAnimationFrame(resize));

function trailReset() {
  const a = trailGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < TRAIL; i++) a.setXYZ(i, sim.x, sim.y, 0);
  a.needsUpdate = true;
}
const clock = new THREE.Clock();
function frame() {
  const rdt = Math.min(0.05, clock.getDelta());
  T += rdt;
  // sim at 120 Hz (slow motion while falling)
  if (state === 'play' && !sim.rest) {
    if (aim && sim.canHit()) timeScale += (0.22 - timeScale) * Math.min(1, rdt * 10); // bullet time while you aim an air hit
    else if (T > slowUntil && sim.angelAt < 0) { timeScale += (1 - timeScale) * Math.min(1, rdt * 3); if (timeScale > 0.97) { timeScale = 1; view.classList.remove('cine'); } }
    acc += rdt * timeScale * 120;
    while (acc >= 1 && !sim.rest) {
      acc -= 1;
      prev.set(sim.x, sim.y, 0);
      onEvent(sim.step());
      if (state !== 'play') break;
    }
  } else acc = 0;
  if (state === 'angel' || angelRun) { if (angelRun) stepAngel(rdt); }
  else if (state !== 'won') ball.position.set(sim.x, sim.y, 0);
  ball.rotation.z -= (sim.rest ? 0 : (sim.vx * rdt * timeScale) / R);
  // like the original: a white ball can be hit, a black one can't (it touched something and is still moving)
  const hot = sim.canHit() && state === 'play';
  ballMat.color.lerp(tmpC.set(hot ? '#ffffff' : '#1d1d24'), Math.min(1, rdt * 14));
  ballMat.emissive.set(hot && !sim.rest ? '#9fd8ff' : '#000000');
  ballMat.emissiveIntensity = hot && !sim.rest ? 0.9 + Math.sin(T * 12) * 0.3 : 0;
  view.classList.toggle('bullet', !!aim && !sim.rest);
  $('gf-state').textContent = state !== 'play' ? '' : hot ? (sim.rest ? '⚪ Ready' : `⚪ Hit it in the air! (${2 - sim.airHits} left)`) : '⚫ Wait…';
  // trail
  const tp = trailGeo.attributes.position as THREE.BufferAttribute;
  for (let i = TRAIL - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), 0);
  tp.setXYZ(0, ball.position.x, ball.position.y, 0);
  tp.needsUpdate = true;
  trail.visible = state === 'play' && !sim.rest;
  // ready ring + aim arrow
  ready.visible = state === 'play' && sim.canHit() && !aim;
  ready.position.set(ball.position.x, ball.position.y, 0.8);
  ready.scale.setScalar(1 + Math.sin(T * 4) * 0.12);
  arrow.visible = !!aim && aim.p >= 0.05;
  const pw = $('gf-power');
  pw.hidden = !arrow.visible;
  if (aim && arrow.visible) {
    const ang = Math.atan2(aim.dy, aim.dx), L = 1.5 + aim.p * 7;
    arrow.position.set(ball.position.x, ball.position.y, 1);
    arrow.rotation.z = ang - Math.PI / 2;
    shaft.scale.y = L; shaft.position.y = L / 2 + 0.8;
    head.position.y = L + 1.4;
    arrowMat.color.setHSL((1 - aim.p) * 0.33, 0.9, 0.55);
    const sp = ball.position.clone().project(camera), rc = canvas.getBoundingClientRect();
    pw.style.left = `${((sp.x + 1) / 2) * rc.width}px`;
    pw.style.top = `${((1 - sp.y) / 2) * rc.height}px`;
    pw.textContent = `${Math.round(aim.p * 100)}%`;
    if (rig && sim.rest) { rigFace = Math.sign(aim.dx) || rigFace; rig.root.rotation.y = rigFace > 0 ? Math.PI / 2 : -Math.PI / 2; rig.root.position.x = sim.x - rigFace * 1.3; }
  }
  // avatar: idle, wind-up while aiming, swing on shot
  if (rig && rig.root.visible) {
    animateRig(rig, T, 0, false);
    swing = Math.max(0, swing - rdt * 2.5);
    rig.armR.rotation.x = aim ? -0.4 - aim.p * 1.6 : swing > 0 ? 1.4 * Math.sin(swing * Math.PI) : 0;
    rig.armL.rotation.x = rig.armR.rotation.x * 0.8;
  }
  // world animation
  for (let i = animated.length - 1; i >= 0; i--) {
    const a = animated[i];
    if (a.kind === 'lava') ((a.o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + Math.sin(T * 5) * 0.6;
    if (a.kind === 'cloud') a.o.position.x = a.base! + Math.sin(T * 0.05 + a.t!) * 30;
    if (a.kind === 'ring') { a.o.rotation.z += rdt; a.o.scale.setScalar(1 + Math.sin(T * 3) * 0.08); }
    if (a.kind === 'bounce') ((a.o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + Math.sin(T * 6) * 0.25;
    if (a.kind === 'shock') {
      a.t! += rdt;
      a.o.scale.setScalar(1 + a.t! * 14);
      ((a.o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - a.t! * 1.1);
      if (a.t! > 0.9) { scene.remove(a.o); disposeAll(a.o); animated.splice(i, 1); }
    }
  }
  sceneryTick?.(T, rdt, camLook);
  if (flag) { // waving flag
    const pos = (flag.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute, base = flag.userData.base;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(base[i * 3] * 1.6 - T * 6) * 0.3 * (base[i * 3] / 3.2));
    pos.needsUpdate = true;
  }
  bits = bits.filter((b) => {
    b.life -= rdt;
    b.v.y -= 30 * rdt;
    b.m.position.addScaledVector(b.v, rdt);
    b.m.rotation.x += b.spin * rdt;
    b.m.scale.multiplyScalar(1 - rdt * 1.4);
    if (b.life <= 0) scene.remove(b.m);
    return b.life > 0;
  });
  // camera
  let tx = sim.x, ty = sim.y + 3, d = dist;
  if (state === 'menu') {
    const k = (Math.sin(T * 0.12) + 1) / 2;
    tx = map.W / 2; ty = 10 + k * (map.cup.y - 10); d = 70;
  } else if (state === 'intro' && intro) {
    intro.t += rdt;
    const k = Math.min(1, intro.t / 3.2), e = k * k * (3 - 2 * k);
    tx = map.cup.x + (sim.x - map.cup.x) * e; ty = map.cup.y + 4 + (sim.y + 3 - map.cup.y - 4) * e; d = 75 - 35 * e;
    if (k >= 1 && !intro.asked) { intro.asked = true; begin(); }
  } else if (angelRun) { tx = ball.position.x; ty = ball.position.y + 3; d = Math.max(dist, 48); }
  else if (state === 'won') { tx = map.cup.x; ty = map.cup.y + 3; d = 30; }
  else if (view.classList.contains('cine')) d = Math.max(dist, 58);
  if (state === 'play' && sim.rest && !zoomOut) { // look a bit towards the next ledge
    const next = map.stops.find((st: any) => st.y > sim.y - R + 1);
    if (next) { tx += (((next.x0 + next.x1) / 2) - sim.x) * 0.3; ty += (next.y - sim.y) * 0.35; }
  }
  if (zoomOut && state === 'play') tx = map.W / 2;
  const k = Math.min(1, rdt * (state === 'intro' ? 20 : 4));
  camPos.lerp(new THREE.Vector3(tx, ty + d * 0.03, d), k);
  camLook.lerp(new THREE.Vector3(tx, ty, 0), k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sun.position.set(camLook.x + 30, camLook.y + 60, 50);
  sun.target.position.copy(camLook);
  // HUD
  if (state === 'play' || state === 'angel' || state === 'won') {
    $('gf-time').textContent = fmt(elapsed());
    const prog = Math.max(0, Math.min(1, sim.bestY / map.cup.y)), now = Math.max(0, Math.min(1, sim.y / map.cup.y));
    ($('gf-meter-fill') as HTMLElement).style.height = `${prog * 100}%`;
    ($('gf-meter-me') as HTMLElement).style.bottom = `${now * 100}%`;
    $('gf-sub').textContent = `⛳ ${Math.round(prog * 100)}% · ⬆ ${Math.round(sim.y)} studs`;
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
menu();
frame();
