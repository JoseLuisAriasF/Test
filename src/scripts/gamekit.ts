// Small helpers shared by Golf Climb and Night Shift: fullscreen, a tiny WebAudio synth (no sound files)
// and Roblox-style stud textures.
import * as THREE from 'three';

// One bump per stud, shaded like the classic plastic. White, so the material colour tints it.
export function studTexture(renderer: THREE.WebGLRenderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  const gr = g.createRadialGradient(28, 27, 4, 32, 32, 19);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#eeeeee'); gr.addColorStop(1, '#bdbdbd');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 33, 17, 0.2, Math.PI - 0.2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// Box with UVs in studs (2 studs per texture tile), so the texture never stretches.
export function studBox(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * 0.5, uv.getY(i) * dims[f][1] * 0.5); }
  return geo;
}

// Real fullscreen where the browser allows it (desktop, Android); iPhone only allows video fullscreen,
// so there the game box is pinned over the whole page instead.
export function fullscreenButton(btn: HTMLElement, box: HTMLElement, onChange: () => void) {
  const doc = document as any;
  const active = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement) || box.classList.contains('fs-fake');
  const sync = () => { btn.textContent = active() ? '🗗' : '⛶'; btn.title = active() ? 'Exit full screen' : 'Full screen'; document.body.classList.toggle('fs-lock', box.classList.contains('fs-fake')); onChange(); };
  btn.addEventListener('click', async () => {
    if (active()) {
      if (box.classList.contains('fs-fake')) box.classList.remove('fs-fake');
      else await (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    } else {
      const req = (box as any).requestFullscreen ?? (box as any).webkitRequestFullscreen;
      try { await req.call(box, { navigationUI: 'hide' }); } catch { box.classList.add('fs-fake'); }
      if (!req) box.classList.add('fs-fake');
    }
    sync();
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('fs-fake')) { box.classList.remove('fs-fake'); sync(); } });
  sync();
}

export function synth(muteKey: string) {
  let ctx: AudioContext | null = null;
  let muted = (() => { try { return localStorage.getItem(muteKey) === '1'; } catch { return false; } })();
  const out = () => (ctx ??= new AudioContext());
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem(muteKey, muted ? '1' : '0'); } catch {} return muted; },
    // a pitched blip sliding from f0 to f1
    note(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.06, at = 0) {
      if (muted) return;
      try {
        const a = out(), now = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.connect(g).connect(a.destination);
        o.start(now); o.stop(now + dur);
      } catch {}
    },
    // filtered white noise: thuds, static, sizzles, screams
    noise(dur: number, vol = 0.1, freq = 1200, at = 0, q = 0.8, type: BiquadFilterType = 'bandpass') {
      if (muted) return;
      try {
        const a = out(), now = a.currentTime + at;
        const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(now);
      } catch {}
    },
    // a sustained tone (ambience, drones); returns a volume knob
    hum(freq: number, type: OscillatorType = 'sawtooth', cutoff = 400) {
      try {
        const a = out(), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = 0;
        o.connect(f).connect(g).connect(a.destination);
        o.start();
        return { set: (v: number) => g.gain.setTargetAtTime(muted ? 0 : v, a.currentTime, 0.3), stop: () => { g.gain.setTargetAtTime(0, a.currentTime, 0.2); o.stop(a.currentTime + 1); } };
      } catch { return { set() {}, stop() {} }; }
    },
  };
}
