import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';

<<<<<<< HEAD
// lastmod for data-driven pages = the last data refresh (site rebuilds every ~2h).
const db = JSON.parse(readFileSync(new URL('./src/data/games.json', import.meta.url)));
const lastmod = db.updatedAt;
// Same rule as hasCodes() in src/lib/data.js: empty /codes/<slug>/ pages are noindex, so keep them out of the sitemap.
const empty = new Set(Object.values(db.games).filter((g) => !g.codes.active.length && !g.codes.expired.length).map((g) => g.slug));
=======
// Per-page lastmod so Google gets a real freshness signal instead of one
// build-time value repeated on every URL (which it learns to ignore).
// Hubs use the data-refresh time; each game's code/guide page uses that game's
// own change date (latest code added, else the game's last Roblox update).
const db = JSON.parse(readFileSync(new URL('./src/data/games.json', import.meta.url)));
const siteLastmod = db.updatedAt;
const gameLastmod = {};
for (const g of Object.values(db.games)) {
  const added = (g.codes?.active ?? []).map((c) => c.added).filter(Boolean).sort();
  gameLastmod[g.slug] = added.length ? added[added.length - 1] : g.updated;
}
>>>>>>> 66dc65f7c4a089e7b41d0a4ab48ff009acf81a64

export default defineConfig({
  site: process.env.SITE_URL || 'https://bibibox.xyz',
  trailingSlash: 'always',
  integrations: [sitemap({
    filter: (page) => !page.includes('search.json') && !empty.has(page.match(/\/codes\/([^/]+)\/$/)?.[1]),
    serialize: (item) => {
      const p = new URL(item.url).pathname;
<<<<<<< HEAD
      if (p === '/') return { ...item, lastmod, changefreq: 'hourly', priority: 1.0 };
      if (p.startsWith('/codes/') && p !== '/codes/') return { ...item, lastmod, changefreq: 'hourly', priority: 0.9 };
      if (p === '/codes/' || p === '/codes/new/' || p === '/top/') return { ...item, lastmod, changefreq: 'hourly', priority: 0.8 };
      if (p.startsWith('/games/')) return { ...item, lastmod, changefreq: 'daily', priority: 0.7 };
=======
      const slug = p.match(/^\/(?:codes|games)\/([^/]+)\/$/)?.[1];
      if (slug && gameLastmod[slug]) {
        return { ...item, lastmod: gameLastmod[slug], changefreq: p.startsWith('/codes/') ? 'hourly' : 'daily', priority: p.startsWith('/codes/') ? 0.9 : 0.7 };
      }
      if (p === '/') return { ...item, lastmod: siteLastmod, changefreq: 'hourly', priority: 1.0 };
      if (p === '/codes/' || p === '/top/') return { ...item, lastmod: siteLastmod, changefreq: 'hourly', priority: 0.8 };
>>>>>>> 66dc65f7c4a089e7b41d0a4ab48ff009acf81a64
      if (['/chase/','/chase/guide/','/guessr/','/blox-world/','/real-world/','/parkour/','/golf/','/typing/','/trending/','/play/','/quiz/'].includes(p)) return { ...item, changefreq: 'daily', priority: 0.6 };
      return { ...item, changefreq: 'weekly', priority: 0.3 };
    },
  })],
});
