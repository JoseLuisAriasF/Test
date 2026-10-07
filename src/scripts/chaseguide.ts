// Blox Chase PvP guide: every trick is a live demo run by the real game engine (lib/chase.js) with a scripted input
// track, drawn by the game renderer. Exact frames, any speed, crisp at any size, a few KB instead of video files.
// One WebGL renderer draws every visible demo and copies it into that demo's canvas.
import { CHARS, MAPS, KEY, TICK, MP_MAX, newFighter, step, activeHits, localHits, applyHit, damage, blinkDist, landedHit, veilMul } from '../lib/chase.js';
import { makeRenderer, Stage } from './chase3d.ts';

const { L, R, U, D, J, A, K, X, S1, S2, S3 } = KEY;
type Step = [frames: number, bits: number, label?: string];
type Demo = { id: string; map: number; actors: { ch: string; x: number; face: number; script: Step[]; dummy?: boolean }[] };
const rep = (n: number, s: Step[]) => Array.from({ length: n }, () => s).flat();
const W: Step = [40, 0];

// the scripts: [frames, buttons held, caption]
export const DEMOS: Record<string, Demo> = {
  rocket: { id: 'rocket', map: 1, actors: [
    { ch: 'ald3', x: -24, face: 1, script: [[20, 0, 'Rocket: →→↑'], [2, R, '→'], [2, 0], [2, R, '→ (dash)'], [3, R], [2, R | U, '↑: rocket'], [36, R], [20, 0], [2, R], [2, 0], [2, R], [4, R, 'dash →'], [2, L | U, '← + ↑: Break Rocket (the other way)'], [50, 0]] },
  ] },
  lassrocket: { id: 'lassrocket', map: 1, actors: [
    { ch: 'kael3', x: -28, face: 1, script: [[20, 0, 'Lass-style Rocket: →→↑, fast and low'], [2, R], [2, 0], [2, R, '→→'], [2, R | U, '↑ rocket'], [5, R], ...rep(4, [[2, R | A, 'Z + →: air slash, keep flying'], [5, R]] as Step[]), [20, R], [30, 0], [2, R], [2, 0], [2, R], [2, R | U, 'rocket again…'], [5, R], [2, R | A, 'Z + →'], [5, R], [2, L | A, '← + Z: turn back'], [5, L], [2, L | A], [50, 0]] },
    { ch: 'ald3', x: 6, face: -1, script: [[300, 0]] },
  ] },
  shadow: { id: 'shadow', map: 0, actors: [
    { ch: 'kael3', x: -27, face: 1, script: [[20, 0, 'Shadow Step: →→↑ then ↓, again and again'], [2, R], [2, 0], [2, R], [3, R], [2, R | U, '↑ rocket'], [4, R], [2, R | D, '↓ shadow'], [4, R], ...rep(4, [[2, R], [2, R | U, '↑'], [4, R], [2, R | D, '↓'], [4, R]] as Step[]), [50, 0]] },
  ] },
  mushidon: { id: 'mushidon', map: 3, actors: [
    { ch: 'shin2', x: -26, face: 1, script: [[20, 0, 'Mushidon: →→ then ↑↓ together'], [2, R], [2, 0], [2, R], [3, R], [1, R | U, '↑'], [2, R | D, '↓ right away'], [30, 0, 'a long dash that stays on the floor'], [30, 0]] },
  ] },
  guan: { id: 'guan', map: 2, actors: [
    { ch: 'syl3', x: -14, face: 1, script: [[20, 0, 'Guan Step: jump, dash, ↓'], [2, U, '↑ jump'], [9, 0], [2, K | R, '→→ air dash'], [2, R], [2, R | D, '↓: dive to the floor'], [50, 0]] },
  ] },
  grab: { id: 'grab', map: 0, actors: [
    { ch: 'shin2', x: -4, face: 1, script: [[34, 0, 'They start an armored attack…'], [2, L | R | A, '← + → + Z: grab!'], [40, 0, 'grabs go through super armor'], [30, 0], [2, R], [2, 0], [2, R], [4, R], [2, R | U, 'rocket…'], [3, R], [2, L | R | A, '…aerial grab'], [60, 0]] },
    { ch: 'val4', x: -1.5, face: -1, script: [[20, 0], [2, A], [10, 0], [2, A], [10, 0], [2, A], [12, 0], [2, A], [140, 0]] },
  ] },
  lothus: { id: 'lothus', map: 1, actors: [
    { ch: 'kael3', x: -26, face: 1, script: [[20, 0, 'Lothus: →→↑ then Z+→ Z+→ Z+→…'], [2, R], [2, 0], [2, R, '→→'], [2, R | U, '↑ rocket'], [3, R], ...rep(8, [[2, R | A, 'Z + →: hook and carry'], [4, R]] as Step[]), [60, 0]] },
    { ch: 'ald3', x: -16, face: -1, script: [[300, 0]] },
  ] },
  illusion: { id: 'illusion', map: 2, actors: [
    { ch: 'kael3', x: -16, face: 1, script: [[24, 0, 'Illusion Step: hold ←, then →→↑↓'], [6, L, 'hold ←'], [2, L | R, '→'], [2, L], [2, L | R, '→ (dash)'], [2, L | R | U, '↑: invulnerable rocket'], [3, L | R], [2, L | R | D, '↓: through their attack'], [30, 0], [60, 0]] },
    { ch: 'val4', x: -8, face: -1, script: [[34, 0], [2, A], [10, 0], [2, A], [10, 0], [2, A], [12, 0], [2, A], [120, 0]] },
  ] },
  vortex: { id: 'vortex', map: 0, actors: [
    { ch: 'kael3', x: -6, face: 1, script: [[24, 0, 'Vortex Step: hold ←, →→↑ then Z'], [6, L, 'hold ←'], [2, L | R], [2, L], [2, L | R, '→→'], [2, L | R | U, '↑ rocket away…'], [6, L | R], [2, L | R | A, '…Z: slash back at the chaser'], [60, 0]] },
    { ch: 'shin3', x: -12, face: 1, script: [[34, 0], [2, K | R], [30, R], [80, 0]] },
  ] },
  grabfwd: { id: 'grabfwd', map: 3, actors: [
    { ch: 'kael3', x: -14, face: 1, script: [[20, 0, 'Grab: walk into them…'], [26, R], [2, R | A, '→ + Z while touching: grab!'], [50, 0], [2, R], [2, 0], [2, R], [2, R | U, 'Mushidon…'], [1, R | D], [8, R], [2, R | A, '…+ → + Z: fast grab'], [60, 0]] },
    { ch: 'shin2', x: -2, face: -1, script: [[300, 0]] },
  ] },
  frontspell: { id: 'frontspell', map: 0, actors: [
    { ch: 'kael4', x: -20, face: 1, script: [[20, 0, 'Front Spell: a skill straight out of a dash'], [2, R], [2, 0], [2, R], [5, R, '→→ dash'], [2, S1, 'A: the skill keeps the momentum'], [70, 0]] },
    { ch: 'ald3', x: -2, face: -1, script: [[200, 0]] },
  ] },
  bleach: { id: 'bleach', map: 3, actors: [
    { ch: 'ald3', x: -8, face: 1, script: [[20, 0, 'Bleach: combo, then a skill'], [2, A, 'Z'], [7, 0], [2, A, 'Z'], [7, 0], [2, A, 'Z'], [9, 0], [2, S2, 'S: the skill cancels the combo'], [70, 0]] },
    { ch: 'shin2', x: -4, face: -1, script: [[200, 0]] },
  ] },
  ottoshot: { id: 'ottoshot', map: 0, actors: [
    { ch: 'shin3', x: -17, face: 1, script: [[2, U], [50, 0, 'Stand on a platform…'], [2, D | A, '↓ + Z: OttoShot, drop through attacking'], [40, 0], [40, 0]] },
    { ch: 'syl4', x: -15, face: -1, script: [[200, 0]] },
  ] },
  aimguan: { id: 'aimguan', map: 1, actors: [
    { ch: 'syl1', x: -24, face: 1, script: [[20, 0, 'Aim Guan: rocket + Z Z Z'], [2, R], [2, 0], [2, R], [3, R], [2, R | U, '↑ rocket'], [6, R], [2, A, 'Z'], [11, 0], [2, A, 'Z: shots lock straight, she holds the height'], [11, 0], [2, A], [11, 0], [2, A], [11, 0], [2, A], [60, 0]] },
    { ch: 'val4', x: 4, face: -1, script: [[220, 0]] },
  ] },
  kdash: { id: 'kdash', map: 0, actors: [
    { ch: 'kael3', x: -26, face: 1, script: [[20, 0, 'Korean dash: →→ Z →→ Z…'], ...rep(5, [[2, K | R, '→→ dash'], [3, R], [2, A | R, 'Z (dash attack)'], [3, R, '…cancel it with →→']]), [2, A, 'Z combo'], [6, 0], [2, A], [6, 0], [2, A], [8, 0], [2, A], [50, 0]] },
    { ch: 'ald3', x: 14, face: -1, dummy: true, script: [[200, 0]] },
  ] },
  blink: { id: 'blink', map: 2, actors: [
    { ch: 'kael3', x: -4, face: 1, script: [[34, 0, 'Wait for the attack…'], [2, K | R, '→→: blink through it (invulnerable)'], [14, 0], [2, L, 'turn around'], [4, 0], [2, A, 'punish from behind'], [6, 0], [2, A], [6, 0], [2, A], [9, 0], [2, A], [60, 0]] },
    { ch: 'val4', x: 2, face: -1, script: [[24, 0], [2, A], [9, 0], [2, A], [9, 0], [2, A], [11, 0], [2, A], [80, 0]] },
  ] },
  flash: { id: 'flash', map: 1, actors: [
    { ch: 'kael4', x: -24, face: 1, script: [[20, 0, 'Flash Step: →→, then →→ again mid-dash'], [2, K | R, '→→'], [4, R], [2, K | R, '→→ again: second step'], [10, 0], [2, U | R, '↑ jump'], [6, R], [2, K | R, 'air Flash Step'], [4, R], [2, K | R, 'and again (2 in the air)'], [60, 0]] },
  ] },
  demon: { id: 'demon', map: 0, actors: [
    { ch: 'val4', x: -12, face: 1, script: [[26, 0, 'Demon Step: a dash with super armor'], [2, K | R, '→→: walk through their attacks'], [18, 0], [2, A, 'Z: hit back'], [10, 0], [2, A], [10, 0], [2, A], [80, 0]] },
    { ch: 'syl1', x: 4, face: -1, script: [[16, 0], ...rep(6, [[2, A], [11, 0]] as Step[]), [80, 0]] },
  ] },
  burst: { id: 'burst', map: 2, actors: [
    { ch: 'shin3', x: -22, face: 1, script: [[20, 0, 'Flame Burst: a short wind-up, then a burst'], [2, K | R, '→→: ignite'], [16, 0], [2, A, 'Z: land the dash attack'], [24, 0], [2, U, '↑ jump'], [8, 0], [2, K | R, '→→ in the air: bursts upwards'], [24, 0], [2, K | L, ''], [70, 0]] },
    { ch: 'ald3', x: 4, face: -1, script: [[220, 0]] },
  ] },
  cancel: { id: 'cancel', map: 3, actors: [
    { ch: 'shin3', x: -8, face: 1, script: [[20, 0, 'Z Z Z…'], [2, A], [3, 0], [2, A], [3, 0], [2, A], [4, 0], [2, K | R, '→→: dash-cancel before the combo ends'], [6, R], [2, A, '…and start it again'], [3, 0], [2, A], [3, 0], [2, A], [4, 0], [2, A], [5, 0], [2, A, 'launcher'], [70, 0]] },
    { ch: 'ald3', x: -3.5, face: -1, dummy: true, script: [[200, 0]] },
  ] },
  aim: { id: 'aim', map: 1, actors: [
    { ch: 'syl1', x: -14, face: 1, script: [[20, 0, 'Aim jump: ↑ then Z Z Z in the air to float'], [2, U, '↑ jump'], [10, 0], [2, A, 'Z'], [11, 0], [2, A, 'Z'], [11, 0], [2, A, 'Z'], [12, D], [2, A | D, '↓ + Z: aim down'], [10, D], [2, U, '↑ double jump'], [6, U], [2, A | U, '↑ + Z: aim up'], [60, 0]] },
    { ch: 'shin2', x: 6, face: -1, dummy: true, script: [[200, 0]] },
  ] },
  backflip: { id: 'backflip', map: 0, actors: [
    { ch: 'syl3', x: -2, face: 1, script: [[30, 0, 'They rush in…'], [2, A | D, '↓ + Z: backflip shot'], [26, 0], [2, A, 'Z Z: keep the distance'], [13, 0], [2, A], [60, 0]] },
    { ch: 'kael4', x: 12, face: -1, script: [[6, 0], [2, K | L], [20, L], [2, A], [80, 0]] },
  ] },
  juggle: { id: 'juggle', map: 3, actors: [
    { ch: 'shin2', x: -8, face: 1, script: [[20, 0, 'Combo into the launcher'], [2, A], [7, 0], [2, A], [8, 0], [2, A], [9, 0], [2, A, 'launch!'], [16, 0], [2, U | R, 'jump after them'], [8, R], [2, A, 'Z in the air'], [22, 0], [2, S1, 'A: finish with a skill'], [70, 0]] },
    { ch: 'syl4', x: -4, face: -1, dummy: true, script: [[220, 0]] },
  ] },
  counter: { id: 'counter', map: 2, actors: [
    { ch: 'ald3', x: 0, face: -1, script: [[42, 0, 'Caught in a combo?'], [2, X, 'C: counter (1 MP bar)'], [24, 0, 'free + invulnerable'], [2, L, ''], [4, 0], [2, A, 'punish'], [7, 0], [2, A], [7, 0], [2, A], [60, 0]] },
    { ch: 'kael4', x: -4, face: 1, script: [[20, 0], [2, A], [5, 0], [2, A], [5, 0], [2, A], [5, 0], [2, A], [5, 0], [2, A], [100, 0]] },
  ] },
  armor: { id: 'armor', map: 0, actors: [
    { ch: 'val4', x: -2, face: 1, script: [[28, 0, 'Super armor (red glow) takes hits without flinching'], [2, A], [10, 0], [2, A], [10, 0], [2, A], [12, 0], [2, A, 'armored finisher'], [40, 0], [2, S1, 'A: armored skill'], [70, 0]] },
    { ch: 'shin3', x: 2.5, face: -1, script: [[40, 0], ...rep(8, [[2, A], [4, 0]] as Step[]), [100, 0]] },
  ] },
  platforms: { id: 'platforms', map: 3, actors: [
    { ch: 'shin4', x: -14, face: 1, script: [[20, 0, 'Triple jump to the top'], [2, U, '↑'], [12, R], [2, U, '↑ again'], [12, R], [2, U, '↑ third jump'], [40, 0], [2, D | U, '↓ + ↑: drop through'], [30, 0], [2, D | U, '↓ + ↑'], [60, 0]] },
  ] },
  nakbup: { id: 'nakbup', map: 0, actors: [
    { ch: 'ald3', x: 0, face: -1, script: [[66, 0, 'Comboed and knocked down…'], ...rep(16, [[2, U, 'Jump the instant you land → break-fall!'], [4, 0]] as Step[]), [60, 0]] },
    { ch: 'kael4', x: -4, face: 1, script: [[20, 0], [2, A], [5, 0], [2, A], [5, 0], [2, A], [5, 0], [2, A, 'launcher → knockdown'], [160, 0]] },
  ] },
};

