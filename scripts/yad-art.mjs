// The Torah pointer (yad): a prestigious ornate pointer with a crowned, gem-set finial, filigree rings, an enamel
// collar and a sculpted hand whose index finger points at the word. Drawn upright (finger down) and rotated 40°, so the
// fingertip lands at about (43, 167) of the 200×200 canvas (the charts rely on that: tip at the bottom-left).

export const PALETTES = {
  silver: { // polished sterling silver with gold trim and a sapphire
    hi: '#ffffff', mid: '#c9d1da', lo: '#7d8894', edge: '#4d5762',
    trimHi: '#fff1b0', trimMid: '#e2b13c', trimLo: '#8f5f10',
    gem: '#2f6fe0', gemHi: '#bcd8ff', enamel: '#1b3a6b',
  },
  gold: { // solid gold with a ruby
    hi: '#fff6c4', mid: '#e8b730', lo: '#9a6508', edge: '#6a4204',
    trimHi: '#ffffff', trimMid: '#dfe5ec', trimLo: '#8a95a1',
    gem: '#d62839', gemHi: '#ffc2c8', enamel: '#7a1220',
  },
  emerald: { // deep green enamel over gold, emerald stone
    hi: '#b9f5d6', mid: '#22a56f', lo: '#0b5a3a', edge: '#063824',
    trimHi: '#fff1b0', trimMid: '#e2b13c', trimLo: '#8f5f10',
    gem: '#10b981', gemHi: '#d1fae5', enamel: '#06402a',
  },
  royal: { // royal purple enamel with a golden crown
    hi: '#efe0ff', mid: '#8a4fe8', lo: '#42188f', edge: '#26095f',
    trimHi: '#fff1b0', trimMid: '#f0bd36', trimLo: '#9a6a10',
    gem: '#ffd34d', gemHi: '#fffbe0', enamel: '#2d0f66',
  },
};

