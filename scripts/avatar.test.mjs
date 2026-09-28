import assert from 'node:assert/strict';
import { sanitize, ITEMS, BODIES, avatarSVG, isUnlocked, BY_ID, DEFAULT } from '../src/lib/avatar.js';

const none = { games: 0, wins: 0, correct: 0, streak: 0, perfect: 0, peak: 1000 };
const flame = { hat: 'hat-flame', aura: 'aura-rays' };
assert.equal(sanitize(flame, none, 1).hat, 'hat-flame', '#1 wears the flaming crown');
assert.equal(sanitize(flame, none, 2).hat, 'hat-none', '#2 loses it');
assert.equal(sanitize(flame, none, 0).aura, 'aura-none', 'unranked loses it');
assert.equal(sanitize({ hat: 'hat-crown' }, none, 10).hat, 'hat-crown', 'top 10 crown at #10');
assert.equal(sanitize({ hat: 'hat-crown' }, none, 11).hat, 'hat-none');
assert.equal(sanitize({ face: 'face-laser' }, { ...none, peak: 1699 }, 0).face, 'face-smile', 'laser needs Legend peak');
assert.equal(sanitize({ face: 'face-laser' }, { ...none, peak: 1700 }, 0).face, 'face-laser');
assert.equal(sanitize({ hat: 'face-smile' }, none, 0).hat, 'hat-none', 'item in wrong slot rejected');
assert.equal(sanitize({ hat: '<script>' }, none, 0).hat, 'hat-none');
assert.deepEqual(sanitize(null, none, 0), DEFAULT);
assert.equal(sanitize({ skin: 99, body: 'alien' }, none, 0).skin, DEFAULT.skin);

// defaults are always free; the rarest items are never free
for (const id of Object.values(DEFAULT).filter((v) => typeof v === 'string' && BY_ID[v])) assert.ok(isUnlocked(BY_ID[id], none, 0), id);
for (const i of ITEMS.filter((x) => ['legendary', 'mythic'].includes(x.r))) assert.ok(i.req, `${i.id} must have a requirement`);

// every item renders on every body without broken output
for (const body of Object.keys(BODIES))
  for (const i of ITEMS) {
    const svg = avatarSVG({ ...DEFAULT, body, [i.slot]: i.id }, 80);
    assert.ok(svg.startsWith('<svg') && !/undefined|NaN/.test(svg), `${i.id} on ${body}`);
  }
// "Other" body draws an 8-bit head: every face cosmetic needs its own pixel version
const strip = (s) => s.replace(/\d+(?=")/g, '');
const otherFaces = ITEMS.filter((i) => i.slot === 'face').map((i) => strip(avatarSVG({ body: 'other', face: i.id })));
assert.equal(new Set(otherFaces).size, otherFaces.length, 'each face looks different on the Other body');

// two avatars on one page must not share gradient ids
const a = avatarSVG({ shirt: 'shirt-galaxy' }), b = avatarSVG({ shirt: 'shirt-galaxy' });
assert.notEqual(a.match(/id="gx\d+"/)[0], b.match(/id="gx\d+"/)[0]);
console.log(`avatar tests ok (${ITEMS.length} items x ${Object.keys(BODIES).length} bodies)`);
