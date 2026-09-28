import assert from 'node:assert/strict';
import { makeRounds, cleanConfig, eloDeltas, points, fiftyFifty, ALL, tierOf } from '../src/lib/rounds.js';

const genres = ['RPG', 'Simulation', 'Action', 'Survival'];
const pool = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, t: `Game ${i + 1}`, s: `game-${i + 1}`, g: genres[i % 4], i: `icon${i}`, c: `Studio ${i % 6}`, y: 2018 + (i % 6),
  n: 1000 * (i + 1), v: 1e6 * (12 - i), sh: [`a${i}`, `b${i}`], cd: i % 2 ? [{ c: `CODE${i}`, r: 'gems' }] : [], b: i % 3 ? [`Badge ${i}`] : [],
}));

const cfg = cleanConfig({ types: ALL, rounds: 15, time: 20 });
const a = makeRounds(pool, 'seed1', cfg);
assert.deepEqual(a, makeRounds(pool, 'seed1', cfg), 'same seed => same rounds');
assert.notDeepEqual(a, makeRounds(pool, 'seed2', cfg), 'different seed => different rounds');
assert.equal(a.length, 15);
for (const r of a) {
  assert.ok(r.opts.some((o) => o.k === r.a), `answer in options (${r.type})`);
  assert.equal(new Set(r.opts.map((o) => o.k)).size, r.opts.length, 'no duplicate options');
  assert.ok(r.opts.length >= 2);
  assert.ok(!fiftyFifty(r).includes(r.a), '50:50 never hides the answer');
}
assert.ok(new Set(a.map((r) => r.type)).size >= 4, 'mixed config mixes types');
assert.ok(makeRounds(pool, 's', cleanConfig({ types: ['code'], rounds: 5 })).every((r) => r.type === 'code'));

assert.deepEqual(cleanConfig({ types: ['nope', 'shot', 'shot'], rounds: 99, time: 1 }), { types: ['shot'], rounds: 5, time: 20 });
assert.deepEqual(cleanConfig(null ?? undefined).types, ['shot']);

assert.equal(points(0, 0, 20), 5000);
assert.equal(points(3, 0, 20), 1000);
assert.equal(points(0, 20000, 20), 0);

const d = eloDeltas([{ id: 'a', elo: 1000, score: 9000 }, { id: 'b', elo: 1000, score: 3000 }]);
assert.ok(d.a > 0 && d.b < 0 && d.a + d.b === 0, 'winner gains what loser loses');
assert.deepEqual(eloDeltas([{ id: 'a', elo: 1000, score: 9, ip: 'x' }, { id: 'b', elo: 1000, score: 1, ip: 'x' }]), { a: 0, b: 0 }, 'same IP gives no rating');
assert.equal(tierOf(1000).name, 'Bronze');
assert.equal(tierOf(1720).name, 'Legend');

console.log('rounds tests ok');
