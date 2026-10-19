// Engineering validation of the verse analyzers on REAL human chanting (spec §19–20). Not a substitute for
// the labelled student corpus: the "students" here are a second adult reader (Nahum, Ashkenazi pronunciation)
// and errors are spliced into his real audio (deleted / repeated / swapped word, re-pitched phrase).
// Writes docs/data/analyzer-validation.json. Run: npm run validate-analyzers  (needs align-reference first)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { evaluate, THRESHOLDS } from '../src/app/analysis/evaluate';
import { checkLesson } from '../src/app/teaching/lesson-check';
import { defaultSettings } from '../src/app/core/state';
import { pitchShift } from '../src/app/audio/pitch-shift';
import { resample } from '../src/app/audio/wav';
import type { PortionData, VerseData } from '../src/app/torah/model';
import type { VerseEvaluation } from '../src/app/analysis/types';
import { ctcLogProbs, loadCtcModel, type CtcModel } from './lib/ctc-model';

const ROOT = join(import.meta.dirname, '..');
const SR = 16000;
type Ref = { files: { aliyah: number; path: string }[]; verses: Record<string, { file: number; startMs: number; endMs: number; words: [number, number, number][]; quality: string }> };

const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));
const asael: Ref = JSON.parse(readFileSync(join(ROOT, 'src/data/reference-asael-israeli.json'), 'utf8'));
const nahum: Ref = JSON.parse(readFileSync(join(ROOT, '.cache/reference/nahum.json'), 'utf8'));

async function decodeFile(path: string): Promise<Float32Array> {
  const d = new OggVorbisDecoder();
  await d.ready;
  const { channelData, sampleRate } = await d.decodeFile(readFileSync(path));
  d.free();
  const mono = new Float32Array(channelData[0].length);
  for (const ch of channelData) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channelData.length;
  return resample(mono, sampleRate, SR);
}

const cut = (x: Float32Array, a: number, b: number) => x.slice(Math.round((a * SR) / 1000), Math.round((b * SR) / 1000));
const concat = (...xs: Float32Array[]) => {
  const out = new Float32Array(xs.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of xs) out.set(x, o), (o += x.length);
  return out;
};

