// Hebrew Unicode handling for fully pointed Biblical text. Never index display strings by character:
// letters carry several combining marks (niqqud + te'amim) whose order varies between editions.

export const MAQAF = '־';
export const PASEQ = '׀';
export const SOF_PASUQ = '׃';
export const METEG = 'ֽ';

export type CharClass = 'letter' | 'point' | 'accent' | 'punct' | 'space' | 'other';

export function charClass(c: string): CharClass {
  const u = c.codePointAt(0)!;
  if (u >= 0x05d0 && u <= 0x05ea) return 'letter';
  if (u >= 0x0591 && u <= 0x05af) return 'accent';
  if ((u >= 0x05b0 && u <= 0x05bd) || u === 0x05bf || u === 0x05c1 || u === 0x05c2 || u === 0x05c4 || u === 0x05c5 || u === 0x05c7) return 'point';
  if (u === 0x05be || u === 0x05c0 || u === 0x05c3 || u === 0x05c6) return 'punct';
  if (/\s/.test(c)) return 'space';
  return 'other'; // e.g. CGJ (U+034F) used by some editions to fix mark order
}

/** Letter + its combining marks. Stable unit for highlighting; never split a cluster. */
export interface Grapheme {
  letter: string;
  points: string; // niqqud, in source order
  accents: string; // te'amim code points, in source order
}

export function graphemes(word: string): Grapheme[] {
  const out: Grapheme[] = [];
  for (const c of word) {
    const k = charClass(c);
    if (k === 'letter') out.push({ letter: c, points: '', accents: '' });
    else if (out.length && k === 'point') out[out.length - 1].points += c;
    else if (out.length && k === 'accent') out[out.length - 1].accents += c;
  }
  return out;
}

/** Bare consonants as written (final forms kept) — the skeleton a Hebrew ASR model emits. */
export function consonants(word: string): string {
  let s = '';
  for (const c of word) if (charClass(c) === 'letter') s += c;
  return s;
}

/** Accent code points in source order. */
export function accentsOf(word: string): string[] {
  return [...word].filter((c) => charClass(c) === 'accent');
}

/** Removes te'amim only (niqqud kept) — the form shown in lesson examples and used by G2P tools. */
export function stripAccents(s: string): string {
  return [...s].filter((c) => charClass(c) !== 'accent').join('');
}

/** Removes all marks — plain consonantal text. */
export function stripMarks(s: string): string {
  return [...s].filter((c) => charClass(c) === 'letter' || charClass(c) === 'space' || c === MAQAF).join('');
}

/** What is read aloud, as bare consonants. The Tetragrammaton is read "Adonai" (perpetual qere). */
export function spokenConsonants(word: string): string {
  const c = consonants(word);
  if (c === 'יהוה') return 'אדני';
  for (const p of ['ו', 'ה', 'ל', 'ב', 'כ', 'מ']) if (c === p + 'יהוה') return p + 'אדני'; // prefixed forms
  return c;
}
