// Downloads the two on-device models (dev-time only), places them as optional APK assets and writes their metadata:
//   Omnilingual ASR CTC-300M int8 (Meta, Apache-2.0; sherpa-onnx export) — word checks and reference alignment,
//     src/data/ctc-model.json with the token ids the aligner needs;
//   ZIPA-small CR-CTC int8 (anyspeech, CC BY 4.0) — IPA phones for the niqqud check, src/data/phone-model.json.
// Usage: npm run fetch-model
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { columnTokenIds } from '../src/app/analysis/ctc';

const REPO = 'csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12';
const ROOT = join(import.meta.dirname, '..');
const DIR = join(ROOT, '.cache', 'models', 'omnilingual-ctc-300m');
const ASSET = join(ROOT, 'App_Resources', 'Android', 'src', 'main', 'assets', 'models', 'omnilingual-ctc-300m.int8.onnx');
const H = { headers: { 'User-Agent': 'torah-tutor-dev/1.0 (build-time model download)' } };

const PHONE_REPO = 'anyspeech/zipa-small-crctc-300k';
const PHONE_DIR = join(ROOT, '.cache', 'models', 'zipa-small');
const PHONE_ASSET = join(ROOT, 'App_Resources', 'Android', 'src', 'main', 'assets', 'models', 'zipa-small.int8.onnx');

async function download(repo: string, dir: string, names: string[]) {
  mkdirSync(dir, { recursive: true });
  const tree: { path: string; size: number; lfs?: { size: number; oid: string } }[] = await (await fetch(`https://huggingface.co/api/models/${repo}/tree/main`, H)).json();
  for (const name of names) {
    const meta = tree.find((f) => f.path === name)!;
    const dest = join(dir, name);
    const want = meta.lfs?.size ?? meta.size;
    if (!existsSync(dest) || statSync(dest).size !== want) {
      const r = await fetch(`https://huggingface.co/${repo}/resolve/main/${name}`, H);
      if (!r.ok) throw new Error(`${r.status} ${name}`);
      await pipeline(Readable.fromWeb(r.body as never), createWriteStream(dest));
    }
    if (meta.lfs) {
      const h = createHash('sha256');
      await pipeline(createReadStream(dest), h);
      const got = h.digest('hex');
      if (got !== meta.lfs.oid) throw new Error(`${name}: sha256 ${got} != ${meta.lfs.oid}`);
    }
    console.log(`${repo}/${name} ok`);
  }
}

async function main() {
  await download(REPO, DIR, ['model.int8.onnx', 'tokens.txt', 'LICENSE']);
  await download(PHONE_REPO, PHONE_DIR, ['model.int8.onnx', 'tokens.txt', 'README.md']);
  mkdirSync(join(ASSET, '..'), { recursive: true });
  copyFileSync(join(PHONE_DIR, 'model.int8.onnx'), PHONE_ASSET);
  writeFileSync(
    join(ROOT, 'src', 'data', 'phone-model.json'),
    JSON.stringify({ id: 'zipa-small-crctc-300k-int8', asset: 'models/zipa-small.int8.onnx', license: 'CC BY 4.0', source: `https://huggingface.co/${PHONE_REPO}`, tokens: readFileSync(join(PHONE_DIR, 'tokens.txt'), 'utf8').trim() }, null, 1) + '\n',
  );

  copyFileSync(join(DIR, 'model.int8.onnx'), ASSET);

  // Token ids per reduced column, from the same table the aligner uses (Hebrew letter + Latin aliases).
  const columns = columnTokenIds(readFileSync(join(DIR, 'tokens.txt'), 'utf8')).map((c) => [...c]);
  writeFileSync(
    join(ROOT, 'src', 'data', 'ctc-model.json'),
    JSON.stringify({ id: 'omnilingual-asr-ctc-300m-int8@2025-11-12', asset: 'models/omnilingual-ctc-300m.int8.onnx', license: 'Apache-2.0', source: `https://huggingface.co/${REPO}`, columns }, null, 1) + '\n',
  );
  console.log('model copied into App_Resources and src/data/ctc-model.json written');
}

main();
