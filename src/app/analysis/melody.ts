// Melody (cantillation) comparison of one phrase: the student's pitch contour against the reader's, key removed.
// Inside a sung vowel the timbre does not change, so content-based (MFCC) alignment cannot tell which note of a
// melisma is which. Here the two contours are aligned on pitch itself — but only within a narrow corridor around
// the content alignment (words/syllables matched by timbre), so note timing inside a melisma can differ while a
// wrong note cannot be "explained away" by warping it onto a different note of the reference.

export interface MelodyOptions {
  corridor: number; // comparison frames (×frameStep×10 ms) the pitch alignment may deviate from the content alignment
  stepPenalty: number; // semitones added per non-diagonal step, discourages gratuitous warping
  cap: number; // semitones; one wild frame (octave slip, consonant) cannot dominate
  unvoicedRef: number; // cost when the reader sings and the student does not
  unvoicedStu: number; // cost when the student sings where the reader is silent
  frameStep: number; // pitch frames (10 ms) per comparison frame
}

export const MELODY_DEFAULTS: MelodyOptions = { corridor: 12, stepPenalty: 1.0, cap: 4, unvoicedRef: 1, unvoicedStu: 0.5, frameStep: 2 };

export interface MelodyComparison {
  deviation: number | null; // mean |semitone difference| over the reader's voiced frames, along the alignment
  coverage: number; // share of the reader's voiced frames matched to voiced student frames
  map: Int32Array; // for each (decimated) reference frame, the matched (decimated) student frame (-1: none)
  costs: Float64Array; // per (decimated) reference frame: its cost on the alignment (NaN where the reader is silent)
}

/** Difference folded into [−6, 6] semitones: an octave slip in pitch tracking is not a melody error. */
export const fold = (d: number) => d - 12 * Math.round(d / 12);

/** Averages `step` consecutive frames (voiced ones only, octave-folded onto the first); null where none is voiced. */
export function decimate(st: (number | null)[], step: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < st.length; i += step) {
    let first: number | null = null, s = 0, n = 0;
    for (let k = i; k < Math.min(st.length, i + step); k++) {
      const v = st[k];
      if (v === null) continue;
      if (first === null) first = v;
      s += fold(v - first);
      n++;
    }
    out.push(first === null ? null : first + s / n);
  }
  return out;
}

/**
 * `ref` and `stu` are semitones on the same scale (e.g. relative to the reader's median), `offset` is the
 * student's key relative to the reader, subtracted before comparing. `guide[i]` is the student frame (10 ms,
 * relative to `stu`) that the content alignment pairs with reference frame i; without it, a linear guide is used.
 */
export function compareMelody(ref: (number | null)[], stu: (number | null)[], offset: number, o: MelodyOptions = MELODY_DEFAULTS, guide?: ArrayLike<number>): MelodyComparison {
  const R = decimate(ref, o.frameStep), S = decimate(stu, o.frameStep).map((v) => (v === null ? null : v - offset));
  const n = R.length, m = S.length;
  const empty = { deviation: null, coverage: 0, map: new Int32Array(n).fill(-1), costs: new Float64Array(n).fill(NaN) };
  if (!n || !m || !R.some((v) => v !== null)) return empty;

  const cost = (i: number, j: number) => {
    const a = R[i], b = S[j];
    if (a !== null && b !== null) return Math.min(Math.abs(fold(b - a)), o.cap);
    if (a !== null) return o.unvoicedRef;
    return b !== null ? o.unvoicedStu : 0;
  };
  const g = Float64Array.from({ length: n }, (_, i) => (guide ? (guide[Math.min(guide.length - 1, i * o.frameStep)] ?? 0) / o.frameStep : n > 1 ? (i * (m - 1)) / (n - 1) : 0));
  const inBand = (i: number, j: number) => Math.abs(j - g[i]) <= o.corridor;
  const D = new Float64Array(n * m).fill(Infinity), step = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (!inBand(i, j) && !(i === n - 1 && j === m - 1) && !(i === 0 && j === 0)) continue;
      const c = cost(i, j), p = i * m + j;
      if (!i && !j) {
        D[p] = c;
        continue;
      }
      let best = Infinity, s = 0;
      if (i && j && D[p - m - 1] + c < best) (best = D[p - m - 1] + c), (s = 0);
      if (i && D[p - m] + c + o.stepPenalty < best) (best = D[p - m] + c + o.stepPenalty), (s = 1);
      if (j && D[p - 1] + c + o.stepPenalty < best) (best = D[p - 1] + c + o.stepPenalty), (s = 2);
      D[p] = best;
      step[p] = s;
    }
  }
  if (!isFinite(D[n * m - 1])) return empty;

  // Backtrack. Every path cell counts (a reference note held against several student frames, or the reverse, is
  // charged for each of them) — taking only the best match per frame would let the warp hide a wrong note.
  const map = new Int32Array(n).fill(-1), sumAt = new Float64Array(n), nAt = new Uint16Array(n), matchedAt = new Uint8Array(n);
  let pathSum = 0, pathN = 0;
  for (let i = n - 1, j = m - 1; ; ) {
    const c = cost(i, j);
    if (R[i] !== null) {
      sumAt[i] += c;
      nAt[i]++;
      pathSum += c;
      pathN++;
      if (S[j] !== null) matchedAt[i] = 1;
    } else if (S[j] !== null) (pathSum += c), pathN++;
    if (map[i] < 0 || c < cost(i, map[i])) map[i] = j;
    if (!i && !j) break;
    const s = step[i * m + j];
    if (s !== 2) i--;
    if (s !== 1) j--;
    if (i < 0 || j < 0) break;
  }
  let voiced = 0, matched = 0;
  const costs = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (R[i] === null) continue;
    voiced++;
    costs[i] = sumAt[i] / Math.max(1, nAt[i]);
    matched += matchedAt[i];
  }
  return { deviation: pathN ? pathSum / pathN : null, coverage: voiced ? matched / voiced : 0, map, costs };
}
