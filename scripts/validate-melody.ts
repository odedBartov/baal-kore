// Melody (cantillation) validation on REAL chant, with realistic errors:
//   correct, same melody      — Asael's Ashkenazi-pronunciation session vs. his bundled reference (best imitation)
//   correct, other performer  — Nahum vs. Asael (same tradition, a different singer's melodies)
//   wrong ta'am               — the same word sung with a different ta'am elsewhere in Bereshit, swapped in (real audio)
// Methods are compared on identical cases; thresholds are chosen on even-indexed verses (tuning half) and
// reported on odd-indexed verses (held-out half). Writes docs/data/melody-validation.json.
// Run: npm run validate-melody   (needs align-reference; model outputs are cached in .cache/ctc-cache)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { evaluate, MELODY_CONFIG, type MelodyConfig } from '../src/app/analysis/evaluate';
import { K } from '../src/app/analysis/ctc';
import { checkLesson, type LessonMelodyConfig } from '../src/app/teaching/lesson-check';
import { compareMelody, MELODY_DEFAULTS } from '../src/app/analysis/melody';
import { detectPitch, medianVoicedHz } from '../src/app/audio/pitch';
import { TAAM_BY_ID } from '../src/app/torah/cantillation';
import { resample } from '../src/app/audio/wav';
import type { PortionData, VerseData } from '../src/app/torah/model';
import type { VerseEvaluation } from '../src/app/analysis/types';
import { ctcLogProbs, loadCtcModel, type CtcModel } from './lib/ctc-model';

const ROOT = join(import.meta.dirname, '..');
const SR = 16000;
type Reader = { files: { path: string }[]; verses: Record<string, { file: number; startMs: number; endMs: number; words: [number, number, number][]; quality: string }> };
const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));
const ref: Reader = JSON.parse(readFileSync(join(ROOT, 'src/data/reference-asael-israeli.json'), 'utf8'));
const students: Record<string, Reader> = {
  'asael-ashkenazi': JSON.parse(readFileSync(join(ROOT, '.cache/reference/asael-ashkenazi.json'), 'utf8')),
  nahum: JSON.parse(readFileSync(join(ROOT, '.cache/reference/nahum.json'), 'utf8')),
};
const SOURCE: Record<string, (n: number) => string> = {
  'asael-israeli': (n) => join(ROOT, 'src', ref.files[n].path),
  'asael-ashkenazi': (n) => join(ROOT, '.cache/reference/src', `Aa Genesis Bereshit-${n + 1} Asael Ashkenaz.oga`),
  nahum: (n) => join(ROOT, '.cache/reference/src', `Aa Genesis Bereshit-${n + 1} Nahum.oga`),
};

async function decodeFile(path: string): Promise<Float32Array> {
  const d = new OggVorbisDecoder();
  await d.ready;
  const { channelData, sampleRate } = await d.decodeFile(readFileSync(path));
  d.free();
  const m = new Float32Array(channelData[0].length);
  for (const c of channelData) for (let i = 0; i < m.length; i++) m[i] += c[i] / channelData.length;
  return resample(m, sampleRate, SR);
}

const CACHE = join(ROOT, '.cache', 'ctc-cache');
async function ctcCached(model: CtcModel, x: Float32Array) {
  mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, createHash('sha1').update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)).digest('hex') + '.lp');
  if (existsSync(p)) {
    const b = readFileSync(p);
    const lp = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
    return { lp, T: lp.length / K };
  }
  const r = await ctcLogProbs(model, x);
  writeFileSync(p, Buffer.from(r.lp.buffer, r.lp.byteOffset, r.lp.byteLength));
  return r;
}

