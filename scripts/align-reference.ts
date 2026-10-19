// Reference-reading pipeline: downloads human Torah readings of Parashat Bereshit (Wikimedia Commons),
// force-aligns the known text to find verse and word timings, and writes src/data/reference-<reader>.json.
// The bundled reader's original files are copied unmodified to src/assets/reference/<reader>/.
// Every timing is machine-made and marked approvalStatus "pending" until a qualified reader reviews it.
// Run: npm run align-reference   (needs the model: npm run fetch-model)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { buildTarget, CTC_MODEL_ID, FRAME_MS, forcedAlign, greedyDecode, K } from '../src/app/analysis/ctc';
import { compareLetters } from '../src/app/analysis/letters';
import { detectPitch, percentile } from '../src/app/audio/pitch';
import { resample } from '../src/app/audio/wav';
import { mfcc } from '../src/app/audio/mfcc';
import { dtw } from '../src/app/audio/align';
import type { PortionData } from '../src/app/torah/model';
import { ctcLogProbs, loadCtcModel } from './lib/ctc-model';

const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache', 'reference');
const SR = 16000;

// Verse range of each recorded file. These recordings split aliyot 5/6 after 4:26 (verified by transcribing the
// start and end of every file), not after 4:22 as in Sefaria's aliyah list, so files are not matched by number.
const FILE_RANGES: [string, string][] = [
  ['Genesis.1.1', 'Genesis.2.3'], ['Genesis.2.4', 'Genesis.2.19'], ['Genesis.2.20', 'Genesis.3.21'], ['Genesis.3.22', 'Genesis.4.18'],
  ['Genesis.4.19', 'Genesis.4.26'], ['Genesis.5.1', 'Genesis.5.24'], ['Genesis.5.25', 'Genesis.6.8'],
];

/** Letter error rate that ignores what the model cannot hear (plene spelling, merged sounds). */
function tolerantErrorRate(heard: string, words: string[]): number {
  const c = compareLetters(heard, words);
  const letters = words.join('').length;
  return (c.wordCost.reduce((a, b) => a + b, 0) + 0.5 * c.gaps.join('').length) / letters;
}

interface Reader {
  id: string;
  name: string;
  pronunciation: 'israeli' | 'ashkenazi';
  commonsName: (aliyah: number) => string;
  license: string;
  bundle: boolean;
}
const READERS: Reader[] = [
  { id: 'asael-israeli', name: 'Asael', pronunciation: 'israeli', commonsName: (n) => `Aa Genesis Bereshit-${n} Asael.oga`, license: 'CC BY-SA 3.0', bundle: true },
  { id: 'nahum', name: 'Nahum', pronunciation: 'ashkenazi', commonsName: (n) => `Aa Genesis Bereshit-${n} Nahum.oga`, license: 'CC BY 2.5', bundle: false },
  // Same reader as the bundled reference, separate session, Ashkenazi pronunciation: the same melodies sung again —
  // the closest stand-in for a student who imitates the reference well (validation only).
  { id: 'asael-ashkenazi', name: 'Asael (Ashkenazi pronunciation)', pronunciation: 'ashkenazi', commonsName: (n) => `Aa Genesis Bereshit-${n} Asael Ashkenaz.oga`, license: 'CC BY-SA 3.0', bundle: false },
];

