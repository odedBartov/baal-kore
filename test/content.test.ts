// Content integrity (spec §20.1) and the pure teaching / persistence logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PortionData } from '../src/app/torah/model';
import { accentsOf, charClass, graphemes, spokenConsonants, stripMarks } from '../src/app/torah/hebrew';
import { TAAM_BY_ID, taamIdOf } from '../src/app/torah/cantillation';
import { planLessons } from '../src/app/teaching/lessons';
import { rabbiSays } from '../src/app/teaching/rabbi';
import {
  defaultProgress,
  isAliyahAccessible,
  isVerseAccessible,
  isUnlocked,
  migrateProgress,
  migrateSettings,
  playProductIdForPortion,
  portionIdFromPlayProductId,
} from '../src/app/core/state';
import { applyEffortReward, computeParashaSummary, getUserRank } from '../src/app/core/gamification';
import {
  findRevokedCouponIds,
  hashCouponCode,
  verifyCouponAgainstManifest,
  type OnlineCouponsManifest,
} from '../src/app/core/coupons';
import { computeSyntheticVerseSchedule, synthesizeCantillationWav } from '../src/app/audio/cantillation-synth';
import { decodeWav } from '../src/app/audio/wav';
import { detectPitch, medianVoicedHz } from '../src/app/audio/pitch';

import type { VerseEvaluation } from '../src/app/analysis/types';

const portion: PortionData = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'bereshit.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data-src', 'sefaria', 'genesis-1-6.mam.json'), 'utf8'));

test('Bereshit has all 146 verses with correct chapter/verse indexing', () => {
  assert.equal(portion.verses.length, 146);
  const perChapter = [31, 25, 24, 26, 32, 8];
  perChapter.forEach((n, c) => {
    const vs = portion.verses.filter((v) => v.chapter === c + 1);
    assert.equal(vs.length, n);
    vs.forEach((v, i) => (assert.equal(v.verse, i + 1), assert.equal(v.id, `Genesis.${c + 1}.${i + 1}`)));
  });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((a) => portion.verses.filter((v) => v.aliyah === a).length), [34, 16, 27, 21, 4, 28, 16]);
});

test('display text keeps every letter and mark of the edition (only markup removed)', () => {
  for (const v of portion.verses) {
    const html: string = snapshot.chapters[v.chapter][v.verse - 1];
    const fromSource = html.replace(/<sup class="footnote-marker">\*<\/sup><i class="footnote">.*?<\/i>/g, '').replace(/<[^>]+>|&[a-z]+;|\{[פס]\}/g, '');
    const marks = (s: string) => [...s].filter((c) => charClass(c) !== 'space' && charClass(c) !== 'other').join('');
    assert.equal(marks(v.text), marks(fromSource), v.id);
    // Tokens reassemble the verse (words + paseq strokes).
    const rebuilt = v.words.map((w) => w.text + (w.paseqAfter ? ' ׀' : '')).join(' ').replace(/־ /g, '־');
    assert.equal(rebuilt, v.text, v.id);
  }
});

test('graphemes keep niqqud and te\'amim with their letter; consonants are recoverable', () => {
  const g = graphemes('בְּרֵאשִׁ֖ית');
  assert.equal(g.length, 6);
  assert.equal(g[0].letter, 'ב');
  assert.deepEqual([...g[0].points].sort(), ['ְ', 'ּ']); // sheva + dagesh, in whatever order the edition stores them
  assert.equal(g[3].accents, '֖');
  assert.equal(stripMarks('הָאָֽרֶץ׃'), 'הארץ');
  assert.equal(spokenConsonants('יְהֹוָ֥ה'), 'אדני');
  assert.equal(spokenConsonants('וַיהוָה'), 'ואדני');
});

