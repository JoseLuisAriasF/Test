import assert from 'node:assert/strict';
import { CHARS, CHAR_IDS, MAPS, KEY, STAT_SUM, MP_MAX, newFighter, step, cpuInput, localHits, damage, applyHit, gainMp, landedHit, veilMul, reach, snap, unsnap, hitsOf, isInv } from '../src/lib/chase.js';

const map = MAPS[0];
const run = (f, bits, n) => { for (let i = 0; i < n; i++) step(f, typeof bits === 'function' ? bits(i) : bits, map); return f; };

// every class: same stat budget, every move well formed
for (const id of CHAR_IDS) {
  const c = CHARS[id];
  assert.equal(c.stats.reduce((a, b) => a + b), STAT_SUM, `${id} stat points`);
  assert.ok(c.moves.z1 && c.moves.s1 && c.moves.s2 && c.moves.s3 && c.moves.ctr, `${id} has the basics`);
  for (const [k, m] of Object.entries(c.moves)) {
    assert.ok(m.f > 0 && hitsOf(m).length, `${id}.${k} hits something`);
    if (m.next) assert.ok(c.moves[m.next] && m.cw < m.f, `${id}.${k} chains`);
    hitsOf(m).forEach((_, i) => assert.ok(reach(id, k, i).x > 0));
  }
  assert.deepEqual([c.moves.s1.mp, c.moves.s2.mp, c.moves.s3.mp], [100, 200, 300]);
}

// balance: basic combo damage per second within ±25% (melee and ranged apart), skill damage per MP bar within ±30%
const chainDps = (c) => {
  let k = 'z1', dmg = 0, fr = 0;
  const seen = new Set();
  while (k && !seen.has(k)) { seen.add(k); const m = c.moves[k]; dmg += hitsOf(m).reduce((s, h) => s + h.dmg, 0); fr += m.next && m.next !== k ? m.cw : m.next ? m.cw : m.f; k = m.next; }
  return (dmg / fr) * 60 * c.atk;
};
const spread = (list) => { const v = list.map((x) => x[1]).sort((a, b) => a - b); return v[v.length - 1] / v[0]; };
const dps = CHAR_IDS.map((id) => [id, chainDps(CHARS[id])]);
const melee = dps.filter(([id]) => !CHARS[id].ranged), ranged = dps.filter(([id]) => CHARS[id].ranged);
const perBar = CHAR_IDS.map((id) => [id, ['s1', 's2', 's3'].reduce((s, k) => s + hitsOf(CHARS[id].moves[k]).reduce((a, h) => a + h.dmg, 0) / (CHARS[id].moves[k].mp / 100), 0) / 3 * CHARS[id].atk]);
console.log('combo dps', Object.fromEntries(dps.map(([k, v]) => [k, Math.round(v)])));
console.log('skill dmg / MP bar', Object.fromEntries(perBar.map(([k, v]) => [k, Math.round(v)])));
assert.ok(spread(melee) <= 1.25 * 1.25, `melee combo dps spread ${spread(melee).toFixed(2)}`);
assert.ok(spread(ranged) <= 1.25 * 1.25, `ranged dps spread ${spread(ranged).toFixed(2)}`);
assert.ok(spread(perBar) <= 1.3 * 1.3, `skill spread ${spread(perBar).toFixed(2)}`);

// movement basics: run, jump onto a platform, drop through it
{
  const f = newFighter('a', 'ald3', -20);
  run(f, KEY.R, 30);
  assert.ok(f.x > -20 + 30 * CHARS.ald3.run * 0.9 && f.st === 'run');
  run(f, 0, 2);
  const p = newFighter('p', 'ald3', -17);
  run(p, (i) => (i < 2 ? KEY.U : 0), 90);
  assert.equal(p.y, 7, 'lands on the platform');
  run(p, (i) => (i < 2 ? KEY.D | KEY.J : 0), 90);
  assert.equal(p.y, 0, '↓ + jump drops through');
}

