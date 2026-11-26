// Pre-aligns Asael Israeli's Wikimedia Commons Ogg recordings for one or more Parashot
// and writes `reference-timings/<portionId>.json` (which the app fetches from GitHub so users get
// instant 0-second alignment without waiting for on-device CTC alignment).
//
// Usage:
//   npx tsx scripts/align-portion.ts noach lech-lecha shemot
//   npx tsx scripts/align-portion.ts all

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { alignAliyahRecording, type AlignableVerse, type AlignedVerseTiming } from '../src/app/audio/aliyah-align';
import { resample } from '../src/app/audio/wav';
import { asaelCommonsFileName, asaelCommonsUrl } from '../src/app/torah/asael-catalog';
import type { PortionData, TorahCatalog } from '../src/app/torah/model';
import { ctcLogProbs, loadCtcModel } from './lib/ctc-model';

const ROOT = join(import.meta.dirname, '..');
const CACHE_DIR = join(ROOT, '.cache', 'asael-oga');
const OUT_DIR = join(ROOT, 'reference-timings');
const SR = 16000;

async function downloadOga(portionId: string, aliyah: number): Promise<Uint8Array> {
  const fileName = asaelCommonsFileName(portionId, aliyah);
  const url = asaelCommonsUrl(portionId, aliyah);
  if (!fileName || !url) throw new Error(`No Asael recording mapped for ${portionId} aliyah ${aliyah}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  const safeName = `${portionId}-aliyah-${aliyah}.oga`;
  const cachedPath = join(CACHE_DIR, safeName);
  if (existsSync(cachedPath)) {
    return new Uint8Array(readFileSync(cachedPath));
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BaalKoreTorahTutor/1.0 (https://github.com/odedBartov/baal-kore)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  writeFileSync(cachedPath, buf);
  return buf;
}

async function decodeOgaTo16k(buf: Uint8Array): Promise<Float32Array> {
  const dec = new OggVorbisDecoder();
  await dec.ready;
  const { channelData, sampleRate } = await dec.decodeFile(buf);
  dec.free();
  const mono = new Float32Array(channelData[0].length);
  for (const ch of channelData) {
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channelData.length;
  }
  return resample(mono, sampleRate, SR);
}

async function alignPortion(portionId: string, model: Awaited<ReturnType<typeof loadCtcModel>>): Promise<void> {
  const outPath = join(OUT_DIR, `${portionId}.json`);
  const portionPath = join(ROOT, 'src', 'assets', 'portions', `${portionId}.json`);
  const portion: PortionData = JSON.parse(readFileSync(portionPath, 'utf8'));
  const alignableVerses: AlignableVerse[] = portion.verses.map((v) => ({
    id: v.id,
    aliyah: v.aliyah,
    words: v.words.map((w) => ({ spoken: w.spoken, syllables: Math.max(1, typeof w.syllables === 'number' ? w.syllables : 2) })),
  }));

  const versesMap: Record<string, AlignedVerseTiming> = {};
  for (let aliyah = 1; aliyah <= 7; aliyah++) {
    const t0 = Date.now();
    const ogaBuf = await downloadOga(portionId, aliyah);
    const x = await decodeOgaTo16k(ogaBuf);
    const ctc = await ctcLogProbs(model, x);
    const aligned = alignAliyahRecording(x, ctc, alignableVerses, aliyah);
    Object.assign(versesMap, aligned);
    const count = Object.keys(aligned).length;
    const meanCer =
      Object.values(aligned).reduce((s, v) => s + v.cer, 0) / Math.max(1, count);
    console.log(
      `  [${portionId} aliyah ${aliyah}] ${count} verses aligned in ${((Date.now() - t0) / 1000).toFixed(1)}s (mean CER: ${meanCer.toFixed(3)})`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        portionId,
        reader: 'Asael',
        license: 'CC BY-SA 3.0',
        updatedAt: new Date().toISOString(),
        verses: versesMap,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`✓ Saved ${outPath} (${Object.keys(versesMap).length}/${portion.verses.length} verses)`);
}

async function main() {
  const catalog: TorahCatalog = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'torah-catalog.json'), 'utf8'));
  const args = process.argv.slice(2);
  const targets =
    args.includes('all')
      ? catalog.portions.map((p) => p.id).filter((id) => id !== 'bereshit')
      : args.length
        ? args
        : ['noach'];

  const model = await loadCtcModel();
  for (const pid of targets) {
    console.log(`=== Aligning Parashat ${pid} ===`);
    await alignPortion(pid, model);
  }
}

main();
