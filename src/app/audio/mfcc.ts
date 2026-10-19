// MFCC features for aligning two readings of the same text. MFCCs follow the spectral envelope
// (what is being said) and are largely blind to f0, so a student singing in another key aligns fine.

export interface FeatureMatrix {
  n: number; // frames, same grid as detectPitch(): frame f centred on f*hop
  dim: number;
  data: Float32Array; // row-major n×dim
}

const N_MELS = 40;
const N_COEF = 12; // c1..c12; c0 (loudness) is dropped

export function mfcc(x: Float32Array, sampleRate: number, hopMs = 10): FeatureMatrix {
  const hop = Math.round((sampleRate * hopMs) / 1000);
  const win = Math.round(sampleRate * 0.025);
  let nfft = 1;
  while (nfft < win) nfft <<= 1;
  const hamming = Float64Array.from({ length: win }, (_, j) => 0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (win - 1)));
  const bank = melBank(nfft, sampleRate);
  const dct = Float64Array.from({ length: N_COEF * N_MELS }, (_, k) => Math.cos((Math.PI * (Math.floor(k / N_MELS) + 1) * ((k % N_MELS) + 0.5)) / N_MELS));

  const n = Math.floor(x.length / hop) + 1;
  const out = new Float32Array(n * N_COEF);
  const re = new Float64Array(nfft), im = new Float64Array(nfft), logMel = new Float64Array(N_MELS);
  const at = (k: number) => (k >= 0 && k < x.length ? x[k] : 0);
  for (let f = 0; f < n; f++) {
    const start = f * hop - (win >> 1);
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < win; j++) re[j] = (at(start + j) - 0.97 * at(start + j - 1)) * hamming[j]; // pre-emphasis
    fft(re, im);
    for (let m = 0; m < N_MELS; m++) {
      const { from, weights } = bank[m];
      let e = 0;
      for (let b = 0; b < weights.length; b++) e += weights[b] * (re[from + b] ** 2 + im[from + b] ** 2);
      logMel[m] = Math.log(e + 1e-10);
    }
    for (let c = 0; c < N_COEF; c++) {
      let s = 0;
      for (let m = 0; m < N_MELS; m++) s += dct[c * N_MELS + m] * logMel[m];
      out[f * N_COEF + c] = s;
    }
  }

  // Per-recording mean/variance normalisation removes microphone and speaker colouring.
  for (let c = 0; c < N_COEF; c++) {
    let mean = 0, sq = 0;
    for (let f = 0; f < n; f++) mean += out[f * N_COEF + c];
    mean /= n;
    for (let f = 0; f < n; f++) sq += (out[f * N_COEF + c] - mean) ** 2;
    const sd = Math.sqrt(sq / n) || 1;
    for (let f = 0; f < n; f++) out[f * N_COEF + c] = (out[f * N_COEF + c] - mean) / sd;
  }

  // Append ±2-frame deltas: cut cross-speaker boundary error 15–20% on CMU ARCTIC (see docs/phase3-audio-spike.md).
  const dim = 2 * N_COEF, data = new Float32Array(n * dim);
  for (let f = 0; f < n; f++) {
    const next = Math.min(n - 1, f + 2), prev = Math.max(0, f - 2);
    for (let c = 0; c < N_COEF; c++) {
      data[f * dim + c] = out[f * N_COEF + c];
      data[f * dim + N_COEF + c] = (out[next * N_COEF + c] - out[prev * N_COEF + c]) / 2;
    }
  }
  return { n, dim, data };
}

function melBank(nfft: number, sampleRate: number): { from: number; weights: Float64Array }[] {
  const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
  const hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const lo = mel(20), hi = mel(sampleRate / 2);
  const edges = Array.from({ length: N_MELS + 2 }, (_, i) => (hz(lo + ((hi - lo) * i) / (N_MELS + 1)) * nfft) / sampleRate); // in FFT bins
  return Array.from({ length: N_MELS }, (_, m) => {
    const [l, c, r] = [edges[m], edges[m + 1], edges[m + 2]];
    const from = Math.ceil(l), to = Math.min(nfft / 2, Math.floor(r));
    const weights = Float64Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => {
      const b = from + i;
      return Math.max(0, b <= c ? (b - l) / (c - l) : (r - b) / (r - c));
    });
    return { from, weights };
  });
}

/** In-place iterative radix-2 FFT; length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