// Korean dash: dash -> attack -> dash-cancel, again and again, is faster than plain running
for (const id of ['kael3', 'shin3']) {
  const a = newFighter('a', id, -28), b = newFighter('b', id, -28);
  const kd = [KEY.K, 0, 0, 0, KEY.A, 0, 0, 0, 0, 0];
  run(a, (i) => kd[i % kd.length] | KEY.R, 60);
  run(b, KEY.R, 60);
  assert.ok(a.x - -28 > (b.x - -28) * 1.3, `${id} korean dash ${a.x.toFixed(1)} vs run ${b.x.toFixed(1)}`);
}
// a class without kdash can't cancel its dash attack early
{
  const a = newFighter('a', 'val4', 0);
  run(a, (i) => [KEY.K, 0, 0, 0, KEY.A, 0, KEY.K][i] ?? 0, 7);
  assert.equal(a.st, 'move');
}

// Blink is invulnerable, aim jump floats the archer, aiming tilts the arrow
{
  const k = newFighter('k', 'kael3', 0);
  step(k, KEY.K, map); step(k, 0, map);
  assert.ok(isInv(k));
  run(k, 0, 3);
  assert.ok(k.x > 8, 'blinked forward');
  const air = newFighter('s', 'syl1', 0), fall = newFighter('t', 'syl1', 0);
  const shots = [];
  run(air, (i) => (i < 2 ? KEY.U : i > 20 && i % 12 < 2 ? KEY.A | (i > 40 ? KEY.D : 0) : 0), 60);
  run(fall, (i) => (i < 2 ? KEY.U : 0), 60);
  assert.ok(air.y > fall.y + 1, `air stall keeps her up (${air.y.toFixed(1)} vs ${fall.y.toFixed(1)})`);
  const s = newFighter('s', 'syl1', 0);
  run(s, (i) => (i < 2 ? KEY.U : 0), 10);
  let ev = [];
  for (let i = 0; i < 8; i++) ev.push(...step(s, i < 2 ? KEY.A | KEY.U : KEY.U, map));
  const pr = ev.find((e) => e.proj)?.proj;
  assert.ok(pr && pr.vy > 0.4, 'aim up');
}

// hits: knockback, launch -> knockdown -> invulnerable get-up; super armor; counter escapes a combo
{
  const v = newFighter('v', 'ald3', 0);
  applyHit(v, CHARS.kael3.moves.z4.hit[0], 1);
  assert.ok(v.st === 'hit' && v.vy > 0.5 && v.fall);
  run(v, 0, 60);
  assert.ok(v.st === 'down' && isInv(v));
  run(v, 0, 80);
  assert.equal(v.st, 'idle');
  // Nakbup: tap jump in the window just after hitting the floor -> break-fall out fast and invulnerable
  const nb = newFighter('n', 'ald3', 0);
  applyHit(nb, CHARS.kael3.moves.z4.hit[0], 1);
  for (let i = 0; i < 90 && nb.st !== 'down'; i++) step(nb, 0, map);
  assert.equal(nb.st, 'down', 'knocked down');
  step(nb, 0, map); step(nb, 0, map); step(nb, 0, map); // into the break-fall window (t>=3)
  const teched = step(nb, KEY.J, map).includes('tech');
  assert.ok(teched && nb.st === 'up' && isInv(nb), 'break-fall techs out of the knockdown');
  run(nb, 0, 12);
  assert.equal(nb.st, 'idle', 'recovers fast after a break-fall');
  const tank = newFighter('t', 'val4', 0);
  run(tank, (i) => (i < 2 ? KEY.A : 0), 2);
  tank.st = 'move'; tank.mv = 'z4'; tank.t = 5;
  assert.equal(applyHit(tank, CHARS.kael3.moves.z1.hit[0], 1), 'armor');
  const c = newFighter('c', 'ald3', 0);
  c.mp = 100;
  applyHit(c, CHARS.kael3.moves.z1.hit[0], 1);
  run(c, (i) => (i > 5 && i < 8 ? KEY.X : 0), 10);
  assert.ok(c.st === 'move' && c.mv === 'ctr' && isInv(c) && c.mp < 10);
}

// snapshots round-trip
{
  const f = newFighter('a', 'syl3', 3.14159);
  run(f, KEY.R, 5);
  const g = unsnap(snap(f), newFighter('b', 'syl3'));
  assert.ok(Math.abs(g.x - f.x) < 0.01 && g.st === f.st && g.face === f.face);
  assert.deepEqual(unsnap('junk', { x: 1 }), { x: 1 });
}

