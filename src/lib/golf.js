// Golf Climb: a Roblox-style take on "Golfing Over It". 10 surreal mountains made of giant objects (trees, houses,
// horses, eagles, sharks, donuts, icebergs, satellites…) + a deterministic 2D ball simulation.
// Like the original: drag back and release to hit; the ball can be hit again in the air while it is "white"
// (it turns "black" when it touches anything, and white again when it almost stops).
// Shared by the browser, the tests and the Worker: the client sends only its hits ([tick, vx, vy], 1/100 studs/s),
// the server replays them on the same map and only accepts a speedrun time if the replay really sinks the ball.
// The sim uses only + - * / and sqrt (bit-exact in every JS engine), fixed 120 Hz ticks, no trig.
import { rng } from './geo.js';
import { angelChance } from './parkour.js';

export const DT = 1 / 120;
export const R = 0.6; // ball radius (studs)
export const VMAX = 62; // strongest hit
export const AIR_HITS = 2; // extra hits allowed while the ball is still white in the air
export const FALL = 14; // dropping this far below your last resting spot is a "fall" (the angel may come)
export const ANGEL_DELAY = 40; // ticks of slow-motion falling before the angel catches the ball
const MAX_FLIGHT = 120 * 25; // a shot that never settles is stopped after 25 s
const TERMINAL = 100;

// Surfaces: e = bounciness, roll = rolling drag (1/s), stop = constant drag (studs/s²)
export const SURF = {
  rock: { e: 0.35, roll: 1.1, stop: 1.5 },
  grass: { e: 0.28, roll: 1.6, stop: 2 },
  wood: { e: 0.4, roll: 1.2, stop: 1.5 },
  ice: { e: 0.2, roll: 0.08, stop: 0.2 },
  sand: { e: 0.03, roll: 7, stop: 10 },
  soft: { e: 0.1, roll: 4, stop: 6 }, // frosting, clouds, fur
  bounce: { e: 1.08, roll: 1.5, stop: 2 },
  metal: { e: 0.4, roll: 1.2, stop: 1.6 },
  lava: { e: 0, roll: 0, stop: 0 }, // touching it burns: back to your last spot
};

