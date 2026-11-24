// Builds src/data/bereshit.json, src/data/torah-catalog.json, and src/assets/portions/*.json
// from Sefaria's "Miqra according to the Masorah" (CC BY-SA) across all 5 books of the Torah (54 Parashot).
// The raw API text is snapshotted in data-src/ so rebuilding is offline and reproducible; pass --refresh to refetch.
// Run: node --use-system-ca --import tsx scripts/import-torah.ts [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'havarotjs';
import { accentsOf, charClass, consonants, MAQAF, spokenConsonants } from '../src/app/torah/hebrew';
import { phraseGroups, resolveWordTaamim, taamIdOf } from '../src/app/torah/cantillation';
import type {
  AliyahCatalogEntry,
  BookCatalogEntry,
  BookId,
  PortionCatalogEntry,
  PortionData,
  TorahCatalog,
  VerseData,
  WordToken,
} from '../src/app/torah/model';

const ROOT = join(import.meta.dirname, '..');
const TORAH_SNAPSHOT = join(ROOT, 'data-src', 'sefaria', 'torah-5-books.mam.json');
const BERESHIT_OUT = join(ROOT, 'src', 'data', 'bereshit.json');
const CATALOG_OUT = join(ROOT, 'src', 'data', 'torah-catalog.json');
const PORTIONS_DIR = join(ROOT, 'src', 'assets', 'portions');
const VERSION = 'Miqra according to the Masorah';

const BOOKS_META: { id: BookId; nameHe: string; nameHePlain: string; order: number }[] = [
  { id: 'Genesis', nameHe: 'בְּרֵאשִׁית', nameHePlain: 'בראשית', order: 1 },
  { id: 'Exodus', nameHe: 'שְׁמוֹת', nameHePlain: 'שמות', order: 2 },
  { id: 'Leviticus', nameHe: 'וַיִּקְרָא', nameHePlain: 'ויקרא', order: 3 },
  { id: 'Numbers', nameHe: 'בְּמִדְבַּר', nameHePlain: 'במדבר', order: 4 },
  { id: 'Deuteronomy', nameHe: 'דְּבָרִים', nameHePlain: 'דברים', order: 5 },
];

