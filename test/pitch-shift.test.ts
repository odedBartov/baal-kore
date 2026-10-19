// Transposition on a real sung recording must move pitch by the requested interval, keep the duration,
// and keep the melody's shape (spec §6.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasCorpora, SR, vocadito } from './corpus';
import { pitchShift } from '../src/app/audio/pitch-shift';
import { detectPitch, medianVoicedHz } from '../src/app/audio/pitch';

test('pitch shift of real singing: interval, duration and contour preserved', { skip: !hasCorpora && 'run npm run fetch-test-audio' }, () => {
  const x = vocadito(4).audio.samples.subarray(0, SR * 8);
  const ref = detectPitch(x, SR);
  for (const st of [3, -4]) {
    const t0 = performance.now();
    const y = pitchShift(x, SR, st);
    const ms = performance.now() - t0;
    assert.equal(y.length, x.length);
    const shifted = detectPitch(y, SR, { referenceHz: medianVoicedHz(ref)! });
    const ratio = 12 * Math.log2(medianVoicedHz(shifted)! / medianVoicedHz(ref)!);
    // Frame-by-frame: same timing, so compare directly (no alignment needed) after removing the shift.
    let n = 0, ok = 0;
    ref.forEach((p, i) => {
      const q = shifted[i];
      if (p.frequencyHz && q.frequencyHz) (n++, Math.abs(12 * Math.log2(q.frequencyHz / p.frequencyHz) - st) <= 0.5 && ok++);
    });
    console.log(`shift ${st} st: measured ${ratio.toFixed(2)} st, ${((100 * ok) / n).toFixed(1)}% frames within ±0.5 st of target, ${ms.toFixed(0)} ms for 8 s`);
    assert.ok(Math.abs(ratio - st) < 0.25);
    assert.ok(ok / n > 0.85);
  }
});
