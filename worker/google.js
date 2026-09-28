// Verifies a "Sign in with Google" ID token (RS256 JWT) with Web Crypto. No SDK needed.
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const part = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));

export async function verifyGoogleToken(token, clientId, getKeys, now = Date.now()) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) throw new Error('malformed token');
  const header = part(h);
  const payload = part(p);
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) throw new Error('bad signature');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('bad issuer');
  if (!clientId || payload.aud !== clientId) throw new Error('bad audience');
  if (!(payload.exp * 1000 > now)) throw new Error('expired');
  return payload;
}

// Google's public keys, cached at the edge for an hour.
export async function googleKeys() {
  const url = 'https://www.googleapis.com/oauth2/v3/certs';
  const cache = caches.default;
  let res = await cache.match(url);
  if (!res) {
    res = new Response((await fetch(url)).body, { headers: { 'cache-control': 'public, max-age=3600', 'content-type': 'application/json' } });
    await cache.put(url, res.clone());
  }
  return (await res.json()).keys;
}

// We keep only a hash of Google's user id: no email, no name, nothing personal.
export async function hashId(sub) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bibibox:${sub}`));
  return 'g_' + [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
