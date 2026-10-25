// Scoring-engine behaviour (spec §9, §20.4). Corpus-level accuracy lives in scripts/validate-analyzers.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, type EvalInput } from '../src/app/analysis/evaluate';
import { compareLetters } from '../src/app/analysis/letters';
import { BLANK, K, OTHER, reduceLogits } from '../src/app/analysis/ctc';
import { ANALYZERS } from '../src/app/analysis/registry';
import { arctic, cantillation, hasCorpora, SR } from './corpus';
import type { PortionData } from '../src/app/torah/model';

const ROOT = join(import.meta.dirname, '..');
const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));
const v11 = portion.verses[0];
const base = (student: Float32Array, reference: Float32Array | null): EvalInput => ({
  verseId: v11.id,
  words: v11.words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary })),
  groups: v11.groups,
  student,
  reference,
  referenceWords: reference ? v11.words.map((_, i) => ({ startMs: i * 600, endMs: i * 600 + 550 })) : null,
  referenceApproval: 'pending',
  ctc: null,
  passingThreshold: 85,
});

test('reduced CTC columns keep the full-vocabulary argmax, even when "other" mass is spread thin', () => {
  const V = 9812, T = 50, cols = Array.from({ length: OTHER }, (_, k) => Int32Array.of(k * 7 + 3));
  const logits = new Float32Array(T * V);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < T; t++) {
    for (let v = 0; v < V; v++) logits[t * V + v] = rnd() * 2; // thousands of weak alternatives
    logits[t * V + cols[t % OTHER][0]] = 4; // one kept column is the real winner
  }
  const lp = reduceLogits(logits, T, V, cols);
  for (let t = 0; t < T; t++) {
    let best = 0;
    for (let k = 1; k < K; k++) if (lp[t * K + k] > lp[t * K + best]) best = k;
    assert.equal(best, t % OTHER, `frame ${t}`);
  }
  assert.ok(BLANK === 0);
});

test('letter comparison tolerates plene spelling and merged sounds, not a different word', () => {
  // What the model heard for Gen 1:1 sung by a real reader (Phase 3 probe) vs. the text.
  const heard = 'ברשית ברה אלהים את השמיים ואת הארץ';
  const r = compareLetters(heard, ['בראשית', 'ברא', 'אלהים', 'את', 'השמים', 'ואת', 'הארץ']);
  assert.ok(r.wordScore.every((s) => s >= 0.65), JSON.stringify(r.wordScore));
  const missing = compareLetters('בראשית אלהים את השמים ואת הארץ', ['בראשית', 'ברא', 'אלהים', 'את', 'השמים', 'ואת', 'הארץ']);
  assert.ok(missing.wordScore[1] < 0.35);
  const extra = compareLetters('בראשית ברא ברא אלהים', ['בראשית', 'ברא', 'אלהים']);
  assert.ok(extra.gaps.join('').length >= 3);
});

test('silence is never scored: inconclusive with an actionable reason', () => {
  const sil = evaluate(base(new Float32Array(SR * 5), new Float32Array(SR * 5).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 200 * i) / SR))));
  assert.equal(sil.evaluation.status, 'inconclusive');
  assert.equal(sil.evaluation.inconclusiveReason, 'audio-quality');
  assert.equal(sil.evaluation.overallScore, null);
  assert.ok(sil.evaluation.qualityIssues.length > 0);
  assert.ok(sil.evaluation.categories.every((c) => c.score === null));





});

test('overallScore is computed from available categories and passingThreshold controls pass/fail', () => {
  const synth = new Float32Array(SR * 5).map((_, i) => 0.3 * Math.sin((2 * Math.PI * (200 + 20 * Math.sin(i / 800)) * i) / SR));
  const pass = evaluate({ ...base(synth, synth), passingThreshold: 80 });
  assert.equal(pass.evaluation.overallScore, 100);
  assert.equal(pass.evaluation.status, 'passed');
  const shifted = new Float32Array(SR * 5).map((_, i) => 0.3 * Math.sin((2 * Math.PI * (200 + (i < SR * 2 ? 40 : 20) * Math.sin(i / 800)) * i) / SR));
  const high = evaluate({ ...base(shifted, synth), passingThreshold: 100 });
  const low = evaluate({ ...base(shifted, synth), passingThreshold: 50 });
  assert.ok(high.evaluation.overallScore !== null && high.evaluation.overallScore < 100);
  assert.equal(high.evaluation.status, 'failed');
  assert.equal(low.evaluation.status, 'passed');
});

