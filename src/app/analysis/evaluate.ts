// Verse evaluation: independent analyzers → category scores → status. Pure TypeScript (runs in the worker
// and in Node tests). Thresholds marked "provisional" were set on real readings (docs/validation.md), not on
// labelled student mistakes; that is why every analyzer here is 'experimental' in registry.ts.
import { detectPitch, medianVoicedHz, PITCH_ALGORITHM_VERSION, percentile, signalQuality, type PitchFrame } from '../audio/pitch';
import { mfcc, type FeatureMatrix } from '../audio/mfcc';
import { dtw } from '../audio/align';
import { buildTarget, CTC_MODEL_ID, FRAME_MS, forcedAlign, greedyDecode } from './ctc';
import { compareLetters, similarity } from './letters';
import { ANALYZERS } from './registry';
import { CATEGORY_WEIGHTS, type Category, type CategoryScore, type DetectedError, type VerseEvaluation, type WordAssessment } from './types';
import { TAAM_BY_ID } from '../torah/cantillation';
import { compareMelody, decimate, fold, MELODY_DEFAULTS, type MelodyOptions } from './melody';
import { wordSlots, type Pronunciation, type Slot, type VowelClass } from './phonemes';
import { alignSlots, scoreChecks, type CheckKind, type CheckScore, type PhoneLogProbs } from './vowels';

const SR = 16000;
const HOP_MS = 10;

export interface EvalWord {
  id: string;
  text: string;
  spoken: string;
  primary: string | null;
  syllables?: { text: string; reduced: boolean }[] | null; // havarotjs syllables (vocal sheva, qamats qatan) for the niqqud check
}

export interface EvalInput {
  verseId: string;
  words: EvalWord[];
  groups: { words: number[]; taam: string | null }[];
  student: Float32Array; // 16 kHz mono
  reference: Float32Array | null; // 16 kHz mono, this verse only
  referenceWords: { startMs: number; endMs: number }[] | null; // verse-relative
  referenceApproval: 'approved' | 'pending' | 'missing';
  ctc: { lp: Float32Array; T: number } | null; // student log-probs; null when the model is not installed
  phones?: (PhoneLogProbs & { idx: Map<string, number> }) | null; // ZIPA phone log-probs; null when that model is not installed
  pronunciation?: Pronunciation; // vowels the niqqud check expects (default Israeli)
  passingThreshold: number;
  melody?: Partial<MelodyConfig>; // validation scripts compare methods/thresholds; the app uses MELODY_CONFIG
}

export interface MelodyConfig {
  method: 'dtw' | 'frames'; // 'frames' = the original frame-by-frame comparison (kept for comparison)
  offsetWindow: number; // phrases on each side pooled for the local key reference (Infinity = one global key)
  options: MelodyOptions;
  // A wrong ta'am changes a note or two of one word, so the error is judged per word, relative to the verse's typical
  // word: a different but consistent singing style raises every word, a wrong ta'am raises one.
  wordErrorSt: number; // worst word of a phrase this far (semitones) above the verse's median word → melody error
  wordMajorSt: number; // ... a major one
  phraseErrorSt: number; // safety net: a whole phrase this far off is an error even if the verse is off throughout
  phraseMajorSt: number;
  keyShiftSt: number; // a phrase sung this far above/below its neighbours (same contour, wrong height) → error
  keyShiftMajorSt: number;
  minCoverage: number;
  scoreGood: number; // deviation at/below which a phrase scores 100
  scoreBad: number; // deviation at/above which a phrase scores 0
  // A reading spoken instead of chanted: over the whole verse the pitch neither rises and falls with the reader's notes
  // (correlation below chantMinCorr) or sits far from them (median distance above chantMaxSpreadSt, key removed).
  chantMinCorr: number;
  chantMaxSpreadSt: number;
}

/**
 * Chosen on the tuning half (even verses) of docs/data/melody-validation.json, reported on the other half:
 * wordErrorSt = 97th percentile of correct same-melody phrases; phraseErrorSt above every correct same-melody phrase;
 * scoreGood ≈ median correct phrase. Real chant, adult singers — provisional for children (docs/validation.md).
 */
