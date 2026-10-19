// Niqqud check: expected pronunciation from the pointed text, alignment, and the vowel score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { wordSlots } from '../src/app/analysis/phonemes';
import { alignSlots, scoreChecks, tokenIndex } from '../src/app/analysis/vowels';
import { evaluate } from '../src/app/analysis/evaluate';
import type { PortionData } from '../src/app/torah/model';

const ROOT = join(import.meta.dirname, '..');
const portion: PortionData = JSON.parse(readFileSync(join(ROOT, 'src/data/bereshit.json'), 'utf8'));
const ALL = portion.verses.flatMap((v) => v.words);
// By consonants (mark order varies between editions); `qatan` picks the form written with qamats qatan.
const word = (cons: string, qatan = false) => ALL.find((w) => w.consonants.replace(/־/g, '') === cons && (!qatan || w.syllables!.some((s) => s.text.includes('ׇ'))))!;
const vowels = (cons: string, qatan = false) => { const w = word(cons, qatan); return wordSlots(w.syllables!, w.spoken).slots.filter((s) => s.vowel).map((s) => s.vowel).join(''); };

test('expected vowels follow the niqqud: silent matres, holam male, shuruk, furtive patah, qamats qatan, Adonai', () => {
  assert.equal(vowels('בראשית'), 'EI'); // vocal sheva is optional and never checked; silent alef and yod
  assert.equal(vowels('אלהים'), 'EOI');
  assert.equal(vowels('תהום'), 'O'); // holam male
  assert.equal(vowels('ורוח'), 'UA'); // shuruk, furtive patah
  assert.equal(vowels('כל', true), 'O'); // qamats qatan
  const w = word('והארץ'), slots = wordSlots(w.syllables!, w.spoken).slots;
  assert.ok(slots.find((s) => s.tokens.includes('h'))!.optional, 'he is optional');
  const ruax = wordSlots(word('ורוח').syllables!, 'ורוח').slots;
  assert.deepEqual(ruax.slice(-2).map((s) => s.vowel ?? s.tokens[0]), ['A', 'x'], 'patah is read before the het');
  const yhwh = portion.verses.flatMap((v) => v.words).find((x) => x.spoken === 'אדני')!;
  assert.equal(wordSlots(yhwh.syllables ?? [{ text: yhwh.text, reduced: false }], yhwh.spoken).checkable, false, 'its written vowels are not the spoken ones');
});

// Synthetic phone posteriors: frames spelling the given tokens, everything else blank.
const TOKENS = readFileSync(join(ROOT, 'src/data/phone-model.json'), 'utf8');
const idx = tokenIndex(JSON.parse(TOKENS).tokens);
function posteriors(seq: string[]) {
  const V = Math.max(...idx.values()) + 1, T = seq.length * 3 + 2, lp = new Float32Array(T * V).fill(-12);
  for (let t = 0; t < T; t++) lp[t * V] = -0.01; // blank
  seq.forEach((tok, k) => { const t = 1 + k * 3; lp[t * V] = -6; lp[t * V + idx.get(tok)!] = -0.01; });
  return { lp, T, V };
}

test('alignment skips unspoken optional sounds; a vowel sung differently from the text scores low', () => {
  const slots = wordSlots(word('בראשית').syllables!, 'בראשית').slots; // b [ə] ʁ e ʃ i t
  const right = posteriors(['b', 'ʁ', 'e', 'ʃ', 'i', 't']); // sheva not sounded (Israeli)
  const spans = alignSlots(right, slots, idx)!;
  assert.ok(spans && spans[1] === null, 'optional sheva skipped');
  assert.ok(scoreChecks(right, slots, spans, idx).filter((s) => s.kind === 'vowel').every((s) => s.goodness > 2));
  const wrong = posteriors(['b', 'ʁ', 'a', 'ʃ', 'i', 't']); // tsere sung as "a"
  const sc = scoreChecks(wrong, slots, alignSlots(wrong, slots, idx)!, idx).filter((s) => s.kind === 'vowel');
  assert.ok(sc[0].goodness < -2 && sc[0].heard === 'A', JSON.stringify(sc));
  assert.ok(sc[1].goodness > 2, 'the other vowel is still fine');
});

