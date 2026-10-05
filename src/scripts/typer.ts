// Night Shift: a horror typing game in a Roblox-style pizzeria at night.
// Every player sits at a security desk; type the prompt on your monitor before time runs out. Mistakes and
// timeouts drain your power, and the less power you have the closer "your" animatronic walks to your desk.
// Rules, prompts and bots are pure functions of the room seed (lib/typer.js): the server only relays progress.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeRun, makeBot, promptAt, hourOf, nightOf, HOURS, HOUR, clockOf, standings, wpmOf, MAX_PLAYERS, botName, sameKey,
  LIVES, ROUND_GAP, roundText, botRoundMs, newRounds, roundStart, roundFinish, roundEnd, humansDone, fastForward } from '../lib/typer.js';
import { avatarSVG, DEFAULT, SKINS } from '../lib/avatar.js';
import { buildAvatar, type Rig } from './avatar3d.ts';
import { loadProfile, saved } from './profile.ts';
import { fullscreenButton, synth, studTexture, studBox } from './gamekit.ts';

const $ = (id: string) => document.getElementById(id)!;
const touch = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('ns-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('ns-' + k, JSON.stringify(v)); } catch {} };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- renderer + post ----------
const box = $('ns');
const canvas = $('ns-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !touch;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050308');
scene.fog = new THREE.FogExp2('#060409', 0.026);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
const BLOOM = !touch;
const composer = BLOOM ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })) : null;
if (composer) {
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.5, 0.62));
  composer.addPass(new OutputPass());
}
const STUDS = studTexture(renderer);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 0) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
// black & white party floor, with studs
const FLOOR = canvasTex(128, 128, (g) => {
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? '#1a1a1f' : '#d9d6cc';
    g.fillRect(x * 64, y * 64, 64, 64);
    const gr = g.createRadialGradient(x * 64 + 29, y * 64 + 29, 3, x * 64 + 32, y * 64 + 32, 18);
    gr.addColorStop(0, (x + y) % 2 ? '#2c2c33' : '#f3f0e6'); gr.addColorStop(1, (x + y) % 2 ? '#121216' : '#b9b5aa');
    g.fillStyle = gr; g.beginPath(); g.arc(x * 64 + 32, y * 64 + 32, 15, 0, 7); g.fill();
  }
}, 11);
// dirty old plastic for the animatronics
const GRIME = canvasTex(256, 256, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(40,25,10,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  for (let i = 0; i < 18; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(50,30,15,0.25)'); gr.addColorStop(1, 'rgba(50,30,15,0)'); g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.scale(1, 0.4 + Math.random()); g.fillStyle = gr; g.fillRect(-30, -30, 60, 60); g.restore(); }
  for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(30,20,10,0.25)'; g.lineWidth = 1; g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo((x += (Math.random() - 0.5) * 30), (y += Math.random() * 20)); g.stroke(); }
});
const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const glow = (color: string, k = 3) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: k });

// ---------- the pizzeria ----------
const lamps: THREE.PointLight[] = [];
const stageSpots: THREE.SpotLight[] = [];
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 48), std('#ffffff', { map: FLOOR, roughness: 0.45, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -12;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = std('#2b2440', { map: STUDS });
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m = wallMat) => { const o = new THREE.Mesh(studBox(w, h, d), m); o.position.set(x, y, z); o.receiveShadow = true; scene.add(o); return o; };
  wall(36, 13, 1, 0, 6.5, -36.5); wall(36, 13, 1, 0, 6.5, 12.5); wall(1, 13, 50, -18.5, 6.5, -12); wall(1, 13, 50, 18.5, 6.5, -12);
  wall(36, 0.6, 50, 0, 13, -12, std('#0d0b12', { map: STUDS }));
  wall(36, 2.2, 0.4, 0, 1.1, -36, std('#4b1d1d', { map: STUDS })); // wainscot
  for (const x of [-18, 18]) wall(0.4, 2.2, 50, x, 1.1, -12, std('#4b1d1d', { map: STUDS }));
  // stage + curtains + party banner
  wall(28, 2, 9, 0, 1, -31.5, std('#4a2f1c', { map: STUDS, roughness: 0.6 })).castShadow = false;
  wall(28, 0.5, 0.4, 0, 2.1, -27, std('#d4a017', { map: STUDS, metalness: 0.6, roughness: 0.35 }));
  const curtain = std('#5a1530', { roughness: 0.95 });
  for (let i = 0; i < 26; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.15, 11, 0.6), curtain);
    f.position.set(-14 + i * 1.1, 7.5, -35.6 + (i % 2) * 0.35);
    scene.add(f);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 0.6), curtain); f.position.set(s * (13.5 - i * 1.1), 7.5, -27.6 - i * 0.2); f.rotation.y = s * 0.2; scene.add(f); }
  for (let i = 0; i < 30; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), glow('#ffd23f', 1.4)); st.position.set(-13 + Math.random() * 26, 3.5 + Math.random() * 8.5, -35.1); scene.add(st); }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.6), new THREE.MeshStandardMaterial({ map: canvasTex(1024, 168, (g) => {
    g.fillStyle = '#1d0c2b'; g.fillRect(0, 0, 1024, 168);
    for (let i = 0; i < 40; i++) { g.fillStyle = ['#ff3b5c', '#ffd23f', '#3ecf8e', '#5ee7ff'][i % 4]; g.beginPath(); g.moveTo(i * 26, 0); g.lineTo(i * 26 + 13, 22); g.lineTo(i * 26 + 26, 0); g.fill(); }
    g.font = '700 92px Fredoka, system-ui'; g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.shadowColor = '#ff3b5c'; g.shadowBlur = 20; g.fillText("BIBI'S PIZZA", 512, 130);
  }), emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: null }));
  banner.position.set(0, 11.2, -27.2);
  scene.add(banner);
  // posters
  const poster = (title: string, color: string, x: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6), std('#ffffff', { map: canvasTex(340, 460, (g) => {
      g.fillStyle = color; g.fillRect(0, 0, 340, 460);
      g.fillStyle = '#6b4226'; g.beginPath(); g.arc(170, 220, 95, 0, 7); g.fill(); // a bear face
      for (const ex of [95, 245]) { g.beginPath(); g.arc(ex, 135, 38, 0, 7); g.fill(); }
      g.fillStyle = '#c89b6d'; g.beginPath(); g.ellipse(170, 262, 50, 36, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; for (const ex of [130, 210]) { g.beginPath(); g.arc(ex, 200, 18, 0, 7); g.fill(); }
      g.fillStyle = '#111'; for (const ex of [134, 206]) { g.beginPath(); g.arc(ex, 202, 8, 0, 7); g.fill(); }
      g.fillRect(140, 282, 60, 8);
      g.font = '700 52px Fredoka, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(title, 170, 410);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 60; i++) g.fillRect(Math.random() * 340, Math.random() * 460, 2, 6 + Math.random() * 20);
    }) }));
    p.position.set(x, 6, z); p.rotation.y = ry; scene.add(p);
  };
  poster('SMILE!', '#3b6fd8', -17.9, -14, Math.PI / 2);
  poster('PARTY!', '#d83b6f', 17.9, -10, -Math.PI / 2);
  poster('LET\'S EAT', '#3e9e5a', -17.9, -4, Math.PI / 2);
  // party tables with hats on both sides
  for (const x of [-14.5, 14.5]) {
    wall(3.6, 0.4, 16, x, 2.6, -15, std('#e8e2d0', { map: STUDS }));
    for (let i = 0; i < 6; i++) {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 12), std(['#ff3b5c', '#3ecf8e', '#5ee7ff', '#ffd23f'][i % 4], { roughness: 0.5 }));
      hat.position.set(x + (i % 2 ? 0.9 : -0.9), 3.25, -21 + i * 2.3);
      hat.rotation.z = (Math.random() - 0.5) * 0.6;
      scene.add(hat);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 18), std('#ffffff'));
      plate.position.set(x + (i % 2 ? -0.7 : 0.7), 2.83, -21 + i * 2.3);
      scene.add(plate);
    }
  }
  // arcade cabinet + exit sign
  wall(2.4, 5.2, 2, 15.8, 2.6, 6, std('#30215a', { map: STUDS }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), glow('#5ee7ff', 1.6));
  scr.position.set(15.8, 3.9, 4.98); scr.rotation.y = Math.PI;
  scene.add(scr);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshStandardMaterial({ map: canvasTex(240, 90, (g) => { g.fillStyle = '#062'; g.fillRect(0, 0, 240, 90); g.font = '700 64px Fredoka, system-ui'; g.fillStyle = '#7cff8a'; g.textAlign = 'center'; g.fillText('EXIT', 120, 68); }), emissive: '#3cff6a', emissiveIntensity: 0.9 }));
  exit.position.set(-17.95, 9.5, 6); exit.rotation.y = Math.PI / 2;
  scene.add(exit);
  // lights: weak moonlight, flickering ceiling lamps, colored stage spots
  scene.add(new THREE.HemisphereLight('#4a4570', '#0a0a10', 0.45));
  for (const z of [-24, -13, -2]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 0.6, 16, 1, true), std('#222', { side: THREE.DoubleSide, metalness: 0.5 }));
    lamp.position.set(0, 11.6, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), glow('#fff2c4', 4));
    bulb.position.set(0, 11.3, z);
    const l = new THREE.PointLight('#cfd6ff', 60, 26, 1.6);
    l.position.set(0, 10.8, z);
    l.userData = { base: 60, bulb };
    lamps.push(l);
    scene.add(lamp, bulb, l);
  }
  for (const [x, c] of [[-11, '#ff2f5a'], [11, '#7a3cff']] as [number, string][]) {
    const s = new THREE.SpotLight(c, 700, 45, 0.42, 0.6, 1.6);
    s.position.set(x, 12, -19);
    s.target.position.set(x * 0.25, 2, -31);
    s.castShadow = x < 0 && !touch;
    s.shadow.mapSize.set(1024, 1024);
    s.userData.base = 700;
    stageSpots.push(s);
    scene.add(s, s.target);
  }
}
buildRoom();

