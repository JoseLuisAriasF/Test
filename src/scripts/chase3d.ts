// Blox Chase renderer: the 2D fight drawn as a cinematic 2.5D stage (three.js), shared by the game and the guide.
// Same look as Night Shift: ACES tone mapping + bloom, emissive weapons, procedural animation on the player's own
// Roblox-style avatar. The fight itself lives in lib/chase.js; this file only draws fighter states.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CHARS, MAPS, hasArmor, isInv, chargeLevel } from '../lib/chase.js';
import { buildAvatar, type Rig } from './avatar3d.ts';
import { studTexture, studBox } from './gamekit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (u: number) => 1 - (1 - clamp(u, 0, 1)) ** 3;
export const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

// ---------- renderer (one per page; the guide draws several stages with it) ----------
export function makeRenderer(canvas: HTMLCanvasElement, low = touch) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let composer: EffectComposer | null = null, rp: RenderPass | null = null, bloom: UnrealBloomPass | null = null;
  if (!low) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    rp = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.72);
    composer.addPass(rp); composer.addPass(bloom); composer.addPass(new OutputPass());
  }
  const studs = studTexture(renderer);
  return {
    renderer, studs, low,
    get bloom() { return !!composer; },
    dropBloom() { composer = null; renderer.shadowMap.enabled = false; renderer.setPixelRatio(1); }, // adaptive quality
    setSize(w: number, h: number) { renderer.setSize(w, h, false); composer?.setSize(w, h); },
    draw(stage: Stage) {
      if (composer && rp) { rp.scene = stage.scene; rp.camera = stage.camera; composer.render(); }
      else renderer.render(stage.scene, stage.camera);
    },
  };
}
export type R = ReturnType<typeof makeRenderer>;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const glowMat = (color: string, k = 2.5) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: k });
const addMat = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// ---------- maps ----------
const THEMES = [
  { sky: ['#1a0b24', '#5b1f3a', '#ff7a3d'], fog: '#3a1426', ground: '#6b6f7a', plat: '#7a4a2a', trim: '#ffb02e', hemi: ['#ffd2a8', '#2a1022'], sun: '#ffb27a' },
  { sky: ['#2a7fd8', '#6ec6ff', '#e6f7ff'], fog: '#bfe6ff', ground: '#4caf50', plat: '#5fbf4a', trim: '#ffffff', hemi: ['#ffffff', '#6a8a5a'], sun: '#fff4dc' },
  { sky: ['#04040e', '#12082e', '#3a1270'], fog: '#120a2a', ground: '#15142a', plat: '#1d1b3a', trim: '#ff3cf2', hemi: ['#8a7dff', '#0a0618'], sun: '#a68cff' },
  { sky: ['#06142b', '#1f4f86', '#9fd3ff'], fog: '#5d8fbf', ground: '#dbe9f5', plat: '#9fd6f5', trim: '#7df3ff', hemi: ['#e6f6ff', '#30506e'], sun: '#dff3ff' },
];
function buildMap(scene: THREE.Scene, mi: number, R: R) {
  const map = MAPS[mi], th = THEMES[mi];
  const W = map.x1 - map.x0, cx = (map.x0 + map.x1) / 2;
  scene.background = canvasTex(4, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(1, th.sky[2]); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
  scene.fog = new THREE.Fog(th.fog, mi === 2 ? 35 : 45, mi === 2 ? 110 : 140);
  scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], mi === 2 ? 1.1 : 1.5));
  const sun = new THREE.DirectionalLight(th.sun, mi === 2 ? 1.2 : 2.2);
  sun.position.set(cx - 20, 40, 30);
  sun.castShadow = R.renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -W / 2 - 4, right: W / 2 + 4, top: 30, bottom: -6, near: 1, far: 120 });
  sun.target.position.set(cx, 0, 0);
  scene.add(sun, sun.target);
  const studMat = (c: string, o = {}) => std(c, { map: R.studs, ...o });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const o = new THREE.Mesh(studBox(w, h, d), m);
    o.position.set(x, y, z);
    o.receiveShadow = shadow; o.castShadow = shadow;
    scene.add(o);
    return o;
  };
  // floor: a thick slab, the fight happens on its front edge (z = 0)
  box(W + 40, 4, 18, studMat(th.ground, { roughness: mi === 3 ? 0.25 : 0.8, metalness: mi === 3 ? 0.1 : 0 }), cx, -2, -5).castShadow = false;
  // walls at the edges
  const wallMat = studMat(mi === 1 ? '#8a6a4a' : mi === 2 ? '#1a1830' : mi === 3 ? '#b9d8ee' : '#4b4553');
  for (const x of [map.x0 - 1.5, map.x1 + 1.5]) box(3, 40, 10, wallMat, x, 20, -3);
  // platforms with a glowing (or golden) trim
  const platMat = studMat(th.plat), trimMat = mi === 2 || mi === 3 ? glowMat(th.trim, mi === 2 ? 1.4 : 1.2) : std(th.trim, { metalness: 0.7, roughness: 0.3 });
  for (const [px, top, w] of map.plats) {
    box(w, 1.2, 6, platMat, px + w / 2, top - 0.6, -1.5);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, 0.2), trimMat);
    t.position.set(px + w / 2, top - 0.05, 1.55);
    scene.add(t);
    if (mi === 1) box(w * 0.7, 2.2, 4, studMat('#7a5536'), px + w / 2, top - 2.3, -1.5); // floating island dirt
  }
  const rnd = (() => { let s = mi * 977 + 13; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const props = new THREE.Group();
  scene.add(props);
  if (mi === 0) { // castle wall, towers, banners, torches
    const stone = studMat('#5a5463');
    box(W + 30, 18, 2, stone, cx, 9, -16, false);
    for (let i = 0; i < 18; i++) box(2.4, 2, 2, stone, map.x0 - 12 + i * 5, 19, -16, false);
    for (const x of [map.x0 - 6, cx, map.x1 + 6]) { box(8, 30, 8, stone, x, 15, -22, false); box(9, 1.5, 9, studMat('#8b1e2d'), x, 30.5, -22, false); }
    for (let i = 0; i < 6; i++) {
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), std(i % 2 ? '#a3122a' : '#e0a21b', { side: THREE.DoubleSide, emissive: i % 2 ? '#3a0510' : '#3a2805' }));
      bn.position.set(map.x0 + 5 + i * (W - 10) / 5, 11, -14.9);
      props.add(bn);
    }
    for (const x of [map.x0 + 8, map.x1 - 8]) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glowMat('#ff8a2a', 4));
      fl.position.set(x, 8, -14.5); props.add(fl);
      const pl = new THREE.PointLight('#ff8a3a', 30, 26, 1.6); pl.position.set(x, 8, -12); scene.add(pl);
    }
    const sunDisk = new THREE.Mesh(new THREE.CircleGeometry(9, 32), glowMat('#ffb36b', 1.4));
    sunDisk.position.set(cx + 22, 22, -80); scene.add(sunDisk);
  } else if (mi === 1) { // clouds and far floating islands
    const cloud = std('#ffffff', { roughness: 1, emissive: '#8fb8d8', emissiveIntensity: 0.25 });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rnd() * 2.5, 12, 10), cloud); s.position.set(k * 2.6 - 4, rnd() * 1.5, rnd()); g.add(s); }
      g.position.set(map.x0 - 30 + rnd() * (W + 60), 8 + rnd() * 26, -30 - rnd() * 40);
      props.add(g);
    }
    for (let i = 0; i < 6; i++) {
      const x = map.x0 - 20 + rnd() * (W + 40), y = 6 + rnd() * 20, z = -35 - rnd() * 30, w = 6 + rnd() * 10;
      box(w, 2, 6, studMat('#5fbf4a'), x, y, z, false); box(w * 0.6, 3, 4, studMat('#7a5536'), x, y - 2.4, z, false);
    }
  } else if (mi === 2) { // neon city
    const winTex = canvasTex(64, 128, (g) => { g.fillStyle = '#05050c'; g.fillRect(0, 0, 64, 128); for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10) if (Math.random() < 0.22) { g.fillStyle = ['#ff3cf2', '#3cf2ff', '#ffe23c', '#ffffff'][(x + y) % 4]; g.fillRect(x, y, 5, 6); } });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    for (let i = 0; i < 22; i++) {
      const h = 14 + rnd() * 40, w = 5 + rnd() * 7;
      const m = new THREE.MeshStandardMaterial({ color: '#0a0a16', emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.32 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), m);
      b.position.set(map.x0 - 30 + i * ((W + 60) / 21), h / 2 - 2, -42 - rnd() * 30);
      props.add(b);
    }
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(W + 30, 0.08, 0.12), glowMat(['#ff3cf2', '#3cf2ff'][i], 1.2)); r.position.set(cx, 0.02, 3.6 - i * 7); scene.add(r); }
    const moon = new THREE.Mesh(new THREE.CircleGeometry(6, 32), glowMat('#c9b8ff', 1.2)); moon.position.set(cx - 25, 30, -90); scene.add(moon);
  } else { // frost temple: ice pillars, a big gate, snow
    const ice = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.1, transmission: 0.4, thickness: 2, emissive: '#2a6c9a', emissiveIntensity: 0.4 });
    for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 26, 8), ice); p.position.set(map.x0 - 4 + i * ((W + 8) / 8), 13, -14); props.add(p); }
    box(W + 20, 3, 4, studMat('#e6f4ff'), cx, 27, -14, false);
    const gate = new THREE.Mesh(new THREE.TorusGeometry(10, 0.6, 10, 40, Math.PI), glowMat('#7df3ff', 1.8)); gate.position.set(cx, 4, -24); props.add(gate);
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(8 + rnd() * 8, 20 + rnd() * 20, 6), std('#e8f3fb', { flatShading: true })); m.position.set(map.x0 - 30 + i * ((W + 60) / 4), 6, -70); props.add(m); }
  }
  // ambient floating motes: embers, petals, neon dust, snow
  const N = touch ? 120 : 320, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = map.x0 - 10 + rnd() * (W + 20); pos[i * 3 + 1] = rnd() * 34; pos[i * 3 + 2] = -18 + rnd() * 26; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: ['#ffae5c', '#ffffff', '#c27cff', '#ffffff'][mi], size: mi === 3 ? 0.35 : 0.22, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(motes);
  return { motes, props, fall: mi === 3 ? -0.06 : mi === 0 ? 0.03 : 0.01 };
}

