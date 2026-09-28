// Infinite Parkour: seeded course generator + shared rules (client, tests and the Worker use this file).
// Every jump is built inside the Roblox jump envelope (JumpPower 50, gravity 196.2, WalkSpeed 16)
// with a safety margin, and difficulty ramps slowly, so kids are challenged but never stuck.
import { rng } from './geo.js';

export const GRAVITY = 196.2;
export const JUMP = 50;
export const SPEED = 16;
export const BOUNCE = 82; // bounce pads: ~17 studs high
export const CP_EVERY = 10; // a checkpoint every 10 platforms
export const RACE_GOAL = 50; // PvP: first to platform 50 wins
export const MIN_MS_PER_PLAT = 400; // server plausibility: nobody clears a platform faster than this (a jump alone is ~0.5 s)
// Guardian angel: pure luck, but a little luckier every time you fall in the same stage (so nobody gets stuck
// feeling unlucky): 10% on the first fall, +8% per extra fall, never more than 50%.
export const angelChance = (fallsThisStage) => Math.min(0.5, 0.1 + 0.08 * Math.max(0, fallsThisStage - 1));

// The course climbs from the jungle floor up through the clouds into space (themes follow the altitude).
export const THEMES = [
  { name: 'Jungle Vines', emoji: '🌴', sky: ['#56c27a', '#e2ffd8'], cols: ['#27ae60', '#c68642', '#f6d743', '#ff7f50'] },
  { name: 'Ocean Breeze', emoji: '🌊', sky: ['#3d9bff', '#c9f1ff'], cols: ['#1dd1a1', '#54a0ff', '#feca57', '#ffffff'] },
  { name: 'Candy Clouds', emoji: '🍭', sky: ['#ff9ad5', '#ffe3f4'], cols: ['#ff6bcb', '#5ee7ff', '#fff176', '#b388ff'] },
  { name: 'Frozen Peaks', emoji: '❄️', sky: ['#8fd0ff', '#f2fbff'], cols: ['#e3f2fd', '#81d4fa', '#b39ddb', '#ffffff'] },
  { name: 'Sunset Sky', emoji: '🌅', sky: ['#ff7043', '#ffd180'], cols: ['#6d4c41', '#ff9f43', '#feca57', '#a1887f'] },
  { name: 'Space Walk', emoji: '🚀', sky: ['#140f3a', '#5b3fa8'], cols: ['#b2ff59', '#00e5ff', '#ff2e97', '#ffea00'] },
  { name: 'Rainbow Galaxy', emoji: '🌌', sky: ['#05030f', '#2b1a5e'], cols: ['#ff4d6d', '#ffd23f', '#3ecf8e', '#5ee7ff'] },
];
export const stageOf = (i) => Math.floor(i / CP_EVERY);
export const themeIndex = (i) => { const s = stageOf(i); return s < 6 ? s : 5 + ((s - 5) % 2); }; // space forever after that
export const themeOf = (i) => THEMES[themeIndex(i)];
// Weeks start on Monday (1970-01-01 was a Thursday). Same week => same ranked course for everybody.
export const weekOf = (ms = Date.now()) => Math.floor((ms / 864e5 + 3) / 7);

// Horizontal distance a running jump covers when landing `dy` studs higher.
export function reach(dy, vy = JUMP) {
  const disc = vy * vy - 2 * GRAVITY * dy;
  if (disc < 0) return 0;
  return (SPEED * (vy + Math.sqrt(disc))) / GRAVITY;
}

// Platform-local coordinates (platforms are rotated by ry around Y, their depth `d` runs along the path).
export function local(p, x, z, px = p.x, pz = p.z) {
  const dx = x - px, dz = z - pz, c = Math.cos(p.ry), s = Math.sin(p.ry);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
export function onTop(p, x, z, pad = 0.6, px, pz) {
  const { lx, lz } = local(p, x, z, px, pz);
  return Math.abs(lx) <= p.w / 2 + pad && Math.abs(lz) <= p.d / 2 + pad;
}
export const LAVA_HALF = 1.2; // red kill strip across the middle of 'lava' platforms

const TYPES = [
  // [type, first platform where it can appear, base weight]
  ['move', 16, 0.16],
  ['bounce', 12, 0.08],
  ['lava', 22, 0.1],
  ['beam', 28, 0.1],
  ['fade', 36, 0.1],
];

export function makeCourse(seed) {
  const r = rng(`pk:${seed}`);
  const plats = [];
  let yaw = 0;
  plats.push({ i: 0, x: 0, y: 0, z: 0, w: 12, d: 12, ry: 0, type: 'start', cp: true, c: THEMES[0].cols[0], gap: 0, rise: 0 });

  function next() {
    const i = plats.length, prev = plats[i - 1];
    const diff = Math.min(1, i / 160); // difficulty ramps over the first ~16 stages
    const cp = i % CP_EVERY === 0;
    let type = 'static';
    if (!cp && ['static', 'move', 'start'].includes(prev.type)) { // never two tricky platforms in a row
      const roll = r();
      let acc = 0;
      for (const [t, from, weight] of TYPES) {
        if (i < from) continue;
        acc += weight * (0.6 + diff);
        if (roll < acc) { type = t; break; }
      }
    }
    yaw += (r() - 0.5) * (0.5 + diff * 0.5);
    const size = 6.5 - diff * 2.6 + r() * 1.2;
    const w = cp ? 10 : type === 'beam' ? 1.8 : type === 'lava' ? 5 : type === 'bounce' ? 5 : size;
    const d = cp ? 10 : type === 'beam' ? 10 + r() * 4 : type === 'lava' ? 12 : type === 'bounce' ? 5 : size;
    const vy = prev.type === 'bounce' ? BOUNCE : JUMP;
    // always upward, towards the sky (gentle steps early, bigger steps later)
    let rise = prev.type === 'bounce' ? 7 + r() * 4 : 0.3 + r() * (0.7 + 2.1 * diff);
    if (type === 'fade' || type === 'beam') rise = Math.min(rise, 1.5);
    const maxGap = reach(Math.max(0, rise), vy) - 1.8 - (1 - diff) * 1.2; // generous margin, bigger early on
    let gap = prev.type === 'bounce' ? 3 + r() * 2 : 1.6 + diff * 3 + r() * (0.8 + diff * 1.4);
    gap = Math.max(1.2, Math.min(gap, maxGap));
    const dist = prev.d / 2 + gap + d / 2;
    const p = {
      i, type, cp, w, d, ry: yaw, gap, rise,
      x: prev.x + Math.sin(yaw) * dist,
      z: prev.z + Math.cos(yaw) * dist,
      y: prev.y + rise,
      c: cp ? '#ffd23f' : type === 'bounce' ? '#3ecf8e' : type === 'fade' ? '#c7ecee' : themeOf(i).cols[Math.floor(r() * 4)],
    };
    if (type === 'move') Object.assign(p, { amp: 2.2 + diff * 2.3, speed: 1 + diff * 0.9, phase: r() * 6.28 });
    plats.push(p);
  }
  return {
    seed,
    plats,
    // generate on demand: the course is infinite, but the same seed always gives the same platforms
    ensure(n) { while (plats.length < n) next(); return plats; },
  };
}

// Runtime position of a (possibly moving) platform: it slides sideways across the path.
export function platPos(p, t) {
  if (p.type !== 'move') return { x: p.x, z: p.z };
  const o = Math.sin(t * p.speed + p.phase) * p.amp;
  return { x: p.x + Math.cos(p.ry) * o, z: p.z - Math.sin(p.ry) * o };
}
