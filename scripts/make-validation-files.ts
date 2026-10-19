// Writes 16 kHz WAV validation files (real human readings + spliced errors) for the on-device runner in the
// diagnostics screen. Push them with: adb push … then copy into the app's files/validation folder (docs/validation.md).
// Run: node --import tsx scripts/make-validation-files.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { encodeWav, resample } from '../src/app/audio/wav';
import { pitchShift } from '../src/app/audio/pitch-shift';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, '.cache', 'validation');
const SR = 16000;
const nahum = JSON.parse(readFileSync(join(ROOT, '.cache/reference/nahum.json'), 'utf8'));
const portion = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));

async function main() {
  const d = new OggVorbisDecoder();
  await d.ready;
  const { channelData, sampleRate } = await d.decodeFile(readFileSync(join(ROOT, '.cache/reference/src/Aa Genesis Bereshit-1 Nahum.oga')));
  d.free();
  const x = resample(channelData[0], sampleRate, SR);
  const verse = (id: string) => {
    const v = nahum.verses[id];
    const words: { s: number; e: number }[] = v.words.map(([s, e]: number[]) => ({ s: s - v.startMs, e: e - v.startMs }));
    return { a: x.slice((v.startMs * SR) / 1000, (v.endMs * SR) / 1000), words };
  };
  const ms = (a: Float32Array, from: number, to = Infinity) => a.slice(Math.round((from * SR) / 1000), Math.round((Math.min(to, (a.length / SR) * 1000) * SR) / 1000));
  const cat = (...p: Float32Array[]) => {
    const o = new Float32Array(p.reduce((s, q) => s + q.length, 0));
    let k = 0;
    for (const q of p) o.set(q, k), (k += q.length);
    return o;
  };
  mkdirSync(OUT, { recursive: true });
  const save = (name: string, a: Float32Array) => writeFileSync(join(OUT, name), Buffer.from(encodeWav(a, SR)));

  const v1 = verse('Genesis.1.1'), v3 = verse('Genesis.1.3'), v4 = verse('Genesis.1.4');
  save('Genesis.1.1__nahum-correct.wav', v1.a);
  save('Genesis.1.1__omit-word-3.wav', cat(ms(v1.a, 0, v1.words[2].s), ms(v1.a, v1.words[3].s))); // drops אֱלֹהִ֑ים
  save('Genesis.1.3__nahum-correct.wav', v3.a);
  save('Genesis.1.3__repeat-word-2.wav', cat(ms(v3.a, 0, v3.words[2].s), ms(v3.a, v3.words[1].s, v3.words[2].s), ms(v3.a, v3.words[2].s)));
  const g = portion.verses.find((v: { id: string }) => v.id === 'Genesis.1.4').groups[0].words as number[];
  const ga = v4.words[g[0]].s, gb = v4.words[g[g.length - 1] + 1].s;
  save('Genesis.1.4__melody-plus4-group1.wav', cat(ms(v4.a, 0, ga), pitchShift(ms(v4.a, ga, gb), SR, 4), ms(v4.a, gb)));
  console.log(`validation files written to ${OUT}`);
}

main();
