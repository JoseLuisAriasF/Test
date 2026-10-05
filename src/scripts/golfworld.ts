// Golf Climb scenery: every mountain gets its own world, built from Roblox-style blocks and simple 3D shapes.
// Pure decoration (nothing here touches the ball), placed behind the climbing plane (z < -3) or far away.
import * as THREE from 'three';
import { studBox } from './gamekit.ts';

type R = () => number;
type Ctx = { world: THREE.Group; map: any; m: any; r: R; studs: THREE.Texture };
type Tick = (T: number, dt: number, focus: THREE.Vector3) => void;

// ---------- materials + tiny helpers ----------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
let STUDS: THREE.Texture;
function M(color: string, o: { e?: number; studs?: boolean; rough?: number; metal?: number; opacity?: number } = {}) {
  const key = `${color}|${o.e ?? 0}|${o.studs ? 1 : 0}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.opacity ?? 1}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({
    color, map: o.studs ? STUDS : null, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0,
    emissive: o.e ? color : '#000000', emissiveIntensity: o.e ?? 0, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
  }));
  return matCache.get(key)!;
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent?.add(o);
  return o;
}
const B = (w: number, h: number, d: number) => studBox(w, h, d);
const CYL = (rt: number, rb: number, h: number, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const SPH = (r: number, s = 18) => new THREE.SphereGeometry(r, s, Math.max(8, s * 0.7));
const CONE = (r: number, h: number, s = 16) => new THREE.ConeGeometry(r, h, s);
function stripes(a: string, b: string, n = 8, diag = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = a; g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
  for (let i = 0; i < n; i++) {
    if (diag) { g.beginPath(); g.moveTo(i * 32 - 64, 0); g.lineTo(i * 32 - 48, 0); g.lineTo(i * 32 + 80, 128); g.lineTo(i * 32 + 64, 128); g.fill(); }
    else g.fillRect(0, (i * 128) / n, 128, 64 / n);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const texMat = (t: THREE.Texture, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, ...o });

// ---------- props ----------
const P = {
  tree(r: R, leaf = '#3fae4a') { const g = new THREE.Group(); mesh(B(1, 4, 1), M('#7a4a26', { studs: true }), 0, 2, 0, g); mesh(B(4, 3, 4), M(leaf, { studs: true }), 0, 5, 0, g); mesh(B(2.6, 2, 2.6), M(leaf, { studs: true }), 0, 7.2, 0, g); g.rotation.y = r() * 3; return g; },
  pine(snow = true) { const g = new THREE.Group(); mesh(CYL(0.4, 0.5, 2), M('#5d4037'), 0, 1, 0, g); [3, 2.4, 1.7].forEach((s, i) => { mesh(CONE(s, 2.8, 8), M('#1f6f43'), 0, 3 + i * 1.8, 0, g); if (snow) mesh(CONE(s * 0.55, 1.2, 8), M('#ffffff'), 0, 3.9 + i * 1.8, 0, g); }); return g; },
  flower(c: string) { const g = new THREE.Group(); mesh(B(0.15, 1, 0.15), M('#2e7d32'), 0, 0.5, 0, g); mesh(B(0.6, 0.6, 0.6), M(c, { e: 0.15 }), 0, 1.1, 0, g); mesh(B(0.3, 0.3, 0.3), M('#ffd23f'), 0, 1.1, 0.3, g); return g; },
  house() { const g = new THREE.Group(); mesh(B(7, 5, 6), M('#c0392b', { studs: true }), 0, 2.5, 0, g); const roof = mesh(CONE(5.6, 3.5, 4), M('#5d4037'), 0, 6.7, 0, g); roof.rotation.y = Math.PI / 4; mesh(B(1.5, 2.6, 0.2), M('#4e342e'), 0, 1.3, 3.05, g); for (const x of [-2.2, 2.2]) mesh(B(1.3, 1.3, 0.2), M('#ffe082', { e: 0.6 }), x, 3, 3.05, g); return g; },
  noob() { const g = new THREE.Group(); mesh(B(4, 2, 4), M('#9e9e9e', { studs: true }), 0, 1, 0, g); mesh(B(1, 2, 1), M('#3cb043'), -0.55, 3, 0, g); mesh(B(1, 2, 1), M('#3cb043'), 0.55, 3, 0, g); mesh(B(2.2, 2, 1.1), M('#2f6fd6'), 0, 5, 0, g); for (const x of [-1.6, 1.6]) mesh(B(1, 2, 1), M('#f5cd30'), x, 5, 0, g); mesh(B(1.3, 1.3, 1.3), M('#f5cd30'), 0, 6.7, 0, g); return g; },
  fence(len: number) { const g = new THREE.Group(); for (let x = 0; x <= len; x += 2) mesh(B(0.4, 1.6, 0.4), M('#a1887f'), x, 0.8, 0, g); for (const y of [0.6, 1.2]) mesh(B(len, 0.25, 0.2), M('#bcaaa4'), len / 2, y, 0, g); return g; },
  mesa(r: R, h: number) { const g = new THREE.Group(); const cols = ['#b5502d', '#d4774a', '#c4613a', '#e0956a']; let y = 0, w = 18 + r() * 14; for (let i = 0; i < 6; i++) { const hh = h / 6; mesh(B(w, hh, w * 0.7), M(cols[i % 4], { studs: true, rough: 0.95 }), 0, y + hh / 2, 0, g); y += hh; w *= 0.93; } return g; },
  cactus() { const g = new THREE.Group(); const c = M('#2e8b57', { studs: true }); mesh(B(1, 5, 1), c, 0, 2.5, 0, g); mesh(B(0.8, 2, 0.8), c, -1, 3, 0, g); mesh(B(0.8, 0.8, 0.8), c, -0.6, 2.4, 0, g); mesh(B(0.8, 1.6, 0.8), c, 1, 3.6, 0, g); mesh(B(0.8, 0.8, 0.8), c, 0.6, 3.2, 0, g); return g; },
  sign(text: string) { const g = new THREE.Group(); mesh(B(0.3, 3, 0.3), M('#6d4c41'), 0, 1.5, 0, g); const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d')!; x.fillStyle = '#a1887f'; x.fillRect(0, 0, 256, 96); x.font = '700 40px Fredoka, system-ui'; x.textAlign = 'center'; x.fillStyle = '#3e2723'; x.fillText(text, 128, 62); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; mesh(new THREE.BoxGeometry(3, 1.1, 0.2), [M('#8d6e63'), M('#8d6e63'), M('#8d6e63'), M('#8d6e63'), texMat(t), M('#8d6e63')] as any, 0, 3, 0, g); return g; },
  lollipop(r: R) { const g = new THREE.Group(); mesh(CYL(0.15, 0.15, 6, 8), M('#ffffff'), 0, 3, 0, g); const d = mesh(CYL(1.8, 1.8, 0.4, 32), texMat(stripes(['#ff4d6d', '#5ee7ff', '#b388ff'][Math.floor(r() * 3)], '#ffffff', 8, true)), 0, 6.6, 0, g); d.rotation.x = Math.PI / 2; return g; },
  cane() { const g = new THREE.Group(); const m = texMat(stripes('#ffffff', '#e53950', 10, true)); mesh(CYL(0.4, 0.4, 7, 12), m, 0, 3.5, 0, g); const t = mesh(new THREE.TorusGeometry(1.2, 0.4, 10, 20, Math.PI), m, 1.2, 7, 0, g); t.rotation.z = 0; return g; },
  donut(r: R) { const g = new THREE.Group(); const d = mesh(new THREE.TorusGeometry(1.8, 0.9, 14, 28), M('#d9a066', { rough: 0.8 }), 0, 0, 0, g); const ic = mesh(new THREE.TorusGeometry(1.8, 0.75, 14, 28, Math.PI * 2), M(['#ff7eb6', '#7a4a26', '#b388ff'][Math.floor(r() * 3)], { rough: 0.35 }), 0, 0, 0.35, g); for (let i = 0; i < 14; i++) { const a = r() * 6.28; mesh(B(0.12, 0.45, 0.12), M(['#fff176', '#5ee7ff', '#ff5252'][i % 3], { e: 0.2 }), Math.cos(a) * 1.8, Math.sin(a) * 1.8, 1.05, g).rotation.z = r() * 3; } d.castShadow = ic.castShadow = true; return g; },
  cupcake() { const g = new THREE.Group(); mesh(CYL(1.4, 1, 1.6, 12), texMat(stripes('#ffb3c7', '#ff7eb6', 1, false)), 0, 0.8, 0, g); mesh(SPH(1.5), M('#fff0f6', { rough: 0.4 }), 0, 2, 0, g).scale.y = 0.75; mesh(SPH(0.4), M('#e53950', { rough: 0.2 }), 0, 3.1, 0, g); return g; },
  gumdrop(c: string) { const o = mesh(SPH(1, 14), M(c, { rough: 0.25, e: 0.15 })); o.scale.set(1, 1.2, 1); return o; },
  snowman() { const g = new THREE.Group(); const s = M('#fafafa', { rough: 0.9 }); mesh(SPH(1.6), s, 0, 1.4, 0, g); mesh(SPH(1.15), s, 0, 3.6, 0, g); mesh(SPH(0.85), s, 0, 5.2, 0, g); mesh(CONE(0.2, 1, 8), M('#ff7043'), 0, 5.2, 1.2, g).rotation.x = Math.PI / 2; mesh(CYL(0.6, 0.6, 1, 14), M('#212121'), 0, 6.3, 0, g); mesh(CYL(0.95, 0.95, 0.1, 14), M('#212121'), 0, 5.85, 0, g); for (const x of [-0.3, 0.3]) mesh(SPH(0.1, 8), M('#111'), x, 5.45, 0.75, g); return g; },
  igloo() { const g = new THREE.Group(); mesh(new THREE.SphereGeometry(4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#e3f2fd', { rough: 0.5 }), 0, 0, 0, g); const d = mesh(CYL(1.4, 1.4, 3, 14, ), M('#e3f2fd'), 0, 1, 3.6, g); d.rotation.x = Math.PI / 2; mesh(B(1.6, 1.6, 0.2), M('#263238'), 0, 1, 5.05, g); return g; },
  crystal(c: string) { const g = new THREE.Group(); [[0, 3.4, 0, 0], [0.9, 2, 0.3, -0.4], [-0.8, 2.4, -0.2, 0.35]].forEach(([x, h, z, rz]) => { const o = mesh(new THREE.OctahedronGeometry(0.8, 0), M(c, { e: 0.8, rough: 0.1 }), x, h / 2, z, g); o.scale.set(0.8, h / 1.4, 0.8); o.rotation.z = rz; }); return g; },
  gear(r: R) { const g = new THREE.Group(); const m = M('#9e9e9e', { metal: 0.85, rough: 0.35 }); const hub = mesh(CYL(2.4, 2.4, 0.8, 24), m, 0, 0, 0, g); hub.rotation.x = Math.PI / 2; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const t = mesh(B(0.9, 1, 0.8), m, Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0, g); t.rotation.z = a; } mesh(CYL(0.6, 0.6, 1, 12), M('#ffca28', { metal: 0.6 }), 0, 0, 0, g).rotation.x = Math.PI / 2; g.userData.spin = (r() < 0.5 ? -1 : 1) * (0.4 + r()); return g; },
  pipe(len: number) { const g = new THREE.Group(); const m = M('#78909c', { metal: 0.8, rough: 0.4 }); mesh(CYL(0.7, 0.7, len, 16), m, 0, len / 2, 0, g); for (let y = 2; y < len; y += 4) mesh(CYL(0.9, 0.9, 0.4, 16), M('#455a64', { metal: 0.8 }), 0, y, 0, g); return g; },
  stack() { const g = new THREE.Group(); mesh(CYL(2, 2.6, 26, 16), texMat(stripes('#8d6e63', '#c62828', 6)), 0, 13, 0, g); g.userData.smoke = true; return g; },
  lamp() { const g = new THREE.Group(); mesh(B(0.6, 0.6, 0.6), M('#ff9800', { e: 2 }), 0, 0.3, 0, g); g.userData.blink = true; return g; },
  crate() { const g = new THREE.Group(); mesh(B(2, 2, 2), M('#a0703c', { studs: true }), 0, 1, 0, g); mesh(B(2.05, 0.3, 2.05), M('#6d4c41'), 0, 1, 0, g); return g; },
  barrel() { const g = new THREE.Group(); mesh(CYL(0.9, 0.9, 2.2, 14), M('#8d5a2b', { rough: 0.8 }), 0, 1.1, 0, g); for (const y of [0.4, 1.8]) mesh(CYL(0.93, 0.93, 0.15, 14), M('#424242', { metal: 0.7 }), 0, y, 0, g); return g; },
  palm() { const g = new THREE.Group(); for (let i = 0; i < 6; i++) mesh(B(0.9 - i * 0.05, 1.2, 0.9 - i * 0.05), M('#8d6e63', { studs: true }), i * 0.15, 0.6 + i * 1.15, 0, g); for (let i = 0; i < 5; i++) { const l = mesh(B(4, 0.25, 1.1), M('#2e9d4a'), 0.9, 7.1, 0, g); l.rotation.y = (i / 5) * Math.PI * 2; l.rotation.z = -0.35; l.position.x = 0.9 + Math.cos((i / 5) * Math.PI * 2) * 1.7; l.position.z = -Math.sin((i / 5) * Math.PI * 2) * 1.7; } mesh(SPH(0.4, 8), M('#6d4c41'), 1, 6.7, 0.4, g); return g; },
  temple(h: number) { const g = new THREE.Group(); let w = h * 1.6; for (let i = 0; i < 7; i++) { mesh(B(w, h / 7, w * 0.8), M(i % 2 ? '#8d8d6e' : '#7a7a5c', { studs: true, rough: 0.95 }), 0, (i + 0.5) * (h / 7), 0, g); w *= 0.84; } mesh(B(w * 1.4, h / 5, w), M('#5f5f45', { studs: true }), 0, h + h / 10, 0, g); mesh(B(w * 0.5, h / 8, 0.2), M('#111'), 0, h + h / 12, w / 2 + 0.01, g); return g; },
  totem() { const g = new THREE.Group(); ['#c62828', '#f9a825', '#2e7d32', '#1565c0'].forEach((c, i) => { mesh(B(2, 2, 2), M(c, { studs: true }), 0, 1 + i * 2, 0, g); for (const x of [-0.45, 0.45]) mesh(B(0.4, 0.4, 0.1), M('#111'), x, 1.4 + i * 2, 1.01, g); mesh(B(1, 0.25, 0.1), M('#fff'), 0, 0.6 + i * 2, 1.01, g); }); return g; },
  vine(len: number) { const g = new THREE.Group(); for (let y = 0; y < len; y += 1) mesh(B(0.25, 1.05, 0.25), M(y % 2 ? '#2e7d32' : '#388e3c'), Math.sin(y) * 0.15, -y - 0.5, 0, g); for (let y = 1; y < len; y += 2) mesh(B(0.7, 0.15, 0.5), M('#43a047'), 0.3, -y, 0, g); g.userData.sway = true; return g; },
  ship() { const g = new THREE.Group(); mesh(B(18, 4, 6), M('#6d4c41', { studs: true }), 0, 2, 0, g); mesh(B(6, 3, 5.6), M('#5d4037', { studs: true }), -6, 5.5, 0, g); mesh(B(14, 0.5, 6.2), M('#4e342e'), 1, 4.1, 0, g); for (const [x, h] of [[0, 16], [6, 12]]) { mesh(CYL(0.3, 0.35, h, 8), M('#5d4037'), x, 4 + h / 2, 0, g); mesh(B(7 - x / 3, h * 0.45, 0.15), M('#f5f0e1', { rough: 0.9 }), x, 4 + h * 0.55, 0.4, g); } mesh(B(2.4, 1.6, 0.1), M('#111'), 0, 20.5, 0, g); mesh(SPH(0.35, 8), M('#fff'), 0, 20.6, 0.1, g); g.userData.bob = true; return g; },
  chest() { const g = new THREE.Group(); mesh(B(2.4, 1.4, 1.6), M('#8d5a2b', { studs: true }), 0, 0.7, 0, g); const lid = mesh(B(2.4, 0.6, 1.6), M('#6d4c41', { studs: true }), 0, 1.7, -0.3, g); lid.rotation.x = -0.6; mesh(B(1.9, 0.5, 1.2), M('#ffd23f', { e: 0.9, metal: 0.6 }), 0, 1.4, 0, g); return g; },
  lighthouse() { const g = new THREE.Group(); mesh(CYL(2, 3, 22, 16), texMat(stripes('#ffffff', '#e53935', 6)), 0, 11, 0, g); mesh(CYL(2.2, 2.2, 3, 16), M('#fff59d', { e: 2.2 }), 0, 23.5, 0, g); mesh(CONE(2.6, 2.5, 16), M('#b71c1c'), 0, 26.2, 0, g); g.userData.beam = true; return g; },
  spike(h: number) { const o = mesh(CONE(h / 4, h, 6), M('#1c1a22', { rough: 0.5, metal: 0.2 })); o.position.y = h / 2; return o; },
  island(r: R, w: number) { const g = new THREE.Group(); mesh(CONE(w / 2, w * 0.9, 7), M('#795548', { studs: true }), 0, -w * 0.45, 0, g).rotation.x = Math.PI; mesh(CYL(w / 2, w / 2, 1.2, 7), M('#4caf50', { studs: true }), 0, 0.6, 0, g); if (r() < 0.7) { const t = P.tree(r); t.position.set((r() - 0.5) * w * 0.4, 1.2, 0); g.add(t); } g.userData.bob = true; return g; },
  balloon(c: string) { const g = new THREE.Group(); mesh(SPH(3, 20), texMat(stripes(c, '#ffffff', 6)), 0, 6, 0, g).scale.y = 1.15; mesh(B(1.4, 1, 1.4), M('#8d6e63'), 0, 0.5, 0, g); for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) mesh(B(0.06, 3, 0.06), M('#5d4037'), x, 2.3, z, g); g.userData.bob = true; return g; },
  rainbow() { const g = new THREE.Group(); ['#ff4d4d', '#ff9f43', '#feca57', '#3ecf8e', '#54a0ff', '#8e5cff'].forEach((c, i) => mesh(new THREE.TorusGeometry(40 - i * 2.2, 1.1, 8, 60, Math.PI), M(c, { e: 0.35, opacity: 0.85 }), 0, 0, 0, g)); return g; },
  planet(r: R, c: string, size: number) { const g = new THREE.Group(); mesh(SPH(size, 28), M(c, { rough: 0.8, e: 0.08 }), 0, 0, 0, g); if (r() < 0.6) { const ring = mesh(new THREE.RingGeometry(size * 1.35, size * 2, 48), new THREE.MeshStandardMaterial({ color: '#e0d7ff', side: THREE.DoubleSide, transparent: true, opacity: 0.6 }), 0, 0, 0, g); ring.rotation.x = 1.2; } g.userData.spin = 0.05; return g; },
  asteroid(r: R) { const o = mesh(new THREE.DodecahedronGeometry(1 + r() * 2.5, 0), M('#6d6875', { rough: 0.95 })); o.userData.spin = 0.2 + r() * 0.6; o.rotation.set(r() * 3, r() * 3, 0); return o; },
  rocket() { const g = new THREE.Group(); mesh(CYL(1.2, 1.2, 7, 16), M('#eceff1', { metal: 0.4, rough: 0.3 }), 0, 4.5, 0, g); mesh(CONE(1.2, 2.4, 16), M('#e53935'), 0, 9.2, 0, g); mesh(CYL(0.5, 0.5, 0.2, 16), M('#4fc3f7', { e: 1 }), 0, 5.6, 1.15, g).rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) { const f = mesh(B(0.2, 2.2, 1.6), M('#e53935'), Math.cos((i * 2 * Math.PI) / 3) * 1.3, 1.6, Math.sin((i * 2 * Math.PI) / 3) * 1.3, g); f.rotation.y = (-i * 2 * Math.PI) / 3; } mesh(CONE(0.9, 2, 12), M('#ffab00', { e: 2.5 }), 0, -0.2, 0, g).rotation.x = Math.PI; return g; },
  station() { const g = new THREE.Group(); const ring = mesh(new THREE.TorusGeometry(10, 1.2, 10, 40), M('#cfd8dc', { metal: 0.7, rough: 0.3 }), 0, 0, 0, g); ring.rotation.x = 1.3; mesh(CYL(1.5, 1.5, 6, 12), M('#90a4ae', { metal: 0.7 }), 0, 0, 0, g); for (const s of [-1, 1]) mesh(B(10, 0.2, 3), M('#1a237e', { metal: 0.5, e: 0.2 }), s * 9, 0, 0, g); g.userData.spin = 0.08; return g; },
  volcano(h: number) { const g = new THREE.Group(); mesh(CYL(h * 0.18, h * 0.7, h, 9), M('#3a2a26', { studs: true, rough: 1 }), 0, h / 2, 0, g); mesh(CYL(h * 0.17, h * 0.17, 1, 9), M('#ff5a1f', { e: 3 }), 0, h + 0.3, 0, g); g.userData.erupt = h; return g; },
};

// ---------- particles (snow, embers, leaves, sparkles, stars) ----------
function particles(ctx: Ctx, n: number, color: string, size: number, vel: [number, number], spread: [number, number]) {
  const pos = new Float32Array(n * 3), seedArr = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([(ctx.r() - 0.5) * spread[0], ctx.r() * spread[1], -2 - ctx.r() * 30], i * 3); seedArr[i] = ctx.r() * 10; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false, blending: color === '#ffffff' ? THREE.NormalBlending : THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  ctx.world.add(pts);
  return ((T: number, dt: number, f: THREE.Vector3) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let x = a.getX(i) + (vel[0] + Math.sin(T + seedArr[i]) * 0.6) * dt, y = a.getY(i) + vel[1] * dt;
      if (y < -spread[1] / 2) y += spread[1]; if (y > spread[1] / 2) y -= spread[1];
      if (x < -spread[0] / 2) x += spread[0]; if (x > spread[0] / 2) x -= spread[0];
      a.setXY(i, x, y);
    }
    a.needsUpdate = true;
    pts.position.set(f.x, f.y, 0);
  }) as Tick;
}

// ---------- the worlds ----------
export function buildScenery(world: THREE.Group, map: any, m: any, r: R, studs: THREE.Texture): Tick {
  STUDS = studs;
  const ctx: Ctx = { world, map, m, r, studs };
  const W = map.W, H = map.H, ticks: Tick[] = [];
  const spin: THREE.Object3D[] = [], bob: THREE.Object3D[] = [], blink: THREE.Object3D[] = [], sway: THREE.Object3D[] = [];
  const put = (o: THREE.Object3D, x: number, y: number, z: number, s = 1, ry = 0) => {
    o.position.set(x, y, z); o.scale.multiplyScalar(s); o.rotation.y += ry; world.add(o);
    o.traverse((c) => { if (c.userData.spin) spin.push(c); if (c.userData.bob) bob.push(c); if (c.userData.blink) blink.push(c); if (c.userData.sway) sway.push(c); });
    return o;
  };
  const side = () => (r() < 0.5 ? -12 - r() * 50 : W + 12 + r() * 50); // left or right of the tower
  const ground = (color: string, o: { e?: number; opacity?: number; rough?: number; metal?: number } = {}, y = -0.05) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), M(color, o)); g.rotation.x = -Math.PI / 2; g.position.set(W / 2, y, -200); g.receiveShadow = true; world.add(g); return g; };
  const backWall = (_m: THREE.Material) => {}; // the mountain is the props themselves now: nothing behind them
  // big theme pieces at every height behind the tower, so climbing high still shows the world
  const fill = (make: () => THREE.Object3D, n: number, zFrom = 25, zTo = 90, s0 = 1, s1 = 1) => {
    for (let i = 0; i < n; i++) put(make(), W / 2 + (r() - 0.5) * (W + 90), 6 + r() * (H + 10), -zFrom - r() * (zTo - zFrom), s0 + r() * (s1 - s0), r() * 6);
  };
  const cloud = (c = '#ffffff') => { const g = new THREE.Group(); for (let j = 0; j < 4; j++) mesh(B(5 + r() * 7, 2.5 + r() * 2.5, 5), M(c, { rough: 1, opacity: 0.93 }), j * 4.5 - 7, r() * 2, r() * 2, g); g.userData.bob = true; return g; };
  const onLedges = (..._a: any[]) => {};
  const id = m.id;

  if (id === 'meadow') {
    ground('#5fbf4a', { rough: 1 });
    backWall(M('#8d6e63', { studs: true, rough: 0.9 }));
    for (let i = 0; i < 26; i++) put(P.tree(r, ['#3fae4a', '#58c25a', '#2e8b3e'][i % 3]), side(), 0, -10 - r() * 90, 1 + r() * 1.5);
    put(P.house(), -26, 0, -22, 1.4, 0.3); put(P.house(), W + 30, 0, -40, 1.2, -0.4);
    put(P.noob(), -10, 0, -12, 1.2, 0.4);
    put(P.fence(16), -40, 0, -6); put(P.fence(16), W + 14, 0, -6);
    for (let i = 0; i < 40; i++) put(P.flower(['#ff5fa2', '#ffd23f', '#ffffff', '#b388ff'][i % 4]), side() * 0.6 + W * 0.2, 0, -4 - r() * 40, 1);
    for (let i = 0; i < 9; i++) put(P.sign(['NOOB HILL', 'GO UP ⬆', 'OOF ZONE', 'FLAG ⛳'][i % 4]), side() * 0.4 + W * 0.3, 0, -6 - r() * 10, 1);
    onLedges(() => (r() < 0.6 ? P.flower(['#ff5fa2', '#ffd23f', '#b388ff'][Math.floor(r() * 3)]) : P.tree(r)));
    fill(() => cloud(), 22, 30, 110, 1, 2.2); fill(() => P.balloon(['#ff4d6d', '#ffd23f', '#5ee7ff'][Math.floor(r() * 3)]), 4, 40, 90);
    ticks.push(particles(ctx, 60, '#fff59d', 0.35, [0.6, -0.4], [120, 80])); // floating pollen
  } else if (id === 'canyon') {
    ground('#e0a45e', { rough: 1 });
    backWall(texMat(stripes('#b5502d', '#d4774a', 10), { roughness: 0.95 }));
    for (let i = 0; i < 14; i++) put(P.mesa(r, 30 + r() * 70), side() * 1.6, 0, -50 - r() * 160, 1);
    for (let i = 0; i < 30; i++) put(P.cactus(), side(), 0, -6 - r() * 60, 0.8 + r() * 0.8);
    for (let i = 0; i < 5; i++) put(P.sign(['DANGER', 'CANYON', '⬆ 100 STUDS'][i % 3]), side() * 0.5, 0, -6, 1);
    onLedges(() => (r() < 0.5 ? P.cactus() : P.crate()));
    for (let i = 0; i < 8; i++) put(P.mesa(r, H * (0.5 + r() * 0.6)), W / 2 + (r() - 0.5) * 160, 0, -45 - r() * 60, 1);
    fill(() => cloud('#ffe0c2'), 12, 60, 140, 1.5, 3);
    ticks.push(particles(ctx, 80, '#ffe0b2', 0.3, [5, -0.2], [140, 80])); // blowing sand
  } else if (id === 'candy') {
    ground('#ffb3d9', { rough: 0.4 });
    backWall(M('#ffc1e3', { studs: true, rough: 0.35 }));
    for (let i = 0; i < 18; i++) put(P.lollipop(r), side(), 0, -10 - r() * 80, 1.4 + r() * 2);
    for (let i = 0; i < 14; i++) put(P.cane(), side(), 0, -10 - r() * 80, 1.4 + r() * 1.5);
    for (let i = 0; i < 10; i++) { const d = P.donut(r); d.userData.spin = 0.3; put(d, side() * 1.2, 8 + r() * H * 0.6, -30 - r() * 60, 1.5 + r() * 2, r() * 6); }
    for (let i = 0; i < 20; i++) put(P.cupcake(), side(), 0, -8 - r() * 50, 1 + r());
    onLedges(() => (r() < 0.5 ? P.gumdrop(['#ff5fa2', '#5ee7ff', '#fff176', '#b388ff'][Math.floor(r() * 4)]) : P.cupcake()));
    fill(() => { const d = P.donut(r); d.userData.spin = 0.4; return d; }, 14, 25, 70, 1.5, 3); fill(() => P.gumdrop(['#ff5fa2', '#5ee7ff', '#fff176', '#b388ff'][Math.floor(r() * 4)]), 16, 25, 70, 2, 4); fill(() => cloud('#ffd1ec'), 14, 40, 120, 1.5, 3);
    for (let i = 0; i < 6; i++) put(P.lollipop(r), W / 2 + (r() - 0.5) * 150, 0, -40 - r() * 40, 4 + r() * 6);
    ticks.push(particles(ctx, 90, '#ff9de2', 0.45, [0, -1.2], [120, 90])); // sprinkles
  } else if (id === 'frozen') {
    ground('#f4fbff', { rough: 0.8 });
    backWall(new THREE.MeshPhysicalMaterial({ color: '#cfeeff', map: studs, roughness: 0.15, clearcoat: 1 }));
    for (let i = 0; i < 40; i++) put(P.pine(), side(), 0, -8 - r() * 110, 1 + r() * 1.6);
    for (let i = 0; i < 4; i++) put(P.snowman(), side() * 0.5, 0, -8 - r() * 20, 1.2, r());
    put(P.igloo(), -24, 0, -20, 1.3, 0.5);
    for (let i = 0; i < 10; i++) put(P.crystal('#7fdbff'), side(), 0, -10 - r() * 50, 1.5 + r() * 2);
    for (let i = 0; i < 10; i++) put(P.mesa(r, 40 + r() * 60), side() * 2, 0, -120 - r() * 120, 1).traverse((o: any) => { if (o.isMesh) o.material = M('#e8f4ff', { rough: 0.9 }); });
    onLedges(() => (r() < 0.5 ? P.pine() : r() < 0.5 ? P.snowman() : P.crystal('#7fdbff')));
    for (let i = 0; i < 9; i++) put(P.mesa(r, H * (0.6 + r() * 0.7)), W / 2 + (r() - 0.5) * 180, 0, -50 - r() * 70, 1).traverse((o: any) => { if (o.isMesh) o.material = M(['#eef7ff', '#d6ecff', '#ffffff'][Math.floor(r() * 3)], { rough: 0.85 }); });
    const aurora = new THREE.Mesh(new THREE.PlaneGeometry(400, 40), new THREE.MeshBasicMaterial({ color: '#69f0ae', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    aurora.position.set(W / 2, H * 0.8, -160); world.add(aurora);
    ticks.push((T) => { aurora.material.opacity = 0.14 + Math.sin(T * 0.7) * 0.08; aurora.position.y = H * 0.8 + Math.sin(T * 0.3) * 6; });
    ticks.push(particles(ctx, 260, '#ffffff', 0.4, [0.5, -3], [130, 90])); // snow
  } else if (id === 'factory') {
    ground('#3a3f45', { rough: 0.6, metal: 0.4 });
    backWall(texMat(stripes('#4a535c', '#3b434b', 12), { metalness: 0.7, roughness: 0.4 }));
    for (let i = 0; i < 10; i++) put(P.gear(r), W / 2 + (r() - 0.5) * (W + 10), 6 + r() * (H - 10), -7, 0.8 + r() * 1.2);
    for (let i = 0; i < 12; i++) put(P.pipe(20 + r() * 50), side(), 0, -10 - r() * 50, 1 + r());
    for (let i = 0; i < 6; i++) put(P.stack(), side() * 1.3, 0, -40 - r() * 80, 1.3 + r());
    for (let i = 0; i < 18; i++) put(P.lamp(), W / 2 + (r() - 0.5) * W, 4 + r() * H, -6.9, 1);
    for (let i = 0; i < 8; i++) put(P.gear(r), side(), 10 + r() * 60, -20 - r() * 40, 2 + r() * 2);
    onLedges(() => (r() < 0.5 ? P.crate() : P.barrel()));
    fill(() => P.gear(r), 16, 18, 50, 2, 4); fill(() => P.lamp(), 20, 12, 30, 1.5, 2.5);
    for (let i = 0; i < 10; i++) put(P.pipe(H * (0.5 + r() * 0.6)), W / 2 + (r() - 0.5) * 120, 0, -20 - r() * 40, 1.5 + r());
    ticks.push(particles(ctx, 70, '#ffb74d', 0.35, [0.3, 2.5], [110, 90])); // sparks
  } else if (id === 'jungle') {
    ground('#2f6b2f', { rough: 1 });
    backWall(M('#6d7a52', { studs: true, rough: 1 }));
    put(P.temple(70), W / 2, 0, -90, 1);
    for (let i = 0; i < 34; i++) put(P.palm(), side(), 0, -6 - r() * 90, 1 + r() * 1.3);
    for (let i = 0; i < 6; i++) put(P.totem(), side() * 0.5, 0, -8 - r() * 20, 1);
    onLedges(() => (r() < 0.6 ? P.palm() : P.totem()), 2);
    for (let i = 0; i < 10; i++) put(P.palm(), W / 2 + (r() - 0.5) * 160, 0, -30 - r() * 50, 4 + r() * 5);
    for (let i = 0; i < 18; i++) put(P.vine(10 + r() * 20), W / 2 + (r() - 0.5) * (W + 40), 20 + r() * H, -15 - r() * 20, 1.5);
    fill(() => cloud(), 10, 60, 140, 1.5, 3);
    ticks.push(particles(ctx, 70, '#9ccc65', 0.4, [1.2, -1.4], [120, 90])); // falling leaves
    ticks.push(particles(ctx, 30, '#eeff41', 0.35, [0.2, 0.3], [80, 60])); // fireflies
  } else if (id === 'pirate') {
    const sea = ground('#1e88e5', { rough: 0.15, metal: 0.3 }, -0.6);
    ticks.push((T) => { sea.position.y = -0.6 + Math.sin(T) * 0.25; });
    backWall(M('#7d6b5d', { studs: true, rough: 0.95 }));
    put(P.ship(), -40, 0, -40, 1.4, 0.4); put(P.ship(), W + 60, 0, -90, 1.8, -0.5);
    put(P.lighthouse(), W + 28, 0, -30, 1.3);
    for (let i = 0; i < 14; i++) put(P.palm(), side(), 0.5, -6 - r() * 40, 1 + r());
    for (let i = 0; i < 6; i++) put(P.chest(), side() * 0.4, 0.5, -6 - r() * 10, 1);
    for (let i = 0; i < 8; i++) put(P.island(r, 18 + r() * 14), side() * 1.6, 1, -80 - r() * 120, 1);
    onLedges(() => (r() < 0.4 ? P.barrel() : r() < 0.6 ? P.chest() : P.crate()));
    put(P.ship(), W / 2 - 10, 0, -45, 2.6, 0.2); put(P.lighthouse(), W / 2 + 40, 0, -60, 3);
    fill(() => cloud(), 18, 40, 130, 1.2, 2.6);
    ticks.push(particles(ctx, 40, '#ffffff', 0.3, [2, 0.4], [120, 40])); // sea spray
  } else if (id === 'volcano') {
    const lava = ground('#ff3d00', { e: 1.6 }, -0.6);
    ticks.push((T) => { (lava.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(T * 2) * 0.4; });
    backWall(texMat(stripes('#2a1d1a', '#3a2723', 14), { roughness: 1, emissive: new THREE.Color('#3a0a00'), emissiveIntensity: 0.6 }));
    put(P.volcano(120), W / 2 + 40, 0, -170, 1);
    for (let i = 0; i < 36; i++) put(P.spike(8 + r() * 26), side(), 0, -6 - r() * 90, 1);
    for (let i = 0; i < 10; i++) put(P.crystal('#ff6d00'), side(), 0, -6 - r() * 40, 1.4 + r());
    onLedges(() => (r() < 0.5 ? P.spike(3 + r() * 3) : P.crystal('#ff6d00')));
    put(P.volcano(H * 0.9), W / 2 - 20, 0, -H * 0.63 - 45, 1);
    for (let i = 0; i < 12; i++) put(P.spike(H * (0.3 + r() * 0.5)), W / 2 + (r() - 0.5) * 170, 0, -30 - r() * 60, 1);
    fill(() => cloud('#4a2b26'), 14, 40, 120, 1.5, 3);
    fill(() => P.crystal('#ff3d00'), 10, 15, 40, 2, 4);
    ticks.push(particles(ctx, 180, '#ff8a3d', 0.45, [0.4, 3.5], [120, 90])); // embers
  } else if (id === 'sky') {
    // no ground: the tower floats above a sea of clouds
    for (let i = 0; i < 40; i++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 5; j++) mesh(B(6 + r() * 10, 3 + r() * 3, 6 + r() * 6), M('#ffffff', { rough: 1 }), j * 6 - 12, r() * 2, r() * 4, cl);
      put(cl, W / 2 + (r() - 0.5) * 360, -4 - r() * 10, -10 - r() * 200, 1 + r());
    }
    put(P.rainbow(), W / 2, 10, -140, 2.2);
    for (let i = 0; i < 14; i++) put(P.island(r, 10 + r() * 16), side() * 1.3, 10 + r() * H, -30 - r() * 120, 1);
    for (let i = 0; i < 7; i++) put(P.balloon(['#ff4d6d', '#ffd23f', '#3ecf8e', '#5ee7ff', '#b388ff'][i % 5]), side(), 20 + r() * H, -20 - r() * 60, 1 + r() * 0.6);
    onLedges(() => (r() < 0.6 ? P.flower(['#ff5fa2', '#ffd23f', '#ffffff'][Math.floor(r() * 3)]) : P.tree(r)));
    fill(() => P.island(r, 8 + r() * 12), 20, 25, 90); fill(() => cloud(), 24, 20, 120, 1, 2.5); fill(() => P.balloon(['#ff4d6d', '#ffd23f', '#3ecf8e', '#5ee7ff', '#b388ff'][Math.floor(r() * 5)]), 8, 30, 80);
    ticks.push(particles(ctx, 50, '#ffffff', 0.5, [3, 0.2], [140, 90])); // wind
  } else if (id === 'space') {
    const pts = new Float32Array(2400 * 3);
    for (let k = 0; k < 2400; k++) pts.set([W / 2 + (r() - 0.5) * 1100, r() * (H + 400) - 100, -150 - r() * 300], k * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    world.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, fog: false })));
    backWall(texMat(stripes('#1b1446', '#251a5c', 16), { metalness: 0.6, roughness: 0.35, emissive: new THREE.Color('#120a3a'), emissiveIntensity: 0.5 }));
    put(P.planet(r, '#ff7e5f', 26), -70, H * 0.6, -180); put(P.planet(r, '#5ee7ff', 14), W + 60, H * 0.3, -120); put(P.planet(r, '#b388ff', 40), W / 2 + 30, H + 40, -260);
    put(P.station(), W + 40, H * 0.75, -70, 1.3);
    for (let i = 0; i < 40; i++) put(P.asteroid(r), side(), r() * H, -10 - r() * 80, 1);
    put(P.rocket(), map.cup.x + (map.cup.x > W / 2 ? -6 : 6), map.cup.y, -4, 0.8);
    for (let i = 0; i < 18; i++) put(P.lamp(), W / 2 + (r() - 0.5) * W, 4 + r() * H, -6.9, 1).traverse((o: any) => { if (o.isMesh) o.material = M(['#00e5ff', '#ff2e97', '#b2ff59'][i % 3], { e: 2 }); });
    onLedges(() => (r() < 0.5 ? P.crystal(['#00e5ff', '#ff2e97', '#b2ff59'][Math.floor(r() * 3)]) : P.asteroid(r)));
    fill(() => P.asteroid(r), 40, 15, 70, 1, 3); fill(() => P.planet(r, ['#ff7e5f', '#5ee7ff', '#b388ff', '#ffd23f', '#69f0ae'][Math.floor(r() * 5)], 3 + r() * 6), 7, 50, 120);
  }

  for (const pr of map.props) decorate(pr, put, r);

  // shared motion
  return (T, dt, focus) => {
    for (const o of spin) o.rotation.z += dt * o.userData.spin;
    for (const o of bob) o.position.y += Math.sin(T * 0.8 + o.id) * dt * 0.6;
    for (const o of blink) o.visible = Math.sin(T * 4 + o.id) > -0.2;
    for (const o of sway) o.rotation.z = Math.sin(T * 1.2 + o.id) * 0.08;
    for (const t of ticks) t(T, dt, focus);
  };
}

// ---------- details on the giant objects (no collision: the ball only touches the blocks from lib/golf.js) ----------
function eyes(g: THREE.Group, x: number, y: number, z: number, s = 1, iris = '#111') {
  for (const dx of [-0.35 * s, 0.35 * s]) { mesh(SPH(0.26 * s, 12), M('#ffffff', { rough: 0.3 }), x + dx, y, z, g); mesh(SPH(0.13 * s, 10), M(iris, { rough: 0.2 }), x + dx, y, z + 0.18 * s, g); }
}
function decorate(pr: any, put: (o: THREE.Object3D, x: number, y: number, z: number, s?: number, ry?: number) => THREE.Object3D, r: R) {
  const { kind, x, y, L, o } = pr;
  const g = new THREE.Group();
  switch (kind) {
    case 'tree': case 'pine':
      for (let i = 0; i < 6; i++) mesh(B(1.4 + r() * 1.6, 1.2 + r(), 1.4 + r() * 1.6), M(kind === 'pine' ? '#2e7d4f' : ['#3fae4a', '#58c25a', '#2e8b3e'][i % 3], { studs: true }), x + (r() - 0.5) * L, y - 1.6 - r() * 0.8, (r() < 0.5 ? -1 : 1) * (3 + r()), g);
      if (kind === 'tree') for (let i = 0; i < 4; i++) mesh(SPH(0.3, 10), M('#e53935', { rough: 0.3 }), x + (r() - 0.5) * L * 0.8, y - 2.2, 3.6, g);
      else for (let i = 0; i < 4; i++) mesh(CONE(0.5, 0.9, 6), M('#ffffff'), x + (r() - 0.5) * L, y + 0.2, -3 + r() * 6, g);
      break;
    case 'house':
      mesh(B(1.4, 2.4, 0.2), M('#4e342e'), x, y - 4.8, 3.6, g);
      for (const dx of [-L / 4, L / 4]) mesh(B(1.2, 1.2, 0.2), M('#ffe082', { e: 1.2 }), x + dx, y - 2.6, 3.6, g);
      mesh(B(L + 1.2, 0.3, 8.4), M('#3e2723'), x, y - 0.1, 0, g);
      break;
    case 'noob': eyes(g, x, y - 0.8, 1.65, 1.1); mesh(B(1, 0.15, 0.1), M('#111'), x, y - 1.35, 1.66, g); break;
    case 'cactus': for (let i = 0; i < 10; i++) mesh(B(0.08, 0.4, 0.08), M('#f5f5dc'), x + (r() - 0.5) * 1.8, y - 1 - r() * 8, 1.25, g); mesh(SPH(0.45, 10), M('#ff4081', { e: 0.3 }), x, y + 0.2, 0, g); break;
    case 'car':
      for (const dx of [-L / 2 - 1, L / 2 + 1]) for (const dz of [-3.1, 3.1]) { const w = mesh(CYL(1, 1, 0.6, 18), M('#212121', { rough: 0.9 }), x + dx - o * 0.6, y - 4, dz, g); w.rotation.x = Math.PI / 2; }
      for (const dz of [-3.05, 3.05]) mesh(B(L * 0.8, 0.9, 0.1), M('#90caf9', { e: 0.3, rough: 0.1 }), x, y - 1.6, dz, g);
      break;
    case 'donut': for (let i = 0; i < 16; i++) mesh(B(0.14, 0.45, 0.14), M(['#fff176', '#5ee7ff', '#ff5252', '#b2ff59'][i % 4], { e: 0.2 }), x + (r() - 0.5) * (L + 2), y + 0.1 + r() * 1.4, 3.05, g).rotation.z = r() * 3; break;
    case 'cupcake': mesh(SPH(0.6, 14), M('#e53935', { rough: 0.2 }), x + o * (L / 2 - 0.4), y + 0.5, 0, g); for (let i = 0; i < 12; i++) mesh(B(0.12, 0.4, 0.12), M(['#fff176', '#5ee7ff', '#b388ff'][i % 3]), x + (r() - 0.5) * L, y + 0.05, (r() - 0.5) * 6, g).rotation.z = r() * 3; break;
    case 'lollipop': { const d = mesh(CYL(L / 2, L / 2, 0.3, 32), texMat(stripes('#ff4d6d', '#ffffff', 8, true)), x, y - 0.5, 0.75, g); d.rotation.x = Math.PI / 2; break; }
    case 'cake': for (let i = 0; i < 4; i++) { mesh(CYL(0.15, 0.15, 1.2, 8), M(['#5ee7ff', '#ff5fa2', '#fff176'][i % 3]), x + (i - 1.5) * (L / 4), y + 0.6, -2.8, g); mesh(SPH(0.18, 8), M('#ffab00', { e: 3 }), x + (i - 1.5) * (L / 4), y + 1.35, -2.8, g); } break;
    case 'iceberg': for (let i = 0; i < 6; i++) { const c = mesh(CONE(0.25, 1.4, 6), M('#e1f5fe', { e: 0.2, rough: 0.1 }), x + (r() - 0.5) * L, y - 3.9, 3.2, g); c.rotation.x = Math.PI; } break;
    case 'snowman': eyes(g, x, y + 2.1, 0.75, 0.8); mesh(CONE(0.18, 1, 8), M('#ff7043'), x, y + 1.7, 1.1, g).rotation.x = Math.PI / 2; mesh(CYL(0.6, 0.6, 1, 14), M('#212121'), x, y + 3.3, 0, g); for (let i = 0; i < 3; i++) mesh(SPH(0.15, 8), M('#212121'), x, y - 0.6 - i * 0.9, 2.55, g); break;
    case 'igloo': mesh(B(2, 1.6, 0.2), M('#263238'), x, y - 2, 3.55, g); for (let i = 0; i < 5; i++) mesh(B(L + 3, 0.08, 0.1), M('#b0bec5'), x, y - 0.8 - i * 0.6, 3.56, g); break;
    case 'crate': for (const yy of [y - 1.2, y - 3.6]) { const a = mesh(B(Math.hypot(L, 2.4) * 0.9, 0.25, 0.1), M('#6d4c41'), x, yy, 3.05, g); a.rotation.z = Math.atan2(2.4, L); } break;
    case 'gear': { const ge = new THREE.Group(); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; mesh(B(0.9, 0.9, 0.9), M('#9e9e9e', { metal: 0.85, rough: 0.35 }), Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0, ge); } mesh(new THREE.TorusGeometry(3, 0.4, 8, 32), M('#757575', { metal: 0.85 }), 0, 0, 0, ge); ge.userData.spin = 0.6; put(ge, x, y - 4.5, -2); break; }
    case 'pipe': { const w = mesh(new THREE.TorusGeometry(0.8, 0.15, 8, 20), M('#e53935', { metal: 0.5 }), x, y + 0.6, 0, g); w.rotation.x = Math.PI / 2; mesh(B(0.2, 0.6, 0.2), M('#e53935'), x, y + 0.3, 0, g); break; }
    case 'spring': for (let i = 0; i < 4; i++) { const t = mesh(new THREE.TorusGeometry(L * 0.28, 0.15, 8, 24), M('#cfd8dc', { metal: 0.9, rough: 0.25 }), x, y - 1.2 - i * 0.35, 0, g); t.rotation.x = Math.PI / 2; } break;
    case 'horse':
      eyes(g, x + o * (L / 2 + 2.3), y + 3.7, 1.25, 0.7);
      for (let i = 0; i < 6; i++) mesh(B(0.5, 0.9, 0.6), M('#3e2723'), x + o * (L / 2 + 0.1 + i * 0.3), y - 0.2 + i * 0.6, 0, g);
      break;
    case 'eagle': mesh(B(1.4, 1.2, 1.4), M('#fafafa'), x + o * 1.8, y + 0.2, 0, g); mesh(CONE(0.35, 0.9, 6), M('#ffb300'), x + o * 2.8, y + 0.1, 0, g).rotation.z = -o * Math.PI / 2; eyes(g, x + o * 1.9, y + 0.5, 0.72, 0.5); for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) mesh(B(0.5, 0.2, 1.6), M('#4e342e'), x + sd * (1.6 + i * (L / 10)), y + 0.3 + i * 0.35, 1.2, g); break;
    case 'elephant':
      for (const dz of [-1.9, 1.9]) mesh(B(2.6, 3, 0.3), M('#bdbdbd', { studs: true }), x + o * (L / 2 + 0.8), y - 1, dz, g);
      eyes(g, x + o * (L / 2 + 1.8), y - 0.2, 2.05, 0.7);
      for (const dz of [-1, 1]) { const t = mesh(CONE(0.25, 1.6, 8), M('#fffde7'), x + o * (L / 2 + 2.9), y - 2.4, dz, g); t.rotation.z = o * 1.9; }
      break;
    case 'ship':
      mesh(B(L * 0.55, 6, 0.1), M('#f5f0e1', { rough: 0.9 }), x + o * (L / 2 - 1) - o * L * 0.3, y + 5, 0.4, g);
      mesh(B(2, 1.2, 0.1), M('#111'), x + o * (L / 2 - 1), y + 8.4, 0, g);
      for (let i = 0; i < 4; i++) mesh(CYL(0.35, 0.35, 0.1, 14), M('#ffe082', { e: 0.8 }), x - L / 2 + 1.5 + (i * (L - 3)) / 3, y - 2.6, 3.56, g).rotation.x = Math.PI / 2;
      break;
    case 'shark': eyes(g, x + o * (L / 2 - 0.8), y - 0.6, 1.55, 0.6, '#000'); for (let i = 0; i < 5; i++) mesh(CONE(0.12, 0.35, 4), M('#ffffff'), x + o * (L / 2 - 0.4 - i * 0.25), y - 1.9, 1.3, g).rotation.x = Math.PI; break;
    case 'turtle': for (let i = 0; i < 4; i++) mesh(B(L / 5, 0.15, 1.2), M('#1b5e20'), x - L / 2 + L / 8 + i * (L / 4), y + 0.02, (r() - 0.5) * 2, g); mesh(B(1.6, 1.3, 1.5), M('#81c784'), x + o * (L / 2 + 2.4), y - 2.3, 0, g); eyes(g, x + o * (L / 2 + 2.5), y - 2, 0.8, 0.5); break;
    case 'barrel': for (const yy of [y - 0.4, y - 2.8]) mesh(B(3.9, 0.25, 3.9), M('#424242', { metal: 0.7 }), x, yy, 0, g); break;
    case 'basalt': for (let i = 0; i < 3; i++) mesh(B(0.15, 1.6 + r(), 0.1), M('#ff6d00', { e: 3 }), x + (r() - 0.5) * L, y - 1.6, 4.05, g).rotation.z = (r() - 0.5) * 0.8; break;
    case 'skull': for (const dx of [-L / 5, L / 5]) mesh(B(L / 5, 1, 0.1), M('#111'), x + dx, y - 1.2, 3.05, g); for (let i = 0; i < 5; i++) mesh(B(0.4, 0.6, 0.1), M('#fffde7'), x - 1 + i * 0.5, y - 3.4, 2.56, g); break;
    case 'cloud': for (let i = 0; i < 6; i++) mesh(SPH(0.9 + r() * 0.8, 14), M('#ffffff', { rough: 1 }), x + (r() - 0.5) * L, y - 1.4 + r() * 0.6, (r() < 0.5 ? -1 : 1) * (2.6 + r()), g); break;
    case 'balloon': for (const dx of [-1.2, 1.2]) mesh(B(0.08, 4.5, 0.08), M('#5d4037'), x + dx, y + 2.1, 0, g); mesh(SPH(3.2, 24), texMat(stripes('#ff4d6d', '#ffd23f', 6)), x, y + 7.2, -1.5, g).scale.y = 1.1; break;
    case 'island': for (let i = 0; i < 5; i++) mesh(B(0.2, 1 + r() * 2, 0.2), M('#5d4037'), x + (r() - 0.5) * L, y - 6.6, (r() - 0.5) * 4, g); mesh(SPH(0.6, 10), M('#ff5fa2', { e: 0.2 }), x - L / 3, y + 0.4, -2.5, g); break;
    case 'asteroid': for (let i = 0; i < 4; i++) mesh(CYL(0.5 + r() * 0.4, 0.3, 0.2, 10), M('#4a4453'), x + (r() - 0.5) * L, y - 1.4 + (r() - 0.5) * 2, 3.05, g).rotation.x = Math.PI / 2; break;
    case 'satellite': { const d = mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#eceff1', { metal: 0.6 }), x, y + 1.2, -1.2, g); d.rotation.x = Math.PI; mesh(B(0.15, 1.6, 0.15), M('#b0bec5'), x, y + 0.6, -1.2, g); mesh(SPH(0.2, 8), M('#ff1744', { e: 3 }), x, y + 1.5, -1.2, g).userData.blink = true; break; }
    case 'ufo': { const dome = mesh(new THREE.SphereGeometry(L * 0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#80deea', transmission: 0.6, roughness: 0.05, thickness: 1, transparent: true, opacity: 0.6 }), x, y, -2.2, g); dome.castShadow = false; for (let i = 0; i < 6; i++) mesh(SPH(0.25, 8), M(['#ff2e97', '#b2ff59', '#00e5ff'][i % 3], { e: 3 }), x - L / 2 + 0.5 + (i * (L - 1)) / 5, y - 2, 3.4, g).userData.blink = true; break; }
  }
  put(g, 0, 0, 0);
}
