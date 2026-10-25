// Draws the anime-style rabbi (6 expressions × idle / blink / talk frames) and the Torah pointer (yad) as SVG and
// rasterises them to PNG for the app. Build-time only (resvg); the app ships PNGs.
// Usage: node scripts/build-art.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PALETTES, yadSvg } from './yad-art.mjs';

const OUT = join(import.meta.dirname, '..', 'src', 'assets', 'art');
mkdirSync(OUT, { recursive: true });

// Anime-style rabbi with soft 3D shading: inked outlines, gradients lit from the upper left, shaded irises with
// highlights, blurred blush with hatching, glossy hat, gold glasses. Big head, small body.
const L = '#3d2618'; // line art
const C = { skin: '#ffdcc2', skinMid: '#f7bf9b', skinDark: '#e09a74', beard: '#ffffff', beardMid: '#eceae6', beardDark: '#c9c4bc', coat: '#2b4a7a', coatDark: '#152540', blue: '#1f63d6', mouth: '#9a2e2e', tongue: '#f07b7b' };

const DEFS = `<defs>
  <radialGradient id="skin" cx="0.42" cy="0.36" r="0.7"><stop offset="0" stop-color="${C.skin}"/><stop offset="0.7" stop-color="${C.skinMid}"/><stop offset="1" stop-color="${C.skinDark}"/></radialGradient>
  <radialGradient id="ear" cx="0.4" cy="0.4" r="0.7"><stop offset="0" stop-color="${C.skinMid}"/><stop offset="1" stop-color="${C.skinDark}"/></radialGradient>
  <radialGradient id="beard" gradientUnits="userSpaceOnUse" cx="186" cy="272" r="150"><stop offset="0" stop-color="${C.beard}"/><stop offset="0.65" stop-color="${C.beardMid}"/><stop offset="1" stop-color="${C.beardDark}"/></radialGradient>
  <radialGradient id="tuft" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${C.beardDark}"/></radialGradient>
  <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1408"/><stop offset="0.55" stop-color="#7a4318"/><stop offset="1" stop-color="#e3a24a"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#d79b2b"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
  <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#cfe6ff" stop-opacity="0.08"/><stop offset="1" stop-color="#9cc8ff" stop-opacity="0.2"/></linearGradient>
  <linearGradient id="hat" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#4a5566"/><stop offset="0.45" stop-color="#1f252e"/><stop offset="1" stop-color="#0b0e12"/></linearGradient>
  <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4250"/><stop offset="1" stop-color="#0e1116"/></linearGradient>
  <linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6878"/><stop offset="1" stop-color="#2a313b"/></linearGradient>
  <radialGradient id="coat" cx="0.35" cy="0.25" r="0.9"><stop offset="0" stop-color="#4f78b8"/><stop offset="0.55" stop-color="${C.coat}"/><stop offset="1" stop-color="${C.coatDark}"/></radialGradient>
  <linearGradient id="tallit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ddd6c6"/></linearGradient>
  <linearGradient id="mouth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e1414"/><stop offset="1" stop-color="${C.mouth}"/></linearGradient>
  <radialGradient id="nose" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffd1b3"/><stop offset="1" stop-color="${C.skinDark}"/></radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="softer" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
  <clipPath id="face"><ellipse cx="200" cy="178" rx="96" ry="92"/></clipPath>
</defs>`;

