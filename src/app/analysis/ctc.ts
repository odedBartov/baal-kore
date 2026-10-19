// CTC forced alignment of known Hebrew text against a consonantal CTC acoustic model
// (Omnilingual ASR CTC-300M, Apache-2.0). Pure TypeScript: used at build time (reference timings) and
// on device (student word checks); the model runs natively and only a reduced log-prob matrix reaches JS.

/** Columns of the reduced matrix: blank, word separator, the 27 Hebrew letter forms, then "anything else". */
export const HEBREW_LETTERS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
export const BLANK = 0;
export const SPACE = 1;
export const OTHER = 2 + HEBREW_LETTERS.length;
export const K = OTHER + 1;
export const FRAME_MS = 20; // wav2vec2 conv stack: 320-sample stride at 16 kHz
export const CTC_MODEL_ID = 'omnilingual-asr-ctc-300m-int8@2025-11-12';

export const letterColumn = (ch: string) => {
  const i = HEBREW_LETTERS.indexOf(ch);
  if (i < 0) throw new Error(`not a Hebrew letter: ${ch}`);
  return 2 + i;
};

/**
 * The multilingual model sometimes writes what it hears in Latin script (it did for Ashkenazi-pronounced
 * chant: "alpne moim" for על פני המים), so each Hebrew column also absorbs the Latin letters that spell the
 * same sound. Vowel letters map to the matres they would be written with in plene Hebrew; "e" maps nowhere.
 */
export const LATIN_ALIASES: Record<string, string[]> = {
  'א': ['a'], 'ב': ['b', 'v'], 'ג': ['g'], 'ד': ['d'], 'ה': ['h'], 'ו': ['o', 'u', 'v', 'w'], 'ז': ['z'],
  'ח': ['x'], 'ט': ['t'], 'י': ['i', 'y', 'j'], 'כ': ['k', 'c', 'x'], 'ך': ['k', 'c', 'x'], 'ל': ['l'], 'מ': ['m'], 'ם': ['m'],
  'נ': ['n'], 'ן': ['n'], 'ס': ['s'], 'ע': [], 'פ': ['p', 'f'], 'ף': ['p', 'f'], 'צ': [], 'ץ': [], 'ק': ['q', 'k'],
  'ר': ['r'], 'ש': ['s'], 'ת': ['t', 's'],
};

/** Model token ids feeding each reduced column (OTHER excluded): the Hebrew letter first, then its Latin aliases. */
export function columnTokenIds(tokensTxt: string): Int32Array[] {
  const ids = new Map<string, number>();
  for (const line of tokensTxt.split('\n')) {
    const i = line.lastIndexOf(' ');
    if (i >= 0) ids.set(line.slice(0, i), Number(line.slice(i + 1)));
  }
  const cols: Int32Array[] = [Int32Array.of(ids.get('<s>')!), Int32Array.of(ids.get(' ')!)];
  for (const ch of HEBREW_LETTERS) {
    const own = ids.get(ch);
    if (own === undefined) throw new Error(`model lacks token ${ch}`);
    cols.push(Int32Array.from([own, ...LATIN_ALIASES[ch].map((a) => ids.get(a)).filter((x): x is number => x !== undefined)]));
  }
  return cols;
}

/**
 * Log-softmax over the full vocabulary, reduced to our columns (log-sum over each column's tokens), plus the best
 * single token that feeds no column. (Not the sum of the ~9,800 others: that mass would out-vote every letter
 * whenever the model hesitates.)
 */
export function reduceLogits(logits: Float32Array, T: number, V: number, cols: Int32Array[]): Float32Array {
  const out = new Float32Array(T * K);
  const keep = new Uint8Array(V);
  for (const c of cols) for (const id of c) keep[id] = 1;
  for (let t = 0; t < T; t++) {
    const row = t * V;
    let max = -Infinity, otherMax = -Infinity;
    for (let v = 0; v < V; v++) {
      const l = logits[row + v];
      if (l > max) max = l;
      if (!keep[v] && l > otherMax) otherMax = l;
    }
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(logits[row + v] - max);
    const lse = max + Math.log(sum);
    for (let k = 0; k < OTHER; k++) {
      let p = 0;
      for (const id of cols[k]) p += Math.exp(logits[row + id] - max);
      out[t * K + k] = max + Math.log(p) - lse;
    }
    out[t * K + OTHER] = otherMax - lse;
  }
  return out;
}

export interface AlignTarget {
  tokens: number[]; // reduced-column ids, words separated by SPACE
  wordOfToken: number[]; // word index for each token (-1 for SPACE)
}

