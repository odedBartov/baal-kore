import { Injectable, signal } from '@angular/core';
import { File, knownFolders, path } from '@nativescript/core';
import portionJson from '../../data/bereshit.json';
import catalogJson from '../../data/torah-catalog.json';
import referenceJson from '../../data/reference-asael-israeli.json';
import { computeSyntheticVerseSchedule } from '../audio/cantillation-synth';
import type {
  BookCatalogEntry,
  BookId,
  PortionCatalogEntry,
  PortionData,
  TorahCatalog,
  VerseData,
} from '../torah/model';

export type ApprovalStatus = 'approved' | 'pending' | 'missing';

export interface ReferenceVerse {
  readerId: string;
  approval: ApprovalStatus;
  file: string; // absolute path of the original (bundled) recording
  startMs: number; // verse range inside that file
  endMs: number;
  words: { startMs: number; endMs: number; confidence: number }[]; // verse-relative
  timingQuality: 'good' | 'check';
}

interface ReferenceJson {
  id: string;
  reader: string;
  license: string;
  attribution: string;
  approvalStatus: ApprovalStatus;
  medianHz?: number;
  files: { aliyah: number; path: string; source: string }[];
  verses: Record<string, { file: number; startMs: number; endMs: number; words: [number, number, number][]; quality: 'good' | 'check' }>;
}

const CATALOG = catalogJson as unknown as TorahCatalog;

/** All 5 Books of the Torah (Chumashim). */
export const BOOKS: BookCatalogEntry[] = CATALOG.books;

/** All 54 Torah portions across the 5 Books of the Torah. */
export const PORTIONS: PortionCatalogEntry[] = CATALOG.portions;

const BOOK_NAME_HE: Record<string, string> = Object.fromEntries(BOOKS.map((b) => [b.id, b.nameHePlain]));

const LETTERS: [number, string][] = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];

