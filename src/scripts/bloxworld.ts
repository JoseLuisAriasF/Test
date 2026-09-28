// Blox World: GeoGuessr inside a generated Roblox-style island. Walk around with your own avatar,
// then pin where you think you are on the map. Seeded worlds => daily world and challenge links.
import * as THREE from 'three';
import { makeWorld, groundAt, blocked, toMap, fromMap, HALF, WALK_SPEED } from '../lib/world.js';
import { bloxScore, rankFor } from '../lib/geo.js';
import { buildAvatar, animateRig, type Rig } from './avatar3d.ts';
import { loadProfile } from './profile.ts';

const $ = (id: string) => document.getElementById(id)!;
const ROUNDS = 5;
const EXPLORE_TIME = 75;
const GUESS_TIME = 12; // extra seconds on the map when exploring time runs out
const GRAVITY = 196.2; // Roblox workspace gravity (studs/s²)
const JUMP = 50; // Roblox JumpPower
const day = Math.floor(Date.now() / 864e5);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('bw-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('bw-' + k, JSON.stringify(v)); } catch {} };

// ---------- renderer ----------
const canvas = $('bw-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
let quality = touch ? 1.25 : 1.75;
renderer.setPixelRatio(Math.min(devicePixelRatio, quality));
renderer.shadowMap.enabled = !touch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const sky = document.createElement('canvas');
sky.width = 2; sky.height = 256;
const sg = sky.getContext('2d')!;
const grad = sg.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#4aa3ff'); grad.addColorStop(0.6, '#9fdcff'); grad.addColorStop(1, '#e8f7ff');
sg.fillStyle = grad; sg.fillRect(0, 0, 2, 256);
const skyTex = new THREE.CanvasTexture(sky);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog('#bfe7ff', 140, 460);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1200);
scene.add(new THREE.HemisphereLight('#e6f6ff', '#5d7f45', 1.15));
const sun = new THREE.DirectionalLight('#fff3d6', 1.5);
sun.position.set(60, 120, 40);
sun.castShadow = !touch;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
scene.add(sun, sun.target);

const GEO: Record<string, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  cone: new THREE.ConeGeometry(0.5, 1, 18),
  pyr: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  sph: new THREE.SphereGeometry(0.5, 18, 14),
  dome: new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2),
};
const mats = new Map<string, THREE.Material>();
const material = (c: string, e?: string, water = false) => {
  const k = `${c}|${e ?? ''}|${water}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e ?? '#000000', emissiveIntensity: e ? 0.55 : 0, transparent: water, opacity: water ? 0.82 : 1 }));
  return mats.get(k)!;
};

type Anim = { obj: THREE.Object3D; a: string; y: number; mat?: THREE.MeshLambertMaterial; phase: number };
let worldGroup: THREE.Group | null = null;
let anims: Anim[] = [];
let clouds: THREE.Group[] = [];
let world: any = null;

function placeMatrix(p: any, m: THREE.Matrix4) {
  const pos = new THREE.Vector3(p.x, p.y + p.h / 2, p.z);
  const scale = new THREE.Vector3(p.w, p.h, p.d);
  if (p.s === 'dome') { pos.y = p.y; scale.y = p.h * 2; }
  if (p.s === 'disc') { pos.y = p.y + p.d / 2; scale.set(p.w, p.d, p.h); }
  m.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry ?? 0, 0)), scale);
}

function buildWorld(w: any) {
  if (worldGroup) scene.remove(worldGroup);
  anims = [];
  const g = new THREE.Group();
  // island, beach and ocean
  const island = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 16, 2, HALF * 2 + 16), material('#6cc24a'));
  island.position.y = -1;
  island.receiveShadow = true;
  const beach = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 70, 1.6, HALF * 2 + 70), material('#f3dfa2'));
  beach.position.y = -1.25;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), material('#2f8fe0', '#0b3d6b', true));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -1.4;
  g.add(island, beach, ocean);
  anims.push({ obj: ocean, a: 'ocean', y: -1.4, mat: ocean.material as THREE.MeshLambertMaterial, phase: 0 });

  // static parts -> one InstancedMesh per (shape, color); animated parts -> their own meshes
  const groups = new Map<string, any[]>();
  const m = new THREE.Matrix4();
  for (const p of w.parts) {
    if (p.a || p.s === 'blades') {
      let obj: THREE.Object3D;
      if (p.s === 'blades') {
        obj = new THREE.Group();
        for (const rot of [0, Math.PI / 2]) {
          const b = new THREE.Mesh(GEO.box, material(p.c));
          b.scale.set(p.w, 1.6, 0.4);
          b.rotation.z = rot;
          (obj as THREE.Group).add(b);
        }
        obj.position.set(p.x, p.y, p.z);
      } else {
        const mesh = new THREE.Mesh(GEO[p.s] ?? GEO.box, p.a === 'lava' || p.a === 'blink' ? material(p.c, p.e).clone() : material(p.c, p.e, p.a === 'water'));
        placeMatrix(p, m);
        m.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.castShadow = !touch;
        obj = mesh;
      }
      g.add(obj);
      anims.push({ obj, a: p.a ?? 'spin', y: obj.position.y, mat: (obj as THREE.Mesh).material as THREE.MeshLambertMaterial, phase: Math.random() * 6 });
      continue;
    }
    const k = `${p.s}|${p.c}|${p.e ?? ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  for (const [k, list] of groups) {
    const [s, c, e] = k.split('|');
    const inst = new THREE.InstancedMesh(GEO[s] ?? GEO.box, material(c, e || undefined), list.length);
    list.forEach((p: any, i: number) => { placeMatrix(p, m); inst.setMatrixAt(i, m); });
    inst.castShadow = !touch;
    inst.receiveShadow = true;
    g.add(inst);
  }
  // clouds
  clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(GEO.box, material('#ffffff'));
      b.scale.set(14 + Math.random() * 10, 5 + Math.random() * 3, 10 + Math.random() * 8);
      b.position.set(k * 9 - 9, Math.random() * 3, Math.random() * 6);
      c.add(b);
    }
    c.position.set(-HALF - 100 + Math.random() * (HALF * 2 + 200), 95 + Math.random() * 35, -HALF - 60 + Math.random() * (HALF * 2 + 120));
    g.add(c);
    clouds.push(c);
  }
  worldGroup = g;
  scene.add(g);
}

