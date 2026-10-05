import assert from 'node:assert/strict';
import { MAPS, getMap, makeSim, verifyRun, shotFrom, R } from '../src/lib/golf.js';

// From a resting spot, search shots (angle x power) and return the first one that ends on a higher stop.
function solve(mi, from, k) {
  const map = getMap(mi), next = map.stops[k + 1], last = k + 1 === map.stops.length - 1;
  for (let p = 0.3; p <= 1.001; p += 0.035)
    for (let a = 15; a <= 165; a += 3) {
      const s = makeSim(mi, 'solver');
      Object.assign(s, { x: from.x, y: from.y, restX: from.x, restY: from.y, bestY: from.y });
      const rad = (a * Math.PI) / 180;
      const [vx, vy] = shotFrom(Math.cos(rad), Math.sin(rad), p);
      s.shoot(vx / 100, vy / 100);
      while (!s.rest) s.step();
      if (last ? s.done : s.y >= next.y - 0.2 && s.y <= next.y + next.tilt + R + 0.5 && s.x >= next.x0 - 1 && s.x <= next.x1 + 1)
        return { shot: [vx, vy], x: s.x, y: s.y };
    }
  return null;
}

const t0 = Date.now();
for (let mi = 0; mi < MAPS.length; mi++) {
  const map = getMap(mi);
  assert.equal(map.stops.length, MAPS[mi].stops + 1);
  assert.ok(map.parts.every((p) => [p.cx, p.cy, p.ux, p.uy, p.hl].every(Number.isFinite)), 'finite geometry');
  // walk the whole climb with solver shots; every ledge must be reachable from where the ball really rests
  const shots = [];
  let at = { x: map.start.x, y: map.start.y };
  for (let k = 0; k < map.stops.length - 1; k++) {
    const st = map.stops[k];
    const tries = [at, { x: st.x, y: st.y + R }];
    let hit = null;
    for (const from of tries) if ((hit = solve(mi, from, k))) break;
    assert.ok(hit, `${map.name}: stop ${k + 1} reachable from stop ${k} (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
    if (tries[0] === at && hit) shots.push(hit.shot);
    at = { x: hit.x, y: hit.y };
  }
  console.log(`  ${map.emoji} ${map.name}: ${map.stops.length - 1} ledges, ${Math.round(map.cup.y)} studs tall, ${map.parts.length} parts`);
}
console.log(`  solver ${(Date.now() - t0) / 1000}s`);

// determinism + replay check: a full replayed run sinks the ball, a tampered one doesn't
{
  // play whole climbs with solver shots until one map is cleared from real landing spots only
  let mi = -1, shots = [], s;
  for (let m = 0; m < MAPS.length && mi < 0; m++) {
    const map = getMap(m);
    shots = []; s = makeSim(m, 'abc');
    for (let k = 0; k < map.stops.length - 1 && !s.done; k++) {
      const hit = solve(m, { x: s.x, y: s.y }, k);
      if (!hit) break;
      shots.push([s.tick, ...hit.shot]);
      s.shoot(hit.shot[0] / 100, hit.shot[1] / 100);
      while (!s.rest) s.step();
    }
    if (s.done) mi = m;
  }
  assert.ok(mi >= 0, 'the solver sinks the ball on at least one full map');
  const v = verifyRun(mi, 'abc', shots);
  assert.ok(v && v.shots === shots.length && v.ticks === s.tick, 'server replay matches');
  assert.equal(verifyRun(mi, 'abc', shots.slice(0, -1)), null, 'unfinished run rejected');
  assert.equal(verifyRun(mi, 'abc', [...shots, [s.tick, 100, 100]]), null, 'shots after the hole rejected');
  assert.equal(verifyRun(mi, 'abc', [[0, 999999, 0]]), null, 'too strong rejected');
  assert.equal(verifyRun(mi, 'abc', [[0, 1.5, 2]]), null, 'non-integer rejected');
  assert.equal(verifyRun(mi, 'abc', [[5, ...shots[0].slice(1)]]), null, 'a hit at a moment the ball could not be hit is rejected');
}
// the angel: a long fall eventually summons it (seeded luck), and it puts the ball back where it rested
{
  const map = getMap(0), top = map.stops[6];
  let falls = 0, angels = 0;
  for (let n = 0; n < 60; n++) {
    const s = makeSim(0, `n${n}`);
    Object.assign(s, { x: top.x, y: top.y + R, restX: top.x, restY: top.y + R, bestY: top.y + R });
    s.shoot(top.x > map.W / 2 ? -30 : 30, 8); // off the edge, down the middle
    let ev, fell = false, angel = false;
    while (!s.rest) { ev = s.step(); if (ev === 'fall') fell = true; if (ev === 'angel') angel = true; }
    falls += fell; angels += angel;
    if (angel) assert.ok(Math.abs(s.x - top.x) < 1e-9 && s.angels === 1, 'angel returns the ball');
  }
  assert.equal(falls, 60, 'dropping down the middle is a fall');
  assert.ok(angels > 0 && angels < 20, `the angel shows up sometimes (${angels}/60)`);
}
// like the original: hit again in the air while the ball is white; black after touching anything
{
  const s = makeSim(0, 'air');
  assert.ok(s.canHit() && s.shoot(-14, 30)); // up and away from the mountain
  while (s.vy > 0) s.step();
  assert.ok(s.canHit(), 'white at the top of the flight');
  assert.ok(s.shoot(-6, 25), 'air hit 1');
  while (s.vy > 0) s.step();
  assert.ok(s.shoot(-6, 20), 'air hit 2');
  while (s.vy > 0) s.step();
  assert.ok(!s.canHit(), 'only two air hits per flight');
  while (s.white && !s.rest) s.step();
  assert.ok(!s.canHit() || s.rest, 'black after touching the ground');
  while (!s.rest) s.step();
  assert.ok(s.canHit(), 'white again once it stops');
}
console.log('golf tests ok');