// deterministic, and every matchup ends (CPU vs CPU on every map) without NaN; print the win matrix
const fight = (a, b, mi, seed = 0) => {
  const m = MAPS[mi];
  const fs = [newFighter('A', a, m.spawns[0] + seed, 1, 1), newFighter('B', b, m.spawns[1], -1, 2)];
  const projs = [];
  for (let t = 0; t < 60 * 120; t++) {
    for (const [i, f] of fs.entries()) for (const e of step(f, cpuInput(f, fs[1 - i]), m, fs)) if (e.proj) projs.push(e.proj);
    localHits(fs, projs, m, (att, vic, mv, k, h, dir) => {
      vic.hp -= damage(att.ch, vic.ch, h, veilMul(att));
      landedHit(att, h);
      if (vic.hp <= 0) { vic.hp = 0; vic.st = 'dead'; } else applyHit(vic, h, dir);
    });
    for (const f of fs) assert.ok(Number.isFinite(f.x + f.y + f.vx + f.vy + f.mp), `${a} vs ${b}: NaN`);
    if (fs.some((f) => f.st === 'dead')) return { win: fs.find((f) => f.st !== 'dead')?.ch, t };
  }
  return { win: fs[0].hp / CHARS[a].hp >= fs[1].hp / CHARS[b].hp ? a : b, t: 7200 };
};
assert.deepEqual(fight('kael3', 'syl1', 1), fight('kael3', 'syl1', 1));
const wins = Object.fromEntries(CHAR_IDS.map((id) => [id, 0]));
let games = 0, ticks = 0;
for (const a of CHAR_IDS) for (const b of CHAR_IDS) if (a !== b) for (let mi = 0; mi < MAPS.length; mi++) {
  const r = fight(a, b, mi, mi);
  if (r.win) wins[r.win]++; games++; ticks += r.t; // a double KO is a draw
}
console.log('CPU win rate', Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, `${Math.round((v / (games / 5)) * 100)}%`])), `avg fight ${Math.round(ticks / games / 60)}s`);
for (const [id, w] of Object.entries(wins)) assert.ok(w / (games / 5) > 0.15 && w / (games / 5) < 0.85, `${id} CPU win rate ${w}/${games / 5}`);
assert.ok(MP_MAX === 300);
console.log('chase ok');

// ranked MMR: more for beating stronger players, almost nothing for farming new accounts, nothing on the same network
{
  const { mmrDeltas, medalOf, CALIBRATION } = await import('../src/lib/chase.js');
  const vet = (id, mmr, score, ip = id) => ({ id, mmr, games: 50, ip, team: 0, score });
  const up = mmrDeltas([vet('a', 1200, 1), vet('b', 1500, 0)]).a, down = mmrDeltas([vet('a', 1200, 1), vet('b', 900, 0)]).a;
  assert.ok(up > 20 && down > 0 && down < 10, `beat stronger +${up}, weaker +${down}`);
  const farm = mmrDeltas([vet('a', 1200, 1), { id: 'n', mmr: 1000, games: 1, ip: 'n', team: 0, score: 0 }]);
  assert.ok(farm.a <= 2 && farm.n >= -64, `smurf farming +${farm.a}`);
  const alt = mmrDeltas([vet('a', 1200, 1, 'x'), vet('b', 1200, 0, 'x')]);
  assert.deepEqual(alt, { a: 0, b: 0 });
  const newbie = mmrDeltas([{ id: 'n', mmr: 1000, games: 0, ip: 'n', team: 0, score: 1 }, vet('b', 1000, 0)]);
  assert.ok(newbie.n === 32 && newbie.b >= -2, 'calibration moves fast, a smurf can not drain a veteran');
  const team = mmrDeltas([{ ...vet('a', 1000, 1), team: 1 }, { ...vet('b', 1000, 1), team: 1 }, { ...vet('c', 1000, 0), team: 2 }, { ...vet('d', 1000, 0), team: 2 }]);
  assert.ok(team.a === 16 && team.c === -16);
  assert.ok(medalOf(1000, 2).calibrating && medalOf(1000, CALIBRATION).name === 'Silver' && medalOf(1000).stars === 1 && medalOf(1149).stars === 5 && medalOf(2500).name === 'Mythic');
  console.log('mmr ok', { up, down, farm: farm.a });
}