const PARASHA_META: Record<string, { id: string; nameHe: string }> = {
  // Genesis (12)
  Bereshit: { id: 'bereshit', nameHe: 'בְּרֵאשִׁית' },
  Noach: { id: 'noach', nameHe: 'נֹחַ' },
  'Lech Lecha': { id: 'lech-lecha', nameHe: 'לֶךְ־לְךָ' },
  Vayera: { id: 'vayera', nameHe: 'וַיֵּרָא' },
  'Chayei Sara': { id: 'chayei-sara', nameHe: 'חַיֵּי שָׂרָה' },
  Toldot: { id: 'toldot', nameHe: 'תּוֹלְדֹת' },
  Vayetzei: { id: 'vayetzei', nameHe: 'וַיֵּצֵא' },
  Vayishlach: { id: 'vayishlach', nameHe: 'וַיִּשְׁלַח' },
  Vayeshev: { id: 'vayeshev', nameHe: 'וַיֵּשֶׁב' },
  Miketz: { id: 'miketz', nameHe: 'מִקֵּץ' },
  Vayigash: { id: 'vayigash', nameHe: 'וַיִּגַּשׁ' },
  Vayechi: { id: 'vayechi', nameHe: 'וַיְחִי' },
  // Exodus (11)
  Shemot: { id: 'shemot', nameHe: 'שְׁמוֹת' },
  Vaera: { id: 'vaera', nameHe: 'וָאֵרָא' },
  Bo: { id: 'bo', nameHe: 'בֹּא' },
  Beshalach: { id: 'beshalach', nameHe: 'בְּשַׁלַּח' },
  Yitro: { id: 'yitro', nameHe: 'יִתְרוֹ' },
  Mishpatim: { id: 'mishpatim', nameHe: 'מִשְׁפָּטִים' },
  Terumah: { id: 'terumah', nameHe: 'תְּרוּמָה' },
  Tetzaveh: { id: 'tetzaveh', nameHe: 'תְּצַוֶּה' },
  'Ki Tisa': { id: 'ki-tisa', nameHe: 'כִּי תִשָּׂא' },
  Vayakhel: { id: 'vayakhel', nameHe: 'וַיַּקְהֵל' },
  Pekudei: { id: 'pekudei', nameHe: 'פְקוּדֵי' },
  // Leviticus (10)
  Vayikra: { id: 'vayikra', nameHe: 'וַיִּקְרָא' },
  Tzav: { id: 'tzav', nameHe: 'צַו' },
  Shmini: { id: 'shmini', nameHe: 'שְׁמִינִי' },
  Tazria: { id: 'tazria', nameHe: 'תַזְרִיעַ' },
  Metzora: { id: 'metzora', nameHe: 'מְּצֹרָע' },
  'Achrei Mot': { id: 'achrei-mot', nameHe: 'אַחֲרֵי מוֹת' },
  Kedoshim: { id: 'kedoshim', nameHe: 'קְדֹשִׁים' },
  Emor: { id: 'emor', nameHe: 'אֱמֹר' },
  Behar: { id: 'behar', nameHe: 'בְּהַר' },
  Bechukotai: { id: 'bechukotai', nameHe: 'בְּחֻקֹּתַי' },
  // Numbers (10)
  Bamidbar: { id: 'bamidbar', nameHe: 'בְּמִדְבַּר' },
  Nasso: { id: 'nasso', nameHe: 'נָשֹׂא' },
  "Beha'alotcha": { id: 'behaalotcha', nameHe: 'בְּהַעֲלֹתְךָ' },
  "Sh'lach": { id: 'shlach', nameHe: 'שְׁלַח־לְךָ' },
  Korach: { id: 'korach', nameHe: 'קֹרַח' },
  Chukat: { id: 'chukat', nameHe: 'חֻקַּת' },
  Balak: { id: 'balak', nameHe: 'בָּלָק' },
  Pinchas: { id: 'pinchas', nameHe: 'פִּינְחָס' },
  Matot: { id: 'matot', nameHe: 'מַּטּוֹת' },
  Masei: { id: 'masei', nameHe: 'מַסְעֵי' },
  // Deuteronomy (11)
  Devarim: { id: 'devarim', nameHe: 'דְּבָרִים' },
  Vaetchanan: { id: 'vaetchanan', nameHe: 'וָאֶתְחַנַּן' },
  Eikev: { id: 'eikev', nameHe: 'עֵקֶב' },
  "Re'eh": { id: 'reeh', nameHe: 'רְאֵה' },
  Shoftim: { id: 'shoftim', nameHe: 'שֹׁפְטִים' },
  'Ki Teitzei': { id: 'ki-teitzei', nameHe: 'כִּי־תֵצֵא' },
  'Ki Tavo': { id: 'ki-tavo', nameHe: 'כִּי־תָבוֹא' },
  Nitzavim: { id: 'nitzavim', nameHe: 'נִצָּבִים' },
  Vayeilech: { id: 'vayeilech', nameHe: 'וַיֵּלֶךְ' },
  "Ha'Azinu": { id: 'haazinu', nameHe: 'הַאֲזִינוּ' },
  "V'Zot HaBerachah": { id: 'vzot-haberachah', nameHe: 'וְזֹאת הַבְּרָכָה' },
};

const LETTERS: [number, string][] = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
  [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
];

