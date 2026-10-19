// Builds src/data/bereshit.json from Sefaria's "Miqra according to the Masorah" (CC BY-SA).
// The raw API text is snapshotted in data-src/ so rebuilding is offline and reproducible; pass --refresh to refetch.
// Run: node --use-system-ca --import tsx scripts/import-torah.ts [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'havarotjs';
import { charClass, consonants, MAQAF, spokenConsonants } from '../src/app/torah/hebrew';
import { phraseGroups, resolveWordTaamim } from '../src/app/torah/cantillation';
import type { PortionData, VerseData, WordToken } from '../src/app/torah/model';

const ROOT = join(import.meta.dirname, '..');
const SNAPSHOT = join(ROOT, 'data-src', 'sefaria', 'genesis-1-6.mam.json');
const OUT = join(ROOT, 'src', 'data', 'bereshit.json');
const VERSION = 'Miqra according to the Masorah';
const EXPECTED = { 1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 8 } as Record<number, number>; // Gen 1:1–6:8 = 146

interface Snapshot {
  retrievedAt: string;
  version: { title: string; license: string; source: string };
  aliyot: string[];
  chapters: Record<number, string[]>;
}

async function fetchSnapshot(): Promise<Snapshot> {
  const H = { headers: { 'User-Agent': 'torah-tutor-dev/1.0 (offline Torah tutor POC; build-time import)' } };
  const chapters: Record<number, string[]> = {};
  let version: Snapshot['version'] | null = null;
  for (let c = 1; c <= 6; c++) {
    const d = await (await fetch(`https://www.sefaria.org/api/v3/texts/Genesis.${c}?version=hebrew|${encodeURIComponent(VERSION)}`, H)).json();
    const v = d.versions[0];
    if (v.versionTitle !== VERSION) throw new Error(`unexpected version ${v.versionTitle}`);
    version = { title: v.versionTitle, license: v.license, source: v.versionSource };
    chapters[c] = v.text;
  }
  const idx = await (await fetch('https://www.sefaria.org/api/v2/index/Genesis', H)).json();
  const parasha = idx.alts.Parasha.nodes.find((n: { sharedTitle?: string }) => n.sharedTitle === 'Bereshit');
  return { retrievedAt: new Date().toISOString(), version: version!, aliyot: parasha.refs, chapters };
}

const LEGARMEH = '', PASEQ_MARK = '', LARGE = '', SMALL = ''; // private-use markers, removed below

function clean(html: string) {
  const notes: string[] = [];
  let breakAfter: VerseData['breakAfter'] = null;
  let s = html
    .replace(/<sup class="footnote-marker">\*<\/sup><i class="footnote">(.*?)<\/i>/g, (_, n: string) => (notes.push(n.replace(/<[^>]+>/g, '')), ''))
    .replace(/<span class="mam-spi-pe">\{פ\}<\/span>/g, () => ((breakAfter = 'petucha'), ''))
    .replace(/<span class="mam-spi-samekh">\{ס\}<\/span>/g, () => ((breakAfter = 'setuma'), ''))
    .replace(/(&thinsp;)?<b>׀<\/b>/g, ` ${LEGARMEH} `) // MAM: bold stroke = legarmeh
    .replace(/(&thinsp;)?<small>׀<\/small>(&thinsp;)?/g, ` ${PASEQ_MARK} `) // small stroke = paseq
    .replace(/<big>/g, LARGE)
    .replace(/<small>/g, SMALL)
    .replace(/<\/(big|small)>/g, '')
    .replace(/<br>/g, '')
    .replace(/&nbsp;|&thinsp;/g, ' ');
  if (/[<>&]/.test(s)) throw new Error(`unhandled markup in: ${s}`);
  s = s.replace(/\s+/g, ' ').trim();
  return { s, notes, breakAfter };
}

function parseRef(r: string) {
  const m = r.match(/^Genesis (\d+):(\d+)-(\d+):(\d+)$/);
  if (!m) throw new Error(`bad aliyah ref ${r}`);
  return { from: [+m[1], +m[2]], to: [+m[3], +m[4]] };
}

