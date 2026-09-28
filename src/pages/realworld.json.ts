import pool from '../data/realworld.json';

// 360° street photo pool for Real World mode (Panoramax, CC-BY-SA 4.0). Loaded by the browser when a game starts.
export const GET = () => Response.json(pool.items);