async function main() {
  const model: CtcModel = await loadCtcModel();
  console.log('decoding readings…');
  const audioA: Record<number, Float32Array> = {}, audioN: Record<number, Float32Array> = {};
  for (let f = 0; f < 7; f++) {
    audioA[f] = await decodeFile(join(ROOT, 'src', asael.files[f].path));
    audioN[f] = await decodeFile(join(ROOT, '.cache/reference/src', `Aa Genesis Bereshit-${f + 1} Nahum.oga`));
  }
  const seg = (r: Ref, a: Record<number, Float32Array>, id: string) => cut(a[r.verses[id].file], r.verses[id].startMs, r.verses[id].endMs);
  const rel = (r: Ref, id: string) => r.verses[id].words.map(([s, e]) => ({ startMs: s - r.verses[id].startMs, endMs: e - r.verses[id].startMs }));

  let runs = 0, ctcMs = 0, evalMs = 0;
  async function run(v: VerseData, student: Float32Array): Promise<VerseEvaluation> {
    let t = Date.now();
    const ctc = await ctcLogProbs(model, student);
    ctcMs += Date.now() - t;
    t = Date.now();
    const out = evaluate({
      verseId: v.id,
      words: v.words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary })),
      groups: v.groups,
      student,
      reference: seg(asael, audioA, v.id),
      referenceWords: rel(asael, v.id),
      referenceApproval: 'pending',
      ctc,
      passingThreshold: 85,
    }).evaluation;
    evalMs += Date.now() - t;
    if (++runs % 10 === 0) console.log(`  ${runs} evaluations, mean ctc ${(ctcMs / runs).toFixed(0)} ms, mean analysis ${(evalMs / runs).toFixed(0)} ms`);
    return out;
  }

  // Raw distributions for threshold choice (word letter scores, phrase melody deviations).
  const raw = { correctWordScores: [] as number[], omittedWordScores: [] as number[], substitutedWordScores: [] as number[], correctPhraseDevs: [] as number[], shiftedPhraseDevs: [] as number[] };

  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

  // 1. Correct readings by a different reader: every reported error is a false alarm.
  const good = portion.verses.filter((v) => nahum.verses[v.id].quality === 'good' && asael.verses[v.id].quality === 'good');
  const fa = { verses: 0, words: 0, wordErrors: 0, extra: 0, melodyGroups: 0, melodyErrors: 0, pauseErrors: 0, conf06Words: 0, scores: { words: [] as number[], cantillation: [] as number[] } };
  for (const [n, v] of good.entries()) {
    if (only) break;
    if (n % 2) continue; // ponytail: every 2nd clean verse keeps the run under ~15 min
    const e = await run(v, seg(nahum, audioN, v.id));
    fa.verses++;
    fa.words += v.words.length;
    fa.melodyGroups += v.groups.length;
    fa.wordErrors += e.errors.filter((x) => x.kind === 'word-missing' || x.kind === 'word-different').length;
    fa.conf06Words += e.errors.filter((x) => x.category === 'words' && x.confidence >= 0.6).length;
    fa.extra += e.errors.filter((x) => x.kind === 'extra-speech' || x.kind === 'word-repeated').length;
    fa.melodyErrors += e.errors.filter((x) => x.kind === 'melody').length;
    fa.pauseErrors += e.errors.filter((x) => x.category === 'pause').length;
    for (const c of e.categories) if (c.score !== null && (c.category === 'words' || c.category === 'cantillation')) fa.scores[c.category].push(c.score);
    for (const w of e.words) if (w.wordScore !== null) raw.correctWordScores.push(+w.wordScore.toFixed(3));
    for (const ph of e.phrases) if (ph.deviation !== null && ph.coverage >= 0.5) raw.correctPhraseDevs.push(ph.deviation);
  }
  console.log(`correct readings: ${fa.verses} verses`, JSON.stringify(fa, (k, v) => (k === 'scores' ? undefined : v)));

  // 2. Spliced real-audio errors (every 3rd good verse, a mid-verse word of ≥ 3 letters).
  const det: Record<string, { n: number; hit: number; nearHit: number; otherWordErrors: number }> = {};
  const tally = (kind: string, ok: boolean, near: boolean, others: number) => {
    const d = (det[kind] ??= { n: 0, hit: 0, nearHit: 0, otherWordErrors: 0 });
    d.n++;
    if (ok) d.hit++;
    if (near) d.nearHit++;
    d.otherWordErrors += others;
  };
  const donorWords = good.flatMap((v) => v.words.map((w, i) => ({ v, i, w })).filter((x) => x.w.spoken.length >= 4));
  for (const [n, v] of good.entries()) {
    if (only && only !== 'spliced') break;
    if (n % 4) continue;
    const x = seg(nahum, audioN, v.id);
    const W = rel(nahum, v.id);
    const k = [...v.words.keys()].filter((i) => i > 0 && i < v.words.length - 1 && v.words[i].spoken.length >= 3)[Math.floor(v.words.length / 2) % Math.max(1, v.words.length - 2)];
    if (k === undefined) continue;
    const a = W[k].startMs, b = W[k + 1].startMs;
    const hits = (e: VerseEvaluation, kinds: string[], at: number) => e.errors.filter((m) => kinds.includes(m.kind) && Math.abs((m.wordIndex ?? -9) - at) <= 1);
    const othersOf = (e: VerseEvaluation, at: number) => e.errors.filter((m) => m.category === 'words' && Math.abs((m.wordIndex ?? -9) - at) > 1).length;

    let e = await run(v, concat(cut(x, 0, a), cut(x, b, 1e9)));
    if (e.words[k].wordScore !== null) raw.omittedWordScores.push(+e.words[k].wordScore!.toFixed(3));
    tally('omitted word', hits(e, ['word-missing', 'word-different'], k).some((m) => m.wordIndex === k), hits(e, ['word-missing', 'word-different'], k).length > 0, othersOf(e, k));

    e = await run(v, concat(cut(x, 0, b), cut(x, a, b), cut(x, b, 1e9)));
    // Which copy is "the repeat" is ambiguous, so the report may sit on word k or its neighbours.
    tally('repeated word', hits(e, ['word-repeated', 'extra-speech'], k).length > 0, hits(e, ['word-repeated', 'extra-speech', 'word-different'], k).length > 0, othersOf(e, k));

    const donor = donorWords.find((d) => d.v.id !== v.id && d.w.spoken !== v.words[k].spoken && d.w.spoken[0] !== v.words[k].spoken[0])!;
    const dW = rel(nahum, donor.v.id), dx = seg(nahum, audioN, donor.v.id);
    e = await run(v, concat(cut(x, 0, a), cut(dx, dW[donor.i].startMs, dW[donor.i + 1]?.startMs ?? dW[donor.i].endMs), cut(x, b, 1e9)));
    if (e.words[k].wordScore !== null) raw.substitutedWordScores.push(+e.words[k].wordScore!.toFixed(3));
    tally('substituted word', hits(e, ['word-different', 'word-missing'], k).some((m) => m.wordIndex === k), hits(e, ['word-different', 'word-missing', 'extra-speech'], k).length > 0, othersOf(e, k));

    const g = v.groups.findIndex((gr) => gr.words.includes(k));
    const ga = W[v.groups[g].words[0]].startMs, gb = W[v.groups[g].words.at(-1)! + 1]?.startMs ?? W.at(-1)!.endMs;
    e = await run(v, concat(cut(x, 0, ga), pitchShift(cut(x, ga, gb), SR, 4), cut(x, gb, 1e9)));
    const mel = e.errors.filter((m) => m.kind === 'melody');
    const shifted = e.phrases.find((ph) => ph.words.includes(k));
    if (shifted?.deviation != null && shifted.coverage >= 0.5) raw.shiftedPhraseDevs.push(shifted.deviation);
    tally('melody +4 st on one phrase', mel.some((m) => v.groups[g].words.includes(m.wordIndex!)), mel.length > 0, e.errors.filter((m) => m.category === 'words').length);
  }
  console.log('spliced errors', det);
  if (only === 'spliced') return;

  // 3. Lesson check: imitation of the same phrase by another reader should pass; a different phrase should not.
  const lessonRaw: { same: (number | null)[]; different: (number | null)[] }[] = [];
  const lesson = { same: { n: 0, pass: 0, inconclusive: 0 }, different: { n: 0, pass: 0, inconclusive: 0 }, devSame: [] as number[], devDiff: [] as number[] };
  for (const [n, v] of good.entries()) {
    if (n % 4 !== 1) continue;
    const g = v.groups.find((gr) => gr.words.length >= 2) ?? v.groups[0];
    const span = (r: Ref, a: Record<number, Float32Array>, vv: VerseData, gr: { words: number[] }) => {
      const W = rel(r, vv.id);
      return cut(seg(r, a, vv.id), W[gr.words[0]].startMs, W[gr.words.at(-1)!].endMs);
    };
    const refSeg = span(asael, audioA, v, g);
    const spoken = g.words.map((i) => v.words[i].spoken);
    const sameStu = span(nahum, audioN, v, g);
    const same = checkLesson(sameStu, refSeg, SR, defaultSettings().lessonMaxDeviation, await ctcLogProbs(model, sameStu), spoken);
    const ov = good[(n + 7) % good.length], og = ov.groups.find((gr) => gr.words.length >= 2) ?? ov.groups[0];
    const diffStu = span(nahum, audioN, ov, og);
    const diff = checkLesson(diffStu, refSeg, SR, defaultSettings().lessonMaxDeviation, await ctcLogProbs(model, diffStu), spoken);
    for (const [k, r] of [['same', same], ['different', diff]] as const) {
      lesson[k].n++;
      if (r.status === 'passed') lesson[k].pass++;
      if (r.status === 'inconclusive') lesson[k].inconclusive++;
    }
    if (same.deviation !== null) lesson.devSame.push(+same.deviation.toFixed(2));
    if (diff.deviation !== null) lesson.devDiff.push(+diff.deviation.toFixed(2));
    lessonRaw.push({ same: [same.deviation, same.wordScore], different: [diff.deviation, diff.wordScore] });
  }
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
  writeFileSync(join(ROOT, '.cache', 'lesson-raw.json'), JSON.stringify(lessonRaw));
  if (only === 'lesson') {
    for (const dev of [1.0, 1.25, 1.5]) for (const ws of [0.4, 0.5, 0.6]) {
      const pass = (r: (number | null)[]) => r[0] !== null && r[0] <= dev && (r[1] === null || r[1] >= ws);
      console.log(`lesson rule dev≤${dev} words≥${ws}: same-phrase pass ${lessonRaw.filter((r) => pass(r.same)).length}/${lessonRaw.length}, different-phrase pass ${lessonRaw.filter((r) => pass(r.different)).length}/${lessonRaw.length}`);
    }
    return;
  }
  console.log('lesson check', { same: lesson.same, different: lesson.different, medianDevSame: med(lesson.devSame), medianDevDiff: med(lesson.devDiff) });

  const rate = (v: number[], f: (x: number) => boolean) => +(v.filter(f).length / Math.max(1, v.length)).toFixed(3);
  const wordSweep = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].map((t) => ({ threshold: t, falseAlarmOnCorrectWords: rate(raw.correctWordScores, (x) => x < t), omittedDetected: rate(raw.omittedWordScores, (x) => x < t), substitutedDetected: rate(raw.substitutedWordScores, (x) => x < t) }));
  const melodySweep = [1.5, 2, 2.5, 3].map((t) => ({ threshold: t, falseAlarmOnCorrectPhrases: rate(raw.correctPhraseDevs, (x) => x > t), shiftedDetected: rate(raw.shiftedPhraseDevs, (x) => x > t) }));
  console.log('word threshold sweep', wordSweep, '\nmelody threshold sweep', melodySweep);
  writeFileSync(join(ROOT, '.cache', 'validation-raw.json'), JSON.stringify(raw));
  const report = {
    createdAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    note: 'Students are a second adult reader (Nahum) and edits of his real audio. Not a labelled student corpus.',
    correctReadings: {
      verses: fa.verses,
      words: fa.words,
      falseWordErrorRate: +(fa.wordErrors / fa.words).toFixed(4),
      falseWordErrorsShownToStudent: fa.conf06Words,
      falseExtraSpeechPerVerse: +(fa.extra / fa.verses).toFixed(3),
      falseMelodyErrorRatePerPhrase: +(fa.melodyErrors / fa.melodyGroups).toFixed(4),
      falsePausePerVerse: +(fa.pauseErrors / fa.verses).toFixed(3),
      medianWordsScore: med(fa.scores.words),
      medianCantillationScore: med(fa.scores.cantillation),
    },
    splicedErrors: Object.fromEntries(Object.entries(det).map(([k, d]) => [k, { cases: d.n, detectedAtWord: +(d.hit / d.n).toFixed(3), detectedNearby: +(d.nearHit / d.n).toFixed(3), otherWordFalseAlarmsPerCase: +(d.otherWordErrors / d.n).toFixed(2) }])),
    thresholdSweeps: { words: wordSweep, melody: melodySweep },
    lessonCheck: { samePhrasePassRate: +(lesson.same.pass / lesson.same.n).toFixed(3), differentPhrasePassRate: +(lesson.different.pass / lesson.different.n).toFixed(3), medianDeviationSame: med(lesson.devSame), medianDeviationDifferent: med(lesson.devDiff), cases: lesson.same.n },
  };
  writeFileSync(join(ROOT, 'docs', 'data', 'analyzer-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main();
