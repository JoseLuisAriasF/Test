import assert from 'node:assert/strict';
import fs from 'node:fs';
import { changedUrls, KEY } from './indexnow.mjs';

const game = (slug, active, expired = []) => ({ slug, codes: { active: active.map((code) => ({ code })), expired } });
const old = { games: { a: game('a', ['X']), b: game('b', []), c: game('c', ['Z']) } };
const next = { games: { a: game('a', ['X', 'Y']), b: game('b', []), c: game('c', ['Z']), d: game('d', ['N']) } };

assert.deepEqual(changedUrls(old, next), ['/', '/codes/', '/codes/new/', '/codes/a/', '/codes/d/']); // a gained a code, d is new; b empty and c unchanged skipped
assert.deepEqual(changedUrls(old, old), []);
assert.equal(fs.readFileSync(`public/${KEY}.txt`, 'utf8'), KEY); // key file must be served at the site root
