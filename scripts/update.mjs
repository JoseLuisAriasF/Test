// Pulls the live top 50 Roblox games + codes/badges/passes/AI guides into src/data/games.json.
// Run by GitHub Actions on a cron; safe to run locally: `npm run update`.
import fs from 'node:fs/promises';
import { parseCodes, mergeCodes, slugify, cleanName } from './codes.mjs';

const FILE = new URL('../src/data/games.json', import.meta.url);
const TOP = 50;
const AI_MAX = +(process.env.AI_MAX ?? 12); // guides per run; GitHub Models free tier is rate limited
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36' };
const now = new Date();
const today = now.toISOString().slice(0, 10);

const get = async (url, type = 'json') => {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r[type]();
};
const safe = (p, fallback) => p.catch((e) => (console.warn('  !', e.message), fallback));
const byId = (list, k = 'id') => Object.fromEntries((list ?? []).map((x) => [x[k], x]));

const db = JSON.parse(await fs.readFile(FILE, 'utf8').catch(() => '{"games":{}}'));

// 1. Live ranking (sponsored slots excluded)
const sort = await get(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${crypto.randomUUID()}&sortId=top-playing-now`);
const top = sort.games.filter((g) => !g.isSponsored).slice(0, TOP);
const ids = top.map((g) => g.universeId).join(',');
console.log(`top ${top.length} games`);

// 2. Bulk details
const [details, icons, thumbs] = await Promise.all([
  get(`https://games.roblox.com/v1/games?universeIds=${ids}`).then((r) => byId(r.data)),
  safe(get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=512x512&format=Webp`).then((r) => byId(r.data, 'targetId')), {}),
  safe(get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=5&size=768x432&format=Webp`).then((r) => byId(r.data, 'universeId')), {}),
]);

// 3. Codes from several guide sites, majority-voted
const SOURCES = [
  (s) => `https://www.pockettactics.com/${s}/codes`,
  (s) => `https://beebom.com/roblox-${s}-codes/`,
  (s) => `https://www.destructoid.com/${s}-codes/`,
  (s) => `https://www.destructoid.com/roblox-${s}-codes/`,
];
async function fetchCodes(name, slug) {
  const word = cleanName(name).split(' ')[0].toLowerCase();
  const variants = [...new Set([slug, slug.replace(/-(rp|roblox|simulator|game|obby|tycoon)$/, '')])];
  const pages = await Promise.all(SOURCES.flatMap((src) => variants.map((v) => safe(get(src(v), 'text'), ''))));
  return pages
    .filter((p) => { const t = (p.match(/<title>([^<]*)/i)?.[1] ?? '').toLowerCase(); return t.includes('code') && t.includes(word); })
    .map(parseCodes)
    .filter((r) => r.active.length || r.expired.length);
}

// 4. AI guide via GitHub Models (free with the Actions GITHUB_TOKEN). Tips must be legit: no exploits.
async function aiGuide(g) {
  const r = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json', accept: 'application/vnd.github+json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'openai/gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You write friendly, accurate, kid-safe Roblox game guides in simple English for players aged 9-16. Never mention exploits, scripts, hacks, glitch abuse, free Robux scams or anything against Roblox rules. Only use facts you are confident about; stay general when unsure. Reply with JSON only.' },
        { role: 'user', content: `Game: ${g.title} (genre: ${g.genre}, by ${g.creator}).\nOfficial description:\n${g.description.slice(0, 2000)}\nGame passes: ${g.passes.map((p) => p.name).join(', ') || 'none'}\nBadges: ${g.badges.slice(0, 15).map((b) => b.name).join(', ') || 'none'}\n\nReturn JSON: {"intro": "2 short paragraphs about what the game is and why it is popular", "tips": [{"title": "", "text": ""}] (8 practical tips & tricks), "beginner": ["..."] (6 step beginner guide), "faq": [{"q": "", "a": ""}] (5 common player questions)}` },
      ],
    }),
  });
  const body = await r.text();
  if (!r.ok || !body.startsWith('{')) throw new Error(`AI ${r.status} ${body.slice(0, 200)}`);
  const out = JSON.parse(JSON.parse(body).choices[0].message.content);
  if (!out.intro || !Array.isArray(out.tips)) throw new Error('AI bad shape');
  return { ...out, basedOn: g.updated, at: now.toISOString() };
}