// ---------- weapons (attached to the hands) ----------
function weapon(kind: string, col: string, glow: string) {
  const r = new THREE.Group(), l = new THREE.Group();
  const metal = std('#d8dde8', { metalness: 0.9, roughness: 0.25 }), dark = std('#2a2733', { metalness: 0.5, roughness: 0.4 }), g = glowMat(glow, 2.2), c = std(col, { metalness: 0.4, roughness: 0.4 });
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, p: THREE.Group, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  if (kind === 'daggers' || kind === 'claws') {
    for (const p of [r, l]) {
      mesh(B(0.3, 0.3, 0.5), dark, p, 0, 0, 0.1);
      if (kind === 'daggers') { mesh(B(0.1, 0.32, 1.7), metal, p, 0, 0, 1.1); mesh(B(0.06, 0.1, 1.6), g, p, 0, -0.17, 1.1); }
      else for (let k = -1; k <= 1; k++) { mesh(B(0.09, 0.16, 2.0), metal, p, k * 0.26, 0, 1.2).rotation.y = k * 0.18; mesh(B(0.05, 0.08, 1.9), g, p, k * 0.26, -0.1, 1.2).rotation.y = k * 0.18; }
    }
  } else if (kind === 'nodachi') { // a long, thin katana
    mesh(B(0.22, 0.22, 1.2), dark, r, 0, 0, 0);
    mesh(B(0.7, 0.12, 0.7), c, r, 0, 0, 0.6);
    mesh(B(0.08, 0.26, 5.6), metal, r, 0, 0.05, 3.5);
    mesh(B(0.1, 0.08, 5.4), g, r, 0, -0.12, 3.5);
  } else if (kind === 'greatsword' || kind === 'runesword') {
    const big = kind === 'greatsword';
    mesh(B(0.25, 0.25, 0.9), dark, r, 0, 0, -0.1);
    mesh(B(1.4, 0.3, 0.3), c, r, 0, 0, 0.4);
    mesh(B(0.18, big ? 0.9 : 0.5, big ? 5.4 : 3.6), metal, r, 0, 0, big ? 3.2 : 2.3);
    mesh(B(0.2, 0.12, big ? 5.2 : 3.4), g, r, 0, big ? -0.42 : -0.24, big ? 3.2 : 2.3);
    if (!big) { const ring = mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 24), g, l, 0, -0.3, 0.6); ring.rotation.x = Math.PI / 2; }
  } else if (kind === 'staff') {
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.5, 8), c, r, 0, 0, 0.6).rotation.x = Math.PI / 2;
    for (const z of [-3.1, 4.3]) mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 8), g, r, 0, 0, z).rotation.x = Math.PI / 2;
  } else if (kind === 'gauntlets' || kind === 'spirit') {
    for (const p of [r, l]) {
      mesh(B(1.1, 0.9, 1.1), kind === 'gauntlets' ? c : dark, p, 0, 0.2, 0);
      mesh(new THREE.SphereGeometry(kind === 'gauntlets' ? 0.45 : 0.55, 12, 10), g, p, 0, -0.35, 0.2);
    }
  } else if (kind === 'bow' || kind === 'twinbow') {
    for (const p of kind === 'bow' ? [l] : [l, r]) {
      const s = kind === 'bow' ? 1 : 0.75;
      const arc = mesh(new THREE.TorusGeometry(1.6 * s, 0.09, 6, 24, Math.PI), c, p, 0, 0, 0.3);
      arc.rotation.set(0, Math.PI / 2, Math.PI / 2);
      mesh(B(0.04, 3.2 * s, 0.04), g, p, 0, 0, -0.2);
    }
  } else if (kind === 'cannon') {
    mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.2, 12), c, r, 0, 0, 1.1).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.62, 0.1, 6, 20), g, r, 0, 0, 2.6);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), g, r, 0, 0.6, 0.4);
  }
  return { r, l };
}

