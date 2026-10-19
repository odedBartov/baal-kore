// Desktop timing of the analysis pipeline on real singing. The same stages are timed on-device by the
// spike screen (analysis.worker.ts) — the device numbers are the ones that matter.
import { vocadito, SR } from './corpus';
import { detectPitch } from '../src/app/audio/pitch';
import { mfcc } from '../src/app/audio/mfcc';
import { dtw } from '../src/app/audio/align';

const full = vocadito(1).audio.samples; // 33 s of solo singing
const time = <T>(f: () => T): [T, number] => {
  const t = performance.now();
  return [f(), performance.now() - t];
};

for (const secs of [5, 10, 20, 30]) {
  const x = full.subarray(0, secs * SR), y = full.subarray(SR, (secs + 1) * SR);
  detectPitch(x.subarray(0, SR), SR); // warm-up JIT
  const [, pitchMs] = time(() => detectPitch(x, SR));
  const [fx, mfccMs] = time(() => mfcc(x, SR));
  const fy = mfcc(y, SR);
  const [, dtwMs] = time(() => dtw(fx, fy));
  const total = pitchMs * 2 + mfccMs * 2 + dtwMs; // reference + student
  console.log(`${secs}s vs ${secs}s: pitch ${pitchMs.toFixed(0)} ms, mfcc ${mfccMs.toFixed(0)} ms, dtw ${dtwMs.toFixed(0)} ms (${((fx.n * fy.n * 5) / 1e6).toFixed(1)} MB) → full comparison ${total.toFixed(0)} ms, RTF ${(total / 1000 / secs).toFixed(3)}`);
}
