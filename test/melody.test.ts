// Phrase melody comparison (analysis/melody.ts): timing and key must not matter; the notes must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMelody, fold } from '../src/app/analysis/melody';

// A chant-like phrase: plateaus and glides, semitones re the reader's median, 10 ms frames (null = consonant/silence).
const phrase = (): (number | null)[] => [
  ...Array(20).fill(0), null, null, ...Array(30).fill(2), ...Array.from({ length: 10 }, (_, i) => 2 - i * 0.4), ...Array(40).fill(-2), null, ...Array(25).fill(-1), ...Array(30).fill(-3),
];
const stretch = (x: (number | null)[], f: (t: number) => number) => {
  const n = Math.round(f(1) * x.length);
  return Array.from({ length: n }, (_, j) => x[Math.min(x.length - 1, Math.floor((j / n) * x.length))]);
};

test('same melody, slower, with a held note longer, and in another key: deviation ≈ 0', () => {
  const ref = phrase();
  const stu = stretch(ref, (t) => 1.35 * t).map((v) => (v === null ? null : v + 5)); // 35% slower, 5 st higher
  const long = [...stu.slice(0, 60), ...Array(25).fill(7), ...stu.slice(60)]; // one held note extended
  const r = compareMelody(ref, long, 5);
  assert.ok(r.deviation! < 0.25, `deviation ${r.deviation}`);
  assert.ok(r.coverage > 0.9);
});

test('one segment sung 3 semitones off is detected', () => {
  const ref = phrase();
  const stu = ref.map((v, i) => (v !== null && i >= 52 && i < 102 ? v + 3 : v));
  const r = compareMelody(ref, stu, 0);
  assert.ok(r.deviation! > 0.6, `deviation ${r.deviation}`); // a third of the phrase is 3 st off → ~0.8 overall
  // and it is localised: the costs are high only over the changed frames (±100 ms of warping at the edges)
  const high = [...r.costs].map((c, k) => (c > 2 ? k : -1)).filter((k) => k >= 0);
  assert.ok(high.length > 0 && high.every((k) => k * 2 >= 42 && k * 2 < 112), JSON.stringify(high));
});

test('octave slips in pitch tracking are not melody errors', () => {
  const ref = phrase();
  const stu = ref.map((v, i) => (v !== null && i % 17 === 0 ? v + 12 : v));
  assert.ok(compareMelody(ref, stu, 0).deviation! < 0.1);
  assert.equal(fold(12.4), 0.40000000000000036);
});

test('a monotone (flat) reading of a moving melody is far off', () => {
  const ref = phrase();
  const flat = ref.map((v) => (v === null ? null : 0));
  assert.ok(compareMelody(ref, flat, 0).deviation! > 1.2);
});
