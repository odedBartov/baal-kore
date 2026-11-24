// Deterministic Masoretic Cantillation Reference Engine for all 54 Parashot (5,846 verses).
// Generates sample-exact word timings and a warm, vowel-formant cantorial reference WAV at 16 kHz from each
// word's syllables, stress (mil'el / milra), niqqud vowels, and Masoretic te'amim (TAAM_BY_ID).
import { TAAM_BY_ID } from '../torah/cantillation';
import type { VerseData, WordToken } from '../torah/model';
import { encodeWav } from './wav';

export const SYNTH_SAMPLE_RATE = 16000;
const BASE_HZ = 146; // Baritone cantorial tonic matching Asael Israeli's register (~145–150 Hz)

/**
 * Traditional Ashkenazi-Israeli Torah cantillation motifs in semitones relative to the tonic (0).
 * Each array defines the melismatic contour unfolded on the stressed (ta'am-bearing) syllable of the word.
 */
const TAAM_MOTIFS_ST: Record<string, number[]> = {
  'mercha': [0, -1, 0],
  'tipcha': [2, 0, -1],
  'munach': [-1, 0, 2],
  'etnachta': [2, 4, 5, 2],
  'sof-pasuk': [2, -1, 0, -3],
  'revia': [4, 4, 2, 3, 2],
  'pashta': [0, 4, 5],
  'yetiv': [5, 4, 2],
  'zakef-katon': [5, 4, 2, 0],
  'zakef-gadol': [5, 6, 4, 2, 0],
  'segol': [4, 2, 5, 4],
  'zarka': [0, 2, 5, 7, 4],
  'tevir': [2, 0, -2, 0],
  'darga': [4, 2, 0, -2],
  'kadma': [0, 2, 4],
  'mahpach': [0, 4, 2],
  'geresh': [4, 5, 7, 5, 4],
  'azla-geresh': [2, 4, 7, 5, 4],
  'gershayim': [4, 7, 5, 7, 4],
  'telisha-gedola': [7, 5, 4, 2, 4],
  'telisha-ketana': [2, 4, 5, 7],
  'pazer': [4, 7, 9, 7, 5, 4],
  'karnei-para': [2, 4, 7, 9, 7, 4],
  'shalshelet': [2, 4, 2, 5, 4, 7, 5, 4],
  'munach-legarmeh': [0, 4, 2, 0],
  'mercha-kefula': [0, -1, 2, 0, -1],
  'yerach-ben-yomo': [-1, 0, 2, 0],
};

export interface SynthWordTiming {
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface SynthVerseSchedule {
  startMs: number;
  endMs: number;
  words: SynthWordTiming[];
}

function motifForWord(w: WordToken): number[] {
  const id = w.primary ?? w.taamim[w.taamim.length - 1] ?? 'mercha';
  return TAAM_MOTIFS_ST[id] ?? [0, 2, 0];
}

function syllableDurationMs(w: WordToken, sylIdx: number): number {
  const syl = w.syllables[sylIdx];
  const motif = motifForWord(w);
  if (!syl) return 190;
  if (syl.stressed) {
    // Stressed syllable carries the cantillation melisma; longer motifs get proportionally more time.
    return Math.min(620, Math.max(240, 130 + motif.length * 75));
  }
  return 165;
}

function pauseAfterWordMs(w: WordToken, isLastWord: boolean): number {
  if (isLastWord) return 120;
  if (w.maqafToNext) return 25;
  const primary = w.primary ? TAAM_BY_ID[w.primary] : null;
  if (!primary || primary.kind === 'conjunctive') return 45;
  switch (primary.level) {
    case 1:
      return 310; // Etnachta / Sof-pasuk breath pause
    case 2:
      return 185; // Segol / Zakef / Tipcha phrase boundary
    case 3:
      return 125; // Revia / Pashta / Tevir / Zarka sub-phrase boundary
    default:
      return 85; // Rank 4 weak disjunctive
  }
}

/** Deterministically computes sample-exact word timings (startMs, endMs) for any verse in the Torah. */
export function computeSyntheticVerseSchedule(verse: VerseData): SynthVerseSchedule {
  const leadInMs = 80;
  let cursorMs = leadInMs;
  const words: SynthWordTiming[] = [];

  for (let i = 0; i < verse.words.length; i++) {
    const w = verse.words[i];
    const nSyl = Math.max(1, w.syllables.length);
    let durMs = 0;
    for (let s = 0; s < nSyl; s++) {
      durMs += syllableDurationMs(w, s);
    }
    const startMs = cursorMs;
    const endMs = startMs + durMs;
    words.push({ startMs, endMs, confidence: 0.96 });
    cursorMs = endMs + pauseAfterWordMs(w, i === verse.words.length - 1);
  }

  return {
    startMs: 0,
    endMs: cursorMs + 60,
    words,
  };
}

/** Detects the primary vowel formant pair [F1, F2] in Hz from a Hebrew syllable's niqqud characters. */
function formantsForSyllableText(text: string): [number, number] {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Hiriq (i)
    if (code === 0x05b4) return [320, 2200];
    // Tzere / Segol / Sheva (e)
    if (code === 0x05b5 || code === 0x05b6 || code === 0x05b1 || code === 0x05b0) return [520, 1820];
    // Holam / Qamats Qatan (o)
    if (code === 0x05b9 || code === 0x05ba || code === 0x05b3) return [490, 920];
    // Qubuts / Shuruq (u)
    if (code === 0x05bb) return [350, 820];
    // Patah / Qamats (a)
    if (code === 0x05b7 || code === 0x05b8 || code === 0x05b2) return [740, 1220];
  }
  return [660, 1350]; // default open vowel
}

