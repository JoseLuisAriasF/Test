// Real World: GeoGuessr with free 360° street photos (Panoramax) and free map tiles (OpenFreeMap + MapLibre).
// Look around, walk along the street, then pin the spot on the world map.
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre does its heavy lifting in a Web Worker; bundle it (with its shared chunk) and tell MapLibre where it is.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(mapWorkerUrl);
import { rng, shuffle, haversine, realScore, fmtKm, rankFor } from '../lib/geo.js';

const $ = (id: string) => document.getElementById(id)!;
const API = 'https://api.panoramax.xyz/api';
const ROUNDS = 5;
const STEPS = 12; // moves along the street per round
const ROUND_TIME = 120;
const day = Math.floor(Date.now() / 864e5);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('rw-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('rw-' + k, JSON.stringify(v)); } catch {} };

type Place = { id: string; col: string; lat: number; lon: number; img: string; by: string; place: string };

// ---------- 360° viewer ----------
const canvas = $('rw-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 1, 1100);
const sphere = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 40).scale(-1, 1, 1), new THREE.MeshBasicMaterial({ color: '#1c212c' }));
scene.add(sphere);
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
let lon = 0, lat = 0, fov = 75, azimuth = 0, autoSpin = true;
let drag: { x: number; y: number; id: number } | null = null;
const pinch = new Map<number, { x: number; y: number }>();
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); autoSpin = false; });
canvas.addEventListener('pointermove', (e) => {
  if (pinch.size === 2 && pinch.has(e.pointerId)) {
    const [a, b] = [...pinch.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c, d] = [...pinch.values()];
    fov = Math.min(95, Math.max(30, fov * (before / Math.max(1, Math.hypot(c.x - d.x, c.y - d.y)))));
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  lon -= (e.clientX - drag.x) * 0.12 * (fov / 75);
  lat = Math.max(-80, Math.min(80, lat + (e.clientY - drag.y) * 0.12 * (fov / 75)));
  drag.x = e.clientX; drag.y = e.clientY;
});
const up = (e: PointerEvent) => { pinch.delete(e.pointerId); if (drag?.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { fov = Math.min(95, Math.max(30, fov + e.deltaY * 0.05)); e.preventDefault(); }, { passive: false });

function loadPano(url: string, az = 0) {
  $('rw-loading').hidden = false;
  return new Promise<void>((ok) => {
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = sphere.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = tex;
      m.color.set('#ffffff');
      m.needsUpdate = true;
      azimuth = az;
      $('rw-loading').hidden = true;
      canvas.classList.remove('rw-in'); void canvas.offsetWidth; canvas.classList.add('rw-in');
      ok();
    }, undefined, () => { $('rw-loading').hidden = true; ok(); });
  });
}