// Each mountain is a pile of giant objects ("props") zig-zagging up into the sky, with no walls: overshoot and the
// ball flies off the side and rolls all the way back down the valley. Difficulty grows map by map.
export const MAPS = [
  { id: 'meadow', v: 13, name: 'Noob Meadow', emoji: '🌱', stops: 8, W: 40, g: 60, diff: 0, props: ['rock', 'tree', 'house', 'tree', 'noob'], sky: ['#6ec6ff', '#e6f7ff'], cols: ['#4caf50', '#7cb342', '#8d6e63'], wall: '#7a6152' },
  { id: 'canyon', v: 4, name: 'Crossroads Canyon', emoji: '🏜️', stops: 10, W: 42, g: 60, diff: 0.12, props: ['mesa', 'cactus', 'house', 'car'], sky: ['#ffb74d', '#fff3e0'], cols: ['#d84315', '#ff8a65', '#ffcc80'], wall: '#a5573a' },
  { id: 'candy', v: 3, name: 'Candy Tower', emoji: '🍭', stops: 12, W: 42, g: 60, diff: 0.22, props: ['donut', 'cupcake', 'lollipop', 'cake'], sky: ['#8e44ad', '#ff9ad5'], cols: ['#ff6bcb', '#5ee7ff', '#fff176'], wall: '#b0527f' },
  { id: 'frozen', v: 1, name: 'Frozen Peak', emoji: '❄️', stops: 13, W: 44, g: 60, diff: 0.3, props: ['iceberg', 'snowman', 'igloo', 'pine'], sky: ['#8fd0ff', '#f2fbff'], cols: ['#e3f2fd', '#81d4fa', '#b39ddb'], wall: '#9fb6c8' },
  { id: 'factory', v: 43, name: 'Bounce Factory', emoji: '🏭', stops: 14, W: 44, g: 60, diff: 0.4, props: ['crate', 'gear', 'pipe', 'spring'], sky: ['#455a64', '#b0bec5'], cols: ['#ffca28', '#90a4ae', '#ef5350'], wall: '#4f5b62' },
  { id: 'jungle', v: 17, name: 'Animal Jungle', emoji: '🐘', stops: 15, W: 46, g: 60, diff: 0.5, props: ['horse', 'eagle', 'elephant', 'tree', 'horse'], sky: ['#56c27a', '#e2ffd8'], cols: ['#2e7d32', '#827717', '#c68642'], wall: '#5d4c3a' },
  { id: 'pirate', v: 0, name: 'Pirate Cove', emoji: '🦈', stops: 16, W: 46, g: 60, diff: 0.58, props: ['ship', 'shark', 'turtle', 'barrel'], sky: ['#1e88e5', '#bbdefb'], cols: ['#8d6e63', '#a1887f', '#ffd54f'], wall: '#5d4037' },
  { id: 'volcano', v: 89, name: 'Lava Volcano', emoji: '🌋', stops: 17, W: 46, g: 60, diff: 0.68, props: ['basalt', 'skull', 'basalt', 'rock'], lava: 0.4, sky: ['#3e0d0d', '#ff7043'], cols: ['#4e342e', '#212121', '#ff7043'], wall: '#2b1d1a' },
  { id: 'sky', v: 23, name: 'Sky Islands', emoji: '☁️', stops: 18, W: 48, g: 60, diff: 0.8, props: ['cloud', 'balloon', 'island', 'eagle'], sky: ['#29a3e8', '#bfe6ff'], cols: ['#66bb6a', '#ffffff', '#4dd0e1'], wall: '#5f88a6' },
  { id: 'space', v: 14, name: 'Galaxy Summit', emoji: '🚀', stops: 22, W: 48, g: 40, diff: 0.95, props: ['asteroid', 'ufo', 'satellite', 'asteroid'], lava: 0.15, sky: ['#05030f', '#2b1a5e'], cols: ['#b2ff59', '#00e5ff', '#ff2e97'], wall: '#311b92' },
];

const q6 = (v) => Math.round(v * 1e6) / 1e6; // map geometry snapped, so every engine builds the same numbers

// A part is a thick segment (a Roblox block seen from the side): centre line a->b, thickness t, depth z (visual).
function part(x1, y1, x2, y2, t, k, c, z = 8) {
  [x1, y1, x2, y2] = [x1, y1, x2, y2].map(q6);
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len, uy = dy / len, hl = len / 2, ht = t / 2;
  const ex = Math.abs(ux) * hl + Math.abs(uy) * ht, ey = Math.abs(uy) * hl + Math.abs(ux) * ht;
  return { x1, y1, x2, y2, t, k, c, z, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, ux, uy, hl, ht, minX: (x1 + x2) / 2 - ex, maxX: (x1 + x2) / 2 + ex, minY: (y1 + y2) / 2 - ey, maxY: (y1 + y2) / 2 + ey };
}

