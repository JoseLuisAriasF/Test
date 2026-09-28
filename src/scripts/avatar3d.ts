// The player's BibiBox avatar as a blocky 3D character (three.js). The face is drawn from the same
// SVG avatar used everywhere else, so face cosmetics (and the "Other" pixel face) carry over.
import * as THREE from 'three';
import { DEFAULT, SKINS, HAIR_COLORS, BY_ID, avatarSVG } from '../lib/avatar.js';

const SHIRT_FALLBACK: Record<string, string> = {
  'shirt-stripe': '#6d7ff0', 'shirt-gold': '#f59e0b', 'shirt-galaxy': '#6d28d9', 'shirt-rainbow': '#ef4444', 'shirt-champ': '#fbbf24',
};
const mat = (c: string, e?: string) => new THREE.MeshLambertMaterial({ color: c, emissive: e ?? '#000000', emissiveIntensity: e ? 0.6 : 0 });

// Simplified 3D versions of hats: [shape, color, x, y, z, sx, sy, sz, rotZ?]
type H = [string, string, number, number, number, number, number, number, number?];
const HATS: Record<string, H[]> = {
  'hat-cap': [['box', '#3b82f6', 0, 1.2, 0, 2.1, 0.5, 2.1], ['box', '#2563eb', 0, 1.0, 1.3, 1.9, 0.15, 1]],
  'hat-beanie': [['sph', '#ef4444', 0, 1.05, 0, 2.2, 1.4, 2.2], ['sph', '#ffffff', 0, 1.8, 0, 0.5, 0.5, 0.5]],
  'hat-cowboy': [['cyl', '#8b5a2b', 0, 1.05, 0, 3.4, 0.15, 3.4], ['cyl', '#a0692f', 0, 1.5, 0, 1.8, 0.9, 1.8]],
  'hat-pirate': [['box', '#111827', 0, 1.3, 0, 3, 0.8, 1.6]],
  'hat-wizard': [['cone', '#4c1d95', 0, 2.2, 0, 2, 2.6, 2], ['cyl', '#6d28d9', 0, 1.05, 0, 2.6, 0.2, 2.6]],
  'hat-viking': [['sph', '#9ca3af', 0, 1.0, 0, 2.2, 1.4, 2.2], ['cone', '#f5f5dc', -1.2, 1.5, 0, 0.4, 1.2, 0.4, 0.9], ['cone', '#f5f5dc', 1.2, 1.5, 0, 0.4, 1.2, 0.4, -0.9]],
  'hat-top': [['cyl', '#111827', 0, 1.9, 0, 1.6, 1.8, 1.6], ['cyl', '#111827', 0, 1.05, 0, 2.6, 0.15, 2.6], ['cyl', '#ff5fa2', 0, 1.3, 0, 1.65, 0.3, 1.65]],
  'hat-halo': [['torus', '#fde68a', 0, 2.2, 0, 1, 1, 1]],
  'hat-crown': [['cyl', '#fbbf24', 0, 1.35, 0, 2, 0.7, 2]],
  'hat-flame': [['cyl', '#fbbf24', 0, 1.35, 0, 2, 0.7, 2], ['cone', '#fb923c', 0, 2.3, 0, 1.4, 1.6, 1.4]],
  'hat-fedora-green': [['cyl', '#15803d', 0, 1.05, 0, 2.9, 0.12, 2.9], ['cyl', '#15803d', 0, 1.5, 0, 1.8, 0.9, 1.8]],
  'hat-fedora-violet': [['cyl', '#6d28d9', 0, 1.05, 0, 2.9, 0.12, 2.9], ['cyl', '#6d28d9', 0, 1.5, 0, 1.8, 0.9, 1.8]],
  'hat-fedora-red': [['cyl', '#dc2626', 0, 1.05, 0, 2.9, 0.12, 2.9], ['cyl', '#dc2626', 0, 1.5, 0, 1.8, 0.9, 1.8]],
  'hat-horns-toxic': [['cone', '#84cc16', -0.8, 1.4, 0, 0.45, 1.3, 0.45, 0.5], ['cone', '#84cc16', 0.8, 1.4, 0, 0.45, 1.3, 0.45, -0.5]],
  'hat-horns-frost': [['cone', '#bae6fd', -0.8, 1.4, 0, 0.45, 1.3, 0.45, 0.5], ['cone', '#bae6fd', 0.8, 1.4, 0, 0.45, 1.3, 0.45, -0.5]],
  'hat-horns-fire': [['cone', '#f97316', -0.8, 1.4, 0, 0.45, 1.3, 0.45, 0.5], ['cone', '#f97316', 0.8, 1.4, 0, 0.45, 1.3, 0.45, -0.5]],
  'hat-dominus': [['box', '#312e81', 0, 0.2, -0.1, 2.3, 2.4, 2.3], ['cone', '#6d7ff0', 0, 1.8, 0, 0.8, 1, 0.8]],
  'hat-inferno': [['box', '#7f1d1d', 0, 0.2, -0.1, 2.3, 2.4, 2.3], ['cone', '#fb923c', 0, 1.9, 0, 1.2, 1.4, 1.2]],
  'hat-valk': [['sph', '#c7cbe0', 0, 1.0, 0, 2.2, 1.4, 2.2], ['box', '#f8fafc', -1.5, 1.3, 0, 1.4, 0.8, 0.15, 0.4], ['box', '#f8fafc', 1.5, 1.3, 0, 1.4, 0.8, 0.15, -0.4]],
  'hat-valk-black': [['sph', '#1f2230', 0, 1.0, 0, 2.2, 1.4, 2.2], ['box', '#2b2e3f', -1.5, 1.3, 0, 1.4, 0.8, 0.15, 0.4], ['box', '#2b2e3f', 1.5, 1.3, 0, 1.4, 0.8, 0.15, -0.4]],
  'hat-gearphones': [['cyl', '#fbbf24', -1.05, 0, 0, 0.5, 0.25, 0.5, 1.57], ['cyl', '#fbbf24', 1.05, 0, 0, 0.5, 0.25, 0.5, 1.57]],
  'hat-phones': [['box', '#6d7ff0', -1.1, 0, 0, 0.3, 0.8, 0.6], ['box', '#6d7ff0', 1.1, 0, 0, 0.3, 0.8, 0.6], ['box', '#1f2937', 0, 1.1, 0, 2.4, 0.2, 0.3]],
};
const HAIR_TOP: Record<string, number> = { 'hair-none': 0, 'hair-buzz': 0.15, 'hair-short': 0.3, 'hair-curly': 0.45, 'hair-bun': 0.3, 'hair-pony': 0.3, 'hair-long': 0.3 };