// ---------- animatronics ----------
// Four original Roblox-flavoured characters, built from blocks: a jaw that opens, glowing eyes, metal endoskeleton.
type AnimKind = { name: string; fur: string; belly: string; limbs: string; legs: string; eye: string; extra: string };
const KINDS: AnimKind[] = [
  { name: 'Bibi Bear', fur: '#6b4226', belly: '#c89b6d', limbs: '#6b4226', legs: '#6b4226', eye: '#ff2a2a', extra: 'bear' },
  { name: 'Noobtronic', fur: '#f5cd30', belly: '#2f6fd6', limbs: '#f5cd30', legs: '#3cb043', eye: '#ffffff', extra: 'noob' },
  { name: 'Guest 666', fur: '#2a2a2e', belly: '#3d3d44', limbs: '#2a2a2e', legs: '#202024', eye: '#ff0000', extra: 'guest' },
  { name: 'Bacon Bot', fur: '#e8b98a', belly: '#3a7d44', limbs: '#e8b98a', legs: '#2b3350', eye: '#c04dff', extra: 'bacon' },
];
type Anim = { root: THREE.Group; head: THREE.Group; jaw: THREE.Group; eyes: THREE.MeshStandardMaterial; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; kind: AnimKind };
function makeAnim(kind: AnimKind): Anim {
  const root = new THREE.Group();
  const m = (c: string, o = {}) => std(c, { map: GRIME, roughness: 0.68, ...o });
  const metal = std('#5d6066', { metalness: 0.85, roughness: 0.35 });
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const limb = (x: number, y: number, len: number, w: number, c: string) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    add(g, B(w, len * 0.48, w), m(c), 0, -len * 0.24, 0);
    add(g, new THREE.CylinderGeometry(0.16, 0.16, len * 0.08, 8), metal, 0, -len * 0.5, 0); // exposed joint
    add(g, B(w * 0.95, len * 0.44, w * 0.95), m(c), 0, -len * 0.76, 0);
    root.add(g);
    return g;
  };
  const legL = limb(-0.7, 3, 3, 1.1, kind.legs), legR = limb(0.7, 3, 3, 1.1, kind.legs);
  add(root, B(1.4, 0.5, 1.9), m(kind.legs), -0.7, 0.25, 0.3); add(root, B(1.4, 0.5, 1.9), m(kind.legs), 0.7, 0.25, 0.3); // feet
  add(root, B(2.8, 2.9, 1.9), m(kind.extra === 'noob' || kind.extra === 'bacon' ? kind.belly : kind.fur), 0, 4.5, 0);
  if (kind.extra === 'bear' || kind.extra === 'guest') add(root, B(1.9, 1.9, 0.1), m(kind.belly), 0, 4.3, 0.96);
  const armL = limb(-1.85, 5.7, 3, 0.9, kind.limbs), armR = limb(1.85, 5.7, 3, 0.9, kind.limbs);
  add(root, new THREE.CylinderGeometry(0.28, 0.28, 0.7, 10), metal, 0, 6.2, 0); // neck
  const head = new THREE.Group();
  head.position.set(0, 6.5, 0);
  root.add(head);
  const skull = kind.extra === 'noob' ? m(kind.fur) : m(kind.fur);
  add(head, B(2.4, 1.6, 2.1), skull, 0, 1.0, 0);
  if (kind.extra !== 'noob') add(head, B(1.3, 0.6, 0.7), m(kind.extra === 'bear' ? kind.belly : kind.fur), 0, 0.55, 1.25); // snout
  if (kind.extra === 'bear') {
    add(head, new THREE.SphereGeometry(0.22, 10, 8), std('#111', { roughness: 0.2 }), 0, 0.85, 1.62);
    for (const s of [-1, 1]) add(head, new THREE.CylinderGeometry(0.42, 0.42, 0.25, 14), m(kind.fur), s * 1.0, 2.05, -0.1).rotation.x = Math.PI / 2;
    add(head, new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16), std('#111', { roughness: 0.5 }), 0, 2.4, 0);
    add(head, new THREE.CylinderGeometry(1.2, 1.2, 0.1, 18), std('#111', { roughness: 0.5 }), 0, 1.8, 0);
    add(root, B(1, 0.4, 0.3), std('#111'), 0, 5.7, 1); // bow tie
  }
  if (kind.extra === 'guest') { add(head, B(2.5, 0.5, 2.2), std('#1b1b1f'), 0, 1.9, -0.05); add(head, B(2.4, 0.15, 1.2), std('#e8e8e8'), 0, 1.7, 1.3); }
  if (kind.extra === 'bacon') for (let i = 0; i < 6; i++) add(head, B(0.5, 0.45, 2.3), m('#5a3417'), -1 + i * 0.4, 1.9 + (i % 2) * 0.15, 0).rotation.z = (i % 2 ? 0.3 : -0.3);
  if (kind.extra === 'noob') { // the classic painted grin
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshStandardMaterial({ transparent: true, map: canvasTex(190, 120, (g) => { g.strokeStyle = '#1a1a1a'; g.lineWidth = 9; g.beginPath(); g.arc(95, 30, 70, 0.45, Math.PI - 0.45); g.stroke(); }) }));
    face.position.set(0, 0.9, 1.06); head.add(face);
  }
  // jaw on a hinge, with teeth
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.25, -0.9);
  head.add(jaw);
  add(jaw, B(2.2, 0.45, 2.2), m(kind.extra === 'bear' ? kind.belly : kind.fur), 0, -0.05, 1.1);
  for (let i = 0; i < 7; i++) add(jaw, B(0.2, 0.28, 0.16), std('#efe7d0', { roughness: 0.4 }), -0.75 + i * 0.25, 0.28, 2.05);
  for (let i = 0; i < 7; i++) add(head, B(0.2, 0.25, 0.16), std('#efe7d0', { roughness: 0.4 }), -0.75 + i * 0.25, 0.32, 1.15 + (kind.extra === 'noob' ? 0 : 0.0));
  const eyes = glow(kind.eye, 2.2);
  for (const s of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.32, 14, 10), std('#f4f1e8', { roughness: 0.3 }), s * 0.55, 1.2, 1.0);
    add(head, new THREE.SphereGeometry(0.15, 10, 8), eyes, s * 0.55, 1.2, 1.28);
    if (kind.extra !== 'noob') add(head, B(0.6, 0.12, 0.2), std('#111'), s * 0.55, 1.62, 1.05).rotation.z = s * -0.25; // angry brows
  }
  root.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
  return { root, head, jaw, eyes, armL, armR, legL, legR, kind };
}

// ---------- desks ----------
type Desk = { g: THREE.Group; x: number; screen: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; lamp: THREE.PointLight; glowL: THREE.PointLight | null; tag: THREE.Sprite };
function nameTag(text: string, color: string) {
  const t = canvasTex(320, 64, (g) => { g.font = '700 34px Fredoka, system-ui'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 160, 44); g.fillStyle = color; g.fillText(text, 160, 44); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(3.6, 0.72, 1);
  return s;
}
function makeDesk(x: number, label: string, me: boolean): Desk {
  const g = new THREE.Group();
  g.position.x = x;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const wood = std('#5b4636', { map: STUDS, roughness: 0.6 });
  add(studBox(4.6, 0.35, 2.6), wood, 0, 2.6, 0);
  for (const [lx, lz] of [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.1], [2.1, 1.1]]) add(new THREE.BoxGeometry(0.3, 2.45, 0.3), wood, lx, 1.25, lz);
  // CRT monitor, the screen is a live canvas
  const beige = std('#cfc6ad', { roughness: 0.55 });
  add(new THREE.BoxGeometry(2.5, 2, 1.9), beige, 0, 3.85, -0.55);
  add(new THREE.BoxGeometry(1.5, 1.2, 0.6), beige, 0, 3.55, -1.6);
  add(new THREE.BoxGeometry(0.9, 0.2, 0.9), beige, 0, 2.86, -0.55);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const screen = new THREE.CanvasTexture(c);
  screen.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.58), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: screen, emissiveIntensity: 1.25, roughness: 0.2 }));
  scr.position.set(0, 3.87, 0.41);
  g.add(scr);
  // keyboard with keys
  add(new THREE.BoxGeometry(2.3, 0.14, 0.75), std('#d8d2c0'), 0, 2.84, 0.6);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) add(new THREE.BoxGeometry(0.17, 0.08, 0.17), std('#efe9d8'), -0.95 + k * 0.21, 2.93, 0.4 + r * 0.2);
  // desk lamp
  add(new THREE.CylinderGeometry(0.35, 0.4, 0.12, 14), std('#222', { metalness: 0.6 }), 1.75, 2.84, -0.6);
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), std('#222', { metalness: 0.6 }), 1.75, 3.45, -0.6);
  const shade = add(new THREE.ConeGeometry(0.45, 0.6, 16, 1, true), std(me ? '#2e7d32' : '#7a1f2b', { side: THREE.DoubleSide, metalness: 0.3 }), 1.55, 4.1, -0.4);
  shade.rotation.z = 0.6;
  const lamp = new THREE.PointLight('#ffcf8a', me ? 14 : 16, 9, 1.8);
  lamp.position.set(1.4, 3.8, -0.2);
  g.add(lamp);
  const glowL = touch ? null : new THREE.PointLight('#57ff7a', 7, 6, 2);
  if (glowL) { glowL.position.set(0, 3.9, 1.3); g.add(glowL); }
  // chair
  const chair = std('#2a2a33', { roughness: 0.5 });
  add(new THREE.BoxGeometry(1.9, 0.3, 1.8), chair, 0, 1.5, 2.3);
  add(new THREE.BoxGeometry(1.9, 2.2, 0.3), chair, 0, 2.7, 3.15);
  add(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8), std('#555', { metalness: 0.8 }), 0, 0.7, 2.3);
  const tag = nameTag(label, me ? '#5fd46d' : '#b8bccb');
  tag.position.set(0, 7.2, 2.2);
  tag.visible = !me; // your own name would sit right in front of the camera
  g.add(tag);
  scene.add(g);
  return { g, x, screen, ctx: c.getContext('2d')!, lamp, glowL, tag };
}

