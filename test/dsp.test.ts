// Unit checks with constructed signals (no corpus needed). Real-voice accuracy lives in the corpus tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeWav, resample } from '../src/app/audio/wav';
import { detectPitch, medianVoicedHz } from '../src/app/audio/pitch';
import { cutPhrase } from '../src/app/teaching/lesson-check';
import { fitRange, runs, smooth } from '../src/app/visualization/chart-lines';

const SR = 16000;
const tone = (hz: number, secs: number, sr = SR) =>
  Float32Array.from({ length: Math.round(secs * sr) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / sr) + 0.15 * Math.sin((4 * Math.PI * hz * i) / sr));

test('decodeWav reads 16-bit mono PCM written like the Android recorder does', () => {
  const pcm = [0, 16384, -16384, 32767, -32768];
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  const out = decodeWav(buf);
  assert.equal(out.sampleRate, SR);
  assert.deepEqual([...out.samples], pcm.map((s) => s / 32768));
});

test('pitch of a harmonic tone is found within 1%', () => {
  for (const hz of [90, 220, 440, 800]) {
    const est = medianVoicedHz(detectPitch(tone(hz, 1), SR))!;
    assert.ok(Math.abs(est / hz - 1) < 0.01, `${hz} Hz → ${est}`);
  }
});

test('silence and white noise produce no musical notes', () => {
  assert.equal(detectPitch(new Float32Array(SR), SR).filter((p) => p.voiced).length, 0);
  let seed = 1;
  const noise = Float32Array.from({ length: SR * 2 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
  const voiced = detectPitch(noise, SR).filter((p) => p.voiced).length;
  assert.ok(voiced === 0, `${voiced} noise frames reported as voiced`);
});

test('a lesson phrase is cut in the dips between words, even when the word timings are off', () => {
  // words: A 0–500 ms, B 560–1200 ms, C 1240–1800 ms; the aligner put B's and C's starts late, as it does on chant
  const x = new Float32Array(Math.round(1.8 * SR));
  const ms = (t: number) => Math.round((t * SR) / 1000);
  for (const [a, b, hz] of [[0, 500, 200], [560, 1200, 250], [1240, 1800, 300]]) x.set(tone(hz, (b - a) / 1000), ms(a));
  const c = cutPhrase(x, SR, [{ startMs: 0 }, { startMs: 600 }, { startMs: 1300 }], 1, 1);
  assert.ok(c.startMs >= 500 && c.startMs <= 560, `start ${c.startMs}`);
  assert.ok(c.endMs >= 1200 && c.endMs <= 1240, `end ${c.endMs}`);
  assert.ok(detectPitch(c.samples, SR).every((p) => !p.frequencyHz || Math.abs(p.frequencyHz / 250 - 1) < 0.02)); // only B is heard
});

test('melody chart: jitter smoothed, consonant gaps bridged, silences and out-of-range notes break the line', () => {
  const note = (st: number, n: number) => Array<number | null>(n).fill(st);
  const p = [...note(0, 20), 9, ...note(0, 10), null, null, null, ...note(2, 20), ...Array(30).fill(null), ...note(-1, 20), 40, ...note(-1, 5)];
  const s = smooth(p);
  assert.ok(Math.abs(s[20]!) < 0.01, 'a one-frame spike is gone');
  const { lo, hi } = fitRange([s]);
  assert.ok(hi - lo >= 8 && lo <= -1 && hi >= 2);
  assert.deepEqual(runs(s, lo, hi).map((x) => x.length), [51, 26]); // 3-frame gap bridged, 300 ms silence splits, spike smoothed away
  assert.deepEqual(runs([0, 0, 0, 40, 40, 40, 0, 0], -4, 4).map((x) => x.length), [3, 2]); // a held out-of-range note splits, never clamped
});

test('resampling 44.1 kHz → 16 kHz keeps the pitch', () => {
  const est = medianVoicedHz(detectPitch(resample(tone(330, 1, 44100), 44100, SR), SR))!;
  assert.ok(Math.abs(est / 330 - 1) < 0.01, `330 Hz → ${est}`);
});
