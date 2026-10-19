// YIN fundamental-frequency estimation (de Cheveigné & Kawahara, JASA 2002) with energy gating and
// light post-processing. Pure TypeScript: runs in a NativeScript worker and in Node tests alike.

export interface PitchFrame {
  timeMs: number;
  frequencyHz: number | null; // null when unvoiced: silence/consonants never produce a note
  confidence: number; // 1 - YIN aperiodicity at the chosen lag, 0..1
  voiced: boolean;
  relativeSemitones: number | null; // vs. PitchOptions.referenceHz, or the recording's median f0
  rmsDb: number; // frame level in dBFS (signal-quality indicator)
}

export interface PitchOptions {
  minHz: number;
  maxHz: number;
  hopMs: number;
  threshold: number; // YIN absolute threshold used to pick the lag
  maxAperiodicity: number; // frames whose best lag is less periodic than this are unvoiced
  silenceDb: number; // frames this many dB below the recording's loud level are silence
  floorDb: number; // absolute silence floor (dBFS)
  minVoicedMs: number; // shorter voiced islands are dropped as spurious
  octaveFoldSemitones: number | null; // frames further than this from the recording's median are folded by octaves
  referenceHz?: number; // relativeSemitones reference (default: the recording's median)
}

export const PITCH_ALGORITHM_VERSION = 'yin-2';

// Range covers adult bass chanting (~65 Hz) through children's singing (~1 kHz); nothing may assume a male voice.
export const DEFAULT_PITCH_OPTIONS: PitchOptions = {
  minHz: 65,
  maxHz: 1000,
  hopMs: 10,
  threshold: 0.1,
  maxAperiodicity: 0.25,
  silenceDb: 25,
  floorDb: -60,
  minVoicedMs: 40,
  octaveFoldSemitones: 11,
};

