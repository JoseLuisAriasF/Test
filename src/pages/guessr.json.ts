import { games } from '../lib/data.js';

// Question pool for RoGuessr (browser + VS Worker both read this file). Field names are short to keep it small.
export const GET = () =>
  Response.json(
    games.filter((g) => g.icon).map((g) => ({
      id: g.id, t: g.title, s: g.slug, g: g.genre, i: g.icon, c: g.creator,
      y: new Date(g.created).getUTCFullYear(), n: g.playing, v: g.visits, sh: g.thumbs,
      cd: g.codes.active.slice(0, 6).map((c) => ({ c: c.code, r: c.reward })),
      b: g.badges.slice(0, 8).map((b) => b.name),
    })),
  );