export const MELODY_CONFIG: MelodyConfig = {
  method: 'dtw',
  offsetWindow: 2,
  options: MELODY_DEFAULTS,
  wordErrorSt: 0.75, // 97th percentile of correct same-melody phrases (tuning half)
  wordMajorSt: 1.25,
  phraseErrorSt: 1.5,
  phraseMajorSt: 2.0,
  keyShiftSt: 2.5, // 99th percentile of correct same-melody phrases (tuning half)
  keyShiftMajorSt: 3.5,
  minCoverage: 0.5,
  scoreGood: 0.6,
  scoreBad: 1.5,
  // 37 verses, Asael as reader: flags 1 of 37 verses chanted by another singer (Nahum), 89–100% of spoken readings
  // (Hebrew TTS at two rates, real English read speech mapped onto the verse). Provisional (docs/validation.md).
  chantMinCorr: 0.25,
  chantMaxSpreadSt: 1.65,
};

/**
 * Niqqud thresholds (goodness = log-prob of the written vowel − best other vowel), docs/data/niqqud-validation.json:
 * at −2.5, 0.3% of correct vowels (held-out, Israeli reader; 0.5% for Ashkenazi readers with that setting) and 89% of
 * written-vowel substitutions fall below. Named to the student (confidence ≥ 0.6) from about −2.9. Provisional.
 */
// Chosen in docs/data/niqqud-validation.json so that correct readings are almost never flagged (rates there).
// confidence = 0.5 + (flagBelow − goodness) / span, capped at 0.9; named to the student from 0.6. Provisional.
export const NIQQUD: Record<CheckKind, { flagBelow: number; span: number }> = {
  vowel: { flagBelow: -2.5, span: 4 },
  dagesh: { flagBelow: -1.5, span: 4 },
  shin: { flagBelow: -1.0, span: 4 },
  'sheva-na': { flagBelow: -1.5, span: 4 },
  'sheva-nach': { flagBelow: -1.0, span: 4 },
};
const HEARD_HE: Record<VowelClass, string> = { A: '"a" (פתח או קמץ)', E: '"e" (צירה או סגול)', I: '"i" (חיריק)', O: '"o" (חולם)', U: '"u" (שורוק או קובוץ)' };

function niqqudMessage(word: string, slot: Slot, s: CheckScore): string {
  const c = slot.contrast;
  switch (s.kind) {
    case 'vowel':
      return `במילה "${word}" ה${slot.point} נשמע כמו ${HEARD_HE[s.heard!]}.`;
    case 'dagesh':
      return c!.glyph.includes('ּ') ? `במילה "${word}" יש דגש ב־${c!.glyph}: קוראים "${c!.sound}" ולא "${c!.other}".` : `במילה "${word}" אין דגש ב־${c!.glyph}: קוראים "${c!.sound}" ולא "${c!.other}".`;
    case 'shin':
      return `במילה "${word}" הנקודה ב־${c!.glyph} ${c!.sound === 's' ? 'משמאל (שׂ): קוראים "s"' : 'מימין (שׁ): קוראים "sh"'}, לא "${c!.other}".`;
    case 'sheva-na':
      return `במילה "${word}" השווא ב־${slot.glyph} הוא שווא נע: משמיעים אותו כ־e קצרה.`;
    case 'sheva-nach':
      return `במילה "${word}" השווא ב־${slot.glyph} הוא שווא נח: לא משמיעים אחריו תנועה.`;
  }
}

export interface ContourChart {
  durationMs: number;
  semitones: (number | null)[]; // 10 ms frames, relative to the recording's own median (key-free)
  wordStartsMs: (number | null)[];
}

export interface EvalCharts {
  reference: ContourChart | null;
  student: ContourChart;
  studentOnReference: (number | null)[] | null; // student melody on the reference timeline, key difference removed
}

// Provisional thresholds, chosen from the threshold sweeps in docs/data/analyzer-validation.json (second adult
// reader + spliced real-audio errors — not a labelled student corpus; see docs/validation.md).
export const THRESHOLDS = {
  wordOk: 0.65, // letter score at/above: word read
  wordProblem: 0.5, // below: word missing or different (shown to the student only below ~0.4, confidence ≥ 0.6)
  extraLetters: 3, // unmatched heard letters between two words that count as extra speech
  repeatSimilarity: 0.7,
  pauseInsidePhraseMs: 700,
};