// Outline a union of shapes without inner seams: stroke the group, then fill it on top.
const inked = (shapes, fill, w = 3.5) => `<g fill="none" stroke="${L}" stroke-width="${2 * w}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;

const EYE = { y: 172, xs: [162, 238] }; // left eye's outer corner is on the left
const lash = (x, s, y) => `<path d="M${x - 19 * s} ${y - 3} q ${-7 * s} -3 ${-10 * s} -9" stroke="${L}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
const eyes = {
  open: (dx = 0, dy = 0) =>
    EYE.xs.map((x, k) => {
      const s = k ? -1 : 1, y = EYE.y, ix = x + dx, iy = y + dy + 2;
      return `
      <ellipse cx="${x}" cy="${y}" rx="18" ry="21" fill="#fff" stroke="${L}" stroke-width="1.5"/>
      <ellipse cx="${x}" cy="${y - 11}" rx="16" ry="7" fill="#d9c9e0" opacity="0.6"/>
      <ellipse cx="${ix}" cy="${iy}" rx="13.5" ry="17" fill="url(#iris)" stroke="#20100a" stroke-width="1.5"/>
      <ellipse cx="${ix}" cy="${iy + 1}" rx="6" ry="8.5" fill="#140904"/>
      <ellipse cx="${ix + 5}" cy="${iy - 6}" rx="5.5" ry="6.5" fill="#fff"/>
      <circle cx="${ix - 5}" cy="${iy + 8}" r="2.8" fill="#fff" opacity="0.9"/>
      <path d="M${x - 20} ${y - 2} Q${x} ${y - 29} ${x + 20} ${y - 2}" stroke="${L}" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${lash(x, s, y)}
      <path d="M${x - 9} ${y + 21} Q${x} ${y + 23.5} ${x + 9} ${y + 21}" stroke="${L}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.6"/>`;
    }).join(''),
  smiling: () =>
    EYE.xs.map((x, k) => {
      const s = k ? -1 : 1, y = EYE.y;
      return `<path d="M${x - 15} ${y + 5} Q${x} ${y - 15} ${x + 15} ${y + 5}" stroke="${L}" stroke-width="5.5" fill="none" stroke-linecap="round"/>${lash(x, s, y + 6)}
        <path d="M${x - 9} ${y + 14} Q${x} ${y + 10} ${x + 9} ${y + 14}" stroke="${L}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.5"/>`;
    }).join(''),
  closed: () =>
    EYE.xs.map((x, k) => {
      const s = k ? -1 : 1, y = EYE.y;
      return `<path d="M${x - 15} ${y} Q${x} ${y + 10} ${x + 15} ${y}" stroke="${L}" stroke-width="5" fill="none" stroke-linecap="round"/>${lash(x, s, y + 3)}`;
    }).join(''),
};

// Bushy white brows: [outer y, peak y, inner y] per side.
const brow = (x0, x1, [a, b, c]) => {
  const m = (x0 + x1) / 2;
  return `<path d="M${x0} ${a} Q${m} ${b - 9} ${x1} ${c} Q${m} ${b + 1} ${x0} ${a + 6} Z" fill="url(#tuft)" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>`;
};
const brows2 = (l, r) => brow(134, 186, l) + brow(266, 214, r);
const brows = {
  calm: brows2([135, 128, 134], [135, 128, 134]),
  raised: brows2([128, 119, 126], [128, 119, 126]),
  thinking: brows2([136, 131, 136], [126, 116, 124]),
  concerned: brows2([138, 132, 125], [138, 132, 125]),
};

const mouths = {
  smile: `<path d="M187 238 Q200 252 213 238 Q200 243 187 238 Z" fill="url(#mouth)" stroke="${L}" stroke-width="2.5" stroke-linejoin="round"/>`,
  grin: `<path d="M181 234 Q200 266 219 234 Q200 240 181 234 Z" fill="url(#mouth)" stroke="${L}" stroke-width="2.5" stroke-linejoin="round"/>
         <path d="M185 236 Q200 241 215 236 L213 240 Q200 245 187 240 Z" fill="#fff"/>
         <ellipse cx="200" cy="252" rx="8" ry="4.5" fill="${C.tongue}"/>`,
  talk: `<ellipse cx="200" cy="243" rx="9.5" ry="11" fill="url(#mouth)" stroke="${L}" stroke-width="2.5"/><ellipse cx="200" cy="249" rx="5.5" ry="3.5" fill="${C.tongue}"/>`,
  hmm: `<path d="M191 243 q 5 -5 10 0 t 10 0" stroke="${L}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  soft: `<path d="M190 240 Q200 248 210 240" stroke="${L}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
};

