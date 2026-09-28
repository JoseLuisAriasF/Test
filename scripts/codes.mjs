// Pure helpers (no network) so they can be tested.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ndash: '-', mdash: '-', hellip: '...' };
export const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

// "[🥚UPD] Steal An Egg 🏡" -> "Steal An Egg"
export const cleanName = (n) =>
  decode(n).replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ').replace(/[^\p{L}\p{N}\s'&:!.,-]/gu, ' ').replace(/\s+/g, ' ').trim();

export const slugify = (n) =>
  cleanName(n).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and')
    .replace(/['’.!:,]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const CODE_RE = /^[A-Za-z0-9_!#.$\-]{3,40}$/;
const LI_RE = /<li[^>]*>\s*(?:<(?!\/li)[^>]+>\s*)*?<(?:strong|b)>([^<]{3,40})<\/(?:strong|b)>((?:(?!<\/li>).){0,400})/gis;

function listCodes(chunk) {
  const out = [];
  for (const [, c, rest] of chunk.matchAll(LI_RE)) {
    const code = decode(c).trim();
    if (!CODE_RE.test(code) || /^(new|note|update|expired|active)$/i.test(code)) continue;
    const reward = decode(rest.replace(/<[^>]+>/g, ''))
      .replace(/^\s*(?:\(new\)|new!?)?\s*[:\-–—]+\s*/i, '').replace(/^redeem (?:this code )?for\s*/i, '')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
    if (/^\d+$/.test(code) || /\d{7,}/.test(reward)) continue; // music/catalog IDs, not redeem codes
    out.push({ code, reward });
  }
  return out;
}

// Splits an article at its first "expired" heading: codes above are active, below are expired.
export function parseCodes(page) {
  const m = page.match(/<h[2-4][^>]*>(?:(?!<\/h[2-4]>).)*?expired/is);
  const cut = m ? m.index : page.length;
  return { active: listCodes(page.slice(0, cut)), expired: listCodes(page.slice(cut)).map((c) => c.code) };
}

// Majority vote across sources; keeps firstSeen dates, moves vanished codes to expired.
export function mergeCodes(prev = { active: [], expired: [] }, results, today) {
  const votes = new Map();
  const key = (c) => c.toLowerCase();
  for (const r of results) {
    for (const c of r.active) {
      const v = votes.get(key(c.code)) ?? { code: c.code, reward: c.reward, up: 0, down: 0 };
      v.up++;
      if (!v.reward && c.reward) v.reward = c.reward;
      votes.set(key(c.code), v);
    }
    for (const c of r.expired) votes.has(key(c)) ? votes.get(key(c)).down++ : votes.set(key(c), { code: c, up: 0, down: 1 });
  }
  const seen = new Map(prev.active.map((c) => [key(c.code), c]));
  const active = [...votes.values()].filter((v) => v.up > v.down)
    .map((v) => ({ code: seen.get(key(v.code))?.code ?? v.code, reward: v.reward || 'Free rewards', added: seen.has(key(v.code)) ? seen.get(key(v.code)).added : today }))
    .sort((a, b) => (b.added ?? '').localeCompare(a.added ?? ''));
  const activeKeys = new Set(active.map((c) => key(c.code)));
  const gone = results.length ? prev.active.filter((c) => !activeKeys.has(key(c.code))).map((c) => c.code) : [];
  const expired = [...new Set([...gone, ...prev.expired, ...[...votes.values()].filter((v) => v.up <= v.down).map((v) => v.code)])]
    .filter((c) => !activeKeys.has(key(c))).slice(0, 40);
  return { active: results.length ? active : prev.active, expired };
}