// ---------- the giant objects ----------
// Each prop puts its resting surface (the "stop") centred at (x, y), L wide; `o` = the side away from the previous
// prop (+1 right, -1 left), where tall parts act as a backstop. Returns the stop; decorations are drawn by the client.
const PROPS = {
  rock: (A, x, y, L) => { A.box(x, y - 1.6, L, 3.2, 'rock', '#8d8d8d', 8); A.box(x, y - 4.4, L * 0.7, 2.4, 'rock', '#757575', 7); },
  mesa: (A, x, y, L) => { A.box(x, y - 1.5, L, 3, 'rock', '#c4613a', 8); A.box(x, y - 4.5, L * 0.85, 3, 'rock', '#b5502d', 8); A.box(x, y - 7.2, L * 0.65, 2.4, 'rock', '#d4774a', 7); },
  tree: (A, x, y, L, o) => { A.box(x, y - 1.1, L, 2.2, 'grass', '#3fae4a', 7); A.vbox(x, y - 7.2, 1.6, 10, 'wood', '#7a4a26', 2); A.seg(x, y - 5.5, x - o * 3.2, y - 3.4, 0.8, 'wood', '#7a4a26', 2); },
  pine: (A, x, y, L) => { A.box(x, y - 1, L, 2, 'grass', '#1f6f43', 7); A.box(x, y - 3.2, L + 2, 2.4, 'grass', '#1f6f43', 8); A.vbox(x, y - 7.5, 1.4, 6, 'wood', '#5d4037', 2); },
  house: (A, x, y, L, o) => { A.box(x, y - 3, L, 6, 'wood', '#c0392b', 7); A.box(x, y - 0.35, L + 1, 0.7, 'rock', '#5d4037', 8); A.vbox(x + o * (L / 2 - 0.8), y + 1.2, 1.2, 2.4, 'rock', '#795548', 2); },
  noob: (A, x, y) => { A.box(x, y - 0.9, 3.2, 1.8, 'soft', '#f5cd30', 3.2); A.box(x, y - 3.9, 4.6, 4.2, 'wood', '#2f6fd6', 3); A.vbox(x - 3.2, y - 3.9, 1.6, 4.2, 'wood', '#f5cd30', 3); A.vbox(x + 3.2, y - 3.9, 1.6, 4.2, 'wood', '#f5cd30', 3); A.vbox(x - 1.1, y - 8.1, 2, 4.2, 'wood', '#3cb043', 3); A.vbox(x + 1.1, y - 8.1, 2, 4.2, 'wood', '#3cb043', 3); return 3.2; },
  cactus: (A, x, y, L, o) => { A.box(x, y - 0.8, L, 1.6, 'soft', '#2e8b57', 3); A.vbox(x, y - 6, 2, 9, 'soft', '#2e8b57', 2.4); A.seg(x + o * 1, y - 4, x + o * 3, y - 4, 1.2, 'soft', '#2e8b57', 2); A.vbox(x + o * 3, y - 2.8, 1.2, 2.4, 'soft', '#2e8b57', 2); },
  car: (A, x, y, L, o) => { A.box(x, y - 0.6, L, 1.2, 'metal', '#e53935', 6); A.box(x - o * 0.6, y - 2.6, L + 4, 2.8, 'metal', '#c62828', 6); A.box(x + o * (L / 2 + 1.4), y - 0.9, 1.4, 0.6, 'metal', '#90caf9', 5); },
  donut: (A, x, y, L) => { A.box(x, y - 0.7, L, 1.4, 'soft', '#d9a066', 6); A.vbox(x - L / 2 - 0.6, y + 0.1, 1.2, 3, 'soft', '#ff7eb6', 6); A.vbox(x + L / 2 + 0.6, y + 0.1, 1.2, 3, 'soft', '#ff7eb6', 6); },
  cupcake: (A, x, y, L) => { A.box(x, y - 0.9, L, 1.8, 'soft', '#fff0f6', 7); A.box(x, y - 3.4, L * 0.8, 3.2, 'wood', '#ff8fb8', 6); },
  lollipop: (A, x, y, L) => { A.box(x, y - 0.5, L, 1, 'wood', '#5ee7ff', 1.2); A.vbox(x, y - 6, 0.5, 10, 'wood', '#ffffff', 0.5); },
  cake: (A, x, y, L) => { A.box(x, y - 1, L, 2, 'soft', '#fff8e1', 7); A.box(x, y - 3.2, L + 2, 2.4, 'soft', '#8d5524', 8); A.box(x, y - 5.6, L + 4, 2.4, 'soft', '#ff8fb8', 9); },
  iceberg: (A, x, y, L, o) => { A.box(x, y - 1.6, L, 3.2, 'ice', '#bfefff', 7); A.seg(x + o * (L / 2), y - 1, x + o * (L / 2 + 1.4), y + 2.2, 1, 'ice', '#e1f5fe', 5); A.box(x, y - 4.6, L * 0.6, 2.8, 'ice', '#81d4fa', 6); },
  snowman: (A, x, y, L) => { A.box(x, y - 1.2, L, 2.4, 'soft', '#fafafa', 5); A.box(x, y - 4, L + 1.4, 3.2, 'soft', '#f5f5f5', 6); A.vbox(x, y + 1.4, 1.4, 2.8, 'soft', '#fafafa', 2.6); return L; },
  igloo: (A, x, y, L) => { A.box(x, y - 0.6, L, 1.2, 'ice', '#e3f2fd', 7); A.seg(x - L / 2, y - 1, x - L / 2 - 2, y - 3.6, 1.2, 'ice', '#e3f2fd', 7); A.seg(x + L / 2, y - 1, x + L / 2 + 2, y - 3.6, 1.2, 'ice', '#e3f2fd', 7); },
  crate: (A, x, y, L, o) => { A.box(x, y - 1.2, L, 2.4, 'wood', '#a0703c', 6); A.box(x - o * 0.8, y - 3.6, L, 2.4, 'wood', '#8d5a2b', 6); },
  gear: (A, x, y, L) => { A.box(x, y - 0.6, L, 1.2, 'metal', '#9e9e9e', 2); A.vbox(x, y - 5.5, 1.4, 9, 'metal', '#616161', 1.4); },
  pipe: (A, x, y, L, o) => { A.box(x, y - 0.9, L, 1.8, 'metal', '#78909c', 2.4); A.vbox(x - o * (L / 2 - 0.9), y - 6, 1.8, 8.4, 'metal', '#78909c', 2.4); },
  spring: (A, x, y, L) => { A.box(x, y - 0.5, L, 1, 'soft', '#3ecf8e', 5); A.box(x, y - 3.5, L * 0.7, 2, 'metal', '#546e7a', 5); },
  horse: (A, x, y, L, o) => { A.box(x, y - 1.3, L, 2.6, 'soft', '#8d5a2b', 3); A.seg(x + o * (L / 2 - 0.4), y - 0.6, x + o * (L / 2 + 1.4), y + 3.2, 1.4, 'soft', '#8d5a2b', 2.4); A.box(x + o * (L / 2 + 2.1), y + 3.4, 2.6, 1.4, 'soft', '#7a4a26', 2.4); for (const lx of [-L / 2 + 0.7, L / 2 - 0.7]) A.vbox(x + lx, y - 5, 0.9, 5, 'wood', '#6d4c41', 2.6); A.seg(x - o * (L / 2), y - 0.8, x - o * (L / 2 + 1.5), y - 3.2, 0.6, 'soft', '#3e2723', 0.8); },
  eagle: (A, x, y, L) => { A.box(x, y - 0.8, 2.6, 1.6, 'soft', '#6d4c41', 2.4); A.seg(x - 1.3, y - 0.2, x - 1.3 - L / 2, y + 1.6, 0.6, 'soft', '#5d4037', 4); A.seg(x + 1.3, y - 0.2, x + 1.3 + L / 2, y + 1.6, 0.6, 'soft', '#5d4037', 4); return 2.6; },
  elephant: (A, x, y, L, o) => { A.box(x, y - 2.5, L, 5, 'soft', '#9e9e9e', 6); A.box(x + o * (L / 2 + 1.3), y - 1, 2.8, 3.6, 'soft', '#8e8e8e', 4); A.seg(x + o * (L / 2 + 2.4), y - 2.4, x + o * (L / 2 + 3.2), y - 6, 0.9, 'soft', '#8e8e8e', 1); for (const lx of [-L / 2 + 1, L / 2 - 1]) A.vbox(x + lx, y - 7.5, 1.8, 5, 'soft', '#8e8e8e', 3); },
  ship: (A, x, y, L, o) => { A.box(x, y - 0.6, L, 1.2, 'wood', '#8d6e63', 7); A.box(x, y - 3, L - 1, 3.6, 'wood', '#6d4c41', 7); A.vbox(x + o * (L / 2 - 1), y + 4, 0.6, 8, 'wood', '#5d4037', 0.6); },
  shark: (A, x, y, L, o) => { A.box(x, y - 1.1, L, 2.2, 'metal', '#78909c', 3); A.seg(x + o * (L / 2 - 1.2), y, x + o * (L / 2 - 0.2), y + 2.2, 0.7, 'metal', '#607d8b', 0.6); A.seg(x - o * (L / 2), y - 1, x - o * (L / 2 + 2), y + 0.8, 0.7, 'metal', '#607d8b', 0.6); },
  turtle: (A, x, y, L) => { A.box(x, y - 0.7, L, 1.4, 'rock', '#388e3c', 5); A.seg(x - L / 2, y - 1.2, x - L / 2 - 1.6, y - 2.8, 1.2, 'rock', '#2e7d32', 5); A.seg(x + L / 2, y - 1.2, x + L / 2 + 1.6, y - 2.8, 1.2, 'rock', '#2e7d32', 5); A.box(x, y - 3.2, L + 3, 1.2, 'soft', '#a5d6a7', 4); },
  barrel: (A, x, y) => { A.box(x, y - 1.6, 3.8, 3.2, 'wood', '#8d5a2b', 3.8); return 3.8; },
  basalt: (A, x, y, L, o) => { A.box(x, y - 1.6, L, 3.2, 'rock', '#2b2b30', 8); A.seg(x + o * (L / 2), y - 0.6, x + o * (L / 2 + 0.8), y + 2.6, 1, 'rock', '#1c1a22', 3); },
  skull: (A, x, y, L) => { A.box(x, y - 1.4, L, 2.8, 'rock', '#e0dccb', 6); A.box(x, y - 3.6, L * 0.7, 1.6, 'rock', '#cfc9b5', 5); },
  cloud: (A, x, y, L) => { A.box(x, y - 0.9, L, 1.8, 'soft', '#ffffff', 6); A.box(x, y - 2.2, L * 0.7, 1.2, 'soft', '#eceff1', 6); },
  balloon: (A, x, y, L) => { A.box(x, y - 1, L, 2, 'wood', '#8d6e63', 3); A.box(x, y + 6.5, 5.5, 5, 'bounce', '#ff4d6d', 5); },
  island: (A, x, y, L) => { A.box(x, y - 0.7, L, 1.4, 'grass', '#4caf50', 7); A.seg(x - L / 2, y - 1.4, x, y - 6, 1.6, 'rock', '#795548', 6); A.seg(x + L / 2, y - 1.4, x, y - 6, 1.6, 'rock', '#795548', 6); },
  asteroid: (A, x, y, L, o) => { A.box(x, y - 1.4, L, 2.8, 'rock', '#6d6875', 6); A.seg(x - o * (L / 2), y - 2.8, x - o * (L / 2 - 1), y - 5, 1.6, 'rock', '#5c5664', 5); },
  satellite: (A, x, y, L) => { A.box(x, y - 0.9, 4, 1.8, 'metal', '#cfd8dc', 3); A.seg(x - 2, y - 0.9, x - 2 - L / 2, y - 0.9, 0.3, 'metal', '#1a237e', 4); A.seg(x + 2, y - 0.9, x + 2 + L / 2, y - 0.9, 0.3, 'metal', '#1a237e', 4); return 4; },
  ufo: (A, x, y, L) => { A.box(x, y - 0.6, L, 1.2, 'metal', '#b0bec5', 7); A.vbox(x - L / 2 - 0.4, y + 0.3, 0.8, 1.8, 'metal', '#80deea', 7); A.vbox(x + L / 2 + 0.4, y + 0.3, 0.8, 1.8, 'metal', '#80deea', 7); A.box(x, y - 2, L * 0.6, 1.6, 'metal', '#78909c', 5); },
  rocket: (A, x, y) => { A.box(x, y - 0.6, 4, 1.2, 'metal', '#e53935', 4); A.vbox(x, y - 5, 2.8, 7.6, 'metal', '#eceff1', 2.8); return 4; },
};
export const PROP_KINDS = Object.keys(PROPS);

