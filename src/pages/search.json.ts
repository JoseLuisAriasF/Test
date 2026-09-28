import { games } from '../lib/data.js';

export const GET = () => Response.json(games.map((g) => ({ t: g.title, s: g.slug, i: g.icon, c: g.codes.active.length })));