test('every accent in Bereshit maps to a catalogued ta\'am, and every verse ends with sof pasuk', () => {
  for (const v of portion.verses) {
    for (const w of v.words) for (const a of accentsOf(w.text)) assert.ok(taamIdOf(a), `${w.id}: unmapped U+${a.codePointAt(0)!.toString(16)}`);
    assert.equal(v.words.at(-1)!.primary, 'sof-pasuk');
    for (const g of v.groups) assert.equal(TAAM_BY_ID[g.taam!].kind, 'disjunctive', `${v.id} group ends with ${g.taam}`);
  }
  const v15 = portion.verses.find((v) => v.id === 'Genesis.1.5')!;
  assert.equal(v15.words[1].paseqAfter, 'paseq'); // mahpach + paseq is not legarmeh
  const v129 = portion.verses.find((v) => v.id === 'Genesis.1.29')!;
  assert.equal(v129.words[7].primary, 'munach-legarmeh');
});

test('stress metadata: לָ֑יְלָה is mil\'el, הָאָֽרֶץ is mil\'el, בָּרָ֣א is milra', () => {
  const w = (id: string, i: number) => portion.verses.find((v) => v.id === id)!.words[i];
  assert.equal(w('Genesis.1.5', 6).stress, 'penultima');
  assert.equal(w('Genesis.1.1', 6).stress, 'penultima');
  assert.equal(w('Genesis.1.1', 1).stress, 'ultima');
});

test('lessons teach new te\'amim in their phrase and skip mastered ones', () => {
  const v11 = portion.verses[0];
  const plan = planLessons(v11, []);
  assert.deepEqual(plan.map((u) => u.newTaamim), [['tipcha'], ['munach', 'etnachta'], ['mercha'], ['sof-pasuk']]);
  assert.deepEqual(plan[1].wordIndexes, [1, 2]);
  assert.equal(planLessons(v11, ['tipcha', 'munach', 'etnachta', 'mercha', 'sof-pasuk']).length, 0);
  // Across the portion, a student who masters as they go meets each ta'am exactly once.
  const seen: string[] = [];
  let lessons = 0;
  for (const v of portion.verses) for (const u of planLessons(v, seen)) (lessons++, seen.push(...u.newTaamim));
  assert.equal(new Set(seen).size, seen.length);
  console.log(`portion introduces ${seen.length} te'amim in ${lessons} lessons: ${seen.join(', ')}`);
});

test('progress migration tolerates garbage and moves v1 self-confirmed verses to "practiced"', () => {
  assert.deepEqual(migrateProgress(null), defaultProgress());
  assert.deepEqual(migrateProgress('nonsense'), defaultProgress());
  const v1 = migrateProgress({ schemaVersion: 1, completedVerseIds: ['Genesis.1.1'], masteredCantillationIds: ['tipcha'] });
  assert.deepEqual(v1.completedVerseIds, []);
  assert.deepEqual(v1.practicedVerseIds, ['Genesis.1.1']);
  assert.deepEqual(v1.masteredCantillationIds, ['tipcha']);
  assert.equal(migrateSettings({ passingThreshold: 999 }).passingThreshold, 85);
  assert.equal(migrateSettings({ passingThreshold: 90 }).passingThreshold, 90);
  // v1 lesson tolerances were on the old deviation scale: reset; v2 values are kept.
  assert.equal(migrateSettings({ schemaVersion: 1, lessonMaxDeviation: 2 }).lessonMaxDeviation, migrateSettings({}).lessonMaxDeviation);
  assert.equal(migrateSettings({ schemaVersion: 2, lessonMaxDeviation: 2 }).lessonMaxDeviation, 2);
  const ids = portion.verses.map((v) => v.id);
  const p = defaultProgress();
  assert.ok(isUnlocked(ids, 'Genesis.1.1', p));
  assert.ok(!isUnlocked(ids, 'Genesis.1.2', p));
  p.practicedVerseIds.push('Genesis.1.1');
  assert.ok(isUnlocked(ids, 'Genesis.1.2', p));
  p.unlockedVerseIds.push('Genesis.1.10');
  assert.ok(isUnlocked(ids, 'Genesis.1.10', p));
  assert.equal(getUserRank(0).tierId, 'beginner');
  assert.equal(getUserRank(900).tierId, 'barmitzva');
  assert.equal(getUserRank(2100).tierId, 'baal-kore');
  const rw = applyEffortReward(p, { kind: 'verse', score: 92, passed: true, aliyah: 1 }, '2026-10-25');
  assert.equal(rw.tierId, 'baal-kore');
  assert.equal(rw.stars, 3);
  assert.equal(p.streakDays, 1);
  p.bestScores['Genesis.1.1'] = 92;
  p.bestScores['Genesis.1.2'] = 84;
  const sum = computeParashaSummary(portion.verses, p, (n) => String(n));
  assert.equal(sum.aliyot.length, 7);
  assert.equal(sum.aliyot[0].averageScore, 88);
  assert.equal(sum.averageScore, 88);
});

