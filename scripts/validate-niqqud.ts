// Niqqud (vowel) check on REAL recordings, before it is used in the app:
//   correct readings  — every written vowel of real readings is scored: how often is a correct vowel flagged?
//   wrong vowel       — for every vowel of the Israeli-pronunciation reader, the written vowel is replaced by each other
//                       vowel quality and the verse re-aligned: how often is the mismatch caught?
// (Changing the text is the standard way to test pronunciation scoring when no labelled mistakes exist; the audio
// stays real chant.) Thresholds are chosen from correct readings of even verses only; false alarms are reported on odd
// verses, detection on all wrong-vowel cases (they never influence a threshold). Writes docs/data/niqqud-validation.json.
// Run: npm run validate-niqqud   (needs fetch-model; the other readers need align-reference)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import { decodeWav, resample } from '../src/app/audio/wav';
import { NIQQUD } from '../src/app/analysis/evaluate';
import { wordSlots, VOWELS, type Pronunciation, type Slot, type VowelClass } from '../src/app/analysis/phonemes';
import { alignSlots, scoreChecks, type CheckKind, type CheckScore, type PhoneLogProbs } from '../src/app/analysis/vowels';
import type { PortionData, VerseData } from '../src/app/torah/model';
import { greedyPhones, loadPhoneModel, phoneLogProbs } from './lib/phone-model';

const ROOT = join(import.meta.dirname, '..');
const SR = 16000;
type Reader = { files: { path: string }[]; verses: Record<string, { file: number; startMs: number; endMs: number; quality?: string }> };
const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));
const readers: Record<string, { meta: Reader; src: (n: number) => string; pron: Pronunciation }> = {
  'asael-israeli': { meta: JSON.parse(readFileSync(join(ROOT, 'src/data/reference-asael-israeli.json'), 'utf8')), src: (n) => '', pron: 'israeli' },
};
readers['asael-israeli'].src = (n) => join(ROOT, 'src', readers['asael-israeli'].meta.files[n].path);
for (const [id, file, pron] of [['asael-ashkenazi', 'Asael Ashkenaz', 'ashkenazi'], ['nahum', 'Nahum', 'ashkenazi']] as const)
  if (existsSync(join(ROOT, `.cache/reference/${id}.json`)))
    readers[id] = { meta: JSON.parse(readFileSync(join(ROOT, `.cache/reference/${id}.json`), 'utf8')), src: (n) => join(ROOT, '.cache/reference/src', `Aa Genesis Bereshit-${n + 1} ${file}.oga`), pron };

const decoded = new Map<string, Float32Array>();
async function decode(path: string) {
  if (!decoded.has(path)) {
    const d = new OggVorbisDecoder();
    await d.ready;
    const { channelData, sampleRate } = await d.decodeFile(readFileSync(path));
    d.free();
    const m = new Float32Array(channelData[0].length);
    for (const c of channelData) for (let i = 0; i < m.length; i++) m[i] += c[i] / channelData.length;
    decoded.set(path, resample(m, sampleRate, SR));
  }
  return decoded.get(path)!;
}