test('sheva na / nach is judged only where readers agree; dagesh and the shin dot name the sound', () => {
  const shevas = (cons: string) => { const w = word(cons); return wordSlots(w.syllables!, w.spoken).slots.filter((s) => s.tokens.includes('ə') && !s.vowel).map((s) => s.sheva ?? '?'); };
  assert.deepEqual(shevas('בראשית'), ['na']); // first letter
  assert.deepEqual(shevas('המארת'), ['na']); // dagesh hazaq
  assert.deepEqual(shevas('ישרצו'), ['nach', 'na']); // after a short vowel; second of two
  assert.deepEqual(shevas('ויבדל'), ['nach']);
  assert.deepEqual(shevas('תדשא'), ['?']); // meteg: grammars differ, not judged
  const bara = wordSlots(word('ברא').syllables!, 'ברא').slots[0].contrast!;
  assert.deepEqual([bara.kind, bara.sound, bara.other], ['dagesh', 'b', 'v']);
  assert.equal(wordSlots(word('השמים').syllables!, 'השמים').slots.find((s) => s.contrast?.kind === 'shin')!.contrast!.sound, 'sh');
});

test('a sheva nach sounded as a vowel, and a rafe letter read with its dagesh sound, score low', () => {
  const slots = wordSlots(word('ויבדל').syllables!, 'ויבדל').slots; // va-yav-del
  const check = (seq: string[], kind: string) => { const o = posteriors(seq); return scoreChecks(o, slots, alignSlots(o, slots, idx)!, idx).find((s) => s.kind === kind)!.goodness; };
  assert.ok(check(['v', 'a', 'j', 'a', 'v', 'd', 'e', 'l'], 'sheva-nach') > 2);
  assert.ok(check(['v', 'a', 'j', 'a', 'v', 'ə', 'd', 'e', 'l'], 'sheva-nach') < -2);
  assert.ok(check(['v', 'a', 'j', 'a', 'v', 'd', 'e', 'l'], 'dagesh') > 2);
  assert.ok(check(['v', 'a', 'j', 'a', 'b', 'd', 'e', 'l'], 'dagesh') < -2); // ב without dagesh read "b"
});

const MODEL = join(ROOT, '.cache/models/zipa-small/model.int8.onnx');
test('real chant: the reader against his own text gets no vowel errors; a changed vowel in the text is caught', { skip: !existsSync(MODEL) && 'needs npm run fetch-model' }, async () => {
  const { loadPhoneModel, phoneLogProbs } = await import('../scripts/lib/phone-model');
  const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis');
  const { resample } = await import('../src/app/audio/wav');
  const ref = JSON.parse(readFileSync(join(ROOT, 'src/data/reference-asael-israeli.json'), 'utf8'));
  const d = new OggVorbisDecoder();
  await d.ready;
  const { channelData, sampleRate } = await d.decodeFile(readFileSync(join(ROOT, 'src', ref.files[0].path)));
  d.free();
  const all = resample(channelData[0], sampleRate, 16000), m = await loadPhoneModel();
  const v = portion.verses[0], r = ref.verses[v.id];
  const x = all.slice(r.startMs * 16, r.endMs * 16);
  const phones = { ...(await phoneLogProbs(m, x)), idx: m.idx };
  const run = (words: typeof v.words) =>
    evaluate({ verseId: v.id, words: words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary, syllables: w.syllables })), groups: v.groups, student: x, reference: null, referenceWords: null, referenceApproval: 'pending', ctc: null, phones, passingThreshold: 85 }).evaluation;
  const ok = run(v.words);
  assert.deepEqual(ok.errors.filter((e) => e.category === 'niqqud' && e.confidence >= 0.6), []); // nothing named to the student
  assert.ok(ok.categories.find((c) => c.category === 'niqqud')!.score! >= 90);
  // בָּרָא with its first qamats turned into hiriq: the text now expects "bira".
  const changed = v.words.map((w, i) => (i === 1 ? { ...w, syllables: w.syllables!.map((s, k) => (k === 0 ? { ...s, text: s.text.replace('ָ', 'ִ') } : s)) } : w));
  const bad = run(changed).errors.filter((e) => e.category === 'niqqud' && e.confidence >= 0.6);
  assert.ok(bad.some((e) => e.wordIndex === 1), JSON.stringify(bad));
});

