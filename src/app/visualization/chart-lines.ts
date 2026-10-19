// Geometry of the melody chart, pure TypeScript (no NativeScript): pitch frames → smooth polylines on a fitted scale.

export const HOP_MS = 10;

/** Median of 5, then mean of 5, over voiced frames: tracker jitter and one-frame octave slips disappear. */
export function smooth(p: (number | null)[]): (number | null)[] {
  const near = (q: (number | null)[], i: number) => [q[i - 2], q[i - 1], q[i], q[i + 1], q[i + 2]].filter((v): v is number => v !== null && v !== undefined);
  const med = p.map((v, i) => {
    if (v === null) return null;
    const w = near(p, i).sort((a, b) => a - b);
    return w[w.length >> 1];
  });
  return med.map((v, i) => {
    if (v === null) return null;
    const w = near(med, i);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

/** Range fitted to what was sung (3rd–97th percentile plus a margin), at least `minSpan` semitones tall. */
export function fitRange(series: (number | null)[][], minSpan = 8): { lo: number; hi: number } {
  const v = series.flat().filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return { lo: -minSpan / 2, hi: minSpan / 2 };
  let lo = v[Math.floor(v.length * 0.03)] - 1.5, hi = v[Math.min(v.length - 1, Math.floor(v.length * 0.97))] + 1.5;
  if (hi - lo < minSpan) {
    const c = (hi + lo) / 2;
    (lo = c - minSpan / 2), (hi = c + minSpan / 2);
  }
  return { lo, hi };
}

/**
 * Polylines (frame index, semitones): consecutive voiced frames are joined, short gaps (consonants) bridged,
 * longer silences and values outside the range break the line. Out-of-range values are left out, not clamped:
 * a clamped point would be a note nobody sang.
 */
export function runs(p: (number | null)[], lo: number, hi: number, maxGapFrames = 5): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [], last = -Infinity;
  p.forEach((v, i) => {
    if (v === null || v < lo || v > hi) {
      if (v !== null) (last = -Infinity);
      return;
    }
    if (i - last > maxGapFrames + 1 && cur.length) out.push(cur), (cur = []);
    cur.push({ i, v });
    last = i;
  });
  if (cur.length) out.push(cur);
  return out;
}
