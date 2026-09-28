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
  school: { name: 'Block School', emoji: '🏫', ground: '#c9b08a' },
  bathroom: { name: 'Giant Bathroom', emoji: '🛁', ground: '#d7eef7' },
  kitchen: { name: 'Mega Kitchen', emoji: '🍳', ground: '#f3e0c0' },
  bedroom: { name: 'Toy Bedroom', emoji: '🧸', ground: '#b9a3e3' },
  playground: { name: 'Playground', emoji: '🛝', ground: '#f5d58a' },
  stadium: { name: 'Soccer Stadium', emoji: '⚽', ground: '#3fa34d' },
  space: { name: 'Moon Base', emoji: '🚀', ground: '#8e8e9e' },
  jungle: { name: 'Wild Jungle', emoji: '🦜', ground: '#2f7d3a' },
  desert: { name: 'Sandy Desert', emoji: '🐫', ground: '#e9c27a' },
  arcade: { name: 'Neon Arcade', emoji: '🕹️', ground: '#2a2346' },
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

  school({ r, cx, cz, add, mark }) {
    const sx = cx, sz = cz - 30;
    add(P('box', sx, 0, sz, 60, 18, 18, '#e8744f'));
    add(P('box', sx, 18, sz, 62, 1.5, 20, '#8d4a36', { solid: false }));
    for (let i = 0; i < 6; i++) add(P('box', sx - 25 + i * 10, 6, sz + 9.1, 5, 5, 0.3, '#bfe9ff', { solid: false }));
    add(P('box', sx, 0, sz + 9.1, 6, 9, 0.4, '#5b3a29', { solid: false }));
    add(P('box', sx, 19.5, sz, 10, 8, 10, '#e8744f'));
    add(P('cyl', sx, 24, sz - 5.2, 5, 5, 0.4, '#ffffff', { solid: false, ry: Math.PI / 2, e: '#ffffff' })); // clock
    mark('School', '🏫', sx, sz);
    const bx = cx - 36, bz = cz + 30; // school bus
    add(P('box', bx, 1, bz, 10, 7, 24, '#f7c600'));
    for (const dz of [-8, 8]) for (const dx of [-5, 5]) add(P('cyl', bx + dx, 0, bz + dz, 3, 3, 3, '#222', { solid: false, ry: Math.PI / 2 }));
    for (let i = 0; i < 4; i++) add(P('box', bx + 5.1, 5, bz - 8 + i * 5, 0.3, 2.5, 3.5, '#bfe9ff', { solid: false }));
    mark('School Bus', '🚌', bx, bz);
    const px = cx + 34, pz = cz + 28; // giant pencil + books
    add(P('box', px, 0, pz, 3, 3, 30, '#ffb400', { ry: 0.3 }));
    add(P('box', px - 4.5, 0, pz - 14, 3, 3, 3, '#f8a5c2', { solid: false, ry: 0.3 }));
    [['#e74c3c', 0], ['#3498db', 2.5], ['#2ecc71', 5]].forEach(([c, y]) => add(P('box', px - 14, y, pz + 18, 12, 2.5, 16, c, { ry: r() * 0.4 })));
    mark('Giant Pencil', '✏️', px, pz);
    add(P('cyl', cx + 40, 0, cz - 2, 0.5, 14, 0.5, '#dfe6e9', { solid: false }));
    add(P('box', cx + 42.5, 11, cz - 2, 5, 3, 0.2, '#3498db', { solid: false, a: 'flag' }));
  },

  bathroom({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 8; i++) add(P('box', cx - 49 + i * 14, 0.1, cz, 0.4, 0.05, 108, '#b5d8e6', { solid: false })); // tiles
    const tx = cx + 26, tz = cz - 26; // giant bathtub with bubbles
    add(P('box', tx, 0, tz, 44, 10, 22, '#ffffff'));
    add(P('box', tx, 9, tz, 40, 0.5, 18, '#7fd3ff', { solid: false, a: 'water' }));
    for (let i = 0; i < 9; i++) add(P('sph', tx - 16 + r() * 32, 9.5, tz - 6 + r() * 12, 3 + r() * 3, 3 + r() * 2, 3 + r() * 3, '#f4fbff', { solid: false, a: 'bob' }));
    add(P('box', tx + 10, 9.2, tz, 4, 3, 4, '#ffd32a', { solid: false, a: 'bob' }));
    add(P('sph', tx + 10, 12, tz - 1, 2.6, 2.6, 2.6, '#ffd32a', { solid: false, a: 'bob' }));
    add(P('cone', tx + 10, 12.8, tz - 3, 1.2, 1.2, 1.2, '#ff9f1a', { solid: false, a: 'bob' }));
    mark('Bubble Bath', '🛁', tx, tz);
    const wx = cx - 30, wz = cz - 28; // toilet
    add(P('cyl', wx, 0, wz, 12, 7, 14, '#ffffff'));
    add(P('box', wx, 0, wz - 9, 12, 16, 5, '#f1f2f6'));
    add(P('cyl', wx, 7, wz, 11, 0.6, 13, '#74b9ff', { solid: false }));
    mark('Giant Toilet', '🚽', wx, wz);
    const kx = cx + 30, kz = cz + 32; // sink + toothbrush
    add(P('box', kx, 0, kz, 20, 12, 12, '#dfe6e9'));
    add(P('box', kx, 12, kz, 16, 0.5, 8, '#b2ebf2', { solid: false }));
    add(P('box', kx - 16, 0, kz, 3, 22, 2, '#1dd1a1', { ry: 0.2 }));
    add(P('box', kx - 16, 22, kz, 3.5, 3, 3, '#ffffff', { solid: false, ry: 0.2 }));
    mark('Sink', '🪥', kx, kz);
    add(P('cyl', cx - 32, 0, cz + 30, 6, 10, 6, '#ff6bcb'));
    add(P('sph', cx - 32, 10, cz + 30, 7, 3, 7, '#ffffff', { solid: false }));
  },

  kitchen({ r, cx, cz, add, mark }) {
    const tx = cx, tz = cz; // giant table
    add(P('box', tx, 16, tz, 40, 2, 26, '#c68642'));
    for (const [dx, dz] of [[-18, -11], [18, -11], [-18, 11], [18, 11]]) add(P('box', tx + dx, 0, tz + dz, 2.5, 16, 2.5, '#9c6630'));
    add(P('cyl', tx - 8, 18, tz, 12, 4, 12, '#ffffff', { solid: false }));
    add(P('cyl', tx - 8, 21, tz, 10, 0.6, 10, '#f5e6c8', { solid: false }));
    for (let i = 0; i < 8; i++) add(P('sph', tx - 12 + r() * 8, 21.4, tz - 4 + r() * 8, 1.4, 1, 1.4, ['#ff6b6b', '#feca57', '#1dd1a1'][i % 3], { solid: false }));
    add(P('box', tx + 10, 18, tz + 4, 6, 12, 4, '#ff7675', { solid: false }));
    mark('Cereal Table', '🥣', tx, tz);
    const fx = cx - 38, fz = cz - 34; // fridge
    add(P('box', fx, 0, fz, 16, 34, 14, '#e3eaf2'));
    add(P('box', fx + 8.1, 12, fz - 3, 0.6, 10, 1, '#95a5a6', { solid: false }));
    add(P('box', fx, 21, fz + 7.1, 16, 0.3, 0.2, '#95a5a6', { solid: false }));
    mark('Fridge', '🧊', fx, fz);
    const sx = cx + 36, sz = cz - 34; // stove + pan
    add(P('box', sx, 0, sz, 20, 14, 16, '#34495e'));
    add(P('cyl', sx - 4, 14, sz, 9, 1, 9, '#2d3436', { solid: false }));
    add(P('cyl', sx - 4, 15, sz, 5, 0.4, 5, '#ffeaa7', { solid: false }));
    add(P('sph', sx - 4, 15.3, sz, 2, 1, 2, '#fdcb6e', { solid: false }));
    add(P('box', sx + 5, 14, sz, 3, 0.2, 3, '#ff3d00', { solid: false, e: '#ff3d00', a: 'lava' }));
    mark('Stove', '🍳', sx, sz);
    const dx = cx + 34, dz = cz + 34; // donut + cupcake treats
    add(P('cyl', dx, 0, dz, 16, 5, 16, '#ff9ff3'));
    add(P('cyl', dx, 0, dz, 5, 5.2, 5, '#f3e0c0', { solid: false }));
    mark('Giant Donut', '🍩', dx, dz);
  },

  bedroom({ r, cx, cz, add, mark }) {
    add(P('cyl', cx, 0.1, cz, 70, 0.1, 70, '#ffc7e0', { solid: false })); // round rug
    const bx = cx - 26, bz = cz - 26; // bed
    add(P('box', bx, 0, bz, 34, 8, 48, '#6c5ce7'));
    add(P('box', bx, 8, bz + 4, 32, 3, 38, '#a29bfe', { solid: false }));
    add(P('box', bx, 8, bz - 19, 20, 4, 7, '#ffffff', { solid: false }));
    add(P('box', bx, 0, bz - 24.5, 34, 18, 2, '#4834d4'));
    mark('Big Bed', '🛏️', bx, bz);
    const tx = cx + 28, tz = cz - 20; // teddy bear
    add(P('sph', tx, 0, tz, 12, 12, 10, '#c08552'));
    add(P('sph', tx, 10, tz, 9, 9, 9, '#c08552', { solid: false }));
    for (const d of [-3.5, 3.5]) add(P('sph', tx + d, 17, tz, 3, 3, 3, '#a0673f', { solid: false }));
    add(P('sph', tx, 12, tz - 4.2, 3, 2.4, 1.6, '#e8c39e', { solid: false }));
    mark('Teddy Bear', '🧸', tx, tz);
    const colors = ['#ff4d4d', '#feca57', '#1dd1a1', '#54a0ff'];
    for (let i = 0; i < 10; i++) add(P('box', cx - 30 + r() * 60, 0, cz + 18 + r() * 30, 5, 5, 5, colors[i % 4], { ry: r() * 1.5 })); // toy blocks
    add(P('box', cx + 32, 0, cz + 34, 5, 5, 5, colors[0]));
    add(P('box', cx + 32, 5, cz + 34, 5, 5, 5, colors[1]));
    add(P('box', cx + 32, 10, cz + 34, 5, 5, 5, colors[3]));
    mark('Toy Blocks', '🧱', cx + 32, cz + 34);
    add(P('cyl', cx + 44, 0, cz + 4, 1, 20, 1, '#dfe6e9', { solid: false })); // lamp
    add(P('cone', cx + 44, 18, cz + 4, 8, 7, 8, '#fff3b0', { solid: false, e: '#ffe066' }));
  },

  playground({ r, cx, cz, add, mark }) {
    const sx = cx - 20, sz = cz - 22; // slide tower
    add(P('box', sx, 0, sz, 10, 10, 10, '#54a0ff'));
    add(P('pyr', sx, 10, sz, 12, 6, 12, '#ff4d4d', { solid: false }));
    for (let i = 0; i < 5; i++) add(P('box', sx - 7, i * 2, sz - 4 + i * 0, 4, 2, 2, '#feca57'));
    for (let i = 0; i < 8; i++) add(P('box', sx + 7 + i * 2, 10 - i * 1.25, sz, 2.2, 0.6, 5, '#feca57', { solid: false }));
    mark('Slide', '🛝', sx, sz);
    const wx = cx + 26, wz = cz - 24; // swings
    for (const dx of [-12, 12]) add(P('cyl', wx + dx, 0, wz, 1, 14, 1, '#e17055', { solid: false }));
    add(P('box', wx, 14, wz, 26, 1, 1, '#e17055', { solid: false }));
    for (const dx of [-5, 5]) add(P('box', wx + dx, 3, wz, 4, 0.5, 2, '#2d3436', { solid: false, a: 'flag' }));
    mark('Swings', '🎠', wx, wz);
    const bx = cx + 24, bz = cz + 28; // sandbox
    add(P('box', bx, 0, bz, 26, 1.4, 26, '#b9844f'));
    add(P('box', bx, 1.4, bz, 23, 0.2, 23, '#f6e3a1', { solid: false }));
    add(P('cone', bx - 3, 1.6, bz + 2, 7, 4, 7, '#f6e3a1', { solid: false }));
    add(P('box', bx + 6, 1.6, bz - 5, 3, 2.5, 3, '#ff6bcb', { solid: false }));
    mark('Sandbox', '🏖️', bx, bz);
    add(P('cyl', cx - 30, 0, cz + 28, 16, 1, 16, '#ff9f43', { a: 'spin' })); // merry-go-round
    add(P('cyl', cx - 30, 1, cz + 28, 1, 5, 1, '#dfe6e9', { solid: false }));
  },

  stadium({ cx, cz, add, mark }) {
    add(P('box', cx, 0.1, cz, 70, 0.05, 44, '#4cbb5a', { solid: false }));
    add(P('box', cx, 0.15, cz, 0.6, 0.05, 44, '#ffffff', { solid: false }));
    add(P('cyl', cx, 0.15, cz, 14, 0.04, 14, '#ffffff', { solid: false }));
    add(P('cyl', cx, 0.16, cz, 13, 0.05, 13, '#4cbb5a', { solid: false }));
    for (const s of [-1, 1]) {
      const gx = cx + s * 35;
      add(P('box', gx, 0, cz - 7, 1, 8, 1, '#ffffff'));
      add(P('box', gx, 0, cz + 7, 1, 8, 1, '#ffffff'));
      add(P('box', gx, 8, cz, 1, 1, 15, '#ffffff', { solid: false }));
      add(P('box', gx + s * 3, 0, cz, 0.2, 8, 15, '#dfe6e9', { solid: false }));
    }
    mark('Goals', '🥅', cx + 35, cz);
    add(P('sph', cx + 6, 0, cz + 4, 3, 3, 3, '#ffffff', { a: 'bob' }));
    mark('Soccer Ball', '⚽', cx + 6, cz + 4);
    for (let row = 0; row < 4; row++) { // stands with fans
      add(P('box', cx, row * 3, cz - 34 - row * 4, 90, 3, 4, '#636e72'));
      for (let i = 0; i < 14; i++) add(P('box', cx - 42 + i * 6.5, row * 3 + 3, cz - 34 - row * 4, 1.6, 2, 1.2, ['#e74c3c', '#3498db', '#f1c40f', '#ffffff'][(i + row) % 4], { solid: false, a: 'bob' }));
    }
    mark('Stands', '🏟️', cx, cz - 40);
    for (const s of [-1, 1]) {
      add(P('cyl', cx + s * 48, 0, cz + 40, 1.2, 30, 1.2, '#b2bec3', { solid: false }));
      add(P('box', cx + s * 48, 30, cz + 40, 8, 4, 2, '#ffffff', { solid: false, e: '#fffbe6' }));
    }
  },

  space({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 10; i++) { // craters
      const x = cx - 45 + r() * 90, z = cz - 45 + r() * 90, s = 6 + r() * 10;
      if (Math.hypot(x - cx, z - cz) < 20) continue;
      add(P('cyl', x, 0.1, z, s, 0.4, s, '#6b6b7b', { solid: false }));
    }
    const rx = cx, rz = cz; // rocket
    add(P('cyl', rx, 0, rz, 9, 34, 9, '#f5f6fa'));
    add(P('cone', rx, 34, rz, 9, 12, 9, '#e84118', { solid: false }));
    add(P('sph', rx, 22, rz - 4.4, 3.4, 3.4, 1, '#74b9ff', { solid: false, e: '#74b9ff' }));
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; add(P('box', rx + Math.cos(a) * 5.5, 0, rz + Math.sin(a) * 5.5, 1, 10, 5, '#e84118', { solid: false, ry: -a })); }
    add(P('cone', rx, -0.2, rz, 6, 3, 6, '#ff9f1a', { solid: false, e: '#ff6b00', a: 'lava' }));
    mark('Rocket', '🚀', rx, rz);
    const dx = cx - 30, dz = cz + 30;
    add(P('dome', dx, 0, dz, 26, 13, 26, '#dfe6e9'));
    add(P('box', dx, 0, dz - 13, 6, 7, 3, '#b2bec3'));
    mark('Moon Base', '🛸', dx, dz);
    const sx = cx + 34, sz = cz - 30; // satellite dish
    add(P('cyl', sx, 0, sz, 2, 10, 2, '#b2bec3'));
    add(P('dome', sx, 10, sz, 14, 4, 14, '#ffffff', { solid: false, a: 'spin' }));
    mark('Satellite', '📡', sx, sz);
    add(P('sph', cx + 38, 26, cz + 38, 10, 10, 10, '#4a90e2', { solid: false, e: '#1e3799', a: 'spin' })); // floating planet
    add(P('disc', cx + 38, 30.5, cz + 38, 18, 0.5, 18, '#f8c291', { solid: false, a: 'spin' }));
  },

  jungle({ r, cx, cz, add, mark }) {
    for (let i = 0; i < 16; i++) {
      const x = cx - 50 + r() * 100, z = cz - 50 + r() * 100;
      if (Math.hypot(x - (cx + 18), z - (cz - 18)) < 18 || Math.hypot(x - (cx - 22), z - (cz + 26)) < 16) continue;
      add(P('cyl', x, 0, z, 2, 16, 2, '#6d4c2f'));
      add(P('sph', x, 13, z, 12, 8, 12, i % 2 ? '#1e8e3e' : '#27ae60', { solid: false }));
    }
    const tx = cx + 18, tz = cz - 18; // temple
    for (let i = 0; i < 4; i++) add(P('box', tx, i * 5, tz, 30 - i * 6, 5, 30 - i * 6, i % 2 ? '#7f8c6d' : '#95a37e'));
    add(P('box', tx, 20, tz, 4, 3, 4, '#f1c40f', { solid: false, e: '#f39c12', a: 'blink' }));
    mark('Lost Temple', '🛕', tx, tz);
    const wx = cx - 22, wz = cz + 26; // waterfall pond
    add(P('cyl', wx, 0.05, wz, 24, 0.3, 24, '#2e86de', { solid: false, a: 'water' }));
    add(P('box', wx, 0, wz - 13, 20, 18, 6, '#6b705c'));
    add(P('box', wx, 1, wz - 9.8, 8, 17, 0.4, '#74b9ff', { solid: false, a: 'water' }));
    mark('Waterfall', '🌊', wx, wz);
    const px = cx - 36, pz = cz - 34; // parrot perch
    add(P('cyl', px, 0, pz, 1.2, 12, 1.2, '#6d4c2f', { solid: false }));
    add(P('sph', px, 12, pz, 2.4, 3, 2.4, '#e74c3c', { solid: false, a: 'bob' }));
    add(P('cone', px, 11, pz + 1.8, 1.8, 3, 1.8, '#3498db', { solid: false, a: 'bob' }));
  },

  desert({ r, cx, cz, add, mark }) {
    const px = cx + 16, pz = cz - 18;
    add(P('pyr', px, 0, pz, 50, 32, 50, '#e1b05c'));
    mark('Pyramid', '🔺', px, pz);
    for (let i = 0; i < 9; i++) {
      const x = cx - 50 + r() * 100, z = cz - 50 + r() * 100;
      if (Math.hypot(x - px, z - pz) < 32 || Math.hypot(x - (cx - 24), z - (cz + 26)) < 18) continue;
      add(P('cyl', x, 0, z, 2.4, 10, 2.4, '#2f9e44'));
      add(P('cyl', x + 2.4, 4, z, 1.4, 4, 1.4, '#2f9e44', { solid: false }));
      add(P('sph', x, 10, z, 2.4, 2, 2.4, '#2f9e44', { solid: false }));
    }
    const ox = cx - 24, oz = cz + 26; // oasis
    add(P('cyl', ox, 0.05, oz, 22, 0.3, 22, '#4fc3f7', { solid: false, a: 'water' }));
    for (const [dx, dz] of [[-12, -8], [12, 6], [0, 13]]) {
      add(P('cyl', ox + dx, 0, oz + dz, 1.3, 13, 1.3, '#a0522d'));
      for (let k = 0; k < 4; k++) add(P('box', ox + dx, 13, oz + dz, 9, 0.5, 2.2, '#27ae60', { solid: false, ry: (k * Math.PI) / 4 }));
    }
    mark('Oasis', '🌴', ox, oz);
    const kx = cx + 36, kz = cz + 34; // camel
    add(P('box', kx, 6, kz, 5, 5, 12, '#c8a165'));
    add(P('sph', kx, 10, kz, 4, 4, 5, '#c8a165', { solid: false }));
    add(P('box', kx, 8, kz - 7, 2, 7, 2, '#c8a165', { solid: false }));
    add(P('box', kx, 14, kz - 8, 2.5, 2.5, 4, '#c8a165', { solid: false }));
    for (const [dx, dz] of [[-2, -4], [2, -4], [-2, 4], [2, 4]]) add(P('box', kx + dx, 0, kz + dz, 1.2, 6, 1.2, '#b08a52'));
    mark('Camel', '🐫', kx, kz);
  },

  arcade({ r, cx, cz, add, mark }) {
    const neon = ['#ff2e97', '#00e5ff', '#b2ff59', '#ffea00', '#d500f9'];
    for (let i = 0; i < 7; i++) add(P('box', cx - 45 + i * 15, 0.1, cz, 0.6, 0.05, 108, neon[i % 5], { solid: false, e: neon[i % 5], a: 'blink' }));
    for (let i = 0; i < 6; i++) { // arcade cabinets
      const x = cx - 40 + i * 9, z = cz - 38;
      add(P('box', x, 0, z, 6, 14, 6, '#1e1b3a'));
      add(P('box', x, 8, z + 3.1, 4.4, 4, 0.2, neon[i % 5], { solid: false, e: neon[i % 5], a: 'blink' }));
      add(P('box', x, 14, z, 6.2, 2, 6.2, neon[(i + 2) % 5], { solid: false, e: neon[(i + 2) % 5] }));
    }
    mark('Arcade Games', '🕹️', cx - 18, cz - 38);
    const clx = cx + 30, clz = cz - 26; // claw machine
    add(P('box', clx, 0, clz, 14, 6, 14, '#ff2e97'));
    add(P('box', clx, 6, clz, 14, 14, 14, '#bfe9ff', { solid: false }));
    for (let i = 0; i < 8; i++) add(P('sph', clx - 4 + r() * 8, 6, clz - 4 + r() * 8, 3, 3, 3, neon[i % 5], { solid: false }));
    add(P('box', clx, 20, clz, 15, 2, 15, '#ff2e97', { solid: false, e: '#ff2e97' }));
    add(P('cyl', clx, 14, clz, 0.4, 6, 0.4, '#dfe6e9', { solid: false, a: 'bob' }));
    mark('Claw Machine', '🧸', clx, clz);
    const dx = cx + 10, dz = cz + 28; // dance floor
    for (let i = 0; i < 16; i++) add(P('box', dx - 12 + (i % 4) * 8, 0, dz - 12 + Math.floor(i / 4) * 8, 7.6, 0.4, 7.6, neon[(i * 3) % 5], { solid: false, e: neon[(i * 3) % 5], a: 'blink' }));
    mark('Dance Floor', '🪩', dx, dz);
    add(P('sph', dx, 26, dz, 5, 5, 5, '#dfe6e9', { solid: false, e: '#ffffff', a: 'spin' }));
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
