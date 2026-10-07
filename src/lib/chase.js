// Blox Chase: a Grand Chase-style 2D PvP brawler with Roblox-style fighters. Pure rules shared by the browser
// (your own fighter, the CPU, the guide demos), the tests and the Worker (hit checks, damage, HP).
// Fixed 60 Hz ticks, units in studs (a fighter is 5 tall). Each browser simulates its own fighter (zero input lag)
// and reports where it is; the attacker claims a hit, the server checks it against both fighters and applies it.

export const TICK = 1000 / 60;
export const MAX_PLAYERS = 6;
export const MATCH_MS = 180000;
export const MP_MAX = 300; // 3 bars
export const GRAV = 0.034;
export const MAX_FALL = 0.95;
export const JUMP_V = 0.72; // ~7.6 studs high, double jump reaches the upper platforms
export const BODY_W = 1.1; // half width of the hurtbox
export const BODY_H = 5;

export const KEY = { L: 1, R: 2, U: 4, D: 8, J: 16, A: 32, K: 64, S1: 128, S2: 256, S3: 512, X: 1024 };
export const ST = ['idle', 'run', 'jump', 'dash', 'move', 'hit', 'down', 'up', 'dead'];
export const MV = ['', 'z1', 'z2', 'z3', 'z4', 'z5', 'da', 'ja', 'bk', 's1', 's2', 's3', 'ctr', 'gr'];
// like Grand Chase rooms: several people join one room; teams split the room in two (red vs blue)
export const MODES = { duel: { name: '1 vs 1', max: 2 }, team: { name: '2 vs 2', max: 4, teams: true }, team3: { name: '3 vs 3', max: 6, teams: true }, ffa: { name: 'Free for all', max: 6 } };

// ---------- maps: platforms are [left x, top y, width], one-way (jump up through, ↓ + jump to drop) ----------
export const MAPS = [
  { name: 'Crimson Keep', x0: -30, x1: 30, plats: [[-23, 7, 12], [11, 7, 12], [-6, 13.5, 12]], spawns: [-20, 20, -8, 8, -26, 26] },
  { name: 'Sky Isles', x0: -34, x1: 34, plats: [[-31, 6, 10], [-13, 9.5, 8], [5, 9.5, 8], [21, 6, 10], [-5, 17, 10]], spawns: [-24, 24, -9, 9, -30, 30] },
  { name: 'Neon Obby', x0: -28, x1: 28, plats: [[-25, 5.5, 8], [-11, 10.5, 7], [4, 10.5, 7], [17, 5.5, 8], [-3.5, 16.5, 7]], spawns: [-18, 18, -6, 6, -24, 24] },
  { name: 'Frost Temple', x0: -32, x1: 32, plats: [[-28, 7, 10], [18, 7, 10], [-8, 8, 16], [-20, 14.5, 8], [12, 14.5, 8]], spawns: [-22, 22, -4, 4, -28, 28] },
];

// ---------- moves ----------
// melee hit: active frames a..b, damage, box [forward offset, up offset, w, h], knockback [x, y], hitstun, flags L=launch D=knockdown
const H = (a, b, dmg, ox, oy, w, h, kx, ky, stun, fl = '') => ({ a, b, dmg, box: [ox, oy, w, h], kb: [kx, ky], stun, launch: fl.includes('L'), down: fl.includes('D') });
// projectile: spawned at frame `at`, speed [x, y], life, size [w, h], same hit stats. o = spawn offset. P=pierce G=gravity
const P = (at, vx, vy, life, w, h, dmg, kx, ky, stun, kind, fl = '', o) => ({ at, v: [vx, vy], life, size: [w, h], dmg, kb: [kx, ky], stun, kind, o, pierce: fl.includes('P'), grav: fl.includes('G'), launch: fl.includes('L'), down: fl.includes('D') });
// a move: f frames. next/cw = combo chain (press attack from frame cw), cancel = dash-cancel from this frame,
// vx = [[from, to, forward speed]], vy = [[frame, speed]], tele = [frame, distance], inv/armor = [from, to]
const M = (f, o) => ({ f, hit: [], proj: [], ...o });
const multi = (n, from, gap, make) => Array.from({ length: n }, (_, i) => make(from + i * gap, i));
const COUNTER = M(26, { anim: 'cast', mp: 100, inv: [0, 26], air: true, hit: [H(4, 9, 12, -3.5, 0, 7, 5.5, 0.7, 0.4, 24)] });
// Grab (← + → + Z together, like the classic): short reach, slow if it whiffs, throws the enemy over your shoulder
// and knocks them down. It goes through super armor, so it even stops skills. Works in the air (rocket/guan grabs).
const GRAB = M(32, { anim: 'grab', air: true, grab: true, hit: [{ ...H(3, 6, 60, -0.3, 0.5, 2.8, 4, -0.45, 0.75, 30, 'D'), grab: true }] });

// Stats are points (1-10) on HP, ATK, DEF, SPD, MP, RNG and every class has exactly STAT_SUM points.
export const STAT_NAMES = ['HP', 'ATK', 'DEF', 'SPD', 'MP', 'RNG'];
export const STAT_SUM = 33;
export const TIERS = ['', '1st job', '2nd job', '3rd job', '4th job'];