// ---------- map ----------
let map: maplibregl.Map | null = null;
let guessMarker: maplibregl.Marker | null = null;
let truthMarker: maplibregl.Marker | null = null;
let guessLngLat: maplibregl.LngLat | null = null;
function ensureMap() {
  if (map) return map;
  map = new maplibregl.Map({ container: 'rw-mapbox', style: 'https://tiles.openfreemap.org/styles/liberty', center: [10, 30], zoom: 0.8, attributionControl: false, dragRotate: false, pitchWithRotate: false }); // credits: small line in the page, it doesn't cover the mini map
  map.touchZoomRotate.disableRotation();
  map.on('click', (e) => {
    if (state !== 'look') return;
    guessLngLat = e.lngLat;
    if (!guessMarker) guessMarker = new maplibregl.Marker({ element: pinEl('📍', 'rw-pin') }).setLngLat(e.lngLat).addTo(map!);
    else guessMarker.setLngLat(e.lngLat);
    const el = guessMarker.getElement().firstElementChild as HTMLElement;
    el.classList.remove('drop'); void el.offsetWidth; el.classList.add('drop');
    ($('rw-guess') as HTMLButtonElement).disabled = false;
  });
  return map;
}
function pinEl(emoji: string, cls: string) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<span class="${cls} drop">${emoji}</span>`;
  return wrap;
}
function clearLines() {
  if (!map) return;
  for (const id of map.getStyle()?.layers?.map((l) => l.id).filter((id) => id.startsWith('rw-line')) ?? []) map.removeLayer(id);
  for (const id of Object.keys(map.getStyle()?.sources ?? {}).filter((id) => id.startsWith('rw-line'))) map.removeSource(id);
}
function drawLine(id: string, a: [number, number], b: [number, number], animate = true) {
  if (!map) return;
  const src = `rw-line-${id}`;
  const coords = (k: number) => [a, [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]];
  map.addSource(src, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords(animate ? 0 : 1) } } });
  map.addLayer({ id: src, type: 'line', source: src, paint: { 'line-color': '#ff5fa2', 'line-width': 4, 'line-dasharray': [1.5, 1.2] } });
  if (!animate || reduced) return;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 900);
    (map!.getSource(src) as maplibregl.GeoJSONSource)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords(k) } });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- game ----------
type State = 'menu' | 'look' | 'reveal' | 'summary';
let state: State = 'menu';
let pool: Place[] = [];
let rounds: Place[] = [];
let seed = '';
let mode = 'random';
let round = 0, score = 0, steps = STEPS, timeLeft = ROUND_TIME;
let current = { id: '', col: '' };
let results: { km: number; pts: number; place: Place; guess: [number, number] | null }[] = [];

function show(id: string) {
  for (const s of ['rw-menu', 'rw-hud', 'rw-summary']) $(s).hidden = s !== id;
  $('rw-mapwrap').hidden = id !== 'rw-hud';
}

async function start(m: string, s?: string) {
  if (!pool.length) pool = await fetch('/realworld.json').then((r) => r.json());
  mode = m;
  seed = s ?? (m === 'daily' ? `rw${day}` : Math.random().toString(36).slice(2, 8));
  // 5 places from 5 different regions
  const seen = new Set<string>();
  rounds = shuffle(rng(`real:${seed}`), pool).filter((p) => (seen.has(p.place) ? false : (seen.add(p.place), true))).slice(0, ROUNDS);
  round = 0; score = 0; results = [];
  $('rw-score').textContent = '0';
  $('rw-seed').textContent = mode === 'daily' ? `📅 Daily #${day - 20722}` : `🌍 Game ${seed.toUpperCase()}`;
  show('rw-hud');
  ensureMap();
  nextRound();
}

async function nextRound() {
  const p = rounds[round];
  state = 'look';
  steps = STEPS;
  timeLeft = ROUND_TIME;
  guessLngLat = null;
  guessMarker?.remove(); guessMarker = null;
  truthMarker?.remove(); truthMarker = null;
  clearLines();
  map?.jumpTo({ center: [10, 30], zoom: 0.8 });
  $('rw-mapwrap').classList.remove('open', 'reveal');
  ($('rw-guess') as HTMLButtonElement).disabled = true;
  $('rw-result').hidden = true;
  $('rw-round').textContent = `Round ${round + 1}/${ROUNDS}`;
  current = { id: p.id, col: p.col };
  lon = Math.random() * 360; lat = 0; fov = 75; autoSpin = true;
  updateSteps();
  $('rw-credit').textContent = `📷 ${p.by} · CC-BY-SA 4.0 · Panoramax`;
  await loadPano(p.img);
  banner(`Round ${round + 1}`, 'Look around... where in the world is this? 🌍');
}

function updateSteps() {
  $('rw-steps').textContent = `👣 ${steps}`;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-move]')) b.disabled = steps <= 0 || state !== 'look';
}