// ---------- player ----------
let rig: Rig | null = null;
const player = { x: 0, z: 0, feet: 0, vy: 0, onGround: true, face: 0, speed01: 0 };
let camYaw = 0, camPitch = 0.42, camDist = 16;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camFly: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t: number } | null = null;

// ---------- input ----------
const keys = new Set<string>();
let joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
let jumpQueued = false;
addEventListener('keydown', (e) => {
  if (state !== 'explore') return;
  keys.add(e.code);
  if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
  if (e.code === 'KeyM') openMap();
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let drag: { id: number; x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'explore') return;
  const r = canvas.getBoundingClientRect();
  if (e.pointerType === 'touch' && e.clientX - r.left < r.width * 0.45 && e.clientY - r.top > r.height * 0.35 && joy.id < 0) {
    joy = { x: 0, y: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY };
    const base = $('bw-joy');
    base.hidden = false;
    base.style.left = `${e.clientX - r.left}px`;
    base.style.top = `${e.clientY - r.top}px`;
  } else drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy, len = Math.min(1, Math.hypot(dx, dy) / 50);
    const a = Math.atan2(dy, dx);
    joy.x = Math.cos(a) * len; joy.y = Math.sin(a) * len;
    ($('bw-knob') as HTMLElement).style.transform = `translate(${joy.x * 34}px, ${joy.y * 34}px)`;
  } else if (drag && e.pointerId === drag.id) {
    camYaw -= (e.clientX - drag.x) * 0.006;
    camPitch = Math.min(1.35, Math.max(0.08, camPitch + (e.clientY - drag.y) * 0.004));
    drag.x = e.clientX; drag.y = e.clientY;
  }
});
const endPointer = (e: PointerEvent) => {
  if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 }; $('bw-joy').hidden = true; ($('bw-knob') as HTMLElement).style.transform = ''; }
  if (drag?.id === e.pointerId) drag = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { camDist = Math.min(34, Math.max(7, camDist + e.deltaY * 0.02)); e.preventDefault(); }, { passive: false });
