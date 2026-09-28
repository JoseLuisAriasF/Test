// Blox World generator: a seeded island of 9 themed zones built from Roblox-style parts
// (blocks, cylinders, cones, spheres). Pure data, no three.js here, so it is testable in Node
// and identical for every player with the same seed.
import { rng, shuffle } from './geo.js';

export const CELL = 120; // studs per zone
export const GRID = 3;
export const HALF = (CELL * GRID) / 2;
export const WALK_SPEED = 16; // studs/s, like Roblox's default WalkSpeed

export const ZONES = {
  city: { name: 'Block City', emoji: '🏙️', ground: '#9aa4b8' },
  farm: { name: 'Sunny Farm', emoji: '🌻', ground: '#8fcf5b' },
  dock: { name: 'Fishing Dock', emoji: '🎣', ground: '#e8d49a' },
  obby: { name: 'Rainbow Obby', emoji: '🌈', ground: '#6fd3a6' },
  castle: { name: 'Knight Castle', emoji: '🏰', ground: '#7fae6a' },
  pirate: { name: 'Pirate Cove', emoji: '🏴‍☠️', ground: '#f1d38a' },
  spooky: { name: 'Spooky Woods', emoji: '🎃', ground: '#3b3552' },
  candy: { name: 'Candy Land', emoji: '🍭', ground: '#ffc3dd' },
  snow: { name: 'Frosty Peak', emoji: '❄️', ground: '#eef6ff' },
  volcano: { name: 'Lava Mountain', emoji: '🌋', ground: '#4a3a36' },
};

// Part: { s: shape, x, y (bottom), z, w, h, d, c: color, solid, ry?, a?: anim, e?: emissive }
const P = (s, x, y, z, w, h, d, c, o = {}) => ({ s, x, y, z, w, h, d, c, solid: true, ...o });