const RAW = {
  // Kael = shadow thief. 3rd job = the Lass Dark Assassin of the classic: big claws, blinks next to you, every attack
  // dash-cancels (Korean dash), Lothus air hooks, Illusion/Vortex steps, a super jump and invisibility.
  kael3: {
    hero: 'Kael', cls: 'Nightblade', tier: 3, col: '#8b5cf6', glow: '#c4b5fd', weapon: 'claws', stats: [4, 6, 3, 9, 6, 5],
    // Dark Assassin of the classic: ONE fast single-step dash (no double ground dash), relentless Korean-dash
    // pressure, and the Air Lock — in the air, mash dash + Z to air-dash through the enemy and juggle (2 air dashes).
    dash: { name: 'Phantom Dash', speed: 1.15, frames: 10, air: 2, inv: [0, 6] }, airJumps: 1, stall: 0, kdash: true, rocket: [0.78, 0.48], jump: 1.22,
    desc: 'Lass-style Dark Assassin: one fast single-step dash, relentless Korean-dash pressure, the Air Lock (air-dash + Z juggle), Lothus hooks, Illusion and Vortex steps and invisibility. Low HP, highest skill ceiling.',
    tricks: ['Korean dash', 'Air Lock', 'Lothus', 'Illusion Step', 'Vortex Step'],
    moves: {
      z1: M(14, { anim: 'claw', vx: [[1, 4, 0.2]], hit: [H(4, 6, 26, 0, 1.4, 3.3, 2.6, 0.12, 0, 16)], next: 'z2', cw: 6, cancel: 5 }),
      z2: M(14, { anim: 'claw2', vx: [[1, 4, 0.2]], hit: [H(4, 6, 26, 0, 1.2, 3.3, 2.6, 0.12, 0, 16)], next: 'z3', cw: 6, cancel: 5 }),
      z3: M(18, { anim: 'spin', hit: [H(3, 5, 18, -0.5, 1, 4, 3.2, 0.1, 0, 16), H(8, 10, 18, -0.5, 1, 4, 3.2, 0.12, 0, 16)], next: 'z4', cw: 10, cancel: 6 }),
      z4: M(26, { anim: 'upper', hit: [H(6, 9, 44, 0, 0.5, 3.4, 4.6, 0.2, 0.66, 30, 'L')], cancel: 10 }),
      // DA dash attack: two quick claws then a backflip kick that launches — the long-reaching opener into infinites.
      da: M(24, { anim: 'thrust', vx: [[0, 5, 0.5]], hit: [H(2, 5, 22, 0, 1.3, 3.2, 2.6, 0.12, 0, 15), H(7, 10, 22, 0, 1.3, 3.2, 2.6, 0.12, 0, 15), H(13, 17, 42, 0, 0.4, 3.4, 4.8, 0.5, 0.55, 26, 'L')], cancel: 5 }),
      // Lothus: rocket, then Z + → , Z + → … each air slash dashes forward and HOOKS the enemy, carrying them with you;
      // every hook that lands gives the air slash back, so you keep flying (5-12 hits). ← + Z turns and throws them back.
      ja: M(14, { anim: 'claw', air: true, airChain: 4, turn: true, landEnd: true, grav: 0.15, vx: [[0, 9, 0.72]], vy: [[0, 0.1]], hit: [{ ...H(1, 9, 22, -0.5, 0.2, 3.8, 4.2, 0.72, 0.1, 22), carry: true }], next: 'ja', cw: 6, cancel: 6 }),
      // like the classic: vanish (smoke bomb) and stay almost invisible for 8 s; the next attack hits 30% harder
      s1: M(24, { anim: 'cast', mp: 100, air: true, veil: 480, inv: [0, 12], hit: [H(4, 8, 12, -2.6, 0, 5.2, 5, 0.45, 0.35, 20)], cut: 'Phantom Veil' }),
      // a supersonic flurry ahead, then through the enemy to cut them from behind
      s2: M(46, { anim: 'claw', mp: 200, inv: [0, 26], vx: [[2, 18, 0.1]], tele: [22, 5], hit: [...multi(5, 4, 3, (a) => H(a, a + 1, 24, 0, 0.4, 3.6, 4, 0.03, 0.05, 22)), ...multi(3, 26, 4, (a) => H(a, a + 2, 24, -4.6, 0.4, 3.6, 4, -0.05, 0.05, 22)), H(40, 43, 48, -4.6, 0, 4, 5, -0.4, 0.6, 30, 'L')], cut: 'Supersonic Flurry' }),
      // one gigantic gash across most of the arena
      s3: M(62, { anim: 'slash', mp: 300, inv: [0, 34], hit: [H(26, 32, 130, -24, 0, 48, 8, 0.2, 0.7, 30, 'L'), H(42, 48, 200, -24, 0, 48, 9, 0.5, 0.7, 34, 'D')], cut: 'Dimension Rift' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Kael 4th job (the Lass Striker of the classic): a long nodachi, air dashes twice, heavy hitting thunder.
  kael4: {
    hero: 'Kael', cls: 'Stormfang', tier: 4, col: '#0ea5e9', glow: '#7dd3fc', weapon: 'nodachi', stats: [5, 7, 4, 7, 5, 5],
    dash: { name: 'Flash Step', speed: 0.95, frames: 8, air: 2, inv: [0, 4], chain: 2 }, airJumps: 1, stall: 0, kdash: true, rocket: [0.72, 0.5],
    desc: 'Air-dashes twice and dives from the sky with thunder. A real air-combo monster.',
    tricks: ['Double air dash', 'Dash-cancel combos', 'Juggle'],
    moves: {
      z1: M(15, { anim: 'slash', hit: [H(4, 6, 30, 0, 1.2, 3.3, 3, 0.12, 0, 16)], next: 'z2', cw: 7, cancel: 6 }),
      z2: M(15, { anim: 'sweep', hit: [H(4, 6, 30, 0, 1.2, 3.3, 3, 0.12, 0, 16)], next: 'z3', cw: 7, cancel: 6 }),
      z3: M(18, { anim: 'flipkick', hit: [H(3, 5, 22, 0, 1, 3.5, 3, 0.1, 0, 16), H(8, 10, 22, 0, 1, 3.5, 3, 0.12, 0, 16)], next: 'z4', cw: 10, cancel: 7 }),
      z4: M(28, { anim: 'upper', hit: [H(6, 10, 50, 0, 0.5, 3.6, 5, 0.25, 0.7, 30, 'L')], cancel: 12 }),
      da: M(20, { anim: 'thrust', vx: [[0, 12, 0.55]], hit: [H(2, 11, 34, 0, 1, 3.2, 3, 0.4, 0.25, 18)], cancel: 6 }),
      ja: M(22, { anim: 'dive', air: true, vy: [[2, -0.6]], vx: [[2, 22, 0.35]], hit: [H(2, 20, 34, -0.5, -0.5, 3.4, 4, 0.25, 0.35, 18)], landEnd: true }),
      s1: M(30, { anim: 'shoot', mp: 100, air: true, proj: [P(8, 0.9, 0, 44, 2.2, 2.2, 110, 0.35, 0.45, 26, 'chakram', 'PL')], cut: 'Chakram Storm' }),
      s2: M(40, { anim: 'dive', mp: 200, air: true, vy: [[0, 0.55], [14, -0.9]], vx: [[14, 34, 0.5]], hit: [H(14, 34, 90, -1, -1, 5, 5, 0.3, 0.5, 26, 'L'), H(36, 40, 110, -4, -0.5, 9, 4, 0.5, 0.55, 30, 'D')], landEnd: true, cut: 'Thunder Dive' }),
      s3: M(62, { anim: 'spin', mp: 300, armor: [0, 62], hit: [...multi(6, 6, 7, (a) => H(a, a + 3, 46, -5, 0, 10, 6, 0.06, 0.1, 22)), H(50, 54, 120, -5, 0, 10, 6, 0.55, 0.6, 30, 'D')], cut: 'Storm Cyclone' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Valdren = the immortal greatsword (Sieghart-style 4th job): super armor, slow, enormous damage.
  val4: {
    hero: 'Valdren', cls: 'Eternal', tier: 4, col: '#ef4444', glow: '#fca5a5', weapon: 'greatsword', stats: [8, 8, 7, 3, 4, 3],
    dash: { name: 'Demon Step', speed: 0.62, frames: 18, air: 0, armor: true }, airJumps: 1, stall: 0, kdash: false,
    desc: 'Super armor on finishers and skills: he walks through your combo and hits back twice as hard.',
    tricks: ['Super armor trade', 'Counter', 'Knockdown pressure'],
    moves: {
      z1: M(20, { anim: 'slash', hit: [H(6, 9, 32, 0, 0.8, 4.6, 4, 0.15, 0, 20)], next: 'z2', cw: 11 }),
      z2: M(22, { anim: 'sweep', hit: [H(7, 10, 34, -0.5, 0.8, 5.1, 3.2, 0.15, 0, 20)], next: 'z3', cw: 11 }),
      z3: M(24, { anim: 'spin', hit: [H(7, 11, 40, -1.5, 0.5, 6, 4, 0.2, 0, 22)], next: 'z4', cw: 13 }),
      z4: M(36, { anim: 'slam', armor: [0, 20], hit: [H(14, 18, 66, 0, 0, 5, 4.6, 0.45, 0.5, 30, 'D')] }),
      da: M(24, { anim: 'thrust', armor: [0, 14], vx: [[0, 14, 0.5]], hit: [H(2, 13, 44, 0, 0.6, 3.2, 4, 0.55, 0.3, 22)], cancel: 18 }),
      ja: M(24, { anim: 'slam', air: true, vy: [[4, -0.5]], hit: [H(5, 22, 46, -0.5, -1, 4.6, 5, 0.3, 0.4, 20)], landEnd: true }),
      s1: M(38, { anim: 'slam', mp: 100, armor: [0, 38], hit: [H(14, 19, 125, 0, 0, 6, 6, 0.4, 0.8, 30, 'L')], cut: 'Rage Cleave' }),
      s2: M(40, { anim: 'slam', mp: 200, armor: [0, 40], hit: [H(14, 18, 80, 0, 0, 5, 4, 0.3, 0.6, 26, 'L')], proj: [P(16, 0.7, 0, 46, 1.6, 4, 150, 0.45, 0.65, 30, 'wave', 'PD', [2.5, 2])], cut: 'Earth Sunder' }),
      s3: M(66, { anim: 'slam', mp: 300, inv: [0, 30], armor: [30, 66], vy: [[4, 0.6]], hit: [H(30, 34, 120, -2, 0, 9, 7, 0.2, 0.7, 30, 'L'), H(44, 50, 230, -4, 0, 13, 9, 0.6, 0.65, 34, 'D')], cut: 'Blade of Eternity' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Shin = martial artist (Jin-style). 2nd job: the long staff.
  shin2: {
    hero: 'Shin', cls: 'Staff Monk', tier: 2, col: '#f59e0b', glow: '#fde68a', weapon: 'staff', stats: [6, 5, 6, 6, 5, 5],
    dash: { name: 'Staff Glide', speed: 0.62, frames: 13, air: 1 }, airJumps: 1, stall: 0, kdash: false,
    desc: 'The longest melee reach in the game. Pokes from afar and vaults over enemies.',
    tricks: ['Spacing with reach', 'Staff vault escape', 'Juggle'],
    moves: {
      z1: M(16, { anim: 'thrust', hit: [H(5, 8, 28, 0, 1.4, 4.6, 2.4, 0.15, 0, 16)], next: 'z2', cw: 8 }),
      z2: M(18, { anim: 'pole', hit: [H(5, 9, 30, -1.5, 0.8, 6.2, 3.4, 0.15, 0, 16)], next: 'z3', cw: 9 }),
      z3: M(18, { anim: 'sweep', hit: [H(5, 8, 32, 0, 0, 4.8, 2.6, 0.15, 0.2, 18)], next: 'z4', cw: 10, cancel: 9 }),
      z4: M(28, { anim: 'upper', hit: [H(7, 11, 52, 0, 0, 4.6, 5.5, 0.25, 0.72, 30, 'L')] }),
      da: M(20, { anim: 'thrust', vx: [[0, 12, 0.48]], hit: [H(3, 11, 34, 0, 1.2, 5, 2.6, 0.4, 0.25, 18)], cancel: 10 }),
      ja: M(20, { anim: 'spin', air: true, hit: [H(3, 13, 30, -2, 0, 6, 5, 0.18, 0.3, 16)] }),
      s1: M(32, { anim: 'kick', mp: 100, air: true, vy: [[4, 0.75]], vx: [[4, 22, 0.42]], hit: [H(10, 22, 110, 0, 0, 3.6, 5, 0.3, 0.7, 30, 'L')], cut: 'Staff Vault' }),
      s2: M(48, { anim: 'spin', mp: 200, armor: [0, 30], hit: [...multi(5, 6, 7, (a) => H(a, a + 3, 46, -3.5, 0, 7, 5.5, 0.08, 0.12, 22)), H(42, 46, 50, -3.5, 0, 7, 5.5, 0.5, 0.5, 28, 'D')], cut: 'Whirlwind Staff' }),
      s3: M(66, { anim: 'thrust', mp: 300, inv: [0, 50], vx: [[4, 40, 0.18]], hit: [...multi(8, 6, 5, (a) => H(a, a + 2, 32, 0, 0.6, 5, 4, 0.06, 0.08, 22)), H(52, 56, 130, 0, 0, 5.5, 5, 0.6, 0.6, 30, 'D')], cut: 'Thousand Strikes' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Shin 3rd job: burning fists, 5-hit combo.
  shin3: {
    hero: 'Shin', cls: 'Flame Fist', tier: 3, col: '#f97316', glow: '#fdba74', weapon: 'gauntlets', stats: [6, 7, 5, 7, 5, 3],
    dash: { name: 'Flame Burst', speed: 1.0, frames: 13, air: 1, wind: 3, up: 0.2 }, airJumps: 1, stall: 0, kdash: true,
    desc: 'Short reach, fastest hands. Five-hit combos, burning palm and a flaming uppercut.',
    tricks: ['5-hit combo', 'Korean dash', 'Rising dragon juggle'],
    moves: {
      z1: M(12, { anim: 'punch', hit: [H(3, 5, 20, 0, 1.6, 2.8, 2.6, 0.1, 0, 15)], next: 'z2', cw: 5, cancel: 4 }),
      z2: M(12, { anim: 'punch2', hit: [H(3, 5, 20, 0, 1.6, 2.8, 2.6, 0.1, 0, 15)], next: 'z3', cw: 5, cancel: 4 }),
      z3: M(14, { anim: 'kick', hit: [H(4, 6, 24, 0, 0.6, 3, 3, 0.12, 0, 16)], next: 'z4', cw: 6, cancel: 5 }),
      z4: M(14, { anim: 'punch', hit: [H(4, 6, 26, 0, 1.4, 3, 2.8, 0.12, 0, 16)], next: 'z5', cw: 7, cancel: 5 }),
      z5: M(26, { anim: 'upper', hit: [H(5, 9, 46, 0, 0.4, 3, 5, 0.2, 0.75, 30, 'L')], cancel: 10 }),
      da: M(18, { anim: 'kick', vx: [[0, 10, 0.55]], hit: [H(2, 9, 30, 0, 1, 2.8, 3, 0.4, 0.3, 18)], cancel: 4 }),
      ja: M(18, { anim: 'kick', air: true, vy: [[2, -0.45]], hit: [H(2, 16, 30, -0.3, -0.5, 3, 4, 0.25, 0.3, 16)], landEnd: true }),
      s1: M(32, { anim: 'upper', mp: 100, vy: [[6, 0.8]], vx: [[6, 18, 0.2]], hit: [H(6, 10, 55, 0, 0, 3.2, 6, 0.1, 0.8, 26, 'L'), H(14, 20, 60, 0, 0.5, 3.2, 6, 0.2, 0.75, 30, 'L')], cut: 'Rising Dragon' }),
      s2: M(34, { anim: 'cast', mp: 200, proj: [P(12, 0.62, 0, 42, 3.2, 3.2, 175, 0.55, 0.55, 30, 'fire', 'PD')], cut: 'Burning Palm' }),
      s3: M(70, { anim: 'punch', mp: 300, inv: [0, 54], vx: [[4, 50, 0.16]], hit: [...multi(10, 6, 4, (a) => H(a, a + 2, 25, 0, 0.8, 3.6, 3.6, 0.05, 0.05, 22)), H(54, 58, 140, 0, 0, 4.2, 5.5, 0.6, 0.7, 30, 'D')], cut: 'Inferno Barrage' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Shin 4th job: spirit energy, mid-range waves and a mirror step.
  shin4: {
    hero: 'Shin', cls: 'Spirit Master', tier: 4, col: '#10b981', glow: '#6ee7b7', weapon: 'spirit', stats: [5, 6, 5, 6, 7, 4],
    dash: { name: 'Spirit Step', blink: 6, frames: 11, air: 1, inv: [0, 6] }, airJumps: 2, stall: 0, kdash: false,
    desc: 'Fills MP the fastest. Lives off skills: spirit waves, mirror step and the Heaven Burst.',
    tricks: ['MP management', 'Mirror step', 'Triple jump'],
    moves: {
      z1: M(16, { anim: 'palm', hit: [H(4, 7, 28, 0, 1.2, 3.8, 3, 0.14, 0, 16)], next: 'z2', cw: 7 }),
      z2: M(16, { anim: 'palm2', hit: [H(4, 7, 28, 0, 1.2, 3.8, 3, 0.14, 0, 16)], next: 'z3', cw: 7 }),
      z3: M(20, { anim: 'cast', hit: [H(5, 8, 34, 0, 0.8, 4.4, 3.6, 0.18, 0, 18)], next: 'z4', cw: 11, cancel: 10 }),
      z4: M(28, { anim: 'upper', hit: [H(7, 10, 50, 0, 0.3, 4, 5, 0.25, 0.72, 30, 'L')] }),
      da: M(20, { anim: 'thrust', vx: [[0, 11, 0.5]], hit: [H(2, 10, 32, 0, 1, 3.4, 3, 0.4, 0.25, 18)], cancel: 9 }),
      ja: M(20, { anim: 'cast', air: true, proj: [P(5, 0.7, -0.5, 30, 1.6, 1.6, 30, 0.2, 0.3, 16, 'orb')] }),
      s1: M(30, { anim: 'cast', mp: 100, air: true, proj: [P(9, 0.55, 0, 60, 2.6, 3.6, 110, 0.3, 0.5, 26, 'orb', 'P')], cut: 'Spirit Wave' }),
      s2: M(30, { anim: 'thrust', mp: 200, inv: [0, 18], tele: [6, 11], hit: [H(6, 9, 80, -11.5, 0, 12, 5, 0.25, 0.6, 30, 'L'), H(14, 18, 90, 0, 0, 4, 5, 0.35, 0.7, 30, 'L')], cut: 'Mirror Step' }),
      s3: M(64, { anim: 'cast', mp: 300, armor: [0, 64], hit: [H(16, 20, 100, -7, 0, 14, 8, 0.15, 0.6, 30, 'L'), H(30, 34, 100, -7, 0, 14, 9, 0.15, 0.6, 30, 'L'), H(46, 52, 150, -8, 0, 16, 10, 0.6, 0.7, 34, 'D')], cut: 'Heaven Burst' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Sylra = the elf archer (Lire-style). 1st job: aim up/down in the air, stall in the air by shooting.
  syl1: {
    hero: 'Sylra', cls: 'Archer', tier: 1, col: '#22c55e', glow: '#86efac', weapon: 'bow', stats: [4, 5, 3, 6, 6, 9],
    dash: { name: 'Elf Step', speed: 0.62, frames: 12, air: 1 }, airJumps: 1, stall: 3, kdash: false, ranged: true,
    desc: 'Keeps you away with arrows. Shoot in the air to float, hold ↑/↓ to aim, ↓+Z to backflip-shoot.',
    tricks: ['Aim jump (air stall)', 'Backflip shot', 'Aim up / down'],
    moves: {
      z1: M(15, { anim: 'shoot', air: true, aim: true, stall: true, proj: [P(4, 1.15, 0, 34, 1.6, 0.5, 25, 0.06, 0, 7, 'arrow')], next: 'z1', cw: 12, cancel: 8 }),
      bk: M(24, { anim: 'flip', vx: [[0, 16, -0.42]], vy: [[0, 0.42]], proj: [P(8, 1.15, 0, 34, 1.6, 0.5, 34, 0.18, 0.1, 16, 'arrow')], landEnd: true }),
      da: M(22, { anim: 'shoot', vx: [[0, 14, 0.4]], hit: [H(0, 8, 22, 0, 0, 2.6, 2, 0.15, 0.4, 18, 'L')], proj: [P(10, 1.15, 0, 34, 1.6, 0.5, 30, 0.15, 0, 14, 'arrow')], cancel: 14 }),
      s1: M(28, { anim: 'shoot', mp: 100, air: true, aim: true, proj: [0.3, 0.15, 0, -0.15, -0.3].map((vy) => P(8, 1.1, vy, 34, 1.6, 0.6, 32, 0.25, 0.25, 22, 'arrow')), cut: 'Multi Shot' }),
      s2: M(40, { anim: 'cast', mp: 200, proj: multi(6, 14, 3, (at, i) => P(at, 0, -1.0, 24, 1, 2, 42, 0.2, 0.4, 24, 'rain', 'P', [5 + i * 2.2, 22])), cut: 'Arrow Rain' }),
      s3: M(44, { anim: 'shoot', mp: 300, air: true, armor: [0, 20], proj: [P(16, 1.25, 0, 44, 4, 3, 270, 0.6, 0.6, 34, 'storm', 'PD')], cut: 'Storm Arrow' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Sylra 3rd job: two bows, triple jump, double arrows.
  syl3: {
    hero: 'Sylra', cls: 'Twin Bow', tier: 3, col: '#14b8a6', glow: '#5eead4', weapon: 'twinbow', stats: [4, 5, 4, 8, 5, 7],
    dash: { name: 'Wind Step', speed: 0.72, frames: 10, air: 1, chain: 2 }, airJumps: 2, stall: 4, kdash: false, ranged: true,
    desc: 'Triple jump and double arrows. Floats over the fight and rains arrows from above.',
    tricks: ['Aim jump (air stall)', 'Triple jump', 'Backflip shot'],
    moves: {
      z1: M(16, { anim: 'shoot', air: true, aim: true, stall: true, proj: [P(3, 1.15, 0, 30, 1.5, 0.5, 13, 0.05, 0, 5, 'arrow'), P(8, 1.15, 0, 30, 1.5, 0.5, 13, 0.05, 0, 5, 'arrow')], next: 'z1', cw: 14, cancel: 9 }),
      bk: M(24, { anim: 'flip', vx: [[0, 16, -0.45]], vy: [[0, 0.45]], proj: [P(6, 1.15, 0, 30, 1.5, 0.5, 20, 0.15, 0.1, 16, 'arrow'), P(10, 1.15, -0.2, 30, 1.5, 0.5, 20, 0.15, 0.1, 16, 'arrow')], landEnd: true }),
      da: M(20, { anim: 'kick', vx: [[0, 12, 0.5]], hit: [H(2, 10, 32, 0, 0.5, 3, 3.5, 0.35, 0.45, 18, 'L')], cancel: 10 }),
      s1: M(30, { anim: 'shoot', mp: 100, air: true, aim: true, proj: multi(6, 6, 3, (at, i) => P(at, 1.2, (i % 3 - 1) * 0.08, 30, 1.6, 0.5, 20, 0.15, 0.15, 20, 'arrow')), cut: 'Twin Volley' }),
      s2: M(40, { anim: 'kick', mp: 200, vy: [[4, 0.55]], hit: [H(6, 10, 60, -1, 0, 4, 5, 0.15, 0.6, 26, 'L'), H(14, 18, 60, -1, 0, 4, 5, 0.3, 0.6, 28, 'L')], proj: [P(24, 1.0, -0.45, 30, 1.6, 0.6, 50, 0.3, 0.3, 24, 'arrow', 'P'), P(28, 1.0, -0.3, 30, 1.6, 0.6, 50, 0.3, 0.3, 24, 'arrow', 'P')], cut: 'Gale Kick' }),
      s3: M(60, { anim: 'cast', mp: 300, inv: [0, 20], vy: [[0, 0.7]], grav: 0.25, air: true, proj: multi(12, 18, 2, (at, i) => P(at, 0.75 + (i % 3) * 0.12, -0.7, 34, 1.4, 1.4, 25, 0.12, 0.2, 22, 'arrow', '', [1, 6])), cut: 'Hundred Arrows' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Sylra 4th job: a heavy arc cannon, piercing bolts and the beam.
  syl4: {
    hero: 'Sylra', cls: 'Arc Cannon', tier: 4, col: '#06b6d4', glow: '#a5f3fc', weapon: 'cannon', stats: [5, 7, 4, 5, 4, 8],
    dash: { name: 'Recoil Burst', speed: 0.85, frames: 11, air: 1, wind: 2, up: 0.12 }, airJumps: 1, stall: 2, kdash: false, ranged: true,
    desc: 'Slow but every bolt pierces. Scatter blast up close, a screen-wide beam for the finish.',
    tricks: ['Aim jump (air stall)', 'Pierce lines', 'Scatter close-up'],
    moves: {
      z1: M(22, { anim: 'shoot', air: true, aim: true, stall: true, proj: [P(6, 1.3, 0, 32, 2.2, 0.8, 44, 0.1, 0.1, 9, 'bolt', 'P')], next: 'z1', cw: 17, cancel: 12 }),
      bk: M(26, { anim: 'flip', vx: [[0, 16, -0.45]], vy: [[0, 0.42]], proj: [P(8, 1.3, 0, 32, 2.2, 0.8, 44, 0.25, 0.15, 18, 'bolt', 'P')], landEnd: true }),
      da: M(22, { anim: 'shoot', vx: [[0, 12, 0.45]], proj: [P(10, 1.3, 0, 32, 2.2, 0.8, 44, 0.3, 0.1, 18, 'bolt', 'P')], cancel: 14 }),
      s1: M(36, { anim: 'shoot', mp: 100, air: true, aim: true, proj: [P(18, 1.5, 0, 34, 3, 1.4, 120, 0.4, 0.7, 30, 'bolt', 'PL')], cut: 'Charged Bolt' }),
      s2: M(30, { anim: 'shoot', mp: 200, vx: [[8, 20, -0.4]], proj: [-0.3, -0.15, 0, 0.15, 0.3].map((vy) => P(8, 0.9, vy, 12, 1.4, 1.4, 52, 0.55, 0.45, 26, 'orb', 'D')), cut: 'Scatter Blast' }),
      s3: M(70, { anim: 'shoot', mp: 300, armor: [0, 70], hit: [...multi(6, 20, 6, (a) => H(a, a + 2, 44, 1, 1.6, 36, 2.6, 0.06, 0.05, 22)), H(58, 62, 110, 1, 1.2, 36, 3.4, 0.6, 0.6, 30, 'D')], cut: 'Arc Beam' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
  // Aldric = the rune knight (Ronan-style 3rd job): sword combos plus rune magic.
  ald3: {
    hero: 'Aldric', cls: 'Runeblade', tier: 3, col: '#3b82f6', glow: '#93c5fd', weapon: 'runesword', stats: [6, 6, 6, 5, 7, 3],
    dash: { name: 'Rune Step', speed: 0.62, frames: 13, air: 1, inv: [0, 3] }, airJumps: 1, stall: 0, kdash: false,
    desc: 'All-rounder: solid sword combos, a rune bolt for range and a barrier to escape pressure.',
    tricks: ['Barrier escape', 'Counter', 'Rune zoning'],
    moves: {
      z1: M(16, { anim: 'slash', hit: [H(4, 7, 30, 0, 1, 3.8, 3.4, 0.14, 0, 16)], next: 'z2', cw: 8 }),
      z2: M(16, { anim: 'slash2', hit: [H(4, 7, 30, 0, 1, 3.8, 3.4, 0.14, 0, 16)], next: 'z3', cw: 8 }),
      z3: M(20, { anim: 'thrust', hit: [H(5, 9, 34, 0, 1.2, 4.2, 2.8, 0.18, 0, 18)], next: 'z4', cw: 11, cancel: 10 }),
      z4: M(28, { anim: 'upper', hit: [H(7, 10, 52, 0, 0.4, 4, 5, 0.25, 0.72, 30, 'L')] }),
      da: M(20, { anim: 'thrust', vx: [[0, 12, 0.5]], hit: [H(2, 11, 32, 0, 1, 3.6, 3, 0.4, 0.25, 18)], cancel: 10 }),
      ja: M(20, { anim: 'slash', air: true, hit: [H(3, 12, 32, -0.5, -0.2, 4.2, 4.6, 0.18, 0.3, 16)] }),
      s1: M(30, { anim: 'cast', mp: 100, air: true, proj: [P(10, 0.85, 0, 44, 2, 2, 115, 0.35, 0.55, 28, 'rune', 'L')], cut: 'Rune Bolt' }),
      s2: M(36, { anim: 'cast', mp: 200, inv: [0, 30], hit: [H(6, 10, 70, -4.8, 0, 9.6, 6, 0.55, 0.5, 30, 'L'), H(20, 24, 80, -5.5, 0, 11, 7, 0.65, 0.55, 30, 'D')], cut: 'Rune Barrier' }),
      s3: M(56, { anim: 'cast', mp: 300, armor: [0, 56], hit: [H(14, 18, 110, 2.5, 0, 4, 12, 0.15, 0.7, 30, 'L'), H(24, 28, 110, 7, 0, 4, 12, 0.15, 0.7, 30, 'L'), H(34, 40, 150, 11.5, 0, 5, 14, 0.5, 0.7, 34, 'D')], cut: 'Rune Judgment' }),
      ctr: COUNTER,
      gr: GRAB,
    },
  },
};

const derive = (s) => ({ hp: 700 + s[0] * 50, atk: 0.8 + s[1] * 0.04, def: 1.16 - s[2] * 0.032, run: 0.2 + s[3] * 0.013, mpRegen: 0.1 + s[4] * 0.028 });
export const CHARS = Object.fromEntries(Object.entries(RAW).map(([id, c]) => [id, { id, name: `${c.hero} · ${c.cls}`, ...c, ...derive(c.stats) }]));
export const CHAR_IDS = Object.keys(CHARS);
export const hitsOf = (m) => [...m.hit, ...m.proj];
// how far a 'blink' event teleported (a teleport dash, or a move like Phantom Cut)
export const blinkDist = (f) => (f.st === 'move' ? CHARS[f.ch].moves[f.mv]?.tele?.[1] : CHARS[f.ch].dash.blink) ?? 9;

// ---------- fighters ----------
export function newFighter(id, ch, x = 0, face = 1, team = 0) {
  return { id, ch, team, x, y: 0, vx: 0, vy: 0, face, st: 'idle', t: 0, mv: '', g: true, aj: 0, ad: 0, sl: 0, mp: 0, hp: CHARS[ch].hp, combo: 0, stun: 0, fall: false,
    pin: 0, buf: 0, bufT: -99, tapD: 0, tapT: -99, clk: 0, mi: 0, hs: 0, aim: 0, am: false, drop: 0, veil: 0, vbuf: false, vmi: null, ill: false, zh: 0, crouch: false, spr: false, rk: false, rkT: -99, sh: 0, shd: false, guan: 0, boost: false, mushi: false, dc: 0 };
}
const moveOf = (f) => (f.st === 'move' ? CHARS[f.ch].moves[f.mv] : null);
const inWin = (w, t) => w && t >= w[0] && t <= w[1];
// Every class has its own base dash (Phantom Blink teleports, Flash Step chains, Demon Step has super armor, Flame Burst
// winds up…). On top of it, the classic movement techs work for everyone, made of arrow combinations:
//   Rocket   →→↑      dash, then up: a low diagonal jump that keeps the dash speed (opposite arrow = Break Rocket)
//   Shadow   →→↑ ↓    rocket, then down: dive back to the floor without losing speed; ↑ on landing rockets again (chain)
//   Mushidon →→↑↓     up and down almost together: the rocket stays on the floor as a much longer dash
//   Guan     ↑ →→ ↓   air dash, then down: a diagonal dive to the floor
//   Front / Back Spell: a skill straight out of any dash, rocket or shadow (hold the other arrow to cast backwards)
//   Bleach   combo → skill: skills cancel a basic attack once its hits are out
//   OttoShot ↓ + Z on a platform: drop through it attacking
//   Aim Guan (archers) rocket + Z Z Z: the shots lock straight and hold you in the air
export const ROCKET_V = 0.72, ROCKET_VX = 0.52; // a high, steep diagonal hop (not a long glide)
export const isInv = (f) => f.st === 'down' || f.st === 'up' || f.st === 'dead' || (f.ill && (f.rk || f.shd)) || (f.st === 'dash' && !f.mushi && inWin(CHARS[f.ch].dash.inv, f.t)) || inWin(moveOf(f)?.inv, f.t);
export const hasArmor = (f) => (f.st === 'dash' && !!CHARS[f.ch].dash.armor) || inWin(moveOf(f)?.armor, f.t);
const clampX = (map, x) => Math.max(map.x0 + BODY_W, Math.min(map.x1 - BODY_W, x));
const rocketSpeed = (c) => Math.max(c.dash.speed ?? 0, 0.64);
// skills can cancel a basic attack once its last hit (or shot) is out
const skillFrame = (m) => Math.max(...m.hit.map((h) => h.b), ...m.proj.map((p) => p.at)) + 1;

function startMove(f, key, inp, dir = 0) {
  const c = CHARS[f.ch], m = c.moves[key];
  if (!m || (!f.g && !m.air && key !== 'ctr') || (m.mp && f.mp < m.mp) || (m.airChain && !f.g && f.sl >= m.airChain)) return false;
  if (m.mp) f.mp -= m.mp;
  Object.assign(f, { st: 'move', mv: key, t: 0, mi: f.mi + 1, am: !f.g, buf: 0, fall: false, boost: false, face: dir || f.face });
  f.aim = m.aim ? (inp & KEY.U ? 1 : inp & KEY.D && !f.g ? -1 : 0) : 0;
  if (m.airChain && !f.g) f.sl++;
  if (m.veil) { f.veil = m.veil; f.vbuf = true; f.vmi = null; }
  if (m.stall && !f.g) {
    if ((f.rk || f.guan) && f.guan < 6) { f.guan++; f.vy = 0; f.aim = 0; } // Aim Guan: straight shots, hold the height
    else if (f.sl < c.stall) { f.vy = Math.max(f.vy, 0.16); f.sl++; } // aim jump: every air shot floats you a bit
  }
  if (key === 'ctr') { f.combo = 0; f.vx = -f.face * 0.25; f.vy = Math.max(f.vy, 0.2); }
  return true;
}
function startDash(f, dir) {
  const d = CHARS[f.ch].dash;
  if (!f.g && f.ad >= d.air) return false;
  if (!f.g) f.ad++;
  Object.assign(f, { st: 'dash', t: 0, mv: '', face: dir || f.face, buf: 0, dc: 1, mushi: false });
  return true;
}
function rocket(f, dir, c, ev, inp = 0) {
  dir ||= f.tapD; // holding ← while tapping →→: go where you tapped
  f.ill = (inp & (KEY.L | KEY.R)) === (KEY.L | KEY.R); // Illusion Step: invulnerable rocket/shadow
  const [rvx, rvy] = c.rocket ?? [ROCKET_VX, ROCKET_V]; // Lass-style classes: a fast, low ~30° rocket
  Object.assign(f, { st: 'jump', t: 0, face: dir || f.face, vy: rvy, g: false, rk: true, rkT: f.clk, sh: 0, mushi: false });
  f.vx = f.face * rvx;
  ev.push('rocket');
}

// One 60 Hz tick of one fighter. Returns events: strings for sounds/effects, { proj } for spawned projectiles.
export function step(f, inp, map, foes = []) {
  const ev = [];
  const c = CHARS[f.ch];
  f.clk++;
  if (f.hs > 0) { f.hs--; return ev; } // hit-stop: frozen for a few frames (inputs keep buffering)
  const press = inp & ~f.pin, rel = f.pin & ~inp;
  f.pin = inp;
  if (press & (KEY.A | KEY.K | KEY.J | KEY.U | KEY.S1 | KEY.S2 | KEY.S3 | KEY.X)) { f.buf = press; f.bufT = f.clk; }
  const buffered = (bit) => (press & bit) || ((f.buf & bit) && f.clk - f.bufT <= 7);
  const dir = (inp & KEY.R ? 1 : 0) - (inp & KEY.L ? 1 : 0);
  const up = press & (KEY.J | KEY.U);
  let dashReq = !!(press & KEY.K);
  for (const [bit, d] of [[KEY.L, -1], [KEY.R, 1]]) if (press & bit) { if (f.tapD === d && f.clk - f.tapT <= 14) dashReq = true; f.tapD = d; f.tapT = f.clk; }
  const sk = buffered(KEY.S3) ? 's3' : buffered(KEY.S2) ? 's2' : buffered(KEY.S1) ? 's1' : '';
  const cast = () => { if (sk && startMove(f, sk, inp, dir)) { ev.push(sk === 's3' ? 'super' : 'skill'); return true; } return false; };
  const both = (inp & (KEY.L | KEY.R)) === (KEY.L | KEY.R);
  // grab like the classic: toward an enemy you are touching + Z (or ← + → + Z on the floor)
  const grabReq = !!(press & KEY.A) && ((both && f.g) || (dir !== 0 && grabTarget(f, foes, dir)));
  f.t++;
  if (f.drop > 0) f.drop--;
  if (f.veil > 0) f.veil--;
  if (f.st !== 'dead') f.mp = Math.min(MP_MAX, f.mp + c.mpRegen);
  let grav = 1;

  if (f.st === 'idle' || f.st === 'run' || f.st === 'jump') {
    if (dir) f.face = dir;
    const onPlat = f.g && f.y > 0.01;
    const lvl = chargeLevel(f);
    if (rel & KEY.A && lvl) { f.zh = 0; if (startMove(f, `s${lvl}`, inp)) ev.push(lvl === 3 ? 'super' : 'skill'); } // classic: hold Z, release = skill
    else if (cast()) {}
    else if (grabReq && startMove(f, 'gr', inp)) ev.push('swing');
    else if (f.st === 'jump' && f.rk && both && press & KEY.A && c.moves.ja && startMove(f, 'ja', inp, -f.face)) ev.push('vortex'); // Vortex Step: strike behind
    else if (f.st === 'jump' && f.rk && press & KEY.D && f.clk - f.rkT <= 3 && f.vy > 0) { // Mushidon: ↑↓ together
      Object.assign(f, { st: 'dash', t: 0, vy: -1, rk: false, mushi: true, dc: 1 });
      ev.push('mushidon');
    } else if (f.st === 'jump' && f.rk && press & KEY.D) { f.vy = -0.8; f.shd = true; f.rk = false; ev.push('shadow'); } // Shadow: dive keeping speed
    else if (dashReq && startDash(f, dir || f.tapD)) ev.push('dash');
    else if (press & KEY.A) {
      if (onPlat && inp & KEY.D) { f.drop = 12; f.y -= 0.05; f.g = false; ev.push('drop'); } // OttoShot: drop through attacking
      const key = f.g ? (inp & KEY.D && c.moves.bk ? 'bk' : 'z1') : c.moves.ja ? 'ja' : 'z1';
      if (startMove(f, key, inp | (f.drop === 12 ? KEY.D : 0))) ev.push('swing');
    } else if (up) {
      if (f.g && f.sh > 0 && !(inp & KEY.D)) rocket(f, dir, c, ev, inp); // shadow landing: rocket again straight away
      else if (onPlat && inp & KEY.D) { f.drop = 12; f.y -= 0.05; f.g = false; ev.push('drop'); } // ↓ + jump: drop through
      else if (f.g) { f.vy = JUMP_V * (c.jump ?? 1); f.g = false; ev.push('jump'); }
      else if (f.aj < c.airJumps) { f.vy = JUMP_V * 0.92; f.aj++; f.rk = false; ev.push('jump2'); }
    }
  }
  // hold Z (standing on the floor) to charge MP like the classic: 1, 2 or 3 bars, release to use that skill
  const free = f.st === 'idle' || f.st === 'run' || f.st === 'jump';
  if (free && f.g && inp & KEY.A && !(press & KEY.A)) { const before = chargeLevel(f); f.zh++; if (chargeLevel(f) > before) ev.push('charge'); }
  else if (!(inp & KEY.A) || !free) f.zh = 0;
  const charging = f.zh >= 12;
  f.crouch = free && f.g && !!(inp & KEY.D) && !dir && !charging; // ↓: crouch, a smaller target
  if (free) {
    if (!(f.spr && dir === f.face)) f.spr = false; // →→ and keep holding: sprint, like the classic
    const target = charging || f.crouch ? 0 : dir * c.run * (f.spr ? 1.5 : 1);
    if (f.g && f.sh > 0 && dir !== -Math.sign(f.vx)) { f.sh--; f.vx = Math.abs(f.vx) > Math.abs(target) ? f.vx * 0.96 : target; f.st = 'run'; } // shadow slide
    else if (f.g) { f.vx = target; f.st = target ? 'run' : 'idle'; f.sh = 0; }
    else { f.vx += (target - f.vx) * (f.rk || f.shd ? 0.03 : 0.1); f.st = 'jump'; if (f.rk) grav = 1.15; } // jumps keep their momentum, a little air control
  } else if (f.st === 'dash') {
    const d = c.dash;
    if (f.t >= 1 && f.g && up && !(d.blink && f.t > 2)) { rocket(f, dir, c, ev, inp); return physics(f, map, ev, 1); }
    if (d.blink && !f.mushi) {
      if (f.t === 2) { f.x = clampX(map, f.x + f.face * d.blink); ev.push('blink'); }
      f.vx = 0; if (!f.g) f.vy = Math.max(f.vy, 0) * 0.5;
    } else {
      const wind = f.mushi ? 0 : d.wind ?? 0, go = f.t > wind;
      if (go && f.t === wind + 1 && wind) ev.push('burst');
      f.vx = go ? f.face * (f.mushi ? 0.62 : d.speed) : 0;
      if (!f.g && !f.mushi) f.vy = go && d.up ? d.up : 0;
      grav = f.g || f.mushi ? 1 : 0;
    }
    const len = f.mushi ? 15 : d.frames; // ~10 studs: longer than a dash, not half the arena
    if (cast()) {} // Front / Back Spell
    else if (grabReq && startMove(f, 'gr', inp)) ev.push('swing'); // dash grab
    else if (d.chain && !f.mushi && f.t >= 4 && f.dc < d.chain && dashReq) { Object.assign(f, { t: 0, dc: f.dc + 1, face: dir || f.face }); ev.push('dash'); } // Flash/Wind Step
    else if (f.t > 2 && buffered(KEY.A)) {
      const back = f.g && inp & KEY.D && c.moves.bk; // back shot right after a dash keeps the dash speed
      if (startMove(f, back ? 'bk' : f.g ? (c.moves.da ? 'da' : 'z1') : c.moves.ja ? 'ja' : 'z1', inp)) { if (back) f.boost = true; ev.push('swing'); }
    }
    else if (f.t >= 1 && f.g && up) rocket(f, dir, c, ev, inp);
    else if (!f.g && !f.mushi && f.t >= 2 && press & KEY.D) { Object.assign(f, { st: 'jump', vy: -0.75, rk: true, rkT: -99 }); f.vx = f.face * rocketSpeed(c); ev.push('guan'); } // Guan: dive
    else if (f.t >= len) { f.spr = f.g && dir === f.face; f.st = f.g ? (f.spr ? 'run' : 'idle') : 'jump'; f.vx *= f.spr ? 1 : 0.4; f.mushi = false; }
  } else if (f.st === 'move') {
    const m = c.moves[f.mv];
    let vxSet = false;
    if (!f.boost) for (const [a, b, v] of m.vx ?? []) if (f.t >= a && f.t <= b) { f.vx = f.face * v; vxSet = true; }
    if (!vxSet) f.vx *= f.g ? (f.boost ? 0.9 : 0.72) : 0.96;
    for (const [at, v] of m.vy ?? []) if (f.t === at) { f.vy = v; f.g = false; }
    if (m.tele && f.t === m.tele[0]) { f.x = clampX(map, f.x + f.face * m.tele[1]); ev.push('blink'); }
    if (m.grav != null) grav = m.grav;
    else if (m.stall && f.guan && !f.g) grav = 0.04;
    else if (f.am && !m.vy && !m.landEnd) grav = 0.55; // air attacks hang a little
    const nh = m.hit.length;
    m.proj.forEach((p, i) => {
      if (f.t !== p.at) return;
      let [vx, vy] = p.v;
      if (f.aim) [vx, vy] = [vx * 0.8776 - vy * f.aim * 0.4794, vx * f.aim * 0.4794 + vy * 0.8776]; // aim ±27°
      const o = p.o ?? [1.4, 2.8];
      ev.push({ proj: { owner: f.id, team: f.team, ch: f.ch, mv: f.mv, k: nh + i, kind: p.kind, x: f.x + f.face * o[0], y: f.y + o[1], vx: f.face * vx, vy, life: p.life, w: p.size[0], h: p.size[1], pierce: p.pierce, grav: p.grav, hit: [] } });
    });
    if (m.hit.some((h) => h.a === f.t)) ev.push('slash');
    if (!m.mp && f.mv !== 'ctr' && f.mv !== 'gr' && f.t >= skillFrame(m) && cast()) {} // Bleach: combo into a skill
    else if (m.next && f.t >= m.cw && buffered(KEY.A) && startMove(f, m.next, inp, m.turn ? dir : 0)) ev.push('swing');
    else if (m.cancel != null && f.t >= m.cancel && (dashReq || buffered(KEY.K)) && startDash(f, dir)) ev.push('dash');
    else if (f.t >= m.f || (m.landEnd && f.g && f.t > 2)) f.st = f.g ? 'idle' : 'jump';
  } else if (f.st === 'hit') {
    f.stun--;
    grav = f.cr > 0 ? 0.15 : 1 + f.combo * 0.06; // juggles get heavier: no infinite combos (a Lothus hook floats with you)
    if (f.cr > 0) f.cr--;
    if (buffered(KEY.X) && f.mp >= 100 && startMove(f, 'ctr', inp)) ev.push('counter');
    else if (f.g && f.fall && f.t > 2) { Object.assign(f, { st: 'down', t: 0, vx: 0, combo: 0, fall: false }); ev.push('thud'); }
    else if (f.stun <= 0 && !f.fall) { f.st = f.g ? 'idle' : 'jump'; f.combo = 0; }
    if (f.g) f.vx *= 0.85;
  } else if (f.st === 'down') {
    f.vx *= 0.8;
    // Nakbup (break-fall tech): tap Jump in the first ~12 frames after you hit the floor to
    // spring straight back up instead of lying there the full ~70f. Hold ←/→ to roll that way.
    // You stay invulnerable through the short recovery (the 'up' state is i-frames), so it's a
    // real wake-up escape from okizeme — the core defensive read that made GC PvP competitive.
    // The counter is to bait it and meaty the roll's recovery, so knockdowns are still a mind-game.
    if (f.t >= 3 && f.t <= 12 && (press & (KEY.J | KEY.U))) { Object.assign(f, { st: 'up', t: 22, vx: dir * 0.55, vy: 0, combo: 0, fall: false }); ev.push('tech'); }
    else if (f.t >= 40) { f.st = 'up'; f.t = 0; }
  } else if (f.st === 'up') {
    f.vx *= 0.86;
    if (f.t >= 30) { f.st = 'idle'; f.t = 0; }
  } else if (f.st === 'dead') f.vx *= f.g ? 0.8 : 0.98;

  return physics(f, map, ev, grav);
}

// gravity, walls, floor and one-way platforms
function physics(f, map, ev, grav) {
  const wasG = f.g, py = f.y;
  f.vy = Math.max(-MAX_FALL, f.vy - GRAV * grav);
  f.x = clampX(map, f.x + f.vx);
  f.y += f.vy;
  f.g = false;
  if (f.y <= 0) { f.y = 0; f.vy = 0; f.g = true; }
  else if (f.vy <= 0 && !f.drop) {
    for (const [px, top, w] of map.plats) if (f.x >= px - 0.4 && f.x <= px + w + 0.4 && py >= top - 0.001 && f.y <= top) { f.y = top; f.vy = 0; f.g = true; break; }
  }
  if (f.g && !wasG) {
    f.aj = 0; f.ad = 0; f.sl = 0; f.guan = 0; f.rk = false; f.ill = false;
    if (f.shd) { f.sh = 6; f.shd = false; } // shadow landing: keep sliding, ↑ rockets again
    if (f.st !== 'hit') ev.push('land');
  }
  return ev;
}

// ---------- hits ----------
export const hurtbox = (f) => [f.x - BODY_W, f.y, f.x + BODY_W, f.y + (f.st === 'down' ? 1.8 : f.crouch ? 3.4 : BODY_H)];
// MP skill level reached by holding Z (0 = not yet), capped by the bars you have
export const chargeLevel = (f) => (f.zh >= 24 ? Math.min(Math.floor(f.mp / 100), 1 + Math.floor((f.zh - 24) / 30)) : 0);
export const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export function boxRect(f, box) {
  const [ox, oy, w, h] = box;
  return f.face > 0 ? [f.x + ox, f.y + oy, f.x + ox + w, f.y + oy + h] : [f.x - ox - w, f.y + oy, f.x - ox, f.y + oy + h];
}
// Melee hitboxes active this tick: [{ k, rect, h }]
export function activeHits(f) {
  const m = moveOf(f);
  if (!m) return [];
  return m.hit.map((h, k) => ({ k, h, rect: boxRect(f, h.box) })).filter(({ h }) => f.t >= h.a && f.t <= h.b);
}
export const projRect = (p) => [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2];
export function stepProj(p, map) {
  p.x += p.vx; p.y += p.vy;
  if (p.grav) p.vy -= GRAV * 0.5;
  p.life--;
  if (p.y < (p.kind === 'wave' ? 1 : -0.5) || p.x < map.x0 - 2 || p.x > map.x1 + 2) p.life = 0;
  return p.life > 0;
}
export const hitData = (ch, mv, k) => { const m = CHARS[ch]?.moves[mv]; return m ? hitsOf(m)[k] ?? null : null; };
export const damage = (att, vic, h, mul = 1) => Math.max(1, Math.round(h.dmg * CHARS[att].atk * CHARS[vic].def * mul));
// Phantom Veil: the first attack after it (every hit of that move) does 30% more
export function veilMul(a) {
  if (!a.vbuf || !(a.veil > 0)) { a.vbuf = false; return 1; }
  a.vmi ??= a.mi;
  if (a.mi === a.vmi) return 1.3;
  a.vbuf = false;
  return 1;
}
// what an attacker gets when its hit lands: MP, and a Lothus hook gives the air slash back
export function landedHit(a, h) {
  gainMp(a, h);
  if (h.carry && a.sl > 0) a.sl--;
}
export function grabTarget(f, foes, d) {
  for (const o of foes) {
    if (o === f || o.st === 'dead' || (o.team && o.team === f.team) || isInv(o)) continue;
    const dx = (o.x - f.x) * d;
    if (dx > 0 && dx < 2.9 && Math.abs(o.y - f.y) < 2.6) return true;
  }
  return false;
}

// The victim's reaction (run by the victim's own browser). dir = side the hit pushes towards.
export function applyHit(f, h, dir) {
  if (f.st === 'dead') return;
  if (hasArmor(f) && !h.grab) { f.hs = 4; return 'armor'; } // super armor: takes the damage, keeps attacking (grabs break it)
  f.combo++;
  const k = Math.max(0.35, 1 - 0.09 * (f.combo - 1));
  const force = h.down || f.combo >= 9;
  const air = !f.g || h.launch || f.fall;
  Object.assign(f, { st: 'hit', t: 0, mv: '', face: -dir || f.face, hs: h.box ? 3 : 2, stun: Math.round(h.stun * k) }); // arrows: short hit-stop, no stun-lock
  f.vx = dir * h.kb[0] * (force ? 1.3 : 1);
  if (h.carry && !force) { Object.assign(f, { vx: dir * h.kb[0], vy: h.kb[1], fall: true, g: false, hs: 0, cr: 14 }); return 'hit'; } // Lothus hook: carried along at your speed
  if (force) { f.vy = 0.5; f.fall = true; }
  else if (air) { f.vy = Math.max(h.kb[1], 0.24) * (h.launch ? 1 : k); f.fall = f.fall || h.launch || !f.g; }
  else f.vy = 0;
  if (f.vy > 0) f.g = false;
  return 'hit';
}
export const gainMp = (f, h) => { f.mp = Math.min(MP_MAX, f.mp + h.dmg * 0.14); };

// Server check: could this hit (character, move, index) reach from the attacker's to the victim's last position?
const reachCache = {};
export function reach(ch, mv, k) {
  const key = `${ch}:${mv}:${k}`;
  if (reachCache[key]) return reachCache[key];
  const m = CHARS[ch]?.moves[mv];
  const h = m && hitsOf(m)[k];
  if (!h) return null;
  const travel = (m.vx ?? []).reduce((s, [a, b, v]) => s + (b - a + 1) * Math.abs(v), 0) + (m.tele?.[1] ?? 0);
  const rise = (m.vy ?? []).reduce((s, [, v]) => s + Math.abs(v) * 25, 0);
  const r = h.box
    ? { x: Math.abs(h.box[0]) + h.box[2] + travel + BODY_W + 5, y: h.box[1] + h.box[3] + rise + BODY_H + 5 }
    : { x: Math.abs(h.o?.[0] ?? 1.4) + (Math.abs(h.v[0]) + 0.1) * h.life + travel + 6, y: Math.abs(h.o?.[1] ?? 3) + (Math.abs(h.v[1]) + 0.55) * h.life + rise + 7 };
  return (reachCache[key] = r);
}

// ---------- network snapshot: [x, y, vx, vy, face, state, move, t, combo, mp, aim, aj, Z held, crouch, veil] ----------
const r2 = (v) => Math.round(v * 100) / 100;
export const snap = (f) => [r2(f.x), r2(f.y), r2(f.vx), r2(f.vy), f.face, ST.indexOf(f.st), MV.indexOf(f.mv), Math.min(f.t, 999), f.combo, Math.round(f.mp), f.aim, f.aj, Math.min(f.zh | 0, 99), f.crouch ? 1 : 0, f.veil > 0 ? 1 : 0];
export function unsnap(s, f) {
  if (!Array.isArray(s) || s.length < 12) return f;
  const n = (i) => (Number.isFinite(+s[i]) ? +s[i] : 0);
  return Object.assign(f, { x: n(0), y: n(1), vx: n(2), vy: n(3), face: n(4) < 0 ? -1 : 1, st: ST[n(5)] ?? 'idle', mv: MV[n(6)] ?? '', t: n(7), combo: n(8), mp: n(9), aim: n(10), aj: n(11), zh: n(12), crouch: !!n(13), veil: n(14), g: n(1) <= 0.001 || n(3) === 0 });
}

// ---------- CPU (practice mode). A tiny deterministic brain: approach, combo, use skills, counter sometimes ----------
const noise = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
export function cpuInput(me, foe, lvl = 1) {
  if (!foe || me.st === 'dead' || foe.st === 'dead') return 0;
  const c = CHARS[me.ch];
  const r = noise(me.clk + me.x * 3.1);
  const dx = foe.x - me.x, dy = foe.y - me.y, adx = Math.abs(dx);
  const toward = dx > 0 ? KEY.R : KEY.L, away = dx > 0 ? KEY.L : KEY.R;
  let b = 0;
  if (me.st === 'hit') return me.mp >= 100 && r < 0.03 * lvl ? KEY.X : 0;
  if (me.st === 'down') return me.t >= 3 && me.t <= 12 && r < 0.3 * lvl ? KEY.J | (r < 0.5 ? away : toward) : 0; // break-fall tech out of okizeme
  if (me.st === 'move') return me.clk % 4 < 2 && r < 0.5 + 0.2 * lvl ? KEY.A : 0; // keep the combo going
  const zr = c.moves.z1.hit[0] ? c.moves.z1.hit[0].box[0] + c.moves.z1.hit[0].box[2] : 3;
  const want = c.ranged ? 12 : zr - 0.4;
  if (foe.st === 'down' || foe.st === 'up') return adx < 6 ? away : 0; // don't hit someone getting up (invulnerable)
  if (adx > want + (c.ranged ? 1.5 : 0)) b |= toward;
  else if (c.ranged && adx < want - 5) b |= r < 0.5 ? away : 0;
  if (dy > 3 && me.g && r < 0.07) b |= KEY.J;
  if (dy < -3 && me.g && r < 0.03) b |= KEY.D | KEY.J;
  if (!c.ranged && adx > 7 && r > (CHARS[foe.ch].ranged ? 0.88 : 0.97)) b |= me.g && r > 0.94 ? KEY.J : KEY.K; // close the gap: hop over arrows, air dash in
  const inRange = c.ranged ? Math.abs(dy) < 3 && adx < 24 : adx < zr + 0.6 && Math.abs(dy) < 3.2;
  if (inRange) {
    if (Math.sign(dx) !== me.face) return toward;
    if (!c.ranged && adx < 2.4 && (hasArmor(foe) || foe.st === 'move') && r < 0.06 * lvl) return KEY.L | KEY.R | KEY.A;
    if (me.mp >= 300 && r < 0.02 * lvl) return KEY.S3;
    if (me.mp >= 200 && r < 0.012 * lvl) return KEY.S2;
    if (me.mp >= 100 && r < 0.01 * lvl) return KEY.S1;
    if (me.clk % 4 < 2 && r < 0.35 + 0.25 * lvl) b |= KEY.A;
  }
  return b;
}

// ---------- offline match: the whole fight in one place (practice vs CPU, the tests) ----------
export function localHits(fighters, projs, map, onHit) {
  for (const a of fighters) {
    if (a.st === 'dead') continue;
    for (const { k, h, rect } of activeHits(a)) for (const v of fighters) {
      if (v === a || v.st === 'dead' || (v.team && v.team === a.team) || isInv(v)) continue;
      if (a.doneMi !== a.mi) { a.done = {}; a.doneMi = a.mi; }
      const tag = `${a.mi}:${k}:${v.id}`;
      if (a.done[tag] || !overlap(rect, hurtbox(v))) continue;
      a.done[tag] = 1;
      onHit(a, v, a.mv, k, h, a.x < v.x ? 1 : -1);
    }
  }
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    if (!stepProj(p, map)) { projs.splice(i, 1); continue; }
    for (const v of fighters) {
      if (v.id === p.owner || v.st === 'dead' || (v.team && v.team === p.team) || isInv(v) || p.hit.includes(v.id) || !overlap(projRect(p), hurtbox(v))) continue;
      p.hit.push(v.id);
      const a = fighters.find((x) => x.id === p.owner);
      onHit(a, v, p.mv, p.k, hitData(p.ch, p.mv, p.k), p.vx > 0 ? 1 : -1, p);
      if (!p.pierce) { p.life = 0; projs.splice(i, 1); break; }
    }
  }
}

// ---------- ranked: MMR + medals (5 stars each). Elo between every pair of opponents, so beating stronger players pays
// more. Each opponent counts by how "trusted" their rating is: an account with 1 game is worth 10% (no smurf farming,
// and a smurf can't drain you either), and your own first CALIBRATION games move fast so new players find their level.
export const CALIBRATION = 5;
export const MMR_START = 1000;
export const MEDALS = [
  { name: 'Stone', min: 0, e: '🪨', c: '#8b8f98' },
  { name: 'Bronze', min: 850, e: '🥉', c: '#d08a52' },
  { name: 'Silver', min: 1000, e: '🥈', c: '#c9d1e0' },
  { name: 'Gold', min: 1150, e: '🥇', c: '#ffcc33' },
  { name: 'Platinum', min: 1300, e: '💠', c: '#3cc8ff' },
  { name: 'Diamond', min: 1450, e: '💎', c: '#b86cf5' },
  { name: 'Master', min: 1600, e: '🔮', c: '#ff5fa2' },
  { name: 'Mythic', min: 1800, e: '👑', c: '#ff3b3b' },
];
// { name, e, c, stars 1-5 (0 = top medal or calibrating), calibrating }
export function medalOf(mmr, games = CALIBRATION) {
  if (games < CALIBRATION) return { name: 'Calibrating', e: '❔', c: '#6b7280', stars: 0, calibrating: true, left: CALIBRATION - games };
  const i = MEDALS.findLastIndex((m) => mmr >= m.min);
  const m = MEDALS[i], next = MEDALS[i + 1];
  const stars = next ? Math.min(5, 1 + Math.floor(((mmr - m.min) / (next.min - m.min)) * 5)) : 0;
  return { ...m, stars, calibrating: false };
}
export const trust = (games) => Math.min(1, Math.max(0.1, games / 10));
// players: [{ id, mmr, games, ip, team, score }], higher score = better finish. Returns { id: delta }
export function mmrDeltas(players) {
  const out = {};
  for (const a of players) {
    const K = a.games < CALIBRATION ? 64 : 32;
    let d = 0, n = 0;
    for (const b of players) {
      if (a === b || (a.team && a.team === b.team) || (a.ip && a.ip === b.ip)) continue; // same network: no alt farming
      n++;
      const expected = 1 / (1 + 10 ** ((b.mmr - a.mmr) / 400));
      const actual = a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
      d += K * (actual - expected) * trust(b.games);
    }
    out[a.id] = n ? Math.round(d / n) : 0;
  }
  return out;
}
// A Dota-style medal as SVG: metal ring in the medal colour, emblem, star pips along the bottom.
export function medalSVG(mmr, games, size = 48) {
  const m = medalOf(mmr, games);
  const pips = Array.from({ length: 5 }, (_, i) => {
    const a = Math.PI * (0.78 + i * 0.11);
    return `<path transform="translate(${(32 + Math.cos(a) * -24).toFixed(1)} ${(32 + Math.sin(a) * 24).toFixed(1)}) scale(0.32)" d="M0-10 3-3 10-3 4 2 6 9 0 5-6 9-4 2-10-3-3-3z" fill="${i < m.stars ? '#fff7c2' : 'rgba(0,0,0,.45)'}" stroke="rgba(0,0,0,.5)" stroke-width="2"/>`;
  }).join('');
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${m.name}${m.stars ? ` ${m.stars}` : ''}"><defs><radialGradient id="md${m.name}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="${m.c}"/><stop offset="1" stop-color="#111"/></radialGradient></defs>`
    + `<path d="M32 3 56 15V40L32 61 8 40V15Z" fill="url(#md${m.name})" stroke="${m.c}" stroke-width="2.5"/><path d="M32 10 50 19V38L32 54 14 38V19Z" fill="rgba(0,0,0,.35)"/>`
    + `<text x="32" y="38" text-anchor="middle" font-size="20">${m.e}</text>${pips}</svg>`;
}
