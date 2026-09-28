// Signs fake Google ID tokens with a local RSA key to check the verifier accepts/rejects correctly.
import assert from 'node:assert/strict';
import { verifyGoogleToken, hashId } from '../worker/google.js';

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const keys = async () => [jwk];
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = async (payload, kid = 'k1') => {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid }));
  const p = b64u(JSON.stringify(payload));
  const s = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(s)}`;
};
const good = { iss: 'https://accounts.google.com', aud: 'client-1', sub: '12345', exp: Date.now() / 1000 + 600 };

assert.equal((await verifyGoogleToken(await sign(good), 'client-1', keys)).sub, '12345');
const rejects = async (token, msg) => assert.rejects(() => verifyGoogleToken(token, 'client-1', keys), undefined, msg);
await rejects(await sign({ ...good, aud: 'other-app' }), 'wrong audience');
await rejects(await sign({ ...good, iss: 'evil.com' }), 'wrong issuer');
await rejects(await sign({ ...good, exp: Date.now() / 1000 - 5 }), 'expired');
await rejects(await sign(good, 'unknown'), 'unknown key');
const t = await sign(good);
await rejects(t.slice(0, -4) + 'AAAA', 'tampered signature');
await rejects(t.split('.')[0] + '.' + b64u(JSON.stringify({ ...good, sub: 'hacker' })) + '.' + t.split('.')[2], 'tampered payload');
await rejects('nope', 'malformed');

assert.equal(await hashId('12345'), await hashId('12345'));
assert.notEqual(await hashId('12345'), await hashId('12346'));
console.log('google tests ok');