/**
 * Generates a 16 kHz mono 16-bit WAV buffer for `verse`, singing each word's syllables with its traditional
 * Masoretic cantillation motif, vowel formants, and phrase pauses matching `computeSyntheticVerseSchedule(verse)`.
 */
export function synthesizeCantillationWav(verse: VerseData): ArrayBuffer {
  const schedule = computeSyntheticVerseSchedule(verse);
  const totalSamples = Math.ceil((schedule.endMs * SYNTH_SAMPLE_RATE) / 1000);
  const pcm = new Float32Array(totalSamples);

  let phase = 0;
  let prevSt = 0;

  for (let wi = 0; wi < verse.words.length; wi++) {
    const w = verse.words[wi];
    const wt = schedule.words[wi];
    const motif = motifForWord(w);
    const nSyl = Math.max(1, w.syllables.length);
    const stressedIdx = Math.max(0, w.syllables.findIndex((s) => s.stressed));

    let sylStartMs = wt.startMs;
    for (let si = 0; si < nSyl; si++) {
      const sylDurMs = syllableDurationMs(w, si);
      const sylEndMs = Math.min(wt.endMs, sylStartMs + sylDurMs);
      const s0 = Math.max(0, Math.round((sylStartMs * SYNTH_SAMPLE_RATE) / 1000));
      const s1 = Math.min(totalSamples, Math.round((sylEndMs * SYNTH_SAMPLE_RATE) / 1000));
      const sylLen = Math.max(1, s1 - s0);

      const sylText = w.syllables[si]?.text ?? w.text;
      const [f1, f2] = formantsForSyllableText(sylText);

      // Determine note targets for this syllable:
      // Pre-stress syllables approach motif[0]; stressed syllable sings the motif; post-stress holds motif's last note.
      let notes: number[];
      if (si < stressedIdx) {
        notes = [motif[0] * 0.5, motif[0]];
      } else if (si === stressedIdx) {
        notes = motif;
      } else {
        const tail = motif[motif.length - 1];
        notes = [tail];
      }

      const onsetSamples = Math.min(Math.floor(sylLen * 0.2), Math.round(0.018 * SYNTH_SAMPLE_RATE));
      const releaseSamples = Math.min(Math.floor(sylLen * 0.22), Math.round(0.024 * SYNTH_SAMPLE_RATE));

      for (let k = 0; k < sylLen; k++) {
        const u = k / sylLen; // 0..1 across syllable
        // Smooth piecewise-linear interpolation across the motif notes with cosine easing
        const pos = u * notes.length;
        const ni = Math.min(notes.length - 1, Math.floor(pos));
        const frac = pos - ni;
        const nCur = notes[ni];
        const nPrev = ni > 0 ? notes[ni - 1] : prevSt;
        const glide = frac < 0.28 ? nPrev + (nCur - nPrev) * (0.5 - 0.5 * Math.cos((frac / 0.28) * Math.PI)) : nCur;

        // Gentle cantorial vibrato after 50 ms into the note
        const tSec = (s0 + k) / SYNTH_SAMPLE_RATE;
        const vib = k > 0.05 * SYNTH_SAMPLE_RATE ? 0.1 * Math.sin(2 * Math.PI * 5.2 * tSec) : 0;
        const st = glide + vib;
        const hz = BASE_HZ * Math.pow(2, st / 12);

        phase += (2 * Math.PI * hz) / SYNTH_SAMPLE_RATE;
        if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

        // Harmonic glottal source shaped by the syllable's two vowel formants (F1, F2)
        let sample = 0;
        const maxHarm = Math.min(18, Math.floor(7200 / hz));
        for (let h = 1; h <= maxHarm; h++) {
          const fH = h * hz;
          const d1 = (fH - f1) / 140;
          const d2 = (fH - f2) / 220;
          const formantGain = 1.0 + 1.8 / (1 + d1 * d1) + 0.95 / (1 + d2 * d2);
          const roll = formantGain / Math.pow(h, 1.15);
          sample += roll * Math.sin(h * phase);
        }

        // Smooth syllable envelope with subtle consonant dip between consecutive syllables
        let env = 1.0;
        if (k < onsetSamples && onsetSamples > 0) {
          env = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos((k / onsetSamples) * Math.PI));
        } else if (k > sylLen - releaseSamples && releaseSamples > 0) {
          const rem = sylLen - k;
          env = 0.2 + 0.8 * (0.5 - 0.5 * Math.cos((rem / releaseSamples) * Math.PI));
        }

        pcm[s0 + k] = sample * env * 0.16;
      }

      prevSt = notes[notes.length - 1];
      sylStartMs = sylEndMs;
    }
  }

  return encodeWav(pcm, SYNTH_SAMPLE_RATE);
}
