// Blocky Roblox-style avatars as SVG strings. Shared by the browser and the Worker (which validates unlocks).
// Every cosmetic is drawn against the same head box (x38-82, y18-62) and torso anchor, so it fits every body type.

export const SKINS = ['#f5cd30', '#ffdbb8', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
export const HAIR_COLORS = ['#2b1d14', '#6b3e1f', '#c98b3a', '#f2d16b', '#d94b3a', '#7b5cff', '#ff6fb1', '#e9eef5'];
export const BODIES = { boy: 'Boy', girl: 'Girl', other: 'Other' };
export const RARITY = {
  common: { name: 'Common', c: '#9aa3b2' },
  rare: { name: 'Rare', c: '#3cc8ff' },
  epic: { name: 'Epic', c: '#b86cf5' },
  legendary: { name: 'Legendary', c: '#ffcc33' },
  mythic: { name: 'Mythic', c: '#ff5fa2' },
};
export const SLOTS = { hair: '💇 Hair', hat: '🎩 Hats', face: '😊 Faces', shirt: '👕 Shirts', aura: '✨ Auras', frame: '🖼️ Frames' };
export const STATS = { games: 'battles played', wins: 'battles won', correct: 'correct answers', streak: 'answers in a row', perfect: 'perfect battles', peak: 'rating' };
const tierReq = (elo, name) => ['peak', elo, name];

// Legendary Roblox limiteds inspired the top items (original names/designs, not copies).
// The pricier the real item, the harder ours is to unlock - and the more it moves.
const sparkles = (color, n) => `<g fill="${color}">${[[34, 14], [86, 10], [60, -4], [92, 24], [28, 26], [74, -2], [46, -2]].slice(0, n).map(([x, y], i) => `<path class="fx-twinkle" style="animation-delay:-${i * 0.37}s" d="m${x} ${y} 1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"/>`).join('')}</g>`;
const fedora = (c, band, glow, n) => `<g${glow ? ' class="fx-glow"' : ''}><ellipse cx="60" cy="24" rx="31" ry="5.5" fill="${c}"/><path d="M42 24l3-17q15-7 30 0l3 17z" fill="${c}"/><path d="M52 8q8 5 16 0" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/><path d="M43 17h34l1 6H42z" fill="${band}"/></g>${sparkles('#fff', n)}`;
const horns = (c, dark) => `<path d="M42 24q-16-4-16-26 8 14 22 18z" fill="${c}" stroke="${dark}" stroke-width="1.5"/><path d="M78 24q16-4 16-26-8 14-22 18z" fill="${c}" stroke="${dark}" stroke-width="1.5"/>`;
const valk = (dome, wing, trim) => `<g class="fx-flap" style="transform-origin:right center"><path d="M36 22 8 2q2 16 10 20-8 0-12 6 14 4 30-2z" fill="${wing}"/></g><g class="fx-flap" style="transform-origin:left center;animation-direction:alternate-reverse"><path d="M84 22 112 2q-2 16-10 20 8 0 12 6-14 4-30-2z" fill="${wing}"/></g><path d="M36 28q0-22 24-22t24 22z" fill="${dome}"/><rect x="34" y="24" width="52" height="6" rx="2" fill="${trim}"/><path d="M60 6v20" stroke="${trim}" stroke-width="3"/>`;

const TORSO = {
  boy: 'M34 66h52v48H34z',
  girl: 'M40 66h40l8 48H32z',
  other: 'M36 66h48a4 4 0 0 1 4 4v44H32V70a4 4 0 0 1 4-4z',
};

// req: [stat, amount] | ['top', N] (temporary: only while you hold that ranking spot)
export const ITEMS = [
  // hair (all free)
  { id: 'hair-short', slot: 'hair', name: 'Short', r: 'common', svg: (c) => `<path d="M36 34V22q0-8 8-8h32q8 0 8 8v12l-6-8H42z" fill="${c}"/>` },
  { id: 'hair-long', slot: 'hair', name: 'Long', r: 'common', svg: (c) => `<path d="M34 64V22q0-9 9-9h34q9 0 9 9v42h-8V28H42v36z" fill="${c}"/>` },
  { id: 'hair-pony', slot: 'hair', name: 'Ponytail', r: 'common', svg: (c) => `<path d="M36 34V22q0-8 8-8h32q8 0 8 8v12l-6-8H42z" fill="${c}"/><path d="M84 22q14 4 10 30l-8-4q2-14-2-20z" fill="${c}"/>` },
  { id: 'hair-bun', slot: 'hair', name: 'Bun', r: 'common', svg: (c) => `<circle cx="60" cy="11" r="8" fill="${c}"/><path d="M36 34V22q0-8 8-8h32q8 0 8 8v12l-6-8H42z" fill="${c}"/>` },
  { id: 'hair-curly', slot: 'hair', name: 'Curly', r: 'common', svg: (c) => `<g fill="${c}">${[40, 50, 60, 70, 80].map((x) => `<circle cx="${x}" cy="18" r="7"/>`).join('')}<circle cx="37" cy="28" r="5"/><circle cx="83" cy="28" r="5"/></g>` },
  { id: 'hair-buzz', slot: 'hair', name: 'Buzz', r: 'common', svg: (c) => `<path d="M38 26q0-8 8-8h28q8 0 8 8v2H38z" fill="${c}" opacity=".85"/>` },
  { id: 'hair-none', slot: 'hair', name: 'Bald', r: 'common', svg: () => '' },

  // hats
  { id: 'hat-none', slot: 'hat', name: 'No hat', r: 'common', svg: () => '' },
  { id: 'hat-cap', slot: 'hat', name: 'Blue Cap', r: 'common', svg: () => `<path d="M36 24q0-14 24-14t24 14v4H36z" fill="#3b82f6"/><path d="M60 24h34q2 4-2 6H60z" fill="#2563eb"/>` },
  { id: 'hat-beanie', slot: 'hat', name: 'Cozy Beanie', r: 'common', req: ['games', 3], svg: () => `<path d="M36 26q0-18 24-18t24 18z" fill="#ef4444"/><rect x="34" y="22" width="52" height="8" rx="3" fill="#fca5a5"/><circle cx="60" cy="7" r="5" fill="#fff"/>` },
  { id: 'hat-phones', slot: 'hat', name: 'Gamer Headphones', r: 'rare', req: ['correct', 25], svg: () => `<path d="M34 40V26q0-18 26-18t26 18v14" fill="none" stroke="#1f2937" stroke-width="5"/><rect x="28" y="32" width="10" height="16" rx="4" fill="#6d7ff0"/><rect x="82" y="32" width="10" height="16" rx="4" fill="#6d7ff0"/>` },
  { id: 'hat-cowboy', slot: 'hat', name: 'Cowboy Hat', r: 'rare', req: ['wins', 3], svg: () => `<ellipse cx="60" cy="24" rx="36" ry="6" fill="#8b5a2b"/><path d="M42 24q0-18 18-18t18 18z" fill="#a0692f"/><rect x="42" y="18" width="36" height="4" fill="#5c3a1e"/>` },
  { id: 'hat-pirate', slot: 'hat', name: 'Pirate Hat', r: 'rare', req: ['streak', 5], svg: () => `<path d="M30 26q30-26 60 0q-30-8-60 0z" fill="#111827"/><path d="M40 22q20-18 40 0z" fill="#111827"/><circle cx="60" cy="16" r="3.5" fill="#fff"/>` },
  { id: 'hat-wizard', slot: 'hat', name: 'Wizard Hat', r: 'epic', req: ['correct', 100], svg: () => `<path d="M34 26 60-8l26 34z" fill="#4c1d95"/><rect x="32" y="22" width="56" height="7" rx="3" fill="#6d28d9"/><g class="fx-twinkle" fill="#fde047"><path d="m56 6 2 4 4 1-4 2-2 4-2-4-4-2 4-1z"/><circle cx="68" cy="16" r="2"/></g>` },
  { id: 'hat-viking', slot: 'hat', name: 'Viking Helmet', r: 'epic', req: ['wins', 15], svg: () => `<path d="M36 28q0-20 24-20t24 20z" fill="#9ca3af"/><rect x="34" y="24" width="52" height="6" fill="#6b7280"/><path d="M36 22q-12-2-14-18q8 10 16 10z M84 22q12-2 14-18q-8 10-16 10z" fill="#f5f5dc"/>` },
  { id: 'hat-top', slot: 'hat', name: 'Fancy Top Hat', r: 'epic', req: ['perfect', 1], svg: () => `<rect x="42" y="-6" width="36" height="30" rx="3" fill="#111827"/><rect x="42" y="14" width="36" height="5" fill="#ff5fa2"/><ellipse cx="60" cy="25" rx="30" ry="5" fill="#111827"/>` },
  { id: 'hat-halo', slot: 'hat', name: 'Angel Halo', r: 'legendary', req: tierReq(1550, 'Diamond'), svg: () => `<g class="fx-float"><ellipse cx="60" cy="4" rx="20" ry="5" fill="none" stroke="#fde68a" stroke-width="4" class="fx-glow"/></g>` },
  { id: 'hat-dominus', slot: 'hat', name: 'Shadow Emperor Hood', r: 'legendary', req: ['perfect', 5], svg: () => `<defs><linearGradient id="dm" x1="0" x2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset=".5" stop-color="#6d7ff0" class="fx-shimmer"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs><path d="M32 60V26q0-22 28-22t28 22v34l-8-6V30H40v24z" fill="url(#dm)"/><path d="M60 4 52-6h16z" fill="#6d7ff0"/>` },
  { id: 'hat-gearphones', slot: 'hat', name: 'Clockwork Gear Headphones', r: 'epic', req: ['games', 50], svg: () => `<path d="M34 40V26q0-18 26-18t26 18v14" fill="none" stroke="#b45309" stroke-width="5"/><g fill="none" stroke="#fbbf24" stroke-width="5" stroke-dasharray="3 2.3"><circle cx="31" cy="40" r="7" class="fx-rot"/><circle cx="89" cy="40" r="7" class="fx-rot" style="animation-direction:reverse"/></g><circle cx="31" cy="40" r="3.5" fill="#92400e"/><circle cx="89" cy="40" r="3.5" fill="#92400e"/>` },
  { id: 'hat-horns-toxic', slot: 'hat', name: 'Toxic Wasteland Horns', r: 'epic', req: ['correct', 500], svg: () => `${horns('#84cc16', '#365314')}<g fill="#a3e635"><circle class="fx-drip" cx="30" cy="4" r="2"/><circle class="fx-drip" cx="90" cy="4" r="2" style="animation-delay:-.8s"/></g>` },
  { id: 'hat-fedora-green', slot: 'hat', name: 'Emerald Sparkle Fedora', r: 'epic', req: ['correct', 750], svg: () => fedora('#15803d', '#052e16', false, 3) },
  { id: 'hat-valk', slot: 'hat', name: 'Winged Valkyrie Helm', r: 'legendary', req: ['wins', 30], svg: () => valk('#c7cbe0', '#f8fafc', '#7c83b0') },
  { id: 'hat-horns-frost', slot: 'hat', name: 'Frozen Planet Horns', r: 'legendary', req: ['streak', 15], svg: () => `<g class="fx-glow">${horns('#bae6fd', '#0284c7')}</g>${sparkles('#e0f2fe', 5)}` },
  { id: 'hat-fedora-violet', slot: 'hat', name: 'Violet Sparkle Fedora', r: 'legendary', req: ['wins', 75], svg: () => fedora('#6d28d9', '#1e1b4b', true, 5) },
  { id: 'hat-crown', slot: 'hat', name: 'Top 10 Crown', r: 'legendary', req: ['top', 10], svg: () => `<path d="M38 26 36 6l12 10 12-14 12 14 12-10-2 20z" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/><g class="fx-twinkle"><circle cx="60" cy="12" r="3" fill="#ef4444"/><circle cx="46" cy="18" r="2.5" fill="#3cc8ff"/><circle cx="74" cy="18" r="2.5" fill="#22c55e"/></g>` },
  { id: 'hat-horns-fire', slot: 'hat', name: 'Netherworld Fire Horns', r: 'mythic', req: ['top', 3], svg: () => `<g class="fx-flicker">${horns('#f97316', '#7c2d12')}<path d="M26-2q2-8 6-10-1 6 2 8zM94-2q-2-8-6-10 1 6-2 8z" fill="#fde047"/></g>` },
  { id: 'hat-valk-black', slot: 'hat', name: 'Black Valkyrie Helm', r: 'mythic', req: tierReq(1700, 'Legend'), svg: () => `<g class="fx-pulse" style="animation-duration:2.4s"><ellipse cx="60" cy="14" rx="44" ry="18" fill="#a855f7" opacity=".25"/></g>${valk('#1f2230', '#2b2e3f', '#a855f7')}` },
  { id: 'hat-fedora-red', slot: 'hat', name: 'Crimson Sparkle Fedora', r: 'mythic', req: ['wins', 150], svg: () => `<g class="fx-pulse" style="animation-duration:1.8s"><ellipse cx="60" cy="16" rx="40" ry="16" fill="#ef4444" opacity=".3"/></g>${fedora('#dc2626', '#450a0a', true, 7)}` },
  { id: 'hat-inferno', slot: 'hat', name: 'Inferno Emperor Hood', r: 'mythic', req: ['perfect', 25], svg: () => `<defs><linearGradient id="inf" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#450a0a"/><stop offset=".6" stop-color="#dc2626" class="fx-shimmer-fire"/><stop offset="1" stop-color="#fb923c"/></linearGradient></defs><g class="fx-flicker"><path d="M36 10q-4-12 4-20 0 8 6 10 0-12 8-18 2 12 8 16 4-8 2-14 12 10 8 26z" fill="#f97316"/><path d="M46 8q0-8 6-12 1 6 5 7 1-6 6-9 3 8 5 14z" fill="#fde047"/></g><path d="M32 60V26q0-22 28-22t28 22v34l-8-6V30H40v24z" fill="url(#inf)"/><path d="M60 4 52-6h16z" fill="#fde047" class="fx-glow"/><g class="fx-pulse"><circle cx="51" cy="40" r="2.5" fill="#fde047"/><circle cx="69" cy="40" r="2.5" fill="#fde047"/></g>` },
  { id: 'hat-flame', slot: 'hat', name: '#1 Flaming Crown', r: 'mythic', req: ['top', 1], svg: () => `<g class="fx-flicker"><path d="M40 20q-6-14 4-26q0 10 8 12q-2-14 8-22q2 14 10 20q4-8 2-14q12 10 6 30z" fill="#fb923c"/><path d="M46 20q-2-10 6-16q2 8 8 8q0-8 6-12q4 10 8 20z" fill="#fde047"/></g><path d="M38 28 36 12l12 8 12-12 12 12 12-8-2 16z" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/><circle cx="60" cy="18" r="3.5" fill="#ff5fa2" class="fx-glow"/>` },

  // faces
  { id: 'face-smile', slot: 'face', name: 'Classic Smile', r: 'common', svg: () => `<ellipse cx="51" cy="38" rx="2.6" ry="3.4" fill="#111"/><ellipse cx="69" cy="38" rx="2.6" ry="3.4" fill="#111"/><path d="M51 48q9 8 18 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>` },
  { id: 'face-grin', slot: 'face', name: 'Big Grin', r: 'common', req: ['games', 1], svg: () => `<ellipse cx="51" cy="37" rx="2.6" ry="3.4" fill="#111"/><ellipse cx="69" cy="37" rx="2.6" ry="3.4" fill="#111"/><path d="M49 46h22q-2 10-11 10t-11-10z" fill="#111"/><path d="M52 47h16v3H52z" fill="#fff"/>` },
  { id: 'face-wink', slot: 'face', name: 'Wink', r: 'rare', req: ['correct', 50], svg: () => `<path d="M48 38h6" stroke="#111" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="69" cy="38" rx="2.6" ry="3.4" fill="#111"/><path d="M51 48q9 8 18 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>` },
  { id: 'face-shades', slot: 'face', name: 'Cool Shades', r: 'rare', req: ['wins', 1], svg: () => `<path d="M42 34h36v4q0 7-8 7h-4q-4 0-6-4-2 4-6 4h-4q-8 0-8-7z" fill="#111"/><path d="M46 36h8" stroke="#6d7ff0" stroke-width="2"/><path d="M52 50q8 5 16 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>` },
  { id: 'face-star', slot: 'face', name: 'Starry Eyes', r: 'epic', req: ['streak', 7], svg: () => `<g class="fx-twinkle" fill="#fbbf24"><path d="m51 32 2 4 4 1-4 2-2 4-2-4-4-2 4-1z"/><path d="m69 32 2 4 4 1-4 2-2 4-2-4-4-2 4-1z"/></g><path d="M50 48q10 9 20 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>` },
  { id: 'face-superhappy', slot: 'face', name: 'Super Duper Happy Face', r: 'legendary', req: ['perfect', 10], svg: () => `<path d="M46 36q5-7 10 0M64 36q5-7 10 0" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M45 44h30q-2 15-15 15t-15-15z" fill="#111"/><path d="M49 45h22v3H49z" fill="#fff"/><path d="M53 54q7 4 14 0" stroke="#f472b6" stroke-width="3" fill="none"/>` },
  { id: 'face-laser', slot: 'face', name: 'Laser Eyes', r: 'mythic', req: tierReq(1700, 'Legend'), svg: () => `<g class="fx-pulse"><path d="M51 38 0 44M69 38l51 6" stroke="#ef4444" stroke-width="3" opacity=".7"/><circle cx="51" cy="38" r="4" fill="#ef4444"/><circle cx="69" cy="38" r="4" fill="#ef4444"/></g><path d="M52 50h16" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>` },

  // shirts (drawn on the body's own torso, so they fit every body type)
  { id: 'shirt-blue', slot: 'shirt', name: 'Blue Tee', r: 'common', fill: '#3b82f6' },
  { id: 'shirt-red', slot: 'shirt', name: 'Red Tee', r: 'common', fill: '#ef4444' },
  { id: 'shirt-green', slot: 'shirt', name: 'Green Tee', r: 'common', fill: '#22c55e' },
  { id: 'shirt-pink', slot: 'shirt', name: 'Pink Tee', r: 'common', fill: '#f472b6' },
  { id: 'shirt-stripe', slot: 'shirt', name: 'Striped Shirt', r: 'rare', req: ['games', 10], fill: 'url(#st)', defs: `<pattern id="st" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><rect width="8" height="4" fill="#6d7ff0"/></pattern>` },
  { id: 'shirt-hoodie', slot: 'shirt', name: 'Pro Hoodie', r: 'rare', req: ['wins', 5], fill: '#111827', extra: `<path d="M52 66q8 10 16 0" fill="none" stroke="#ff5fa2" stroke-width="3"/><rect x="50" y="94" width="20" height="10" rx="3" fill="#1f2937"/>` },
  { id: 'shirt-gold', slot: 'shirt', name: 'Golden Armor', r: 'epic', req: tierReq(1400, 'Platinum'), fill: 'url(#ga)', defs: `<linearGradient id="ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient>`, extra: `<path d="M60 70v40" stroke="#b45309" stroke-width="2"/>` },
  { id: 'shirt-galaxy', slot: 'shirt', name: 'Galaxy Suit', r: 'legendary', req: ['correct', 250], fill: 'url(#gx)', defs: `<linearGradient id="gx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset=".6" stop-color="#6d28d9"/><stop offset="1" stop-color="#db2777"/></linearGradient>`, extra: `<g class="fx-twinkle" fill="#fff"><circle cx="46" cy="76" r="1.5"/><circle cx="70" cy="88" r="1.2"/><circle cx="56" cy="102" r="1.6"/><circle cx="76" cy="72" r="1"/></g>` },
  { id: 'shirt-rainbow', slot: 'shirt', name: 'Rainbow Drip', r: 'legendary', req: ['perfect', 3], fill: 'url(#rb)', cls: 'fx-hue', defs: `<linearGradient id="rb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset=".25" stop-color="#f59e0b"/><stop offset=".5" stop-color="#22c55e"/><stop offset=".75" stop-color="#3b82f6"/><stop offset="1" stop-color="#a855f7"/></linearGradient>` },
  { id: 'shirt-champ', slot: 'shirt', name: 'Top 3 Champion Jersey', r: 'legendary', req: ['top', 3], fill: '#fbbf24', extra: `<text x="60" y="98" text-anchor="middle" font-size="18" font-weight="900" fill="#b45309" font-family="Arial">#1</text>`, cls: 'fx-glow' },

  // auras (behind the avatar)
  { id: 'aura-none', slot: 'aura', name: 'No aura', r: 'common', svg: () => '' },
  { id: 'aura-bubbles', slot: 'aura', name: 'Bubbles', r: 'rare', req: ['games', 20], svg: () => `<g fill="none" stroke="#7dd3fc" stroke-width="2">${[[20, 150, 0], [100, 140, 1.2], [60, 150, 2.1], [12, 120, 0.7]].map(([x, y, d]) => `<circle cx="${x}" cy="${y}" r="6" class="fx-rise" style="animation-delay:-${d}s"/>`).join('')}</g>` },
  { id: 'aura-sparkle', slot: 'aura', name: 'Sparkles', r: 'epic', req: ['wins', 10], svg: () => `<g fill="#fde047" class="fx-twinkle">${[[14, 40], [104, 30], [100, 110], [18, 120], [60, 4]].map(([x, y]) => `<path d="m${x} ${y} 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>`).join('')}</g>` },
  { id: 'aura-fire', slot: 'aura', name: 'Fire Aura', r: 'legendary', req: ['streak', 10], svg: () => `<g class="fx-flicker" opacity=".9"><path d="M10 160q-6-40 16-60q-2 24 12 30q-4-40 22-60q4 40 22 50q6-20 0-34q30 30 28 74z" fill="#f97316"/><path d="M26 160q0-26 14-36q2 16 10 18q2-22 16-34q4 26 14 32q4-10 2-18q14 18 12 38z" fill="#fde047"/></g>` },
  { id: 'aura-storm', slot: 'aura', name: 'Lightning Storm', r: 'legendary', req: tierReq(1550, 'Diamond'), svg: () => `<g class="fx-pulse" fill="#a5b4fc"><path d="m18 20-8 30h10l-6 30 18-40H22l6-20z"/><path d="m104 50-8 26h9l-5 26 15-34h-9l5-18z"/></g>` },
  { id: 'aura-rays', slot: 'aura', name: '#1 Rainbow Rays', r: 'mythic', req: ['top', 1], svg: () => `<g class="fx-spin" opacity=".55">${Array.from({ length: 12 }, (_, i) => `<path d="M60 80 ${60 + 90 * Math.cos((i * Math.PI) / 6 - 0.13)} ${80 + 90 * Math.sin((i * Math.PI) / 6 - 0.13)} ${60 + 90 * Math.cos((i * Math.PI) / 6 + 0.13)} ${80 + 90 * Math.sin((i * Math.PI) / 6 + 0.13)}z" fill="hsl(${i * 30} 90% 60%)"/>`).join('')}</g>` },

  // frames (CSS borders around the avatar card)
  { id: 'frame-none', slot: 'frame', name: 'Simple', r: 'common' },
  { id: 'frame-silver', slot: 'frame', name: 'Silver Frame', r: 'rare', req: tierReq(1100, 'Silver') },
  { id: 'frame-gold', slot: 'frame', name: 'Gold Frame', r: 'epic', req: tierReq(1250, 'Gold') },
  { id: 'frame-diamond', slot: 'frame', name: 'Diamond Frame', r: 'legendary', req: tierReq(1550, 'Diamond') },
  { id: 'frame-legend', slot: 'frame', name: 'Legend Frame', r: 'mythic', req: tierReq(1700, 'Legend') },
  { id: 'frame-champ', slot: 'frame', name: '#1 Champion Frame', r: 'mythic', req: ['top', 1] },
];
export const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const DEFAULT = { body: 'boy', skin: 1, hairColor: 0, hair: 'hair-short', hat: 'hat-none', face: 'face-smile', shirt: 'shirt-blue', aura: 'aura-none', frame: 'frame-none' };

export const reqText = (req) => {
  if (!req) return 'Free';
  const [k, n, label] = req;
  if (k === 'top') return n === 1 ? 'Be #1 in Ranked (while you hold it)' : `Be top ${n} in Ranked (while you stay there)`;
  if (k === 'peak') return `Reach ${label} tier in Ranked`;
  return `${n} ${STATS[k]}`;
};
export const isUnlocked = (item, stats = {}, rank = 0) => {
  if (!item.req) return true;
  const [k, n] = item.req;
  return k === 'top' ? rank > 0 && rank <= n : (stats[k] ?? 0) >= n;
};
export const progress = (item, stats = {}) => (!item.req || item.req[0] === 'top' ? null : [Math.min(stats[item.req[0]] ?? 0, item.req[1]), item.req[1]]);

// Keeps only valid, unlocked choices. Temporary top cosmetics fall off as soon as the rank is lost.
export function sanitize(av, stats, rank) {
  const out = { ...DEFAULT };
  const a = av && typeof av === 'object' ? av : {};
  if (a.body in BODIES) out.body = a.body;
  if (Number.isInteger(a.skin) && SKINS[a.skin]) out.skin = a.skin;
  if (Number.isInteger(a.hairColor) && HAIR_COLORS[a.hairColor]) out.hairColor = a.hairColor;
  for (const slot of Object.keys(SLOTS)) {
    const item = BY_ID[a[slot]];
    if (item && item.slot === slot && isUnlocked(item, stats, rank)) out[slot] = item.id;
  }
  return out;
}

// "Other" body: mystery 8-bit head. Each face cosmetic has a 6x6 pixel-art version so it still shows.
// k=black w=white y=gold (twinkles) r=red (pulses); '.' = skin with a checker shade.
const PIXEL_FACES = {
  'face-smile': ['......', '......', '.k..k.', '......', '.k..k.', '..kk..'],
  'face-grin': ['......', '......', '.k..k.', '......', '.kkkk.', '.kwwk.'],
  'face-wink': ['......', '......', 'kk..k.', '......', '.k..k.', '..kk..'],
  'face-shades': ['......', '......', 'kkkkkk', '.kk.kk', '......', '..kk..'],
  'face-star': ['......', '.y..y.', 'yyyyyy', '.y..y.', '......', '..kk..'],
  'face-superhappy': ['......', '.k..k.', 'k.kk.k', 'kkkkkk', '.kwwk.', '..kk..'],
  'face-laser': ['......', '......', '.r..r.', '......', '......', '.kkkk.'],
};
const PIXEL = { k: '#111', w: '#fff', y: '#fbbf24', r: '#ef4444' };
const FX = { y: ' class="fx-twinkle"', r: ' class="fx-pulse"' };
function pixelHead(face, skin) {
  const rows = PIXEL_FACES[face] ?? PIXEL_FACES['face-smile'];
  const s = 44 / 6;
  let out = '';
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if ((r === 0 || r === 5) && (c === 0 || c === 5)) return; // stepped corners = 8-bit round head
      const at = `x="${(38 + c * s).toFixed(2)}" y="${(18 + r * s).toFixed(2)}" width="${(s + 0.3).toFixed(2)}" height="${(s + 0.3).toFixed(2)}"`;
      out += `<rect ${at} fill="${skin}"/>`;
      out += ch === '.' ? ((r + c) % 2 ? `<rect ${at} fill="#000" opacity=".08"/>` : '') : `<rect ${at} fill="${PIXEL[ch]}"${FX[ch] ?? ''}/>`;
    }),
  );
  if (face === 'face-laser') out += '<path d="M49 36 0 42M71 36l49 6" stroke="#ef4444" stroke-width="3" opacity=".7" class="fx-pulse"/>';
  return out;
}

