// Accuracy on REAL human voices (corpora from scripts/fetch-test-audio.mjs). Results are printed so the
// numbers in docs/phase3-audio-spike.md can be reproduced; thresholds sit just under the measured values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arctic, cantillation, countPitch, hasCorpora, pitchScores, SR, sumCounts, vocadito } from './corpus';
import { detectPitch, type PitchFrame } from '../src/app/audio/pitch';
import { mfcc } from '../src/app/audio/mfcc';
import { compareContours, dtw } from '../src/app/audio/align';
import { resample } from '../src/app/audio/wav';

const skip = !hasCorpora && 'corpora missing: run `npm run fetch-test-audio`';
const pct = (x: number) => (100 * x).toFixed(1) + '%';

// Odd ids were used to tune DEFAULT_PITCH_OPTIONS; only the held-out even ids are asserted here.
const HELD_OUT = Array.from({ length: 20 }, (_, i) => 2 * (i + 1));

test('pitch tracking on held-out sung vocadito excerpts (musician-annotated f0)', { skip }, () => {
  const s = pitchScores(sumCounts(HELD_OUT.map((id) => {
    const v = vocadito(id);
    return countPitch(detectPitch(v.audio.samples, SR).map((p) => p.frequencyHz), 10, v.times, v.hz);
  })));
  console.log('vocadito held-out:', Object.entries(s).map(([k, x]) => `${k}=${pct(x)}`).join(' '));
  assert.ok(s.rawPitchAccuracy >= 0.9);
  assert.ok(s.voicingRecall >= 0.93);
  assert.ok(s.voicingFalseAlarm <= 0.15);
  assert.ok(s.octaveErrors <= 0.02);
});

test('DTW aligns the same sentence across speakers better than linear stretching (CMU ARCTIC phone labels)', { skip }, () => {
  for (const [x, y] of [['bdl', 'rms'], ['bdl', 'slt'], ['rms', 'slt']]) {
    const dtwErr: number[] = [], linErr: number[] = [];
    for (let u = 1; u <= 20; u++) {
      const A = arctic(x, u), B = arctic(y, u);
      assert.equal(A.phones.map((p) => p.phone).join(), B.phones.map((p) => p.phone).join());
      const { aToB } = dtw(mfcc(A.audio.samples, SR), mfcc(B.audio.samples, SR));
      const ratio = B.audio.samples.length / A.audio.samples.length;
      for (let k = 0; k < A.phones.length - 1; k++) {
        const ta = A.phones[k].end, tb = B.phones[k].end;
        dtwErr.push(Math.abs(aToB[Math.min(aToB.length - 1, Math.round(ta * 100))] / 100 - tb));
        linErr.push(Math.abs(ta * ratio - tb));
      }
    }
    const within = (e: number[], s: number) => e.filter((v) => v <= s).length / e.length;
    const median = (e: number[]) => [...e].sort((a, b) => a - b)[e.length >> 1];
    console.log(`${x}→${y}: ${dtwErr.length} phone boundaries | dtw median ${(median(dtwErr) * 1000).toFixed(0)} ms, ≤50 ms ${pct(within(dtwErr, 0.05))}, ≤100 ms ${pct(within(dtwErr, 0.1))} | linear median ${(median(linErr) * 1000).toFixed(0)} ms, ≤50 ms ${pct(within(linErr, 0.05))}`);
    assert.ok(median(dtwErr) <= 0.04);
    assert.ok(within(dtwErr, 0.05) > within(linErr, 0.05));
  }
});