export function detectPitch(x: Float32Array, sampleRate: number, options: Partial<PitchOptions> = {}): PitchFrame[] {
  const o = { ...DEFAULT_PITCH_OPTIONS, ...options };
  const hop = Math.round((sampleRate * o.hopMs) / 1000);
  const minTau = Math.max(2, Math.floor(sampleRate / o.maxHz));
  const maxTau = Math.ceil(sampleRate / o.minHz);
  const W = Math.max(maxTau, Math.round(sampleRate * 0.025)); // integration window
  const len = W + maxTau;
  const buf = new Float32Array(len);
  const cmnd = new Float32Array(maxTau + 1);
  const n = Math.floor(x.length / hop) + 1;
  const hz = new Float32Array(n), aperiodicity = new Float32Array(n), db = new Float32Array(n);

  for (let f = 0; f < n; f++) {
    // Frame f is centred on sample f*hop (same grid as the MFCC frames used for alignment).
    const start = f * hop - (len >> 1);
    let energy = 0;
    for (let j = 0; j < len; j++) {
      const k = start + j;
      const s = k >= 0 && k < x.length ? x[k] : 0;
      buf[j] = s;
      energy += s * s;
    }
    db[f] = 10 * Math.log10(energy / len + 1e-12);

    // ponytail: O(W·maxTau) time-domain difference function (~100k MACs/frame); switch to the FFT form if device benchmarks demand it.
    let running = 0;
    cmnd[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++) {
      let d = 0;
      for (let j = 0; j < W; j++) {
        const e = buf[j] - buf[j + tau];
        d += e * e;
      }
      running += d;
      cmnd[tau] = running > 0 ? (d * tau) / running : 1;
    }

    // First dip under the threshold (avoids octave-too-low picks), else the global minimum.
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (cmnd[t] < o.threshold) {
        while (t < maxTau && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      tau = minTau;
      for (let t = minTau + 1; t <= maxTau; t++) if (cmnd[t] < cmnd[tau]) tau = t;
    }
    let lag = tau;
    if (tau > minTau && tau < maxTau) {
      const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1], den = a - 2 * b + c;
      if (den > 0) lag = tau + (a - c) / (2 * den);
    }
    hz[f] = sampleRate / lag;
    aperiodicity[f] = cmnd[tau];
  }

  // Voicing: periodic enough, loud enough, and inside the search range.
  const gate = Math.max(percentile(db, 0.95) - o.silenceDb, o.floorDb);
  const voiced = new Uint8Array(n);
  for (let f = 0; f < n; f++) {
    voiced[f] = db[f] >= gate && aperiodicity[f] <= o.maxAperiodicity && hz[f] >= o.minHz && hz[f] <= o.maxHz ? 1 : 0;
  }

  // Drop spurious short islands; 5-frame median inside each voiced run removes isolated octave jumps
  // while keeping real melodic steps (which last longer than 2 frames).
  const minRun = Math.ceil(o.minVoicedMs / o.hopMs);
  const smooth = new Float32Array(hz);
  for (let f = 0; f < n; ) {
    if (!voiced[f]) {
      f++;
      continue;
    }
    let e = f;
    while (e < n && voiced[e]) e++;
    if (e - f < minRun) voiced.fill(0, f, e);
    else for (let k = f; k < e; k++) smooth[k] = median(hz.subarray(Math.max(f, k - 2), Math.min(e, k + 3)));
    f = e;
  }

  // YIN locks onto the 2nd harmonic when the fundamental is weak (confidently, for whole notes, so the median
  // filter can't help). A chanted verse spans about an octave, so a frame ~an octave from the recording's centre
  // is folded back. ponytail: global centre; per-phrase centres if wide-range melodies need it.
  if (o.octaveFoldSemitones !== null) {
    const centre = median(smooth.filter((_, f) => voiced[f] === 1));
    for (let f = 0; f < n; f++) {
      if (!voiced[f]) continue;
      while (12 * Math.log2(smooth[f] / centre) > o.octaveFoldSemitones) smooth[f] /= 2;
      while (12 * Math.log2(smooth[f] / centre) < -o.octaveFoldSemitones) smooth[f] *= 2;
    }
  }

  const frames: PitchFrame[] = new Array(n);
  for (let f = 0; f < n; f++) {
    frames[f] = {
      timeMs: f * o.hopMs,
      frequencyHz: voiced[f] ? smooth[f] : null,
      confidence: Math.max(0, Math.min(1, 1 - aperiodicity[f])),
      voiced: voiced[f] === 1,
      relativeSemitones: null,
      rmsDb: db[f],
    };
  }
  const ref = o.referenceHz ?? medianVoicedHz(frames);
  if (ref) for (const p of frames) if (p.frequencyHz) p.relativeSemitones = 12 * Math.log2(p.frequencyHz / ref);
  return frames;
}

export function medianVoicedHz(frames: PitchFrame[]): number | null {
  const v = frames.filter((p) => p.frequencyHz !== null).map((p) => p.frequencyHz as number);
  return v.length ? median(Float32Array.from(v)) : null;
}

export interface SignalQuality {
  durationMs: number;
  clippedRatio: number; // share of samples at/near full scale
  voicedRatio: number;
  levelDb: number; // loud level: 95th percentile of frame dB
  noiseFloorDb: number; // 10th percentile of frame dB
}

export function signalQuality(x: Float32Array, sampleRate: number, frames: PitchFrame[]): SignalQuality {
  let clipped = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.99) clipped++;
  const db = Float32Array.from(frames, (p) => p.rmsDb);
  return {
    durationMs: (x.length / sampleRate) * 1000,
    clippedRatio: x.length ? clipped / x.length : 0,
    voicedRatio: frames.length ? frames.filter((p) => p.voiced).length / frames.length : 0,
    levelDb: percentile(db, 0.95),
    noiseFloorDb: percentile(db, 0.1),
  };
}

export function percentile(v: ArrayLike<number>, q: number): number {
  if (!v.length) return NaN;
  const s = Float64Array.from(v).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function median(v: ArrayLike<number>): number {
  const s = Float64Array.from(v).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