export function yadSvg(c) {
  const id = (n) => `${n}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
<defs>
  <linearGradient id="${id('cyl')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.lo}"/><stop offset="0.28" stop-color="${c.hi}"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>
  <linearGradient id="trim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.trimLo}"/><stop offset="0.3" stop-color="${c.trimHi}"/><stop offset="0.6" stop-color="${c.trimMid}"/><stop offset="1" stop-color="${c.trimLo}"/></linearGradient>
  <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${c.hi}"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></radialGradient>
  <radialGradient id="tball" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${c.trimHi}"/><stop offset="0.55" stop-color="${c.trimMid}"/><stop offset="1" stop-color="${c.trimLo}"/></radialGradient>
  <radialGradient id="gem" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${c.gemHi}"/><stop offset="0.4" stop-color="${c.gem}"/><stop offset="1" stop-color="${c.edge}"/></radialGradient>
  <linearGradient id="hand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset="0.5" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="2" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity="0.35"/></filter>
</defs>
<g filter="url(#shadow)"><g transform="rotate(40 100 100)">
  <!-- shaft -->
  <rect x="93" y="14" width="14" height="112" rx="6" fill="url(#cyl)" stroke="${c.edge}" stroke-width="1.6"/>
  <!-- enamel spiral bands with tiny gold studs -->
  <g stroke="${c.enamel}" stroke-width="2.2" stroke-linecap="round" opacity="0.8">
    ${[28, 38, 48, 58].map((y) => `<path d="M94 ${y + 5} L106 ${y}"/>`).join('')}
    ${[88, 96, 104, 112].map((y) => `<path d="M94 ${y + 5} L106 ${y}"/>`).join('')}
  </g>
  <!-- gold rings with rope detail -->
  ${[22, 66, 76, 118].map((y) => `<rect x="89.5" y="${y}" width="21" height="7" rx="3.2" fill="url(#trim)" stroke="${c.trimLo}" stroke-width="1"/><path d="M92 ${y + 1.5} l3 4 M97 ${y + 1.5} l3 4 M102 ${y + 1.5} l3 4 M107 ${y + 1.5} l2 3" stroke="${c.trimLo}" stroke-width="0.9" opacity="0.7"/>`).join('')}
  <!-- central knop (urn) -->
  <path d="M100 80 C 112 84, 114 96, 100 104 C 86 96, 88 84, 100 80 Z" fill="url(#ball)" stroke="${c.edge}" stroke-width="1.5"/>
  <circle cx="100" cy="92" r="4.6" fill="url(#gem)" stroke="${c.trimLo}" stroke-width="1.2"/>
  <ellipse cx="98.4" cy="90.4" rx="1.5" ry="1.1" fill="#fff" opacity="0.85"/>
  <!-- crowned finial -->
  <path d="M85 20 L85 8 L91 14 L96 3 L100 11 L104 3 L109 14 L115 8 L115 20 Z" fill="url(#trim)" stroke="${c.trimLo}" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="85" cy="7" r="2.6" fill="url(#tball)" stroke="${c.trimLo}" stroke-width="0.8"/><circle cx="115" cy="7" r="2.6" fill="url(#tball)" stroke="${c.trimLo}" stroke-width="0.8"/>
  <circle cx="96" cy="2.5" r="2.4" fill="url(#tball)" stroke="${c.trimLo}" stroke-width="0.8"/><circle cx="104" cy="2.5" r="2.4" fill="url(#tball)" stroke="${c.trimLo}" stroke-width="0.8"/>
  <circle cx="100" cy="14" r="5.2" fill="url(#gem)" stroke="${c.trimLo}" stroke-width="1.3"/>
  <ellipse cx="98.3" cy="12.2" rx="1.7" ry="1.2" fill="#fff" opacity="0.9"/>
  <!-- collar with enamel and gem where the hand begins -->
  <path d="M88 126 L112 126 L117 140 L83 140 Z" fill="url(#trim)" stroke="${c.trimLo}" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M91 129 L109 129 L112 137 L88 137 Z" fill="${c.enamel}" opacity="0.9"/>
  <circle cx="100" cy="133" r="3.2" fill="url(#gem)" stroke="${c.trimLo}" stroke-width="0.9"/>
  <path d="M84 140 q16 8 32 0" stroke="${c.trimLo}" stroke-width="1.4" fill="none"/>
  <!-- sculpted hand, index finger pointing down -->
  <path d="M87 140 C 83 150, 84 162, 92 166 L108 166 C 116 160, 117 148, 113 140 Z" fill="url(#hand)" stroke="${c.edge}" stroke-width="1.6" stroke-linejoin="round"/>
  <!-- curled fingers -->
  ${[0, 1, 2].map((i) => `<ellipse cx="${112 - i * 0.6}" cy="${148 + i * 7}" rx="5.2" ry="4" fill="url(#hand)" stroke="${c.edge}" stroke-width="1.3"/>`).join('')}
  <!-- thumb -->
  <path d="M86 146 C 77 148, 76 158, 84 160 C 90 160, 92 154, 90 150 Z" fill="url(#hand)" stroke="${c.edge}" stroke-width="1.4" stroke-linejoin="round"/>
  <!-- index finger with knuckles and nail -->
  <path d="M95 162 L95 184 C 95 191, 105 191, 105 184 L105 162 Z" fill="url(#hand)" stroke="${c.edge}" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M95.5 171 q4.5 2 9 0 M95.5 178 q4.5 2 9 0" stroke="${c.lo}" stroke-width="1" fill="none" opacity="0.8"/>
  <path d="M97 185 C 97 189, 103 189, 103 185" stroke="#fff" stroke-width="1.1" fill="none" opacity="0.7"/>
  <!-- specular glints -->
  <path d="M95.5 20 L95.5 120" stroke="#fff" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
  <path d="M96.5 150 L96.5 160" stroke="#fff" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
</g></g>
</svg>`;
}