function hebrewNumber(n: number): string {
  let s = '';
  for (const [v, l] of LETTERS) {
    while (n >= v) {
      if (n === 15 || n === 16) {
        s += n === 15 ? 'טו' : 'טז';
        n = 0;
        break;
      }
      s += l;
      n -= v;
    }
  }
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

interface BookSnapshot {
  parashot: { sharedTitle: string; wholeRef: string; aliyot: string[] }[];
  chapters: string[][];
}

interface TorahSnapshot {
  retrievedAt: string;
  version: { title: string; license: string; source: string };
  books: Record<BookId, BookSnapshot>;
}

async function fetchTorahSnapshot(): Promise<TorahSnapshot> {
  const H = { headers: { 'User-Agent': 'torah-tutor-dev/1.0 (offline Torah tutor; build-time import)' } };
  let version: TorahSnapshot['version'] | null = null;
  const books = {} as Record<BookId, BookSnapshot>;

  for (const b of BOOKS_META) {
    console.log(`Fetching ${b.id} from Sefaria...`);
    const d = await (await fetch(`https://www.sefaria.org/api/v3/texts/${b.id}?version=hebrew|${encodeURIComponent(VERSION)}`, H)).json();
    const v = d.versions[0];
    if (v.versionTitle !== VERSION) throw new Error(`unexpected version ${v.versionTitle} for ${b.id}`);
    version = { title: v.versionTitle, license: v.license, source: v.versionSource };
    const idx = await (await fetch(`https://www.sefaria.org/api/v2/index/${b.id}`, H)).json();
    const parashot = idx.alts.Parasha.nodes.map((n: { sharedTitle: string; wholeRef: string; refs: string[] }) => ({
      sharedTitle: n.sharedTitle,
      wholeRef: n.wholeRef,
      aliyot: n.refs,
    }));
    books[b.id] = { parashot, chapters: v.text };
  }

  return { retrievedAt: new Date().toISOString(), version: version!, books };
}

const LEGARMEH = '\uE001', PASEQ_MARK = '\uE002', LARGE = '\uE010', SMALL = '\uE011'; // private-use markers, removed below

function clean(html: string) {
  const notes: string[] = [];
  let breakAfter: VerseData['breakAfter'] = null;
  let s = html
    .replace(/\u034f/g, '') // strip Combining Grapheme Joiner (e.g. Genesis 35:22)
    .replace(/<sup class="footnote-marker">\*<\/sup><i class="footnote">(.*?)<\/i>/g, (_, n: string) => (notes.push(n.replace(/<[^>]+>/g, '')), ''))
    .replace(/<span class="mam-spi-pe">\{פ\}<\/span>/g, () => ((breakAfter = 'petucha'), ''))
    .replace(/<span class="mam-spi-samekh">\{ס\}<\/span>/g, () => ((breakAfter = 'setuma'), ''))
    .replace(/<span class="mam-spi-invnun">.*?<\/span>/g, () => (notes.push('נו״ן מנוזרת'), ''))
    .replace(/<span class="mam-kq-trivial">(.*?)<\/span>/g, '$1')
    .replace(
      /<span class="mam-kq">\s*(?:<span class="mam-kq-k">\((.*?)\)<\/span>\s*<span class="mam-kq-q">\[(.*?)\]<\/span>|<span class="mam-kq-q">\[(.*?)\]<\/span>\s*<span class="mam-kq-k">\((.*?)\)<\/span>)\s*<\/span>/g,
      (_, k1, q1, q2, k2) => {
        const k = (k1 ?? k2).replace(/<[^>]+>/g, '');
        const q = q1 ?? q2;
        notes.push(`כתיב: ${k} · קרי: ${q.replace(/<[^>]+>/g, '')}`);
        return q;
      },
    )
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

function parseRef(r: string): { book: BookId; from: [number, number]; to: [number, number] } {
  const m1 = r.match(/^([A-Za-z]+) (\d+):(\d+)[-–](\d+):(\d+)$/);
  if (m1) return { book: m1[1] as BookId, from: [+m1[2], +m1[3]], to: [+m1[4], +m1[5]] };
  const m2 = r.match(/^([A-Za-z]+) (\d+):(\d+)[-–](\d+)$/);
  if (m2) return { book: m2[1] as BookId, from: [+m2[2], +m2[3]], to: [+m2[2], +m2[4]] };
  throw new Error(`bad ref ${r}`);
}

function formatRangeHe(from: [number, number], to: [number, number]): string {
  if (from[0] === to[0]) {
    return `${hebrewNumber(from[0])}:${hebrewNumber(from[1])}–${hebrewNumber(to[1])}`;
  }
  return `${hebrewNumber(from[0])}:${hebrewNumber(from[1])}–${hebrewNumber(to[0])}:${hebrewNumber(to[1])}`;
}

function buildVerse(book: BookId, chapter: number, verse: number, aliyah: number, html: string): VerseData {
  const { s, notes, breakAfter } = clean(html);
  const id = `${book}.${chapter}.${verse}`;
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
      raw.push({ text: p.replace(/[\uE010\uE011]/g, '') + (last ? '' : MAQAF), paseqAfter: null, maqafToNext: !last, ...(letterSize ? { letterSize } : {}) });
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

function validatePortion(p: PortionData) {
  for (const v of p.verses) {
    if (!v.text.endsWith('׃')) throw new Error(`${v.id} does not end with sof pasuq`);
    if (v.words.at(-1)!.primary !== 'sof-pasuk') throw new Error(`${v.id} last word is not sof pasuq`);
    for (const w of v.words) {
      if (!w.consonants) throw new Error(`${w.id} has no letters`);
      for (const a of accentsOf(w.text)) {
        if (!taamIdOf(a)) throw new Error(`${w.id}: unmapped accent U+${a.codePointAt(0)!.toString(16)}`);
      }
    }
    for (const ch of v.text) {
      if (charClass(ch) === 'other') throw new Error(`${v.id} has unexpected character U+${ch.codePointAt(0)!.toString(16)}`);
    }
    if (v.aliyah < 1 || v.aliyah > 7) throw new Error(`${v.id} outside aliyot (aliyah=${v.aliyah})`);
  }
}

async function main() {
  let snap: TorahSnapshot;
  if (existsSync(TORAH_SNAPSHOT) && !process.argv.includes('--refresh')) {
    snap = JSON.parse(readFileSync(TORAH_SNAPSHOT, 'utf8'));
  } else {
    snap = await fetchTorahSnapshot();
    mkdirSync(join(ROOT, 'data-src', 'sefaria'), { recursive: true });
    writeFileSync(TORAH_SNAPSHOT, JSON.stringify(snap, null, 1) + '\n');
  }

  mkdirSync(join(ROOT, 'src', 'data'), { recursive: true });
  mkdirSync(PORTIONS_DIR, { recursive: true });

  const catalogBooks: BookCatalogEntry[] = [];
  const catalogPortions: PortionCatalogEntry[] = [];
  let totalTorahVerses = 0;
  let totalTorahWords = 0;

  for (const bookMeta of BOOKS_META) {
    const bSnap = snap.books[bookMeta.id];
    const bookPortionIds: string[] = [];
    let bookVersesCount = 0;

    for (const pNode of bSnap.parashot) {
      const pMeta = PARASHA_META[pNode.sharedTitle];
      if (!pMeta) throw new Error(`Missing PARASHA_META for "${pNode.sharedTitle}"`);
      const whole = parseRef(pNode.wholeRef);
      const aliyotRefs = pNode.aliyot.map(parseRef);
      const aliyahOf = (c: number, v: number) =>
        1 +
        aliyotRefs.findIndex(
          (a) => (c > a.from[0] || (c === a.from[0] && v >= a.from[1])) && (c < a.to[0] || (c === a.to[0] && v <= a.to[1])),
        );

      const verses: VerseData[] = [];
      for (let c = whole.from[0]; c <= whole.to[0]; c++) {
        const chapArr = bSnap.chapters[c - 1];
        if (!chapArr) throw new Error(`Missing ${bookMeta.id} chapter ${c}`);
        const vStart = c === whole.from[0] ? whole.from[1] : 1;
        const vEnd = c === whole.to[0] ? whole.to[1] : chapArr.length;
        for (let v = vStart; v <= vEnd; v++) {
          const html = chapArr[v - 1];
          if (!html) throw new Error(`Missing ${bookMeta.id} ${c}:${v}`);
          verses.push(buildVerse(bookMeta.id, c, v, aliyahOf(c, v), html));
        }
      }

      const portionData: PortionData = {
        schemaVersion: 1,
        id: pMeta.id,
        nameHe: pMeta.nameHe,
        book: bookMeta.id,
        range: pNode.wholeRef,
        aliyot: aliyotRefs.map((a, i) => ({
          n: i + 1,
          from: `${bookMeta.id}.${a.from.join('.')}`,
          to: `${bookMeta.id}.${a.to.join('.')}`,
        })),
        source: {
          edition: snap.version.title,
          license: snap.version.license,
          url: snap.version.source,
          retrievedAt: snap.retrievedAt,
          reviewStatus: 'pending',
        },
        verses,
      };

      validatePortion(portionData);

      // Write individual portion JSON to src/assets/portions/<id>.json
      writeFileSync(join(PORTIONS_DIR, `${pMeta.id}.json`), JSON.stringify(portionData) + '\n');

      // Keep src/data/bereshit.json in sync for unit tests and initial synchronous load
      if (pMeta.id === 'bereshit') {
        if (verses.length !== 146) throw new Error(`expected 146 verses in bereshit, got ${verses.length}`);
        writeFileSync(BERESHIT_OUT, JSON.stringify(portionData) + '\n');
      }

      const aliyotCatalog: AliyahCatalogEntry[] = aliyotRefs.map((a, i) => {
        const n = i + 1;
        const aVerses = verses.filter((v) => v.aliyah === n).map((v) => v.id);
        return {
          n,
          from: `${bookMeta.id}.${a.from.join('.')}`,
          to: `${bookMeta.id}.${a.to.join('.')}`,
          rangeHe: formatRangeHe(a.from, a.to),
          verseIds: aVerses,
        };
      });

      catalogPortions.push({
        id: pMeta.id,
        nameHe: pMeta.nameHe,
        book: bookMeta.id,
        bookNameHe: bookMeta.nameHePlain,
        range: pNode.wholeRef,
        rangeHe: `${bookMeta.nameHePlain} ${formatRangeHe(whole.from, whole.to)}`,
        available: true,
        totalVerses: verses.length,
        aliyot: aliyotCatalog,
      });

      bookPortionIds.push(pMeta.id);
      bookVersesCount += verses.length;
      totalTorahVerses += verses.length;
      totalTorahWords += verses.reduce((s, v) => s + v.words.length, 0);
    }

    catalogBooks.push({
      id: bookMeta.id,
      nameHe: bookMeta.nameHe,
      nameHePlain: bookMeta.nameHePlain,
      order: bookMeta.order,
      portionIds: bookPortionIds,
      totalChapters: bSnap.chapters.length,
      totalVerses: bookVersesCount,
    });
  }

  const catalog: TorahCatalog = {
    schemaVersion: 1,
    books: catalogBooks,
    portions: catalogPortions,
  };

  writeFileSync(CATALOG_OUT, JSON.stringify(catalog) + '\n');
  console.log(
    `Imported all ${catalogBooks.length} books, ${catalogPortions.length} parashot, ${totalTorahVerses} verses, ${totalTorahWords} words.`,
  );
}

main();
