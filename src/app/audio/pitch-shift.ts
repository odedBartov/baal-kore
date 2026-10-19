// Transposition that keeps duration and word timing: WSOLA time-stretch, then resampling. The app always plays the
// reader in the original key; this is used by the validation scripts to splice realistic melody errors.
// (Plain speed change would move pitch, tempo and every word timestamp together.)
import { resample } from './wav';

/**
 * WSOLA time-scale modification (Verhelst & Roelands, 1993): output ≈ input × factor in length, pitch kept.
 * Each output frame is the input frame near its nominal position that best continues the previous one.
 */
export function timeStretch(x: Float32Array, sampleRate: number, factor: number): Float32Array {
  const N = 2 * Math.round(0.02 * sampleRate); // 40 ms frames
  const Hs = N / 2, Ha = Hs / factor;
  const tol = Math.round(0.01 * sampleRate); // ±10 ms search
  const step = Math.max(1, Math.round(sampleRate / 8000)); // correlation on a decimated grid, refined below
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const outLen = Math.ceil(x.length * factor);
  const y = new Float32Array(outLen + N), norm = new Float32Array(outLen + N);
  const at = (i: number) => (i >= 0 && i < x.length ? x[i] : 0);
  const corr = (a: number, b: number, s: number) => {
    let c = 0;
    for (let i = 0; i < N; i += s) c += at(a + i) * at(b + i);
    return c;
  };

  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    let start = 0;
    if (k > 0) {
      const nominal = Math.round(k * Ha), target = prev + Hs; // natural continuation of the previous frame
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += step) {
        const c = corr(nominal + d, target, step);
        if (c > best) (best = c), (start = nominal + d);
      }
      const coarse = start - nominal;
      best = -Infinity;
      for (let d = Math.max(-tol, coarse - step + 1); d <= Math.min(tol, coarse + step - 1); d++) {
        const c = corr(nominal + d, target, 1);
        if (c > best) (best = c), (start = nominal + d);
      }
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      y[o + i] += win[i] * at(start + i);
      norm[o + i] += win[i];
    }
    prev = start;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) y[i] /= norm[i];
  return y.subarray(0, outLen);
}

/** Shifts pitch by `semitones` keeping the length (and so every word timestamp) unchanged. */
export function pitchShift(x: Float32Array, sampleRate: number, semitones: number): Float32Array {
  if (!semitones) return x;
  const r = 2 ** (semitones / 12);
  // Stretch by r, then play the result r× faster: original duration, pitch × r.
  const y = resample(timeStretch(x, sampleRate, r), sampleRate * r, sampleRate);
  const out = new Float32Array(x.length);
  out.set(y.subarray(0, x.length));
  return out;
}