// ---------- runtime ----------
const off = document.createElement('canvas');
const RND = makeRenderer(off, matchMedia('(pointer: coarse)').matches);
const CW = 960, CH = 540;
RND.setSize(CW, CH);
off.width = CW; off.height = CH;
const CAPS: [string, number][] = [['←', L], ['→', R], ['↑', U | J], ['↓', D], ['Z', A], ['→→', K], ['C', X], ['A', S1], ['S', S2], ['D', S3]];

type Live = { demo: Demo; stage: Stage; fs: any[]; projs: any[]; tick: number; len: number; ctx: CanvasRenderingContext2D; el: HTMLElement; visible: boolean; speed: number; acc: number; label: string; ready: boolean };
const lives: Live[] = [];
const scriptLen = (s: Step[]) => s.reduce((n, [f]) => n + f, 0);
function bitsAt(s: Step[], t: number) {
  for (const [f, b, label] of s) { if (t < f) return { b, label }; t -= f; }
  return { b: 0, label: undefined };
}
function reset(l: Live) {
  l.projs = [];
  l.tick = 0;
  l.fs = l.demo.actors.map((a, i) => Object.assign(newFighter(`a${i}`, a.ch, a.x, a.face, i + 1), { mp: MP_MAX }));
}
async function mount(el: HTMLElement) {
  const demo = DEMOS[el.dataset.demo!];
  if (!demo) return;
  const canvas = el.querySelector('canvas')!;
  canvas.width = CW; canvas.height = CH;
  const stage = new Stage(RND, demo.map);
  stage.resize(CW, CH);
  const l: Live = { demo, stage, fs: [], projs: [], tick: 0, len: Math.max(...demo.actors.map((a) => scriptLen(a.script))), ctx: canvas.getContext('2d')!, el, visible: false, speed: 1, acc: 0, label: '', ready: false };
  reset(l);
  el.querySelector('.cg-keys')!.innerHTML = CAPS.map(([k]) => `<kbd>${k}</kbd>`).join('');
  el.querySelector<HTMLElement>('.cg-speed')!.onclick = (e) => { l.speed = l.speed === 1 ? 0.25 : 1; (e.currentTarget as HTMLElement).textContent = l.speed === 1 ? '🐢 Slow-mo' : '▶️ Normal speed'; };
  el.querySelector<HTMLElement>('.cg-replay')!.onclick = () => reset(l);
  lives.push(l);
  await Promise.all(l.fs.map((f, i) => stage.addFighter(f.id, f.ch, i ? { body: 'other', skin: 0, hair: 'hair-none', shirt: 'shirt-red' } : null, i === 0)));
  l.ready = true;
  io.observe(el);
}
const io = new IntersectionObserver((es) => { for (const e of es) { const l = lives.find((x) => x.el === e.target); if (l) l.visible = e.isIntersecting; } }, { rootMargin: '100px' });

