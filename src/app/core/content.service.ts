import { Injectable } from '@angular/core';
import { knownFolders, path } from '@nativescript/core';
import portionJson from '../../data/bereshit.json';
import referenceJson from '../../data/reference-asael-israeli.json';
import type { PortionData, VerseData } from '../torah/model';

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

/** Torah portions of Genesis; only Bereshit has content in this POC (others shown disabled, spec §4.2). */
export const PORTIONS = [
  { id: 'bereshit', nameHe: 'בְּרֵאשִׁית', available: true },
  ...['נֹחַ', 'לֶךְ־לְךָ', 'וַיֵּרָא', 'חַיֵּי שָׂרָה', 'תּוֹלְדֹת', 'וַיֵּצֵא', 'וַיִּשְׁלַח', 'וַיֵּשֶׁב', 'מִקֵּץ', 'וַיִּגַּשׁ', 'וַיְחִי'].map((nameHe, i) => ({ id: `genesis-${i + 2}`, nameHe, available: false })),
];

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
  readonly portion = portionJson as unknown as PortionData;
  readonly verses = this.portion.verses;
  readonly verseIds = this.verses.map((v) => v.id);
  readonly chapters = [...new Set(this.verses.map((v) => v.chapter))];
  readonly reference = referenceJson as unknown as ReferenceJson;
  private readonly byId = new Map(this.verses.map((v) => [v.id, v]));

  verse(id: string): VerseData | undefined {
    return this.byId.get(id);
  }

  next(id: string): VerseData | undefined {
    return this.verses[this.verseIds.indexOf(id) + 1];
  }

  label(v: VerseData): string {
    return `בראשית פרק ${hebrewNumber(v.chapter)}, פסוק ${hebrewNumber(v.verse)}`;
  }

  /** Reference reading for a verse. Missing when no recording covers it (never silently substituted). */
  referenceFor(verseId: string): ReferenceVerse | null {
    const r = this.reference.verses[verseId];
    if (!r) return null;
    return {
      readerId: this.reference.id,
      approval: this.reference.approvalStatus,
      file: path.join(knownFolders.currentApp().path, this.reference.files[r.file].path),
      startMs: r.startMs,
      endMs: r.endMs,
      words: r.words.map(([s, e, c]) => ({ startMs: s - r.startMs, endMs: e - r.startMs, confidence: c })),
      timingQuality: r.quality,
    };
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