const cache = new Map();
export function getMap(i) {
  if (!MAPS[i]) return null;
  const key = `${i}:${MAPS[i].v ?? 0}`;
  if (!cache.has(key)) cache.set(key, buildMap(i));
  return cache.get(key);
}

function buildMap(mi) {
  const m = MAPS[mi], r = rng(`golf:${m.id}:${m.v ?? 0}`), W = m.W;
  const parts = [], stops = [], props = [];
  const add = (...a) => { const p = part(...a); parts.push(p); return p; };
  // props never dig into the valley floor: anything below y = 0 is cut off
  const A = {
    box: (cx, cy, w, h, k, c, z) => { const top = cy + h / 2, bot = Math.max(0, cy - h / 2); if (top - bot > 0.3) add(cx - w / 2, (top + bot) / 2, cx + w / 2, (top + bot) / 2, top - bot, k, c, z); },
    vbox: (cx, cy, w, h, k, c, z) => { const top = cy + h / 2, bot = Math.max(0, cy - h / 2); if (top - bot > 0.3) add(cx, bot, cx, top, w, k, c, z); },
    seg: (x1, y1, x2, y2, t, k, c, z) => add(x1, y1, x2, y2, t, k, c, z),
  };
  // the valley: a flat floor between two slopes, so a ball that flies off the mountain rolls back to the start
  add(-30, -20, W + 30, -20, 40, 'grass', m.wall, 60);
  add(-30, -1, -95, 34, 3, 'rock', m.wall, 60);
  add(W + 30, -1, W + 95, 34, 3, 'rock', m.wall, 60);
  stops.push({ x0: -30, x1: W + 30, y: 0, tilt: 0, x: W / 2 - 8 });
  let y = 0, side = 1, last = '';
  for (let i = 1; i <= m.stops; i++) {
    const d = Math.min(1, m.diff + (i / m.stops) * 0.25);
    const top = i === m.stops;
    y += i === 1 ? 5 : 5 + r() * (2 + 4 * d);
    const o = side ? 1 : -1;
    let L = top ? 14 : i === 1 ? 10 : 9.5 - 4.5 * d + r() * 2.5;
    let x = top ? W / 2 : i === 1 ? W / 2 + 6 : side ? W - 3 - L / 2 - r() * 6 : 3 + L / 2 + r() * 6;
    let kind = 'summit';
    if (top) {
      A.box(x, y - 1.5, L, 3, 'grass', '#4caf50', 10);
      A.vbox(x + o * (L / 2 + 0.5), y + 1, 1, 2, 'rock', '#9e9e9e', 10);
      A.vbox(x - o * (L / 2 + 0.5), y + 1, 1, 2, 'rock', '#9e9e9e', 10);
    } else {
      do kind = m.props[Math.floor(r() * m.props.length)]; while (kind === last && m.props.length > 1);
      last = kind;
      L = PROPS[kind](A, x, y, L, o, r) ?? L;
      // lava hanging below the near edge: fall short and you burn (back to your last spot)
      if (i > 2 && r() < (m.lava ?? 0)) A.vbox(x - o * (L / 2 + 0.6), y - 3.2, 1.2, 2.6, 'lava', '#ff3d00', 4);
    }
    stops.push({ x0: x - L / 2, x1: x + L / 2, y, tilt: 0, x, k: kind });
    props.push({ kind, x, y, L, o, i });
    side = 1 - side;
  }
  const summit = stops[stops.length - 1];
  // start on a clear patch of the valley floor
  let sx = W / 2 - 8;
  while (parts.some((p) => p.minY < 16 && p.maxY > 0.1 && p.minX < sx + 2 && p.maxX > sx - 2)) sx -= 2; // open sky above it
  stops[0].x = sx;
  const H = summit.y + 40;
  // spatial grid for the broadphase
  const grid = new Map();
  parts.forEach((p, idx) => {
    for (let gx = Math.floor((p.minX - R) / 8); gx <= Math.floor((p.maxX + R) / 8); gx++)
      for (let gy = Math.floor((p.minY - R) / 8); gy <= Math.floor((p.maxY + R) / 8); gy++) {
        const key = gx * 4096 + gy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(idx);
      }
  });
  return { ...m, index: mi, parts, stops, props, cup: { x: q6(summit.x), y: summit.y }, H, grid, start: { x: sx, y: R } };
}