const cut = (x: Float32Array, a: number, b: number) => x.slice(Math.max(0, Math.round((a * SR) / 1000)), Math.round((Math.min(b, (x.length / SR) * 1000) * SR) / 1000));
const cat = (...p: Float32Array[]) => {
  const o = new Float32Array(p.reduce((s, q) => s + q.length, 0));
  let k = 0;
  for (const q of p) o.set(q, k), (k += q.length);
  return o;
};
const percentile = (v: number[], q: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
const rate = (v: boolean[]) => (v.length ? +(v.filter(Boolean).length / v.length).toFixed(3) : null);

// First run (2026-10-12) also measured 'frames, local key', 'pitch-DTW, global key' and corridors 6 / 20: all worse
// than 'pitch-DTW, local key' on held-out detection at equal false alarms (docs/validation.md).
// keyShiftSt is switched off here (recorded per phrase instead) so the key-shift threshold can be chosen below.
const NO_SHIFT = { keyShiftSt: 99, keyShiftMajorSt: 100 };
const METHODS: Record<string, Partial<MelodyConfig>> = {
  'frames, global key (v1)': { method: 'frames', offsetWindow: Infinity, ...NO_SHIFT },
  'pitch-DTW, local key': { method: 'dtw', offsetWindow: 2, ...NO_SHIFT },
  'pitch-DTW, local key, step penalty 0.5': { method: 'dtw', offsetWindow: 2, options: { ...MELODY_DEFAULTS, stepPenalty: 0.5 }, ...NO_SHIFT },
  'pitch-DTW, local key, step penalty 2': { method: 'dtw', offsetWindow: 2, options: { ...MELODY_DEFAULTS, stepPenalty: 2 }, ...NO_SHIFT },
};
const APP_METHOD = 'pitch-DTW, local key';
const OLD_APP_PHRASE_ST = 2.0; // v1 rule: median phrase deviation above 2 semitones (THRESHOLDS.melodyErrorSt)
const LESSON_METHODS: Record<string, LessonMelodyConfig> = {
  'frames (v1)': { method: 'frames', options: MELODY_DEFAULTS },
  'pitch-DTW': { method: 'dtw', options: MELODY_DEFAULTS },
};

interface PhraseRecord {
  split: 'tune' | 'report'; kind: string; cls?: string; pair?: string; trueDiff?: number | null;
  dev: number | null; coverage: number; worstWord: number | null; relWord: number | null; keyShift: number | null;
  wordMissing: boolean; notesFlag: boolean; notesConf: number; // the app's note-based melody errors in this phrase
}

async function main() {
  const model = await loadCtcModel();
  console.log('decoding…');
  const audio: Record<string, Float32Array[]> = {};
  for (const r of Object.keys(SOURCE)) audio[r] = await Promise.all(Array.from({ length: 7 }, (_, n) => decodeFile(SOURCE[r](n))));
  const readerOf = (id: string) => (id === 'asael-israeli' ? ref : students[id]);
  const verseAudio = (r: string, id: string) => {
    const v = readerOf(r).verses[id];
    return cut(audio[r][v.file], v.startMs, v.endMs);
  };
  const starts = (r: string, id: string) => readerOf(r).verses[id].words.map(([s]) => s - readerOf(r).verses[id].startMs);
  const good = (r: string, id: string) => readerOf(r).verses[id]?.quality === 'good';
  const verses = portion.verses.filter((v) => good('asael-israeli', v.id));
  const split = (v: VerseData) => (portion.verses.indexOf(v) % 2 ? 'report' : 'tune') as 'tune' | 'report';

  const run = async (v: VerseData, student: Float32Array, melody: Partial<MelodyConfig>) =>
    evaluate({
      verseId: v.id,
      words: v.words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary })),
      groups: v.groups,
      student,
      reference: verseAudio('asael-israeli', v.id),
      referenceWords: ref.verses[v.id].words.map(([s, e]) => ({ startMs: s - ref.verses[v.id].startMs, endMs: e - ref.verses[v.id].startMs })),
      referenceApproval: 'pending',
      ctc: await ctcCached(model, student),
      passingThreshold: 85,
      melody,
    }).evaluation;

  // Wrong-ta'am cases: same word, other ta'am, both from Asael's Ashkenazi session.
  const occurrences = new Map<string, { v: VerseData; i: number }[]>();
  for (const v of portion.verses) if (good('asael-ashkenazi', v.id)) v.words.forEach((w, i) => w.primary && i < v.words.length - 1 && occurrences.set(w.spoken, [...(occurrences.get(w.spoken) ?? []), { v, i }]));
  const swaps: { v: VerseData; i: number; donor: { v: VerseData; i: number }; cls: string; pair?: string; trueDiff?: number | null }[] = [];
  for (const v of verses) {
    if (!good('asael-ashkenazi', v.id)) continue;
    const cand = v.words
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => i > 0 && i < v.words.length - 1 && w.primary && w.spoken.length >= 3)
      .map(({ w, i }) => ({ i, donor: (occurrences.get(w.spoken) ?? []).find((o) => o.v.id !== v.id && o.v.words[o.i].primary !== w.primary) }))
      .filter((c) => c.donor);
    const pick = cand.find((c) => TAAM_BY_ID[v.words[c.i].primary!].kind === 'disjunctive' || TAAM_BY_ID[c.donor!.v.words[c.donor!.i].primary!].kind === 'disjunctive') ?? cand[0];
    if (!pick) continue;
    const a = v.words[pick.i].primary!, b = pick.donor!.v.words[pick.donor!.i].primary!;
    const cls = TAAM_BY_ID[a].kind === 'conjunctive' && TAAM_BY_ID[b].kind === 'conjunctive' ? 'conjunctive↔conjunctive' : 'involves a disjunctive';
    swaps.push({ v, i: pick.i, donor: pick.donor!, cls });
  }
  console.log(`verses: ${verses.length}; correct (same melody): ${verses.filter((v) => good('asael-ashkenazi', v.id)).length}; correct (other singer): ${verses.filter((v) => good('nahum', v.id)).length}; wrong-ta'am swaps: ${swaps.length}`);

  const spliced = (s: (typeof swaps)[number]) => {
    const x = verseAudio('asael-ashkenazi', s.v.id), st = starts('asael-ashkenazi', s.v.id);
    const dx = verseAudio('asael-ashkenazi', s.donor.v.id), dst = starts('asael-ashkenazi', s.donor.v.id);
    const piece = cut(dx, dst[s.donor.i], dst[s.donor.i + 1]);
    const y = cat(cut(x, 0, st[s.i]), piece, cut(x, st[s.i + 1], 1e9));
    const delta = (piece.length / SR) * 1000 - (st[s.i + 1] - st[s.i]);
    return { y, starts: st.map((t, k) => (k > s.i ? t + delta : t)) };
  };

  // Worst word of the phrase, absolute and relative to the verse's typical word (a different but consistent style
  // raises every word; a wrong ta'am raises one), plus what the app itself reported for the phrase.
  const phraseStats = (e: VerseEvaluation, ph: VerseEvaluation['phrases'][number]) => {
    const devs = (idx: number[]) => idx.map((w) => e.words[w]?.melodyDeviation).filter((x): x is number => x !== null && x !== undefined);
    const d = devs(ph.words), all = devs(e.words.map((_, k) => k));
    const worstWord = d.length ? Math.max(...d) : null;
    const mel = e.errors.filter((m) => m.kind === 'melody' && ph.words.includes(m.wordIndex!));
    return {
      dev: ph.deviation, coverage: ph.coverage, keyShift: ph.keyShift, worstWord,
      relWord: worstWord === null || !all.length ? null : +(worstWord - percentile(all, 0.5)).toFixed(2),
      wordMissing: e.errors.some((m) => m.kind === 'word-missing' && ph.words.includes(m.wordIndex!)),
      notesFlag: mel.length > 0, notesConf: Math.max(0, ...mel.map((m) => m.confidence)),
    };
  };
  // How different the two te'amim really sound on this word: the singer's own two renditions, compared directly.
  for (const s of swaps) {
    const st = (x: Float32Array, med: number | null) => detectPitch(x, SR).map((p) => (p.frequencyHz && med ? 12 * Math.log2(p.frequencyHz / med) : null));
    const word = (id: string, i: number) => cut(verseAudio('asael-ashkenazi', id), starts('asael-ashkenazi', id)[i], starts('asael-ashkenazi', id)[i + 1]);
    const med = (id: string) => medianVoicedHz(detectPitch(verseAudio('asael-ashkenazi', id), SR));
    const mo = med(s.v.id), md = med(s.donor.v.id);
    s.trueDiff = mo && md ? compareMelody(st(word(s.v.id, s.i), mo), st(word(s.donor.v.id, s.donor.i), md), 0, MELODY_DEFAULTS).deviation : null;
    s.pair = `${s.v.words[s.i].primary}→${s.donor.v.words[s.donor.i].primary}`;
  }
  const results: Record<string, { records: PhraseRecord[] }> = {};
  for (const [name, melody] of Object.entries(METHODS)) {
    const records: PhraseRecord[] = [];
    for (const v of verses) {
      for (const r of ['asael-ashkenazi', 'nahum']) {
        if (!good(r, v.id)) continue;
        const e = await run(v, verseAudio(r, v.id), melody);
        for (const ph of e.phrases) records.push({ split: split(v), kind: r === 'nahum' ? 'correct, other singer' : 'correct, same melody', ...phraseStats(e, ph) });
      }
    }
    for (const s of swaps) {
      const e = await run(s.v, spliced(s).y, melody);
      const ph = e.phrases.find((p) => p.words.includes(s.i));
      if (ph) records.push({ split: split(s.v), kind: "wrong ta'am", cls: s.cls, ...phraseStats(e, ph), pair: s.pair, trueDiff: s.trueDiff });
    }
    results[name] = { records };
    console.log(`  ${name}: ${records.length} phrase records`);
  }

  // Threshold per method and criterion (whole-phrase deviation, or its worst word) on the tuning half: allow ≤ 3%
  // false alarms on correct same-melody phrases.
  const summary = Object.entries(results).flatMap(([name, { records }]) => (['phrase', 'worstWord', 'relWord'] as const).map((criterion) => {
    const val = (r: PhraseRecord) => (criterion === 'phrase' ? r.dev! : criterion === 'worstWord' ? r.worstWord ?? r.dev! : r.relWord ?? 0);
    const judged = records.filter((r) => r.dev !== null && r.coverage >= 0.5);
    const tune = judged.filter((r) => r.split === 'tune'), rep = judged.filter((r) => r.split === 'report');
    const devs = (rs: PhraseRecord[], kind: string, cls?: string) => rs.filter((r) => r.kind === kind && (!cls || r.cls === cls)).map(val);
    const threshold = +percentile(devs(tune, 'correct, same melody'), 0.97).toFixed(2);
    const flag = (v: number[]) => rate(v.map((d) => d > threshold));
    return {
      method: name,
      criterion,
      threshold,
      heldOut: {
        falseAlarmSameMelody: flag(devs(rep, 'correct, same melody')),
        falseAlarmOtherSinger: flag(devs(rep, 'correct, other singer')),
        detectedWrongTaam: flag(devs(rep, "wrong ta'am")),
        detectedWrongTaamDisjunctive: flag(devs(rep, "wrong ta'am", 'involves a disjunctive')),
        detectedWrongTaamConjunctiveOnly: flag(devs(rep, "wrong ta'am", 'conjunctive↔conjunctive')),
        medianDev: { sameMelody: +percentile(devs(rep, 'correct, same melody'), 0.5).toFixed(2), otherSinger: +percentile(devs(rep, 'correct, other singer'), 0.5).toFixed(2), wrongTaam: +percentile(devs(rep, "wrong ta'am"), 0.5).toFixed(2) },
        cases: { sameMelody: devs(rep, 'correct, same melody').length, otherSinger: devs(rep, 'correct, other singer').length, wrongTaam: devs(rep, "wrong ta'am").length },
        // Detection by how different the two te'amim really sound on that word (singer's own renditions, semitones).
        // All swaps (both halves): thresholds come from correct readings only, so no swap ever tunes anything.
        detectedByTrueDifference: Object.fromEntries(
          ([['< 1 st', 0, 1], ['1–2 st', 1, 2], ['≥ 2 st', 2, 99]] as const).map(([label, lo, hi]) => {
            const v = judged.filter((r) => r.kind === "wrong ta'am" && r.trueDiff != null && r.trueDiff >= lo && r.trueDiff < hi).map(val);
            return [label, { detected: flag(v), cases: v.length }];
          }),
        ),
      },
    };
  }));
  console.table(summary.map((s) => ({ method: s.method, criterion: s.criterion, byTrueDiff: JSON.stringify(s.heldOut.detectedByTrueDifference), threshold: s.threshold, ...s.heldOut, medianDev: JSON.stringify(s.heldOut.medianDev), cases: JSON.stringify(s.heldOut.cases) })));

  // What the app reports, over ALL phrases (no coverage filter): note-based errors (MELODY_CONFIG) plus the key-shift
  // criterion, whose threshold is the 99th percentile of |key shift| on correct same-melody phrases of the tuning half.
  // "Shown" = confidence >= 0.6, the level at which the results screen names an error (a cross rather than "?").
  const appRecords = results[APP_METHOD].records;
  const shiftOf = (r: PhraseRecord) => (r.keyShift === null || r.wordMissing ? 0 : Math.abs(r.keyShift));
  const keyShiftSt = Math.ceil(4 * percentile(appRecords.filter((r) => r.split === 'tune' && r.kind === 'correct, same melody').map(shiftOf), 0.99)) / 4;
  const shiftConf = (r: PhraseRecord) => {
    const x = shiftOf(r) - keyShiftSt; // keyShiftMajorSt = keyShiftSt + 1
    return x > 0 ? Math.max(0.5, r.coverage) * Math.min(0.9, 0.55 + 0.35 * Math.min(1, x)) : 0;
  };
  const appRate = (kind: string, shown: boolean) =>
    rate(appRecords.filter((r) => r.split === 'report' && r.kind === kind).map((r) => (shown ? Math.max(r.notesConf, shiftConf(r)) >= 0.6 : r.notesFlag || shiftConf(r) > 0)));
  const oldRecords = results['frames, global key (v1)'].records;
  const oldFlag = (r: PhraseRecord) => r.dev !== null && r.coverage >= 0.5 && !r.wordMissing && r.dev > OLD_APP_PHRASE_ST;
  const oldRate = (kind: string) => rate(oldRecords.filter((r) => r.split === 'report' && r.kind === kind).map(oldFlag));
  const app = {
    keyShiftSt,
    heldOut: Object.fromEntries((['correct, same melody', 'correct, other singer', "wrong ta'am"] as const).map((k) => [k, {
      before: oldRate(k),
      flagged: appRate(k, false),
      shownToStudent: appRate(k, true),
      phrases: appRecords.filter((r) => r.split === 'report' && r.kind === k).length,
    }])),
  };
  console.log('app decision (held-out half)', JSON.stringify(app, null, 1));

  // Lesson check: correct imitation (the reference singer himself, and another singer) vs. the same phrase with a
  // wrong-ta'am word.
  const lesson: Record<string, { split: string; correct: number | null; other: number | null; wrong: number | null }[]> = {};
  for (const [name, cfg] of Object.entries(LESSON_METHODS)) {
    lesson[name] = [];
    for (const s of swaps) {
      const g = s.v.groups.find((gr) => gr.words.includes(s.i))!;
      const rs = starts('asael-israeli', s.v.id), rEnd = (ref.verses[s.v.id].endMs - ref.verses[s.v.id].startMs);
      const refSeg = cut(verseAudio('asael-israeli', s.v.id), rs[g.words[0]] - 100, g.words.at(-1)! + 1 < rs.length ? rs[g.words.at(-1)! + 1] : rEnd);
      const span = (x: Float32Array, st: number[]) => cut(x, st[g.words[0]] - 100, g.words.at(-1)! + 1 < st.length ? st[g.words.at(-1)! + 1] : (x.length / SR) * 1000);
      const ok = span(verseAudio('asael-ashkenazi', s.v.id), starts('asael-ashkenazi', s.v.id));
      const sp = spliced(s), bad = span(sp.y, sp.starts);
      const spoken = g.words.map((i) => s.v.words[i].spoken);
      const a = checkLesson(ok, refSeg, SR, 99, await ctcCached(model, ok), spoken, cfg);
      const b = checkLesson(bad, refSeg, SR, 99, await ctcCached(model, bad), spoken, cfg);
      let other: number | null = null;
      if (good('nahum', s.v.id)) {
        const n = span(verseAudio('nahum', s.v.id), starts('nahum', s.v.id));
        other = checkLesson(n, refSeg, SR, 99, await ctcCached(model, n), spoken, cfg).deviation;
      }
      lesson[name].push({ split: split(s.v), correct: a.deviation, other, wrong: b.deviation });
    }
  }
  const lessonSummary = Object.entries(lesson).map(([name, rows]) => {
    const tune = rows.filter((r) => r.split === 'tune'), rep = rows.filter((r) => r.split === 'report');
    const vals = (rs: typeof rows, k: 'correct' | 'other' | 'wrong') => rs.map((r) => r[k]).filter((x): x is number => x !== null);
    // Tolerance: pass ≥ 90% of correct imitations on the tuning half — by the reference singer, or by another singer.
    return (['correct', 'other'] as const).map((basis) => {
      const tol = +percentile(vals(tune, basis), 0.9).toFixed(2);
      const pass = (k: 'correct' | 'other' | 'wrong') => rate(vals(rep, k).map((d) => d <= tol));
      return { method: name, toleranceFrom: basis === 'correct' ? 'reference singer' : 'other singer', tolerance: tol, heldOutPass: { referenceSinger: pass('correct'), otherSinger: pass('other'), wrongTaam: pass('wrong') }, cases: { referenceSinger: vals(rep, 'correct').length, otherSinger: vals(rep, 'other').length, wrongTaam: vals(rep, 'wrong').length } };
    });
  }).flat();
  console.table(lessonSummary.map((l) => ({ ...l, heldOutPass: JSON.stringify(l.heldOutPass), cases: JSON.stringify(l.cases) })));

  const report = { createdAt: new Date().toISOString(), note: 'Real chant. Thresholds tuned on even-indexed verses, reported on odd-indexed verses.', current: MELODY_CONFIG, app, verse: summary, lesson: lessonSummary };
  mkdirSync(join(ROOT, 'docs', 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'data', 'melody-validation.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(ROOT, '.cache', 'melody-records.json'), JSON.stringify({ results, lesson }));
}

main();
