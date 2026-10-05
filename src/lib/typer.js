// Night Shift: the typing rules, shared by the browser and the tests. Everything is a pure function of
// (seed, time), so every player in a room sees the same prompts and the same bots without sending them.
// Time `t` is ms since the night started. 12 AM -> 6 AM is one night; nights never end, they just get faster.
import { rng } from './geo.js';

export const MAX_PLAYERS = 4;
export const HOUR = 40000; // one in-game hour = 40 s, a night = 4 min
export const HOURS = ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM'];
export const nightOf = (t) => Math.floor(Math.max(0, t) / (HOUR * 6)) + 1;
export const hourOf = (t) => Math.floor(Math.max(0, t) / HOUR) % 6;
export const clockOf = (t) => `${HOURS[hourOf(t)]} · Night ${nightOf(t)}`;
// seconds allowed per character: ~22 wpm on night 1, ~70 wpm by night 6
export const secPerChar = (t) => Math.max(0.17, 0.55 * 0.8 ** (Math.max(0, t) / (HOUR * 6)));
export const timeFor = (text, t) => Math.round((2.2 + text.length * secPerChar(t)) * 1000);
export const wrongDamage = (t) => Math.min(14, 5 + 2 * (nightOf(t) - 1));
export const TIMEOUT_DAMAGE = 24;
export const healFor = (perfect) => (perfect ? 9 : 4);

const WORDS = `oof obby noob robux bacon guest blox avatar spawn badge lobby server tycoon simulator respawn checkpoint
  sword shield potion quest pizza party stage curtain bear bunny robot guard night shift camera door hallway battery
  flashlight power clock midnight shadow whisper footstep static signal monitor keyboard office closet vent ghost
  spooky creepy haunted pumpkin candle lantern spider broom witch skull bones zombie vampire mummy werewolf howl
  scream shiver goosebumps eerie gloomy dark moon star cloud thunder storm rain fog mist creak squeak rattle growl
  smile teeth eyes ears paws claws mask costume animatronic gears wires spring motor bolt metal plastic dust cobweb
  pixel block brick stud plate part script build craft trade pet egg hatch rare legendary mythic epic common quick
  jump climb run hide seek tag freeze dodge sneak peek blink stare wink wave dance spin glow flicker buzz hum tick
  tock alarm siren exit window ladder stairs basement attic kitchen cake balloon gift ribbon confetti candy cookie
  soda fries burger nuggets ticket prize token arcade claw machine carousel slide swing tunnel maze puzzle riddle
  secret code key lock vault map compass treasure coin gem crown throne castle dragon knight wizard spell magic
  rocket planet comet galaxy alien laser portal teleport glitch error crash reboot lag ping friend squad team win`.trim().split(/\s+/);

const PHRASES = [
  'do not blink', 'check the cameras', 'close the door', 'watch the hallway', 'save your power', 'the lights flicker',
  'someone is coming', 'stay in your seat', 'type faster now', 'the bear moved', 'it is too quiet', 'listen for steps',
  'free robux scam', 'press the button', 'into the vents', 'back on stage', 'eyes in the dark', 'the clock ticks',
  'a cold breeze', 'happy birthday', 'pizza is ready', 'party hats on', 'the music box', 'out of battery',
  'reset the system', 'signal is lost', 'who is there', 'not a costume', 'gears are turning', 'join the party',
  'one more night', 'almost six am', 'the guest is back', 'noob on stage', 'bacon hair rises', 'spawn point',
  'checkpoint saved', 'lag spike again', 'server shutdown', 'legendary drop', 'tycoon money', 'obby of doom',
  'hide and seek', 'red light green light', 'trust no one', 'lights out', 'game over', 'keep typing', 'do not stop',
  'dark and stormy', 'beware the stage', 'it smiles at you', 'run run run', 'the door is open', 'shh be quiet',
];

const SENTENCES = [
  'The animatronics get a little restless at night.', 'Welcome to your first shift at Bibi\'s Pizza.',
  'If you hear footsteps, keep typing and do not look back.', 'The bear on the stage just turned its head.',
  'Your flashlight battery is running low.', 'Every mistake makes the lights flicker a little more.',
  'Someone left the back door open again.', 'The guest account has been online for hours.',
  'Make it to six in the morning and you win.', 'Nobody remembers who built the noob robot.',
  'The music box will stop playing very soon.', 'Check the hallway camera before it is too late.',
  'Party time is over, but the party never ends.', 'They only move when you are not watching.',
  'Type every letter right and the bear stays away.', 'The pizza is cold and the stage is empty.',
  'Your friends are typing faster than you!', 'A strange glitch appeared on the monitor.',
  'Do not trust anyone who offers free robux.', 'The janitor never came back from the basement.',
  'Bacon hair is waiting just outside the door.', 'The checkpoint is saved, but are you?',
  'Power is at ten percent, keep going!', 'Something is breathing behind the curtain.',
  'The lights went out on the stage at midnight.', 'Count the animatronics, there should be four.',
  'You can hear the gears turning in the dark.', 'Whatever you do, do not stop typing now.',
  'The old arcade machine turned on by itself.', 'Six in the morning feels so far away.',
  'Night shift workers type fast to stay alive.', 'The robot noob has a very creepy smile.',
  'A balloon floats slowly down the dark hallway.', 'The security tapes from last week are missing.',
  'Somebody is knocking on the office window.', 'One wrong key and the monitor goes static.',
  'The legendary pet hatched at exactly midnight.', 'Lag is the scariest monster of them all.',
  'Keep calm, breathe, and type the next word.', 'The stage curtains are moving without wind.',
];

