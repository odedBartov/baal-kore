// Persisted student state and settings (spec §16–17). Pure TypeScript with explicit schema versions and
// migrations, so stored progress survives app updates.
import type { Category, EvaluationStatus } from '../analysis/types';

export type YadStyle = 'silver' | 'gold' | 'royal' | 'emerald';
export type RabbiFrame = 'classic' | 'gold' | 'crown' | 'emerald';

export const PARASHA_PRICE_ILS = 10;
export const PARASHA_PRICE_LABEL_HE = '10 ₪';

export const PLAY_SKU_FULL = 'parasha_unlock';

/**
 * Google Play Console reusable One-Time Product ID (SKU) for unlocking Aliyot 2–7 of any Parasha (`parasha_unlock`, 10 ₪).
 */
export function playProductIdForPortion(_portionId: string): string {
  return PLAY_SKU_FULL;
}

/** Maps legacy per-Parasha product IDs back to internal Parasha IDs if present. */
export function portionIdFromPlayProductId(productId: string, knownPortionIds: string[]): string | null {
  for (const id of knownPortionIds) {
    if (`parasha_${id.replace(/-/g, '_')}` === productId) return id;
  }
  return null;
}

export function priceLabelForDiscount(_discountPct = 0): string {
  return PARASHA_PRICE_LABEL_HE;
}

export interface ChallengePlan {
  id: string;
  titleHe: string;
  targetDays: number;
  startedAt: string; // YYYY-MM-DD
  targetType: 'parasha' | 'aliyah';
  aliyah?: number; // 1..7 when targetType === 'aliyah'
  rewardCoins: number;
  rewardXp: number;
  completed?: boolean;
}

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
  // ---- Gamification & Progression ----
  xp: number;
  coins: number;
  streakDays: number;
  bestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD or ''
  streakFreezes: number;
  doubleXpRemaining: number;
  unlockedVerseIds: string[];
  purchasedPortionIds: string[]; // Parashot unlocked via ₪10 Google Play Billing purchase or online coupon (Aliyot 2–7)
  redeemedCoupons: string[]; // Online coupon IDs redeemed on this device
  couponUnlockedPortions: Record<string, string[]>; // Map of couponId -> portionIds unlocked by that coupon (so revoking a coupon online re-locks them)
  activeDiscountPct: number; // Reserved (0)
  ownedYads: YadStyle[];
  equippedYad: YadStyle;
  ownedFrames: RabbiFrame[];
  equippedFrame: RabbiFrame;
  challengePlan: ChallengePlan | null;
  dailyQuestsDate: string; // YYYY-MM-DD or ''
  dailyVersesRead: number;
  dailyHighScores: number;
  dailyLessonsCompleted: number;
  claimedQuestIds: string[];
  aliyahBossStreak: Record<string, number>;
  aliyahCrowns: number[];
}

export interface Settings {
  schemaVersion: 2;
  passingThreshold: number; // 0..100 (spec default 85)
  lessonMaxDeviation: number; // semitones; lesson imitation passes at/below (provisional)
  keepRecordings: boolean; // keep the latest attempt per verse for replay
  pronunciation: 'israeli' | 'ashkenazi'; // which vowels the niqqud check expects
  reminderEnabled: boolean;
  reminderHour: number; // 0..23
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
  xp: 0,
  coins: 50,
  streakDays: 0,
  bestStreak: 0,
  lastActiveDate: '',
  streakFreezes: 1,
  doubleXpRemaining: 0,
  unlockedVerseIds: [],
  purchasedPortionIds: [],
  redeemedCoupons: [],
  couponUnlockedPortions: {},
  activeDiscountPct: 0,
  ownedYads: ['silver'],
  equippedYad: 'silver',
  ownedFrames: ['classic'],
  equippedFrame: 'classic',
  challengePlan: null,
  dailyQuestsDate: '',
  dailyVersesRead: 0,
  dailyHighScores: 0,
  dailyLessonsCompleted: 0,
  claimedQuestIds: [],
  aliyahBossStreak: {},
  aliyahCrowns: [],
});