// every class has its own dash: names, teleports, chains, armor, rocket wind-up
{
  const { CHARS, CHAR_IDS, newFighter, step, KEY, MAPS, isInv, hasArmor } = await import('../src/lib/chase.js');
  const m = MAPS[0];
  const go = (ch, bits) => { const f = newFighter('a', ch, -10); bits.forEach((b) => step(f, b, m)); return f; };
  assert.equal(new Set(CHAR_IDS.map((id) => CHARS[id].dash.name)).size, CHAR_IDS.length, 'unique dash names');
  assert.ok(!CHAR_IDS.some((id) => ['Rocket', 'Shadow Step', 'Mushidon', 'Guan Step'].includes(CHARS[id].dash.name)), 'class dashes do not reuse the universal tech names');
  const flash1 = go('kael4', [KEY.K, ...Array(20).fill(0)]).x, flash2 = go('kael4', [KEY.K, 0, 0, 0, 0, KEY.K, ...Array(20).fill(0)]).x;
  assert.ok(flash2 > flash1 + 4, `Flash Step chains (${flash1.toFixed(1)} -> ${flash2.toFixed(1)})`);
  const demon = go('val4', [KEY.K, 0, 0]);
  assert.ok(hasArmor(demon) && demon.st === 'dash', 'Demon Step has super armor');
  const rocket = go('shin3', [KEY.K, 0]);
  assert.equal(rocket.x, -10, 'Flame Burst winds up');
  const rocketFar = go('shin3', [KEY.K, ...Array(16).fill(0)]).x, walk = go('shin3', Array(17).fill(KEY.R)).x;
  assert.ok(rocketFar - -10 > (walk - -10) * 1.6, 'then bursts');
  const air = go('shin3', [KEY.U, 0, 0, 0, 0, 0, KEY.K, ...Array(8).fill(0)]);
  assert.ok(air.vy > 0 && air.st === 'dash', 'Flame Burst goes up in the air');
  const spirit = go('shin4', [KEY.K, 0]);
  assert.ok(isInv(spirit), 'Spirit Step is invulnerable');
  console.log('dashes ok');
}