// ---------- seats (players + bots) ----------
type View = { i: number; c: number; hp: number; sc: number; alive: boolean; deathT: number };
type Seat = {
  id: string; name: string; avatar: any; me: boolean; bot: boolean; remote: boolean; run: any; v: View;
  desk: Desk; anim: Anim; rig: Rig | null; k: number; stageX: number; pos: THREE.Vector3; nextStep: number; typing: number;
  err: number; grab: number; dirty: boolean; lastDraw: number; svg: string; gone: boolean; perfect: number;
  attack: number; cheer: number; hearts: THREE.Sprite | null; shownLives: number; fin: number; place: number;
};
let seats: Seat[] = [];
let me: Seat | null = null;
function clearSeats() {
  for (const s of seats) {
    scene.remove(s.desk.g, s.anim.root);
    if (s.rig) scene.remove(s.rig.root);
    for (const o of [s.desk.g, s.anim.root]) o.traverse((x: any) => { x.geometry?.dispose?.(); if (x.material && x.material.map !== STUDS && x.material.map !== GRIME) x.material.map?.dispose?.(); });
  }
  seats = []; me = null;
}
const view = (s: Seat): View => (s.run ? { i: s.run.i, c: s.run.c, hp: s.run.hp, sc: s.run.score, alive: s.run.alive, deathT: s.run.deathT } : s.v);
// how close the animatronic is: 0 on stage, 1 at your desk
const danger = (s: Seat) => { const v = view(s); return v.alive ? clamp(((100 - v.hp) / 100) ** 0.85, 0, 1) : 1; };
function animTarget(s: Seat, d: number) {
  if (d < 0.12) return new THREE.Vector3(s.stageX, 2, -31);
  const u = (d - 0.12) / 0.88;
  return new THREE.Vector3(lerp(s.stageX * 1.2, s.desk.x + 2.2, u), 0, lerp(-24.5, -4, u * u * (3 - 2 * u)));
}

async function setupSeats(roster: any[], meId: string) {
  clearSeats();
  const n = roster.length;
  seats = roster.map((p, k) => {
    const x = (k - (n - 1) / 2) * 6.6;
    const mine = p.id === meId;
    const bot = p.bot != null;
    const run = rmode === 'rounds' ? null : mine ? makeRun(seed) : bot ? makeBot(seed, p.bot) : null;
    const anim = makeAnim(KINDS[k % KINDS.length]);
    const stageX = (k - 1.5) * 5.2;
    anim.root.position.set(stageX, 2, -31);
    scene.add(anim.root);
    const s: Seat = {
      id: p.id, name: p.name, avatar: p.avatar, me: mine, bot, remote: !mine && !bot, run, v: { i: 0, c: 0, hp: 100, sc: 0, alive: true, deathT: 0 },
      desk: makeDesk(x, `${bot ? '🤖 ' : ''}${p.name}${mine && p.name !== 'You' ? ' (you)' : ''}`, mine), anim, rig: null, k, stageX, pos: anim.root.position.clone(),
      nextStep: 0, typing: 0, err: 0, grab: -1, dirty: true, lastDraw: 0, svg: avatarSVG(p.avatar, 30), gone: false, perfect: 0,
      attack: -1, cheer: 0, hearts: null, shownLives: -1, fin: -1, place: 0,
    };
    if (rmode === 'rounds') { s.v.hp = 100; s.v.sc = LIVES; setHearts(s, LIVES); }
    if (mine) me = s;
    buildAvatar(p.avatar).then((rig) => {
      if (!seats.includes(s)) return;
      s.rig = rig;
      rig.root.position.set(x, -0.35, 2.15);
      rig.root.rotation.y = Math.PI;
      rig.legL.rotation.x = rig.legR.rotation.x = -Math.PI / 2;
      rig.root.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
      scene.add(rig.root);
    });
    return s;
  });
}

// hearts floating over each player in Rounds mode
function setHearts(s: Seat, n: number) {
  if (s.shownLives === n) return;
  s.shownLives = n;
  const t = canvasTex(320, 64, (g) => { g.font = '40px system-ui'; g.textAlign = 'center'; g.fillText('❤️'.repeat(n) + '🖤'.repeat(Math.max(0, LIVES - n)), 160, 46); });
  if (!s.hearts) { s.hearts = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.hearts.scale.set(3.4, 0.68, 1); s.hearts.position.set(0, 6.4, 2.2); s.hearts.visible = !s.me; s.desk.g.add(s.hearts); }
  else { s.hearts.material.map?.dispose(); s.hearts.material.map = t; s.hearts.material.needsUpdate = true; }
}
// floating 3D text that pops and drifts up (broken hearts, finish times)
const floaters: { o: THREE.Sprite; t: number; vy: number }[] = [];
function floater(text: string, at: THREE.Vector3, color = '#ffffff', size = 3) {
  const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 128, (g) => { g.font = '700 74px Fredoka, system-ui'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(text, 128, 90); g.fillStyle = color; g.fillText(text, 128, 90); }), depthWrite: false, transparent: true }));
  o.position.copy(at); o.scale.set(size, size / 2, 1);
  scene.add(o);
  floaters.push({ o, t: 0, vy: 1.6 });
}

// ---------- monitors ----------
function drawMonitor(s: Seat, t: number) {
  const g = s.desk.ctx, v = view(s);
  g.fillStyle = '#031407'; g.fillRect(0, 0, 512, 384);
  if (!v.alive) { // signal lost: static
    for (let i = 0; i < 900; i++) { const c = Math.random() * 255 | 0; g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(Math.random() * 512, Math.random() * 384, 4 + Math.random() * 10, 2 + Math.random() * 3); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(70, 150, 372, 80);
    g.font = '48px VT323, monospace'; g.textAlign = 'center'; g.fillStyle = '#ff3b3b'; g.fillText('SIGNAL LOST', 256, 205);
  } else {
    g.textAlign = 'left';
    g.font = '26px VT323, monospace'; g.fillStyle = 'rgba(124,255,138,0.65)';
    g.fillText(rmode === 'rounds' ? `BIBI'S PIZZA · ROUND ${R?.r ?? 1}` : `BIBI'S PIZZA SECURITY · ${HOURS[hourOf(t)]}`, 18, 34);
    const text = rmode === 'rounds' ? (R && Date.now() + offset >= R.at ? R.text : '. . .') : promptAt(seed, v.i);
    g.font = '40px VT323, monospace';
    let x = 18, y = 110;
    for (let i = 0; i < text.length; i++) {
      const w = g.measureText(text[i]).width;
      if (text[i] === ' ' && x > 400) { x = 18; y += 46; continue; }
      g.fillStyle = i < v.c ? '#7cff8a' : i === v.c ? '#ffffff' : 'rgba(124,255,138,0.3)';
      g.fillText(text[i], x, y);
      if (i === v.c && Math.floor(t / 400) % 2) g.fillRect(x, y + 6, w, 4);
      x += w;
    }
    g.fillStyle = 'rgba(124,255,138,0.2)'; g.fillRect(18, 330, 476, 18);
    g.fillStyle = v.hp < 35 ? '#ff3b3b' : '#7cff8a'; g.fillRect(18, 330, 4.76 * v.hp, 18);
    g.font = '26px VT323, monospace'; g.fillStyle = '#7cff8a'; g.fillText(rmode === 'rounds' ? `HEARTS ${v.sc}/${LIVES}${s.fin >= 0 ? `   DONE ${(s.fin / 1000).toFixed(2)}s` : ''}` : `POWER ${Math.round(v.hp)}%   SCORE ${v.sc}`, 18, 318);
    if (s.err > 0.5) { g.fillStyle = 'rgba(255,0,0,0.25)'; g.fillRect(0, 0, 512, 384); }
  }
  for (let y = 0; y < 384; y += 4) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 512, 1); }
  s.desk.screen.needsUpdate = true;
}

// ---------- sound ----------
const sound = synth('ns-muted');
let drone: ReturnType<typeof sound.hum> | null = null, drone2: ReturnType<typeof sound.hum> | null = null;
function sfx(kind: string, v = 1) {
  if (kind === 'key') sound.noise(0.035, 0.07, 3800, 0, 1, 'highpass');
  if (kind === 'bad') { sound.note(150, 70, 0.22, 'sawtooth', 0.08); sound.noise(0.22, 0.16, 900, 0, 0.7); }
  if (kind === 'done') sound.note(660, 990, 0.12, 'triangle', 0.05);
  if (kind === 'perfect') [784, 988, 1319].forEach((f, i) => sound.note(f, f, 0.14, 'triangle', 0.045, i * 0.06));
  if (kind === 'timeout') { sound.note(220, 110, 0.5, 'square', 0.07); sound.noise(0.4, 0.15, 500, 0.05); }
  if (kind === 'hour') [523, 659, 523].forEach((f, i) => sound.note(f, f, 0.6, 'sine', 0.06, i * 0.35));
  if (kind === 'six') [523, 659, 784, 1047, 1319].forEach((f, i) => sound.note(f, f, 0.5, 'triangle', 0.06, i * 0.15));
  if (kind === 'step') sound.noise(0.18, 0.35 * v, 140, 0, 1.4, 'lowpass');
  if (kind === 'clunk') { sound.noise(0.12, 0.3, 300, 0, 1, 'lowpass'); sound.note(90, 60, 0.15, 'square', 0.05); }
  if (kind === 'static') sound.noise(0.35, 0.08 * v, 5000, 0, 0.5, 'highpass');
  if (kind === 'heart') { sound.note(62, 42, 0.13, 'sine', 0.35); sound.note(58, 40, 0.13, 'sine', 0.28, 0.2); }
  if (kind === 'box') [659, 622, 587, 554, 523, 494, 466, 440].forEach((f, i) => sound.note(f * 2, f * 2, 0.35, 'triangle', 0.025, i * 0.32)); // a music box winding down
  if (kind === 'scare') { sound.noise(1.4, 0.55, 2400, 0, 0.4); sound.note(950, 180, 1.2, 'sawtooth', 0.16); sound.note(1400, 260, 1.1, 'square', 0.08); sound.noise(1.2, 0.3, 300, 0, 1, 'lowpass'); }
  if (kind === 'caught') { sound.note(400, 60, 1.2, 'sawtooth', 0.06); sound.noise(0.8, 0.12, 1500, 0.1); }
  if (kind === 'go') sound.note(880, 880, 0.3, 'square', 0.05);
}
$('ns-mute').onclick = () => { const m = sound.toggle(); $('ns-mute').textContent = m ? '🔇' : '🔊'; if (m) { drone?.set(0); drone2?.set(0); } };
$('ns-mute').textContent = sound.muted ? '🔇' : '🔊';