// 5. Merge
let aiLeft = process.env.GITHUB_TOKEN ? AI_MAX : 0;
const usedSlugs = new Set(Object.values(db.games).map((g) => g.slug));
for (const g of Object.values(db.games)) g.rank = null;

for (const [i, t] of top.entries()) {
  const d = details[t.universeId];
  if (!d) continue;
  const prev = db.games[t.universeId];
  let slug = prev?.slug ?? (slugify(d.name) || `game-${t.universeId}`);
  if (!prev && usedSlugs.has(slug)) slug += `-${t.universeId}`;
  usedSlugs.add(slug);
  console.log(`#${i + 1} ${slug}`);

  const [badges, passes, codeResults] = await Promise.all([
    safe(get(`https://badges.roblox.com/v1/universes/${t.universeId}/badges?limit=100&sortOrder=Desc`).then((r) => r.data), prev?.badges ?? []),
    safe(get(`https://apis.roblox.com/game-passes/v1/universes/${t.universeId}/game-passes?passView=Full&pageSize=50`).then((r) => r.gamePasses), prev?.passes ?? []),
    fetchCodes(d.name, slug),
  ]);

  const g = {
    ...prev,
    id: t.universeId, placeId: d.rootPlaceId, slug, name: d.name, title: cleanName(d.name) || d.name,
    creator: d.creator.name, verified: d.creator.hasVerifiedBadge,
    description: (d.description ?? '').slice(0, 3000),
    genre: t.genreL1 || d.genre_l1 || d.genre || 'Experience', maturity: t.contentMaturity,
    playing: d.playing ?? t.playerCount, visits: d.visits, favorites: d.favoritedCount, maxPlayers: d.maxPlayers,
    created: d.created, updated: d.updated, up: t.totalUpVotes, down: t.totalDownVotes,
    icon: icons[t.universeId]?.imageUrl ?? prev?.icon ?? null,
    thumbs: thumbs[t.universeId]?.thumbnails?.filter((x) => x.imageUrl).map((x) => x.imageUrl) ?? prev?.thumbs ?? [],
    rank: i + 1, seenAt: now.toISOString(),
    badges: badges.map((b) => ({ id: b.id, name: b.displayName || b.name, desc: (b.displayDescription || b.description || '').slice(0, 300), iconId: b.displayIconImageId, awarded: b.statistics?.awardedCount ?? b.awarded ?? 0, rate: b.statistics?.winRatePercentage ?? b.rate ?? 0 }))
      .sort((a, b) => b.awarded - a.awarded).slice(0, 40),
    passes: passes.filter((p) => p.isForSale !== false).map((p) => ({ id: p.id, name: p.displayName || p.name, desc: (p.displayDescription ?? p.desc ?? '').slice(0, 200), price: p.price })).slice(0, 30),
    codes: mergeCodes(prev?.codes, codeResults, prev ? today : null), // first sighting: we don't know when codes were added
    codeSources: codeResults.length,
  };
  g.peak = Math.max(prev?.peak ?? 0, g.playing);
  g.history = [...(prev?.history ?? []), [now.toISOString().slice(0, 13), g.playing]].slice(-84);
  g.updates = prev?.updates ?? [];
  if (g.updated && g.updates[0]?.date !== g.updated) {
    const headline = g.description.split('\n').map((l) => l.trim()).find((l) => /update|out now|new|upd|event|season/i.test(l)) ?? '';
    g.updates = [{ date: g.updated, headline: headline.slice(0, 200) }, ...g.updates].slice(0, 12);
  }

  const stale = !g.guide || (g.guide.basedOn !== g.updated && now - new Date(g.guide.at) > 7 * 864e5);
  if (aiLeft > 0 && stale) {
    aiLeft--;
    g.guide = (await safe(aiGuide(g), null)) ?? g.guide;
  }
  db.games[t.universeId] = g;
}

// Keep games that dropped out for 120 days: their pages keep ranking in search.
for (const [id, g] of Object.entries(db.games)) if (now - new Date(g.seenAt) > 120 * 864e5) delete db.games[id];
db.updatedAt = now.toISOString();
await fs.mkdir(new URL('.', FILE), { recursive: true });
await fs.writeFile(FILE, JSON.stringify(db, null, 1));
console.log(`saved ${Object.keys(db.games).length} games`);
