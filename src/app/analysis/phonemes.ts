// Expected pronunciation of a fully pointed word (Israeli or Ashkenazi reading), as a sequence of sound slots for the ZIPA phone
// model (IPA, 127 tokens). Each slot accepts a set of IPA tokens: consonants are tolerant (they only anchor the
// alignment; dagesh and similar distinctions are not judged here), vowels name the niqqud being checked.
// Slots may be optional: א/ה/ע, vocal sheva (often silent in Israeli speech), a glide yod after a/o/u.
import { charClass } from '../torah/hebrew';

export type VowelClass = 'A' | 'E' | 'I' | 'O' | 'U';
export type Pronunciation = 'israeli' | 'ashkenazi';

export interface Slot {
  tokens: string[]; // accepted IPA tokens
  optional: boolean;
  vowel?: VowelClass; // a full vowel to be checked (sheva is never checked)
  also?: VowelClass[]; // other vowel groups accepted for it (Ashkenazi holam "oi"/"ei", qamats "o"/"u")
  contrast?: { kind: 'dagesh' | 'shin'; want: string[]; against: string[]; glyph: string; sound: string; other: string }; // בּ/ב, כּ/כ, פּ/פ (תּ/ת), שׁ/שׂ
  sheva?: 'na' | 'nach'; // a sheva every reader agrees on: na must be sounded, nach must not
  glyph?: string; // the letter with its marks, for feedback
  point?: string; // its niqqud name, for feedback
  letter: number; // index of the letter (grapheme) in the word carrying it
}

/** Core IPA tokens per Hebrew vowel quality. A vowel is judged against the other four groups. */
export const VOWELS: Record<VowelClass, string[]> = {
  A: ['a', 'ɑ', 'ɐ', 'æ', 'ʌ'],
  E: ['e', 'ɛ', 'ɘ', 'ɜ'],
  I: ['i', 'ɪ', 'ɨ', 'y'],
  O: ['o', 'ɔ', 'ɒ', 'ɵ'],
  U: ['u', 'ʊ', 'ʉ', 'ɯ', 'ʏ'],
};
const SCHWA = ['ə', 'ɘ', 'ɜ', 'e', 'ɛ', 'ɪ', 'ɨ'];

/** ZIPA tokens that never stand for a sound of their own: diacritics, length, word boundary. Folded into blank. */
export const MODIFIER_TOKENS = ['<sos/eos>', '<unk>', '▁', 'ː', 'ʰ', 'ʲ', 'ʷ', 'ʼ', '˞', 'ˠ', 'ˤ', '̃', '̚', '̥', '̩', '̪', '̴', '̺'];

const C: Record<string, string[]> = {
  א: ['ʔ'], ב: ['b', 'v', 'β', 'ʋ', 'w'], ג: ['g', 'ɣ', 'k'], ד: ['d', 'ð', 't'], ה: ['h', 'ɦ', 'ʔ'], ו: ['v', 'w', 'β', 'ʋ', 'f'],
  ז: ['z', 's', 'ʒ'], ח: ['x', 'χ', 'ħ', 'h', 'ç'], ט: ['t', 'd'], י: ['j', 'ʝ', 'i', 'ɪ'], כ: ['k', 'x', 'χ', 'q', 'g', 'ç'],
  ל: ['l', 'ɭ', 'ɬ'], מ: ['m', 'ɱ', 'n'], נ: ['n', 'ŋ', 'ɲ', 'm'], ס: ['s', 'z', 'ʃ'], ע: ['ʔ', 'ʕ', 'ħ', 'h'],
  פ: ['p', 'f', 'ɸ', 'b'], צ: ['s', 'ʃ', 'z', 'ʂ'], ק: ['k', 'q', 'g'], ר: ['ʁ', 'r', 'ɾ', 'ɹ', 'ʀ', 'χ', 'ɣ', 'ʕ'],
  שׁ: ['ʃ', 's', 'ɕ', 'ʂ', 'ʒ'], שׂ: ['s', 'ʃ', 'z'], ת: ['t', 's', 'θ', 'd'],
};
const FINAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const OPTIONAL_C = new Set(['א', 'ה', 'ע']);