// ---------- game state ----------
type State = 'menu' | 'lobby' | 'intro' | 'play' | 'scare' | 'spec' | 'over';
let state: State = 'menu';
let mode: 'solo' | 'bots' | 'rbots' | 'online' = 'solo';
let rmode: 'surv' | 'rounds' = 'surv';
// Rounds mode: R mirrors the current round; `host` runs the rules in offline games (online, the server does)
let R: { r: number; at: number; limit: number; text: string; c: number; done: boolean; live: boolean; ended: boolean; cd: number } | null = null;
let host: any = null;
let lastRound: any = null;
const myTimes: number[] = [];
let seed = 'x';
let startAt = 0, offset = 0;
let ws: WebSocket | null = null;
let myId = 'me';
let finishing = false, lastHour = -1, lastSend = 0, sendTimer = 0, scareT = 0, heartAt = 0, boxAt = 0, introStage = 0;
const now = () => Date.now() + offset - startAt;
const opt = { scare: read('scare') ?? !reduced, hint: read('hint') ?? true };
($('ns-opt-scare') as HTMLInputElement).checked = opt.scare;
($('ns-opt-hint') as HTMLInputElement).checked = opt.hint;
$('ns-opt-scare').onchange = (e) => write('scare', (opt.scare = (e.target as HTMLInputElement).checked));
$('ns-opt-hint').onchange = (e) => { write('hint', (opt.hint = (e.target as HTMLInputElement).checked)); hintKey(); };

