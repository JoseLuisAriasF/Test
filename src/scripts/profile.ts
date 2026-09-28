// Player profile in the browser: a guest profile saved on this device, optionally linked to Google (13+).
import { tierOf, nextTier } from '../lib/rounds.js';
import { avatarCard } from '../lib/avatar.js';

export type Profile = {
  id: string; tok: string; name: string; avatar: any; elo: number; rank: number; ranked: number; google: boolean;
  stats: { games: number; wins: number; correct: number; streak: number; perfect: number; peak: number };
  pk?: { elo: number; wins: number; games: number }; // Infinite Parkour race rating
};

const KEY = 'rg-me';
const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const saved = (): { id: string; tok: string } | null => read(KEY);
const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
};
const keep = (p: Profile) => { write(KEY, { id: p.id, tok: p.tok }); return p; };

// create=false: only load an existing profile (don't make rows for every visitor).
export async function loadProfile(create = false, extra = {}): Promise<Profile | null> {
  const s = saved();
  if (!s && !create) return null;
  try { return keep(await post('/api/me', { ...s, ...extra })); } catch { return null; }
}
export const saveAvatar = async (avatar: unknown) => keep(await post('/api/avatar', { ...saved(), avatar }));
// Transfer code: move a profile to another device without Google (e.g. players under 13).
export const transferCode = async (renew = false): Promise<string> => (await post('/api/transfer', { ...saved(), renew })).code;
export const redeemCode = async (code: string) => keep(await post('/api/redeem', { code }));
export const logout = () => { try { localStorage.removeItem(KEY); } catch {} };

export function tierHTML(elo: number) {
  const t = tierOf(elo);
  return `<span class="tier" style="--tc:${t.c}">${t.e} ${t.name}</span>`;
}
export function tierProgress(elo: number) {
  const t = tierOf(elo);
  const n = nextTier(elo);
  return n ? { pct: ((elo - t.min) / (n.min - t.min)) * 100, label: `${n.min - elo} to ${n.e} ${n.name}` } : { pct: 100, label: 'Max tier!' };
}

// Card used in the RoGuessr menu and the locker.
export function profileCard(p: Profile | null) {
  if (!p) return `<div class="rg-pc">${avatarCard({}, 76)}<div><b style="color:var(--head);font:600 1.2rem var(--fun)">Guest</b><p class="small muted" style="margin:2px 0 8px">Make a free player card to play Ranked, save progress and unlock cosmetics.</p><span style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary" href="/avatar/">✨ Create my avatar</a><a class="btn" href="/avatar/#device">🔑 I already have one</a></span></div></div>`;
  const prog = tierProgress(p.elo);
  return `<div class="rg-pc">${avatarCard(p.avatar, 76)}<div style="flex:1;min-width:0">
    <b style="color:var(--head);font:600 1.2rem var(--fun)">${p.name}</b> ${tierHTML(p.elo)}
    <p class="small muted" style="margin:4px 0">⭐ ${p.elo} rating${p.rank ? ` · #${p.rank} in the world` : ''} · 🏆 ${p.stats.wins} wins</p>
    <div class="progress"><i style="width:${prog.pct}%"></i></div><p class="small muted" style="margin:4px 0 8px">${prog.label}</p>
    <span style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/avatar/">👕 Avatar & cosmetics</a><a class="btn" href="/ranking/">🏆 Ranking</a></span>
    ${p.google ? '' : '<div id="gsave" class="gsave"></div>'}
  </div></div>`;
}

// "Sign in with Google" behind a neutral age question: Google accounts are 13+ (COPPA),
// younger players keep playing with the guest profile saved on this device.
export function mountGoogle(el: HTMLElement, clientId: string, onDone: (p: Profile) => void) {
  if (!clientId) { el.innerHTML = ''; return; }
  const age = read('rg-13');
  if (age === null) {
    const year = new Date().getFullYear();
    el.innerHTML = `<p class="small" style="margin:0 0 6px">💾 Save your progress forever: what year were you born?</p>
      <span style="display:flex;gap:8px"><select class="btn" aria-label="Birth year"><option value="">Year…</option>${Array.from({ length: 70 }, (_, i) => `<option>${year - 5 - i}</option>`).join('')}</select><button class="btn primary" type="button">OK</button></span>`;
    el.querySelector('button')!.onclick = () => {
      const y = +(el.querySelector('select') as HTMLSelectElement).value;
      if (!y) return;
      write('rg-13', year - y >= 13); // only a yes/no is kept, on this device
      mountGoogle(el, clientId, onDone);
    };
    return;
  }
  if (!age) {
    el.innerHTML = `<p class="small muted" style="margin:0">🛡️ Your progress is saved on this device. Ask a parent if you want to link a Google account (Family Link).</p>`;
    return;
  }
  el.innerHTML = '<div class="gbtn"></div><p class="small muted" style="margin:6px 0 0">We only keep an anonymous ID. No email, no real name.</p>';
  const go = () => {
    const g = (window as any).google.accounts.id;
    g.initialize({
      client_id: clientId,
      callback: async (res: { credential: string }) => {
        try { onDone(keep(await post('/api/login', { credential: res.credential, ...saved() }))); } catch (e) { alert((e as Error).message); }
      },
    });
    g.renderButton(el.querySelector('.gbtn'), { theme: 'filled_black', shape: 'pill', text: 'continue_with', size: 'large' });
  };
  if ((window as any).google?.accounts) return go();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = go;
  document.head.append(s);
}