$('bw-jump').addEventListener('pointerdown', (e) => { jumpQueued = true; e.preventDefault(); });

// ---------- game state ----------
type State = 'menu' | 'drop' | 'explore' | 'map' | 'reveal' | 'summary';
let state: State = 'menu';
let seed = '';
let mode = 'random';
let round = 0;
let score = 0;
let timeLeft = EXPLORE_TIME;
let guessLeft = 0;
let pin: { u: number; v: number } | null = null;
let results: { dist: number; pts: number; zone: string }[] = [];
let beams: THREE.Object3D[] = [];
const params = new URLSearchParams(location.search);

function show(id: string | null) {
  for (const s of ['bw-menu', 'bw-hud', 'bw-map', 'bw-summary']) $(s).hidden = s !== id && !(id === 'bw-map' && s === 'bw-hud');
}

async function startGame(m: string, s?: string) {
  mode = m;
  seed = s ?? (m === 'daily' ? `d${day}` : Math.random().toString(36).slice(2, 8));
  world = makeWorld(seed);
  buildWorld(world);
  if (!rig) {
    const profile = await loadProfile(false);
    rig = await buildAvatar(profile?.avatar);
    scene.add(rig.root);
  }
  round = 0; score = 0; results = [];
  $('bw-score').textContent = '0';
  $('bw-seed').textContent = mode === 'daily' ? `📅 Daily world #${day - 20722}` : `🌍 World ${seed.toUpperCase()}`;
  nextRound();
}

function nextRound() {
  for (const b of beams) scene.remove(b);
  beams = [];
  const sp = world.spawns[round % world.spawns.length];
  Object.assign(player, { x: sp.x, z: sp.z, feet: 45, vy: 0, onGround: false });
  camYaw = Math.random() * Math.PI * 2;
  camPitch = 0.42;
  camFly = null;
  pin = null;
  timeLeft = EXPLORE_TIME;
  state = 'drop';
  show('bw-hud');
  $('bw-round').textContent = `Round ${round + 1}/${ROUNDS}`;
  banner(`Round ${round + 1}`, 'Where are you? Explore and find out! 🔎');
}

function banner(title: string, sub: string) {
  const b = $('bw-banner');
  b.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}

