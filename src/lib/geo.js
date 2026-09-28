// Shared math for the explore modes (Real World + Blox World). Pure functions, tested in scripts/geo.test.mjs.

// Seeded RNG (mulberry32): same seed => same worlds/rounds for everyone (daily, challenge links).
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const shuffle = (r, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Great-circle distance in km.
export function haversine(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

// Scores: 5000 for a (near) perfect guess, decaying with distance.
export const realScore = (km) => (km < 0.05 ? 5000 : Math.round(5000 * Math.exp(-km / 1500)));
export const bloxScore = (studs) => (studs < 4 ? 5000 : Math.round(5000 * Math.exp(-studs / 55)));

export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en')} km`);
export const RANKS = [
  [0, '🐣 Lost Noob'], [0.2, '🧭 Explorer'], [0.45, '🗺️ Navigator'], [0.7, '🔭 Pathfinder'], [0.88, '👑 World Legend'],
];
export const rankFor = (pct) => [...RANKS].reverse().find(([min]) => pct >= min)[1];
