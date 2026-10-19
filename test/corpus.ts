// Loaders for the dev-time corpora fetched by scripts/fetch-test-audio.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { decodeWav, resample, type PcmAudio } from '../src/app/audio/wav';

export const DATA = join(import.meta.dirname, '..', 'test-data');
export const hasCorpora = existsSync(join(DATA, 'zenodo_data')) && existsSync(join(DATA, 'arctic'));
export const SR = 16000; // device recording rate

export function loadWav(path: string, rate = SR): PcmAudio {
  const b = readFileSync(path);
  const a = decodeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return { sampleRate: rate, samples: resample(a.samples, a.sampleRate, rate) };
}

/** vocadito excerpt resampled to the device rate, with its musician-annotated f0 track (0 = unvoiced). */
export function vocadito(id: number) {
  const audio = loadWav(join(DATA, 'zenodo_data', 'Audio', `vocadito_${id}.wav`));
  const rows = readFileSync(join(DATA, 'zenodo_data', 'Annotations', 'F0', `vocadito_${id}_f0.csv`), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(',').map(Number));
  return { audio, times: rows.map((r) => r[0]), hz: rows.map((r) => r[1]) };
}

/** CMU ARCTIC utterance with phone end-times (seconds), pauses removed. */
export function arctic(speaker: string, n: number) {
  const id = `arctic_a${String(n).padStart(4, '0')}`;
  const audio = loadWav(join(DATA, 'arctic', speaker, `${id}.wav`));
  const phones = readFileSync(join(DATA, 'arctic', speaker, `${id}.lab`), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 3 && p[2] !== 'pau' && p[2] !== 'ssil')
    .map(([end, , phone]) => ({ end: Number(end), phone }));
  return { audio, phones };
}

/** Wikimedia Commons Torah cantillation (Ogg Vorbis), mixed to mono and resampled to the device rate. */
export async function cantillation(part: '0a-Kohen' | '0b-Levi' | "0c-Yisra'el", reader: 'Asael Ashkenaz' | 'Asael' | 'Nahum'): Promise<PcmAudio> {
  const decoder = new OggVorbisDecoder();
  await decoder.ready;
  const { channelData, sampleRate } = await decoder.decodeFile(readFileSync(join(DATA, 'cantillation', `Aa Genesis Bereshit-${part} ${reader}.oga`)));
  decoder.free();
  const mono = new Float32Array(channelData[0].length);
  for (const ch of channelData) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channelData.length;
  return { sampleRate: SR, samples: resample(mono, sampleRate, SR) };
}

/** Raw frame counts so that several files pool correctly (sum the counts, then take ratios). */
export type PitchCounts = Record<'refVoiced' | 'refUnvoiced' | 'hit' | 'falseAlarm' | 'within50c' | 'octave' | 'correct', number>;

/** mir_eval-style melody counts; the reference is sampled at the nearest annotation frame. */
export function countPitch(estHz: (number | null)[], hopMs: number, refTimes: number[], refHz: number[]): PitchCounts {
  const c: PitchCounts = { refVoiced: 0, refUnvoiced: 0, hit: 0, falseAlarm: 0, within50c: 0, octave: 0, correct: 0 };
  const refHop = refTimes[1] - refTimes[0];
  for (let f = 0; f < estHz.length; f++) {
    const k = Math.round((f * hopMs) / 1000 / refHop);
    if (k >= refHz.length) break;
    const r = refHz[k], e = estHz[f];
    if (r > 0) {
      c.refVoiced++;
      if (!e) continue;
      c.hit++;
      const cents = Math.abs(1200 * Math.log2(e / r));
      if (cents <= 50) (c.within50c++, c.correct++);
      else if (Math.abs(cents - 1200) <= 100) c.octave++;
    } else {
      c.refUnvoiced++;
      if (e) c.falseAlarm++;
      else c.correct++;
    }
  }
  return c;
}

export function sumCounts(all: PitchCounts[]): PitchCounts {
  const out = { ...all[0] };
  for (const c of all.slice(1)) for (const k of Object.keys(out) as (keyof PitchCounts)[]) out[k] += c[k];
  return out;
}

export function pitchScores(c: PitchCounts) {
  return {
    voicingRecall: c.hit / c.refVoiced, // ref-voiced frames detected as voiced
    voicingFalseAlarm: c.falseAlarm / c.refUnvoiced, // ref-unvoiced frames detected as voiced
    rawPitchAccuracy: c.within50c / c.refVoiced, // voiced AND within 50 cents (mir_eval RPA without unvoiced guesses)
    accuracyWhenBothVoiced: c.within50c / c.hit, // f0 precision isolated from voicing decisions
    octaveErrors: c.octave / c.hit,
    overallAccuracy: c.correct / (c.refVoiced + c.refUnvoiced),
  };
}