// ---------- map (top-down 2D) ----------
const mapCanvas = $('bw-mapcanvas') as HTMLCanvasElement;
const mctx = mapCanvas.getContext('2d')!;
let mapAnim = 0;
function drawMap(t = 0, reveal?: { gu: number; gv: number; pu: number; pv: number; k: number }) {
  const S = mapCanvas.width;
  const px = (u: number) => u * S * 0.86 + S * 0.07;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = '#2f8fe0'; mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = '#f3dfa2'; roundRect(px(-0.05), px(-0.05), px(1.05) - px(-0.05), px(1.05) - px(-0.05), S * 0.04);
  mctx.fillStyle = '#6cc24a'; roundRect(px(0), px(0), px(1) - px(0), px(1) - px(0), S * 0.03);
  for (const z of world.zones) {
    const a = toMap(z.cx - 55, z.cz - 55), b = toMap(z.cx + 55, z.cz + 55);
    mctx.fillStyle = z.ground;
    roundRect(px(a.u), px(a.v), px(b.u) - px(a.u), px(b.v) - px(a.v), S * 0.015);
    const c = toMap(z.cx, z.cz);
    mctx.textAlign = 'center';
    mctx.globalAlpha = 0.9;
    mctx.font = `${S * 0.06}px system-ui`;
    mctx.fillText(z.emoji, px(c.u), px(c.v) - S * 0.02);
    mctx.globalAlpha = 1;
    mctx.font = `600 ${S * 0.028}px Fredoka, system-ui`;
    mctx.fillStyle = ['spooky', 'volcano', 'arcade', 'jungle'].includes(z.type) ? '#fff' : '#1b1f2a';
    mctx.fillText(z.name, px(c.u), px(c.v) + S * 0.03);
  }
  mctx.font = `${S * 0.032}px system-ui`;
  for (const l of world.landmarks) {
    const p = toMap(l.x, l.z);
    mctx.fillText(l.emoji, px(p.u), px(p.v) + S * 0.012);
  }
  if (pin) drawPin(px(pin.u), px(pin.v), '#ff3b5c', t);
  if (reveal) {
    const gx = px(reveal.gu), gy = px(reveal.gv), qx = px(reveal.pu), qy = px(reveal.pv);
    mctx.strokeStyle = '#ffffff'; mctx.lineWidth = S * 0.008; mctx.setLineDash([S * 0.02, S * 0.015]);
    mctx.beginPath(); mctx.moveTo(gx, gy); mctx.lineTo(gx + (qx - gx) * reveal.k, gy + (qy - gy) * reveal.k); mctx.stroke();
    mctx.setLineDash([]);
    if (reveal.k >= 1) {
      mctx.beginPath(); mctx.fillStyle = '#3ecf8e'; mctx.arc(qx, qy, S * 0.025, 0, 7); mctx.fill();
      mctx.font = `${S * 0.04}px system-ui`; mctx.fillText('🧍', qx, qy + S * 0.014);
    }
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  mctx.beginPath(); mctx.roundRect(x, y, w, h, r); mctx.fill();
}
function drawPin(x: number, y: number, color: string, t: number) {
  const S = mapCanvas.width, bounce = Math.max(0, 1 - t) * Math.abs(Math.sin(t * 9)) * S * 0.04;
  mctx.fillStyle = color;
  mctx.beginPath(); mctx.arc(x, y - S * 0.045 - bounce, S * 0.022, Math.PI, 0); mctx.lineTo(x, y - bounce); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(x, y - S * 0.045 - bounce, S * 0.009, 0, 7); mctx.fill();
}
// The map is always the biggest square that fits its panel.
function sizeMap() {
  const box = $("bw-mapwrap").getBoundingClientRect();
  const side = Math.max(120, Math.floor(Math.min(box.width, box.height)));
  mapCanvas.style.width = mapCanvas.style.height = side + "px";
  mapCanvas.width = mapCanvas.height = Math.round(side * Math.min(devicePixelRatio, 2));
  drawMap(9);
}
addEventListener("resize", () => { if (state === "map") sizeMap(); });
function openMap() {
  if (state !== 'explore') return;
  state = 'map';
  show('bw-map');
  $('bw-mapclose').hidden = timeLeft <= 0;
  ($('bw-confirm') as HTMLButtonElement).disabled = !pin;
  $('bw-confirm').hidden = false;
  $('bw-result').hidden = true;
  sizeMap(); // layout is available right after unhiding
}
$('bw-mapbtn').onclick = openMap;
$('bw-mapclose').onclick = () => { if (state === 'map') { state = 'explore'; show('bw-hud'); } };
mapCanvas.addEventListener('pointerdown', (e) => {
  if (state !== 'map') return;
  const r = mapCanvas.getBoundingClientRect();
  const u = ((e.clientX - r.left) / r.width - 0.07) / 0.86, v = ((e.clientY - r.top) / r.height - 0.07) / 0.86;
  if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return;
  pin = { u, v };
  ($('bw-confirm') as HTMLButtonElement).disabled = false;
  const t0 = performance.now();
  cancelAnimationFrame(mapAnim);
  const tick = () => { const t = (performance.now() - t0) / 1000; drawMap(t); if (t < 1.2) mapAnim = requestAnimationFrame(tick); };
  tick();
});
$('bw-confirm').onclick = () => guess();

function guess() {
  if (state !== 'map' && state !== 'explore') return;
  state = 'reveal';
  show('bw-map');
  $('bw-mapclose').hidden = true;
  $('bw-confirm').hidden = true;
  const truth = toMap(player.x, player.z);
  const guessPin = pin; // keep a copy: the reveal animation keeps running after 'Next round' clears `pin`
  const g = guessPin ? fromMap(guessPin.u, guessPin.v) : null;
  const dist = g ? Math.hypot(g.x - player.x, g.z - player.z) : Infinity;
  const pts = g ? bloxScore(dist) : 0;
  const zone = world.zones.find((z: any) => Math.abs(player.x - z.cx) <= 60 && Math.abs(player.z - z.cz) <= 60);
  results.push({ dist, pts, zone: zone?.type ?? '' });
  // 3D: beams at the guess and at the truth, then the camera flies up to show both
  const beam = (x: number, z: number, c: string) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 220, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false }));
    b.position.set(x, 110, z);
    scene.add(b);
    beams.push(b);
  };
  beam(player.x, player.z, '#3ecf8e');
  if (g) beam(g.x, g.z, '#ff3b5c');
  const mid = g ? new THREE.Vector3((g.x + player.x) / 2, 0, (g.z + player.z) / 2) : new THREE.Vector3(player.x, 0, player.z);
  const span = g ? Math.max(40, dist) : 40;
  camFly = { from: camPos.clone(), to: new THREE.Vector3(mid.x, span * 1.3 + 30, mid.z + span * 0.55 + 20), lookFrom: camLook.clone(), lookTo: mid, t: 0 };
  // 2D: animated line on the map
  const t0 = performance.now();
  cancelAnimationFrame(mapAnim);
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 900);
    if (state !== 'reveal') return;
    drawMap(9, guessPin ? { gu: guessPin.u, gv: guessPin.v, pu: truth.u, pv: truth.v, k } : { gu: truth.u, gv: truth.v, pu: truth.u, pv: truth.v, k: 1 });
    if (k < 1) mapAnim = requestAnimationFrame(tick);
  };
  tick();
  const from = score;
  score += pts;
  countUp($('bw-score'), from, score);
  const box = $('bw-result');
  box.hidden = false;
  box.innerHTML = `<div class="bw-pts">${pts ? `+${pts.toLocaleString('en')}` : '0'}</div>
    <p>${zone ? `You were in <b>${zone.emoji} ${zone.name}</b>` : 'You were somewhere on the island'}</p>
    <p class="small muted">${g ? `${Math.round(dist)} studs away` : "⏰ Time's up - no guess!"}</p>
    <button class="btn primary" id="bw-next" type="button">${round + 1 >= ROUNDS ? 'See results 🏁' : 'Next round →'}</button>`;
  $('bw-next').onclick = () => { round++; round >= ROUNDS ? finish() : nextRound(); };
  if (pts >= 4000) confetti(60);
}