const semitonesOf = (frames: PitchFrame[], ref: number | null) => frames.map((p) => (p.frequencyHz && ref ? 12 * Math.log2(p.frequencyHz / ref) : null));
const voicedMs = (frames: PitchFrame[] | null) => (frames ? frames.filter((p) => p.voiced).length * HOP_MS : 0);
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2) : NaN;
};
const pearson = (a: number[], b: number[]) => {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) (ab += (a[i] - ma) * (b[i] - mb)), (aa += (a[i] - ma) ** 2), (bb += (b[i] - mb) ** 2);
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
};
const sub = (f: FeatureMatrix, a: number, b: number): FeatureMatrix => ({ n: b - a, dim: f.dim, data: f.data.subarray(a * f.dim, b * f.dim) });
const taamName = (t: string | null) => (t ? TAAM_BY_ID[t]?.nameHe ?? t : '');

export function evaluate(input: EvalInput): { evaluation: VerseEvaluation; charts: EvalCharts } {
  const nW = input.words.length;
  const sPitch = detectPitch(input.student, SR);
  const q = signalQuality(input.student, SR, sPitch);
  const rPitch = input.reference ? detectPitch(input.reference, SR) : null;
  const refMedian = rPitch ? medianVoicedHz(rPitch) : null;
  const stuMedian = medianVoicedHz(sPitch);

  // ---- 1. Audio quality gate: no comparison is meaningful on unusable audio.
  const blocking: string[] = [], warnings: string[] = [];
  if (q.voicedRatio < 0.1 || q.levelDb < -50) blocking.push('לא שמעתי קריאה בהקלטה. כדאי לבדוק שהמיקרופון לא מכוסה ולקרוא בקול.');
  else if (q.levelDb < -40) blocking.push('ההקלטה שקטה מדי. כדאי להתקרב לטלפון ולקרוא בקול רם יותר.');
  if (q.durationMs < 1500) blocking.push('ההקלטה קצרה מדי. צריך לקרוא את כל הפסוק.');
  else if (rPitch && voicedMs(sPitch) < 0.4 * voicedMs(rPitch)) blocking.push('נראה שההקלטה נעצרה לפני סוף הפסוק. כדאי לקרוא את כל הפסוק ורק אז ללחוץ על "סיום".');
  if (q.clippedRatio > 0.01) warnings.push('הקול חזק מדי ונשמע מעוות. כדאי להתרחק מעט מהטלפון.');
  if (q.levelDb - q.noiseFloorDb < 15) warnings.push('יש רעש רקע חזק. כדאי לנסות במקום שקט יותר.');

  const errors: DetectedError[] = [];
  const wordScore: (number | null)[] = new Array(nW).fill(null);
  let studentStarts: (number | null)[] = new Array(nW).fill(null);
  let wordsCat: { score: number | null; confidence: number } = { score: null, confidence: 0 };
  let ctcSpans = false;

  // ---- 2. Words: free transcription vs. expected letters; forced alignment for timing.
  if (!blocking.length && input.ctc) {
    const { lp, T } = input.ctc;
    try {
      const spans = forcedAlign(lp, T, buildTarget(input.words.map((w) => w.spoken)));
      studentStarts = spans.map((s) => s.startFrame * FRAME_MS);
      ctcSpans = true;
    } catch {
      // too little audio for the text: timing falls back to DTW below
    }
    const heard = greedyDecode(lp, T);
    const cmp = compareLetters(heard, input.words.map((w) => w.spoken));
    cmp.wordScore.forEach((s, i) => (wordScore[i] = s));
    input.words.forEach((w, i) => {
      const s = cmp.wordScore[i];
      if (s >= THRESHOLDS.wordProblem) return;
      const missing = cmp.wordMatched[i] === 0;
      errors.push({
        category: 'words',
        kind: missing ? 'word-missing' : 'word-different',
        tokenId: w.id,
        wordIndex: i,
        explanationHe: missing ? `נראה שהמילה "${w.text}" חסרה או לא נשמעה.` : `המילה "${w.text}" נשמעה שונה ממה שכתוב.`,
        confidence: +Math.min(0.9, 0.5 + (THRESHOLDS.wordProblem - s)).toFixed(2),
        severity: 'critical',
      });
    });
    let extra = 0;
    cmp.gaps.forEach((g, i) => {
      if ([...g].length < THRESHOLDS.extraLetters) return;
      const prev = input.words[i - 1], next = input.words[i];
      const repeated = [prev, next].find((w) => w && similarity(g, w.spoken) >= THRESHOLDS.repeatSimilarity);
      if (!repeated) extra++;
      const anchor = repeated ?? prev ?? next; // a repeat is reported on the repeated word itself
      const edge = i === 0 || i === cmp.gaps.length - 1; // sound before the first / after the last word is usually not a reading error
      errors.push({
        category: 'words',
        kind: repeated ? 'word-repeated' : 'extra-speech',
        tokenId: anchor.id,
        wordIndex: input.words.indexOf(anchor),
        explanationHe: repeated ? `חזרת על המילה "${repeated.text}".` : prev ? `נשמעו מילים נוספות אחרי "${prev.text}".` : `נשמעו מילים נוספות לפני "${next.text}".`,
        confidence: edge ? 0.35 : 0.6,
        severity: edge ? 'minor' : repeated ? 'moderate' : 'major',
      });
    });
    const clear = cmp.wordScore.filter((s) => s >= THRESHOLDS.wordOk || s < THRESHOLDS.wordProblem).length / nW;
    wordsCat = {
      score: Math.max(0, Math.round(100 * (cmp.wordScore.reduce((a, b) => a + b, 0) / nW) - 5 * extra)),
      confidence: +(clear * (warnings.length ? 0.7 : 1)).toFixed(2),
    };
  }

  // ---- 2b. Niqqud: vowels, sheva na/nach, dagesh and the shin dot against what the phone model heard (analysis/vowels.ts).
  // One finding per word (its clearest one); no verdict on a missing word.
  let niqqudCat: { score: number | null; confidence: number } = { score: null, confidence: 0 };
  if (!blocking.length && input.phones) {
    const slots: Slot[] = [], owner: number[] = [];
    input.words.forEach((w, i) => {
      if (!w.syllables) return;
      const r = wordSlots(w.syllables, w.spoken, input.pronunciation);
      for (const s of r.slots) slots.push(r.checkable ? s : { ...s, vowel: undefined, contrast: undefined, sheva: undefined }), owner.push(i);
    });
    const spans = alignSlots(input.phones, slots, input.phones.idx);
    const missing = new Set(errors.filter((e) => e.kind === 'word-missing').map((e) => e.wordIndex));
    const scores = spans ? scoreChecks(input.phones, slots, spans, input.phones.idx).filter((s) => !missing.has(owner[s.slot])) : [];
    const margin = (s: CheckScore) => (NIQQUD[s.kind].flagBelow - s.goodness) / NIQQUD[s.kind].span; // > 0: flagged
    const worst = new Map<number, CheckScore>();
    for (const s of scores) {
      const prev = worst.get(owner[s.slot]);
      if (margin(s) > 0 && (!prev || margin(s) > margin(prev))) worst.set(owner[s.slot], s);
    }
    for (const [i, s] of worst) {
      errors.push({
        category: 'niqqud',
        kind: s.kind,
        tokenId: input.words[i].id,
        wordIndex: i,
        explanationHe: niqqudMessage(input.words[i].text, slots[s.slot], s),
        confidence: +Math.min(0.9, 0.5 + margin(s)).toFixed(2),
        severity: s.kind === 'vowel' ? 'major' : 'moderate',
      });
    }
    if (scores.length) niqqudCat = { score: Math.round(100 * (1 - scores.filter((s) => margin(s) > 0).length / scores.length)), confidence: +(ctcSpans ? 0.7 : 0.5).toFixed(2) };
  }

  // ---- 3. Alignment student ↔ reference: word-anchored DTW when word timings exist, else whole-verse DTW.
  let refToStu: Float32Array | null = null;
  const refStarts = input.referenceWords?.map((w) => w.startMs) ?? null;
  if (!blocking.length && input.reference && rPitch) {
    const fr = mfcc(input.reference, SR), fs = mfcc(input.student, SR);
    if (ctcSpans && refStarts) {
      refToStu = new Float32Array(fr.n);
      const rb = [0, ...refStarts.slice(1).map((ms) => Math.round(ms / HOP_MS)), fr.n];
      const sb = [0, ...studentStarts.slice(1).map((ms) => Math.round(ms! / HOP_MS)), fs.n];
      for (let w = 0; w < rb.length - 1; w++) {
        const r0 = Math.min(rb[w], fr.n), r1 = Math.min(Math.max(rb[w + 1], r0), fr.n);
        const s0 = Math.min(sb[w], fs.n), s1 = Math.min(Math.max(sb[w + 1], s0), fs.n);
        if (r1 <= r0) continue;
        if (s1 - s0 < 2 || r1 - r0 < 2) {
          for (let i = r0; i < r1; i++) refToStu[i] = s0 + ((i - r0) * (s1 - s0)) / (r1 - r0);
          continue;
        }
        const local = dtw(sub(fr, r0, r1), sub(fs, s0, s1)).aToB;
        for (let i = r0; i < r1; i++) refToStu[i] = s0 + local[i - r0];
      }
    } else {
      refToStu = dtw(fr, fs).aToB;
      if (refStarts) studentStarts = refStarts.map((ms) => Math.round(refToStu![Math.min(refToStu!.length - 1, Math.round(ms / HOP_MS))]) * HOP_MS);
    }
  }

  // ---- 4. Melody per phrase group. The student's key is removed (never an error); with offsetWindow > 0 the key
  // reference follows slow drift (median over neighbouring phrases).
  const mc: MelodyConfig = { ...MELODY_CONFIG, ...input.melody, options: { ...MELODY_CONFIG.options, ...input.melody?.options } };
  let offset: number | null = null;
  let melodyCat: { score: number | null; confidence: number } = { score: null, confidence: 0 };
  const wordDev: (number | null)[] = new Array(nW).fill(null);
  const phrases: VerseEvaluation['phrases'] = [];
  let studentOnReference: (number | null)[] | null = null;
  let chant: VerseEvaluation['chant'] = null;
  let spoken = false;
  if (refToStu && rPitch && refStarts && refMedian) {
    const diffAt = (i: number) => {
      const fr = rPitch[i]?.frequencyHz, fs = sPitch[Math.round(refToStu![i])]?.frequencyHz;
      return fr && fs ? 12 * Math.log2(fs / fr) : null;
    };
    const wordFrames = (w: number) => [Math.round(refStarts[w] / HOP_MS), w + 1 < nW ? Math.round(refStarts[w + 1] / HOP_MS) : rPitch.length];
    const groupFrames = input.groups.map((g) => [wordFrames(g.words[0])[0], wordFrames(g.words[g.words.length - 1])[1]]);
    const groupDiffs = groupFrames.map(([a, b]) => {
      const d: number[] = [];
      for (let i = a; i < b; i++) {
        const x = diffAt(i);
        if (x !== null) d.push(x);
      }
      return d;
    });
    const all = groupDiffs.flat();
    if (all.length > 20) {
      offset = median(all);
      // One vote per phrase (its median), from the neighbours only: a wrong phrase can neither set its own key
      // reference nor, being one vote of several, its neighbours'. Too few votes → the verse's key.
      const votes = groupDiffs.map((d) => (d.length >= 10 ? median(d) : null));
      const localOffset = (p: number) => {
        if (!isFinite(mc.offsetWindow)) return offset!;
        const v: number[] = [];
        for (let q = p - mc.offsetWindow; q <= p + mc.offsetWindow; q++) if (q !== p && votes[q] != null) v.push(votes[q]!);
        return v.length >= 3 ? median(v) : offset!;
      };
      const refSt = semitonesOf(rPitch, refMedian);
      // Chanted at all? Words are judged relative to the verse's typical word, so a reading that ignores the te'amim
      // throughout (said like a sentence) is judged here, on the whole verse. Words are matched by their timings and
      // stretched linearly: the timbre alignment would warp a gliding speech contour onto the reader's notes.
      const pr: number[] = [], pd: number[] = [];
      for (let w = 0; w < nW; w++) {
        const r0 = Math.round(refStarts[w] / HOP_MS), r1 = w + 1 < nW ? Math.round(refStarts[w + 1] / HOP_MS) : rPitch.length;
        const s0 = studentStarts[w], s1 = w + 1 < nW ? studentStarts[w + 1] : q.durationMs;
        if (s0 == null || s1 == null) continue;
        for (let i = r0; i < r1; i++) {
          const fs = sPitch[Math.round((s0 + ((i - r0) / Math.max(1, r1 - r0)) * (s1 - s0)) / HOP_MS)]?.frequencyHz, fr = rPitch[i]?.frequencyHz;
          if (fs && fr) pr.push(refSt[i]!), pd.push(12 * Math.log2(fs / fr));
        }
      }
      if (pr.length > 20) {
        // Not octave-folded against the reader: that would pull a wandering speech contour back onto the notes
        // (detectPitch already folds the student's own octave slips).
        const off = median(pd), dev = pd.map((d) => d - off);
        chant = { correlation: +pearson(pr, pr.map((r, k) => r + dev[k])).toFixed(2), spreadSt: +median(dev.map(Math.abs)).toFixed(2) };
      }
      spoken = !!chant && (chant.correlation < mc.chantMinCorr || chant.spreadSt > mc.chantMaxSpreadSt);
      const stuSt = semitonesOf(sPitch, refMedian); // student on the reader's scale; key removed via the offset
      const onRef: (number | null)[] = new Array(rPitch.length).fill(null);
      studentOnReference = onRef;
      const studentFrameAt = (w: number) => (studentStarts[w] !== null && studentStarts[w] !== undefined ? Math.round(studentStarts[w]! / HOP_MS) : null);
      const wordOfFrame = (g: { words: number[] }, i: number) => g.words.find((k) => i >= wordFrames(k)[0] && i < wordFrames(k)[1]);

      const scored: number[] = [];
      const judged: { g: (typeof input.groups)[number]; dev: number | null; coverage: number; keyShift: number | null }[] = [];
      let cov = 0;
      input.groups.forEach((g, p) => {
        const [a, b] = groupFrames[p], off = localOffset(p);
        let dev: number | null = null, coverage = 0;
        const perWord = new Map<number, number[]>();
        const addWord = (w: number | undefined, v: number) => w !== undefined && perWord.set(w, [...(perWord.get(w) ?? []), v]);
        if (mc.method === 'frames') {
          const d: number[] = [];
          let voiced = 0;
          for (let i = a; i < b; i++) {
            if (refSt[i] === null) continue;
            voiced++;
            const x = diffAt(i);
            if (x === null) continue;
            d.push(Math.abs(x - off));
            onRef[i] = refSt[i]! + x - off;
            addWord(wordOfFrame(g, i), Math.abs(x - off));
          }
          dev = d.length ? median(d) : null;
          coverage = voiced ? d.length / voiced : 0;
        } else {
          // Student segment of this phrase: from its first word to the next phrase's first word.
          const sa = Math.max(0, studentFrameAt(g.words[0]) ?? Math.round(refToStu![a]));
          const nextWord = g.words[g.words.length - 1] + 1;
          const nextStart = nextWord < nW ? studentFrameAt(nextWord) : null;
          const sb = Math.max(sa + 1, nextStart ?? (nextWord < nW ? Math.round(refToStu![Math.max(a, b - 1)]) + 1 : sPitch.length));
          const guide = Float64Array.from({ length: b - a }, (_, k) => refToStu![a + k] - sa); // content alignment, segment-relative
          const res = compareMelody(refSt.slice(a, b), stuSt.slice(sa, sb), off, mc.options, guide);
          dev = res.deviation;
          coverage = res.coverage;
          const st = mc.options.frameStep;
          res.map.forEach((j, k) => {
            if (j >= 0) {
              const v = decimate(stuSt.slice(sa + j * st, sa + (j + 1) * st), st)[0];
              if (v !== null && v !== undefined) for (let i = a + k * st; i < Math.min(b, a + (k + 1) * st); i++) if (refSt[i] !== null) onRef[i] = v - off;
            }
            if (!isNaN(res.costs[k])) addWord(wordOfFrame(g, a + k * st), res.costs[k]);
          });
        }
        for (const [w, v] of perWord) wordDev[w] = mc.method === 'frames' ? median(v) : v.reduce((x, y) => x + y, 0) / v.length;
        const keyShift = votes[p] !== null && isFinite(mc.offsetWindow) ? +fold(votes[p]! - off).toFixed(2) : null;
        phrases.push({ taam: g.taam, words: g.words, deviation: dev === null ? null : +dev.toFixed(2), coverage: +coverage.toFixed(2), keyShift });
        judged.push({ g, dev, coverage, keyShift });
        if (dev === null || coverage < 0.3) return;
        scored.push(Math.max(0, Math.min(1, 1 - (dev - mc.scoreGood) / (mc.scoreBad - mc.scoreGood))));
        cov += coverage;
      });
      const typical = wordDev.filter((d): d is number => d !== null);
      const typicalWord = typical.length ? median(typical) : 0;
      if (spoken)
        errors.push({
          category: 'cantillation',
          kind: 'not-chanted',
          explanationHe: 'נשמע שקראתם את הפסוק כמו משפט רגיל, בלי מנגינת הטעמים. בקריאה בתורה שרים כל מילה לפי הטעם שלה, כמו הקורא לדוגמה.',
          confidence: 0.85,
          severity: 'critical',
        });
      for (const { g, dev, coverage, keyShift } of spoken ? [] : judged) {
        // Double-counting policy: no melody verdict where a word is missing (there is no audio to judge); a word that
        // merely sounds different still has a melody, so both findings stand.
        if (g.words.some((w) => errors.some((e) => e.kind === 'word-missing' && e.wordIndex === w))) continue;
        const ramp = (x: number, lo: number, hi: number) => (x - lo) / (hi - lo);
        // The phrase at the wrong height (needs no pitch alignment, so no coverage gate beyond its own frame count).
        const shift = keyShift === null ? -1 : ramp(Math.abs(keyShift), mc.keyShiftSt, mc.keyShiftMajorSt);
        const worst = g.words.reduce((a, w) => ((wordDev[w] ?? -1) > (wordDev[a] ?? -1) ? w : a), g.words[g.words.length - 1]);
        const notes = dev === null || coverage < mc.minCoverage ? -1 : Math.max(ramp((wordDev[worst] ?? 0) - typicalWord, mc.wordErrorSt, mc.wordMajorSt), ramp(dev, mc.phraseErrorSt, mc.phraseMajorSt));
        const strength = Math.max(shift, notes);
        if (strength <= 0) continue;
        const at = notes >= shift ? worst : g.words[g.words.length - 1];
        const taam = notes >= shift ? input.words[worst].primary ?? g.taam : g.taam;
        errors.push({
          category: 'cantillation',
          kind: 'melody',
          tokenId: input.words[at].id,
          wordIndex: at,
          taam: taam ?? undefined,
          explanationHe:
            notes >= shift
              ? `במילה "${input.words[at].text}" (${taamName(taam)}) המנגינה שונה מהקריאה לדוגמה.`
              : `את המילים "${g.words.map((w) => input.words[w].text).join(' ')}" שרת ${keyShift! > 0 ? 'גבוה' : 'נמוך'} מדי ביחס לשאר הפסוק.`,
          confidence: +(Math.max(0.5, coverage) * Math.min(0.9, 0.55 + 0.35 * Math.min(1, strength))).toFixed(2),
          severity: strength >= 1 ? 'major' : 'moderate',
        });
      }
      if (scored.length) melodyCat = { score: spoken ? 0 : Math.round((100 * scored.reduce((a, b) => a + b, 0)) / scored.length), confidence: +((cov / scored.length) * (ctcSpans ? 1 : 0.7)).toFixed(2) };
    }
  }

  // ---- 5. Pauses: a long stop where the te'amim join words is a phrasing slip; elsewhere breathing is fine.
  let pauseCat: { score: number | null; confidence: number } = { score: null, confidence: 0 };
  if (!blocking.length && studentStarts.every((s) => s !== null)) {
    const gate = percentile(Float32Array.from(sPitch, (p) => p.rmsDb), 0.95) - 25;
    const starts = studentStarts as number[];
    let count = 0;
    for (let i = 0; i < sPitch.length; ) {
      if (sPitch[i].voiced || sPitch[i].rmsDb >= gate) {
        i++;
        continue;
      }
      let j = i;
      while (j < sPitch.length && !sPitch[j].voiced && sPitch[j].rmsDb < gate) j++;
      const ms = (j - i) * HOP_MS, centre = ((i + j) / 2) * HOP_MS;
      const after = starts.filter((s) => s <= centre).length - 1; // the word this pause follows
      const w = input.words[after];
      if (ms >= THRESHOLDS.pauseInsidePhraseMs && after >= 0 && after < nW - 1 && (!w.primary || TAAM_BY_ID[w.primary]?.kind === 'conjunctive')) {
        count++;
        errors.push({
          category: 'pause',
          kind: 'pause-inside-phrase',
          tokenId: w.id,
          wordIndex: after,
          explanationHe: w.primary
            ? `עצרת אחרי "${w.text}", אבל ה${taamName(w.primary)} מחבר אותה למילה הבאה. כדאי להמשיך בלי לעצור.`
            : `עצרת אחרי "${w.text}", אבל המקף מחבר אותה למילה הבאה. כדאי להמשיך בלי לעצור.`,
          confidence: ctcSpans ? 0.6 : 0.4,
          severity: 'minor',
        });
      }
      i = j;
    }
    pauseCat = { score: Math.max(0, 100 - 15 * count), confidence: ctcSpans ? 0.6 : 0.4 };
  }

  // ---- 6. Categories and status.
  const reasons: Partial<Record<Category, string>> = {};
  if (!input.ctc) reasons.words = 'רכיב זיהוי המילים אינו מותקן במכשיר זה.';
  if (!input.phones) reasons.niqqud = 'רכיב בדיקת הניקוד אינו מותקן במכשיר זה.';
  if (!input.reference) reasons.cantillation = 'אין הקלטת ייחוס לפסוק זה.';
  const measured: Partial<Record<Category, { score: number | null; confidence: number }>> = { words: wordsCat, niqqud: niqqudCat, cantillation: melodyCat, stress: pauseCat };
  const categories: CategoryScore[] = (Object.keys(CATEGORY_WEIGHTS) as Category[]).map((c) => {
    const info = ANALYZERS[c];
    const maturity = reasons[c] ? 'unavailable' : info.maturity;
    const m = maturity === 'unavailable' || blocking.length ? null : measured[c] ?? null;
    return { category: c, score: m?.score ?? null, confidence: m?.confidence ?? 0, maturity, validated: maturity === 'validated', noteHe: reasons[c] ?? info.noteHe };
  });
  const definitive = categories.some((c) => c.score !== null);
  let overallScore: number | null = null;
  let status: VerseEvaluation['status'] = 'inconclusive';
  let inconclusiveReason: VerseEvaluation['inconclusiveReason'];
  if (blocking.length) inconclusiveReason = 'audio-quality';
  else if (!input.reference) inconclusiveReason = 'reference-missing';
  else if (!definitive) inconclusiveReason = 'unvalidated-analyzers';
  else {
    const scored = categories.filter((c) => c.score !== null);
    const totalW = scored.reduce((s, c) => s + CATEGORY_WEIGHTS[c.category], 0);
    overallScore = Math.round(scored.reduce((s, c) => s + CATEGORY_WEIGHTS[c.category] * c.score!, 0) / totalW);
    // Policy: a confident critical error fails the verse even with a high composite score.
    const critical = spoken;
    status = overallScore >= input.passingThreshold && !critical ? 'passed' : 'failed';
  }

  const words: WordAssessment[] = input.words.map((w, i) => {
    const mine = errors.filter((e) => e.wordIndex === i && e.category !== 'pause');
    const s = wordScore[i];
    const status = mine.length ? 'problem' : s !== null && s < THRESHOLDS.wordOk ? 'doubtful' : s !== null || wordDev[i] !== null ? 'ok' : 'unknown';
    const start = studentStarts[i];
    const next = i + 1 < nW ? studentStarts[i + 1] : q.durationMs;
    return { wordIndex: i, status, startMs: start, endMs: start !== null ? next : null, wordScore: s, melodyDeviation: wordDev[i] !== null ? +wordDev[i]!.toFixed(2) : null };
  });

  const sevRank = { critical: 0, major: 1, moderate: 2, minor: 3 };
  errors.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.confidence - a.confidence);

  const charts: EvalCharts = {
    reference: rPitch && input.reference ? { durationMs: (input.reference.length / SR) * 1000, semitones: semitonesOf(rPitch, refMedian), wordStartsMs: refStarts ?? [] } : null,
    student: { durationMs: q.durationMs, semitones: semitonesOf(sPitch, stuMedian), wordStartsMs: studentStarts },
    studentOnReference,
  };

  return {
    evaluation: {
      verseId: input.verseId,
      status,
      inconclusiveReason,
      overallScore,
      passingThreshold: input.passingThreshold,
      categories,
      errors,
      words,
      phrases,
      chant,
      qualityIssues: [...blocking, ...warnings],
      transpositionSemitones: offset !== null ? +offset.toFixed(1) : null,
      referenceApproval: input.referenceApproval,
      analyzedAt: new Date().toISOString(),
      analyzerVersions: {
        pitch: PITCH_ALGORITHM_VERSION,
        words: ANALYZERS.words.version,
        ctcModel: CTC_MODEL_ID,
        cantillation: ANALYZERS.cantillation.version,
        stress: ANALYZERS.stress.version,
        niqqud: ANALYZERS.niqqud.version,
      },
    },
    charts,
  };
}