// ---------- the ball ----------
export function makeSim(mi, nonce = '') {
  const map = getMap(mi), g = map.g;
  const s = {
    map, x: map.start.x, y: map.start.y, vx: 0, vy: 0, rest: true, done: false, tick: 0, shot: 0, flight: 0, slow: 0,
    restX: map.start.x, restY: map.start.y, bestY: map.start.y, falls: 0, fell: false, angelAt: -1, angels: 0, burns: 0, impact: 0,
    white: true, airHits: 0, // white = can be hit; black after touching anything until it (almost) stops
  };
  const near = () => map.grid.get(Math.floor(s.x / 8) * 4096 + Math.floor(s.y / 8)) ?? [];
  function backToRest() { Object.assign(s, { x: s.restX, y: s.restY, vx: 0, vy: 0, rest: true, angelAt: -1, slow: 0, white: true }); }

  // a hit: from rest, or again in the air while the ball is still white (up to AIR_HITS times per flight)
  s.canHit = () => !s.done && s.angelAt < 0 && s.white && (s.rest || s.airHits < AIR_HITS);
  s.shoot = (vx, vy) => {
    if (!s.canHit()) return false;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (!(sp > 0) || sp > VMAX + 0.02) return false;
    s.airHits = s.rest ? 0 : s.airHits + 1;
    Object.assign(s, { vx, vy, rest: false, flight: 0, slow: 0, fell: false, angelAt: -1, white: true });
    s.shot++;
    return true;
  };

  // One 1/120 s tick. Returns an event: 'rest' | 'fall' | 'angel' | 'burn' | 'hole' | null (s.impact = hit strength)
  s.step = () => {
    s.impact = 0;
    if (s.rest || s.done) return null;
    s.tick++; s.flight++;
    if (s.angelAt > 0 && s.tick >= s.angelAt) { backToRest(); s.angels++; return 'angel'; }
    s.vy -= g * DT;
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (sp > TERMINAL) { s.vx *= TERMINAL / sp; s.vy *= TERMINAL / sp; }
    s.x += s.vx * DT; s.y += s.vy * DT;
    let contact = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const idx of near()) {
        const p = map.parts[idx];
        if (s.x < p.minX - R || s.x > p.maxX + R || s.y < p.minY - R || s.y > p.maxY + R) continue;
        const dx = s.x - p.cx, dy = s.y - p.cy;
        const lx = dx * p.ux + dy * p.uy, ly = -dx * p.uy + dy * p.ux;
        let nlx, nly, pen;
        if (Math.abs(lx) <= p.hl && Math.abs(ly) <= p.ht) { // centre inside the block: push out the short way
          const ox = p.hl - Math.abs(lx), oy = p.ht - Math.abs(ly);
          if (ox < oy) { nlx = lx < 0 ? -1 : 1; nly = 0; pen = ox + R; } else { nlx = 0; nly = ly < 0 ? -1 : 1; pen = oy + R; }
        } else {
          const ex = lx - Math.max(-p.hl, Math.min(p.hl, lx)), ey = ly - Math.max(-p.ht, Math.min(p.ht, ly));
          const d2 = ex * ex + ey * ey;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2);
          nlx = ex / d; nly = ey / d; pen = R - d;
        }
        if (p.k === 'lava') { s.burns++; backToRest(); return 'burn'; }
        const nx = nlx * p.ux - nly * p.uy, ny = nlx * p.uy + nly * p.ux;
        s.x += nx * pen; s.y += ny * pen;
        contact = true;
        s.white = false;
        const vn = s.vx * nx + s.vy * ny;
        if (vn < 0) {
          const S = SURF[p.k] ?? SURF.rock;
          const e = vn < -5 ? S.e : 0; // no micro-bounces: a rolling ball sticks to the ground
          let tx = s.vx - vn * nx, ty = s.vy - vn * ny;
          const ts = Math.sqrt(tx * tx + ty * ty);
          if (ts > 0) {
            const k = Math.max(0, ts - (ts * S.roll + S.stop) * DT) / ts;
            tx *= k; ty *= k;
          }
          s.vx = tx - e * vn * nx; s.vy = ty - e * vn * ny;
          if (p.k === 'bounce' && vn < -5) { s.vx += nx * 6; s.vy += ny * 6; }
          s.impact = Math.max(s.impact, -vn);
        }
      }
    }
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    // sunk it?
    if (Math.abs(s.x - map.cup.x) < 1 && s.y > map.cup.y && s.y < map.cup.y + R + 0.7 && speed < 30) {
      Object.assign(s, { done: true, rest: true, vx: 0, vy: 0, x: map.cup.x, y: map.cup.y });
      return 'hole';
    }
    s.slow = contact && speed < 1.2 ? s.slow + 1 : 0;
    if (s.slow > 24 || s.flight > MAX_FLIGHT) {
      Object.assign(s, { vx: 0, vy: 0, rest: true, restX: s.x, restY: s.y, angelAt: -1, white: true });
      if (s.y > s.bestY + 1) { s.bestY = s.y; s.falls = 0; }
      return 'rest';
    }
    if (!s.fell && s.angelAt < 0 && s.vy < 0 && s.y < s.restY - FALL) {
      s.fell = true;
      s.falls++;
      // the guardian angel: pure luck (seeded by the run, so the server sees the same luck), luckier each fall
      if (rng(`${nonce}:${s.shot}`)() < angelChance(s.falls)) s.angelAt = s.tick + ANGEL_DELAY;
      return 'fall';
    }
    return null;
  };
  return s;
}

// Server check: replay the hits ([tick, vx, vy]); returns { ticks, shots } only if the last hit sinks the ball.
export function verifyRun(mi, nonce, shots) {
  if (!getMap(mi) || !Array.isArray(shots) || !shots.length || shots.length > 3000) return null;
  const s = makeSim(mi, nonce);
  for (const shot of shots) {
    const [t, a, b] = Array.isArray(shot) ? shot : [];
    if (![t, a, b].every(Number.isInteger)) return null;
    while (!s.rest && !s.done && s.tick < t) s.step();
    if (s.done || s.tick !== t || !s.shoot(a / 100, b / 100)) return null;
  }
  while (!s.rest) s.step();
  return s.done ? { ticks: s.tick, shots: shots.length } : null;
}
// A shot from an aim vector (any length), quantized the way the replay stores it.
export function shotFrom(dx, dy, power01) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1, p = Math.max(0, Math.min(1, power01)) * VMAX;
  let a = Math.round((dx / len) * p * 100), b = Math.round((dy / len) * p * 100);
  while (a * a + b * b > (VMAX * 100) ** 2) { a -= Math.sign(a); b -= Math.sign(b); }
  return [a, b];
}