async function main() {
  const model = await loadPhoneModel();
  const CACHE = join(ROOT, '.cache', 'phone-cache');
  mkdirSync(CACHE, { recursive: true });
  async function lpOf(x: Float32Array): Promise<PhoneLogProbs> {
    const p = join(CACHE, createHash('sha1').update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)).digest('hex') + '.lp');
    if (existsSync(p)) {
      const b = readFileSync(p), h = new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8));
      return { T: h[0], V: h[1], lp: new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + b.byteLength)) };
    }
    const r = await phoneLogProbs(model, x);
    writeFileSync(p, Buffer.concat([Buffer.from(Int32Array.of(r.T, r.V).buffer), Buffer.from(r.lp.buffer, r.lp.byteOffset, r.lp.byteLength)]));
    return r;
  }

  function verseSlots(v: VerseData, pron: Pronunciation = 'israeli') {
    const slots: (Slot & { word: number })[] = [];
    v.words.forEach((w, i) => {
      if (!w.syllables) return;
      const { slots: s, checkable } = wordSlots(w.syllables, w.spoken, pron);
      for (const x of s) slots.push(checkable ? { ...x, word: i } : { ...x, word: i, vowel: undefined, contrast: undefined, sheva: undefined });
    });
    return slots;
  }

  type Rec = { verse: string; split: 'tune' | 'report'; reader: string; check: CheckKind; truth: 'correct' | 'swapped'; label: string; vowel?: VowelClass; as?: VowelClass; goodness: number };
  const records: Rec[] = [];
  const cut = (x: Float32Array, a: number, b: number) => x.slice(Math.round((a * SR) / 1000), Math.round((b * SR) / 1000));
  const SWAP_EVERY = Number(process.env.SWAP_EVERY ?? 4); // vowel substitution test on every 4th verse (time)
  const label = (sl: Slot) => (sl.vowel ? sl.point! : sl.contrast ? sl.contrast.glyph : `${sl.glyph} (${sl.sheva})`);
  const push = (base: Omit<Rec, 'check' | 'label' | 'goodness'>, slots: Slot[], sc: CheckScore[]) => {
    for (const q of sc) records.push({ ...base, check: q.kind, label: label(slots[q.slot]), vowel: q.vowel, goodness: q.goodness });
  };
  // Spoken Hebrew (Windows TTS, optional): Israeli speech usually drops sheva na — a real-world sanity check.
  const ttsDir = process.env.TTS_DIR;
  const ttsAudio = (id: string) => {
    const f = ttsDir && join(ttsDir, `${id}.r1.wav`);
    if (!f || !existsSync(f)) return null;
    const b = readFileSync(f), w = decodeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    return resample(w.samples, w.sampleRate, SR);
  };

  for (const [vi, v] of portion.verses.entries()) {
    const split = vi % 2 ? 'report' : 'tune';
    const slots = verseSlots(v);
    const tts = ttsAudio(v.id);
    if (tts) {
      const o = await lpOf(tts), sp = alignSlots(o, slots, model.idx);
      if (sp) push({ verse: v.id, split, reader: 'tts (spoken)', truth: 'correct' }, slots, scoreChecks(o, slots, sp, model.idx));
    }
    for (const [rid, r] of Object.entries(readers)) {
      const rv = r.meta.verses[v.id];
      if (!rv || (rv.quality && rv.quality !== 'good')) continue;
      const o = await lpOf(cut(await decode(r.src(rv.file)), rv.startMs, rv.endMs));
      const spans = alignSlots(o, slots, model.idx);
      if (!spans) continue;
      if (vi < 2 && rid === 'asael-israeli') console.log(v.id, 'heard:', greedyPhones(model, o));
      push({ verse: v.id, split, reader: rid, truth: 'correct' }, slots, scoreChecks(o, slots, spans, model.idx));
      if (r.pron === 'ashkenazi') {
        const own = verseSlots(v, 'ashkenazi'), sp = alignSlots(o, own, model.idx);
        if (sp) push({ verse: v.id, split, reader: `${rid} (ashkenazi pronunciation)`, truth: 'correct' }, own, scoreChecks(o, own, sp, model.idx));
      }
      if (rid !== 'asael-israeli') continue;
      // Dagesh and shin dot: the text asks for the other sound (same alignment: consonant slots accept both).
      const flipped = slots.map((x) => (x.contrast ? { ...x, contrast: { ...x.contrast, want: x.contrast.against, against: x.contrast.want } } : { ...x, vowel: undefined, sheva: undefined }));
      push({ verse: v.id, split, reader: rid, truth: 'swapped' }, flipped, scoreChecks(o, flipped, spans, model.idx));
      if (vi % SWAP_EVERY) continue;
      slots.forEach((sl, k) => {
        if (!sl.vowel) return;
        for (const c of Object.keys(VOWELS) as VowelClass[]) {
          if (c === sl.vowel) continue;
          const alt = slots.map((x, j) => (j === k ? { ...x, tokens: c === 'E' ? [...VOWELS.E, 'ə'] : VOWELS[c], vowel: c } : x));
          const sp = alignSlots(o, alt, model.idx);
          const g = sp && scoreChecks(o, alt, sp, model.idx).find((q) => q.slot === k && q.kind === 'vowel');
          if (g) records.push({ verse: v.id, split, reader: rid, check: 'vowel', truth: 'swapped', label: sl.point!, vowel: c, as: sl.vowel, goodness: g.goodness });
        }
      });
    }
    if (vi % 20 === 0) console.log(`${vi + 1}/${portion.verses.length} verses, ${records.length} records`);
  }
  writeFileSync(join(ROOT, '.cache/niqqud-records.json'), JSON.stringify(records));

  const rate = (v: number[], th: number) => (v.length ? +(v.filter((g) => g < th).length / v.length).toFixed(3) : null);
  const of = (f: (r: Rec) => boolean) => records.filter(f).map((r) => r.goodness);
  // Wrong cases per check. Sheva: the reader's own nach positions are "na skipped" (no vowel where na needs one),
  // his na positions are "nach pronounced" (a vowel where nach allows none) — the presence score just changes sign.
  const wrong = (c: CheckKind) =>
    c === 'sheva-na' ? of((r) => r.reader === 'asael-israeli' && r.check === 'sheva-nach').map((g) => -g)
    : c === 'sheva-nach' ? of((r) => r.reader === 'asael-israeli' && r.check === 'sheva-na').map((g) => -g)
    : of((r) => r.truth === 'swapped' && r.check === c);
  const readerIds = [...new Set(records.map((r) => r.reader))];
  const checks: CheckKind[] = ['vowel', 'dagesh', 'shin', 'sheva-na', 'sheva-nach'];
  const out = {
    createdAt: new Date().toISOString(),
    note: 'Real chant. Thresholds from correct readings of even verses (Israeli reader); false alarms on odd verses; wrong cases never set a threshold (see scripts/validate-niqqud.ts).',
    checks: Object.fromEntries(checks.map((c) => {
      const tune = of((r) => r.truth === 'correct' && r.split === 'tune' && r.reader === 'asael-israeli' && r.check === c).sort((a, b) => a - b);
      const at = (fa: number) => +tune[Math.floor(fa * tune.length)].toFixed(2);
      const report = (th: number) => ({
        threshold: th,
        falseAlarm: Object.fromEntries(readerIds.map((rid) => [rid, rate(of((r) => r.truth === 'correct' && r.split === 'report' && r.reader === rid && r.check === c), th)])),
        detected: rate(wrong(c), th),
      });
      return [c, { cases: { correct: tune.length * 2, wrong: wrong(c).length }, atFalseAlarm: { '0.5%': report(at(0.005)), '1%': report(at(0.01)), '2%': report(at(0.02)) } }];
    })),
    shipped: Object.fromEntries(checks.map((c) => {
      const th = NIQQUD[c].flagBelow, named = th - 0.1 * NIQQUD[c].span; // confidence 0.6
      return [c, {
        threshold: th,
        falseAlarm: Object.fromEntries(readerIds.map((rid) => [rid, rate(of((r) => r.truth === 'correct' && (rid.startsWith('tts') || r.split === 'report') && r.reader === rid && r.check === c), th)])),
        detected: rate(wrong(c), th),
        detectedAndNamed: rate(wrong(c), named),
      }];
    })),
    vowelSubstitutions: Object.fromEntries(
      (Object.keys(VOWELS) as VowelClass[]).flatMap((a) => (Object.keys(VOWELS) as VowelClass[]).filter((b) => b !== a).map((b) => [`${a}→${b}`, rate(of((r) => r.truth === 'swapped' && r.check === 'vowel' && r.as === a && r.vowel === b), -2.5)])),
    ),
  };
  writeFileSync(join(ROOT, 'docs/data/niqqud-validation.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

main();
