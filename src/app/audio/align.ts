import type { FeatureMatrix } from './mfcc';
import type { PitchFrame } from './pitch';

export interface Alignment {
  path: Int32Array; // flattened [i0, j0, i1, j1, …] from (0,0) to (n-1, m-1)
  aToB: Float32Array; // for each frame of A, the mean aligned frame index in B
  normalizedCost: number; // accumulated cost / (n + m); lower = more similar
}

/** Dynamic time warping between two feature sequences (symmetric step pattern, diagonal weight 2). */
export function dtw(a: FeatureMatrix, b: FeatureMatrix): Alignment {
  const n = a.n, m = b.n, dim = a.dim;
  if (!n || !m || dim !== b.dim) throw new Error('dtw: empty or mismatched feature matrices');
  // ponytail: full n×m matrices (5 bytes/cell: 30 s vs 30 s ≈ 45 MB). Add a Sakoe-Chiba band if longer audio appears.
  const D = new Float32Array(n * m);
  const step = new Uint8Array(n * m); // 0 diagonal, 1 from (i-1,j), 2 from (i,j-1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      // Cosine distance: less than half the Euclidean mean boundary error on the hardest ARCTIC pair (rms→slt 160→67 ms).
      let ab = 0, aa = 0, bb = 0;
      for (let k = 0; k < dim; k++) {
        const x = a.data[i * dim + k], y = b.data[j * dim + k];
        ab += x * y;
        aa += x * x;
        bb += y * y;
      }
      const c = 1 - ab / Math.sqrt(aa * bb + 1e-12);
      const p = i * m + j;
      if (!i && !j) {
        D[p] = c;
        continue;
      }
      let best = Infinity, s = 0;
      if (i && j) best = D[p - m - 1] + 2 * c;
      if (i && D[p - m] + c < best) (best = D[p - m] + c), (s = 1);
      if (j && D[p - 1] + c < best) (best = D[p - 1] + c), (s = 2);
      D[p] = best;
      step[p] = s;
    }
  }

  const rev: number[] = [];
  for (let i = n - 1, j = m - 1; ; ) {
    rev.push(j, i);
    if (!i && !j) break;
    const s = !i ? 2 : !j ? 1 : step[i * m + j];
    if (s !== 2) i--;
    if (s !== 1) j--;
  }
  const path = Int32Array.from(rev.reverse());

  const sum = new Float64Array(n), cnt = new Uint32Array(n);
  for (let k = 0; k < path.length; k += 2) {
    sum[path[k]] += path[k + 1];
    cnt[path[k]]++;
  }
  return { path, aToB: Float32Array.from(sum, (s, i) => s / cnt[i]), normalizedCost: D[n * m - 1] / (n + m) };
}

export interface ContourComparison {
  offsetSemitones: number | null; // global transposition of B relative to A (not an error)
  medianDeviationSemitones: number | null; // per-frame |deviation| after removing the offset, median
  within1Semitone: number | null; // share of compared frames within ±1 semitone after the offset
  comparedRatio: number; // share of A's voiced frames whose aligned B frame is voiced
}

/** Transposition-invariant comparison of two pitch contours through a DTW alignment. */
export function compareContours(a: PitchFrame[], b: PitchFrame[], aToB: Float32Array): ContourComparison {
  const diffs: number[] = [];
  let voicedA = 0;
  for (let i = 0; i < a.length && i < aToB.length; i++) {
    const fa = a[i].frequencyHz;
    if (fa === null) continue;
    voicedA++;
    const fb = b[Math.round(aToB[i])]?.frequencyHz;
    if (fb) diffs.push(12 * Math.log2(fb / fa));
  }
  if (!diffs.length) return { offsetSemitones: null, medianDeviationSemitones: null, within1Semitone: null, comparedRatio: 0 };
  const offset = medianOf(diffs);
  const dev = diffs.map((d) => Math.abs(d - offset));
  return {
    offsetSemitones: offset,
    medianDeviationSemitones: medianOf(dev),
    within1Semitone: dev.filter((d) => d <= 1).length / dev.length,
    comparedRatio: diffs.length / voicedA,
  };
}

function medianOf(v: number[]): number {
  const s = [...v].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