function geo(shape: string) {
  switch (shape) {
    case 'sph': return new THREE.SphereGeometry(0.5, 16, 12);
    case 'cyl': return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 16);
    case 'torus': return new THREE.TorusGeometry(0.8, 0.12, 8, 24).rotateX(Math.PI / 2);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

// Draws the SVG avatar and crops the head, used as the face texture.
async function faceTexture(av: any): Promise<THREE.Texture | null> {
  try {
    const svg = avatarSVG(av, 256).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const k = 256 / 128; // svg units -> px (viewBox is 128 wide, starting at -4)
    c.getContext('2d')!.drawImage(img, (38 + 4) * k, (18 + 12) * k, 44 * k, 44 * k, 0, 0, 128, 128);
    URL.revokeObjectURL(url);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; // keep it crisp and blocky
    return t;
  } catch {
    return null;
  }
}

export type Rig = { root: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; head: THREE.Group; extras: THREE.Object3D[] };

// Roblox proportions (studs): legs 2 tall, torso 2, head ~1.2. Total ~5.
export async function buildAvatar(input: any): Promise<Rig> {
  const av = { ...DEFAULT, ...(input ?? {}) };
  const skin = SKINS[av.skin] ?? SKINS[1];
  const hair = HAIR_COLORS[av.hairColor] ?? HAIR_COLORS[0];
  const shirtItem = BY_ID[av.shirt];
  const shirt = shirtItem?.fill?.startsWith('#') ? shirtItem.fill : SHIRT_FALLBACK[av.shirt] ?? '#3b82f6';
  const pants = '#2b3350';
  const root = new THREE.Group();
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    return mesh;
  };
  const limb = (x: number, y: number, top: string, bottom: string, topFrac = 0.4) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const a = box(0.95, 2 * topFrac, 0.95, mat(top));
    a.position.y = -topFrac;
    const b = box(0.95, 2 * (1 - topFrac), 0.95, mat(bottom));
    b.position.y = -2 * topFrac - (1 - topFrac);
    g.add(a, b);
    return g;
  };
  const legL = limb(-0.5, 2, pants, av.body === 'girl' ? skin : pants, av.body === 'girl' ? 0.5 : 0.5);
  const legR = limb(0.5, 2, pants, pants, 0.5);
  const torsoW = av.body === 'girl' ? 1.8 : 2;
  const torso = box(torsoW, 2, 1, mat(shirt));
  torso.position.y = 3;
  if (av.body === 'girl') {
    const skirt = box(2.3, 0.8, 1.3, mat(shirt));
    skirt.position.y = 2.1;
    root.add(skirt);
  }
  const armL = limb(-torsoW / 2 - 0.5, 4, shirt, skin, 0.45);
  const armR = limb(torsoW / 2 + 0.5, 4, shirt, skin, 0.45);
  const head = new THREE.Group();
  head.position.y = 4.65;
  const faceMat = mat(skin);
  const headMesh = box(1.25, 1.25, 1.25, [mat(skin), mat(skin), mat(hair), mat(skin), faceMat, mat(av.hair === 'hair-long' ? hair : skin)]);
  head.add(headMesh);
  const hairH = HAIR_TOP[av.hair] ?? 0.3;
  if (hairH) {
    const h = box(1.35, hairH, 1.35, mat(hair));
    h.position.y = 0.62 + hairH / 2 - 0.05;
    head.add(h);
  }
  const extras: THREE.Object3D[] = [];
  for (const [shape, color, x, y, z, sx, sy, sz, rz] of HATS[av.hat] ?? []) {
    const m = new THREE.Mesh(geo(shape), mat(color, ['hat-flame', 'hat-halo', 'hat-inferno'].includes(av.hat) ? color : undefined));
    m.position.set(x * 0.6, y * 0.6, z * 0.6);
    m.scale.set(sx * 0.6, sy * 0.6, sz * 0.6);
    if (rz) m.rotation.z = rz;
    head.add(m);
    if (av.hat === 'hat-halo' || av.hat === 'hat-flame') extras.push(m);
  }
  root.add(legL, legR, torso, armL, armR, head);
  faceTexture(av).then((t) => {
    if (!t) return;
    faceMat.map = t;
    faceMat.color.set('#ffffff');
    faceMat.needsUpdate = true;
  });
  return { root, armL, armR, legL, legR, head, extras };
}

// Walk cycle / idle bob. speed01 = 0..1
export function animateRig(r: Rig, t: number, speed01: number, airborne: boolean) {
  const swing = airborne ? 0.9 : Math.sin(t * 10) * 0.9 * speed01;
  r.armL.rotation.x = swing;
  r.armR.rotation.x = -swing;
  r.legL.rotation.x = airborne ? -0.4 : -swing;
  r.legR.rotation.x = airborne ? 0.3 : swing;
  r.head.position.y = 4.65 + (speed01 < 0.1 ? Math.sin(t * 2) * 0.04 : Math.abs(Math.sin(t * 10)) * 0.08);
  for (const e of r.extras) e.position.y += Math.sin(t * 3) * 0.004;
}