const sleeve = (d) => `<path d="${d}" stroke="${L}" stroke-width="37" fill="none" stroke-linecap="round"/><path d="${d}" stroke="url(#coat)" stroke-width="30" fill="none" stroke-linecap="round"/>`;
const finger = (x, y, h) => `<rect x="${x}" y="${y}" width="14" height="${h}" rx="7" fill="url(#skin)" stroke="${L}" stroke-width="3"/>`;
const mitten = (x, y) => `<circle cx="${x}" cy="${y}" r="18" fill="url(#skin)" stroke="${L}" stroke-width="3"/><path d="M${x - 9} ${y + 6} q 9 6 18 0" stroke="${C.skinDark}" stroke-width="2" fill="none" opacity="0.7"/>`;
const hands = {
  none: '',
  pointUp: sleeve('M300 356 C 314 334, 322 314, 322 296') + finger(315, 242, 42) + mitten(322, 284),
  chin: sleeve('M296 362 C 290 328, 270 308, 248 298') + mitten(242, 292),
  thumbs: sleeve('M300 356 C 314 334, 322 316, 320 302') + finger(311, 250, 36) + mitten(320, 288),
};

// Long, full rebbe beard flowing over the chest: a base shape with wavy lobes along its edge and long strands.
const cubic = (p, t) => [0, 1].map((d) => (1 - t) ** 3 * p[0][d] + 3 * (1 - t) ** 2 * t * p[1][d] + 3 * (1 - t) * t ** 2 * p[2][d] + t ** 3 * p[3][d]);
const SIDE = [[112, 196], [88, 286], [108, 368], [200, 394]]; // left outer edge, chin to tip
const lobes = [0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9].flatMap((t, i) => {
  const [x, y] = cubic(SIDE, t), r = [18, 21, 22, 22, 21, 19, 18][i];
  return [`<circle cx="${(x + 8).toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`, `<circle cx="${(392 - x).toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`];
}).join('');
const BEARD = `<path d="M112 196 C 88 286, 108 368, 200 394 C 292 368, 312 286, 288 196 C 266 258, 234 268, 200 268 C 166 268, 134 258, 112 196 Z"/>${lobes}<circle cx="200" cy="378" r="22"/>`;
const strands = [
  'M150 262 C 132 300, 156 332, 140 366', 'M250 262 C 268 300, 244 332, 260 366', 'M174 280 C 162 316, 184 342, 172 376', 'M226 280 C 238 316, 216 342, 228 376',
  'M200 288 C 192 320, 208 346, 200 380', 'M126 236 C 114 270, 132 296, 120 330', 'M274 236 C 286 270, 268 296, 280 330',
].map((d) => `<path d="${d}" stroke="${C.beardDark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('');
// Payot (פאות): curly sidelocks in front of the ears, tapering towards the end.
const PAYOT = [106, 294].map((x, k) => {
  const s = k ? -1 : 1;
  const rings = Array.from({ length: 7 }, (_, i) => {
    const y = 148 + i * 13, r = 12 - i * 0.9, cx = x + (i % 2 ? 2.5 : -2.5) * s;
    return `<ellipse cx="${cx}" cy="${y}" rx="${r}" ry="${r * 0.62}" transform="rotate(${-20 * s} ${cx} ${y})"/>`;
  }).join('');
  return `<g fill="none" stroke="${L}" stroke-width="10">${rings}</g><g fill="none" stroke="url(#tuft)" stroke-width="5.5">${rings}</g>`;
}).join('');
const MOUSTACHE = `<path d="M200 230 C 192 218, 172 214, 160 224 C 152 232, 160 242, 168 236 C 178 242, 192 240, 200 234 Z"/>
  <path d="M200 230 C 208 218, 228 214, 240 224 C 248 232, 240 242, 232 236 C 222 242, 208 240, 200 234 Z"/>`;
const TUFTS = `<circle cx="112" cy="128" r="16"/><circle cx="104" cy="146" r="13"/><circle cx="288" cy="128" r="16"/><circle cx="296" cy="146" r="13"/>`;
const blush = (x, s) => `<ellipse cx="${x}" cy="210" rx="19" ry="11" fill="#ff6f86" opacity="0.5" filter="url(#soft)"/>
  ${[-8, 0, 8].map((o) => `<path d="M${x + o - 3 * s} 214 l ${6 * s} -9" stroke="#e8436a" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`).join('')}`;

function rabbi({ eye, brow, mouth, hand }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">${DEFS}
  <!-- body: coat, tallit with blue stripes, shirt -->
  <path d="M90 402 C 90 330, 132 294, 200 292 C 268 294, 310 330, 310 402 Z" fill="url(#coat)" stroke="${L}" stroke-width="3.5"/>
  <path d="M110 402 C 112 344, 140 314, 172 304 L 178 402 Z" fill="url(#tallit)" stroke="${L}" stroke-width="3"/>
  <path d="M290 402 C 288 344, 260 314, 228 304 L 222 402 Z" fill="url(#tallit)" stroke="${L}" stroke-width="3"/>
  <path d="M120 382 C 126 352, 144 334, 168 324" stroke="${C.blue}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M117 395 C 122 368, 140 348, 166 336" stroke="${C.blue}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M280 382 C 274 352, 256 334, 232 324" stroke="${C.blue}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M283 395 C 278 368, 260 348, 234 336" stroke="${C.blue}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M178 296 L200 342 L222 296 Z" fill="#fffdf7" stroke="${L}" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="200" cy="300" rx="84" ry="14" fill="#0a1222" opacity="0.45" filter="url(#soft)"/>
  <!-- ears, face with soft 3D shading -->
  <ellipse cx="104" cy="184" rx="17" ry="21" fill="url(#ear)" stroke="${L}" stroke-width="3.5"/>
  <ellipse cx="296" cy="184" rx="17" ry="21" fill="url(#ear)" stroke="${L}" stroke-width="3.5"/>
  <path d="M100 176 q 6 6 2 16" stroke="${L}" stroke-width="2" fill="none" opacity="0.5"/><path d="M300 176 q -6 6 -2 16" stroke="${L}" stroke-width="2" fill="none" opacity="0.5"/>
  <ellipse cx="200" cy="178" rx="96" ry="92" fill="url(#skin)" stroke="${L}" stroke-width="3.5"/>
  <g clip-path="url(#face)">
    <ellipse cx="200" cy="112" rx="100" ry="20" fill="#b06a48" opacity="0.45" filter="url(#soft)"/>
    <ellipse cx="292" cy="196" rx="30" ry="80" fill="#c9805a" opacity="0.25" filter="url(#softer)"/>
  </g>
  ${inked(TUFTS, 'url(#tuft)', 2.5)}
  ${blush(132, 1)}${blush(268, 1)}
  <!-- beard, strands, moustache -->
  ${inked(BEARD, 'url(#beard)')}
  ${strands}
  ${PAYOT}
  <!-- nose -->
  <ellipse cx="200" cy="204" rx="10" ry="8" fill="url(#nose)"/><path d="M193 209 Q200 213 207 209" stroke="${L}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>
  <ellipse cx="197" cy="200" rx="3.5" ry="2.5" fill="#fff" opacity="0.7"/>
  <g transform="translate(0 9)">${mouths[mouth]}</g>
  <g transform="translate(200 226) scale(0.82) translate(-200 -228)">${inked(MOUSTACHE, 'url(#tuft)', 2.5)}</g>
  ${brows[brow]}
  ${eyes[eye.kind](...(eye.args ?? []))}
  <!-- gold glasses with lens glare -->
  ${EYE.xs.map((x) => `<circle cx="${x}" cy="${EYE.y}" r="31" fill="url(#lens)" stroke="url(#gold)" stroke-width="4.5"/>
    <path d="M${x - 20} ${EYE.y - 9} q 7 -14 21 -17" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.75"/>`).join('')}
  <path d="M193 168 Q200 162 207 168" stroke="url(#gold)" stroke-width="4" fill="none" stroke-linecap="round"/>
  <!-- glossy black hat -->
  <ellipse cx="200" cy="98" rx="120" ry="22" fill="url(#brim)" stroke="${L}" stroke-width="3.5"/>
  <path d="M130 98 C 128 44, 156 20, 200 20 C 244 20, 272 44, 270 98 Z" fill="url(#hat)" stroke="${L}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M131 80 Q200 90 269 80 L270 98 Q200 108 130 98 Z" fill="url(#band)" stroke="${L}" stroke-width="2.5"/>
  <path d="M150 74 C 148 50, 164 34, 186 30" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.35" filter="url(#soft)"/>
  <path d="M154 70 C 154 54, 164 42, 180 37" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.55"/>
  <path d="M96 100 Q200 126 304 100" stroke="#6b7686" stroke-width="2" fill="none" opacity="0.6"/>
  ${hands[hand]}
</svg>`;
}

const EXPRESSIONS = {
  neutral: { eye: { kind: 'open' }, brow: 'calm', mouth: 'smile', hand: 'none' },
  happy: { eye: { kind: 'smiling' }, brow: 'raised', mouth: 'grin', hand: 'thumbs' },
  encouraging: { eye: { kind: 'open' }, brow: 'raised', mouth: 'grin', hand: 'none' },
  explaining: { eye: { kind: 'open' }, brow: 'raised', mouth: 'soft', hand: 'pointUp' },
  thinking: { eye: { kind: 'open', args: [4, -4] }, brow: 'thinking', mouth: 'hmm', hand: 'chin' },
  correcting: { eye: { kind: 'open' }, brow: 'concerned', mouth: 'soft', hand: 'pointUp' },
};

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
for (const [name, e] of Object.entries(EXPRESSIONS)) {
  writeFileSync(join(OUT, `rabbi-${name}.png`), png(rabbi(e), 360));
  writeFileSync(join(OUT, `rabbi-${name}-blink.png`), png(rabbi({ ...e, eye: { kind: 'closed' } }), 360));
  writeFileSync(join(OUT, `rabbi-${name}-talk.png`), png(rabbi({ ...e, mouth: 'talk' }), 360));
}

// Yad: an ornate crowned pointer ending in a sculpted hand (scripts/yad-art.mjs); one variant per shop style.
const YAD_FILES = { silver: 'yad.png', gold: 'yad-gold.png', emerald: 'yad-emerald.png', royal: 'yad-royal.png' };
for (const [k, file] of Object.entries(YAD_FILES)) writeFileSync(join(OUT, file), png(yadSvg(PALETTES[k]), 256));
console.log(`art written to ${OUT}`);

// ---- App icon and splash (Android resources). An open Sefer Torah with the yad on the line being read.
// Adaptive icon: 108 dp layers drawn on a 432-unit canvas; the content stays inside the 66 dp safe circle.
const RES = join(import.meta.dirname, '..', 'App_Resources', 'Android', 'src', 'main', 'res');
const NAVY = '#1f3b5a', NAVY_DARK = '#132840';
const BRAND_DEFS = `
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#3a6aa6"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DARK}"/></radialGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd978" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd978" stop-opacity="0"/></radialGradient>
  <linearGradient id="roll" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9bf8c"/><stop offset="0.35" stop-color="#fff4da"/><stop offset="0.7" stop-color="#f0dcb0"/><stop offset="1" stop-color="#c4a46c"/></linearGradient>
  <linearGradient id="sheet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e6"/><stop offset="1" stop-color="#f1e0b8"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b3416"/><stop offset="0.4" stop-color="#a66a35"/><stop offset="1" stop-color="#4a2a10"/></linearGradient>
  <linearGradient id="disc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b47a42"/><stop offset="1" stop-color="#5e3818"/></linearGradient>
  <radialGradient id="knob" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff0a8"/><stop offset="0.5" stop-color="#e0a93a"/><stop offset="1" stop-color="#8a5a12"/></radialGradient>
  <linearGradient id="silverRod" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d969f"/><stop offset="0.35" stop-color="#ffffff"/><stop offset="0.65" stop-color="#c3cad1"/><stop offset="1" stop-color="#7a838c"/></linearGradient>
  <linearGradient id="goldBand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a18"/><stop offset="0.4" stop-color="#ffe08a"/><stop offset="1" stop-color="#a87418"/></linearGradient>`;

function torahScroll() {
  const roll = (x) => `
    <rect x="${x - 7}" y="80" width="14" height="44" rx="6" fill="url(#wood)" stroke="${L}" stroke-width="3"/>
    <rect x="${x - 7}" y="308" width="14" height="46" rx="6" fill="url(#wood)" stroke="${L}" stroke-width="3"/>
    <circle cx="${x}" cy="78" r="11" fill="url(#knob)" stroke="${L}" stroke-width="3"/>
    <circle cx="${x}" cy="356" r="11" fill="url(#knob)" stroke="${L}" stroke-width="3"/>
    <rect x="${x - 25}" y="122" width="50" height="190" rx="18" fill="url(#roll)" stroke="${L}" stroke-width="3.5"/>
    <path d="M${x - 14} 132 L${x - 14} 302 M${x + 10} 132 L${x + 10} 302" stroke="#c9ad78" stroke-width="2" opacity="0.7"/>
    <ellipse cx="${x}" cy="122" rx="34" ry="9" fill="url(#disc)" stroke="${L}" stroke-width="3"/>
    <ellipse cx="${x}" cy="312" rx="34" ry="9" fill="url(#disc)" stroke="${L}" stroke-width="3"/>`;
  // Two justified columns of text; the line being read glows under the yad.
  const lines = (x0, x1) => Array.from({ length: 12 }, (_, i) => `<rect x="${x0}" y="${146 + i * 13}" width="${x1 - x0}" height="3.6" rx="1.8" fill="#6b5238"/>`).join('');
  const READ_Y = 146 + 5 * 13;
  return `
  <ellipse cx="216" cy="216" rx="190" ry="160" fill="url(#glow)"/>
  <rect x="140" y="132" width="152" height="170" fill="url(#sheet)" stroke="${L}" stroke-width="3"/>
  <rect x="140" y="132" width="10" height="170" fill="#000" opacity="0.08"/><rect x="282" y="132" width="10" height="170" fill="#000" opacity="0.08"/>
  <rect x="222" y="${READ_Y - 5}" width="60" height="14" rx="5" fill="#ffd34d" opacity="0.85"/>
  ${lines(158, 209)}${lines(224, 275)}
  ${roll(124)}${roll(308)}
  <!-- yad: tip on the right end of the line being read (Hebrew reads right to left), handle towards the lower right -->
  <g transform="translate(270 ${READ_Y + 4}) rotate(-33.5)">
    <rect x="-9" y="44" width="18" height="140" rx="9" fill="url(#silverRod)" stroke="${L}" stroke-width="3"/>
    <rect x="-12" y="82" width="24" height="10" rx="4" fill="url(#goldBand)" stroke="${L}" stroke-width="2"/>
    <rect x="-12" y="136" width="24" height="10" rx="4" fill="url(#goldBand)" stroke="${L}" stroke-width="2"/>
    <circle cx="0" cy="190" r="13" fill="url(#silverRod)" stroke="${L}" stroke-width="3"/>
    <rect x="-13" y="36" width="26" height="11" rx="4" fill="url(#goldBand)" stroke="${L}" stroke-width="2.5"/>
    <ellipse cx="0" cy="25" rx="13" ry="13" fill="url(#silverRod)" stroke="${L}" stroke-width="3"/>
    <path d="M-8 22 q8 -4 16 0 M-8 29 q8 -4 16 0" stroke="#6d7680" stroke-width="1.6" fill="none"/>
    <rect x="-4.5" y="-2" width="9" height="20" rx="4.5" fill="url(#silverRod)" stroke="${L}" stroke-width="2.5"/>
  </g>`;
}
const svgDoc = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${BRAND_DEFS}${defs}</defs>${body}</svg>`;
const scaled = (k) => `<g transform="translate(216 216) scale(${k}) translate(-216 -216)">${torahScroll()}</g>`;
const ICON_SCALE = 0.68; // the scroll inside the 66 dp safe circle; the yad's handle may run out past the mask
const ICON_FG = svgDoc(432, 432, scaled(ICON_SCALE));
const ICON_BG = svgDoc(432, 432, `<rect width="432" height="432" fill="url(#bg)"/>`);
// Themed icon (Android 13): one colour the system tints; dark ink stays, light parchment turns transparent (line art).
const ICON_MONO = svgDoc(432, 432, `<g filter="url(#ink)">${scaled(ICON_SCALE)}</g>`, `<filter id="ink"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.5 -0.5 -0.5 1.5 0"/></filter>`);
// Legacy icon (Android 7): both layers in a rounded square, with the outer 18 dp trimmed as the launcher would.
const ICON_LEGACY = svgDoc(432, 432, `<clipPath id="sq"><rect x="36" y="36" width="360" height="360" rx="80"/></clipPath><g clip-path="url(#sq)"><rect width="432" height="432" fill="url(#bg)"/>${scaled(0.8)}</g>`);
const ICON_PLAY = svgDoc(432, 432, `<g transform="translate(-72 -72) scale(1.5)"><rect width="432" height="432" fill="url(#bg)"/>${scaled(ICON_SCALE)}</g>`); // what the launcher shows, full-bleed 512 for a store listing
const fontOpts = { font: { fontFiles: [join(import.meta.dirname, '..', 'src', 'fonts', 'EzraSIL.ttf')], loadSystemFonts: false, defaultFontFamily: 'Ezra SIL' } };
const pngAt = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, ...fontOpts }).render().asPng();
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  mkdirSync(join(RES, `mipmap-${d}`), { recursive: true });
  writeFileSync(join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'), pngAt(ICON_FG, 108 * k));
  writeFileSync(join(RES, `mipmap-${d}`, 'ic_launcher_background.png'), pngAt(ICON_BG, 108 * k));
  writeFileSync(join(RES, `mipmap-${d}`, 'ic_launcher_monochrome.png'), pngAt(ICON_MONO, 108 * k));
  writeFileSync(join(RES, `mipmap-${d}`, 'ic_launcher.png'), pngAt(ICON_LEGACY, 48 * k));
}
writeFileSync(join(import.meta.dirname, '..', 'docs', 'store-icon-512.png'), pngAt(ICON_PLAY, 512));

