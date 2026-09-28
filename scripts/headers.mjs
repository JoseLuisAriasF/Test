// Post-build: writes dist/_headers (security + caching headers for Cloudflare static assets).
// The Content-Security-Policy allows only the inline scripts Astro emitted in THIS build (by SHA-256 hash),
// so injected scripts can't run. If you add a new third-party service (ads, analytics...), add its hosts below.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = 'dist';
const hashes = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) {
      const html = fs.readFileSync(p, 'utf8');
      for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs) || !body.trim()) continue;
        hashes.add(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
      }
    }
  }
};
walk(DIST);

const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(' ')} https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:", // Roblox thumbnails, Panoramax photos (many community servers), map sprites
  "connect-src 'self' wss://bibibox.xyz https://api.panoramax.xyz https://tiles.openfreemap.org https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "frame-src https://accounts.google.com/gsi/",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync(path.join(DIST, '_headers'), headers);
console.log(`_headers written (${hashes.size} inline script hashes)`);