// ---------- hero costumes: each hero reads at a glance, whatever avatar the player wears ----------
function costume(rig: Rig, hero: string, col: string, glow: string) {
  const c = std(col, { roughness: 0.6 }), dark = std(new THREE.Color(col).multiplyScalar(0.35).getStyle(), { roughness: 0.8 }), g = glowMat(glow, 1.6);
  const metal = std('#c9ced8', { metalness: 0.85, roughness: 0.3 }), gold = std('#e0a21b', { metalness: 0.8, roughness: 0.3 });
  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; p.add(o); return o; };
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // class colours on the torso, upper arms and legs
  for (const o of rig.root.children) if ((o as THREE.Mesh).isMesh && Math.abs(o.position.y - 3) < 0.01) (o as THREE.Mesh).material = c;
  for (const a of [rig.armL, rig.armR]) (a.children[0] as THREE.Mesh).material = c;
  for (const l of [rig.legL, rig.legR]) for (const m of l.children) (m as THREE.Mesh).material = dark;
  add(rig.root, B(2.1, 0.3, 1.1), hero === 'Valdren' || hero === 'Aldric' ? gold : dark, 0, 2.15, 0); // belt
  const h = rig.head;
  if (hero === 'Kael') { // shadow thief: hood and a mask
    add(h, B(1.45, 0.5, 1.45), dark, 0, 0.62, -0.05);
    add(h, B(1.45, 1.2, 0.3), dark, 0, 0.1, -0.68);
    add(h, B(1.32, 0.42, 0.12), dark, 0, -0.32, 0.66);
    add(rig.root, B(0.6, 1.6, 0.12), c, 0.4, 4.1, -0.6, 0.3); // scarf tail
  } else if (hero === 'Valdren') { // immortal duelist: long red hair, horned circlet, pauldrons
    add(h, B(1.4, 1.9, 0.4), std('#b91c1c', { roughness: 0.8 }), 0, -0.2, -0.7);
    add(h, B(1.38, 0.14, 1.38), gold, 0, 0.45, 0);
    for (const sx of [-1, 1]) { add(h, new THREE.ConeGeometry(0.16, 0.8, 8), gold, sx * 0.55, 0.85, 0.3, 0, -sx * 0.5); add(rig.root, B(1.2, 0.5, 1.3), metal, sx * 1.55, 4.25, 0, 0, sx * -0.25); }
  } else if (hero === 'Shin') { // martial artist: headband with tails, sash
    add(h, B(1.36, 0.2, 1.36), c, 0, 0.32, 0);
    add(h, B(0.15, 0.7, 0.05), c, 0.25, 0.0, -0.72, 0, 0.3); add(h, B(0.15, 0.6, 0.05), c, 0.45, 0.05, -0.72, 0, 0.5);
    add(rig.root, B(2.15, 0.25, 1.12), g, 0, 2.5, 0, 0, 0.18);
  } else if (hero === 'Sylra') { // elf archer: pointy ears, long braid, leaf circlet
    for (const sx of [-1, 1]) add(h, new THREE.ConeGeometry(0.14, 0.7, 6), std('#ffdbb8'), sx * 0.75, 0.05, 0, 0, -sx * 1.25);
    add(h, B(0.4, 0.4, 0.4), std('#f2d16b'), 0, 0.2, -0.8); add(h, B(0.3, 1.8, 0.3), std('#f2d16b'), 0, -0.9, -0.85);
    add(h, B(1.38, 0.12, 1.38), g, 0, 0.42, 0);
  } else if (hero === 'Aldric') { // rune knight: open helmet with a crest, tabard
    add(h, B(1.45, 0.5, 1.45), metal, 0, 0.55, 0); add(h, B(0.18, 0.5, 1.6), c, 0, 1.0, -0.1);
    for (const sx of [-1, 1]) add(h, B(0.14, 1.2, 1.4), metal, sx * 0.72, 0.05, -0.05);
    add(rig.root, B(1.0, 1.6, 0.08), c, 0, 2.9, 0.53); add(rig.root, new THREE.OctahedronGeometry(0.22), g, 0, 3.4, 0.6);
  }
}

