// Kaldi-compatible log mel filterbank, matching lhotse's Fbank(FbankConfig(num_filters=80, dither=0, snip_edges=False))
// that the ZIPA phone model was trained on: 25 ms Povey window, 10 ms shift, DC removal, pre-emphasis 0.97,
// 512-point power spectrum, 80 triangular filters on the Kaldi mel scale from 20 Hz to Nyquist − 400 Hz.
import { fft } from './mfcc';

export const FBANK_DIM = 80;

export function fbank(x: Float32Array, sampleRate = 16000): { n: number; data: Float32Array } {
  const win = Math.round(sampleRate * 0.025), shift = Math.round(sampleRate * 0.01), nfft = 512;
  // snip_edges=False: frames centred on multiples of the shift, edges reflected (lhotse/_get_strided_batch).
  const n = Math.floor((x.length + (shift >> 1)) / shift);
  const left = (win - shift) >> 1;
  const at = (k: number) => (k < 0 ? x[Math.min(x.length - 1, -k - 1)] : k >= x.length ? x[Math.max(0, 2 * x.length - k - 1)] : x[k]);
  const povey = Float64Array.from({ length: win }, (_, j) => Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (win - 1)), 0.85));
  const bank = kaldiMelBank(nfft, sampleRate);
  const out = new Float32Array(n * FBANK_DIM);
  const re = new Float64Array(nfft), im = new Float64Array(nfft), frame = new Float64Array(win);
  for (let f = 0; f < n; f++) {
    const s0 = f * shift - left;
    let mean = 0;
    for (let j = 0; j < win; j++) mean += frame[j] = at(s0 + j);
    mean /= win;
    for (let j = 0; j < win; j++) frame[j] -= mean;
    for (let j = win - 1; j > 0; j--) frame[j] -= 0.97 * frame[j - 1];
    frame[0] -= 0.97 * frame[0];
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < win; j++) re[j] = frame[j] * povey[j];
    fft(re, im);
    for (let m = 0; m < FBANK_DIM; m++) {
      const { from, weights } = bank[m];
      let e = 0;
      for (let b = 0; b < weights.length; b++) e += weights[b] * (re[from + b] ** 2 + im[from + b] ** 2);
      out[f * FBANK_DIM + m] = Math.log(Math.max(e, 1.1920929e-7)); // float32 epsilon, as lhotse
    }
  }
  return { n, data: out };
}

/** Kaldi mel banks: triangles on mel = 1127·ln(1 + f/700), over FFT bins 0..nfft/2−1 (the Nyquist bin gets no weight). */
function kaldiMelBank(nfft: number, sampleRate: number): { from: number; weights: Float64Array }[] {
  const mel = (hz: number) => 1127 * Math.log(1 + hz / 700);
  const lo = mel(20), hi = mel(sampleRate / 2 - 400), delta = (hi - lo) / (FBANK_DIM + 1);
  return Array.from({ length: FBANK_DIM }, (_, m) => {
    const l = lo + m * delta, c = l + delta, r = c + delta;
    const w: number[] = [];
    let from = -1;
    for (let b = 0; b < nfft / 2; b++) {
      const v = mel((b * sampleRate) / nfft);
      const y = v > l && v <= c ? (v - l) / (c - l) : v > c && v < r ? (r - v) / (r - c) : 0;
      if (y > 0 && from < 0) from = b;
      if (from >= 0) w.push(y);
    }
    while (w.length && w[w.length - 1] === 0) w.pop();
    return { from: Math.max(0, from), weights: Float64Array.from(w) };
  });
}