function finish() {
  state = 'summary';
  for (const b of beams) scene.remove(b);
  show('bw-summary');
  const pct = score / (ROUNDS * 5000);
  const key = mode === 'daily' ? `daily-${day}` : 'best';
  const best = read(key);
  if (best == null || score > best) write(key, score);
  $('bw-sum').innerHTML = `<p class="pill" style="margin:0 auto">${$('bw-seed').textContent}</p>
    <h2>${rankFor(pct)}</h2><p class="num" style="font-size:2.6rem;margin:0">${score.toLocaleString('en')}<span class="muted" style="font-size:1rem"> / ${(ROUNDS * 5000).toLocaleString('en')}</span></p>
    <div class="bw-rounds">${results.map((r, i) => `<div style="--i:${i}"><b>${i + 1}</b><span>${r.pts.toLocaleString('en')}</span><small>${Number.isFinite(r.dist) ? Math.round(r.dist) + ' studs' : '-'}</small></div>`).join('')}</div>
    <p class="muted">${best == null || score > best ? '🎉 New best!' : `Your best: ${best.toLocaleString('en')}`}</p>`;
  if (pct >= 0.5) confetti(180);
}
$('bw-again').onclick = () => startGame('random');
$('bw-daily').onclick = () => startGame('daily');
$('bw-share').onclick = async () => {
  const text = `🧱 Blox World ${mode === 'daily' ? `Daily #${day - 20722}` : ''} - ${score.toLocaleString('en')}/${(ROUNDS * 5000).toLocaleString('en')}\n${results.map((r) => (r.pts >= 4000 ? '🟩' : r.pts >= 1500 ? '🟨' : '🟥')).join('')}\nSame world, can you beat me? ${location.origin}/blox-world/?w=${seed}`;
  try { navigator.share ? await navigator.share({ text }) : await navigator.clipboard.writeText(text); $('bw-share').textContent = '✅ Copied!'; } catch {}
};
for (const b of document.querySelectorAll<HTMLElement>('[data-bw-start]')) b.onclick = () => startGame(b.dataset.bwStart!, b.dataset.bwStart === 'challenge' ? params.get('w')! : undefined);

