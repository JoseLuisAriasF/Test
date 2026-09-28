import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://bibibox.xyz',
  trailingSlash: 'always',
  integrations: [sitemap({ changefreq: 'hourly', lastmod: new Date() })],
});