// Prompt #i of a seed: words first, then phrases, then sentences, mixed more and more as the night goes on.
export function promptAt(seed, i) {
  const r = rng(`${seed}:p${i}`);
  const roll = r();
  const pick = (list) => list[Math.floor(r() * list.length)];
  let tier;
  if (i < 5) tier = 0;
  else if (i < 12) tier = roll < 0.6 ? 0 : 1;
  else if (i < 22) tier = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
  else tier = roll < 0.15 ? 0 : roll < 0.5 ? 1 : 2;
  if (tier === 0) return i > 30 && r() < 0.5 ? `${pick(WORDS)} ${pick(WORDS)}` : pick(WORDS);
  return tier === 1 ? pick(PHRASES) : pick(SENTENCES);
}

const norm = (ch) => String(ch).toLowerCase().replace(/[‘’`]/g, "'");
export const sameKey = (a, b) => norm(a) === norm(b);

// One player's (or bot's) night. key() and tick() take the shared game clock.
export function makeRun(seed) {
  const s = { seed, i: 0, c: 0, hp: 100, score: 0, combo: 0, bestCombo: 0, typed: 0, errs: 0, promptErrs: 0, alive: true, deathT: 0, start: 0, deadline: 0, text: '' };
  const begin = (t) => { s.text = promptAt(seed, s.i); s.c = 0; s.promptErrs = 0; s.start = t; s.deadline = t + timeFor(s.text, t); };
  const hurt = (n, t) => { s.hp = Math.max(0, s.hp - n); if (s.hp <= 0 && s.alive) { s.alive = false; s.deathT = t; } };
  begin(0);
  // timeouts are settled at their exact deadline (not the frame time), so every client agrees
  s.tick = (t) => {
    let ev = null;
    while (s.alive && t > s.deadline) {
      const at = s.deadline;
      hurt(TIMEOUT_DAMAGE, at);
      s.combo = 0;
      s.i++;
      begin(at);
      ev = 'timeout';
    }
    return s.alive ? ev : 'dead';
  };
  s.key = (ch, t) => {
    if (s.tick(t) === 'dead' || !s.alive) return 'dead';
    if (sameKey(ch, s.text[s.c])) {
      s.c++; s.typed++; s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += 1 + Math.floor(s.combo / 10);
      if (s.c < s.text.length) return 'ok';
      const perfect = s.promptErrs === 0;
      s.score += s.text.length + Math.max(0, Math.round((s.deadline - t) / 200)) + (perfect ? 10 : 0);
      s.hp = Math.min(100, s.hp + healFor(perfect));
      s.i++;
      begin(t);
      return perfect ? 'perfect' : 'done';
    }
    s.errs++; s.promptErrs++; s.combo = 0;
    hurt(wrongDamage(t), t);
    return s.alive ? 'bad' : 'dead';
  };
  return s;
}

// Bots: a skill level from the seed, then they "type" on a seeded schedule. Same seed + slot = same bot everywhere.
export const BOT_NAMES = ['Robo Panda', 'Byte Fox', 'Circuit Bunny', 'Glitch Cat', 'Turbo Bot', 'Pixel Owl', 'Mecha Dino', 'Static Shark'];
// bot k of a room: different names for every slot, the same on every client
export const botName = (seed, k) => `${BOT_NAMES[(String(seed).charCodeAt(0) + k * 3) % BOT_NAMES.length]} ${10 + ((String(seed).charCodeAt(k + 1) * 7 + k * 13) % 90)}`;
export function makeBot(seed, slot) {
  const r = rng(`${seed}:bot${slot}`);
  const wpm = 26 + r() * 38; // 26..64 wpm
  const errRate = 0.025 + r() * 0.05;
  const run = makeRun(seed);
  const perChar = 60000 / (wpm * 5);
  let next = 600 + r() * 900;
  run.wpm = Math.round(wpm);
  run.advance = (t) => {
    const evs = [];
    while (run.alive && next <= t) {
      const at = next;
      // a bot panics a bit when its power is low
      const miss = r() < errRate * (run.hp < 35 ? 2 : 1);
      const before = run.i;
      const ev = run.key(miss ? 'ʘ' : run.text[run.c], at);
      evs.push(ev);
      next = at + perChar * (0.55 + r() * 0.9) + (run.i !== before ? 350 + r() * 600 : 0);
    }
    const ev = run.tick(t);
    if (ev) evs.push(ev);
    return evs;
  };
  return run;
}

// Final standings: whoever survived longest, then score.
export const standings = (list) => [...list].sort((a, b) => (b.alive - a.alive) || ((b.deathT || Infinity) - (a.deathT || Infinity)) || b.score - a.score);
export const wpmOf = (run, t) => Math.round(run.typed / 5 / Math.max(1 / 60, (run.alive ? t : run.deathT) / 60000));

// ---------- Rounds mode ----------
// Everyone gets the same prompt each round. Whoever finishes last (or doesn't finish in time) loses a heart.
// Most hearts at the end wins. The server (or the browser in offline games) runs these pure state functions.
export const LIVES = 5;
export const ROUND_COUNTDOWN = 1800; // "3, 2, 1" before each prompt
export const ROUND_GAP = 4800; // time for the "who lost a heart" animation
export const MAX_ROUNDS = 40;
export const MATCH_MS = 15 * 60000; // a match never lasts more than ~15 minutes
export const roundText = (seed, r) => promptAt(`${seed}:R`, Math.min(70, 2 + r * 2));
export const roundLimit = (text, r) => Math.round((2.5 + text.length * Math.max(0.2, 0.62 * 0.95 ** (r - 1))) * 1000);
// How long bot `slot` needs for round r (Infinity = it runs out of time). Same skill as in survival.
export function botRoundMs(seed, slot, r) {
  const skill = rng(`${seed}:bot${slot}`);
  const wpm = 26 + skill() * 38, errRate = 0.025 + skill() * 0.05;
  const x = rng(`${seed}:bot${slot}:r${r}`), text = roundText(seed, r);
  let ms = 450 + x() * 600;
  for (let i = 0; i < text.length; i++) ms += (60000 / (wpm * 5)) * (0.55 + x() * 0.9) + (x() < errRate ? 350 : 0);
  ms = Math.round(ms);
  return ms <= roundLimit(text, r) ? ms : Infinity;
}
export function newRounds(roster, now) {
  return { r: 0, at: 0, limit: 0, text: '', fins: {}, lives: Object.fromEntries(roster.map((p) => [p.id, LIVES])), total: Object.fromEntries(roster.map((p) => [p.id, 0])), bots: Object.fromEntries(roster.filter((p) => p.bot != null).map((p) => [p.id, p.bot])), startedAt: now, over: false };
}
export const aliveIds = (st) => Object.keys(st.lives).filter((id) => st.lives[id] > 0);
export function roundStart(st, seed, now) {
  st.r++;
  st.text = roundText(seed, st.r);
  st.at = now + ROUND_COUNTDOWN;
  st.limit = roundLimit(st.text, st.r);
  st.fins = {};
  return { t: 'round', r: st.r, at: st.at, limit: st.limit, lives: st.lives };
}
// a human finished typing: accepted once per round, never faster than ~300 wpm
export function roundFinish(st, id, now) {
  if (st.over || !(st.lives[id] > 0) || st.fins[id] != null || st.bots[id] != null) return null;
  const ms = now - st.at;
  if (ms < st.text.length * 40 || ms > st.limit + 1500) return null;
  st.fins[id] = ms;
  return ms;
}
export const humansDone = (st) => aliveIds(st).every((id) => st.bots[id] != null || st.fins[id] != null);
export function roundEnd(st, seed, now) {
  const ids = aliveIds(st);
  const times = Object.fromEntries(ids.map((id) => [id, st.bots[id] != null ? botRoundMs(seed, st.bots[id], st.r) : st.fins[id] ?? Infinity]));
  const late = ids.filter((id) => times[id] === Infinity);
  const losers = late.length ? late : [ids.reduce((a, b) => (times[b] > times[a] ? b : a))];
  if (ids.length > 1 || late.length) for (const id of losers) st.lives[id] = Math.max(0, st.lives[id] - 1);
  for (const id of ids) st.total[id] += Math.min(times[id], st.limit + 1000);
  st.over = aliveIds(st).length <= 1 || st.r >= MAX_ROUNDS || now - st.startedAt > MATCH_MS;
  return { t: 'rend', total: st.total, r: st.r, times: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v === Infinity ? -1 : v])), losers, lives: st.lives, over: st.over };
}
// standings: most hearts, then the fastest total time
export const roundStandings = (st) => Object.keys(st.lives).sort((a, b) => st.lives[b] - st.lives[a] || st.total[a] - st.total[b]);
// only bots left: play the remaining rounds instantly (they are deterministic)
export function fastForward(st, seed, now) {
  let t = now;
  while (!st.over && aliveIds(st).every((id) => st.bots[id] != null)) { roundStart(st, seed, t); roundEnd(st, seed, (t += 1)); }
  return st.over;
}