test('rabbi: names words only on confident evidence, reports unusable audio, never claims an unsupported pass', () => {
  const base: VerseEvaluation = {
    verseId: 'Genesis.1.1', status: 'inconclusive', inconclusiveReason: 'unvalidated-analyzers', overallScore: null, passingThreshold: 85,
    categories: [], errors: [], words: [], qualityIssues: [], transpositionSemitones: 0, referenceApproval: 'pending', analyzedAt: '', analyzerVersions: {},
  };
  const say = (e: Partial<VerseEvaluation>, mistakeCounts = {}) => rabbiSays({ kind: 'evaluation', evaluation: { ...base, ...e }, attempt: 1, mistakeCounts });
  assert.equal(say({}).ruleId, 'eval-clean-unverified');
  assert.ok(!say({}).text.includes('כל הכבוד'));
  const weak = { category: 'words' as const, kind: 'word-missing', explanationHe: 'נראה שהמילה "בָּרָ֣א" חסרה או לא נשמעה.', confidence: 0.4, severity: 'critical' as const, wordIndex: 1 };
  assert.ok(!say({ errors: [weak] }).text.includes('בָּרָ֣א'));
  assert.ok(say({ errors: [{ ...weak, confidence: 0.8 }] }).text.includes('בָּרָ֣א'));
  assert.equal(say({ inconclusiveReason: 'audio-quality', qualityIssues: ['ההקלטה שקטה מדי.'] }).ruleId, 'eval-audio');
  const melody = { category: 'cantillation' as const, kind: 'melody', explanationHe: 'x', confidence: 0.7, severity: 'moderate' as const, taam: 'tipcha' };
  assert.equal(say({ errors: [melody] }, { 'taam:tipcha': 3 }).ruleId, 'eval-repeated-taam');
  assert.equal(say({ errors: [melody] }, { 'taam:tipcha': 3 }).suggestLesson, 'tipcha');
  assert.equal(say({ status: 'passed', inconclusiveReason: undefined, overallScore: 92 }).ruleId, 'eval-passed');
});

