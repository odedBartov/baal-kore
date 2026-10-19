// Assessment of a lesson imitation: the student sings the phrase right after hearing the reader.
// Experimental: the tolerance (Settings.lessonMaxDeviation) is provisional, see docs/validation.md.
import { detectPitch, medianVoicedHz, signalQuality } from '../audio/pitch';
import { mfcc } from '../audio/mfcc';
import { compareContours, dtw } from '../audio/align';
import { greedyDecode } from '../analysis/ctc';
import { compareLetters } from '../analysis/letters';
import { compareMelody, decimate, MELODY_DEFAULTS, type MelodyOptions } from '../analysis/melody';

export interface LessonCheck {
  status: 'passed' | 'failed' | 'inconclusive';
  reasonHe?: string;
  deviation: number | null; // semitones, key difference removed
  coverage: number;
  wordsHeard: boolean | null; // null when the word model is not installed
  wordScore: number | null; // mean letter score of the phrase's words
  reference: (number | null)[]; // reference contour, semitones re its median (chart)
  studentOnReference: (number | null)[]; // student contour mapped onto the reference timeline, key removed
  student: (number | null)[]; // the student's own contour on its own timeline, semitones re its median (chart)
}

export const LESSON_WORDS_MIN = 0.5; // provisional, from the lesson sweep in docs/validation.md

/**
 * The phrase's words cut out of the reader's verse, each edge at the quietest point (the dip between two words) just
 * before the aligner's start of the word after it, faded over 20 ms: no tail of the previous word or onset of the
 * next one is heard. Forced alignment marks a word's start late, and the dip sits 0–120 ms before it on the bundled
 * reader (1,785 boundaries); later dips are between syllables of the word itself.
 */
export function cutPhrase(x: Float32Array, sampleRate: number, words: { startMs: number }[], first: number, last: number) {
  const durMs = (x.length / sampleRate) * 1000, half = Math.round(sampleRate * 0.01);
  const level = (ms: number) => {
    const c = Math.round((ms * sampleRate) / 1000);
    let e = 0;
    for (let i = Math.max(0, c - half); i < Math.min(x.length, c + half); i++) e += x[i] * x[i];
    return e;
  };
  const dipBefore = (ms: number) => {
    let best = ms, bestE = Infinity;
    for (let t = Math.max(0, ms - 120); t <= Math.min(durMs, ms + 10); t += 5) {
      const e = level(t);
      if (e < bestE) (bestE = e), (best = t);
    }
    return best;
  };
  const startMs = dipBefore(words[first].startMs);
  const endMs = last + 1 < words.length ? Math.max(startMs, dipBefore(words[last + 1].startMs)) : durMs;
  const samples = x.slice(Math.round((startMs * sampleRate) / 1000), Math.round((endMs * sampleRate) / 1000));
  const fade = Math.min(2 * half, samples.length >> 1); // 20 ms
  for (let i = 0; i < fade; i++) (samples[i] *= i / fade), (samples[samples.length - 1 - i] *= i / fade);
  return { startMs, endMs, samples };
}

export interface LessonMelodyConfig {
  method: 'dtw' | 'frames'; // 'frames' = original MFCC-aligned frame comparison (kept for validation)
  options: MelodyOptions;
}
export const LESSON_MELODY: LessonMelodyConfig = { method: 'dtw', options: MELODY_DEFAULTS };

export function checkLesson(
  student: Float32Array,
  reference: Float32Array,
  sampleRate: number,
  maxDeviation: number,
  ctc: { lp: Float32Array; T: number } | null,
  spokenWords: string[],
  melody: LessonMelodyConfig = LESSON_MELODY,
): LessonCheck {
  const sp = detectPitch(student, sampleRate), rp = detectPitch(reference, sampleRate);
  const q = signalQuality(student, sampleRate, sp);
  const rMed = medianVoicedHz(rp);
  const refChart = rp.map((p) => (p.frequencyHz && rMed ? 12 * Math.log2(p.frequencyHz / rMed) : null));
  const sMed = medianVoicedHz(sp);
  const stuChart = sp.map((p) => (p.frequencyHz && sMed ? 12 * Math.log2(p.frequencyHz / sMed) : null));
  const empty = { deviation: null, coverage: 0, wordsHeard: null, wordScore: null, reference: refChart, studentOnReference: [], student: stuChart };
  if (q.voicedRatio < 0.1 || q.levelDb < -45) return { status: 'inconclusive', reasonHe: 'לא שמעתי שירה בהקלטה. כדאי לשיר בקול, קרוב לטלפון.', ...empty };
  if (q.durationMs < 600) return { status: 'inconclusive', reasonHe: 'ההקלטה קצרה מדי.', ...empty };

  const { aToB } = dtw(mfcc(reference, sampleRate), mfcc(student, sampleRate));
  const c = compareContours(rp, sp, aToB);
  let deviation = c.medianDeviationSemitones, coverage = c.comparedRatio;
  let onRef: (number | null)[] = rp.map((_, i) => {
    const f = sp[Math.round(aToB[i])]?.frequencyHz;
    return f && rMed && c.offsetSemitones !== null ? 12 * Math.log2(f / rMed) - c.offsetSemitones : null;
  });

  if (melody.method === 'dtw' && rMed && c.offsetSemitones !== null) {
    // Compare only where the student sings (leading/trailing silence of a lesson take is not part of the phrase).
    const first = sp.findIndex((p) => p.voiced), last = sp.length - 1 - [...sp].reverse().findIndex((p) => p.voiced);
    const a = Math.max(0, first - 10), b = Math.min(sp.length, last + 11);
    const stuSt = sp.slice(a, b).map((p) => (p.frequencyHz ? 12 * Math.log2(p.frequencyHz / rMed) : null));
    const off = c.offsetSemitones; // student's key (octave slips are folded inside compareMelody)
    const res = compareMelody(refChart, stuSt, off, melody.options, Float64Array.from(aToB, (j) => j - a));
    deviation = res.deviation;
    coverage = res.coverage;
    const st = melody.options.frameStep;
    onRef = new Array(rp.length).fill(null);
    res.map.forEach((j, k) => {
      if (j < 0) return;
      const v = decimate(stuSt.slice(j * st, (j + 1) * st), st)[0];
      if (v !== null && v !== undefined) for (let i = k * st; i < Math.min(rp.length, (k + 1) * st); i++) if (refChart[i] !== null) onRef[i] = v - off;
    });
  }

  let wordsHeard: boolean | null = null, wordScore: number | null = null;
  if (ctc) {
    const s = compareLetters(greedyDecode(ctc.lp, ctc.T), spokenWords).wordScore;
    wordScore = s.reduce((x, y) => x + y, 0) / s.length;
    wordsHeard = wordScore >= LESSON_WORDS_MIN;
  }
  const base = { deviation, coverage, wordsHeard, wordScore, reference: refChart, studentOnReference: onRef, student: stuChart };
  if (deviation === null || coverage < 0.3) return { status: 'inconclusive', reasonHe: 'לא הצלחתי להשוות את המנגינה. כדאי לשיר את המילים בקול ברור.', ...base };
  if (wordsHeard === false) return { status: 'failed', reasonHe: 'לא שמעתי את המילים של הצירוף. כדאי לשיר אותן יחד עם המנגינה.', ...base };
  return { status: deviation <= maxDeviation ? 'passed' : 'failed', ...base };
}