/** Builds the target from the spoken consonants of each word. */
export function buildTarget(words: string[]): AlignTarget {
  const tokens: number[] = [], wordOfToken: number[] = [];
  words.forEach((w, i) => {
    if (i) (tokens.push(SPACE), wordOfToken.push(-1));
    for (const ch of w) (tokens.push(letterColumn(ch)), wordOfToken.push(i));
  });
  return { tokens, wordOfToken };
}

export interface WordSpan {
  startFrame: number;
  endFrame: number; // inclusive, last frame of the word's last letter
  score: number; // mean over letters of the best log-posterior of that letter inside its span (≤ 0)
}

/**
 * Viterbi forced alignment (standard CTC topology). Word separators are optional — the model often
 * omits them in continuous chant — so the path may skip a SPACE token.
 */
export function forcedAlign(lp: Float32Array, T: number, target: AlignTarget): WordSpan[] {
  const L = target.tokens.length, S = 2 * L + 1;
  if (T < L) throw new Error(`audio too short for the text (${T} frames < ${L} tokens)`);
  const ext = new Int32Array(S);
  for (let i = 0; i < L; i++) ext[2 * i + 1] = target.tokens[i];
  const optional = (s: number) => s >= 0 && (s & 1) === 1 && ext[s] === SPACE;
  // ponytail: full T×S back-pointer table (≈ 75 MB for a 6-minute aliyah). Fine at build time and for single verses on device.
  const back = new Uint8Array(T * S);
  let prev = new Float64Array(S).fill(-Infinity), cur = new Float64Array(S);
  prev[0] = lp[ext[0]];
  prev[1] = lp[ext[1]];
  for (let t = 1; t < T; t++) {
    const row = t * K;
    for (let s = 0; s < S; s++) {
      let best = prev[s], from = 0;
      if (s >= 1 && prev[s - 1] > best) (best = prev[s - 1]), (from = 1);
      const label = ext[s] !== BLANK;
      if (s >= 2 && ((label && ext[s] !== ext[s - 2]) || (!label && optional(s - 1))) && prev[s - 2] > best) (best = prev[s - 2]), (from = 2);
      if (label && optional(s - 2)) {
        if (prev[s - 3] > best) (best = prev[s - 3]), (from = 3); // blank before the skipped separator
        if (s >= 4 && ext[s] !== ext[s - 4] && prev[s - 4] > best) (best = prev[s - 4]), (from = 4); // letter before it
      }
      cur[s] = best + lp[row + ext[s]];
      back[t * S + s] = from;
    }
    [prev, cur] = [cur, prev];
  }
  let s = prev[S - 1] >= prev[S - 2] ? S - 1 : S - 2;
  if (!isFinite(prev[s])) throw new Error('no CTC alignment path');
  const stateAt = new Int32Array(T);
  for (let t = T - 1; t >= 0; t--) {
    stateAt[t] = s;
    s -= back[t * S + s];
  }

  const nWords = Math.max(...target.wordOfToken) + 1;
  const spans: WordSpan[] = Array.from({ length: nWords }, () => ({ startFrame: -1, endFrame: -1, score: 0 }));
  const bestOfToken = new Float64Array(L).fill(-Infinity);
  for (let t = 0; t < T; t++) {
    const st = stateAt[t];
    if (!(st & 1)) continue;
    const tok = (st - 1) >> 1, w = target.wordOfToken[tok];
    bestOfToken[tok] = Math.max(bestOfToken[tok], lp[t * K + ext[st]]);
    if (w < 0) continue;
    if (spans[w].startFrame < 0) spans[w].startFrame = t;
    spans[w].endFrame = t;
  }
  const n = new Int32Array(nWords);
  target.wordOfToken.forEach((w, tok) => {
    if (w >= 0) (spans[w].score += bestOfToken[tok]), n[w]++;
  });
  spans.forEach((sp, w) => (sp.score /= n[w] || 1));
  return spans;
}

/** Best-path transcription (diagnostics, extra-speech detection). OTHER renders as '?'. */
export function greedyDecode(lp: Float32Array, T: number, from = 0, to = T): string {
  let out = '', last = -1;
  for (let t = from; t < to; t++) {
    let b = 0;
    for (let k = 1; k < K; k++) if (lp[t * K + k] > lp[t * K + b]) b = k;
    if (b !== last && b !== BLANK) out += b === SPACE ? ' ' : b === OTHER ? '?' : HEBREW_LETTERS[b - 2];
    last = b;
  }
  return out.replace(/ +/g, ' ').trim();
}

/** Letter-level edit distance (spaces ignored). */
export function letterDistance(a: string, b: string): number {
  const x = a.replace(/ /g, ''), y = b.replace(/ /g, '');
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    row = next;
  }
  return row[y.length];
}