test('all 5 books of the Torah (54 parashot, 5846 verses) are catalogued and valid', () => {
  const catalog = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'torah-catalog.json'), 'utf8'));
  assert.equal(catalog.books.length, 5);
  assert.deepEqual(
    catalog.books.map((b: { id: string; portionIds: string[] }) => [b.id, b.portionIds.length]),
    [
      ['Genesis', 12],
      ['Exodus', 11],
      ['Leviticus', 10],
      ['Numbers', 10],
      ['Deuteronomy', 11],
    ],
  );
  assert.equal(catalog.portions.length, 54);
  const totalCatalogVerses = catalog.portions.reduce((s: number, p: { totalVerses: number }) => s + p.totalVerses, 0);
  assert.equal(totalCatalogVerses, 5846);

  // Spot-check first parasha of each book on disk + verify cantillation reference audio & timings synthesis
  for (const pid of ['bereshit', 'noach', 'shemot', 'vayikra', 'bamidbar', 'devarim', 'vzot-haberachah']) {
    const pData: PortionData = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'assets', 'portions', `${pid}.json`), 'utf8'));
    assert.ok(pData.verses.length > 0, `${pid} has verses`);
    assert.equal(pData.aliyot.length, 7, `${pid} has 7 aliyot`);
    assert.equal(pData.verses.at(-1)!.words.at(-1)!.primary, 'sof-pasuk', `${pid} ends with sof-pasuk`);

    const v0 = pData.verses[0];
    const sched = computeSyntheticVerseSchedule(v0);
    assert.equal(sched.words.length, v0.words.length, `${pid} schedule matches word count`);
    assert.ok(sched.endMs > sched.words.at(-1)!.endMs, `${pid} schedule has valid duration`);
    const wavBuf = synthesizeCantillationWav(v0);
    const decoded = decodeWav(wavBuf);
    assert.equal(decoded.sampleRate, 16000);
    const frames = detectPitch(decoded.samples, decoded.sampleRate);
    const med = medianVoicedHz(frames);
    assert.ok(med !== null && med > 110 && med < 240, `${pid} synthesized cantillation has clear vocal pitch (${med} Hz)`);
  }
});

test('paywall: Aliyah 1 is always free with all verses open; Aliyot 2–7 require ₪10 per-Parasha purchase', () => {
  const p = defaultProgress();
  assert.equal(playProductIdForPortion('lech-lecha'), 'parasha_unlock');
  assert.equal(portionIdFromPlayProductId('parasha_lech_lecha', ['bereshit', 'lech-lecha']), 'lech-lecha');

  // Aliyah 1 is free across every Parasha, while Aliyot 2..7 are paywalled until purchased
  assert.equal(isAliyahAccessible('bereshit', 1, p), true);
  assert.equal(isVerseAccessible('bereshit', 1, p), true);
  for (let a = 2; a <= 7; a++) {
    assert.equal(isAliyahAccessible('bereshit', a, p), false);
    assert.equal(isVerseAccessible('bereshit', a, p), false);
  }

  // Purchasing 'bereshit' unlocks Aliyot 2..7 of 'bereshit', while 'noach' still has only Aliyah 1 free
  p.purchasedPortionIds.push('bereshit');
  for (let a = 1; a <= 7; a++) {
    assert.equal(isAliyahAccessible('bereshit', a, p), true);
    assert.equal(isVerseAccessible('bereshit', a, p), true);
  }
  assert.equal(isAliyahAccessible('noach', 1, p), true);
  assert.equal(isAliyahAccessible('noach', 2, p), false);

  // Online Coupon verification & revocation against coupons.json
  const manifest: OnlineCouponsManifest = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'coupons.json'), 'utf8'),
  );
  const odedCheck = verifyCouponAgainstManifest('odedTest', manifest);
  assert.equal(odedCheck.status, 'valid');
  if (odedCheck.status === 'valid') {
    assert.equal(odedCheck.coupon.kind, 'free-parasha');
  }
  // Case-insensitive match
  assert.equal(verifyCouponAgainstManifest('ODEDTEST', manifest).status, 'valid');
  assert.equal(verifyCouponAgainstManifest('INVALID-CODE-123', manifest).status, 'invalid');

  // Test revoking a coupon
  const revokedManifest: OnlineCouponsManifest = {
    version: 1,
    coupons: [
      {
        id: 'test-vip',
        sha256: hashCouponCode('vipSecret'),
        kind: 'free-all',
        active: false,
      },
    ],
  };
  assert.equal(verifyCouponAgainstManifest('vipSecret', revokedManifest).status, 'revoked');
  assert.deepEqual(findRevokedCouponIds(['test-vip'], revokedManifest), ['test-vip']);
});