const POINT: Record<string, { v: VowelClass | 'sheva'; name: string }> = {
  'ְ': { v: 'sheva', name: 'שווא' },
  'ֱ': { v: 'E', name: 'חטף סגול' },
  'ֲ': { v: 'A', name: 'חטף פתח' },
  'ֳ': { v: 'O', name: 'חטף קמץ' },
  'ִ': { v: 'I', name: 'חיריק' },
  'ֵ': { v: 'E', name: 'צירה' },
  'ֶ': { v: 'E', name: 'סגול' },
  'ַ': { v: 'A', name: 'פתח' },
  'ָ': { v: 'A', name: 'קמץ' },
  'ֹ': { v: 'O', name: 'חולם' },
  'ֺ': { v: 'O', name: 'חולם' },
  'ֻ': { v: 'U', name: 'קובוץ' },
  'ׇ': { v: 'O', name: 'קמץ קטן' },
};
const DAGESH = 'ּ', SHIN = 'ׁ', SIN = 'ׂ';

// Dagesh where the pronunciation tells the two sounds apart (ג ד, and ת in Israeli reading, sound the same either way).
const STOP_FRICATIVE: Record<string, { stop: string[]; fric: string[]; s: string; f: string }> = {
  ב: { stop: ['b'], fric: ['v', 'β', 'ʋ', 'w', 'f'], s: 'b', f: 'v' },
  כ: { stop: ['k', 'q'], fric: ['x', 'χ', 'ç'], s: 'k', f: 'kh' },
  פ: { stop: ['p'], fric: ['f', 'ɸ'], s: 'p', f: 'f' },
};
const TAV = { stop: ['t', 'd'], fric: ['s', 'θ', 'z'], s: 't', f: 's' }; // Ashkenazi only
const SH = ['ʃ', 'ɕ', 'ʂ', 'ʒ'], S = ['s', 'z'];
const SHORT = new Set(['פתח', 'סגול', 'חיריק', 'קובוץ', 'קמץ קטן']); // a sheva after these closes the syllable

interface G {
  letter: string;
  points: string;
}

const vowelOf = (g: G) => [...g.points].map((p) => POINT[p]).find((x) => x);

/**
 * Slots for one word. `syllables` (havarotjs, with qamats qatan marked) say which shevas are vocal: a vocal sheva
 * is a syllable of its own. `spoken` is the read consonant skeleton (the Tetragrammaton is read "Adonai").
 */