function countUp(el: HTMLElement, from: number, to: number) {
  const s = performance.now();
  const f = (t: number) => { const k = Math.min(1, (t - s) / 700); el.textContent = Math.round(from + (to - from) * k).toLocaleString('en'); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

// ---------- loop ----------
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
let dust: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function poof(x: number, y: number, z: number) {
  if (reduced) return;
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(GEO.box, material('#ffffff'));
    m.scale.setScalar(0.6 + Math.random() * 0.6);
    m.position.set(x, y + 0.3, z);
    scene.add(m);
    const a = (i / 14) * Math.PI * 2;
    dust.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * 9, 3 + Math.random() * 4, Math.sin(a) * 9), life: 0.7 });
  }
}

function update(dt: number, t: number) {
  // world animations
  for (const a of anims) {
    if (a.a === 'spin') a.obj.rotation[a.obj.type === 'Group' ? 'z' : 'y'] += dt * 1.6;
    else if (a.a === 'bob') a.obj.position.y = a.y + Math.sin(t * 1.6 + a.phase) * 0.35;
    else if (a.a === 'flag') a.obj.rotation.y = Math.sin(t * 3 + a.phase) * 0.25;
    else if (a.a === 'blink' && a.mat) a.mat.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + a.phase)) * 0.8;
    else if (a.a === 'lava' && a.mat) a.mat.emissiveIntensity = 0.6 + Math.sin(t * 3 + a.phase) * 0.3;
    else if (a.a === 'water') a.obj.position.y = a.y + Math.sin(t * 1.4 + a.phase) * 0.06;
    else if (a.a === 'ocean') a.obj.position.y = a.y + Math.sin(t * 0.7) * 0.15;
  }
  for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > HALF + 160) c.position.x = -HALF - 160; }
  dust = dust.filter((d) => {
    d.life -= dt;
    d.v.y -= 20 * dt;
    d.mesh.position.addScaledVector(d.v, dt);
    d.mesh.scale.multiplyScalar(1 - dt * 2);
    if (d.life <= 0) scene.remove(d.mesh);
    return d.life > 0;
  });
  if (!rig || !world) return;

  // movement
  const canMove = state === 'explore';
  let ix = 0, iz = 0;
  if (canMove) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    ix += joy.x; iz += joy.y;
  }
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const mx = fx * -iz + -fz * ix, mz = fz * -iz + fx * ix;
  const moving = Math.hypot(mx, mz) > 0.05;
  if (moving) {
    const nx = player.x + mx * WALK_SPEED * dt, nz = player.z + mz * WALK_SPEED * dt;
    if (!blocked(world.index, nx, player.z, player.feet)) player.x = nx;
    if (!blocked(world.index, player.x, nz, player.feet)) player.z = nz;
    const target = Math.atan2(mx, mz);
    let d = target - player.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.face += d * Math.min(1, dt * 12);
  }
  player.speed01 += ((moving ? 1 : 0) - player.speed01) * Math.min(1, dt * 10);
  const ground = groundAt(world.index, player.x, player.z, player.feet);
  if (jumpQueued && player.onGround && canMove) { player.vy = JUMP; player.onGround = false; }
  jumpQueued = false;
  if (player.vy > 0 || player.feet > ground + 0.01) {
    player.vy -= GRAVITY * dt * (state === 'drop' ? 0.35 : 1);
    player.feet += player.vy * dt;
    if (player.feet <= ground) {
      if (!player.onGround && player.vy < -60) poof(player.x, ground, player.z);
      player.feet = ground; player.vy = 0; player.onGround = true;
      if (state === 'drop') { state = 'explore'; }
    } else player.onGround = false;
  } else { player.feet = ground; player.onGround = true; if (state === 'drop') state = 'explore'; }
  rig.root.position.set(player.x, player.feet, player.z);
  rig.root.rotation.y = player.face;
  animateRig(rig, t, player.speed01, !player.onGround);

  // timer
  if (state === 'explore' || state === 'map') {
    if (timeLeft > 0) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft === 0) { guessLeft = GUESS_TIME; openMap(); $('bw-mapclose').hidden = true; banner("⏰ Time's up!", 'Drop your pin on the map!'); }
    } else if (state === 'map') {
      guessLeft -= dt;
      if (guessLeft <= 0) guess();
    }
    const shown = timeLeft > 0 ? timeLeft : Math.max(0, guessLeft);
    $('bw-time').textContent = String(Math.ceil(shown));
    $('bw-time').classList.toggle('hurry', shown <= 10);
    (($('bw-ring') as unknown) as SVGCircleElement).style.strokeDashoffset = String(100 - (shown / (timeLeft > 0 ? EXPLORE_TIME : GUESS_TIME)) * 100);
  }
  ($('bw-needle') as HTMLElement).style.transform = `rotate(${(camYaw * 180) / Math.PI}deg)`;

  // camera
  const target = new THREE.Vector3(player.x, player.feet + 4, player.z);
  if (camFly) {
    camFly.t = Math.min(1, camFly.t + dt / 1.6);
    const k = camFly.t < 0.5 ? 2 * camFly.t * camFly.t : 1 - (-2 * camFly.t + 2) ** 2 / 2;
    camPos.lerpVectors(camFly.from, camFly.to, k);
    camLook.lerpVectors(camFly.lookFrom, camFly.lookTo, k);
  } else {
    const want = new THREE.Vector3(
      target.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      target.y + Math.sin(camPitch) * camDist,
      target.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
    );
    want.y = Math.max(want.y, groundAt(world.index, want.x, want.z, 999) + 1.5);
    camPos.lerp(want, Math.min(1, dt * 10));
    camLook.lerp(target, Math.min(1, dt * 14));
  }
  sun.position.set(player.x + 60, 120, player.z + 40);
  sun.target.position.set(player.x, 0, player.z);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  update(dt, t);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  renderer.render(scene, camera);
  // adaptive quality: drop resolution and shadows on slow devices
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) {
    if (fpsN / fpsAcc < 38 && quality > 0.9) { quality -= 0.35; renderer.setPixelRatio(Math.min(devicePixelRatio, quality)); renderer.shadowMap.enabled = false; }
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(frame);
}