const BUILD = {
  city({ r, cx, cz, add, mark }) {
    const colors = ['#f7d794', '#f19066', '#78e08f', '#82ccdd', '#e77f67', '#cf6a87', '#f8a5c2'];
    add(P('box', cx, 0.05, cz, 108, 0.1, 10, '#454b5a', { solid: false })); // main roads
    add(P('box', cx, 0.05, cz, 10, 0.1, 108, '#454b5a', { solid: false }));
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const x = cx + qx * (18 + k * 22), z = cz + qz * (22 + r() * 14);
        const h = 10 + Math.floor(r() * 10);
        const c = colors[Math.floor(r() * colors.length)];
        add(P('box', x, 0, z, 14, h, 14, c));
        add(P('pyr', x, h, z, 17, 7, 17, '#8d5a4a', { solid: false }));
        add(P('box', x, 2, z - 7.1 * qz, 4, 5, 0.3, '#5b3a29', { solid: false })); // door
      }
    }
    const tx = cx + 40, tz = cz - 40;
    add(P('box', tx, 0, tz, 16, 46, 16, '#6c7a96'));
    add(P('box', tx, 46, tz, 18, 2, 18, '#3d4a66'));
    add(P('sph', tx, 48, tz, 3, 3, 3, '#ff4d6d', { solid: false, e: '#ff4d6d', a: 'blink' }));
    mark('Skyscraper', '🏢', tx, tz);
    add(P('cyl', cx, 0, cz, 12, 1.4, 12, '#b8c4d6'));
    add(P('cyl', cx, 1.4, cz, 9, 0.3, 9, '#4fc3f7', { solid: false, a: 'water' }));
    add(P('cyl', cx, 1.4, cz, 2, 6, 2, '#dfe6ee'));
    mark('Fountain', '⛲', cx, cz);
    for (let i = -2; i <= 2; i++) {
      if (!i) continue;
      add(P('cyl', cx + i * 20, 0, cz + 6.5, 0.6, 8, 0.6, '#2d3436'));
      add(P('sph', cx + i * 20, 8, cz + 6.5, 1.4, 1.4, 1.4, '#fff3b0', { solid: false, e: '#ffe066' }));
    }
  },

  farm({ r, cx, cz, add, mark }) {
    for (let row = 0; row < 8; row++) {
      for (let k = 0; k < 7; k++) {
        const c = row % 2 ? '#f6d743' : '#3fae49';
        add(P('box', cx - 44 + k * 6, 0, cz + 8 + row * 5, 3.5, 1.2 + r() * 1.2, 2.5, c, { solid: false }));
      }
    }
    const bx = cx + 28, bz = cz - 26;
    add(P('box', bx, 0, bz, 22, 12, 16, '#c0392b'));
    add(P('pyr', bx, 12, bz, 25, 8, 19, '#7f1f16', { solid: false }));
    add(P('box', bx, 0, bz - 8.1, 8, 9, 0.4, '#f5f6fa', { solid: false }));
    mark('Red Barn', '🛖', bx, bz);
    const wx = cx - 30, wz = cz - 30;
    add(P('cyl', wx, 0, wz, 7, 22, 7, '#f5f1e6'));
    add(P('cone', wx, 22, wz, 9, 6, 9, '#8d5a4a', { solid: false }));
    add(P('blades', wx, 18, wz - 4, 20, 20, 1, '#fff', { solid: false, a: 'spin' }));
    mark('Windmill', '🌬️', wx, wz);
    for (let i = 0; i < 12; i++) add(P('box', cx - 54 + i * 9.5, 0, cz + 52, 0.8, 3, 0.8, '#a0522d'));
    add(P('box', cx, 2, cz + 52, 108, 0.6, 0.4, '#a0522d', { solid: false }));
  },

  dock({ r, cx, cz, add, mark }) {
    add(P('box', cx + 10, 0.02, cz + 8, 88, 0.2, 80, '#2e86de', { solid: false, a: 'water' }));
    add(P('box', cx - 16, 1, cz + 8, 8, 0.6, 60, '#b9844f'));
    for (let i = 0; i < 6; i++) add(P('cyl', cx - 20 + (i % 2) * 8, 0, cz - 18 + Math.floor(i / 2) * 25, 1, 1.6, 1, '#6d4c2f'));
    mark('Wooden Pier', '🎣', cx - 16, cz + 20);
    const boats = [[cx + 20, cz + 18], [cx + 34, cz - 12]];
    boats.forEach(([x, z], i) => {
      add(P('box', x, 0.3, z, 7, 3, 16, i ? '#e67e22' : '#ffffff', { a: 'bob' }));
      add(P('cyl', x, 3.3, z, 0.6, 12, 0.6, '#6d4c2f', { solid: false, a: 'bob' }));
      add(P('box', x, 6, z + 0.5, 0.2, 7, 6, i ? '#f9ca24' : '#74b9ff', { solid: false, a: 'bob' }));
    });
    mark('Boats', '⛵', cx + 27, cz + 3);
    const lx = cx - 42, lz = cz - 40;
    for (let i = 0; i < 6; i++) add(P('cyl', lx, i * 4, lz, 8 - i * 0.5, 4, 8 - i * 0.5, i % 2 ? '#ffffff' : '#e74c3c'));
    add(P('sph', lx, 24, lz, 4, 4, 4, '#fff7ae', { solid: false, e: '#ffd32a', a: 'blink' }));
    add(P('cone', lx, 27, lz, 6, 4, 6, '#2d3436', { solid: false }));
    mark('Lighthouse', '🗼', lx, lz);
  },

  obby({ r, cx, cz, add, mark }) {
    const rainbow = ['#ff4d4d', '#ff9f43', '#feca57', '#1dd1a1', '#54a0ff', '#5f27cd', '#ff6bcb'];
    add(P('cyl', cx, 0, cz, 4, 62, 4, '#dfe6e9', { solid: false }));
    for (let i = 0; i < 26; i++) {
      const a = i * 0.62, rad = 12 + (i % 3) * 3;
      add(P('box', cx + Math.cos(a) * rad, 1.5 + i * 2.4, cz + Math.sin(a) * rad, 6, 1, 6, rainbow[i % rainbow.length]));
    }
    add(P('cyl', cx, 64, cz, 12, 1, 12, '#ffd32a'));
    add(P('cone', cx, 65, cz, 3, 6, 3, '#ffd700', { solid: false, e: '#ffb300', a: 'spin' }));
    mark('Obby Tower', '🏆', cx, cz);
    const sx = cx - 38, sz = cz + 38;
    add(P('box', sx, 0, sz, 14, 1, 14, '#2ecc71'));
    add(P('cyl', sx + 5, 1, sz, 0.5, 9, 0.5, '#dfe6e9', { solid: false }));
    add(P('box', sx + 7.5, 7, sz, 5, 3, 0.2, '#ff4d4d', { solid: false, a: 'flag' }));
    mark('Start Pad', '🚩', sx, sz);
    for (let i = 0; i < 8; i++) add(P('box', cx + 30 + (i % 2) * 6, 1 + i * 1.5, cz - 45 + i * 7, 5, 1, 5, rainbow[(i + 3) % 7]));
  },

  castle({ cx, cz, add, mark }) {
    const g = '#9aa0a6', dark = '#6c7278';
    add(P('box', cx, 0, cz - 40, 80, 10, 4, g));
    add(P('box', cx - 40, 0, cz, 4, 10, 80, g));
    add(P('box', cx + 40, 0, cz, 4, 10, 80, g));
    add(P('box', cx - 26, 0, cz + 40, 28, 10, 4, g));
    add(P('box', cx + 26, 0, cz + 40, 28, 10, 4, g));
    add(P('box', cx, 7, cz + 40, 24, 3, 4, dark, { solid: false }));
    mark('Castle Gate', '🚪', cx, cz + 40);
    for (const [x, z] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
      add(P('cyl', cx + x, 0, cz + z, 10, 18, 10, dark));
      add(P('cone', cx + x, 18, cz + z, 12, 9, 12, '#2c3e8f', { solid: false }));
    }
    add(P('box', cx, 0, cz - 6, 26, 22, 22, g));
    add(P('pyr', cx, 22, cz - 6, 28, 10, 24, '#2c3e8f', { solid: false }));
    add(P('cyl', cx, 32, cz - 6, 0.5, 8, 0.5, '#dfe6e9', { solid: false }));
    add(P('box', cx + 2.5, 37, cz - 6, 5, 3, 0.2, '#f9ca24', { solid: false, a: 'flag' }));
    mark('Royal Keep', '🏰', cx, cz - 6);
  },

  pirate({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 9; i++) {
      const x = cx - 45 + r() * 90, z = cz - 45 + r() * 40;
      add(P('cyl', x, 0, z, 1.6, 12, 1.6, '#8e5b34'));
      for (let k = 0; k < 4; k++) add(P('box', x, 12, z, 9, 0.6, 2.5, '#27ae60', { solid: false, ry: (k * Math.PI) / 4 }));
    }
    const sx = cx + 8, sz = cz + 26;
    add(P('box', sx, 0, sz, 34, 6, 11, '#5d3a1a'));
    add(P('box', sx - 12, 6, sz, 8, 4, 11, '#6e4524'));
    for (const dx of [-4, 8]) {
      add(P('cyl', sx + dx, 6, sz, 0.8, 20, 0.8, '#3d2610', { solid: false }));
      add(P('box', sx + dx, 11, sz, 0.3, 9, 9, '#1e1e24', { solid: false, a: 'flag' }));
    }
    mark('Pirate Ship', '🏴‍☠️', sx, sz);
    const tx = cx - 30, tz = cz - 32;
    add(P('box', tx, 0, tz, 5, 3, 3.5, '#8d5a2b'));
    add(P('box', tx, 3, tz, 5.2, 1.2, 3.7, '#f1c40f', { solid: false, e: '#f39c12' }));
    mark('Treasure', '💰', tx, tz);
  },

  spooky({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 14; i++) {
      const x = cx - 50 + r() * 100, z = cz - 50 + r() * 100;
      if (Math.abs(x - (cx + 20)) < 16 && Math.abs(z - (cz - 20)) < 16) continue;
      add(P('cyl', x, 0, z, 1.8, 14, 1.8, '#2d2438'));
      add(P('box', x + 2, 9, z, 6, 0.8, 0.8, '#2d2438', { solid: false, ry: r() * 3 }));
    }
    const hx = cx + 20, hz = cz - 20;
    add(P('box', hx, 0, hz, 20, 16, 16, '#4b3b6b'));
    add(P('pyr', hx, 16, hz, 22, 10, 18, '#231b33', { solid: false }));
    for (const dx of [-5, 5]) add(P('box', hx + dx, 8, hz - 8.1, 3, 3, 0.3, '#ffe66d', { solid: false, e: '#ffd23f', a: 'blink' }));
    mark('Haunted House', '🏚️', hx, hz);
    const gx = cx - 25, gz = cz + 28;
    for (let i = 0; i < 8; i++) add(P('box', gx + (i % 4) * 6, 0, gz + Math.floor(i / 4) * 8, 3, 4, 0.8, '#8395a7'));
    mark('Graveyard', '🪦', gx + 9, gz + 4);
    for (let i = 0; i < 7; i++) add(P('sph', cx - 40 + r() * 80, 0, cz - 40 + r() * 80, 2.4, 2, 2.4, '#ff7f11', { solid: false, e: '#ff6b00' }));
  },

  candy({ r, cx, cz, add, mark }) {
    const pops = ['#ff6bcb', '#5ee7ff', '#fff176', '#b388ff', '#69f0ae'];
    for (let i = 0; i < 10; i++) {
      const x = cx - 48 + r() * 96, z = cz - 48 + r() * 96;
      if (Math.hypot(x - cx, z - cz) < 18) continue;
      add(P('cyl', x, 0, z, 0.7, 10, 0.7, '#ffffff'));
      add(P('disc', x, 10, z, 7, 1, 7, pops[i % pops.length], { solid: false, a: 'spin' }));
    }
    for (let i = 0; i < 8; i++) add(P('cone', cx - 45 + r() * 90, 0, cz - 45 + r() * 90, 4, 3.5, 4, pops[(i + 2) % 5]));
    add(P('cyl', cx, 0, cz, 16, 9, 16, '#c77dff'));
    add(P('sph', cx, 7, cz, 17, 12, 17, '#ffd6ec', { solid: false }));
    add(P('sph', cx, 17, cz, 3.5, 3.5, 3.5, '#ff3b5c', { solid: false }));
    mark('Giant Cupcake', '🧁', cx, cz);
  },

  snow({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 14; i++) {
      const x = cx - 50 + r() * 100, z = cz - 50 + r() * 100;
      if (Math.hypot(x - (cx - 20), z - (cz + 20)) < 14 || Math.hypot(x - (cx + 22), z - (cz - 18)) < 18) continue;
      add(P('cyl', x, 0, z, 1.2, 3, 1.2, '#6d4c41'));
      for (let k = 0; k < 3; k++) add(P('cone', x, 3 + k * 3.5, z, 9 - k * 2.5, 5, 9 - k * 2.5, k === 2 ? '#e3f2fd' : '#2e7d32', { solid: false }));
    }
    add(P('dome', cx - 20, 0, cz + 20, 16, 8, 16, '#f5fbff'));
    mark('Igloo', '🛖', cx - 20, cz + 20);
    add(P('cyl', cx + 22, 0.02, cz - 18, 30, 0.2, 30, '#b3e5fc', { solid: false }));
    mark('Frozen Lake', '🧊', cx + 22, cz - 18);
    const sx = cx + 30, sz = cz + 34;
    [[5, 0], [3.6, 4.2], [2.6, 7.2]].forEach(([s, y]) => add(P('sph', sx, y, sz, s, s, s, '#ffffff')));
    add(P('cone', sx, 8.4, sz - 1.4, 0.8, 1.6, 0.8, '#ff7043', { solid: false }));
    mark('Snowman', '⛄', sx, sz);
  },

  volcano({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 6; i++) add(P('cyl', cx, i * 5, cz, 60 - i * 9, 5, 60 - i * 9, i % 2 ? '#5d4037' : '#4e342e'));
    add(P('cyl', cx, 30, cz, 8, 0.6, 8, '#ff5722', { solid: false, e: '#ff3d00', a: 'lava' }));
    mark('Lava Crater', '🌋', cx, cz);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      add(P('box', cx + Math.cos(a) * 36, 0.05, cz + Math.sin(a) * 36, 4, 0.2, 22, '#ff6d00', { solid: false, e: '#ff3d00', ry: -a + Math.PI / 2, a: 'lava' }));
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28, d = 40 + r() * 14;
      add(P('box', cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, 4 + r() * 4, 2 + r() * 3, 4 + r() * 4, '#3e2723'));
    }
  },
};