function tick(l: Live) {
  const map = MAPS[l.demo.map];
  if (l.tick >= l.len) reset(l);
  const keys: number[] = [];
  l.demo.actors.forEach((a, i) => {
    const f = l.fs[i];
    const { b, label } = bitsAt(a.script, l.tick);
    keys.push(b);
    if (i === 0 && label !== undefined && label !== l.label) { l.label = label; const c = l.el.querySelector('.cg-cap')!; c.textContent = label; c.classList.remove('go'); void (c as HTMLElement).offsetWidth; c.classList.add('go'); }
    for (const e of step(f, b, map, l.fs)) {
      if (e.proj) l.projs.push(e.proj);
      else if (e === 'slash') for (const { rect, h } of activeHits(f)) if (h.a === f.t) l.stage.swing(rect, f.face, CHARS[f.ch].glow, CHARS[f.ch].moves[f.mv].anim);
      else if (e === 'blink') l.stage.blink(f.x - f.face * blinkDist(f), f.x, f.y, CHARS[f.ch].glow);
      else if (e === 'burst') l.stage.burst(f.x - f.face * 1.2, f.y + 2, '#ff8a2a', 26, 0.35);
      else if (e === 'rocket' || e === 'mushidon' || e === 'shadow' || e === 'guan') l.stage.dust(f.x, f.y);
      else if (e === 'super' || e === 'skill') l.stage.burst(f.x, f.y + 3, CHARS[f.ch].glow, 30, 0.4);
    }
    f.mp = MP_MAX;
  });
  localHits(l.fs, l.projs, map, (a: any, v: any, mv: string, k: number, h: any, dir: number) => {
    v.hp = Math.max(1, v.hp - damage(a.ch, v.ch, h, veilMul(a))); // demos never end
    landedHit(a, h);
    if (h.box && !CHARS[a.ch].moves[mv]?.mp) a.hs = Math.max(a.hs, 3);
    l.stage.hit(v.x, v.y + 2.8, CHARS[a.ch].glow, !!(h.launch || h.down));
    l.stage.flashFighter(v.id);
    applyHit(v, h, dir);
  });
  // keycaps light up with the first actor's buttons
  const kb = l.el.querySelectorAll('.cg-keys kbd');
  CAPS.forEach(([, bit], i) => kb[i].classList.toggle('on', !!(keys[0] & bit)));
  (l.el.querySelector('.cg-bar u') as HTMLElement).style.width = `${(l.tick / l.len) * 100}%`;
  l.tick++;
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const l of lives) {
    if (!l.visible || !l.ready) continue;
    l.acc += dt * 1000 * l.speed;
    while (l.acc >= TICK) { l.acc -= TICK; tick(l); }
    l.stage.update(dt * l.speed, l.fs, l.projs);
    RND.draw(l.stage);
    l.ctx.drawImage(off, 0, 0, CW, CH);
  }
  requestAnimationFrame(frame);
}
for (const el of document.querySelectorAll<HTMLElement>('[data-demo]')) mount(el);
requestAnimationFrame(frame);
