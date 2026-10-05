// The guardian angel shared by Infinite Parkour and Golf Climb: a winged figure with a halo and a pillar of
// golden light from the sky. Pure three.js geometry, no assets.
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: string, e?: string) => {
  const k = c + (e ?? '');
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e ?? '#000000', emissiveIntensity: e ? 0.7 : 0 }));
  return mats.get(k)!;
};
export const holy = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
let glowTex: THREE.Texture | null = null;
export function glowSprite(size: number, color = 'rgba(255,236,160,1)') {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.35, 'rgba(255,220,120,0.45)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}
export function makeAngel() {
  const g = new THREE.Group();
  const glow = glowSprite(16);
  glow.position.y = 3.5;
  const robe = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4.6, 12), mat('#ffffff', '#fff3cf'));
  robe.position.y = 2.3;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 8, 24), mat('#ffd23f', '#ffb300'));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 3.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 14), mat('#ffe0bd', '#3a2a10'));
  head.position.y = 5.1;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.97, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffe27a', '#b8860b'));
  hair.position.y = 5.2;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 10, 32), mat('#fff3a0', '#ffd000'));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 6.5;
  const haloGlow = glowSprite(5);
  haloGlow.position.y = 6.5;
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.5, 3.9, -0.7);
    // three layers of feathers per wing
    [[5.2, 2.6, 0], [4.2, 1.8, -1.2], [3, 1.3, -2.1]].forEach(([len, h, dy], k) => {
      const f = new THREE.Mesh(BOX, mat(k ? '#f4f8ff' : '#ffffff', k ? '#d8e8ff' : '#fff8e1'));
      f.scale.set(len, h, 0.22);
      f.position.set(s * (len / 2 + 0.2), dy + 0.4, -k * 0.08);
      f.rotation.z = s * (0.35 + k * 0.12);
      pivot.add(f);
    });
    wings.push(pivot);
    g.add(pivot);
  }
  const light = new THREE.PointLight('#ffe9a8', 0, 70, 1.4);
  light.position.y = 4;
  g.add(glow, robe, belt, head, hair, halo, haloGlow, light);
  g.userData = { wings, halo, light, glow };
  return g;
}
export function makePillar() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 240, 32, 1, true), holy('#ffe9a0', 0.1));
  beam.position.y = 120;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 240, 20, 1, true), holy('#fff6d0', 0.16));
  core.position.y = 120;
  const rays = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 240), holy('#ffe27a', 0.07));
    ray.position.y = 120;
    ray.rotation.y = (i / 8) * Math.PI;
    ray.position.x = Math.cos(i) * 2;
    rays.add(ray);
  }
  g.add(beam, core, rays);
  g.userData = { rays, mats: [beam.material, core.material, ...rays.children.map((c: any) => c.material)] };
  g.scale.set(0.01, 1, 0.01);
  return g;
}
