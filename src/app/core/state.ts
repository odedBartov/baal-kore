// Persisted student state and settings (spec §16–17). Pure TypeScript with explicit schema versions and
// migrations, so stored progress survives app updates.
import type { Category, EvaluationStatus } from '../analysis/types';

export interface AttemptSummary {
  at: string;
  status: EvaluationStatus;
  overallScore: number | null;
  categories: { category: Category; score: number | null }[];
  errorKinds: string[];
}

export interface StudentProgress {
  schemaVersion: 2;
  welcomed: boolean;
  currentVerseId: string;
  completedVerseIds: string[]; // verified pass (definitive score ≥ threshold)
  practicedVerseIds: string[]; // practised and confirmed by the student when no verified score was possible
  masteredCantillationIds: string[];
  bestScores: Record<string, number>; // definitive scores only
  attemptCounts: Record<string, number>;
  lastAttempts: Record<string, AttemptSummary>;
  mistakeCounts: Record<string, number>; // e.g. "taam:tipcha", "words", "pause"
  lessonFailures: Record<string, number>; // per ta'am
}

export interface Settings {
  schemaVersion: 2;
  passingThreshold: number; // 0..100 (spec default 85)
  lessonMaxDeviation: number; // semitones; lesson imitation passes at/below (provisional)
  keepRecordings: boolean; // keep the latest attempt per verse for replay
  pronunciation: 'israeli' | 'ashkenazi'; // which vowels the niqqud check expects
}

export const FIRST_VERSE = 'Genesis.1.1';

export const defaultProgress = (): StudentProgress => ({
  schemaVersion: 2,
  welcomed: false,
  currentVerseId: FIRST_VERSE,
  completedVerseIds: [],
  practicedVerseIds: [],
  masteredCantillationIds: [],
  bestScores: {},
  attemptCounts: {},
  lastAttempts: {},
  mistakeCounts: {},
  lessonFailures: {},
});

export const defaultSettings = (): Settings => ({
  schemaVersion: 2,
  passingThreshold: 85,
  lessonMaxDeviation: 1.0, // provisional: passes ~97% / 80% of correct imitations (same / other singer), docs/validation.md
  keepRecordings: true,
  pronunciation: 'israeli',
});

/** Accepts anything previously stored (or garbage) and returns a valid current-version object. */
export function migrateProgress(raw: unknown): StudentProgress {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const v = typeof p.schemaVersion === 'number' ? p.schemaVersion : 0;
  if (v === 1) {
    // v1 had a single completedVerseIds list fed by self-confirmation; move those to "practiced".
    p.practicedVerseIds = p.completedVerseIds ?? [];
    p.completedVerseIds = [];
    p.lessonFailures = {};
  }
  const d = defaultProgress();
  const pick = <K extends keyof StudentProgress>(k: K, ok: (x: unknown) => boolean) => (ok(p[k]) ? (p[k] as StudentProgress[K]) : d[k]);
  const isList = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === 'string');
  const isMap = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
  return {
    schemaVersion: 2,
    welcomed: pick('welcomed', (x) => typeof x === 'boolean'),
    currentVerseId: pick('currentVerseId', (x) => typeof x === 'string'),
    completedVerseIds: pick('completedVerseIds', isList),
    practicedVerseIds: pick('practicedVerseIds', isList),
    masteredCantillationIds: pick('masteredCantillationIds', isList),
    bestScores: pick('bestScores', isMap),
    attemptCounts: pick('attemptCounts', isMap),
    lastAttempts: pick('lastAttempts', isMap),
    mistakeCounts: pick('mistakeCounts', isMap),
    lessonFailures: pick('lessonFailures', isMap),
  };
}

export function migrateSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const d = defaultSettings();
  const num = (x: unknown, lo: number, hi: number, dflt: number) => (typeof x === 'number' && x >= lo && x <= hi ? x : dflt);
  const v = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0;
  return {
    schemaVersion: 2,
    passingThreshold: num(s.passingThreshold, 50, 100, d.passingThreshold),
    // v2: the lesson check moved to pitch alignment (analysis/melody.ts), a different deviation scale → reset.
    lessonMaxDeviation: v >= 2 ? num(s.lessonMaxDeviation, 0.5, 4, d.lessonMaxDeviation) : d.lessonMaxDeviation,
    keepRecordings: typeof s.keepRecordings === 'boolean' ? s.keepRecordings : d.keepRecordings,
    pronunciation: s.pronunciation === 'ashkenazi' ? 'ashkenazi' : 'israeli',
  };
}

/** A verse unlocks once the previous verse is completed or practised (sequential journey, spec §4.2). */
export function isUnlocked(verseIds: string[], id: string, p: StudentProgress): boolean {
  const i = verseIds.indexOf(id);
  if (i <= 0) return i === 0;
  const prev = verseIds[i - 1];
  return p.completedVerseIds.includes(prev) || p.practicedVerseIds.includes(prev) || p.completedVerseIds.includes(id) || p.practicedVerseIds.includes(id);
}
