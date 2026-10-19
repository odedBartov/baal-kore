// Build-time runner for the Omnilingual CTC model (onnxruntime-node). The app runs the same model through
// onnxruntime-android; both reduce the logits with src/app/analysis/ctc.ts.
import * as ort from 'onnxruntime-node';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { columnTokenIds, K, reduceLogits } from '../../src/app/analysis/ctc';

export const MODEL_DIR = join(import.meta.dirname, '..', '..', '.cache', 'models', 'omnilingual-ctc-300m');

export interface CtcModel {
  session: ort.InferenceSession;
  cols: Int32Array[];
}

export async function loadCtcModel(): Promise<CtcModel> {
  const path = join(MODEL_DIR, 'model.int8.onnx');
  if (!existsSync(path)) throw new Error(`missing ${path}: run \`npm run fetch-model\``);
  return { session: await ort.InferenceSession.create(path), cols: columnTokenIds(readFileSync(join(MODEL_DIR, 'tokens.txt'), 'utf8')) };
}

const STRIDE = 320, RF = 400; // samples per frame, receptive field (16 kHz)
const frames = (n: number) => (n < RF ? 0 : Math.floor((n - RF) / STRIDE) + 1);

/** Waveform normalised per window, as the wav2vec2 feature extractor does. */
async function runWindow(m: CtcModel, x: Float32Array): Promise<{ lp: Float32Array; T: number }> {
  let mean = 0;
  for (const v of x) mean += v;
  mean /= x.length;
  let sd = 0;
  for (const v of x) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / x.length) + 1e-7;
  const xn = Float32Array.from(x, (v) => (v - mean) / sd);
  const out = await m.session.run({ x: new ort.Tensor('float32', xn, [1, xn.length]) });
  const [, T, V] = out.logits.dims as number[];
  return { lp: reduceLogits(out.logits.data as Float32Array, T, V, m.cols), T };
}

/** Silence added around the audio before inference (the model recognises clipped edges badly); removed after. */
export const PAD_FRAMES = 20; // 0.4 s

/**
 * Reduced log-probs (T×K, 20 ms frames) for audio of any length. The model accepts ≤ 40 s, so long audio
 * runs in 30 s windows with 2 s of context on each side; each window keeps only the frames it owns.
 */
export async function ctcLogProbs(m: CtcModel, audio16k: Float32Array): Promise<{ lp: Float32Array; T: number }> {
  const x16k = new Float32Array(audio16k.length + 2 * PAD_FRAMES * STRIDE);
  x16k.set(audio16k, PAD_FRAMES * STRIDE);
  const T = frames(x16k.length);
  const OWN = 1500, CTX = 100; // frames: 30 s owned, 2 s context
  const lp = new Float32Array(T * K);
  for (let own0 = 0; own0 < T; own0 += OWN) {
    const own1 = Math.min(T, own0 + OWN);
    const f0 = Math.max(0, own0 - CTX), f1 = Math.min(T, own1 + CTX);
    const w = await runWindow(m, x16k.subarray(f0 * STRIDE, (f1 - 1) * STRIDE + RF));
    for (let g = own0; g < own1; g++) {
      const f = g - f0;
      if (f < w.T) lp.set(w.lp.subarray(f * K, (f + 1) * K), g * K);
    }
  }
  const keep = frames(audio16k.length);
  return { lp: lp.slice(PAD_FRAMES * K, (PAD_FRAMES + keep) * K), T: keep };
}
