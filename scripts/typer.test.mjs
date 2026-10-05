import assert from 'node:assert/strict';
import { promptAt, makeRun, makeBot, secPerChar, timeFor, nightOf, hourOf, clockOf, HOUR, TIMEOUT_DAMAGE, standings, sameKey } from '../src/lib/typer.js';

// prompts: deterministic, infinite, only keys the on-screen keyboard has, longer later on
for (let i = 0; i < 400; i++) {
  assert.equal(promptAt('s', i), promptAt('s', i));
  assert.match(promptAt('s', i), /^[a-zA-Z ',.!?]+$/, `typable: ${promptAt('s', i)}`);
}
assert.notDeepEqual([0, 1, 2, 3, 4].map((i) => promptAt('a', i)), [0, 1, 2, 3, 4].map((i) => promptAt('b', i)));
const avg = (a, b) => Array.from({ length: b - a }, (_, k) => promptAt('x', a + k).length).reduce((x, y) => x + y) / (b - a);
assert.ok(avg(30, 130) > avg(0, 5) * 2, 'prompts get longer');
assert.ok(sameKey('A', 'a') && sameKey('’', "'") && !sameKey('a', 'b'));

// clock + difficulty
assert.equal(clockOf(0), '12 AM · Night 1');
assert.equal(hourOf(HOUR * 5.5), 5);
assert.equal(nightOf(HOUR * 6), 2);
assert.ok(secPerChar(HOUR * 30) < secPerChar(0) / 2 && secPerChar(1e9) === 0.17);

// a perfect typist survives, heals and scores; mistakes and timeouts hurt
{
  const r = makeRun('seed');
  let t = 0;
  for (let k = 0; k < 200; k++) { t += 120; assert.notEqual(r.key(r.text[r.c], t), 'dead'); }
  assert.ok(r.alive && r.hp === 100 && r.score > 200 && r.i > 5);
  const hp = r.hp;
  r.key('ʘ', t + 10);
  assert.ok(r.hp < hp && r.combo === 0 && r.errs === 1);
  const i = r.i, hp2 = r.hp;
  assert.equal(r.tick(r.deadline + 1), 'timeout');
  assert.equal(r.i, i + 1);
  assert.equal(r.hp, hp2 - TIMEOUT_DAMAGE);
}
// an idle player dies from timeouts, at a time that doesn't depend on how often the clock is checked
{
  const a = makeRun('idle'), b = makeRun('idle');
  for (let t = 0; t < 120000; t += 16) a.tick(t);
  b.tick(120000);
  assert.ok(!a.alive && !b.alive && a.deathT === b.deathT && a.deathT > 0);
}
// bots: identical on every client no matter the frame rate, and they eventually lose the night
{
  const a = makeBot('room1', 2), b = makeBot('room1', 2);
  for (let t = 0; t < 30 * 60000 && a.alive; t += 16) a.advance(t);
  for (let t = 0; t < 30 * 60000 && b.alive; t += 250) b.advance(t);
  assert.ok(!a.alive, 'bots die as the nights get faster');
  assert.equal(a.deathT, b.deathT);
  assert.equal(a.score, b.score);
  assert.notEqual(makeBot('room1', 1).wpm + makeBot('room1', 3).wpm, 2 * a.wpm);
  console.log(`  bot ${a.wpm} wpm survived until ${clockOf(a.deathT)} with ${a.score} pts`);
}
// standings: survivors first, then who lasted longest
const s = standings([{ id: 'a', alive: false, deathT: 5, score: 99 }, { id: 'b', alive: true, deathT: 0, score: 1 }, { id: 'c', alive: false, deathT: 9, score: 0 }]);
assert.deepEqual(s.map((x) => x.id), ['b', 'c', 'a']);
console.log('typer tests ok');

// rounds mode: slowest loses a heart, last heart standing wins, bots are deterministic
{
  const { newRounds, roundStart, roundFinish, roundEnd, humansDone, botRoundMs, roundStandings, LIVES, roundText, roundLimit } = await import('../src/lib/typer.js');
  assert.equal(botRoundMs('s', 1, 3), botRoundMs('s', 1, 3));
  assert.ok(roundText('s', 20).length > roundText('s', 1).length);
  assert.ok(roundLimit('hello', 30) < roundLimit('hello', 1));
  const roster = [{ id: 'a' }, { id: 'b' }, { id: 'bot0', bot: 0 }];
  const st = newRounds(roster, 0);
  let now = 0, rounds = 0;
  while (!st.over) {
    roundStart(st, 'seed', now);
    assert.equal(roundFinish(st, 'a', st.at + 1), null, 'too fast is ignored');
    roundFinish(st, 'a', st.at + st.text.length * 90); // a is quick
    if (st.r % 2) roundFinish(st, 'b', st.at + st.text.length * 300); // b misses every other round
    assert.ok(humansDone(st) || st.fins.b == null);
    const end = roundEnd(st, 'seed', st.at + st.limit + 1);
    assert.ok(end.losers.length >= 1);
    now = st.at + st.limit + 5000;
    rounds++;
  }
  assert.ok(rounds < 40, `a match ends (${rounds} rounds)`);
  assert.equal(roundStandings(st)[0], 'a', 'the fastest typist wins');
  assert.ok(st.lives.a === LIVES || st.lives.a > st.lives.b);
}
console.log('rounds tests ok');
