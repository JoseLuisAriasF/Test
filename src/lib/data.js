import db from '../data/games.json';

export const SITE_NAME = 'BibiBox';

export const updatedAt = new Date(db.updatedAt);
export const games = Object.values(db.games).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.playing - a.playing);
export const top = games.filter((g) => g.rank);
export const withCodes = games.filter((g) => g.codes.active.length);
const pick = (ids = []) => ids.map((id) => db.games[id]).filter(Boolean);
export const trending = pick(db.lists?.trending);
export const rising = pick(db.lists?.rising);

// Rank movement since the previous run: number of places gained, 'new' for fresh entries.
export const move = (g) => (!g.rank ? 0 : g.prevRank === null ? 'new' : g.prevRank ? g.prevRank - g.rank : 0);
// % change in players vs ~24h ago (history has one point per 2h run).
export function change24(g) {
  const h = g.history ?? [];
  const past = h.length > 1 ? h[Math.max(0, h.length - 13)][1] : 0;
  return past ? Math.round(((g.playing - past) / past) * 100) : null;
}
const EMOJI = { Simulation: '🌱', 'Roleplay & Avatar Sim': '🏡', Survival: '🧟', RPG: '⚔️', Action: '💥', Shooter: '🎯', 'Sports & Racing': '🏎️', Shopping: '🛍️', 'Party & Casual': '🎉', 'Obby & Platformer': '🧗', Adventure: '🗺️', Strategy: '🧠', Puzzle: '🧩', Entertainment: '🎬', Education: '📚' };
export const emoji = (genre) => EMOJI[genre] ?? '🎮';

const DAY = 864e5;
export const fmt = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);
export const full = (n) => new Intl.NumberFormat('en').format(n ?? 0);
export const date = (iso) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const monthYear = updatedAt.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const rating = (g) => Math.round((g.up / (g.up + g.down || 1)) * 100);
// Roblox up/down votes → a 0.0-5.0 star value and total vote count, for visible
// display and matching AggregateRating markup. Only emit markup when >= 1 star
// (Google rejects ratingValue below worstRating).
export const votes = (g) => (g.up ?? 0) + (g.down ?? 0);
export const stars = (g) => Math.round((g.up / (g.up + g.down || 1)) * 50) / 10;
export const ratingLD = (g) => (stars(g) >= 1 ? { '@type': 'AggregateRating', ratingValue: stars(g), bestRating: 5, ratingCount: votes(g) } : null);
export const isNew = (c) => !!c.added && updatedAt - new Date(c.added) < 3 * DAY;
export const newCodes = (g) => g.codes.active.filter(isNew).length;
// A /codes/ page with no active codes is thin: noindex it and keep it out of the sitemap
// so Google spends its crawl budget on pages that have something to say.
export const hasCodes = (g) => g.codes.active.length > 0;
export const checkedAt = `${updatedAt.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`;
export const slugOf = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const genres = Object.entries(Object.groupBy(games, (g) => g.genre)).sort((a, b) => b[1].length - a[1].length);
export const playUrl = (g) => `https://www.roblox.com/games/${g.placeId}`;
export const related = (g, n = 6) =>
  games.filter((x) => x.id !== g.id).sort((a, b) => (b.genre === g.genre) - (a.genre === g.genre) || (a.rank ?? 999) - (b.rank ?? 999)).slice(0, n);

// Data-driven tips so every page has unique, factual content even before an AI guide exists.
export function autoTips(g) {
  const tips = [];
  const hardest = [...g.badges].filter((b) => b.rate > 0).sort((a, b) => a.rate - b.rate)[0];
  const easiest = [...g.badges].sort((a, b) => b.rate - a.rate)[0];
  const cheapest = [...g.passes].filter((p) => p.price).sort((a, b) => a.price - b.price)[0];
  if (g.codes.active.length) tips.push({ title: 'Redeem every code first', text: `There are ${g.codes.active.length} working codes for ${g.title} right now. Redeem them before you start grinding - free boosts save hours.` });
  if (easiest) tips.push({ title: `Grab "${easiest.name}" early`, text: `It's the most common badge: ${full(easiest.awarded)} players already have it. ${easiest.desc || ''}`.trim() });
  if (hardest && hardest !== easiest) tips.push({ title: `Rarest badge: ${hardest.name}`, text: `Only ${hardest.rate < 0.01 ? 'a tiny fraction' : `${(hardest.rate * 100).toFixed(2)}%`} of players earn it. ${hardest.desc || 'A great goal for experienced players.'}` });
  if (cheapest) tips.push({ title: 'Cheapest game pass', text: `"${cheapest.name}" costs ${full(cheapest.price)} Robux. ${cheapest.desc || ''} Always play a while before buying anything.`.trim() });
  tips.push({ title: 'Play when servers are full', text: `${g.title} peaks at around ${fmt(g.peak)} players at once. Busy servers mean more teammates, trades and events.` });
  tips.push({ title: 'Favorite it for updates', text: `Tap the star on the Roblox page (${fmt(g.favorites)} players did) so you get notified when new updates and codes drop.` });
  return tips;
}