export function makeWorld(seed) {
  const r = rng(`world:${seed}`);
  const types = shuffle(r, Object.keys(ZONES)).slice(0, GRID * GRID);
  const parts = [];
  const landmarks = [];
  const zones = types.map((type, i) => {
    const cx = -HALF + CELL * ((i % GRID) + 0.5);
    const cz = -HALF + CELL * (Math.floor(i / GRID) + 0.5);
    parts.push(P('box', cx, 0, cz, CELL - 10, 0.08, CELL - 10, ZONES[type].ground, { solid: false }));
    BUILD[type]({ r, cx, cz, add: (p) => parts.push(p), mark: (name, emoji, x, z) => landmarks.push({ name, emoji, x, z, zone: type }) });
    return { type, cx, cz, ...ZONES[type] };
  });
  const index = buildIndex(parts);
  const spawns = shuffle(r, zones).map((z) => findSpawn(r, index, z)).filter(Boolean);
  return { seed, zones, parts, landmarks, spawns, index, size: CELL * GRID };
}

// ---- physics helpers (spatial hash of solid parts) ----
const BUCKET = 16;
const key = (bx, bz) => `${bx},${bz}`;
const footprint = (p) => {
  // rotated boxes: use the bounding square of the rotated footprint
  const s = p.ry ? Math.abs(Math.cos(p.ry)) * p.w + Math.abs(Math.sin(p.ry)) * p.d : p.w;
  const t = p.ry ? Math.abs(Math.sin(p.ry)) * p.w + Math.abs(Math.cos(p.ry)) * p.d : p.d;
  return { x0: p.x - s / 2, x1: p.x + s / 2, z0: p.z - t / 2, z1: p.z + t / 2 };
};
export function buildIndex(parts) {
  const map = new Map();
  for (const p of parts) {
    if (!p.solid) continue;
    const f = footprint(p);
    const box = { ...f, y0: p.y, y1: p.y + p.h, round: p.s === 'cyl' || p.s === 'sph' || p.s === 'dome' };
    for (let bx = Math.floor(f.x0 / BUCKET); bx <= Math.floor(f.x1 / BUCKET); bx++)
      for (let bz = Math.floor(f.z0 / BUCKET); bz <= Math.floor(f.z1 / BUCKET); bz++) {
        const k = key(bx, bz);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(box);
      }
  }
  return map;
}
const near = (index, x, z) => index.get(key(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) ?? [];
const inside = (b, x, z, pad) => {
  if (b.round) {
    const rx = (b.x1 - b.x0) / 2 + pad, rz = (b.z1 - b.z0) / 2 + pad;
    const dx = x - (b.x0 + b.x1) / 2, dz = z - (b.z0 + b.z1) / 2;
    return (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) <= 1;
  }
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
};
// Highest walkable surface at (x,z) that the feet can step onto.
export function groundAt(index, x, z, feet, step = 1.2) {
  let g = 0;
  for (const b of near(index, x, z)) if (b.y1 <= feet + step && b.y1 > g && inside(b, x, z, 0)) g = b.y1;
  return g;
}
// Is a body of `radius` standing with feet at `feet` blocked at (x,z)?
export function blocked(index, x, z, feet, radius = 1.1, height = 5, step = 1.2) {
  if (Math.abs(x) > HALF + 30 || Math.abs(z) > HALF + 30) return true; // edge of the world
  for (const b of near(index, x, z)) if (b.y1 > feet + step && b.y0 < feet + height && inside(b, x, z, radius)) return true;
  return false;
}
function findSpawn(r, index, zone) {
  for (let i = 0; i < 80; i++) {
    const x = zone.cx - 48 + r() * 96, z = zone.cz - 48 + r() * 96;
    if (!blocked(index, x, z, 0, 3, 5, 0.2) && groundAt(index, x, z, 0) === 0) return { x, z, zone: zone.type };
  }
  return null;
}

// Top-down map projection helpers (world <-> 0..1)
export const toMap = (x, z) => ({ u: (x + HALF) / (HALF * 2), v: (z + HALF) / (HALF * 2) });
export const fromMap = (u, v) => ({ x: u * HALF * 2 - HALF, z: v * HALF * 2 - HALF });