// the classic movement techs, for every class: Rocket, Shadow (chain), Mushidon, Guan, Front Spell, Bleach, OttoShot, Aim Guan
{
  const { CHARS, CHAR_IDS, newFighter, step, KEY, MAPS, MP_MAX } = await import('../src/lib/chase.js');
  const m = MAPS[0];
  const { L, R, U, D, A, K, S1 } = KEY;
  const play = (ch, bits, x = -26, setup = {}) => { const f = Object.assign(newFighter('a', ch, x), setup); const evs = []; bits.forEach((b) => evs.push(...step(f, b, m))); return { f, evs }; };
  const rep = (n, b) => Array(n).fill(b);
  for (const id of CHAR_IDS) {
    // Rocket: →→↑ is a low diagonal jump at dash speed
    const r = play(id, [R, 0, R, R, R | U, ...rep(6, R)]);
    assert.ok(r.evs.includes('rocket') && r.f.y > 2 && r.f.x > -26 + 2.5, `${id} rocket`);
    // Shadow step chain: rocket, ↓, land, ↑ again… is faster than running
    const chain = [R, 0, R, R, R | U, R, R, R, R, R | D, ...rep(4, R)];
    for (let i = 0; i < 4; i++) chain.push(...rep(2, R), R | U, ...rep(4, R), R | D, ...rep(4, R));
    const sh = play(id, chain), run = play(id, rep(chain.length, R));
    assert.ok(sh.evs.filter((e) => e === 'shadow').length >= 4, `${id} shadow chains (${sh.evs.filter((e) => e === 'shadow').length})`);
    assert.ok(sh.f.x - -26 > (run.f.x - -26) * 1.4, `${id} shadow step faster than running: ${(sh.f.x + 26).toFixed(1)} vs ${(run.f.x + 26).toFixed(1)}`);
    // Mushidon: ↑↓ together stays on the floor and goes further than a dash
    const mu = play(id, [R, 0, R, R, R | U, R | D, ...rep(26, 0)]);
    assert.ok(mu.evs.includes('mushidon') && mu.f.y === 0, `${id} mushidon`);
    // Front Spell: a skill right out of the dash
    const fs = play(id, [R, 0, R, R, R, S1, ...rep(3, 0)], -26, { mp: MP_MAX });
    assert.ok(fs.f.st === 'move' && fs.f.mv === 's1', `${id} front spell`);
    // Bleach: combo into a skill
    const z = CHARS[id].moves.z1;
    const bl = play(id, [A, ...rep(Math.max(...z.hit.map((h) => h.b), ...z.proj.map((p) => p.at)) + 1, 0), S1, 0], -26, { mp: MP_MAX });
    assert.ok(bl.f.mv === 's1', `${id} bleach (combo → skill)`);
  }
  // Guan: jump, air dash, ↓ = a dive to the floor
  const gu = play('ald3', [U, ...rep(8, 0), K | R, R, R, R | D, ...rep(3, R)]);
  assert.ok(gu.evs.includes('guan') && gu.f.vy < -0.5, 'guan step');
  // OttoShot: ↓ + Z on a platform drops through attacking
  const ot = play('kael3', [U, ...rep(60, 0)], -17);
  assert.equal(ot.f.y, 7);
  ot.evs.length = 0;
  ot.evs.push(...step(ot.f, D | A, m));
  assert.ok(ot.evs.includes('drop') && ot.f.st === 'move' && ot.f.mv === 'ja', 'ottoshot');
  // Aim Guan: rocket + Z Z Z: straight arrows, the archer holds her height
  const ag = play('syl1', [R, 0, R, R, R | U, ...rep(8, R), A, ...rep(11, 0), A, ...rep(11, 0), A, ...rep(11, 0), A, ...rep(6, 0)]);
  const shots = ag.evs.filter((e) => e.proj);
  assert.ok(shots.length === 4 && shots.every((e) => e.proj.vy === 0) && ag.f.y > 2, `aim guan (${shots.length} shots, y ${ag.f.y.toFixed(1)})`);
  const fall = play('syl1', [R, 0, R, R, R | U, ...rep(60, R)]);
  assert.equal(fall.f.y, 0, 'without the shots the rocket lands long before'); // ag is still in the air at the same frame
  // Grab: ← + → + Z together throws (through super armor), also in the air
  const { applyHit, hasArmor } = await import('../src/lib/chase.js');
  const gb = play('ald3', [L | R | A], 0);
  assert.ok(gb.f.st === 'move' && gb.f.mv === 'gr', 'grab input');
  const tank = newFighter('t', 'val4', 2); tank.st = 'move'; tank.mv = 'z4'; tank.t = 5;
  assert.ok(hasArmor(tank) && applyHit(tank, CHARS.ald3.moves.gr.hit[0], 1) === 'hit' && tank.fall, 'grab breaks super armor');
  const ag2 = play('kael3', [R, 0, R, R, R | U, R, R]), foe = Object.assign(newFighter('e', 'ald3', ag2.f.x + 2), { y: ag2.f.y, g: false });
  step(ag2.f, R | A, MAPS[0], [ag2.f, foe]);
  assert.ok(ag2.f.mv === 'gr' && !ag2.f.g, 'aerial grab after a rocket');
  // classic controls: hold Z to charge MP and release for that level's skill; →→ and keep holding = sprint
  const { chargeLevel } = await import('../src/lib/chase.js');
  const ch1 = play('ald3', [A, ...rep(80, A), 0], 0, { mp: MP_MAX });
  assert.ok(ch1.f.st === 'move' && ch1.f.mv === 's2', `hold Z ~1.3s = 2-bar skill (${ch1.f.mv})`);
  const ch2 = play('ald3', [A, ...rep(100, A), 0], 0, { mp: 150 });
  assert.equal(ch2.f.mv, 's1', 'capped by the MP you have');
  const tap = play('ald3', [A, 0], 0, { mp: MP_MAX });
  assert.equal(tap.f.mv, 'z1', 'a tap is still an attack');
  const spr = play('ald3', [R, 0, R, ...rep(60, R)]), walk = play('ald3', rep(63, R));
  assert.ok(spr.f.x - walk.f.x > 6, `sprint after →→ (${(spr.f.x - walk.f.x).toFixed(1)} ahead)`);
  // grab like the classic: toward an enemy you are touching + Z
  const near = [newFighter('a', 'ald3', 0), newFighter('b', 'val4', 2.2)];
  step(near[0], R | A, m, near);
  assert.equal(near[0].mv, 'gr', 'toward + Z next to an enemy grabs');
  const far = [newFighter('a', 'ald3', 0), newFighter('b', 'val4', 8)];
  step(far[0], R | A, m, far);
  assert.equal(far[0].mv, 'z1', 'toward + Z far away is a normal attack');
  console.log('gc techs ok');
}

