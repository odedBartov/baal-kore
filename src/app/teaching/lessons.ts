// Cantillation lesson planning (spec §12). A new ta'am is taught inside the phrase group where it occurs —
// te'amim are not acoustically independent, so the conjunctives are learned together with their disjunctive.
import type { VerseData } from '../torah/model';

export interface LessonUnit {
  verseId: string;
  groupIndex: number;
  wordIndexes: number[];
  taamim: string[]; // every ta'am chanted in this phrase
  newTaamim: string[]; // the ones this lesson introduces
}

export function planLessons(verse: VerseData, mastered: Iterable<string>): LessonUnit[] {
  const known = new Set(mastered);
  const units: LessonUnit[] = [];
  verse.groups.forEach((g, gi) => {
    const taamim = [...new Set(g.words.flatMap((w) => verse.words[w].taamim))];
    const fresh = taamim.filter((t) => !known.has(t));
    if (!fresh.length) return;
    fresh.forEach((t) => known.add(t));
    units.push({ verseId: verse.id, groupIndex: gi, wordIndexes: g.words, taamim, newTaamim: fresh });
  });
  return units;
}

/** Every ta'am in the verse, for "already mastered?" checks. */
export const verseTaamim = (verse: VerseData) => [...new Set(verse.words.flatMap((w) => w.taamim))];
