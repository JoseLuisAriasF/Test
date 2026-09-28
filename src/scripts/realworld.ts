// Real World: GeoGuessr-style game on free 360° street photos (Panoramax) + free map tiles (OpenFreeMap/MapLibre).
// Street View-like navigation: arrows on the ground (including side streets), click the road to walk,
// smooth zoom+fade transitions that keep your heading, undo / return to start, Move / No Move / NMPZ.
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre does its heavy lifting in a Web Worker; bundle it (with its shared chunk) and tell MapLibre where it is.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { rng, shuffle, haversine, realScore, fmtKm, rankFor, bearing, angleDiff, placeInfo } from '../lib/geo.js';
maplibregl.setWorkerUrl(mapWorkerUrl);

const $ = (id: string) => document.getElementById(id)!;
const API = 'https://api.panoramax.xyz/api';
const ROUNDS = 5;
const TIMES: Record<string, number> = { move: 150, nm: 90, nmpz: 60 };
const MODES: Record<string, string> = { move: '🚶 Move', nm: '🧍 No Move', nmpz: '📸 NMPZ' };
const day = Math.floor(Date.now() / 864e5);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const read = (k: string) => { try { return JSON.parse(localStorage.getItem('rw-' + k) || 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem('rw-' + k, JSON.stringify(v)); } catch {} };

type Place = { id: string; col: string; lat: number; lon: number; img: string; by: string; place: string };
type Ref = { col: string; id: string };
type Pano = { id: string; col: string; lat: number; lon: number; az: number; img: string; next?: Ref; prev?: Ref; by?: string };

// ---------- Panoramax data (cached) ----------
const panoCache = new Map<string, Pano>();
const refOf = (href?: string): Ref | undefined => {
  const m = href?.match(/collections\/([^/]+)\/items\/([^/?#]+)/);
  return m ? { col: m[1], id: m[2] } : undefined;
};
function panoFromFeature(f: any): Pano | null {
  const img = f?.assets?.sd?.href;
  const [lon, lat] = f?.geometry?.coordinates ?? [];
  if (!img || !Number.isFinite(lat) || f.properties?.['pers:interior_orientation']?.field_of_view !== 360) return null;
  const p: Pano = {
    id: f.id, col: f.collection, lat, lon, img, az: +(f.properties?.['view:azimuth'] ?? 0),
    next: refOf(f.links?.find((l: any) => l.rel === 'next')?.href), prev: refOf(f.links?.find((l: any) => l.rel === 'prev')?.href),
    by: (f.providers ?? f.properties?.providers ?? [])[0]?.name,
  };
  panoCache.set(p.id, p);
  return p;
}
async function fetchPano(ref: Ref): Promise<Pano | null> {
  if (panoCache.has(ref.id)) return panoCache.get(ref.id)!;
  const f = await fetch(`${API}/collections/${ref.col}/items/${ref.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return panoFromFeature(f);
}
const metersBetween = (a: Pano, b: Pano) => haversine(a.lat, a.lon, b.lat, b.lon) * 1000;
// Where can we walk from here? The previous/next photo of this street + photos of other streets nearby (junctions).
async function neighbors(p: Pano): Promise<Pano[]> {
  const d = 0.00035;
  const [seq, res] = await Promise.all([
    Promise.all([p.next, p.prev].map((ref) => (ref ? fetchPano(ref) : null))),
    fetch(`${API}/search?limit=24&bbox=${[p.lon - d, p.lat - d, p.lon + d, p.lat + d].join(',')}&filter=field_of_view%3D360`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const out = seq.filter((n): n is Pano => !!n && metersBetween(p, n) < 60);
  const sides = (res?.features ?? []).map(panoFromFeature)
    .filter((n: Pano | null): n is Pano => !!n && n.col !== p.col)
    .map((n: Pano) => ({ n, m: metersBetween(p, n), b: bearing(p.lat, p.lon, n.lat, n.lon) }))
    .filter((x: { m: number }) => x.m > 5 && x.m < 40)
    .sort((a: { m: number }, b: { m: number }) => a.m - b.m);
  for (const s of sides) {
    const taken = out.some((o) => angleDiff(bearing(p.lat, p.lon, o.lat, o.lon), s.b) < 35);
    if (!taken && out.length < 6) out.push(s.n);
  }
  return out;
}

// ---------- 360° viewer ----------
const canvas = $('rw-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
const sphereGeo = new THREE.SphereGeometry(500, 64, 40).scale(-1, 1, 1);
const mkSphere = (order: number) => {
  const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: '#1c212c', transparent: true, depthWrite: false }));
  m.renderOrder = order;
  scene.add(m);
  return m;
};
const sphereA = mkSphere(0), sphereB = mkSphere(1);
const matA = sphereA.material as THREE.MeshBasicMaterial, matB = sphereB.material as THREE.MeshBasicMaterial;
sphereB.visible = false;
const texCache = new Map<string, Promise<THREE.Texture>>();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
function loadTex(url: string) {
  if (!texCache.has(url)) {
    const p = new Promise<THREE.Texture>((ok, bad) => texLoader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, bad));
    p.catch(() => texCache.delete(url));
    texCache.set(url, p);
    if (texCache.size > 16) { // small LRU: free GPU memory of old photos
      const [oldUrl, old] = texCache.entries().next().value!;
      texCache.delete(oldUrl);
      old.then((t) => { if (t !== matA.map && t !== matB.map) t.dispose(); }, () => {});
    }
  }
  return texCache.get(url)!;
}
function setTex(m: THREE.MeshBasicMaterial, tex: THREE.Texture) {
  m.map = tex; m.color.set('#ffffff'); m.needsUpdate = true;
}

// Ground arrows (Street View chevrons) + a cursor ring that follows the mouse on the road.
const GROUND_Y = -1.7, ARROW_R = 3.4;
const chevron = new THREE.Shape();
chevron.moveTo(0.95, 0); chevron.lineTo(-0.35, 0.8); chevron.lineTo(-0.05, 0); chevron.lineTo(-0.35, -0.8); chevron.closePath();
const chevronGeo = new THREE.ShapeGeometry(chevron).rotateX(-Math.PI / 2);
const arrows = new THREE.Group();
scene.add(arrows);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthTest: false }));
ring.renderOrder = 6;
ring.visible = false;
scene.add(ring);
function buildArrows(list: Pano[]) {
  arrows.clear();
  for (const n of list) {
    // photo "lon" 180° is where the photographer looked (view:azimuth); convert the real-world bearing to viewer space
    const theta = THREE.MathUtils.degToRad(180 + bearing(cur!.lat, cur!.lon, n.lat, n.lon) - cur!.az);
    const g = new THREE.Group();
    const shadow = new THREE.Mesh(chevronGeo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthTest: false }));
    shadow.scale.setScalar(1.18);
    shadow.position.y = -0.01;
    const face = new THREE.Mesh(chevronGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthTest: false }));
    shadow.renderOrder = 5; face.renderOrder = 6;
    g.add(shadow, face);
    g.position.set(Math.cos(theta) * ARROW_R, GROUND_Y, Math.sin(theta) * ARROW_R);
    g.rotation.y = -theta;
    g.userData = { pano: n, face, t0: performance.now() };
    arrows.add(g);
  }
}

let lon = 180, lat = 0, fov = 75, autoSpin = true;
let drag: { x: number; y: number; id: number; moved: number; t: number } | null = null;
const pinch = new Map<number, { x: number; y: number }>();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function aim(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(arrows.children, true)[0]?.object.parent ?? null;
}
const canLook = () => mode !== 'nmpz' || state !== 'look';
const canMove = () => mode === 'move' && state === 'look' && !moving;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0, t: performance.now() };
  pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  autoSpin = false;
});
canvas.addEventListener('pointermove', (e) => {
  if (pinch.size === 2 && pinch.has(e.pointerId)) {
    const [a, b] = [...pinch.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c, d] = [...pinch.values()];
    if (canLook()) fov = Math.min(95, Math.max(25, fov * (before / Math.max(1, Math.hypot(c.x - d.x, c.y - d.y)))));
    if (drag) drag.moved += 99;
    return;
  }
  if (drag && drag.id === e.pointerId) {
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    if (canLook()) {
      lon -= (e.clientX - drag.x) * 0.12 * (fov / 75);
      lat = Math.max(-85, Math.min(85, lat + (e.clientY - drag.y) * 0.12 * (fov / 75)));
    }
    drag.x = e.clientX; drag.y = e.clientY;
    ring.visible = false;
    return;
  }
  // hover (mouse): highlight arrows, show the walk cursor on the road
  if (!canMove() || e.pointerType !== 'mouse') { ring.visible = false; return; }
  const hit = aim(e);
  for (const g of arrows.children) ((g.userData.face as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(g === hit ? '#ffcc33' : '#ffffff');
  const dir = ray.ray.direction;
  if (!hit && dir.y < -0.08) {
    const k = Math.min(GROUND_Y / dir.y, 9);
    ring.position.set(dir.x * k, GROUND_Y, dir.z * k);
    ring.visible = true;
  } else ring.visible = false;
  canvas.style.cursor = hit || ring.visible ? 'pointer' : 'grab';
});
const pointerUp = (e: PointerEvent) => {
  pinch.delete(e.pointerId);
  if (drag?.id !== e.pointerId) return;
  const isClick = drag.moved < 8 && performance.now() - drag.t < 450;
  drag = null;
  if (isClick && canMove()) clickToWalk(e);
};
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
canvas.addEventListener('wheel', (e) => { if (canLook()) fov = Math.min(95, Math.max(25, fov + e.deltaY * 0.05)); e.preventDefault(); }, { passive: false });
addEventListener('keydown', (e) => {
  if (!canMove()) return;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') { walkToward(heading()); e.preventDefault(); }
  if (e.code === 'KeyS' || e.code === 'ArrowDown') { walkToward(heading() + 180); e.preventDefault(); }
});
// real-world compass heading of the camera (0 = north)
const heading = () => ((((cur?.az ?? 0) + lon - 180) % 360) + 360) % 360;

function clickToWalk(e: PointerEvent) {
  const hit = aim(e);
  if (hit) return go(hit.userData.pano);
  const dir = ray.ray.direction;
  if (dir.y > -0.05) return; // clicked the sky / buildings: just looking
  walkToward(cur!.az + THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)) - 180, 45);
}
function walkToward(b: number, maxDiff = 90) {
  const best = currentNeighbors
    .map((n) => ({ n, d: angleDiff(bearing(cur!.lat, cur!.lon, n.lat, n.lon), ((b % 360) + 360) % 360) }))
    .filter((x) => x.d <= maxDiff)
    .sort((a, c) => a.d - c.d)[0];
  if (best) go(best.n);
  else toast(currentNeighbors.length ? "Can't walk that way" : 'Dead end! Try ↩ or 🏠');
}

// ---------- moving between photos ----------
let cur: Pano | null = null;
let startPano: Pano | null = null;
let history: Pano[] = [];
let currentNeighbors: Pano[] = [];
let moving = false;
let fade: { t0: number; dur: number } | null = null;
async function show360(p: Pano) {
  const keepHeading = cur ? heading() : null;
  const slow = setTimeout(() => ($('rw-loading').hidden = false), 150);
  const tex = await loadTex(p.img).catch(() => null);
  clearTimeout(slow);
  $('rw-loading').hidden = true;
  if (!tex) { toast('Could not load that photo'); return false; }
  if (!cur || reduced) setTex(matA, tex);
  else {
    // crossfade + a little "step forward" zoom, like Street View
    setTex(matB, tex);
    matB.opacity = 0;
    sphereB.visible = true;
    fade = { t0: performance.now(), dur: 450 };
    await new Promise((r) => setTimeout(r, 460));
    setTex(matA, tex);
    sphereB.visible = false;
    fade = null;
  }
  cur = p;
  if (keepHeading != null) lon = 180 + keepHeading - p.az; // keep looking the same way after the step
  $('rw-credit').textContent = `📷 ${p.by ?? rounds[round]?.by ?? 'Panoramax'} · CC-BY-SA 4.0 · Panoramax`;
  arrows.clear();
  currentNeighbors = [];
  if (mode === 'move' && state === 'look') {
    const list = await neighbors(p);
    if (cur !== p || state !== 'look') return true;
    currentNeighbors = list;
    buildArrows(list);
    for (const n of list) loadTex(n.img).catch(() => {}); // preload: the next step feels instant
  }
  return true;
}
async function go(n: Pano, record = true) {
  if (moving || !cur) return;
  moving = true;
  ring.visible = false;
  const from = cur;
  if (await show360(n)) {
    if (record) history.push(from);
    steps++;
  }
  moving = false;
  updateNav();
}
function updateNav() {
  ($('rw-undo') as HTMLButtonElement).disabled = !history.length;
  ($('rw-home') as HTMLButtonElement).disabled = cur === startPano;
  $('rw-steps').textContent = `👣 ${steps}`;
}
$('rw-undo').onclick = () => { const p = history.pop(); if (p) go(p, false); };
$('rw-home').onclick = () => { if (startPano && cur !== startPano) { history = []; go(startPano, false); } };
$('rw-hint').onclick = () => {
  if (hintUsed || state !== 'look') return;
  hintUsed = true;
  ($('rw-hint') as HTMLButtonElement).disabled = true;
  toast(`💡 This place is in ${placeInfo(rounds[round].place).continent} (max 4,000 points)`, 3500);
};

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
function drawLine(id: string, a: [number, number], b: [number, number]) {
  if (!map) return;
  const src = `rw-line-${id}`;
  const coords = (k: number) => [a, [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]];
  map.addSource(src, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords(reduced ? 1 : 0) } } });
  map.addLayer({ id: src, type: 'line', source: src, paint: { 'line-color': '#ff5fa2', 'line-width': 4, 'line-dasharray': [1.5, 1.2] } });
  if (reduced) return;
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
let kind = 'random';
let mode: string = MODES[read('mode')] ? read('mode') : 'move';
let round = 0, score = 0, timeLeft = TIMES.move, steps = 0, hintUsed = false;
let results: { km: number; pts: number; place: Place }[] = [];

function show(id: string) {
  for (const s of ['rw-menu', 'rw-hud', 'rw-summary']) $(s).hidden = s !== id;
  $('rw-mapwrap').hidden = id !== 'rw-hud';
}
function renderModes() {
  $('rw-modes').innerHTML = Object.entries(MODES).map(([k, v]) => `<button type="button" class="rw-mode ${k === mode ? 'on' : ''}" data-mode="${k}">${v}</button>`).join('');
  $('rw-modehelp').textContent = { move: 'Walk the streets with the arrows. 2:30 per round.', nm: 'Look around and zoom, but no walking! 1:30 per round.', nmpz: 'No moving, no turning, no zoom. Pro mode! 1:00 per round.' }[mode]!;
}
$('rw-modes').onclick = (e) => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
  if (m) { mode = m; write('mode', m); renderModes(); }
};

async function begin(k: string, s?: string) {
  if (!pool.length) pool = await fetch('/realworld.json').then((r) => r.json());
  kind = k;
  if (k === 'daily') mode = 'move';
  if (k === 'challenge' && MODES[params.get('m') ?? '']) mode = params.get('m')!;
  seed = s ?? (k === 'daily' ? `rw${day}` : Math.random().toString(36).slice(2, 8));
  // 5 places from 5 different regions
  const seen = new Set<string>();
  rounds = shuffle(rng(`real:${seed}`), pool).filter((p) => (seen.has(p.place) ? false : (seen.add(p.place), true))).slice(0, ROUNDS);
  round = 0; score = 0; results = [];
  $('rw-score').textContent = '0';
  $('rw-seed').textContent = `${k === 'daily' ? `📅 Daily #${day - 20722}` : `🌍 ${seed.toUpperCase()}`} · ${MODES[mode]}`;
  show('rw-hud');
  $('rw-nav').hidden = mode !== 'move';
  ensureMap();
  nextRound();
}

async function nextRound() {
  const p = rounds[round];
  state = 'look';
  timeLeft = TIMES[mode];
  steps = 0; hintUsed = false; history = [];
  ($('rw-hint') as HTMLButtonElement).disabled = false;
  guessLngLat = null;
  guessMarker?.remove(); guessMarker = null;
  truthMarker?.remove(); truthMarker = null;
  clearLines();
  map?.jumpTo({ center: [10, 30], zoom: 0.8 });
  $('rw-mapwrap').classList.remove('open', 'reveal');
  ($('rw-guess') as HTMLButtonElement).disabled = true;
  $('rw-result').hidden = true;
  $('rw-round').textContent = `Round ${round + 1}/${ROUNDS}`;
  lat = 0; fov = 75; autoSpin = mode !== 'nmpz';
  lon = Math.random() * 360;
  cur = null;
  const first = (await fetchPano({ col: p.col, id: p.id })) ?? { id: p.id, col: p.col, lat: p.lat, lon: p.lon, az: 0, img: p.img };
  first.by ??= p.by;
  startPano = first;
  await show360(first);
  updateNav();
  banner(`Round ${round + 1}`, mode === 'move' ? 'Follow the arrows or click the road 👣' : mode === 'nm' ? 'No walking! Look closely 👀' : 'One look only! 📸');
}

function toast(msg: string, ms = 2000) {
  const t = $('rw-toast');
  t.textContent = msg;
  t.style.animationDuration = `${ms}ms`;
  t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
}
function banner(title: string, sub: string) {
  const b = $('rw-banner');
  b.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}

$('rw-mapwrap').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && state === 'look') { $('rw-mapwrap').classList.add('open'); setTimeout(() => map?.resize(), 260); } });
$('rw-mapwrap').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && state === 'look' && !guessLngLat) { $('rw-mapwrap').classList.remove('open'); setTimeout(() => map?.resize(), 260); } });
$('rw-maptoggle').onclick = () => { $('rw-mapwrap').classList.toggle('open'); setTimeout(() => map?.resize(), 260); };
$('rw-guess').onclick = () => guess();

function guess() {
  if (state !== 'look') return;
  state = 'reveal';
  arrows.clear(); ring.visible = false;
  const p = rounds[round];
  const info = placeInfo(p.place);
  const g = guessLngLat;
  const km = g ? haversine(g.lat, g.lng, p.lat, p.lon) : Infinity;
  const pts = g ? Math.round(realScore(km) * (hintUsed ? 0.8 : 1)) : 0;
  results.push({ km, pts, place: p });
  $('rw-mapwrap').classList.add('open', 'reveal');
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
    <p><span class="rw-flag">${info.flag}</span> <b>${p.place}</b></p>
    <p class="small muted">${g ? `${fmtKm(km)} away` : "⏰ Time's up - no guess!"}${hintUsed ? ' · 💡 hint' : ''}${mode === 'move' ? ` · 👣 ${steps} steps` : ''}</p>
    <button class="btn primary" id="rw-next" type="button">${round + 1 >= ROUNDS ? 'See results 🏁' : 'Next round →'}</button>`;
  $('rw-next').onclick = () => { round++; round >= ROUNDS ? finish() : nextRound(); };
  if (pts >= 4000) confetti(70);
}

function finish() {
  state = 'summary';
  show('rw-summary');
  const pct = score / (ROUNDS * 5000);
  const key = kind === 'daily' ? `daily-${day}` : `best-${mode}`;
  const best = read(key);
  if (best == null || score > best) write(key, score);
  $('rw-sum').innerHTML = `<p class="pill" style="margin:0 auto">${$('rw-seed').textContent}</p>
    <h2>${rankFor(pct)}</h2>
    <p class="num" style="font-size:2.6rem;margin:0">${score.toLocaleString('en')}<span class="muted" style="font-size:1rem"> / ${(ROUNDS * 5000).toLocaleString('en')}</span></p>
    <div class="rw-list">${results.map((r, i) => `<div style="--i:${i}"><span>${placeInfo(r.place.place).flag} ${r.place.place}</span><b>${r.pts.toLocaleString('en')}</b><small>${Number.isFinite(r.km) ? fmtKm(r.km) : '-'}</small></div>`).join('')}</div>
    <p class="muted">${best == null || score > best ? '🎉 New best!' : `Your best: ${best.toLocaleString('en')}`}</p>`;
  if (pct >= 0.5) confetti(180);
}
$('rw-again').onclick = () => begin('random');
$('rw-daily').onclick = () => begin('daily');
$('rw-share').onclick = async () => {
  const text = `🌍 BibiBox Real World ${kind === 'daily' ? `Daily #${day - 20722}` : MODES[mode]} - ${score.toLocaleString('en')}/${(ROUNDS * 5000).toLocaleString('en')}\n${results.map((r) => (r.pts >= 4000 ? '🟩' : r.pts >= 1500 ? '🟨' : '🟥')).join('')}\nSame places, can you beat me? ${location.origin}/real-world/?g=${seed}&m=${mode}`;
  try { navigator.share ? await navigator.share({ text }) : await navigator.clipboard.writeText(text); $('rw-share').textContent = '✅ Copied!'; } catch {}
};
for (const b of document.querySelectorAll<HTMLElement>('[data-rw-start]')) b.onclick = () => begin(b.dataset.rwStart!, b.dataset.rwStart === 'challenge' ? params.get('g')! : undefined);

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
  const t = performance.now();
  if (autoSpin && !reduced && state !== 'look') lon += dt * 4;
  if (state === 'look') {
    timeLeft = Math.max(0, timeLeft - dt);
    $('rw-time').textContent = String(Math.ceil(timeLeft));
    $('rw-time').classList.toggle('hurry', timeLeft <= 15);
    (($('rw-ring') as unknown) as SVGCircleElement).style.strokeDashoffset = String(100 - (timeLeft / TIMES[mode]) * 100);
    if (timeLeft === 0) guess();
  }
  // step-forward zoom while the next photo fades in
  let zoom = 0;
  if (fade) {
    const k = Math.min(1, (t - fade.t0) / fade.dur);
    matB.opacity = k * k * (3 - 2 * k);
    zoom = Math.sin(k * Math.PI) * 16;
  }
  camera.fov += (fov - zoom - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon);
  camera.lookAt(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
  // arrows pop in and gently breathe
  for (const g of arrows.children) {
    const age = Math.min(1, (t - g.userData.t0) / 350);
    g.scale.setScalar((0.4 + 0.6 * age) * (1 + Math.sin(t / 320) * 0.05));
  }
  ($('rw-needle') as HTMLElement).style.transform = `rotate(${-heading()}deg)`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// boot
(async () => {
  resize();
  renderModes();
  const best = read(`best-${mode}`) ?? read('best'), daily = read(`daily-${day}`);
  $('rw-best').textContent = [best != null ? `🏆 Best: ${best.toLocaleString('en')}` : '', daily != null ? `📅 Today: ${daily.toLocaleString('en')}` : ''].filter(Boolean).join(' · ');
  if (params.get('g')) $('rw-challenge').hidden = false;
  show('rw-menu');
  frame();
  // a live 360° photo spins behind the menu
  pool = await fetch('/realworld.json').then((r) => r.json()).catch(() => []);
  if (pool.length) loadTex(pool[day % pool.length].img).then((tex) => { if (state === 'menu') setTex(matA, tex); }, () => {});
})();
