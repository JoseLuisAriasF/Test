import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';

// lastmod for data-driven pages = the last data refresh (site rebuilds every ~2h).
const lastmod = JSON.parse(readFileSync(new URL('./src/data/games.json', import.meta.url))).updatedAt;

export default defineConfig({
  site: process.env.SITE_URL || 'https://bibibox.xyz',
  trailingSlash: 'always',
  integrations: [sitemap({
    filter: (page) => !page.includes('search.json'),
    serialize: (item) => {
      const p = new URL(item.url).pathname;
      if (p === '/') return { ...item, lastmod, changefreq: 'hourly', priority: 1.0 };
      if (p.startsWith('/codes/') && p !== '/codes/') return { ...item, lastmod, changefreq: 'hourly', priority: 0.9 };
      if (p === '/codes/' || p === '/top/') return { ...item, lastmod, changefreq: 'hourly', priority: 0.8 };
      if (p.startsWith('/games/')) return { ...item, lastmod, changefreq: 'daily', priority: 0.7 };
      if (['/guessr/','/blox-world/','/real-world/','/parkour/','/golf/','/typing/','/trending/','/play/','/quiz/'].includes(p)) return { ...item, changefreq: 'daily', priority: 0.6 };
      return { ...item, changefreq: 'weekly', priority: 0.3 };
    },
  })],
});
