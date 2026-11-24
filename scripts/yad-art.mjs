// The Torah pointer (yad): a prestigious ornate pointer with a crowned, gem-set finial, filigree rings, an enamel
// collar and a sculpted hand whose index finger points at the word. Drawn upright (finger down) and rotated 40°, so the
// fingertip lands at about (40, 163) of the 200×200 canvas (the charts rely on that: tip at the bottom-left).

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
  <linearGradient id="hand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset="0.45" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>
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

  <!-- Curled fingers (middle, ring, pinky) on the inner fist -->
  <g fill="url(#hand)" stroke="${c.edge}" stroke-width="1.4" stroke-linejoin="round">
    <!-- Pinky knuckle -->
    <path d="M 105 141 C 111 142, 114 147, 112 153 C 109 156, 104 155, 102 149 Z"/>
    <!-- Ring finger knuckle -->
    <path d="M 103 148 C 110 150, 113 156, 110 162 C 107 165, 101 164, 99 157 Z"/>
    <!-- Middle finger knuckle -->
    <path d="M 98 155 C 106 157, 108 166, 105 172 C 100 175, 94 172, 95 164 Z"/>
  </g>
  <!-- Curled fingers fold lines -->
  <path d="M 103 149 C 106 151, 110 150, 112 147" stroke="${c.lo}" stroke-width="1" fill="none"/>
  <path d="M 100 157 C 104 159, 109 158, 110 155" stroke="${c.lo}" stroke-width="1" fill="none"/>
  <path d="M 96 165 C 100 168, 105 167, 105 164" stroke="${c.lo}" stroke-width="1" fill="none"/>

  <!-- Extended index finger & dorsal back-of-hand:
       Smooth, continuous outer contour on the left edge.
       From collar (88, 140) down to tip (91.5, 185).
  -->
  <path d="M 88 140
           C 87 146, 87 156, 88.5 165
           L 91.5 184
           C 92 188.5, 96.5 188.5, 97 184
           L 97.5 164
           C 98 156, 101 147, 107 140
           Z"
        fill="url(#hand)" stroke="${c.edge}" stroke-width="1.5" stroke-linejoin="round"/>

  <!-- Index finger joint creases -->
  <path d="M 89.8 170 C 92 172, 95 172, 97 170" stroke="${c.lo}" stroke-width="1.1" fill="none" opacity="0.85"/>
  <path d="M 90.8 177 C 92.5 179, 95 179, 96.6 177" stroke="${c.lo}" stroke-width="1.1" fill="none" opacity="0.85"/>

  <!-- Ornate filigree ring on index finger -->
  <rect x="89.5" y="167" width="8" height="3" rx="1.5" fill="url(#trim)" stroke="${c.trimLo}" stroke-width="0.8"/>

  <!-- Index fingernail with highlight -->
  <path d="M 92 184 C 92 187.5, 96 187.5, 96 184" stroke="#ffffff" stroke-width="1.3" fill="none" opacity="0.9"/>
  <ellipse cx="94" cy="184.2" rx="1.6" ry="1.1" fill="#ffffff" opacity="0.5"/>

  <!-- Thumb: emerges from the wrist/palm base and curves across to rest over the middle finger -->
  <path d="M 88 140
           C 89 146, 92 152, 96 156
           C 100 160, 104 160, 104 156
           C 104 152, 99 148, 96 144
           C 93 141, 90 140, 88 140
           Z"
        fill="url(#hand)" stroke="${c.edge}" stroke-width="1.3" stroke-linejoin="round"/>
  <!-- Thumb knuckle and nail detail -->
  <path d="M 99 158 C 101 159, 103 158, 102.5 155" stroke="#ffffff" stroke-width="1" fill="none" opacity="0.8"/>
  <path d="M 92 147 C 95 149, 98 149, 100 146" stroke="${c.lo}" stroke-width="0.9" fill="none" opacity="0.75"/>

  <!-- Specular dorsal highlight: runs from wrist down the outer edge of index finger -->
  <path d="M 88.8 142 L 89.2 165 L 92 183" stroke="#ffffff" stroke-width="1.4" opacity="0.75" stroke-linecap="round"/>
  <!-- Specular glint on shaft -->
  <path d="M95.5 20 L95.5 120" stroke="#fff" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
</g></g>
</svg>`;
}