// confetti
function confetti(n: number) {
  if (reduced) return;
  const c = $('bw-confetti') as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#6d7ff0', '#ff5fa2', '#3ecf8e', '#ffcc33', '#3cc8ff', '#ff8a3d'];
  const bits = Array.from({ length: n }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: colors[Math.floor(Math.random() * 6)], a: Math.random() * 6 }));
  const s = performance.now();
  const f = (t: number) => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) { b.vy += 0.45; b.x += b.vx; b.y += b.vy; b.a += 0.2; ctx.fillStyle = b.c; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore(); }
    if (t - s < 2500) requestAnimationFrame(f); else ctx.clearRect(0, 0, c.width, c.height);
  };
  requestAnimationFrame(f);
}

// ---------- boot: a live preview world spins behind the menu ----------
(async () => {
  resize();
  world = makeWorld(`d${day}`);
  buildWorld(world);
  camPos.set(0, 140, 200);
  camLook.set(0, 0, 0);
  const best = read('best'), daily = read(`daily-${day}`);
  $('bw-best').textContent = [best != null ? `🏆 Best: ${best.toLocaleString('en')}` : '', daily != null ? `📅 Today: ${daily.toLocaleString('en')}` : ''].filter(Boolean).join(' · ');
  if (params.get('w')) $('bw-challenge').hidden = false;
  if (touch) $('bw-jump').hidden = false;
  show('bw-menu');
  frame();
  // slow orbit while in the menu
  const orbit = () => {
    if (state === 'menu') {
      const a = performance.now() / 9000;
      camPos.set(Math.sin(a) * 230, 120, Math.cos(a) * 230);
      requestAnimationFrame(orbit);
    }
  };
  orbit();
})();