export const defaultSettings = (): Settings => ({
  schemaVersion: 2,
  passingThreshold: 85,
  lessonMaxDeviation: 0.75, // provisional: passes ~97% / 80% of correct imitations (same / other singer), docs/validation.md
  keepRecordings: true,
  pronunciation: 'israeli',
  reminderEnabled: true,
  reminderHour: 18,
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
  const isNumList = (x: unknown) => Array.isArray(x) && x.every((n) => typeof n === 'number');
  const isMap = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
  const isNonNeg = (x: unknown) => typeof x === 'number' && x >= 0;
  const isYad = (x: unknown): x is YadStyle => x === 'silver' || x === 'gold' || x === 'royal' || x === 'emerald';
  const isFrame = (x: unknown): x is RabbiFrame => x === 'classic' || x === 'gold' || x === 'crown' || x === 'emerald';
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
    xp: pick('xp', isNonNeg),
    coins: pick('coins', isNonNeg),
    streakDays: pick('streakDays', isNonNeg),
    bestStreak: pick('bestStreak', isNonNeg),
    lastActiveDate: pick('lastActiveDate', (x) => typeof x === 'string'),
    streakFreezes: pick('streakFreezes', isNonNeg),
    doubleXpRemaining: pick('doubleXpRemaining', isNonNeg),
    unlockedVerseIds: pick('unlockedVerseIds', isList),
    purchasedPortionIds: pick('purchasedPortionIds', isList),
    redeemedCoupons: pick('redeemedCoupons', isList),
    couponUnlockedPortions: pick('couponUnlockedPortions', isMap),
    activeDiscountPct: pick('activeDiscountPct', isNonNeg),
    ownedYads: pick('ownedYads', (x) => Array.isArray(x) && x.length > 0 && x.every(isYad)),
    equippedYad: pick('equippedYad', isYad),
    ownedFrames: pick('ownedFrames', (x) => Array.isArray(x) && x.length > 0 && x.every(isFrame)),
    equippedFrame: pick('equippedFrame', isFrame),
    challengePlan: pick('challengePlan', (x) => x === null || (isMap(x) && typeof (x as unknown as ChallengePlan).targetDays === 'number')),
    dailyQuestsDate: pick('dailyQuestsDate', (x) => typeof x === 'string'),
    dailyVersesRead: pick('dailyVersesRead', isNonNeg),
    dailyHighScores: pick('dailyHighScores', isNonNeg),
    dailyLessonsCompleted: pick('dailyLessonsCompleted', isNonNeg),
    claimedQuestIds: pick('claimedQuestIds', isList),
    aliyahBossStreak: pick('aliyahBossStreak', isMap),
    aliyahCrowns: pick('aliyahCrowns', isNumList),
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
    reminderEnabled: typeof s.reminderEnabled === 'boolean' ? s.reminderEnabled : d.reminderEnabled,
    reminderHour: num(s.reminderHour, 0, 23, d.reminderHour),
  };
}

/** Whether Aliyot 2–7 of `portionId` have been unlocked via the ₪10 Parasha purchase. */
export function isPortionPurchased(portionId: string, p: StudentProgress): boolean {
  return Boolean(p.purchasedPortionIds?.includes(portionId));
}

/**
 * First Aliyah (aliyah === 1) of every Parasha is 100% free and all its verses are immediately open.
 * Aliyot 2–7 are behind the ₪10 per-Parasha paywall and all their verses open immediately once purchased.
 */
export function isAliyahAccessible(portionId: string, aliyah: number, p: StudentProgress): boolean {
  if (aliyah <= 1) return true;
  return isPortionPurchased(portionId, p);
}

export function isVerseAccessible(portionId: string, aliyah: number, p: StudentProgress): boolean {
  return isAliyahAccessible(portionId, aliyah, p);
}

/** Legacy verse-level helper preserved for unit test compatibility; uses `isVerseAccessible` when `opts` is provided. */
export function isUnlocked(
  verseIds: string[],
  id: string,
  p: StudentProgress,
  opts?: { portionId: string; aliyah: number },
): boolean {
  if (opts) return isVerseAccessible(opts.portionId, opts.aliyah, p);
  if (p.unlockedVerseIds?.includes(id)) return true;
  const i = verseIds.indexOf(id);
  if (i <= 0) return i === 0;
  const prev = verseIds[i - 1];
  return p.completedVerseIds.includes(prev) || p.practicedVerseIds.includes(prev) || p.completedVerseIds.includes(id) || p.practicedVerseIds.includes(id);
}