const UA = 'torah-tutor-dev/1.0 (offline Torah-reading tutor POC; build-time reference audio)';
function download(name: string): string {
  const dest = join(CACHE, 'src', name);
  if (!existsSync(dest)) {
    mkdirSync(join(CACHE, 'src'), { recursive: true });
    execFileSync('curl', ['-fsSL', '--retry', '6', '--retry-delay', '10', '-A', UA, '-o', dest, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`]);
  }
  return dest;
}

async function decode(path: string): Promise<{ x: Float32Array; sourceRate: number; durationMs: number }> {
  const dec = new OggVorbisDecoder();
  await dec.ready;
  const { channelData, sampleRate } = await dec.decodeFile(readFileSync(path));
  dec.free();
  const mono = new Float32Array(channelData[0].length);
  for (const ch of channelData) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channelData.length;
  return { x: resample(mono, sampleRate, SR), sourceRate: sampleRate, durationMs: (mono.length / sampleRate) * 1000 };
}

interface VerseTiming {
  file: number;
  startMs: number;
  endMs: number;
  words: [number, number, number][]; // [startMs, endMs, confidence] in file time, one per verse word
  cer: number; // letter error rate of the unconstrained transcription vs. the expected text
  quality: 'good' | 'check';
}

async function alignReader(reader: Reader, portion: PortionData) {
  const model = await loadCtcModel();
  const files: { aliyah: number; path: string; source: string; durationMs: number }[] = [];
  const verses: Record<string, VerseTiming> = {};
  const audio: Record<number, Float32Array> = {};
  const voicedHz: number[] = [];
  for (const [n, [fromId, toId]] of FILE_RANGES.entries()) {
    const al = { n: n + 1 };
    const name = reader.commonsName(al.n);
    const src = download(name);
    const { x, durationMs } = await decode(src);
    audio[al.n] = x;
    const cacheLp = join(CACHE, `${reader.id}-${al.n}.lp`);
    let lp: Float32Array, T: number;
    if (existsSync(cacheLp)) {
      const b = readFileSync(cacheLp);
      lp = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
      T = lp.length / K;
    } else {
      ({ lp, T } = await ctcLogProbs(model, x));
      writeFileSync(cacheLp, Buffer.from(lp.buffer));
    }

    const ids = portion.verses.map((v) => v.id);
    const vs = portion.verses.slice(ids.indexOf(fromId), ids.indexOf(toId) + 1);
    const words = vs.flatMap((v) => v.words.map((w) => w.spoken));
    const spans = forcedAlign(lp, T, buildTarget(words));

    // Word ends: extend past the last letter while the voice continues (melismas belong to the word),
    // never into the next word. Activity = frame level within 25 dB of the loud level.
    const pitch = detectPitch(x, SR);
    for (const p of pitch) if (p.frequencyHz) voicedHz.push(p.frequencyHz);
    const gate = percentile(Float32Array.from(pitch, (p) => p.rmsDb), 0.95) - 25;
    const active = (ms: number) => (pitch[Math.min(pitch.length - 1, Math.round(ms / 10))]?.rmsDb ?? -120) >= gate;
    const startMs = spans.map((s) => s.startFrame * FRAME_MS);
    const endMs = spans.map((s, i) => {
      const limit = i + 1 < spans.length ? startMs[i + 1] : durationMs;
      let e = (s.endFrame + 1) * FRAME_MS, quiet = 0;
      while (e + 10 < limit) {
        quiet = active(e) ? 0 : quiet + 10;
        if (quiet > 80) break;
        e += 10;
      }
      return Math.min(limit, e - quiet);
    });

    const relPath = `assets/reference/${reader.id}/aliyah-${al.n}.oga`;
    files.push({ aliyah: al.n, path: relPath, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, '_'))}`, durationMs: Math.round(durationMs) });
    if (reader.bundle) {
      mkdirSync(join(ROOT, 'src', 'assets', 'reference', reader.id), { recursive: true });
      copyFileSync(src, join(ROOT, 'src', relPath));
    }

    let k = 0;
    vs.forEach((v, vi) => {
      const idx = v.words.map(() => k++);
      const first = idx[0], last = idx[idx.length - 1];
      const prevEnd = vi ? endMs[first - 1] : 0;
      const nextStart = vi + 1 < vs.length ? startMs[last + 1] : durationMs;
      const vStart = Math.max(prevEnd, startMs[first] - 150);
      const vEnd = Math.max(endMs[last], Math.min(nextStart - 20, endMs[last] + 300)); // never cut the last word
      const heard = greedyDecode(lp, T, Math.floor(vStart / FRAME_MS), Math.ceil(vEnd / FRAME_MS));
      const cer = tolerantErrorRate(heard, v.words.map((w) => w.spoken));
      const conf = idx.map((i) => Math.exp(spans[i].score));
      verses[v.id] = {
        file: files.length - 1,
        startMs: Math.round(vStart),
        endMs: Math.round(vEnd),
        words: idx.map((i, j) => [Math.round(startMs[i]), Math.round(endMs[i]), +conf[j].toFixed(3)]),
        cer: +cer.toFixed(3),
        quality: cer > 0.2 || Math.min(...conf) < 0.05 ? 'check' : 'good',
      };
    });
    const meanCer = vs.reduce((s, v) => s + verses[v.id].cer, 0) / vs.length;
    console.log(`${reader.id} file ${al.n} (${fromId}–${toId}): ${vs.length} verses, ${(durationMs / 1000).toFixed(0)} s audio, mean tolerant error ${meanCer.toFixed(3)}`);
    if (meanCer > 0.6) {
      if (reader.bundle) throw new Error(`${name} does not match ${fromId}–${toId}; check FILE_RANGES`);
      // Validation-only reader: a file that does not cover its range is simply unusable.
      console.warn(`  ${name}: does not match ${fromId}–${toId} (partial or different recording); its verses are marked 'check'`);
      for (const v of vs) verses[v.id].quality = 'check';
    }
  }
  voicedHz.sort((a, b) => a - b);
  return { files, verses, audio, medianHz: Math.round(voicedHz[voicedHz.length >> 1]) };
}