test('available experimental analyzers still produce overallScore while missing models report unavailable', { skip: !hasCorpora && 'run npm run fetch-test-audio' }, async () => {
  const x = (await cantillation('0a-Kohen', 'Asael')).samples.subarray(0, SR * 8);
  const res = evaluate(base(x, x));

  assert.equal(res.evaluation.inconclusiveReason, undefined);
  assert.equal(res.evaluation.status, 'passed');
  assert.equal(res.evaluation.overallScore, 100);



  const words = res.evaluation.categories.find((c) => c.category === 'words')!;
  const niqqud = res.evaluation.categories.find((c) => c.category === 'niqqud')!;
  assert.equal(words.maturity, 'unavailable'); // no CTC input given → reported unavailable, not zero
  assert.equal(words.score, null);

  assert.equal(niqqud.score, null);
  assert.ok(!Object.values(ANALYZERS).some((a) => a.maturity === 'validated'), 'flip only after docs/validation.md');
});

test('a verse said like a sentence (real read speech) is flagged as not chanted; the chant itself is not', { skip: !hasCorpora && 'run npm run fetch-test-audio' }, async () => {
  const chant = (await cantillation('0a-Kohen', 'Asael')).samples.subarray(0, SR * 4.2);
  const parts = [1, 2, 3].map((n) => arctic('bdl', n).audio.samples);
  const speech = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  parts.reduce((o, p) => (speech.set(p, o), o + p.length), 0);
  const kinds = (x: Float32Array) => evaluate(base(x, chant)).evaluation.errors.map((e) => e.kind);
  assert.ok(kinds(speech).includes('not-chanted'));
  assert.ok(!kinds(chant).includes('not-chanted'));
});

const modelPath = join(ROOT, '.cache/models/omnilingual-ctc-300m/model.int8.onnx');
const refPath = join(ROOT, 'src/data/reference-asael-israeli.json');
test('a reader compared with his own recording gets no word or melody errors (CTC on)', { skip: (!existsSync(modelPath) || !existsSync(refPath) || !hasCorpora) && 'needs npm run fetch-model, align-reference, fetch-test-audio' }, async () => {
  const { loadCtcModel, ctcLogProbs } = await import('../scripts/lib/ctc-model');
  const ref = JSON.parse(readFileSync(refPath, 'utf8'));
  const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis');
  const { resample } = await import('../src/app/audio/wav');
  const d = new OggVorbisDecoder();
  await d.ready;
  const { channelData, sampleRate } = await d.decodeFile(readFileSync(join(ROOT, 'src', ref.files[0].path)));
  d.free();
  const all = resample(channelData[0], sampleRate, SR);
  const model = await loadCtcModel();
  for (const id of ['Genesis.1.1', 'Genesis.1.3']) {
    const v = portion.verses.find((x) => x.id === id)!, r = ref.verses[id];
    const x = all.slice((r.startMs * SR) / 1000, (r.endMs * SR) / 1000);
    const out = evaluate({
      ...base(x, x),
      verseId: id,
      words: v.words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary })),
      groups: v.groups,
      referenceWords: r.words.map(([s, e]: number[]) => ({ startMs: s - r.startMs, endMs: e - r.startMs })),
      ctc: await ctcLogProbs(model, x),
    }).evaluation;
    console.log(id, JSON.stringify(out.categories.map((c) => [c.category, c.score])), JSON.stringify(out.errors.map((e) => [e.kind, e.wordIndex, e.confidence])), JSON.stringify(out.words.map((w) => w.wordScore)));
    const serious = out.errors.filter((e) => e.category !== 'pause');
    assert.deepEqual(serious, [], `${id}: ${JSON.stringify(serious)}`);
    assert.ok(out.categories.find((c) => c.category === 'words')!.score! >= 85);
    assert.ok(out.categories.find((c) => c.category === 'cantillation')!.score! >= 95);
  }
});
