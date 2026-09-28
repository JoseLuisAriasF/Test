import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://bloxpulse.pages.dev', // set SITE_URL to your real domain
  trailingSlash: 'always',
  integrations: [sitemap({ changefreq: 'hourly', lastmod: new Date() })],
});