// Walk along the street: follow the photo sequence (next/prev picture).
async function move(dir: 'next' | 'prev') {
  if (steps <= 0 || state !== 'look') return;
  const btns = document.querySelectorAll<HTMLButtonElement>('[data-move]');
  btns.forEach((b) => (b.disabled = true));
  try {
    const item = await fetch(`${API}/collections/${current.col}/items/${current.id}`).then((r) => r.json());
    const href = item.links?.find((l: any) => l.rel === dir)?.href;
    if (!href) { toast(dir === 'next' ? "Can't go further this way" : "Can't go back further"); return; }
    const nextItem = await fetch(href).then((r) => r.json());
    if (nextItem.properties?.['pers:interior_orientation']?.field_of_view !== 360 || !nextItem.assets?.sd?.href) { toast('No 360° photo that way'); return; }
    steps--;
    current = { id: nextItem.id, col: nextItem.collection ?? current.col };
    await loadPano(nextItem.assets.sd.href);
  } catch {
    toast('Could not load the next photo');
  } finally {
    updateSteps();
  }
}
for (const b of document.querySelectorAll<HTMLElement>('[data-move]')) b.onclick = () => move(b.dataset.move as 'next' | 'prev');

function toast(msg: string) {
  const t = $('rw-toast');
  t.textContent = msg;
  t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
}
function banner(title: string, sub: string) {
  const b = $('rw-banner');
  b.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}

$('rw-mapwrap').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && state === 'look') { $('rw-mapwrap').classList.add('open'); map?.resize(); } });
$('rw-mapwrap').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && state === 'look' && !guessLngLat) $('rw-mapwrap').classList.remove('open'); setTimeout(() => map?.resize(), 260); });
$('rw-maptoggle').onclick = () => { $('rw-mapwrap').classList.toggle('open'); setTimeout(() => map?.resize(), 260); };
$('rw-guess').onclick = () => guess();

function guess() {
  if (state !== 'look') return;
  state = 'reveal';
  updateSteps();
  const p = rounds[round];
  const g = guessLngLat;
  const km = g ? haversine(g.lat, g.lng, p.lat, p.lon) : Infinity;
  const pts = g ? realScore(km) : 0;
  results.push({ km, pts, place: p, guess: g ? [g.lng, g.lat] : null });
  const wrap = $('rw-mapwrap');
  wrap.classList.add('open', 'reveal');
  setTimeout(() => {
    map!.resize();
    truthMarker = new maplibregl.Marker({ element: pinEl('🎯', 'rw-pin truth') }).setLngLat([p.lon, p.lat]).addTo(map!);
    if (g) {
      drawLine(String(round), [g.lng, g.lat], [p.lon, p.lat]);
      map!.fitBounds([[Math.min(g.lng, p.lon), Math.min(g.lat, p.lat)], [Math.max(g.lng, p.lon), Math.max(g.lat, p.lat)]], { padding: 70, maxZoom: 13, duration: reduced ? 0 : 1600 });
    } else map!.flyTo({ center: [p.lon, p.lat], zoom: 5, duration: reduced ? 0 : 1600 });
  }, 280);
  const from = score;
  score += pts;
  countUp($('rw-score'), from, score);
  const r = $('rw-result');
  r.hidden = false;
  r.innerHTML = `<div class="rw-pts">${pts ? `+${pts.toLocaleString('en')}` : '0'}</div>
    <p>📍 <b>${p.place}</b></p>
    <p class="small muted">${g ? `${fmtKm(km)} away` : "⏰ Time's up - no guess!"}</p>
    <button class="btn primary" id="rw-next" type="button">${round + 1 >= ROUNDS ? 'See results 🏁' : 'Next round →'}</button>`;
  $('rw-next').onclick = () => { round++; round >= ROUNDS ? finish() : nextRound(); };
  if (pts >= 4000) confetti(70);
}