function show(id: string | null) {
  for (const p of ['ns-menu', 'ns-lobby', 'ns-over', 'ns-rooms']) $(p).hidden = p !== id;
  $('ns-hud').hidden = !(state === 'intro' || state === 'play' || state === 'scare' || state === 'spec');
  $('ns-tools').hidden = id !== null;
}
function banner(title: string, sub = '', ms = 2800) {
  const b = $('ns-banner');
  b.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  b.style.animationDuration = `${ms}ms`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
const retrigger = (el: HTMLElement, cls: string) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
function pop(text: string, color = '#7cff8a') { const p = $('ns-pop'); p.textContent = text; p.style.color = color; retrigger(p, 'go'); }

async function startGame(roster: any[], s: string, at: number, meId: string, rules: 'surv' | 'rounds' = 'surv') {
  seed = s; startAt = at; myId = meId; rmode = rules;
  R = null; host = null; lastRound = null; myTimes.length = 0;
  box.classList.toggle('rounds', rules === 'rounds');
  await setupSeats(roster, meId);
  state = 'intro';
  box.classList.add('intro');
  introStage = 0;
  finishing = false;
  for (const a of menuAnims) a.root.visible = false;
  lastHour = -1;
  show(null);
  $('ns-spec').hidden = true;
  $('ns-prompt').style.visibility = 'hidden';
  $('ns-static').classList.remove('on');
  box.classList.remove('low', 'shake', 'spec');
  renderPlayers(true);
  drone ??= sound.hum(46, 'sawtooth', 160);
  drone2 ??= sound.hum(69.5, 'triangle', 300);
  drone.set(0.05); drone2.set(0.025);
}
async function localGame(m: 'solo' | 'bots' | 'rbots') {
  mode = m;
  const p = await loadProfile(false);
  const roster: any[] = [{ id: 'me', name: p?.name ?? 'You', avatar: p?.avatar ?? DEFAULT }];
  const s = Math.random().toString(36).slice(2, 10);
  if (m !== 'solo') for (let k = 0; k < MAX_PLAYERS - 1; k++) roster.push({ id: `bot${k}`, bot: k, name: botName(s, k), avatar: { ...DEFAULT, skin: (k * 3 + 1) % SKINS.length, body: ['boy', 'girl', 'other'][k % 3], hair: ['hair-short', 'hair-pony', 'hair-curly'][k % 3], shirt: ['shirt-red', 'shirt-green', 'shirt-blue'][k % 3] } });
  offset = 0;
  const at = Date.now() + 5200;
  await startGame(roster, s, at, 'me', m === 'rbots' ? 'rounds' : 'surv');
  if (m === 'rbots') { host = newRounds(roster, at); onRound(roundStart(host, s, at)); }
}

// ---------- typing ----------
const kbKeys = new Map<string, HTMLElement>();
for (const b of document.querySelectorAll<HTMLElement>('#ns-kb [data-k]')) {
  kbKeys.set(b.dataset.k!, b);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(b.dataset.k!); });
}
addEventListener('keydown', (e) => {
  if (state !== 'play' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  e.preventDefault();
  press(e.key);
});
function flashKey(k: string, cls: 'ok' | 'bad') {
  const b = kbKeys.get(k.toLowerCase()) ?? kbKeys.get(k);
  if (!b) return;
  b.classList.remove('ok', 'bad'); void b.offsetWidth; b.classList.add(cls);
  clearTimeout((b as any)._t);
  (b as any)._t = setTimeout(() => b.classList.remove(cls), 160);
}
let hinted: HTMLElement | null = null;
function hintKey() {
  hinted?.classList.remove('next');
  hinted = null;
  const src = typing();
  if (!opt.hint || !src || state !== 'play') return;
  const ch = src.text[src.c];
  hinted = (ch && (kbKeys.get(ch.toLowerCase()) ?? null)) as HTMLElement | null;
  hinted?.classList.add('next');
}
// what the local player is typing right now (null = nothing to type)
function typing(): { text: string; c: number } | null {
  if (!me) return null;
  if (rmode === 'rounds') return R && R.live && !R.done && !R.ended && view(me).alive ? R : null;
  return me.run.alive ? me.run : null;
}
let shownText = '';
function renderPrompt(fresh = false) {
  if (!me) return;
  const r = rmode === 'rounds' ? R : me.run;
  if (!r) return;
  const el = $('ns-text');
  if (fresh || shownText !== r.text) {
    shownText = r.text;
    el.innerHTML = [...r.text].map((ch: string) => `<span${ch === ' ' ? ' class="space"' : ''}>${esc(ch)}</span>`).join('');
    retrigger($('ns-prompt'), 'on');
  }
  el.querySelectorAll('span').forEach((sp, i) => { sp.classList.toggle('ok', i < r.c); sp.classList.toggle('cur', i === r.c); });
  hintKey();
}
function press(k: string) {
  if (rmode === 'rounds') return pressRound(k);
  if (state !== 'play' || !me?.run.alive) return;
  const t = now();
  if (t < 0) return;
  const r = me.run, before = r.i;
  const ev = r.key(k, t);
  if (r.i !== before && ev !== 'done' && ev !== 'perfect') onTimeout(me); // the clock ran out right before this key
  me.typing = 1;
  me.dirty = true;
  if (ev === 'ok') { sfx('key'); flashKey(k, 'ok'); renderPrompt(); }
  else if (ev === 'done' || ev === 'perfect') {
    sfx(ev); flashKey(k, 'ok');
    retrigger($('ns-prompt'), 'won');
    pop(ev === 'perfect' ? `PERFECT! +${r.score - lastScore}` : `+${r.score - lastScore}`, ev === 'perfect' ? '#ffd23f' : '#7cff8a');
    if (ev === 'perfect') me.perfect = 1;
    setTimeout(() => renderPrompt(true), 120);
  } else if (ev === 'bad') {
    sfx('bad'); flashKey(k, 'bad');
    const cur = $('ns-text').querySelectorAll('span')[r.c];
    cur?.classList.add('bad');
    setTimeout(() => cur?.classList.remove('bad'), 300);
    retrigger($('ns-prompt'), 'err');
    retrigger($('ns-static'), 'go');
    sfx('static', 0.6);
    me.err = 1;
    flicker(0.35);
  } else if (ev === 'dead') die(me);
  lastScore = r.score;
  updateHud();
  net(ev === 'bad' || ev === 'done' || ev === 'perfect' ? ev : '');
}
let lastScore = 0;
function onTimeout(s: Seat) {
  s.err = 1; s.dirty = true;
  if (!s.me) return;
  sfx('timeout');
  pop('⏰ TOO SLOW!', '#ff4040');
  retrigger($('ns-jump'), 'go');
  retrigger($('ns-static'), 'go');
  flicker(0.8);
  renderPrompt(true);
  net('bad');
}

// ---------- HUD ----------
function updateHud() {
  if (!me) return;
  if (rmode === 'rounds') {
    const n = view(me).sc;
    $('ns-hp').textContent = '❤️'.repeat(n) + '🖤'.repeat(LIVES - n);
    ($('ns-hpbar') as HTMLElement).style.width = `${(n / LIVES) * 100}%`;
    $('ns-power').classList.toggle('low', n <= 1);
    box.classList.toggle('low', n === 1);
    box.style.setProperty('--danger', String(view(me).alive ? danger(me) : 0));
    $('ns-hour').textContent = `ROUND ${R?.r ?? 1}`;
    $('ns-night').textContent = `${seats.filter((s) => view(s).alive).length} left`;
    $('ns-score').textContent = myTimes.length ? `${(myTimes[myTimes.length - 1] / 1000).toFixed(2)}s` : '—';
    $('ns-combo').textContent = myTimes.length ? `best ${(Math.min(...myTimes) / 1000).toFixed(2)}s` : '';
    return;
  }
  const v = view(me), t = Math.max(0, now());
  $('ns-hp').textContent = `${Math.round(v.hp)}%`;
  ($('ns-hpbar') as HTMLElement).style.width = `${v.hp}%`;
  $('ns-power').classList.toggle('low', v.hp < 35);
  box.classList.toggle('low', v.alive && v.hp < 35);
  box.style.setProperty('--danger', String(v.alive ? danger(me) : 0));
  $('ns-hour').textContent = HOURS[hourOf(t)];
  $('ns-night').textContent = `Night ${nightOf(t)}`;
  $('ns-score').textContent = String(v.sc);
  const combo = me.run.combo;
  const cel = $('ns-combo');
  const txt = combo >= 10 ? `🔥 x${1 + Math.floor(combo / 10)} combo` : '';
  if (cel.textContent !== txt) { cel.textContent = txt; if (txt) retrigger(cel, 'pop'); }
}
let playersDrawn = 0;
function renderPlayers(force = false) {
  if (!force && performance.now() - playersDrawn < 200) return;
  playersDrawn = performance.now();
  $('ns-players').innerHTML = seats.length < 2 ? '' : seats.map((s) => {
    const v = view(s);
    if (rmode === 'rounds') {
      const len = R?.text.length || 1, pct = s.fin >= 0 ? 100 : (v.c / len) * 100;
      return `<li class="${s.me ? 'me' : ''} ${v.alive ? '' : 'dead'} ${s.fin >= 0 ? 'fin' : ''} ${s.err > 0.6 || s.attack >= 0 ? 'hit' : ''}">${s.svg}<b>${v.alive ? '' : '💀 '}${s.bot ? '🤖 ' : ''}${esc(s.name)}</b><span class="ns-hearts">${'❤️'.repeat(v.sc)}${s.fin >= 0 ? ` <em>${s.place === 1 ? '⚡' : '✓'} ${(s.fin / 1000).toFixed(2)}s</em>` : ''}</span><i><u style="width:${pct}%"></u></i></li>`;
    }
    return `<li class="${s.me ? 'me' : ''} ${v.alive ? '' : 'dead'} ${v.hp < 35 ? 'lowhp' : ''} ${s.err > 0.6 ? 'hit' : ''}">${s.svg}<b>${v.alive ? '' : '💀 '}${s.bot ? '🤖 ' : ''}${esc(s.name)}</b><i><u style="width:${v.hp}%"></u></i></li>`;
  }).join('');
}

// ---------- network ----------
function wsUrl(path: string) { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`; }
function net(e = '') {
  if (!ws || ws.readyState !== 1 || !me) return;
  const go = () => {
    lastSend = performance.now();
    const v = view(me!);
    ws?.readyState === 1 && ws.send(JSON.stringify({ t: v.alive ? 's' : 'dead', i: v.i, c: v.c, hp: Math.round(v.hp), sc: v.sc, e, ms: Math.round(v.deathT) }));
  };
  clearTimeout(sendTimer);
  if (e || !view(me).alive || performance.now() - lastSend > 120) go();
  else sendTimer = window.setTimeout(go, 120);
}
// ---------- online rooms ----------
let hubWs: WebSocket | null = null;
let roomList: any[] = [];
let newMode: 'surv' | 'rounds' = 'rounds';
const MODE_LABEL = { surv: '🔦 Survival', rounds: '⚔️ Rounds' };
function openRooms() {
  mode = 'online';
  state = 'menu';
  show('ns-rooms');
  $('ns-roomlist').innerHTML = '<li class="muted">Looking for rooms…</li>';
  hubWs?.close();
  const sock = new WebSocket(wsUrl('/api/night'));
  hubWs = sock;
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'rooms') { roomList = m.list; renderRooms(); } };
  sock.onerror = () => ($('ns-roomlist').innerHTML = '<li class="muted">📡 Online play is offline right now. Try playing vs bots!</li>');
}
const closeHub = () => { const h = hubWs; hubWs = null; h?.close(); };
function renderRooms() {
  const open = roomList.filter((r) => r.n < MAX_PLAYERS);
  $('ns-roomlist').innerHTML = open.length
    ? open.map((r) => `<li>${avatarSVG(r.avatar, 40)}<div><b>${esc(r.host)}'s office</b><small>${MODE_LABEL[r.mode as 'surv' | 'rounds'] ?? ''} · ${r.bots ? '🤖 bots fill seats' : 'no bots'}${r.quick ? ' · ⚡ starting soon' : ''}</small></div><span class="ns-count">${'👤'.repeat(r.n)}${'▫️'.repeat(MAX_PLAYERS - r.n)}</span><button class="btn play" type="button" data-join="${r.code}" data-mode="${r.mode}">Join</button></li>`).join('')
    : '<li class="muted">No open rooms right now. Create one and invite your friends! 🔦</li>';
  for (const b of document.querySelectorAll<HTMLElement>('[data-join]')) b.onclick = () => { closeHub(); ($('ns-link') as HTMLInputElement).value = `${location.origin}/typing/?room=${b.dataset.join}`; $('ns-invite').hidden = false; connect(b.dataset.join!, false, b.dataset.mode as any); };
}
function newCode() { return Array.from({ length: 5 }, () => 'BCDFGHJKLMNPQRSTVWXZ23456789'[Math.floor(Math.random() * 28)]).join(''); }
function createRoom(quick = false) {
  closeHub();
  const code = newCode();
  ($('ns-link') as HTMLInputElement).value = `${location.origin}/typing/?room=${code}`;
  mode = 'online';
  $('ns-invite').hidden = quick;
  connect(code, quick, newMode);
}
function quickJoin() {
  const open = roomList.find((r) => r.n < MAX_PLAYERS);
  if (open) { closeHub(); $('ns-invite').hidden = true; connect(open.code, false, open.mode); }
  else { newMode = 'rounds'; createRoom(true); }
}
for (const b of document.querySelectorAll<HTMLElement>('[data-newmode]')) b.onclick = () => { newMode = b.dataset.newmode as any; for (const x of document.querySelectorAll<HTMLElement>('[data-newmode]')) x.classList.toggle('on', x === b); };
$('ns-create').onclick = () => createRoom(false);
$('ns-quick').onclick = quickJoin;
$('ns-rooms-back').onclick = () => { closeHub(); menu(); };
const lobbyText = (t: string) => ($('ns-lobby-txt').textContent = t);
let lobbyTimer = 0;
function connect(code: string, quick: boolean, rules: 'surv' | 'rounds' = 'surv') {
  state = 'lobby';
  show('ns-lobby');
  $('ns-slots').innerHTML = '';
  lobbyText(quick ? '⚡ Joining a room…' : '🏠 Opening the office…');
  const sock = new WebSocket(wsUrl(`/api/night/${code}?mode=${rules}${quick ? '&quick' : ''}`));
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', ...(saved() ?? {}) }));
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'full') { lobbyText(m.dup ? 'You are already in this room in another tab.' : 'That room is full or the night already started 😕'); return; }
    if (m.t === 'you') myId = m.id;
    if (m.t === 'lobby') renderLobby(m);
    if (m.t === 'start') { clearInterval(lobbyTimer); offset = m.now - Date.now(); startGame(m.roster, m.seed, m.at, myId, m.mode === 'rounds' ? 'rounds' : 'surv').then(() => m.round && onRound(m.round)); }
    if (m.t === 'round') onRound(m);
    if (m.t === 'fin' && R && m.r === R.r) onFin(m.id, m.ms);
    if (m.t === 'rend') onRoundEnd(m);
    const s = seats.find((x) => x.id === m.id);
    if (s && s.remote && (m.t === 's' || m.t === 'dead')) {
      if (m.e === 'bad' || m.hp < s.v.hp - 15) s.err = 1;
      if (m.e === 'perfect') s.perfect = 1;
      if (m.i !== s.v.i || m.c !== s.v.c) s.typing = 1;
      if (rmode === 'rounds') { if (R && m.i === R.r) s.v.c = m.c; } else Object.assign(s.v, { i: m.i, c: m.c, hp: m.hp, sc: m.sc });
      s.dirty = true;
      if (m.t === 'dead' && s.v.alive) { s.v.alive = false; s.v.deathT = m.ms || now(); die(s); }
    }
    if (m.t === 'left' && s) {
      s.gone = true;
      if (s.v.alive && state !== 'lobby' && rmode === 'surv') { s.v.alive = false; s.v.deathT = Math.max(0, now()); s.v.hp = 0; die(s); }
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    if (state === 'lobby') lobbyText('📡 Disconnected. Try again!');
    if (state === 'play' || state === 'spec') { for (const s of seats) if (s.remote && s.v.alive) { s.v.alive = false; s.v.deathT = Math.max(0, now()); } banner('📡 Connection lost', 'Finishing the night offline'); }
  };
}
function renderLobby(m: any) {
  const host = m.host === myId;
  $('ns-slots').innerHTML = Array.from({ length: MAX_PLAYERS }, (_, k) => {
    const p = m.players[k];
    if (p) return `<li class="full ${p.id === myId ? 'me' : ''}">${avatarSVG(p.avatar, 48)}<b>${esc(p.name)}</b><small>${p.id === m.host ? '👑 host' : ''}${p.id === myId ? ' (you)' : ''}</small></li>`;
    return `<li><span class="empty">${m.bots ? '🤖' : '⏳'}</span><small>${m.bots ? 'Bot' : 'Waiting…'}</small></li>`;
  }).join('');
  $('ns-botsbox').hidden = !host || m.quick;
  ($('ns-bots') as HTMLInputElement).checked = m.bots;
  $('ns-start').hidden = !host || m.quick;
  $('ns-lobby-mode').textContent = m.mode === 'rounds' ? '⚔️ Rounds: same words for everyone, the slowest loses a heart' : '🔦 Survival: type your own prompts, last one standing wins';
  clearInterval(lobbyTimer);
  if (m.quick) {
    const end = Date.now() + (m.startAt - m.now);
    const tick = () => lobbyText(`⚡ Quick match: starting in ${Math.max(0, Math.ceil((end - Date.now()) / 1000))}s · bots fill the empty seats`);
    tick();
    lobbyTimer = window.setInterval(tick, 500);
  } else lobbyText(host ? `${m.players.length}/${MAX_PLAYERS} in the office. Start when your friends are in!` : 'Waiting for the host to start the night…');
}
$('ns-bots').onchange = (e) => ws?.send(JSON.stringify({ t: 'bots', on: (e.target as HTMLInputElement).checked }));
$('ns-start').onclick = () => ws?.send(JSON.stringify({ t: 'start' }));
$('ns-copy').onclick = async () => {
  const link = ($('ns-link') as HTMLInputElement).value;
  try { navigator.share ? await navigator.share({ text: `Survive the night shift with me on BibiBox! ${link}` }) : await navigator.clipboard.writeText(link); $('ns-copy').textContent = '✅ Copied!'; } catch {}
};
$('ns-cancel').onclick = () => { clearInterval(lobbyTimer); const w = ws; ws = null; w?.close(); menu(); };

