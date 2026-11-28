// Tells Bing/Yandex/DuckDuckGo (IndexNow) which pages changed, minutes after a data refresh.
// Google ignores IndexNow; it relies on the sitemap. Usage: node scripts/indexnow.mjs <previous games.json>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const KEY = 'df6d6f6ff8c3e70a18a0710305432168';
const HOST = 'bibibox.xyz';

const codeSet = (g) => (g?.codes.active ?? []).map((c) => c.code).sort().join('|');

// URLs whose active codes differ between two snapshots (new game, new or removed code).
export function changedUrls(oldDb, newDb) {
  const slugs = Object.entries(newDb.games)
    .filter(([id, g]) => codeSet(g) !== codeSet(oldDb.games[id]) && g.codes.active.length > 0)
    .map(([, g]) => `/codes/${g.slug}/`);
  return slugs.length ? ['/', '/codes/', '/codes/new/', ...slugs] : [];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const urlList = changedUrls(read(process.argv[2]), read('src/data/games.json')).map((p) => `https://${HOST}${p}`);
  if (!urlList.length) console.log('IndexNow: no code changes, nothing to submit');
  else {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
    });
    console.log(`IndexNow: ${urlList.length} URLs -> HTTP ${res.status}`);
  }
}