// Lass-style 3rd job (Kael Nightblade): Lothus hooks, Illusion Step, Vortex Step, super jump, Phantom Veil
{
  const { newFighter, step, KEY, MAPS, isInv, localHits, damage, applyHit, landedHit, veilMul, MP_MAX, CHARS } = await import('../src/lib/chase.js');
  const { L, R, U, D, A } = KEY, m = MAPS[1], rep = (n, b) => Array(n).fill(b);
  const duel = (bits, foeX = -18) => {
    const k = Object.assign(newFighter('k', 'kael3', -28, 1, 1), { mp: MP_MAX }), v = newFighter('v', 'ald3', foeX, -1, 2), fs = [k, v], projs = [];
    let hits = 0;
    for (const b of bits) {
      step(k, b, m, fs); step(v, 0, m, fs);
      localHits(fs, projs, m, (a, vic, mv, kk, h, dir) => { if (a === k) hits++; vic.hp -= damage(a.ch, vic.ch, h, veilMul(a)); landedHit(a, h); applyHit(vic, h, dir); });
    }
    return { k, v, hits };
  };
  // Lothus: rocket + Z + → … hooks and carries the enemy through the air
  const lothus = duel([R, 0, R, R | U, ...rep(3, R), ...rep(8, [R | A, ...rep(5, R)]).flat()]);
  assert.ok(lothus.hits >= 5, `Lothus lands ${lothus.hits} hooks`);
  assert.ok(lothus.v.x > -18 + 8, `…carrying the enemy (${lothus.v.x.toFixed(1)})`);
  // Illusion Step: hold ← while doing →→↑: an invulnerable rocket that still goes right
  const ill = newFighter('i', 'kael3', -28);
  [L, L, L | R, L, L | R, L | R | U, L | R].forEach((b) => step(ill, b, m)); // hold ←, then →→↑
  assert.ok(ill.rk && ill.ill && isInv(ill) && ill.vx > 0, 'Illusion Step');
  // Vortex Step: [←] →→↑ + Z: the air slash goes backwards
  const vx = newFighter('x', 'kael3', 0);
  [L, L, L | R, L, L | R, L | R | U, L | R, L | R, L | R | A].forEach((b) => step(vx, b, m));
  assert.ok(vx.mv === 'ja' && vx.face === -1, 'Vortex Step');
  // super jump: much higher than everyone else
  const top = (ch) => { const f = newFighter('j', ch, 0); let y = 0; [U, ...rep(60, 0)].forEach((b) => { step(f, b, m); y = Math.max(y, f.y); }); return y; };
  assert.ok(top('kael3') > top('ald3') * 1.4, 'super jump');
  // Phantom Veil: invisible for 8 s, the next attack hits 30% harder
  const veil = duel([128, ...rep(30, 0), R, ...rep(45, R), A, ...rep(20, 0)], -10);
  assert.ok(veil.k.veil > 0 && veil.v.hp < CHARS.ald3.hp - damage('kael3', 'ald3', CHARS.kael3.moves.z1.hit[0]) - 5, 'veil + 30% damage');
  console.log('lass ok', { lothus: lothus.hits });
}