// ---------- death, results ----------
function die(s: Seat) {
  s.grab = 0;
  s.dirty = true;
  s.desk.lamp.intensity = 0;
  if (s.desk.glowL) s.desk.glowL.color.set('#ff2020');
  if (s.me) {
    if (rmode === 'surv') net();
    hintKey();
    $('ns-prompt').style.visibility = 'hidden';
    if (opt.scare) { state = 'scare'; scareT = 0; sfx('scare'); box.classList.add('shake'); retrigger($('ns-jump'), 'go'); }
    else { state = 'scare'; scareT = 1.2; sfx('caught'); }
    if (rmode === 'surv') saveBest();
  } else {
    sfx('caught');
    if ((state === 'play' || state === 'spec') && rmode === 'surv') banner(`💀 ${esc(s.name)}`, `was caught at ${HOURS[hourOf(view(s).deathT)]}`, 2400);
  }
  renderPlayers(true);
}
function afterScare() {
  box.classList.remove('shake', 'low');
  $('ns-static').classList.add('on');
  setTimeout(() => $('ns-static').classList.remove('on'), 900);
  sfx('static', 1.5);
  // anchor the camera on the room, the others keep playing
  state = 'spec';
  box.classList.add('spec');
  banner('CAUGHT', rmode === 'rounds' ? 'Out of hearts' : `${clockOf(view(me!).deathT)} · ${view(me!).sc} pts`, 3000);
  if (rmode === 'rounds') { $('ns-spec').hidden = false; $('ns-skip').hidden = true; $('ns-spec-txt').textContent = '💀 Out of hearts! Watching the others…'; return; }
  const humansLeft = seats.some((s) => s.remote && view(s).alive);
  $('ns-spec').hidden = !seats.some((s) => !s.me && view(s).alive);
  $('ns-skip').hidden = humansLeft;
  $('ns-spec-txt').textContent = humansLeft ? '💀 You got caught! Watching the others…' : '💀 You got caught!';
}
function saveBest() {
  const v = view(me!), best = read('best');
  if (!best || v.sc > best.sc) write('best', { sc: v.sc, t: v.deathT });
}
function finish() {
  if (state === 'over') return;
  // bots are deterministic: play their night to the end instantly so everyone gets the same standings
  for (const s of seats) if (s.bot && s.run.alive) s.run.advance(Number.MAX_SAFE_INTEGER);
  state = 'over';
  drone?.set(0); drone2?.set(0);
  const w = ws; ws = null; w?.close();
  $('ns-spec').hidden = true;
  const list = standings(seats.map((s) => ({ s, ...view(s) })));
  const mine = view(me!);
  const place = list.findIndex((x: any) => x.s === me) + 1;
  const acc = me!.run.typed ? Math.round((100 * me!.run.typed) / (me!.run.typed + me!.run.errs)) : 0;
  const best = read('best');
  $('ns-res').innerHTML = `<p class="ns-big ${place === 1 && seats.length > 1 ? 'win' : ''}">${seats.length > 1 ? (place === 1 ? 'Last one standing!' : `#${place} of ${seats.length}`) : 'Game over'}</p>
    <p class="ns-sub">Caught at <b>${clockOf(mine.deathT)}</b></p>
    <div class="ns-stats"><span>⭐ ${mine.sc} pts</span><span>⌨️ ${wpmOf(me!.run, mine.deathT)} wpm</span><span>🎯 ${acc}%</span><span>🔥 ${me!.run.bestCombo} combo</span><span>📜 ${me!.run.i} prompts</span></div>
    ${best && best.sc > mine.sc ? `<p class="ns-bestline">Your best: ${best.sc} pts (${clockOf(best.t)})</p>` : '<p class="ns-bestline">🎉 New personal best!</p>'}`;
  $('ns-stand').innerHTML = seats.length < 2 ? '' : list.map((x: any, k: number) => `<li class="full ${x.s.me ? 'me' : ''}" style="--k:${k}"><b>${['🥇', '🥈', '🥉'][k] ?? k + 1}</b>${x.s.svg.replace('width="30" height="30"', 'width="40" height="40"')}<span>${x.s.bot ? '🤖 ' : ''}${esc(x.s.name)}${x.s.me ? ' (you)' : ''}</span><em>${HOURS[hourOf(x.deathT)]} N${nightOf(x.deathT)}<br>${x.sc} pts</em></li>`).join('');
  show('ns-over');
}
$('ns-skip').onclick = finish;
$('ns-again').onclick = () => (mode === 'online' ? openRooms() : localGame(mode as any));
$('ns-back').onclick = menu;
$('ns-leave').onclick = () => { if (rmode === 'rounds') { const w = ws; ws = null; w?.close(); host = null; return lastRound ? finishRounds() : menu(); } if (state === 'play' && me?.run.alive) { me.run.alive = false; me.run.deathT = Math.max(0, now()); me.run.hp = 0; } const w = ws; ws = null; w?.close(); if (me && state !== 'menu' && state !== 'lobby') finish(); else menu(); };

function menu() {
  state = 'menu';
  clearInterval(lobbyTimer);
  drone?.set(0); drone2?.set(0);
  clearSeats();
  for (const a of menuAnims) a.root.visible = true;
  show('ns-menu');
  box.classList.remove('low', 'shake', 'spec', 'intro');
  box.style.setProperty('--danger', '0');
  const best = read('best');
  $('ns-best').textContent = best ? `🌙 Your best: ${best.sc} pts · survived until ${clockOf(best.t)}` : '';
}
for (const b of document.querySelectorAll<HTMLElement>('[data-ns]')) {
  b.onclick = () => {
    const m = b.dataset.ns!;
    if (m === 'solo' || m === 'bots' || m === 'rbots') localGame(m);
    if (m === 'rooms') openRooms();
  };
}

// ---------- Rounds mode ----------
function onRound(m: any) {
  R = { r: m.r, at: m.at, limit: m.limit, text: roundText(seed, m.r), c: 0, done: false, live: false, ended: false, cd: 99 };
  for (const s of seats) { s.fin = -1; s.place = 0; s.v.c = 0; s.v.i = m.r; s.dirty = true; if (m.lives) applyLives(s, m.lives[s.id] ?? 0); }
  $('ns-prompt').style.visibility = 'hidden';
  const alive = seats.filter((s) => view(s).alive).length;
  if (m.r > 1) banner(`ROUND ${m.r}`, `${alive} players left · the slowest loses a ❤️`, 1700);
  renderPlayers(true);
  updateHud();
}
function applyLives(s: Seat, n: number) {
  s.v.sc = n; s.v.hp = (n / LIVES) * 100;
  setHearts(s, n);
  if (n <= 0 && s.v.alive) { s.v.alive = false; s.v.deathT = Math.max(0, now()); }
}
function pressRound(k: string) {
  if (state !== 'play' || !R || !R.live || R.done || R.ended || !me || !view(me).alive) return;
  me.typing = 1; me.dirty = true;
  if (sameKey(k, R.text[R.c])) {
    R.c++; me.v.c = R.c;
    flashKey(k, 'ok');
    if (R.c < R.text.length) { sfx('key'); renderPrompt(); }
    else { // done: tell whoever runs the rules
      R.done = true;
      sfx('perfect');
      retrigger($('ns-prompt'), 'won');
      if (host) { const ms = roundFinish(host, 'me', Date.now()); if (ms != null) { onFin('me', ms); if (humansDone(host)) endLocal(); } }
      else ws?.readyState === 1 && ws.send(JSON.stringify({ t: 'fin', r: R.r }));
      setTimeout(() => R?.done && ($('ns-prompt').style.visibility = 'hidden'), 350);
      hintKey();
    }
  } else {
    sfx('bad'); flashKey(k, 'bad');
    const cur = $('ns-text').querySelectorAll('span')[R.c];
    cur?.classList.add('bad');
    setTimeout(() => cur?.classList.remove('bad'), 300);
    retrigger($('ns-prompt'), 'err');
    retrigger($('ns-static'), 'go');
    me.err = 1;
    flicker(0.25);
  }
  if (ws?.readyState === 1 && performance.now() - lastSend > 120) { lastSend = performance.now(); ws.send(JSON.stringify({ t: 's', i: R.r, c: R.c, hp: 100, sc: 0 })); }
}
function onFin(id: string, ms: number) {
  const s = seats.find((x) => x.id === id);
  if (!s || s.fin >= 0) return;
  s.fin = ms;
  s.place = seats.filter((x) => x.fin >= 0).length;
  s.v.c = R?.text.length ?? 0;
  s.perfect = 1; s.cheer = 1; s.dirty = true;
  if (!s.me) floater(`${s.place === 1 ? '⚡ ' : '✓ '}${(ms / 1000).toFixed(2)}s`, new THREE.Vector3(s.desk.x, 7.3, 2.2), s.place === 1 ? '#ffd23f' : '#7cff8a', 3.4);
  if (s.me) { myTimes.push(ms); pop(s.place === 1 ? `⚡ FIRST! ${(ms / 1000).toFixed(2)}s` : `✓ ${(ms / 1000).toFixed(2)}s`, s.place === 1 ? '#ffd23f' : '#7cff8a'); }
  else sfx('done');
  renderPlayers(true);
  updateHud();
}
function onRoundEnd(m: any) {
  if (!R || R.ended) return;
  R.ended = true;
  lastRound = m;
  $('ns-prompt').style.visibility = 'hidden';
  hintKey();
  const losers = (m.losers as string[]).map((id) => seats.find((s) => s.id === id)).filter(Boolean) as Seat[];
  // the animatronic of every loser lunges at their desk and steals a heart
  losers.forEach((s, k) => setTimeout(() => {
    s.attack = 0;
    sfx('step', 1); sfx('caught');
    if (!s.me) floater('💔', new THREE.Vector3(s.desk.x, 6.6, 2.2), '#ff4d6d', 4);
    else pop('💔 −1 ❤️', '#ff4d6d');
    applyLives(s, m.lives[s.id] ?? 0);
    if (s.me) { retrigger($('ns-jump'), 'go'); box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 450); if (opt.scare) sfx('scare'); }
    flicker(0.6);
    if (!view(s).alive) setTimeout(() => die(s), 1300);
    renderPlayers(true);
    updateHud();
  }, 300 + k * 450));
  for (const s of seats) if (!losers.includes(s)) applyLives(s, m.lives[s.id] ?? 0);
  const late = losers.filter((s) => (m.times[s.id] ?? -1) < 0);
  if (losers.length === 1) banner(`💔 ${losers[0].me ? 'YOU' : esc(losers[0].name)}`, late.length ? 'ran out of time and loses a heart' : 'was the slowest and loses a heart', 2600);
  else if (losers.length) banner('💔 TOO SLOW!', `${losers.length} players didn't finish in time`, 2600);
  if (m.over) setTimeout(finishRounds, 3400);
}
function endLocal() {
  if (!host || host.endedR === host.r) return;
  host.endedR = host.r;
  const m: any = roundEnd(host, seed, Date.now());
  if (!host.over && fastForward(host, seed, Date.now())) Object.assign(m, { over: true, lives: host.lives, total: host.total });
  host.nextAt = host.over ? 0 : Date.now() + ROUND_GAP;
  onRoundEnd(m);
}
function stepRounds() {
  if (!R || !me) return;
  const abs = Date.now() + offset;
  // countdown, then the same prompt appears on every screen at once
  if (!R.live && !R.ended) {
    const left = Math.ceil((R.at - abs) / 600);
    if (left !== R.cd && left > 0 && left <= 3) { R.cd = left; pop(String(left), '#ffffff'); sfx('clunk'); }
    if (abs >= R.at) {
      R.live = true;
      if (view(me).alive) { $('ns-prompt').style.visibility = 'visible'; renderPrompt(true); pop('TYPE!', '#ffffff'); sfx('go'); }
      for (const s of seats) s.dirty = true;
    }
  }
  if (R.live && !R.ended) {
    const left = (R.at + R.limit - abs) / R.limit;
    const u = $('ns-timer') as HTMLElement;
    u.style.transform = `scaleX(${clamp(left, 0, 1)})`;
    u.classList.toggle('hurry', left < 0.3);
    // bots type on their seeded schedule
    for (const s of seats) {
      if (!s.bot || !view(s).alive || s.fin >= 0) continue;
      const ms = botRoundMs(seed, +s.id.replace('bot', ''), R.r), el = abs - R.at;
      const c = Math.min(R.text.length, Math.floor((R.text.length * el) / (ms === Infinity ? R.limit * 1.3 : ms)));
      if (c !== s.v.c) { s.v.c = c; s.typing = 1; s.dirty = true; if (Math.random() < 0.04) s.err = 1; }
      if (el >= ms) onFin(s.id, ms);
    }
  }
  // offline games run the rules here
  if (host && !host.over) {
    if (host.endedR !== host.r && abs >= host.at + host.limit + 300) endLocal();
    if (host.endedR === host.r && host.nextAt && abs >= host.nextAt) { host.nextAt = 0; onRound(roundStart(host, seed, abs)); }
  }
  renderPlayers();
}
function finishRounds() {
  if (state === 'over' || !lastRound) return;
  state = 'over';
  drone?.set(0); drone2?.set(0);
  const w = ws; ws = null; w?.close();
  host = null;
  $('ns-spec').hidden = true;
  box.classList.remove('spec', 'low', 'shake', 'rounds');
  const { lives, total } = lastRound;
  const order = [...seats].sort((a, b) => (lives[b.id] ?? 0) - (lives[a.id] ?? 0) || (total?.[a.id] ?? 0) - (total?.[b.id] ?? 0));
  const place = order.indexOf(me!) + 1;
  const avg = myTimes.length ? myTimes.reduce((a, b) => a + b) / myTimes.length / 1000 : 0;
  const best = read('rbest');
  if (place === 1) write('rwins', (read('rwins') ?? 0) + 1);
  if (myTimes.length && (!best || Math.min(...myTimes) < best)) write('rbest', Math.min(...myTimes));
  $('ns-res').innerHTML = `<p class="ns-big ${place === 1 ? 'win' : ''}">${place === 1 ? '🏆 You win!' : `#${place} of ${seats.length}`}</p>
    <p class="ns-sub">${lastRound.r} rounds · ${'❤️'.repeat(lives[me!.id] ?? 0) || '💀'} left</p>
    <div class="ns-stats"><span>⚡ best ${myTimes.length ? (Math.min(...myTimes) / 1000).toFixed(2) : '—'}s</span><span>⏱️ avg ${avg ? avg.toFixed(2) : '—'}s</span><span>🏆 ${read('rwins') ?? 0} wins</span></div>`;
  $('ns-stand').innerHTML = order.map((s, k) => `<li class="full ${s.me ? 'me' : ''}" style="--k:${k}"><b>${['🥇', '🥈', '🥉'][k] ?? k + 1}</b>${s.svg.replace('width="30" height="30"', 'width="40" height="40"')}<span>${s.bot ? '🤖 ' : ''}${esc(s.name)}${s.me ? ' (you)' : ''}</span><em>${'❤️'.repeat(lives[s.id] ?? 0) || '💀'}</em></li>`).join('');
  show('ns-over');
}

// ---------- lights ----------
let flickerUntil = 0;
function flicker(sec: number) { flickerUntil = Math.max(flickerUntil, performance.now() + sec * 1000); }

// ---------- camera (drag to look around) ----------
const cam = { yaw: 0, pitch: 0.32, dist: 5.2, pos: new THREE.Vector3(0, 9, 14), look: new THREE.Vector3(0, 3, -20), spin: 0 };
let drag: { id: number; x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', (e) => {
  if (drag?.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.25, 1.2);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = () => { drag = null; canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 2.5, state === 'spec' ? 40 : 14); }, { passive: false });

function resize() {
  const rc = canvas.getBoundingClientRect();
  renderer.setSize(rc.width, rc.height, false);
  composer?.setSize(rc.width, rc.height);
  camera.aspect = rc.width / Math.max(1, rc.height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
fullscreenButton($('ns-fs'), box, () => requestAnimationFrame(resize));

// ---------- frame ----------
const clock = new THREE.Clock();
let T = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  T += dt;
  const t = now();
  const live = state === 'intro' || state === 'play' || state === 'scare' || state === 'spec';
  if (live) {
    // intro: the animatronics wake up one by one, then the camera drops to your desk
    if (state === 'intro') {
      const k = Math.floor((t + 4800) / 420);
      if (k > introStage && k <= seats.length) { introStage = k; sfx('clunk'); }
      if (t >= -2600 && introStage < 90) { introStage = 90; rmode === 'rounds' ? banner('ROUND 1', 'Same words for everyone · the slowest loses a ❤️', 2400) : banner(`Night 1`, '12:00 AM', 2400); }
      if (t >= 0) {
        state = 'play';
        box.classList.remove('intro');
        if (rmode === 'surv') { $('ns-prompt').style.visibility = 'visible'; renderPrompt(true); sfx('go'); pop('TYPE!', '#ffffff'); }
        cam.yaw = 0; cam.pitch = 0.32; cam.dist = 5.2;
      }
    }
    if (rmode === 'rounds') { stepRounds(); if (me && state === 'play') { updateHud(); const d = danger(me); if (d > 0.62 && T > heartAt) { sfx('heart'); heartAt = T + lerp(1.1, 0.55, (d - 0.62) / 0.38); } } }
    if (state !== 'intro' && rmode === 'rounds') { /* rounds: rules above */ }
    else if (state !== 'intro') {
      // the clock: a chime every hour, a party at 6 AM
      const h = Math.floor(t / HOUR);
      if (h !== lastHour && lastHour >= 0 && me && view(me).alive) {
        if (hourOf(t) === 0) { sfx('six'); banner('6 AM', `🎉 Night ${nightOf(t) - 1} survived! Night ${nightOf(t)} begins…`, 3600); flicker(0.2); }
        else { sfx('hour'); banner(HOURS[hourOf(t)], '', 1800); }
      }
      lastHour = h;
      for (const s of seats) {
        if (s.me && s.run.alive && state === 'play') {
          const ev = s.run.tick(t);
          if (ev === 'timeout') onTimeout(s);
          if (ev === 'dead') die(s);
        }
        if (s.bot && s.run.alive) {
          for (const ev of s.run.advance(t)) {
            if (ev === 'bad' || ev === 'timeout') s.err = 1;
            if (ev === 'perfect') s.perfect = 1;
            if (ev === 'dead' && s.grab < 0) die(s);
          }
          s.typing = 1;
          s.dirty = true;
        }
      }
      if (me && state === 'play') {
        const r = me.run, left = (r.deadline - t) / (r.deadline - r.start);
        const u = $('ns-timer') as HTMLElement;
        u.style.transform = `scaleX(${clamp(left, 0, 1)})`;
        u.classList.toggle('hurry', left < 0.3);
        updateHud();
        // heartbeat and the music box when it gets close
        const d = danger(me);
        if (d > 0.62 && T > heartAt) { sfx('heart'); heartAt = T + lerp(1.1, 0.55, (d - 0.62) / 0.38); }
        if (d > 0.8 && T > boxAt) { sfx('box'); boxAt = T + 9; }
        drone?.set(0.04 + d * 0.05);
      }
      renderPlayers();
      // only bots left? they can be skipped. Nobody left? results.
      if (state === 'spec' && rmode === 'surv') {
        $('ns-skip').hidden = seats.some((s) => s.remote && view(s).alive);
        if (!finishing && !seats.some((s) => !s.me && view(s).alive)) { finishing = true; setTimeout(finish, 1500); }
      }
    }
    // seats: avatars typing, desks, animatronics creeping in steps
    for (const s of seats) {
      const v = view(s);
      s.typing = Math.max(0, s.typing - dt * 4);
      s.err = Math.max(0, s.err - dt * 1.5);
      s.perfect = Math.max(0, s.perfect - dt * 1.2);
      s.cheer = Math.max(0, s.cheer - dt * 0.8);
      if (s.rig && s.grab < 0 && s.cheer > 0) { s.rig.armL.rotation.x = s.rig.armR.rotation.x = -2.9 + Math.sin(T * 14) * 0.25; s.rig.head.rotation.x = -0.2; }
      else if (s.rig && s.grab < 0) {
        const a = -1.2 + Math.sin(T * 28) * 0.12 * s.typing;
        s.rig.armL.rotation.x = a; s.rig.armR.rotation.x = -1.2 - Math.sin(T * 28) * 0.12 * s.typing;
        s.rig.head.rotation.x = 0.12 + (v.alive ? Math.sin(T * 1.3 + s.k) * 0.03 : 0);
        s.rig.head.rotation.y = s.err > 0.5 ? Math.sin(T * 40) * 0.15 : 0;
      }
      // the desk lamp flickers with the power
      if (v.alive) s.desk.lamp.intensity = (s.me ? 14 : 16) * (v.hp < 35 && Math.random() < 0.08 ? 0.15 : 1) * (s.err > 0.6 && Math.random() < 0.5 ? 0.2 : 1);
      if (s.desk.glowL) s.desk.glowL.color.set(!v.alive ? '#ff2020' : s.perfect > 0.2 ? '#ffd23f' : s.err > 0.4 ? '#ff4040' : '#57ff7a');
      if ((s.dirty && performance.now() - s.lastDraw > 90) || (!v.alive && performance.now() - s.lastDraw > 140)) { drawMonitor(s, Math.max(0, t)); s.dirty = false; s.lastDraw = performance.now(); }
      // animatronic
      const A = s.anim;
      if (s.grab >= 0) { // caught: walks to the desk, grabs the player and drags them to the stage
        s.grab += dt;
        const desk = new THREE.Vector3(s.desk.x + 1.2, 0, 0.2);
        if (s.grab < 1.2) A.root.position.lerp(desk, Math.min(1, dt * 6));
        else if (s.grab < 4.5) { A.root.position.lerp(new THREE.Vector3(s.stageX, 0, -27), Math.min(1, dt * 0.9)); }
        else A.root.position.y -= dt * 3;
        A.root.lookAt(s.grab < 1.2 ? s.desk.x : s.stageX, A.root.position.y, s.grab < 1.2 ? 2 : -30);
        A.jaw.rotation.x = 0.5 + Math.sin(T * 20) * 0.15;
        A.armL.rotation.x = A.armR.rotation.x = -1.4;
        if (s.rig && s.grab > 1.1 && !(s.me && opt.scare && state === 'scare')) {
          s.rig.root.position.copy(A.root.position).add(new THREE.Vector3(0, 3.6, 0.6));
          s.rig.root.rotation.set(-Math.PI / 2.2, A.root.rotation.y, 0);
          s.rig.armL.rotation.x = s.rig.armR.rotation.x = -2.8 + Math.sin(T * 12) * 0.4;
          s.rig.legL.rotation.x = Math.sin(T * 14) * 0.5; s.rig.legR.rotation.x = -Math.sin(T * 14) * 0.5;
        }
        if (s.grab > 5.5) { A.root.visible = false; if (s.rig) s.rig.root.visible = false; }
      } else if (s.attack >= 0) { // Rounds: lunges at the desk, roars, steals a heart, slinks back
        s.attack += dt;
        const front = new THREE.Vector3(s.desk.x + 0.4, 0, -2.2);
        if (s.attack < 0.3) A.root.position.lerp(front, Math.min(1, dt * 16));
        A.root.lookAt(s.desk.x, A.root.position.y, 2);
        A.jaw.rotation.x = 0.7 + Math.sin(T * 40) * 0.12;
        A.head.rotation.z = Math.sin(T * 45) * 0.12;
        A.armL.rotation.x = A.armR.rotation.x = -1.7 + Math.sin(T * 20) * 0.2;
        A.eyes.emissiveIntensity = 9;
        if (s.rig) s.rig.root.position.x = s.desk.x + Math.sin(T * 60) * 0.06; // the player shakes
        if (s.attack > 1.5) { s.attack = -1; s.pos.copy(animTarget(s, danger(s))); if (s.rig) s.rig.root.position.x = s.desk.x; }
      } else if (!(s.me && state === 'scare')) {
        const target = animTarget(s, danger(s));
        if (T > s.nextStep) { // they never glide: they *appear* closer
          s.nextStep = T + 0.7 + Math.random() * 1.3;
          const gap = target.distanceTo(s.pos);
          if (gap > 0.4) {
            s.pos.lerp(target, Math.min(1, 4.2 / gap));
            if (s.pos.z > -27) s.pos.y = 0;
            const near = s.pos.distanceTo(camera.position);
            sfx('step', clamp(1.4 - near / 25, 0.1, 1));
            if (s.me) flicker(0.25);
          }
        }
        A.root.position.lerp(s.pos, Math.min(1, dt * 14));
        const look = new THREE.Vector3(s.desk.x, A.root.position.y, 2);
        A.root.lookAt(look);
        const d = danger(s);
        A.head.rotation.z = Math.sin(T * 0.7 + s.k * 2) * 0.08 + (Math.random() < 0.01 ? (Math.random() - 0.5) * 0.5 : 0); // servo twitch
        A.head.rotation.x = d > 0.7 ? -0.15 : 0;
        A.jaw.rotation.x = d > 0.75 ? 0.15 + Math.abs(Math.sin(T * 6)) * 0.2 : 0;
        A.eyes.emissiveIntensity = (state === 'intro' && s.k >= introStage ? 0 : 1) * (1 + d * 5) * (d > 0.75 && Math.random() < 0.1 ? 0.2 : 1);
        A.armL.rotation.x = A.armR.rotation.x = d > 0.85 ? -0.9 - Math.sin(T * 3) * 0.1 : -0.1;
      }
    }
    // jumpscare: it is right in your face
    if (state === 'scare' && me) {
      scareT += dt;
      const A = me.anim;
      if (opt.scare && scareT < 1.5) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const k = Math.min(1, scareT / 0.25);
        const p = camera.position.clone().addScaledVector(fwd, lerp(4.5, 1.6, k));
        p.y = camera.position.y - 7.4 + Math.sin(scareT * 50) * 0.08;
        A.root.position.copy(p);
        A.root.lookAt(camera.position.x, p.y, camera.position.z);
        A.root.visible = true;
        A.jaw.rotation.x = 0.75 + Math.sin(scareT * 40) * 0.12;
        A.head.rotation.z = Math.sin(scareT * 47) * 0.12;
        A.eyes.emissiveIntensity = 9;
        A.armL.rotation.x = A.armR.rotation.x = -1.6;
      } else if (scareT >= 1.5 || !opt.scare) {
        A.root.position.set(me.stageX, 2, -31);
        afterScare();
      }
    }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    f.o.position.y += f.vy * dt;
    f.o.material.opacity = Math.min(1, 3 - f.t * 1.4);
    f.o.scale.multiplyScalar(f.t < 0.2 ? 1 + dt * 3 : 1);
    if (f.t > 2.2) { scene.remove(f.o); f.o.material.map?.dispose(); f.o.material.dispose(); floaters.splice(i, 1); }
  }
  // lights
  const fl = performance.now() < flickerUntil;
  const lowPower = me && view(me).alive && view(me).hp < 35 && rmode === 'surv';
  for (const l of lamps) { l.intensity = l.userData.base * (fl ? (Math.random() < 0.5 ? 0.05 : 0.7) : lowPower && Math.random() < 0.03 ? 0.1 : 1) * (state === 'menu' ? 0.4 : 1); l.userData.bulb.material.emissiveIntensity = l.intensity / 15; }
  for (const s of stageSpots) s.intensity = s.userData.base * (fl && Math.random() < 0.5 ? 0.1 : 1);
  // camera
  let target: THREE.Vector3, pos: THREE.Vector3;
  if (state === 'menu' || state === 'lobby' || state === 'over') {
    const a = T * 0.08;
    target = new THREE.Vector3(0, 4, -24);
    pos = new THREE.Vector3(Math.sin(a) * 9, 6 + Math.sin(T * 0.3), -8 + Math.cos(a) * 4);
  } else if (state === 'intro' && me) {
    const k = clamp((t + 2600) / 2400, 0, 1), e = k * k * (3 - 2 * k);
    const stagePos = new THREE.Vector3(0, 5.5, -18), stageLook = new THREE.Vector3(0, 6, -31);
    const deskPos = new THREE.Vector3(me.desk.x + 1.3, 7.4, 5.7), deskLook = new THREE.Vector3(me.desk.x + 1.3, 4.4, -3.2);
    pos = stagePos.clone().lerp(deskPos, e).add(new THREE.Vector3(0, Math.sin(e * Math.PI) * 4, 0));
    target = stageLook.clone().lerp(deskLook, e);
  } else if (state === 'spec' || !me) {
    if (!drag) cam.spin += dt * 0.08;
    const d = Math.max(cam.dist, 16);
    target = new THREE.Vector3(0, 3, -6);
    pos = target.clone().add(new THREE.Vector3(Math.sin(cam.yaw + cam.spin) * d, 4 + cam.pitch * 10, Math.cos(cam.yaw + cam.spin) * d));
  } else {
    // behind your shoulder; drag to look around the whole room
    const P = new THREE.Vector3(me.desk.x + 1.3, 4.6, 0.8); // over the right shoulder
    const d = cam.dist;
    pos = P.clone().add(new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, Math.sin(cam.pitch) * d + 1.2, Math.cos(cam.yaw) * Math.cos(cam.pitch) * d));
    target = P.clone().add(new THREE.Vector3(-Math.sin(cam.yaw) * 4, -0.2, -Math.cos(cam.yaw) * 4));
    if (!drag) { cam.yaw *= 1 - Math.min(1, dt * 0.25); } // drift back to the monitor
    if (me.err > 0.6) pos.add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0));
  }
  const kk = state === 'intro' ? 1 : Math.min(1, dt * 5);
  cam.pos.lerp(pos, kk);
  cam.look.lerp(target, kk);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  const fov = state === 'scare' ? 74 : 62;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// a few animatronics on stage behind the menu
const menuAnims: Anim[] = [];
function menuScene() {
  menuAnims.push(...KINDS.map((k) => makeAnim(k)));
  menuAnims.forEach((a, k) => { a.root.position.set((k - 1.5) * 5.2, 2, -31); a.eyes.emissiveIntensity = 2; scene.add(a.root); });
}

resize();
menuScene();
menu();
frame();
const room = params.get('room');
if (room && /^[A-Z0-9]{5}$/.test(room)) {
  $('ns-joinbox').hidden = false;
  $('ns-join').onclick = () => { $('ns-joinbox').hidden = true; mode = 'online'; ($('ns-link') as HTMLInputElement).value = location.href; $('ns-invite').hidden = false; connect(room, false, 'rounds'); };
}
