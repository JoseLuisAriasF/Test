import assert from 'node:assert/strict';
import { parseCodes, mergeCodes, slugify, cleanName } from './codes.mjs';

assert.equal(cleanName('[🥚UPD] Steal An Egg 🏡'), 'Steal An Egg');
assert.equal(slugify('Brookhaven 🏡RP'), 'brookhaven-rp');
assert.equal(slugify("Pokémon & Friends!"), 'pokemon-and-friends');

const page = `<h2>Active codes</h2><ul><li><strong>NEWCODE</strong> - 2x EXP &amp; gems</li><li><strong>OLD1</strong>: Free boost</li></ul>
<h2>Expired Blox Fruits codes</h2><ul><li><strong>OLD1</strong></li><li><strong>DEAD</strong></li></ul>`;
const r = parseCodes(page);
assert.deepEqual(r.active, [{ code: 'NEWCODE', reward: '2x EXP & gems' }, { code: 'OLD1', reward: 'Free boost' }]);
assert.deepEqual(r.expired, ['OLD1', 'DEAD']);

assert.deepEqual(parseCodes('<li><strong>1843325307</strong> - Song</li><li><strong>Arm</strong> warmers - 10713770556</li>').active, []);

const prev = { active: [{ code: 'KEEP', reward: 'x', added: '2026-01-01' }, { code: 'GONE', reward: 'y', added: '2026-01-01' }], expired: [] };
const m = mergeCodes(prev, [r, { active: [{ code: 'keep', reward: 'z' }, { code: 'OLD1', reward: '' }], expired: [] }], '2026-09-27');
assert.deepEqual(m.active.map((c) => [c.code, c.added]), [['NEWCODE', '2026-09-27'], ['OLD1', '2026-09-27'], ['KEEP', '2026-01-01']]); // OLD1: 2 up vs 1 down -> active
assert.ok(m.expired.includes('GONE') && m.expired.includes('DEAD') && !m.expired.includes('OLD1'));
assert.deepEqual(mergeCodes(prev, [], 'x').active, prev.active); // no sources -> keep previous

console.log('codes tests ok');