function finish() {
  state = 'summary';
  show('rw-summary');
  const pct = score / (ROUNDS * 5000);
  const key = mode === 'daily' ? `daily-${day}` : 'best';
  const best = read(key);
  if (best == null || score > best) write(key, score);
  $('rw-sum').innerHTML = `<p class="pill" style="margin:0 auto">${$('rw-seed').textContent}</p>
    <h2>${rankFor(pct)}</h2>
    <p class="num" style="font-size:2.6rem;margin:0">${score.toLocaleString('en')}<span class="muted" style="font-size:1rem"> / ${(ROUNDS * 5000).toLocaleString('en')}</span></p>
    <div class="rw-list">${results.map((r, i) => `<div style="--i:${i}"><span>${i + 1}. ${r.place.place}</span><b>${r.pts.toLocaleString('en')}</b><small>${Number.isFinite(r.km) ? fmtKm(r.km) : '-'}</small></div>`).join('')}</div>
    <p class="muted">${best == null || score > best ? '🎉 New best!' : `Your best: ${best.toLocaleString('en')}`}</p>`;
  if (pct >= 0.5) confetti(180);
}
$('rw-again').onclick = () => start('random');
$('rw-daily').onclick = () => start('daily');
$('rw-share').onclick = async () => {
  const text = `🌍 BibiBox Real World ${mode === 'daily' ? `Daily #${day - 20722}` : ''} - ${score.toLocaleString('en')}/${(ROUNDS * 5000).toLocaleString('en')}\n${results.map((r) => (r.pts >= 4000 ? '🟩' : r.pts >= 1500 ? '🟨' : '🟥')).join('')}\nSame places, can you beat me? ${location.origin}/real-world/?g=${seed}`;
  try { navigator.share ? await navigator.share({ text }) : await navigator.clipboard.writeText(text); $('rw-share').textContent = '✅ Copied!'; } catch {}
};
for (const b of document.querySelectorAll<HTMLElement>('[data-rw-start]')) b.onclick = () => start(b.dataset.rwStart!, b.dataset.rwStart === 'challenge' ? params.get('g')! : undefined);

function countUp(el: HTMLElement, from: number, to: number) {
  const s = performance.now();
  const f = (t: number) => { const k = Math.min(1, (t - s) / 700); el.textContent = Math.round(from + (to - from) * k).toLocaleString('en'); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
function confetti(n: number) {
  if (reduced) return;
  const c = $('rw-confetti') as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#6d7ff0', '#ff5fa2', '#3ecf8e', '#ffcc33', '#3cc8ff', '#ff8a3d'];
  const bits = Array.from({ length: n }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: colors[Math.floor(Math.random() * 6)], a: Math.random() * 6 }));
  const s = performance.now();
  const f = (t: number) => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) { b.vy += 0.45; b.x += b.vx; b.y += b.vy; b.a += 0.2; ctx.fillStyle = b.c; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore(); }
    if (t - s < 2500) requestAnimationFrame(f); else ctx.clearRect(0, 0, c.width, c.height);
  };
  requestAnimationFrame(f);
}

// ---------- loop ----------
const clock = new THREE.Clock();
function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (autoSpin && !reduced) lon += dt * 4;
  if (state === 'look') {
    timeLeft = Math.max(0, timeLeft - dt);
    $('rw-time').textContent = String(Math.ceil(timeLeft));
    $('rw-time').classList.toggle('hurry', timeLeft <= 15);
    (($('rw-ring') as unknown) as SVGCircleElement).style.strokeDashoffset = String(100 - (timeLeft / ROUND_TIME) * 100);
    if (timeLeft === 0) guess();
  }
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon);
  camera.lookAt(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
  ($('rw-needle') as HTMLElement).style.transform = `rotate(${-(lon + 90 + azimuth)}deg)`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// boot
(async () => {
  resize();
  const best = read('best'), daily = read(`daily-${day}`);
  $('rw-best').textContent = [best != null ? `🏆 Best: ${best.toLocaleString('en')}` : '', daily != null ? `📅 Today: ${daily.toLocaleString('en')}` : ''].filter(Boolean).join(' · ');
  if (params.get('g')) $('rw-challenge').hidden = false;
  show('rw-menu');
  frame();
  // a live 360° photo spins behind the menu
  pool = await fetch('/realworld.json').then((r) => r.json()).catch(() => []);
  if (pool.length) loadPano(pool[day % pool.length].img);
})();