export function wordSlots(syllables: { text: string; reduced: boolean }[], spoken: string, pron: Pronunciation = 'israeli'): { slots: Slot[]; checkable: boolean } {
  const gs: G[] = [], vocalSheva = new Set<number>();
  for (const syl of syllables) {
    const start = gs.length;
    for (const c of syl.text) {
      const k = charClass(c);
      if (k === 'letter') gs.push({ letter: FINAL[c] ?? c, points: '' });
      else if (k === 'point' && gs.length) gs[gs.length - 1].points += c;
    }
    if (syl.reduced && gs.length - start === 1 && gs[start].points.includes('ְ')) vocalSheva.add(start);
  }
  const letters = gs.map((g) => g.letter).join('');
  if (letters.includes('יהוה') && spoken.includes('אדני')) return { slots: adonai(gs, letters.indexOf('יהוה')), checkable: false };

  // Sheva na / nach only where all readers agree; anything else (e.g. after a long vowel) is not judged.
  const shevaKind = (i: number): 'na' | 'nach' | null => {
    const g = gs[i], prev = i > 0 ? vowelOf(gs[i - 1]) : undefined;
    if (i === gs.length - 1) return null; // word-final sheva is silent by spelling
    let k: 'na' | 'nach' | null = null;
    // Not under ו/י: in chant וְ / יְ glide into the next sound, and the short vowel is not heard apart (docs/validation.md).
    if (g.letter !== 'ו' && g.letter !== 'י' && (i === 0 || prev?.v === 'sheva' || gs[i + 1]?.letter === g.letter || (g.points.includes(DAGESH) && prev))) k = 'na'; // first letter, second of two, identical letters, dagesh hazaq
    else if (prev && SHORT.has(prev.name) && gs[i - 1].letter !== 'ו') k = 'nach';
    return k && (k === 'na') === vocalSheva.has(i) ? k : null; // and havarotjs agrees
  };
  const glyph = (g: G) => g.letter + [...g.points].filter((p) => p === DAGESH || p === SHIN || p === SIN).join('');

  const slots: Slot[] = [];
  const add = (tokens: string[], letter: number, optional = false, vowel?: VowelClass, point?: string) => slots.push({ tokens, optional, vowel, point, letter });
  const addVowel = (v: { v: VowelClass | 'sheva'; name: string }, i: number, point = '') => {
    if (v.v === 'sheva') {
      const k = shevaKind(i);
      if (k || vocalSheva.has(i)) slots.push({ tokens: SCHWA, optional: true, letter: i, sheva: k ?? undefined, glyph: glyph(gs[i]) });
      return;
    }
    // Ashkenazi: qamats gadol is "o" (or "u"), holam "oi"/"ei"/"ou", tsere "ei"; the glide after them is optional.
    const ash = pron === 'ashkenazi' ? (point.includes('ָ') ? { v: 'O' as VowelClass, also: ['U', 'A'] as VowelClass[] } : /[ֹֺ]/.test(point) || v.name === 'חולם מלא' ? { v: 'O' as VowelClass, also: ['E', 'A'] as VowelClass[] } : null) : null;
    const main = ash?.v ?? v.v, also = ash?.also ?? [];
    slots.push({ tokens: [...new Set([main, ...also].flatMap((c) => (c === 'E' ? [...VOWELS.E, 'ə'] : VOWELS[c])))], optional: false, vowel: main, also: also.length ? also : undefined, point: v.name, letter: i });
    if (pron === 'ashkenazi' && (ash || v.name === 'צירה')) add(['j', 'i', 'ɪ', 'w', 'u', 'ʊ'], i, true);
  };

  gs.forEach((g, i) => {
    const v = vowelOf(g), prev = i > 0 ? vowelOf(gs[i - 1]) : undefined, last = i === gs.length - 1;
    const bare = !g.points.replace(/[ׁׂ]/g, '');
    if (g.letter === 'ו') {
      if (g.points.includes(DAGESH) && !v) return add(VOWELS.U, i, false, 'U', 'שורוק'); // shuruk
      if (/[ֹֺ]/.test(g.points) && !v?.v.match(/[AEIU]/) && i > 0 && !prev) return addVowel({ v: 'O', name: 'חולם מלא' }, i); // holam male
      if (bare && i > 0 && prev?.v === 'O') return; // vav after holam (normalised order): mater
    }
    if (bare && (g.letter === 'א' || (g.letter === 'ה' && last))) return; // silent alef, final he
    if (bare && g.letter === 'י' && i > 0 && (prev?.v === 'I' || prev?.v === 'E')) return; // mater yod
    // Furtive patah: a word-final guttural with patah is read vowel-first (רוּחַ = ruax).
    if (last && v?.v === 'A' && g.points.includes('ַ') && (g.letter === 'ח' || g.letter === 'ע' || (g.letter === 'ה' && g.points.includes(DAGESH)))) {
      addVowel(v, i, g.points);
      return add(C[g.letter], i, g.letter !== 'ח');
    }
    const key = g.letter === 'ש' ? (g.points.includes(SIN) ? 'שׂ' : 'שׁ') : g.letter;
    if (g.letter === 'צ') add(['t'], i, true); // ts: the t may or may not come out as its own token
    add(C[key] ?? [], i, OPTIONAL_C.has(g.letter) || (g.letter === 'י' && bare));
    const sf = STOP_FRICATIVE[g.letter] ?? (pron === 'ashkenazi' && g.letter === 'ת' ? TAV : null), slot = slots[slots.length - 1];
    if (sf) {
      const stop = g.points.includes(DAGESH);
      slot.contrast = { kind: 'dagesh', want: stop ? sf.stop : sf.fric, against: stop ? sf.fric : sf.stop, glyph: glyph(g), sound: stop ? sf.s : sf.f, other: stop ? sf.f : sf.s };
    } else if (g.letter === 'ש' && (g.points.includes(SHIN) || g.points.includes(SIN))) {
      const sin = g.points.includes(SIN);
      slot.contrast = { kind: 'shin', want: sin ? S : SH, against: sin ? SH : S, glyph: glyph(g), sound: sin ? 's' : 'sh', other: sin ? 'sh' : 's' };
    }
    if (v) addVowel(v, i, g.points);
  });
  return { slots: slots.filter((s) => s.tokens.length), checkable: true };
}

/** The Tetragrammaton (and its prefixed forms) read "Adonai"; its written vowels are not the spoken ones. */
function adonai(gs: G[], at: number): Slot[] {
  const pre = gs.slice(0, at).flatMap((g, i) => [{ tokens: C[g.letter] ?? [], optional: false, letter: i }, { tokens: VOWELS.A, optional: true, letter: i }]);
  const word = [['ʔ'], VOWELS.A, ['d', 'ð'], VOWELS.O, ['n'], VOWELS.A, ['j', 'i', 'ɪ']].map((tokens, k) => ({ tokens, optional: k === 0 || k === 6, letter: at }));
  return [...pre, ...word];
}
