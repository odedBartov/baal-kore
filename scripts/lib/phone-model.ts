// Build-time runner for the ZIPA phone model (onnxruntime-node). The app runs the same model through
// onnxruntime-android on the same features (src/app/audio/fbank.ts).
import * as ort from 'onnxruntime-node';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fbank, FBANK_DIM } from '../../src/app/audio/fbank';
import { tokenIndex, type PhoneLogProbs } from '../../src/app/analysis/vowels';

export const PHONE_MODEL_DIR = join(import.meta.dirname, '..', '..', '.cache', 'models', 'zipa-small');

export async function loadPhoneModel() {
  const path = join(PHONE_MODEL_DIR, 'model.int8.onnx');
  if (!existsSync(path)) throw new Error(`missing ${path}: run \`npm run fetch-model\``);
  const tokensTxt = readFileSync(join(PHONE_MODEL_DIR, 'tokens.txt'), 'utf8');
  return { session: await ort.InferenceSession.create(path), idx: tokenIndex(tokensTxt), tokens: tokensTxt.trim().split(/\r?\n/).map((l) => l.split(' ')[0]) };
}
export type PhoneModel = Awaited<ReturnType<typeof loadPhoneModel>>;

export async function phoneLogProbs(m: PhoneModel, audio16k: Float32Array): Promise<PhoneLogProbs> {
  const f = fbank(audio16k);
  const out = await m.session.run({ x: new ort.Tensor('float32', f.data, [1, f.n, FBANK_DIM]), x_lens: new ort.Tensor('int64', BigInt64Array.of(BigInt(f.n)), [1]) });
  const [, T, V] = out.log_probs.dims as number[];
  return { lp: (out.log_probs.data as Float32Array).slice(), T, V };
}

/** Greedy CTC decode, for reading what the model heard. */
export function greedyPhones(m: PhoneModel, o: PhoneLogProbs): string {
  let s = '', prev = -1;
  for (let t = 0; t < o.T; t++) {
    let b = 0;
    for (let k = 1; k < o.V; k++) if (o.lp[t * o.V + k] > o.lp[t * o.V + b]) b = k;
    if (b && b !== prev) s += m.tokens[b];
    prev = b;
  }
  return s.replace(/▁/g, ' ');
}