test('a transposed, faster rendition of the same real melody matches; a different melody does not', { skip }, () => {
  // Resampling a real recording raises pitch AND tempo together (k = +2 semitones, 12% faster) — a stand-in
  // for a student singing higher and faster. The comparison must recover the offset and call the melody equal.
  const k = 2 ** (2 / 12);
  for (const id of [2, 4, 6, 8, 10]) {
    const ref = vocadito(id).audio.samples;
    const student = resample(ref, SR, SR / k);
    const other = vocadito(id + 10).audio.samples;
    const pr = detectPitch(ref, SR), fr = mfcc(ref, SR);
    const same = compareContours(pr, detectPitch(student, SR), dtw(fr, mfcc(student, SR)).aToB);
    const diff = compareContours(pr, detectPitch(other, SR), dtw(fr, mfcc(other, SR)).aToB);
    console.log(`vocadito_${id}: same melody offset ${same.offsetSemitones!.toFixed(2)} st, dev ${same.medianDeviationSemitones!.toFixed(2)} st, within 1 st ${pct(same.within1Semitone!)} | other melody dev ${diff.medianDeviationSemitones!.toFixed(2)} st, within 1 st ${pct(diff.within1Semitone!)}`);
    assert.ok(Math.abs(same.offsetSemitones! - 2) < 0.3);
    assert.ok(same.within1Semitone! >= 0.85);
    assert.ok(same.within1Semitone! > diff.within1Semitone! + 0.25);
  }
});

test('real Torah cantillation by two readers (Gen 1:1-8): phrase pauses align, and same verses beat different verses', { skip }, async () => {
  const load = async (part: '0a-Kohen' | '0b-Levi', reader: 'Asael Ashkenaz' | 'Nahum') => {
    const x = (await cantillation(part, reader)).samples;
    return { f: detectPitch(x, SR), m: mfcc(x, SR) };
  };
  const asael = { a: await load('0a-Kohen', 'Asael Ashkenaz'), b: await load('0b-Levi', 'Asael Ashkenaz') };
  const nahum = { a: await load('0a-Kohen', 'Nahum'), b: await load('0b-Levi', 'Nahum') };
  // Pauses (≥ 250 ms unvoiced) sit where the te'amim put them, so a correct alignment maps pauses onto pauses.
  const pauses = (f: PitchFrame[]) => {
    const out: number[] = [];
    const first = f.findIndex((p) => p.voiced), last = f.findLastIndex((p) => p.voiced);
    for (let i = first, s = -1; i <= last; i++) {
      if (!f[i].voiced) s = s < 0 ? i : s;
      else (s >= 0 && i - s >= 25 && out.push((s + i) / 2), (s = -1));
    }
    return out;
  };
  for (const part of ['a', 'b'] as const) {
    const A = asael[part], B = nahum[part], other = nahum[part === 'a' ? 'b' : 'a'];
    const { aToB } = dtw(A.m, B.m);
    const pA = pauses(A.f), pB = pauses(B.f);
    const nearest = (j: number) => Math.min(...pB.map((k) => Math.abs(j - k))) * 10; // ms
    const span = (f: PitchFrame[]) => [f.findIndex((p) => p.voiced), f.findLastIndex((p) => p.voiced)];
    const [sA, eA] = span(A.f), [sB, eB] = span(B.f);
    const dtwErr = pA.map((i) => nearest(aToB[Math.round(i)])).sort((x, y) => x - y);
    const linErr = pA.map((i) => nearest(sB + ((i - sA) * (eB - sB)) / (eA - sA))).sort((x, y) => x - y);
    const same = compareContours(A.f, B.f, aToB);
    const diff = compareContours(A.f, other.f, dtw(A.m, other.m).aToB);
    console.log(`Gen 1 part ${part}, Asael→Nahum: pause error median dtw ${dtwErr[dtwErr.length >> 1].toFixed(0)} ms vs linear ${linErr[linErr.length >> 1].toFixed(0)} ms | same verses dev ${same.medianDeviationSemitones!.toFixed(2)} st, within 1 st ${pct(same.within1Semitone!)} | other verses dev ${diff.medianDeviationSemitones!.toFixed(2)} st, within 1 st ${pct(diff.within1Semitone!)}`);
    assert.ok(dtwErr[dtwErr.length >> 1] < 100 && dtwErr[dtwErr.length >> 1] < linErr[linErr.length >> 1] / 2);
    assert.ok(same.within1Semitone! > diff.within1Semitone! + 0.1);
  }
});
