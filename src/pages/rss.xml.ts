import { games, SITE_NAME } from '../lib/data.js';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

// Feed of newly found codes, newest first.
export const GET = ({ site }: { site: URL }) => {
  const items = games
    .flatMap((g) => g.codes.active.filter((c) => c.added).map((c) => ({ c, g })))
    .sort((a, b) => b.c.added.localeCompare(a.c.added))
    .slice(0, 50)
    .map(({ c, g }) => {
      const link = new URL(`/codes/${g.slug}/`, site).href;
      return `<item><title>${esc(`New ${g.title} code: ${c.code}`)}</title><link>${link}</link><guid isPermaLink="false">${esc(`${g.id}-${c.code}`)}</guid><pubDate>${new Date(c.added).toUTCString()}</pubDate><description>${esc(c.reward)}</description></item>`;
    });
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${SITE_NAME}: new Roblox codes</title><link>${site}</link><description>New working Roblox codes as soon as we find them.</description>${items.join('')}</channel></rss>`,
    { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } },
  );
};
