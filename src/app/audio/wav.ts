export interface PcmAudio {
  sampleRate: number;
  samples: Float32Array; // mono, [-1, 1]
}

/** Decodes RIFF/WAVE (integer PCM 8/16/24/32-bit or float32, any channel count) to mono float samples. */
export function decodeWav(buf: ArrayBuffer): PcmAudio {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');

  let format = 0, channels = 0, sampleRate = 0, bits = 0;
  for (let o = 12; o + 8 <= v.byteLength; ) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
      if (format === 0xfffe) format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE: sub-format GUID starts with the format code
    } else if (id === 'data') {
      if (!channels) throw new Error('WAV data chunk before fmt chunk');
      if (!(format === 1 || (format === 3 && bits === 32))) throw new Error(`Unsupported WAV format ${format}/${bits}-bit`);
      const bytes = bits / 8, frameBytes = bytes * channels;
      // Tolerate a size field that overruns the file (recording interrupted before the header was patched).
      const n = Math.floor(Math.min(size, v.byteLength - body) / frameBytes);
      const read =
        format === 3 ? (p: number) => v.getFloat32(p, true)
        : bits === 16 ? (p: number) => v.getInt16(p, true) / 32768
        : bits === 8 ? (p: number) => (v.getUint8(p) - 128) / 128
        : bits === 24 ? (p: number) => ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 8388608)
        : (p: number) => v.getInt32(p, true) / 2147483648;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += read(body + i * frameBytes + c * bytes);
        samples[i] = s / channels;
      }
      return { sampleRate, samples };
    }
    o = body + size + (size & 1);
  }
  throw new Error('WAV file has no data chunk');
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  return buf;
}

/** Band-limited resampling with a Hann-windowed sinc; the cutoff sits at the lower of the two Nyquist rates. */
export function resample(x: Float32Array, from: number, to: number, zeroCrossings = 16): Float32Array {
  if (from === to) return x;
  const ratio = to / from, cutoff = Math.min(1, ratio);
  const half = Math.ceil(zeroCrossings / cutoff); // window half-width in input samples
  const y = new Float32Array(Math.floor(x.length * ratio));
  for (let i = 0; i < y.length; i++) {
    const t = i / ratio, c = Math.floor(t);
    let acc = 0;
    for (let k = Math.max(0, c - half + 1); k <= Math.min(x.length - 1, c + half); k++) {
      const d = t - k, u = Math.PI * cutoff * d;
      acc += x[k] * cutoff * (d === 0 ? 1 : Math.sin(u) / u) * (0.5 + 0.5 * Math.cos((Math.PI * d) / half));
    }
    y[i] = acc;
  }
  return y;
}
