// Compares what the acoustic model heard (consonants) with what should have been read, word by word.
// The model writes plene spellings and cannot hear distinctions that Israeli and Ashkenazi pronunciation
// merge, so those differences cost little; a missing or different word still costs a lot.

const FINAL: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const base = (c: string) => FINAL[c] ?? c;

/** Letters that may be added/dropped in plene vs. defective spelling (matres lectionis). */
const MATRES = new Set(['א', 'ה', 'ו', 'י']);

/** Groups the model cannot (or need not) tell apart in accepted pronunciations. */
const SOUND_ALIKE: string[][] = [
  ['א', 'ע', 'ה'], // glottals, silent final he
  ['ח', 'כ'], // kh (khet / khaf)
  ['כ', 'ק'], // k
  ['ט', 'ת'], // t
  ['ב', 'ו'], // v
  ['ס', 'ש'], // s (sin)
  ['ת', 'ס'], // Ashkenazi tav without dagesh
  ['צ', 'ס'],
];

export function substitutionCost(a: string, b: string): number {
  const x = base(a), y = base(b);
  if (x === y) return 0;
  return SOUND_ALIKE.some((g) => g.includes(x) && g.includes(y)) ? 0.25 : 1;
}

const indelCost = (c: string) => (MATRES.has(base(c)) ? 0.3 : 1);

export interface LetterComparison {
  wordCost: number[]; // edit cost charged to each expected word
  wordScore: number[]; // credit for the letters actually heard, 0..1 (see below)
  wordMatched: number[]; // letters of the word heard exactly or as an accepted sound-alike
  gaps: string[]; // heard letters not matched to any word, per gap: gaps[0] before word 0, gaps[i] after word i-1
}

/**
 * Weighted edit-distance alignment of the heard letters against the expected words.
 * Word score = (credit for expected letters − penalty for extra letters inside the word) / letters, where an exact
 * match earns 1, an accepted sound-alike 0.8, and a dropped mater lectionis 0.6 — but only if something of the
 * word was heard at all, so a word that is entirely missing scores 0 however many vowel letters it has.
 */
export function compareLetters(heard: string, words: string[]): LetterComparison {
  const H = [...heard.replace(/[^א-ת]/g, '')];
  const E: string[] = [], wordOf: number[] = [];
  words.forEach((w, i) => [...w].forEach((c) => (E.push(c), wordOf.push(i))));
  const n = H.length, m = E.length;
  const D = new Float64Array((n + 1) * (m + 1)), B = new Uint8Array((n + 1) * (m + 1)); // 1 diag, 2 insert (heard only), 3 delete
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) (D[at(i, 0)] = D[at(i - 1, 0)] + indelCost(H[i - 1])), (B[at(i, 0)] = 2);
  for (let j = 1; j <= m; j++) (D[at(0, j)] = D[at(0, j - 1)] + indelCost(E[j - 1])), (B[at(0, j)] = 3);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = D[at(i - 1, j - 1)] + substitutionCost(H[i - 1], E[j - 1]), b = 1;
      const ins = D[at(i - 1, j)] + indelCost(H[i - 1]);
      if (ins < best) (best = ins), (b = 2);
      const del = D[at(i, j - 1)] + indelCost(E[j - 1]);
      if (del < best) (best = del), (b = 3);
      D[at(i, j)] = best;
      B[at(i, j)] = b;
    }
  }

  const W = words.length;
  const wordCost = new Array(W).fill(0), credit = new Array(W).fill(0), matched = new Array(W).fill(0);
  const materDropped = new Array(W).fill(0), penalty = new Array(W).fill(0);
  const gaps: string[] = new Array(W + 1).fill('');
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const b = B[at(i, j)];
    if (b === 1) {
      const w = wordOf[j - 1], c = substitutionCost(H[i - 1], E[j - 1]);
      wordCost[w] += c;
      if (c === 0) (credit[w] += 1), matched[w]++;
      else if (c < 1) (credit[w] += 0.8), matched[w]++;
      i--, j--;
    } else if (b === 3) {
      const w = wordOf[j - 1];
      wordCost[w] += indelCost(E[j - 1]);
      if (MATRES.has(base(E[j - 1]))) materDropped[w]++;
      j--;
    } else {
      // Heard letter with no counterpart. Between two words it is a gap (possible extra speech);
      // inside a word it is charged to that word (plene spelling / mispronunciation).
      const prev = j > 0 ? wordOf[j - 1] : -1, next = j < m ? wordOf[j] : W;
      if (prev !== next) gaps[prev + 1] = H[i - 1] + gaps[prev + 1];
      else (wordCost[prev] += indelCost(H[i - 1])), (penalty[prev] += MATRES.has(base(H[i - 1])) ? 0.1 : 0.3);
      i--;
    }
  }
  const wordScore = words.map((w, k) => {
    const len = Math.max(1, [...w].length);
    const c = credit[k] + (matched[k] > 0 ? 0.6 * materDropped[k] : 0) - penalty[k];
    return Math.max(0, Math.min(1, c / len));
  });
  return { wordCost, wordScore, wordMatched: matched, gaps };
}

/** Similarity of two consonant strings, 0..1, with the same tolerant costs. */
export function similarity(a: string, b: string): number {
  const r = compareLetters(a, [b]);
  return r.wordScore[0] * (r.gaps.join('').length ? Math.max(0, 1 - r.gaps.join('').length / Math.max(1, b.length)) : 1);
}