function buildVerse(chapter: number, verse: number, aliyah: number, html: string): VerseData {
  const { s, notes, breakAfter } = clean(html);
  const id = `Genesis.${chapter}.${verse}`;
  // Split into words: spaces separate, a maqaf ends a word that chants with the next one.
  const raw: { text: string; paseqAfter: WordToken['paseqAfter']; maqafToNext: boolean; letterSize?: 'large' | 'small' }[] = [];
  for (const piece of s.split(' ')) {
    if (piece === LEGARMEH || piece === PASEQ_MARK) {
      raw[raw.length - 1].paseqAfter = piece === LEGARMEH ? 'legarmeh' : 'paseq';
      continue;
    }
    const parts = piece.split(MAQAF);
    parts.forEach((p, i) => {
      if (!p) return;
      const last = i === parts.length - 1;
      const letterSize = p.includes(LARGE) ? 'large' : p.includes(SMALL) ? 'small' : undefined;
      raw.push({ text: p.replace(/[]/g, '') + (last ? '' : MAQAF), paseqAfter: null, maqafToNext: !last, ...(letterSize ? { letterSize } : {}) });
    });
  }

  // Syllables/stress from havarotjs (MIT). It normalises mark order, so it is analysis-only metadata.
  const plain = raw.map((w) => w.text).join(' ').replace(new RegExp(MAQAF + ' ', 'g'), MAQAF);
  let syll: { text: string; stressed: boolean; reduced: boolean }[][] | null = null;
  const REDUCED = ['SHEVA', 'HATAF_SEGOL', 'HATAF_PATAH', 'HATAF_QAMATS'];
  try {
    const t = new Text(plain, { qametsQatan: true });
    if (t.words.length === raw.length) syll = t.words.map((w) =>
        w.syllables.map((x) => ({ text: x.text, stressed: x.isAccented, reduced: x.vowelNames.length > 0 && x.vowelNames.every((n) => REDUCED.includes(n)) })),
      );
  } catch {
    syll = null;
  }

  const words: WordToken[] = raw.map((w, i) => {
    const r = resolveWordTaamim(w.text, { lastInVerse: i === raw.length - 1, legarmeh: w.paseqAfter === 'legarmeh' });
    const syllables = syll?.[i] ?? null;
    // Stress position counts full-vowel syllables only (vocal sheva / hataf syllables are not stress-bearing).
    const full = syllables?.filter((x) => !x.reduced) ?? [];
    const k = full.length - 1 - full.findLastIndex((x) => x.stressed);
    return {
      id: `${id}.${i + 1}`,
      text: w.text,
      paseqAfter: w.paseqAfter,
      maqafToNext: w.maqafToNext,
      consonants: consonants(w.text),
      spoken: spokenConsonants(w.text),
      taamim: r.taamim,
      primary: r.primary,
      syllables,
      // The Tetragrammaton has no written vowels to syllabify; it is read "Adonai", stressed on the last syllable.
      stress: spokenConsonants(w.text).endsWith('אדני') ? 'ultima' : k >= 0 && k < full.length ? (['ultima', 'penultima', 'antepenultima'] as const)[k] ?? null : null,
      ...(w.letterSize ? { letterSize: w.letterSize } : {}),
    };
  });
  const groups = phraseGroups(words.map((w) => w.primary)).map((g) => ({ words: g, taam: words[g[g.length - 1]].primary }));
  const text = s.replace(new RegExp(`[${LARGE}${SMALL}]`, 'g'), '').replace(new RegExp(`[${LEGARMEH}${PASEQ_MARK}]`, 'g'), '׀');
  return { id, chapter, verse, aliyah, text, words, groups, breakAfter, notes };
}

async function main() {
  let snap: Snapshot;
  if (existsSync(SNAPSHOT) && !process.argv.includes('--refresh')) snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  else {
    snap = await fetchSnapshot();
    mkdirSync(join(ROOT, 'data-src', 'sefaria'), { recursive: true });
    writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 1) + '\n');
  }
  const aliyot = snap.aliyot.map(parseRef);
  const aliyahOf = (c: number, v: number) => 1 + aliyot.findIndex((a) => (c > a.from[0] || (c === a.from[0] && v >= a.from[1])) && (c < a.to[0] || (c === a.to[0] && v <= a.to[1])));

  const verses: VerseData[] = [];
  for (let c = 1; c <= 6; c++) {
    const n = EXPECTED[c];
    if (snap.chapters[c].length < n) throw new Error(`chapter ${c}: ${snap.chapters[c].length} < ${n} verses`);
    for (let v = 1; v <= n; v++) verses.push(buildVerse(c, v, aliyahOf(c, v), snap.chapters[c][v - 1]));
  }

  // Integrity: 146 verses, every word has letters, every verse ends in sof pasuq, no stray characters.
  if (verses.length !== 146) throw new Error(`expected 146 verses, got ${verses.length}`);
  for (const v of verses) {
    if (!v.text.endsWith('׃')) throw new Error(`${v.id} does not end with sof pasuq`);
    if (v.words.at(-1)!.primary !== 'sof-pasuk') throw new Error(`${v.id} last word is not sof pasuq`);
    for (const w of v.words) if (!w.consonants) throw new Error(`${w.id} has no letters`);
    for (const ch of v.text) if (charClass(ch) === 'other') throw new Error(`${v.id} has unexpected character U+${ch.codePointAt(0)!.toString(16)}`);
    if (aliyahOf(v.chapter, v.verse) < 1) throw new Error(`${v.id} outside the aliyot`);
  }

  const out: PortionData = {
    schemaVersion: 1,
    id: 'bereshit',
    nameHe: 'בְּרֵאשִׁית',
    book: 'Genesis',
    range: 'Genesis 1:1-6:8',
    aliyot: snap.aliyot.map((r, i) => ({ n: i + 1, from: `Genesis.${aliyot[i].from.join('.')}`, to: `Genesis.${aliyot[i].to.join('.')}` })),
    source: { edition: snap.version.title, license: snap.version.license, url: snap.version.source, retrievedAt: snap.retrievedAt, reviewStatus: 'pending' },
    verses,
  };
  mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  const words = verses.reduce((s, v) => s + v.words.length, 0);
  const noSyll = verses.filter((v) => v.words.some((w) => !w.syllables)).map((v) => v.id);
  console.log(`bereshit.json: ${verses.length} verses, ${words} words; verses without syllable data: ${noSyll.length ? noSyll.join(', ') : 'none'}`);
}

main();