async function main() {
  const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'bereshit.json'), 'utf8'));
  const results: Record<string, Awaited<ReturnType<typeof alignReader>>> = {};
  for (const r of READERS) results[r.id] = await alignReader(r, portion);

  for (const r of READERS) {
    const { files, verses, medianHz } = results[r.id];
    const out = {
      schemaVersion: 1,
      id: r.id,
      traditionId: 'ashkenazi-israeli',
      reader: r.name,
      pronunciation: r.pronunciation,
      license: r.license,
      attribution: `${r.name}, Wikimedia Commons, ${r.license}`,
      approvalStatus: 'pending',
      medianHz, // reader's typical chanting pitch, for transposition
      alignment: { method: 'ctc-forced-alignment', model: CTC_MODEL_ID, createdAt: new Date().toISOString(), reviewStatus: 'pending' },
      files,
      verses,
    };
    // Bundled reader → app data; validation readers → cache (used by scripts/validate-analyzers.ts).
    writeFileSync(r.bundle ? join(ROOT, 'src', 'data', `reference-${r.id}.json`) : join(CACHE, `${r.id}.json`), JSON.stringify(out) + '\n');
  }

  // Cross-reader agreement: map Asael's word starts into Nahum's verse via MFCC-DTW (an independent method)
  // and compare with Nahum's own CTC word starts. Agreement means both alignments find the same words.
  const a = results['asael-israeli'], b = results['nahum'];
  const fileOf = (id: string) => FILE_RANGES.findIndex(([f, t]) => portion.verses.findIndex((v) => v.id === f) <= portion.verses.findIndex((v) => v.id === id) && portion.verses.findIndex((v) => v.id === id) <= portion.verses.findIndex((v) => v.id === t)) + 1;
  const diffs: number[] = [];
  for (const v of portion.verses) {
    const va = a.verses[v.id], vb = b.verses[v.id];
    if (va.quality !== 'good' || vb.quality !== 'good') continue;
    const xa = a.audio[fileOf(v.id)].subarray((va.startMs * SR) / 1000, (va.endMs * SR) / 1000);
    const xb = b.audio[fileOf(v.id)].subarray((vb.startMs * SR) / 1000, (vb.endMs * SR) / 1000);
    const { aToB } = dtw(mfcc(xa, SR), mfcc(xb, SR));
    va.words.forEach(([s], i) => {
      const fa = Math.round((s - va.startMs) / 10);
      if (fa >= 0 && fa < aToB.length) diffs.push(Math.abs(aToB[fa] * 10 - (vb.words[i][0] - vb.startMs)));
    });
  }
  diffs.sort((x, y) => x - y);
  const summary = (id: string) => {
    const vs = Object.values(results[id].verses);
    return { verses: vs.length, good: vs.filter((v) => v.quality === 'good').length, meanCer: +(vs.reduce((s, v) => s + v.cer, 0) / vs.length).toFixed(3) };
  };
  const report = {
    createdAt: new Date().toISOString(),
    model: CTC_MODEL_ID,
    readers: Object.fromEntries(READERS.map((r) => [r.id, summary(r.id)])),
    crossReaderWordStartAgreement: {
      words: diffs.length,
      medianMs: diffs[diffs.length >> 1],
      within100ms: +(diffs.filter((d) => d <= 100).length / diffs.length).toFixed(3),
      within250ms: +(diffs.filter((d) => d <= 250).length / diffs.length).toFixed(3),
    },
  };
  mkdirSync(join(ROOT, 'docs', 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'data', 'reference-alignment-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main();