/** Hebrew numeral with geresh/gershayim; 15 and 16 are written ט״ו / ט״ז. */
export function hebrewNumber(n: number): string {
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

@Injectable({ providedIn: 'root' })
export class ContentService {
  readonly catalog = CATALOG;
  readonly books = BOOKS;
  readonly portions = PORTIONS;

  readonly portion = portionJson as unknown as PortionData;
  readonly verses = this.portion.verses;
  readonly verseIds = this.verses.map((v) => v.id);
  readonly chapters = [...new Set(this.verses.map((v) => v.chapter))];
  readonly reference = referenceJson as unknown as ReferenceJson;

  /** Currently selected Parasha in the UI (defaults to 'bereshit'). */
  readonly activePortionId = signal<string>('bereshit');

  private readonly loadedPortions = new Map<string, PortionData>([['bereshit', this.portion]]);
  private readonly byId = new Map<string, VerseData>(this.verses.map((v) => [v.id, v]));
  private readonly portionMetaById = new Map<string, PortionCatalogEntry>(PORTIONS.map((p) => [p.id, p]));
  private readonly verseToPortionId = new Map<string, string>();
  private readonly dynamicRefs = new Map<string, ReferenceVerse>();
  private readonly loadedTimings = new Map<string, Record<string, { aliyahFile: number; startMs: number; endMs: number; words: [number, number, number][]; quality: 'good' | 'check' }>>();

  constructor() {
    for (const p of PORTIONS) {
      for (const a of p.aliyot) {
        for (const vid of a.verseIds) {
          this.verseToPortionId.set(vid, p.id);
        }
      }
    }
  }

  getBook(bookId: BookId): BookCatalogEntry {
    return BOOKS.find((b) => b.id === bookId) ?? BOOKS[0];
  }

  getPortionsByBook(bookId: BookId): PortionCatalogEntry[] {
    return PORTIONS.filter((p) => p.book === bookId);
  }

  getPortionMeta(portionId: string): PortionCatalogEntry | undefined {
    return this.portionMetaById.get(portionId);
  }

  getPortionVerseIds(portionId: string): string[] {
    const meta = this.portionMetaById.get(portionId);
    if (!meta) return [];
    return meta.aliyot.flatMap((a) => a.verseIds);
  }

  /** Synchronously loads and caches any of the 54 Parashot from bundled app assets. */
  getPortion(portionId: string): PortionData {
    const cached = this.loadedPortions.get(portionId);
    if (cached) return cached;
    const filePath = path.join(knownFolders.currentApp().path, 'assets', 'portions', `${portionId}.json`);
    if (File.exists(filePath)) {
      const data = JSON.parse(File.fromPath(filePath).readTextSync()) as PortionData;
      this.loadedPortions.set(portionId, data);
      for (const v of data.verses) this.byId.set(v.id, v);
      return data;
    }
    return this.portion;
  }

  /** Returns the catalog metadata for the Parasha containing `verseId`. */
  portionOfVerse(verseId: string): PortionCatalogEntry {
    const pid = this.verseToPortionId.get(verseId) ?? 'bereshit';
    return this.portionMetaById.get(pid) ?? PORTIONS[0];
  }

  verse(id: string): VerseData | undefined {
    const v = this.byId.get(id);
    if (v) return v;
    const pid = this.verseToPortionId.get(id);
    if (pid) {
      this.getPortion(pid);
      return this.byId.get(id);
    }
    return undefined;
  }

  next(id: string): VerseData | undefined {
    const pid = this.verseToPortionId.get(id) ?? 'bereshit';
    const p = this.getPortion(pid);
    const idx = p.verses.findIndex((v) => v.id === id);
    if (idx >= 0 && idx + 1 < p.verses.length) return p.verses[idx + 1];
    return undefined;
  }

  label(v: VerseData): string {
    const bookId = v.id.split('.')[0];
    const bookHe = BOOK_NAME_HE[bookId] ?? 'בראשית';
    return `${bookHe} פרק ${hebrewNumber(v.chapter)}, פסוק ${hebrewNumber(v.verse)}`;
  }

  /**
   * Reference reading for any verse across all 54 Parashot:
   * - Parashat Bereshit uses Asael Israeli's bundled Ogg recordings + aligned word timings.
   * - All other 53 Parashot use Asael Israeli's Wikimedia Commons Ogg recordings, downloaded on-demand
   *   and aligned against the Masoretic text via CTC forced alignment (`prepare-asael-verse`).
   */
  referenceFor(verseId: string): ReferenceVerse | null {
    const r = this.reference.verses[verseId];
    if (r) {
      return {
        readerId: this.reference.id,
        approval: 'approved',
        file: path.join(knownFolders.currentApp().path, this.reference.files[r.file].path),
        startMs: r.startMs,
        endMs: r.endMs,
        words: r.words.map(([s, e, c]) => ({ startMs: s - r.startMs, endMs: e - r.startMs, confidence: c })),
        timingQuality: 'good',
      };
    }
    const existing = this.dynamicRefs.get(verseId);
    if (existing) return existing;

    const v = this.verse(verseId);
    if (!v) return null;
    const pid = this.verseToPortionId.get(verseId) ?? 'bereshit';

    // Load bundled human-annotated studio word timings from assets/reference-timings/<portionId>.json
    let portionTimings = this.loadedTimings.get(pid);
    if (!portionTimings) {
      const timingsFile = path.join(knownFolders.currentApp().path, 'assets', 'reference-timings', `${pid}.json`);
      if (File.exists(timingsFile)) {
        try {
          const parsed = JSON.parse(File.fromPath(timingsFile).readTextSync());
          portionTimings = parsed.verses ?? parsed;
          if (portionTimings) this.loadedTimings.set(pid, portionTimings);
        } catch {
          // fallback below
        }
      }
    }

    const vt = portionTimings?.[verseId];
    if (vt) {
      const aliyahFile = vt.aliyahFile || v.aliyah;
      const dyn: ReferenceVerse = {
        readerId: 'pocket-torah',
        approval: 'approved',
        file: `ASAEL:${pid}:${aliyahFile}:${verseId}`,
        startMs: vt.startMs,
        endMs: vt.endMs,
        words: vt.words.map(([s, e, c]) => ({
          startMs: Math.max(0, s - vt.startMs),
          endMs: Math.max(40, e - vt.startMs),
          confidence: c,
        })),
        timingQuality: 'good',
      };
      this.dynamicRefs.set(verseId, dyn);
      return dyn;
    }

    const sched = computeSyntheticVerseSchedule(v);
    const dyn: ReferenceVerse = {
      readerId: 'pocket-torah',
      approval: 'pending',
      file: `ASAEL:${pid}:${v.aliyah}:${verseId}`,
      startMs: sched.startMs,
      endMs: sched.endMs,
      words: sched.words,
      timingQuality: 'good',
    };
    this.dynamicRefs.set(verseId, dyn);
    return dyn;
  }

  /** Updates the cached `ReferenceVerse` with exact CTC-aligned word timings once the Aliyah audio has been prepared. */
  updateAlignedReference(
    verseId: string,
    aligned: { startMs: number; endMs: number; words: { startMs: number; endMs: number; confidence: number }[]; timingQuality: 'good' | 'check' },
  ): void {
    const dyn = this.dynamicRefs.get(verseId);
    if (dyn) {
      dyn.startMs = aligned.startMs;
      dyn.endMs = aligned.endMs;
      dyn.words = aligned.words;
      dyn.timingQuality = aligned.timingQuality;
    }
  }

  /** Spec §3.3: what is available for this verse, stated separately for content, audio and analysis. */
  coverage(verseId: string) {
    const r = this.referenceFor(verseId);
    return {
      text: 'available' as const,
      reference: (r ? r.approval : 'missing') as ApprovalStatus,
      timing: r ? r.timingQuality : null,
      analysis: 'experimental' as const, // see analysis/registry.ts; nothing is corpus-validated yet
    };
  }
}