// Splash. Android 12+: the system shows windowSplashScreenAnimatedIcon (288 dp, content inside a 192 dp circle) and a
// branding image (200×80 dp) on the navy background. Older Android: the launch theme's layer-list, the same picture.
const SPLASH_ICON = svgDoc(576, 576, `<g transform="translate(288 288) scale(0.95) translate(-216 -216)">${torahScroll()}</g>`);
const BRAND = (x, y, size) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Ezra SIL" font-size="${size}" font-weight="bold" fill="#f3d27a" direction="rtl">בעל קורא</text>`;
const SPLASH_BRAND = svgDoc(400, 160, BRAND(200, 115, 92));
const SPLASH_LOGO = svgDoc(600, 720, `<g transform="translate(300 300) scale(1.25) translate(-216 -216)">${torahScroll()}</g>${BRAND(300, 660, 110)}`);
for (const [d, k] of Object.entries(DENSITY)) {
  mkdirSync(join(RES, `drawable-${d}`), { recursive: true });
  writeFileSync(join(RES, `drawable-${d}`, 'splash_icon.png'), pngAt(SPLASH_ICON, 288 * k));
  writeFileSync(join(RES, `drawable-${d}`, 'splash_brand.png'), pngAt(SPLASH_BRAND, 200 * k));
  writeFileSync(join(RES, `drawable-${d}`, 'logo.png'), pngAt(SPLASH_LOGO, 180 * k));
}
console.log(`icon and splash written to ${RES}`);