// ---------- fighter views ----------
type FV = {
  id: string; ch: string; g: THREE.Group; flip: THREE.Group; yaw: THREE.Group; rig: Rig | null; mats: THREE.MeshLambertMaterial[];
  ring: THREE.Mesh; veilK?: number; flash: number; armorPulse: number; lastSt: string; lastMv: string; lastAj: number; jumpFlip: number; trailT: number; dead: number; me: boolean;
};
const FLASH = new THREE.Color('#ffffff'), ARMOR = new THREE.Color('#ff2a2a');

// ---------- effects ----------
type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; s: number };
type Flash = { mesh: THREE.Mesh; life: number; max: number; grow: number };
const PROJ_COL: Record<string, string> = { arrow: '', rain: '', star: '#d6c8ff', chakram: '#7dd3fc', wave: '#ff6a3a', fire: '#ff7a1a', orb: '#6ee7b7', rune: '#93c5fd', bolt: '#a5f3fc', storm: '#b6ffcf' };

export class Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400);
  mi: number;
  fighters = new Map<string, FV>();
  sparks: Spark[] = [];
  flashes: Flash[] = [];
  ghosts: { o: THREE.Object3D; m: THREE.MeshBasicMaterial; life: number }[] = [];
  projMeshes = new Map<any, THREE.Object3D>();
  shake = 0;
  zoom = { k: 0, x: 0, y: 0, until: 0 };
  cam = { x: 0, y: 6, w: 34 };
  t = 0;
  private sparkPts: THREE.Points;
  private sparkPos: Float32Array;
  private sparkCol: Float32Array;
  private env: ReturnType<typeof buildMap>;
  constructor(public R: R, mi: number) {
    this.mi = mi;
    this.env = buildMap(this.scene, mi, R);
    const N = 900;
    this.sparkPos = new Float32Array(N * 3);
    this.sparkCol = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkPts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);
    const m = MAPS[mi];
    this.cam.x = (m.x0 + m.x1) / 2;
  }

  async addFighter(id: string, ch: string, avatar: any, me = false) {
    const c = CHARS[ch];
    const g = new THREE.Group(), flip = new THREE.Group(), yaw = new THREE.Group();
    flip.position.y = 2.5; yaw.position.y = -2.5;
    g.add(flip); flip.add(yaw);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32), addMat(me ? '#ffffff' : c.col, 0.55));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    this.scene.add(g);
    const fv: FV = { id, ch, g, flip, yaw, rig: null, mats: [], ring, flash: 0, armorPulse: 0, lastSt: '', lastMv: '', lastAj: 0, jumpFlip: 0, trailT: 0, dead: 0, me };
    this.fighters.set(id, fv);
    const rig = await buildAvatar(avatar);
    costume(rig, c.hero, c.col, c.glow);
    const w = weapon(c.weapon, c.col, c.glow);
    w.r.position.set(0, -1.9, 0); w.l.position.set(0, -1.9, 0);
    rig.armR.add(w.r); rig.armL.add(w.l);
    if (c.tier >= 3) { // a cape in the class colour for the advanced jobs
      const cape = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.12), std(c.col, { roughness: 0.9, emissive: c.col, emissiveIntensity: 0.15 }));
      cape.position.set(0, 2.9, -0.62); cape.rotation.x = 0.12; cape.castShadow = true;
      rig.root.add(cape);
    }
    rig.root.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; if (o.material?.isMeshLambertMaterial) fv.mats.push(o.material); else if (Array.isArray(o.material)) fv.mats.push(...o.material.filter((m: any) => m.isMeshLambertMaterial)); } });
    for (const mt of fv.mats) { mt.userData.e0 = mt.emissive.clone(); mt.userData.k0 = mt.emissiveIntensity; }
    yaw.add(rig.root);
    fv.rig = rig;
    return fv;
  }
  removeFighter(id: string) { const fv = this.fighters.get(id); if (fv) { this.scene.remove(fv.g); this.fighters.delete(id); } }

  // ---------- effects API ----------
  burst(x: number, y: number, color: string, n = 18, speed = 0.35, size = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.sparks.length < 900; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      this.sparks.push({ x, y, z: (Math.random() - 0.5) * 1.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.5) * s, life: 0, max: 0.25 + Math.random() * 0.35, c, s: size });
    }
  }
  dust(x: number, y: number) { this.burst(x, y + 0.2, this.mi === 3 ? '#ffffff' : '#c8b8a0', 8, 0.12); }
  hit(x: number, y: number, color: string, big = false) {
    this.burst(x, y, '#ffffff', big ? 26 : 12, big ? 0.6 : 0.4);
    this.burst(x, y, color, big ? 30 : 14, big ? 0.5 : 0.3);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.6, 24), addMat(big ? '#ffffff' : color, 0.9));
    ring.position.set(x, y, 0.8);
    this.scene.add(ring);
    this.flashes.push({ mesh: ring, life: 0, max: big ? 0.28 : 0.18, grow: big ? 9 : 5 });
    this.shake = Math.max(this.shake, big ? 0.9 : 0.35);
  }
  // the visible shape of a melee hitbox: an arc slash, a beam (very wide) or a pillar of light (very tall)
  swing(rect: number[], face: number, color: string, anim = '') {
    const upward = anim === 'upper' || anim === 'slash2';
    const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0;
    let mesh: THREE.Mesh, grow = 0.6;
    if (w > 12) { mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.6), addMat(color, 0.95)); mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.5); grow = 0.1; }
    else if (['stab', 'stab2', 'thrust', 'palm', 'palm2'].includes(anim)) { // a straight streak
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 1, anim.startsWith('palm') ? h * 0.7 : 0.35), addMat(color, 0.95));
      mesh.position.set((x0 + x1) / 2, y0 + h * 0.5, 0.6); grow = anim.startsWith('palm') ? 0.6 : 0.05;
    } else if (anim === 'claw' || anim === 'claw2') { // three claw marks
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), addMat(color, 0));
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(w, h) * 0.8, 0.22), addMat(color, 0.95));
        st.position.set((x0 + x1) / 2 + (i - 1) * 0.6, y0 + h / 2, 0.6); st.rotation.z = (anim === 'claw' ? -0.8 : 0.8) * face;
        this.scene.add(st); this.flashes.push({ mesh: st, life: 0, max: 0.18, grow: 0.1 });
      }
    } else if (anim === 'grab') { // a grab: a quick clasp flash
      mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.1, 20), addMat('#ffffff', 0.95));
      mesh.position.set((x0 + x1) / 2, y0 + h * 0.6, 0.7); grow = 1.4;
    } else if (anim === 'sweep') { // a wide, flat horizontal arc
      const r = w * 0.6;
      mesh = new THREE.Mesh(new THREE.RingGeometry(r * 0.6, r, 32, 1, -0.3, Math.PI * 0.9), addMat(color, 0.85));
      mesh.position.set(face > 0 ? x0 + 0.5 : x1 - 0.5, y0 + h * 0.4, 0.6); mesh.scale.set(face, 0.45, 1); grow = 0.5;
    } else if (h > 9) { mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.6, h, 16, 1, true), addMat(color, 0.8)); mesh.position.set((x0 + x1) / 2, y0 + h / 2, 0); grow = 0.3; }
    else {
      const r = Math.max(w, h) * 0.55;
      mesh = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r, 28, 1, upward ? -0.6 : 0.3, upward ? 2.2 : 2.4), addMat(color, 0.85));
      mesh.position.set(face > 0 ? x0 + 0.4 : x1 - 0.4, y0 + h * 0.45, 0.6);
      mesh.scale.x = face;
    }
    this.scene.add(mesh);
    this.flashes.push({ mesh, life: 0, max: 0.16, grow });
  }
  blink(x0: number, x1: number, y: number, color: string) {
    for (let i = 0; i <= 10; i++) this.burst(lerp(x0, x1, i / 10), y + 2.5, color, 3, 0.15);
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0) || 1, 0.5), addMat(color, 0.8));
    streak.position.set((x0 + x1) / 2, y + 2.6, 0.2);
    this.scene.add(streak);
    this.flashes.push({ mesh: streak, life: 0, max: 0.22, grow: 0 });
  }
  // dramatic close-up on a super (the HUD adds the letterbox and the name)
  cut(x: number, y: number, ms = 420) { this.zoom = { k: 1, x, y, until: performance.now() + ms }; }
  flashFighter(id: string) { const fv = this.fighters.get(id); if (fv) fv.flash = 1; }

  private projMesh(p: any) {
    let o = this.projMeshes.get(p);
    if (o) return o;
    const c = CHARS[p.ch];
    const col = PROJ_COL[p.kind] || c.glow;
    const g = new THREE.Group();
    const m = glowMat(col, 3);
    if (p.kind === 'arrow' || p.kind === 'rain' || p.kind === 'storm') {
      const s = p.kind === 'storm' ? 2.2 : 1;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 0.09 * s, 0.09 * s), m));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.45 * s, 6), m); head.rotation.z = -Math.PI / 2; head.position.x = 0.9 * s; g.add(head);
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * s, 0.35 * s), addMat(col, 0.5)); tr.position.x = -1.6 * s; g.add(tr);
      if (p.kind === 'storm') for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.2 - i * 0.25, 0.06, 6, 20), addMat(col, 0.8)); t.rotation.y = Math.PI / 2; t.position.x = -i * 0.9; g.add(t); }
    } else if (p.kind === 'star') { for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.08), m); b.rotation.z = r; g.add(b); } }
    else if (p.kind === 'chakram') g.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.16, 8, 24), m));
    else if (p.kind === 'wave') g.add(new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, 1.2), addMat(col, 0.85)));
    else if (p.kind === 'rune') { g.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 6), m), new THREE.Mesh(new THREE.OctahedronGeometry(0.5), m)); }
    else if (p.kind === 'bolt') { g.add(new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h * 0.5, 0.3), m)); const tr = new THREE.Mesh(new THREE.PlaneGeometry(p.w * 2, p.h), addMat(col, 0.45)); tr.position.x = -p.w; g.add(tr); }
    else { g.add(new THREE.Mesh(new THREE.SphereGeometry(Math.min(p.w, p.h) * 0.42, 14, 10), m)); g.add(new THREE.Mesh(new THREE.SphereGeometry(Math.min(p.w, p.h) * 0.62, 14, 10), addMat(col, 0.35))); }
    this.scene.add(g);
    this.projMeshes.set(p, g);
    return g;
  }

  // ---------- per-frame ----------
  // fs: fighter states (from the sim or the network), projs: live projectiles. dt in seconds.
  update(dt: number, fs: any[], projs: any[]) {
    this.t += dt;
    for (const f of fs) this.pose(f, dt);
    // projectiles
    const alive = new Set(projs);
    for (const [p, o] of this.projMeshes) if (!alive.has(p)) { this.scene.remove(o); this.projMeshes.delete(p); }
    for (const p of projs) {
      const o = this.projMesh(p);
      o.position.set(p.x, p.y, 0.3);
      if (p.kind === 'star' || p.kind === 'chakram' || p.kind === 'rune') o.rotation.z += dt * 18;
      else o.rotation.z = Math.atan2(p.vy, p.vx);
      if (p.kind === 'fire' || p.kind === 'orb' || p.kind === 'storm') if (Math.random() < 0.6) this.burst(p.x, p.y, PROJ_COL[p.kind] || '#ffffff', 1, 0.08);
    }
    // sparks
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      if (s.life >= s.max) { this.sparks.splice(i, 1); continue; }
      s.x += s.vx; s.y += s.vy; s.z += s.vz; s.vy -= 0.01; s.vx *= 0.92; s.vy *= 0.92;
    }
    for (const s of this.sparks) {
      const k = 1 - s.life / s.max;
      this.sparkPos.set([s.x, s.y, s.z], n * 3);
      this.sparkCol.set([s.c.r * k, s.c.g * k, s.c.b * k], n * 3);
      n++;
    }
    const geo = this.sparkPts.geometry;
    geo.setDrawRange(0, n);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life += dt;
      const u = f.life / f.max;
      if (u >= 1) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); this.flashes.splice(i, 1); continue; }
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
      if (f.grow) { const s = 1 + u * f.grow; f.mesh.scale.set(Math.sign(f.mesh.scale.x || 1) * s, s, 1); }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { const g = this.ghosts[i]; g.life -= dt; g.m.opacity = Math.max(0, g.life / 0.22) * 0.45; if (g.life <= 0) { this.scene.remove(g.o); g.m.dispose(); this.ghosts.splice(i, 1); } }
    // ambient motes drift
    const mp = this.env.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) { let y = mp.getY(i) + this.env.fall * dt * 30; if (y < 0) y = 34; if (y > 34) y = 0; mp.setY(i, y); mp.setX(i, mp.getX(i) + Math.sin(this.t + i) * 0.01); }
    mp.needsUpdate = true;
    this.camFollow(dt, fs);
  }

  private camFollow(dt: number, fs: any[]) {
    const map = MAPS[this.mi];
    const live = fs.filter((f) => f.st !== 'dead');
    const list = live.length ? live : fs;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of list) { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x); y0 = Math.min(y0, f.y); y1 = Math.max(y1, f.y + 5); }
    if (!list.length) { x0 = x1 = this.cam.x; y0 = 0; y1 = 6; }
    const aspect = this.camera.aspect;
    const portrait = aspect < 1; // phones held upright: zoom in, keep the floor above the touch buttons
    let w = clamp(x1 - x0 + (portrait ? 12 : 24), portrait ? 18 : 34, map.x1 - map.x0 + 6); // a wider view, like the classic
    w = Math.max(w, (y1 - y0 + (portrait ? 4 : 10)) * aspect);
    let cx = (x0 + x1) / 2, cy = Math.max(5, (y0 + y1) / 2);
    if (this.zoom.k && performance.now() < this.zoom.until) { w = 22; cx = this.zoom.x; cy = this.zoom.y + 3; } else this.zoom.k = 0;
    cy = Math.max(cy, (w / aspect) * 0.5 * (portrait ? 0.5 : 0.82) - 2.2); // keep the floor near the bottom edge, not half the screen
    const half = w / 2;
    cx = clamp(cx, map.x0 - 3 + half, map.x1 + 3 - half);
    if (map.x1 - map.x0 + 6 < w) cx = (map.x0 + map.x1) / 2;
    const k = 1 - Math.exp(-dt * (this.zoom.k ? 9 : 4));
    this.cam.x = lerp(this.cam.x, cx, k); this.cam.y = lerp(this.cam.y, cy, k); this.cam.w = lerp(this.cam.w, w, k);
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * aspect);
    const dist = this.cam.w / 2 / Math.tan(hfov / 2);
    this.shake *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.cam.x + sx, this.cam.y + dist * 0.16 + sy, dist);
    this.camera.lookAt(this.cam.x + sx * 0.5, this.cam.y, 0);
  }
  toScreen(x: number, y: number, w: number, h: number) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }
  resize(w: number, h: number) { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }

  // ---------- procedural animation from the fighter's state ----------
  private pose(f: any, dt: number) {
    const fv = this.fighters.get(f.id);
    if (!fv || !fv.rig) return;
    const r = fv.rig, c = CHARS[fv.ch], m = f.st === 'move' ? c.moves[f.mv] : null;
    const face = f.face;
    fv.g.position.set(f.x, f.y, 0);
    let aR = -0.35, aL = -0.2, lL = 0, lR = 0, lean = 0, spin = 0, flipZ = 0, pivotY = 2.5, crouch = 0, armZ = 0;
    const T = this.t;
    if (f.aj > fv.lastAj) fv.jumpFlip = 1;
    fv.lastAj = f.aj;
    // effects on state changes
    if (f.st !== fv.lastSt || f.mv !== fv.lastMv) {
      if (f.st === 'dash' && !c.dash.blink) this.dust(f.x, f.y);
      if (f.st === 'move' && m?.mp === 300) this.burst(f.x, f.y + 2.5, c.glow, 40, 0.5);
      if (f.st === 'down') { this.dust(f.x, f.y); this.shake = Math.max(this.shake, 0.3); }
    }
    fv.lastSt = f.st; fv.lastMv = f.mv;
    // afterimages ("shadows") behind fast movement: dashes, rockets, air slashes
    fv.trailT -= dt;
    if (Math.abs(f.vx) > 0.55 && (f.st === 'dash' || f.st === 'jump' || (f.st === 'move' && (f.mv === 'ja' || f.mv === 'da'))) && fv.trailT <= 0 && this.ghosts.length < 24) {
      fv.trailT = 0.045;
      const m = new THREE.MeshBasicMaterial({ color: c.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
      const o = fv.flip.clone();
      o.traverse((x: any) => { if (x.isMesh) x.material = m; });
      o.position.add(fv.g.position);
      this.scene.add(o);
      this.ghosts.push({ o, m, life: 0.22 });
    }
    if (f.st === 'idle') { aR = -0.45 + Math.sin(T * 2.2) * 0.05; aL = -0.25; crouch = Math.sin(T * 2.2) * 0.04; }
    else if (f.st === 'run') { const s = Math.sin(T * 15); aR = -0.3 + s * 0.9; aL = -s * 0.9; lL = -s * 0.95; lR = s * 0.95; lean = 0.18; }
    else if (f.st === 'jump') { aR = -1.1; aL = -0.8; lL = -0.9; lR = 0.35; if (fv.jumpFlip > 0) { flipZ = face * -Math.PI * 2 * (1 - fv.jumpFlip); fv.jumpFlip = Math.max(0, fv.jumpFlip - dt * 2.6); } }
    else if (f.st === 'dash') {
      if (c.dash.blink) { fv.yaw.visible = f.t > 6; aR = 0.6; aL = 0.6; lean = 0.5; }
      else { lean = 0.5; aR = 1.0; aL = 0.9; lL = -1.0; lR = 0.7; }
      if (Math.random() < 0.5) this.burst(f.x - face * 1.2, f.y + 2.5, c.glow, 1, 0.06);
    } else if (f.st === 'move' && m) {
      const strike = m.hit[0]?.a ?? m.proj[0]?.at ?? Math.round(m.f * 0.3);
      const u = ease(f.t / Math.max(1, strike)), v = ease((f.t - strike) / 5), t = f.t;
      const before = t < strike;
      switch (m.anim) {
        case 'slash': aR = before ? lerp(-0.5, -2.9, u) : lerp(-2.9, -0.2, v); aL = -0.6; lean = before ? -0.1 : 0.25; lL = -0.5; lR = 0.4; break;
        case 'slash2': aR = before ? lerp(-0.4, 0.5, u) : lerp(0.5, -2.7, v); armZ = 0.4; aL = -0.5; lean = 0.15; lL = -0.4; lR = 0.4; break;
        case 'thrust': aR = before ? lerp(-0.6, -0.9, u) : -1.6; aL = before ? -0.4 : 0.4; lean = before ? -0.1 : 0.4; lL = -0.9; lR = 0.6; break;
        case 'spin': aR = -1.6; aL = -1.4; armZ = 0.7; spin = Math.PI * 2 * clamp((t - strike + 3) / 12, 0, 1) * (m.f > 40 ? (t / 10) : 1); lL = -0.3; lR = 0.3; break;
        case 'upper': aR = before ? lerp(-0.3, 0.6, u) : lerp(0.6, -3.1, v); aL = -0.4; crouch = before ? -0.5 * u : 0.2; lL = before ? -0.6 : -0.2; lR = before ? 0.6 : 0.5; lean = before ? 0.25 : -0.15; break;
        case 'slam': aR = before ? lerp(-0.5, -3.1, u) : lerp(-3.1, -0.7, v); aL = aR; lean = before ? -0.25 : 0.45; crouch = before ? 0 : -0.35; lL = -0.7; lR = 0.6; break;
        case 'shoot': aL = -1.57; aR = before ? lerp(-1.57, -1.3, u) : lerp(-0.9, -1.4, v); if (c.weapon === 'cannon') { aR = -1.57; aL = -1.4; } if (f.aim) { aL -= f.aim * 0.5; aR -= f.aim * 0.5; } lean = before ? 0 : -0.12; lL = -0.3; lR = 0.4; break;
        case 'punch': case 'punch2': { const right = (m.anim === 'punch') === (Math.floor(t / 4) % 2 === 0); aR = right && !before ? -1.6 : -0.6; aL = !right && !before ? -1.6 : -0.6; lean = 0.25; lL = -0.6; lR = 0.5; break; }
        case 'kick': lR = before ? lerp(0, 0.6, u) : -1.7; lL = 0.2; aR = 0.5; aL = -0.8; lean = before ? 0 : -0.35; break;
        case 'cast': aR = before ? lerp(-0.4, -2.4, u) : lerp(-2.4, -1.6, v); aL = aR; armZ = 0.35; lL = -0.3; lR = 0.3; if (!before && Math.random() < 0.5) this.burst(f.x + face * 1.8, f.y + 3.2, c.glow, 1, 0.1); break;
        case 'stab': case 'stab2': { const r = m.anim === 'stab'; const out = before ? -0.7 : -1.62; aR = r ? out : -0.5; aL = r ? -0.5 : out; lean = before ? 0.05 : 0.35; lL = -0.8; lR = 0.6; break; }
        case 'claw': case 'claw2': aR = aL = before ? lerp(-0.6, -2.7, u) : lerp(-2.7, -0.7, v); armZ = before ? -0.7 : 0.9 * (m.anim === 'claw' ? 1 : -1); lean = before ? -0.1 : 0.3; lL = -0.6; lR = 0.5; break;
        case 'flipkick': flipZ = face * Math.PI * 2 * clamp(t / 16, 0, 1); lR = -1.6; lL = 0.4; aR = -2.2; aL = -2.2; break;
        case 'sweep': aR = -1.5; aL = -0.9; armZ = before ? lerp(0, 1.3, u) : lerp(1.3, -1.2, v); spin = before ? lerp(0, -0.7, u) : lerp(-0.7, 0.8, v); lean = 0.2; crouch = -0.25; lL = -0.7; lR = 0.7; break;
        case 'pole': aR = -3.0; aL = -2.8; spin = Math.PI * 2 * clamp(t / 12, 0, 1); crouch = 0.1; lL = -0.3; lR = 0.3; break;
        case 'palm': case 'palm2': aR = aL = before ? lerp(-0.6, -1.0, u) : -1.62; armZ = m.anim === 'palm' ? 0.15 : -0.15; lean = before ? -0.1 : 0.35; lL = -0.9; lR = 0.6; if (t === strike) this.burst(f.x + face * 2.4, f.y + 3, c.glow, 14, 0.25); break;
        case 'grab': aR = aL = before ? lerp(-0.8, -1.6, u) : lerp(-1.6, -3.1, v); armZ = before ? -0.5 : 0.2; lean = before ? 0.3 : -0.45; lL = -0.6; lR = 0.7; break;
        case 'dive': flipZ = face * -0.9; aR = -2.4; aL = -2.4; lL = 0.3; lR = 0.3; break;
        case 'flip': flipZ = face * Math.PI * 2 * clamp(t / 18, 0, 1); aL = -1.57; aR = -1.2; lL = -0.8; lR = -0.8; break;
      }
      if (f.mv === 'ctr') { this.burst(f.x, f.y + 2.5, '#ffffff', 2, 0.25); }
    } else if (f.st === 'hit') {
      lean = -0.35; aR = -2.2 + Math.sin(T * 30) * 0.3; aL = -2.4; lL = -0.5; lR = 0.3;
      if (!f.g && f.vy < 0.4 && (f.fall || f.combo > 2)) flipZ = face * clamp(0.6 + f.t * 0.05, 0, Math.PI / 2);
    } else if (f.st === 'down' || f.st === 'dead') { flipZ = face * Math.PI / 2; pivotY = 0.65; aR = -2.8; aL = -2.8; }
    else if (f.st === 'up') { const u = clamp(f.t / 14, 0, 1); flipZ = face * (Math.PI / 2) * (1 - ease(u)); pivotY = lerp(0.65, 2.5, ease(u)); }
    if (f.zh >= 12 && (f.st === 'idle' || f.st === 'run')) { // holding Z: charging MP
      const lv = chargeLevel(f);
      aR = aL = -0.9; armZ = 0.7; crouch = -0.2; lL = -0.3; lR = 0.3;
      if (Math.random() < 0.4 + lv * 0.2) this.burst(f.x + (Math.random() - 0.5) * 3, f.y + Math.random() * 5, lv === 3 ? '#ffd23f' : c.glow, 1, 0.08 + lv * 0.04);
    } else if (f.crouch) { crouch = -0.9; lL = -0.9; lR = 0.4; lean = 0.25; aR = -0.6; aL = -0.4; }
    if (f.st !== 'dash') fv.yaw.visible = true;
    // smoothing: blend towards the target pose so state changes never snap
    const k = 1 - Math.exp(-dt * 28);
    const L = (o: THREE.Object3D, axis: 'x' | 'z', v: number) => { o.rotation[axis] = lerp(o.rotation[axis], v, k); };
    L(r.armR, 'x', aR); L(r.armL, 'x', aL); L(r.legL, 'x', lL); L(r.legR, 'x', lR);
    L(r.armR, 'z', armZ * 0.5); L(r.armL, 'z', -armZ * 0.5);
    fv.yaw.rotation.y = face * Math.PI / 2 * 0.78 + spin * face;
    fv.flip.rotation.z = Math.abs(flipZ) > 1.6 ? flipZ : lerp(fv.flip.rotation.z, flipZ - face * lean, k);
    fv.flip.position.y = lerp(fv.flip.position.y, pivotY + crouch, k);
    // flashes: hit (white), super armor (red pulse), invulnerable get-up (blink), dead (dark)
    fv.flash = Math.max(0, fv.flash - dt * 8);
    const armor = hasArmor(f) ? 0.5 + Math.sin(T * 30) * 0.3 : 0;
    const ghost = f.veil > 0 ? (fv.me ? 0.35 : 0.07 + Math.abs(Math.sin(T * 6)) * 0.05) : 1;
    if (fv.veilK !== ghost) { fv.veilK = ghost; fv.yaw.traverse((o: any) => { if (o.isMesh) for (const m of [o.material].flat()) { m.transparent = ghost < 1; m.opacity = ghost; m.depthWrite = ghost === 1; } }); fv.ring.visible = ghost === 1 || fv.me; }
    for (const mt of fv.mats) {
      if (fv.flash > 0) { mt.emissive.copy(FLASH); mt.emissiveIntensity = fv.flash; }
      else if (armor) { mt.emissive.copy(ARMOR); mt.emissiveIntensity = armor; }
      else if (mt.userData.e0) { mt.emissive.copy(mt.userData.e0); mt.emissiveIntensity = mt.userData.k0; }
    }
    if (f.st === 'up' || (f.st === 'move' && isInv(f) && f.mv !== 'ctr')) fv.yaw.visible = f.st === 'up' ? Math.floor(T * 20) % 2 === 0 : true;
    if (!(f.veil > 0)) fv.ring.visible = f.st !== 'dead';
    (fv.ring.material as THREE.MeshBasicMaterial).opacity = f.g ? 0.55 : 0.2;
    fv.ring.position.y = 0.06 - f.y + this.groundUnder(f);
  }
  private groundUnder(f: any) {
    let top = 0;
    for (const [px, y, w] of MAPS[this.mi].plats) if (f.x >= px && f.x <= px + w && y <= f.y + 0.01 && y > top) top = y;
    return top;
  }
}
