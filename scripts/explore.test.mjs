import assert from 'node:assert/strict';
import { rng, haversine, realScore, bloxScore, shuffle } from '../src/lib/geo.js';
import { makeWorld, groundAt, blocked, ZONES, HALF, toMap, fromMap } from '../src/lib/world.js';

// rng: deterministic, in [0,1)
const a = rng('x'), b = rng('x'), c = rng('y');
const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b);
assert.deepEqual(sa, sb);
assert.notDeepEqual(sa, Array.from({ length: 5 }, c));
assert.ok(sa.every((v) => v >= 0 && v < 1));
assert.deepEqual(shuffle(rng('s'), [1, 2, 3, 4]).sort(), [1, 2, 3, 4]);

// geo
const parisLondon = haversine(48.8566, 2.3522, 51.5074, -0.1278);
assert.ok(parisLondon > 335 && parisLondon < 350, `Paris-London ${parisLondon}`);
assert.equal(realScore(0), 5000);
assert.ok(realScore(10) > realScore(500) && realScore(500) > realScore(5000) && realScore(20000) >= 0);
assert.equal(bloxScore(0), 5000);
assert.ok(bloxScore(20) > bloxScore(100) && bloxScore(100) > bloxScore(300));

// worlds
const w1 = makeWorld('seed-1'), w1b = makeWorld('seed-1'), w2 = makeWorld('seed-2');
assert.deepEqual(w1.parts, w1b.parts, 'same seed => identical world');
assert.notDeepEqual(w1.zones.map((z) => z.type), w2.zones.map((z) => z.type), 'different seed => different layout');
for (const seed of ['a', 'b', 'c', 'daily-20723', 'zzz']) {
  const w = makeWorld(seed);
  assert.equal(w.zones.length, 9);
  assert.equal(new Set(w.zones.map((z) => z.type)).size, 9, 'no repeated zones');
  assert.ok(w.zones.every((z) => z.type in ZONES));
  assert.ok(w.spawns.length >= 7, `enough spawns (${w.spawns.length})`);
  for (const s of w.spawns) {
    assert.ok(!blocked(w.index, s.x, s.z, 0), 'spawn not inside a wall');
    assert.equal(groundAt(w.index, s.x, s.z, 0), 0, 'spawn on the ground');
  }
  assert.ok(new Set(w.landmarks.map((l) => l.zone)).size === 9, 'every zone has a landmark for the map');
  assert.ok(w.parts.every((p) => [p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite)), 'finite geometry');
}

// physics: you can stand on top of the obby tower, walls block, the world has an edge
const w = makeWorld('physics');
const obby = w.zones.find((z) => z.type === 'obby') ?? makeWorld('obby-probe').zones.find((z) => z.type === 'obby');
if (obby && w.zones.includes(obby)) assert.equal(groundAt(w.index, obby.cx, obby.cz, 64.5), 65, 'stand on the obby top');
assert.ok(blocked(w.index, HALF + 100, 0, 0), 'edge of the world');

// map projection round-trips
const m = toMap(12.5, -40);
const back = fromMap(m.u, m.v);
assert.ok(Math.abs(back.x - 12.5) < 1e-9 && Math.abs(back.z + 40) < 1e-9);

console.log('explore tests ok');

// parkour: deterministic, infinite, every jump inside the Roblox jump envelope
{
  const { makeCourse, reach, onTop, platPos, JUMP, BOUNCE, CP_EVERY, weekOf, angelChance } = await import('../src/lib/parkour.js');
  const a = makeCourse('w1').ensure(600), b = makeCourse('w1').ensure(600);
  assert.deepEqual(a, b, 'same seed => same course');
  assert.notDeepEqual(makeCourse('w2').ensure(50), a.slice(0, 50));
  for (let i = 1; i < a.length; i++) {
    const p = a[i], q = a[i - 1];
    const vy = q.type === 'bounce' ? BOUNCE : JUMP;
    assert.ok(p.gap <= reach(Math.max(0, p.rise), vy) - 1.5, `jump ${i} is possible (${p.gap.toFixed(2)} gap, ${p.rise.toFixed(2)} rise)`);
    assert.equal(p.cp, i % CP_EVERY === 0);
    assert.ok(!(p.type !== 'static' && p.type !== 'move' && q.type !== 'static' && q.type !== 'move' && q.type !== 'start' && !p.cp && !q.cp), `no two tricky platforms in a row (${i})`);
    assert.ok(onTop(p, p.x, p.z, 0), 'center is on top');
  }
  assert.ok(new Set(a.map((p) => p.type)).size >= 6, 'all platform types show up');
  assert.ok(a.every((p, i) => !i || p.y > a[i - 1].y), 'the course always climbs towards the sky');
  assert.equal(angelChance(1), 0.1); assert.ok(angelChance(3) > angelChance(2) && angelChance(99) === 0.5, 'angel luck grows, capped');
  const mv = a.find((p) => p.type === 'move');
  const at = platPos(mv, 1.3);
  assert.ok(Math.abs(Math.hypot(at.x - mv.x, at.z - mv.z)) <= mv.amp + 1e-9, 'moving platforms stay in range');
  assert.equal(weekOf(Date.UTC(2026, 8, 28)), weekOf(Date.UTC(2026, 9, 4, 23)), 'Mon..Sun is one week');
  assert.notEqual(weekOf(Date.UTC(2026, 8, 27)), weekOf(Date.UTC(2026, 8, 28)), 'new week on Monday');
  console.log('parkour tests ok');
}
