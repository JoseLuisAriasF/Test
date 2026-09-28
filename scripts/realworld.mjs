// Builds src/data/realworld.json: a pool of 360° street photos (Panoramax, CC-BY-SA 4.0) for Real World mode.
// Only places that really have 360° coverage end up in the pool. Refreshes at most once a week (use --force).
import fs from 'node:fs/promises';

const FILE = new URL('../src/data/realworld.json', import.meta.url);
const API = 'https://api.panoramax.xyz/api';
const PER_REGION = 5;
const MIN_SPACING_KM = 1.5;

// [label, lon, lat] - regions with known or likely 360° coverage; empty ones are skipped automatically.
const REGIONS = [
  ['Paris, France', 2.35, 48.86], ['Lyon, France', 4.83, 45.76], ['Marseille, France', 5.37, 43.3], ['Bordeaux, France', -0.58, 44.84],
  ['Toulouse, France', 1.44, 43.6], ['Nantes, France', -1.55, 47.22], ['Lille, France', 3.06, 50.63], ['Strasbourg, France', 7.75, 48.58],
  ['Nice, France', 7.26, 43.7], ['Rennes, France', -1.68, 48.11], ['Brest, France', -4.49, 48.39], ['Grenoble, France', 5.72, 45.19],
  ['Montpellier, France', 3.88, 43.61], ['Ajaccio, Corsica', 8.74, 41.93], ['Chamonix, French Alps', 6.87, 45.92],
  ['London, UK', -0.12, 51.51], ['Berlin, Germany', 13.4, 52.52], ['Hamburg, Germany', 9.99, 53.55], ['Munich, Germany', 11.58, 48.14],
  ['Cologne, Germany', 6.96, 50.94], ['Madrid, Spain', -3.7, 40.42], ['Barcelona, Spain', 2.17, 41.39], ['Valencia, Spain', -0.38, 39.47],
  ['Rome, Italy', 12.5, 41.9], ['Milan, Italy', 9.19, 45.46], ['Amsterdam, Netherlands', 4.9, 52.37], ['Rotterdam, Netherlands', 4.48, 51.92],
  ['Brussels, Belgium', 4.35, 50.85], ['Vienna, Austria', 16.37, 48.21], ['Zurich, Switzerland', 8.54, 47.37], ['Geneva, Switzerland', 6.14, 46.2],
  ['Lisbon, Portugal', -9.14, 38.72], ['Porto, Portugal', -8.61, 41.15], ['Oslo, Norway', 10.75, 59.91], ['Copenhagen, Denmark', 12.57, 55.68],
  ['Stockholm, Sweden', 18.07, 59.33], ['Prague, Czechia', 14.42, 50.08], ['Tokyo, Japan', 139.69, 35.69], ['New York, USA', -74, 40.71],
  ['Toronto, Canada', -79.38, 43.65], ['Buenos Aires, Argentina', -58.38, -34.6], ['Reunion Island', 55.45, -21.1],
  ['Martinique', -61.02, 14.64], ['Guadeloupe', -61.55, 16.25], ['French Guiana', -52.33, 4.94], ['Noumea, New Caledonia', 166.45, -22.27],
  ['Tahiti, French Polynesia', -149.57, -17.54],
];

const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const old = JSON.parse(await fs.readFile(FILE, 'utf8').catch(() => 'null'));
if (old && !process.argv.includes('--force') && Date.now() - new Date(old.updatedAt) < 7 * 864e5) {
  console.log(`realworld: fresh (${old.items.length} places), skipping`);
  process.exit(0);
}

const items = [];
for (const [place, lon, lat] of REGIONS) {
  const found = [];
  for (let attempt = 0; attempt < 3 && found.length < PER_REGION; attempt++) {
    const x = lon + (Math.random() - 0.5) * 0.5, y = lat + (Math.random() - 0.5) * 0.35;
    const bbox = [x - 0.25, y - 0.18, x + 0.25, y + 0.18].map((v) => v.toFixed(3)).join(',');
    const res = await fetch(`${API}/search?limit=60&bbox=${bbox}&filter=field_of_view%3D360`, { signal: AbortSignal.timeout(20000) })
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .catch(() => ({ features: [] }));
    const seen = new Set(found.map((f) => f.col));
    for (const f of (res.features ?? []).sort(() => Math.random() - 0.5)) {
      const [flon, flat] = f.geometry?.coordinates ?? [];
      const img = f.assets?.sd?.href;
      if (!img || !Number.isFinite(flat) || seen.has(f.collection)) continue;
      const it = { id: f.id, col: f.collection, lat: +flat.toFixed(6), lon: +flon.toFixed(6), img, by: (f.providers ?? f.properties?.providers ?? [])[0]?.name ?? 'Panoramax contributor', place };
      if ([...found, ...items].some((o) => km(o, it) < MIN_SPACING_KM)) continue;
      found.push(it);
      seen.add(f.collection);
      if (found.length >= PER_REGION) break;
    }
    await sleep(300);
  }
  items.push(...found);
  console.log(`${place}: ${found.length}`);
}

if (items.length < 40 && old) {
  console.warn(`realworld: only ${items.length} places found, keeping the previous pool`);
  process.exit(0);
}
await fs.writeFile(FILE, JSON.stringify({ updatedAt: new Date().toISOString(), license: 'Photos: Panoramax contributors, CC-BY-SA 4.0', items }, null, 1));
console.log(`realworld: saved ${items.length} places from ${new Set(items.map((i) => i.place)).size} regions`);