let uid = 0;
export function avatarSVG(input, size = 120) {
  const av = { ...DEFAULT, ...input };
  const skin = SKINS[av.skin] ?? SKINS[1];
  const shirt = BY_ID[av.shirt] ?? BY_ID['shirt-blue'];
  const n = ++uid; // unique ids so several avatars on one page don't share gradients
  const ids = (s) => (s || '').replace(/id="(\w+)"/g, `id="$1${n}"`).replace(/url\(#(\w+)\)/g, `url(#$1${n})`);
  const fill = ids(shirt.fill);
  const torso = TORSO[av.body] ?? TORSO.boy;
  const pants = av.body === 'girl' ? '' : `<rect x="38" y="112" width="20" height="40" rx="3" fill="#2b3350"/><rect x="62" y="112" width="20" height="40" rx="3" fill="#2b3350"/>`;
  const legs = av.body === 'girl' ? `<rect x="40" y="112" width="16" height="40" rx="3" fill="${skin}"/><rect x="64" y="112" width="16" height="40" rx="3" fill="#2b3350"/><rect x="40" y="130" width="16" height="22" rx="3" fill="#2b3350"/>` : pants;
  const part = (id) => ids(BY_ID[av[id]]?.svg?.(HAIR_COLORS[av.hairColor] ?? HAIR_COLORS[0]) ?? '');
  const head = av.body === 'other' ? pixelHead(av.face, skin) : `<rect x="38" y="18" width="44" height="44" rx="11" fill="${skin}"/>${part('face')}`;
  return `<svg class="avatar" viewBox="-4 -12 128 168" width="${size}" height="${size * 1.3125}" role="img" aria-label="Player avatar">
    <defs>${ids(shirt.defs)}</defs>
    ${part('aura')}
    <g class="av-body">
      ${legs}
      <rect x="18" y="68" width="16" height="42" rx="4" fill="${skin}"/><rect x="86" y="68" width="16" height="42" rx="4" fill="${skin}"/>
      <path d="M18 72a4 4 0 0 1 4-4h12v18H18zM86 68h12a4 4 0 0 1 4 4v14H86z" fill="${fill}" class="${shirt.cls ?? ''}"/>
      <path d="${torso}" fill="${fill}" class="${shirt.cls ?? ''}"/>
      ${ids(shirt.extra)}
      <rect x="52" y="60" width="16" height="8" fill="${skin}"/>
      ${head}
      ${part('hair')}${part('hat')}
    </g>
  </svg>`;
}

// Avatar inside its (animated) frame. Frames are pure CSS: see .frame-* in global.css.
export const avatarCard = (av, size = 120) => `<span class="av-card ${av?.frame ?? 'frame-none'}">${avatarSVG(av, size)}</span>`;
