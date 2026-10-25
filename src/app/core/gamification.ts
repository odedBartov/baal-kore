// Pure TypeScript gamification engine: user ranks/levels, per-effort ratings, streaks, daily quests,
// time-span challenges, shop catalog, and Aliyah/Parasha average grade analytics.
import type { Category } from '../analysis/types';
import type { VerseData } from '../torah/model';
import type { ChallengePlan, RabbiFrame, StudentProgress, YadStyle } from './state';
export type { ChallengePlan, RabbiFrame, YadStyle } from './state';

export interface UserRankInfo {
  level: number;
  tierId: 'beginner' | 'minyan' | 'barmitzva' | 'baal-kore' | 'master';
  titleHe: string;
  subtitleHe: string;
  badgeIcon: string;
  currentXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressPct: number;
  nextRankTitleHe: string | null;
}

export interface EffortAssessment {
  tierId: 'beginner' | 'advancing' | 'barmitzva' | 'baal-kore';
  titleHe: string;
  subtitleHe: string;
  badgeIcon: string;
  stars: 1 | 2 | 3;
  xpEarned: number;
  coinsEarned: number;
  streakBonusCoins: number;
  boosted: boolean;
  leveledUp: boolean;
  newLevel: number;
  newRankTitleHe: string;
  streakDays: number;
  streakIncremented: boolean;
  freezeUsed: boolean;
  aliyahCrownEarned: number | null;
}

export interface AliyahSummary {
  aliyah: number;
  nameHe: string;
  shortNameHe: string;
  rangeHe: string;
  verseIds: string[];
  totalVerses: number;
  doneVerses: number;
  completedVerses: number;
  progressPct: number;
  averageScore: number | null;
  categoryAverages: Partial<Record<Category, number>>;
  levelTitleHe: string;
  levelIcon: string;
  hasCrown: boolean;
  bossStreak: number;
  allUnlocked: boolean;
}

export interface ParashaSummary {
  totalVerses: number;
  doneVerses: number;
  completedVerses: number;
  progressPct: number;
  averageScore: number | null;
  categoryAverages: Partial<Record<Category, number>>;
  levelTitleHe: string;
  levelIcon: string;
  aliyot: AliyahSummary[];
}

export interface DailyQuest {
  id: 'q-verses' | 'q-score' | 'q-lesson';
  titleHe: string;
  subtitleHe: string;
  icon: string;
  current: number;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  completed: boolean;
  claimed: boolean;
}

export const ALIYAH_NAMES_HE: Record<number, { full: string; short: string }> = {
  1: { full: 'עליית ראשון (כהן)', short: 'ראשון' },
  2: { full: 'עליית שני (לוי)', short: 'שני' },
  3: { full: 'עליית שלישי', short: 'שלישי' },
  4: { full: 'עליית רביעי', short: 'רביעי' },
  5: { full: 'עליית חמישי', short: 'חמישי' },
  6: { full: 'עליית שישי', short: 'שישי' },
  7: { full: 'עליית שביעי', short: 'שביעי' },
};

export const YAD_CATALOG: { id: YadStyle; nameHe: string; descHe: string; price: number; asset: string; icon: string }[] = [
  { id: 'silver', nameHe: 'יד כסף קלאסית', descHe: 'יד הכסף המסורתית עם עיטורי זהב', price: 0, asset: '~/assets/art/yad.png', icon: '🥈' },
  { id: 'gold', nameHe: 'יד זהב מלכותית', descHe: 'יד זהב טהור משובצת אבן אודם בראשה', price: 60, asset: '~/assets/art/yad-gold.png', icon: '🥇' },
  { id: 'emerald', nameHe: 'יד אבן שהם (ברקת)', descHe: 'יד ירוקה מהודרת בהשראת אבני החושן', price: 80, asset: '~/assets/art/yad-emerald.png', icon: '💎' },
  { id: 'royal', nameHe: 'יד כתר תורה', descHe: 'יד ארגמן מלכותית לבעלי קוראים מוסמכים', price: 110, asset: '~/assets/art/yad-royal.png', icon: '👑' },
];

export const FRAME_CATALOG: { id: RabbiFrame; nameHe: string; titleBadgeHe: string; descHe: string; price: number; icon: string }[] = [
  { id: 'classic', nameHe: 'מסגרת קלאסית', titleBadgeHe: 'הרב המלמד', descHe: 'המראה הקלאסי של הרב', price: 0, icon: '📘' },
  { id: 'gold', nameHe: 'מסגרת זהב ירושלמית', titleBadgeHe: 'חונך בר־מצווה', descHe: 'מסגרת זהב חגיגית סביב הרב ותג מיוחד', price: 50, icon: '✨' },
  { id: 'emerald', nameHe: 'מסגרת ברקת החושן', titleBadgeHe: 'אלוף הטעמים', descHe: 'מסגרת ירוקה זוהרת עם עיטור טעמים', price: 75, icon: '🌿' },
  { id: 'crown', nameHe: 'כתר בעל קורא', titleBadgeHe: 'רב־קורא מוסמך 👑', descHe: 'כתר תורה מלכותי מעל דמות הרב', price: 100, icon: '👑' },
];

export const CHALLENGE_PRESETS: Omit<ChallengePlan, 'startedAt' | 'completed'>[] = [
  { id: 'aliyah-3d', titleHe: 'אתגר בזק: עלייה ב־3 ימים', targetDays: 3, targetType: 'aliyah', rewardCoins: 60, rewardXp: 150 },
  { id: 'parasha-7d', titleHe: 'מרתון פרשת בראשית ב־7 ימים', targetDays: 7, targetType: 'parasha', rewardCoins: 250, rewardXp: 600 },
  { id: 'parasha-14d', titleHe: 'אתגר שבועיים: כל הפרשה ב־14 ימים', targetDays: 14, targetType: 'parasha', rewardCoins: 180, rewardXp: 450 },
  { id: 'parasha-30d', titleHe: 'מסלול בר־מצווה: פרשה ב־30 ימים', targetDays: 30, targetType: 'parasha', rewardCoins: 150, rewardXp: 400 },
];

const LEVEL_THRESHOLDS = [0, 120, 280, 500, 780, 1120, 1520, 2000, 2550, 3200, 4000];

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return 999;
  const a = new Date(d1 + 'T00:00:00Z').getTime();
  const b = new Date(d2 + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Computes the user's current level and rank tier (Beginner -> Ready for Bar-Mitzvah -> Official Ba'al Kore). */
export function getUserRank(xp: number): UserRankInfo {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  const levelStartXp = LEVEL_THRESHOLDS[Math.min(level - 1, LEVEL_THRESHOLDS.length - 1)];
  const nextLevelXp = level <= LEVEL_THRESHOLDS.length ? (LEVEL_THRESHOLDS[level] ?? levelStartXp + 1000) : levelStartXp + 1000;
  const progressPct = Math.max(0, Math.min(100, Math.round(((xp - levelStartXp) / Math.max(1, nextLevelXp - levelStartXp)) * 100)));

  if (level <= 2) {
    return {
      level,
      tierId: 'beginner',
      titleHe: 'מתחיל בקריאה',
      subtitleHe: 'צעדים ראשונים בהיכרות עם טעמי המקרא והפסוקים',
      badgeIcon: '🌱',
      currentXp: xp,
      levelStartXp,
      nextLevelXp,
      progressPct,
      nextRankTitleHe: 'קורא במניין (רמה 3)',
    };
  }
  if (level <= 4) {
    return {
      level,
      tierId: 'minyan',
      titleHe: 'קורא במניין',
      subtitleHe: 'שולט ביסודות הניגון ומתקדם בעליות הפרשה',
      badgeIcon: '📜',
      currentXp: xp,
      levelStartXp,
      nextLevelXp,
      progressPct,
      nextRankTitleHe: 'מוכן לבר־מצווה (רמה 5)',
    };
  }
  if (level <= 7) {
    return {
      level,
      tierId: 'barmitzva',
      titleHe: 'מוכן לבר־מצווה',
      subtitleHe: 'קריאה רהוטה, מדויקת ובטוחה לעלייה לתורה',
      badgeIcon: '🕍',
      currentXp: xp,
      levelStartXp,
      nextLevelXp,
      progressPct,
      nextRankTitleHe: 'בעל קורא מוסמך (רמה 8)',
    };
  }
  if (level <= 10) {
    return {
      level,
      tierId: 'baal-kore',
      titleHe: 'בעל קורא מוסמך',
      subtitleHe: 'בקיאות גבוהה במילים, בניקוד ובכל טעמי הפרשה',
      badgeIcon: '👑',
      currentXp: xp,
      levelStartXp,
      nextLevelXp,
      progressPct,
      nextRankTitleHe: 'רב־קורא מומחה (רמה 11)',
    };
  }
  return {
    level,
    tierId: 'master',
    titleHe: 'רב־קורא מומחה',
    subtitleHe: 'מופת של דיוק וניגון בקריאה בתורה',
    badgeIcon: '✨',
    currentXp: xp,
    levelStartXp,
    nextLevelXp,
    progressPct,
    nextRankTitleHe: null,
  };
}

/** Gives a rank title & icon for any average score (0..100) — used per effort, per Aliyah, and for the whole Parasha. */
export function gradeRankForScore(score: number | null): { tierId: 'beginner' | 'advancing' | 'barmitzva' | 'baal-kore'; titleHe: string; subtitleHe: string; icon: string; stars: 1 | 2 | 3 } {
  if (score !== null && score >= 90) {
    return {
      tierId: 'baal-kore',
      titleHe: 'רמת בעל קורא מוסמך',
      subtitleHe: 'ביצוע מופתי! דיוק מעולה במילים, בניקוד ובטעמים.',
      icon: '👑',
      stars: 3,
    };
  }
  if (score !== null && score >= 80) {
    return {
      tierId: 'barmitzva',
      titleHe: 'מוכן לבר־מצווה',
      subtitleHe: 'קריאה יפה ובטוחה מאוד! מוכנים לעלות לתורה בכבוד.',
      icon: '🕍',
      stars: 2,
    };
  }
  if (score !== null && score >= 65) {
    return {
      tierId: 'advancing',
      titleHe: 'קורא מתקדם',
      subtitleHe: 'כיוון מצוין! עוד חזרה קצרה ותגיעו לרמת בר־מצווה.',
      icon: '📜',
      stars: 1,
    };
  }
  return {
    tierId: 'beginner',
    titleHe: 'מתאמן מתחיל',
    subtitleHe: 'כל ניסיון בונה ביטחון! הקשיבו לקורא ונסו שוב.',
    icon: '🌱',
    stars: 1,
  };
}

/** Ensures daily quests counters reset when the calendar day changes. */
export function syncDailyState(p: StudentProgress, today = todayIso()): void {
  if (p.dailyQuestsDate !== today) {
    p.dailyQuestsDate = today;
    p.dailyVersesRead = 0;
    p.dailyHighScores = 0;
    p.dailyLessonsCompleted = 0;
    p.claimedQuestIds = [];
  }
}

/** Updates the student's daily streak, using a Streak Freeze if 1 day was missed. */
export function updateStreakOnActivity(p: StudentProgress, today = todayIso()): { incremented: boolean; freezeUsed: boolean } {
  syncDailyState(p, today);
  if (p.lastActiveDate === today) {
    return { incremented: false, freezeUsed: false };
  }
  const diff = daysBetween(p.lastActiveDate, today);
  let freezeUsed = false;
  if (diff === 1) {
    p.streakDays += 1;
  } else if (diff === 2 && p.streakFreezes > 0 && p.streakDays > 0) {
    p.streakFreezes -= 1;
    p.streakDays += 1;
    freezeUsed = true;
  } else {
    p.streakDays = 1;
  }
  p.bestStreak = Math.max(p.bestStreak, p.streakDays);
  p.lastActiveDate = today;
  return { incremented: true, freezeUsed };
}

/** Applies rewards for a verse reading or lesson attempt and returns the full EffortAssessment for the UI. */
export function applyEffortReward(
  p: StudentProgress,
  opts: { kind: 'verse' | 'lesson'; score: number | null; passed: boolean; aliyah?: number },
  today = todayIso(),
): EffortAssessment {
  const beforeRank = getUserRank(p.xp);
  const { incremented, freezeUsed } = updateStreakOnActivity(p, today);

  const effectiveScore = opts.score ?? (opts.passed ? 88 : 60);
  const grade = gradeRankForScore(effectiveScore);

  let baseXp = opts.kind === 'verse' ? (opts.passed ? 45 : 20) : opts.passed ? 30 : 12;
  if (effectiveScore >= 90) baseXp += 20;
  else if (effectiveScore >= 80) baseXp += 10;

  let baseCoins = opts.kind === 'verse' ? (opts.passed ? 18 : 6) : opts.passed ? 12 : 4;
  if (effectiveScore >= 90) baseCoins += 10;

  const streakBonusCoins = Math.min(20, p.streakDays * 2);
  const boosted = p.doubleXpRemaining > 0;
  if (boosted) p.doubleXpRemaining -= 1;

  const mult = boosted ? 2 : 1;
  const xpEarned = baseXp * mult;
  const coinsEarned = (baseCoins + streakBonusCoins) * mult;

  if (opts.kind === 'verse') {
    p.dailyVersesRead += 1;
    if (effectiveScore >= 85) p.dailyHighScores += 1;
  } else {
    p.dailyLessonsCompleted += 1;
  }

  let aliyahCrownEarned: number | null = null;
  if (opts.kind === 'verse' && opts.aliyah) {
    const k = String(opts.aliyah);
    if (opts.passed) {
      p.aliyahBossStreak[k] = (p.aliyahBossStreak[k] ?? 0) + 1;
      if (p.aliyahBossStreak[k] >= 3 && !p.aliyahCrowns.includes(opts.aliyah)) {
        p.aliyahCrowns.push(opts.aliyah);
        aliyahCrownEarned = opts.aliyah;
        p.coins += 50;
        p.xp += 100;
      }
    } else {
      p.aliyahBossStreak[k] = 0;
    }
  }

  p.xp += xpEarned;
  p.coins += coinsEarned;

  const afterRank = getUserRank(p.xp);
  return {
    tierId: grade.tierId,
    titleHe: grade.titleHe,
    subtitleHe: grade.subtitleHe,
    badgeIcon: grade.icon,
    stars: grade.stars,
    xpEarned,
    coinsEarned,
    streakBonusCoins: streakBonusCoins * mult,
    boosted,
    leveledUp: afterRank.level > beforeRank.level,
    newLevel: afterRank.level,
    newRankTitleHe: afterRank.titleHe,
    streakDays: p.streakDays,
    streakIncremented: incremented,
    freezeUsed,
    aliyahCrownEarned,
  };
}

/** Returns the 3 daily quests with live progress. */
export function getDailyQuests(p: StudentProgress, today = todayIso()): DailyQuest[] {
  const isToday = p.dailyQuestsDate === today;
  const verses = isToday ? p.dailyVersesRead : 0;
  const high = isToday ? p.dailyHighScores : 0;
  const lessons = isToday ? p.dailyLessonsCompleted : 0;
  const claimed = isToday ? p.claimedQuestIds : [];

  return [
    {
      id: 'q-verses',
      titleHe: 'התמדה יומית: קריאת 3 פסוקים',
      subtitleHe: 'קראו והקליטו 3 פסוקים היום',
      icon: '📖',
      current: Math.min(3, verses),
      target: 3,
      rewardCoins: 25,
      rewardXp: 50,
      completed: verses >= 3,
      claimed: claimed.includes('q-verses'),
    },
    {
      id: 'q-score',
      titleHe: 'דיוק של בעל קורא: ציון 85+',
      subtitleHe: 'השיגו ציון 85 ומעלה בפסוק אחד היום',
      icon: '🎯',
      current: Math.min(1, high),
      target: 1,
      rewardCoins: 30,
      rewardXp: 60,
      completed: high >= 1,
      claimed: claimed.includes('q-score'),
    },
    {
      id: 'q-lesson',
      titleHe: 'לימוד טעמים: השלמת שיעור או תרגול',
      subtitleHe: 'תרגלו שיעור טעמים או קראו פסוק נוסף',
      icon: '🎵',
      current: Math.min(1, lessons + (verses >= 2 ? 1 : 0)),
      target: 1,
      rewardCoins: 20,
      rewardXp: 40,
      completed: lessons >= 1 || verses >= 2,
      claimed: claimed.includes('q-lesson'),
    },
  ];
}

/** Computes average grades and mastery for each of the 7 Aliyot and for the entire Parasha. */
export function computeParashaSummary(
  verses: VerseData[],
  p: StudentProgress,
  hebrewNum: (n: number) => string,
): ParashaSummary {
  const doneSet = new Set([...p.completedVerseIds, ...p.practicedVerseIds]);
  const unlockedSet = new Set(p.unlockedVerseIds ?? []);

  const scoreForVerse = (id: string): number | null => {
    if (typeof p.bestScores[id] === 'number') return p.bestScores[id];
    const last = p.lastAttempts[id];
    if (last && typeof last.overallScore === 'number') return last.overallScore;
    if (last) {
      const valid = last.categories.map((c) => c.score).filter((s): s is number => typeof s === 'number');
      if (valid.length) return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    }
    return null;
  };

  const categoryAvgForVerses = (vs: VerseData[]): Partial<Record<Category, number>> => {
    const sums: Partial<Record<Category, { sum: number; count: number }>> = {};
    for (const v of vs) {
      const last = p.lastAttempts[v.id];
      if (!last) continue;
      for (const c of last.categories) {
        if (typeof c.score === 'number') {
          const cur = sums[c.category] ?? { sum: 0, count: 0 };
          cur.sum += c.score;
          cur.count += 1;
          sums[c.category] = cur;
        }
      }
    }
    const out: Partial<Record<Category, number>> = {};
    for (const [k, v] of Object.entries(sums)) {
      if (v && v.count > 0) out[k as Category] = Math.round(v.sum / v.count);
    }
    return out;
  };

  const aliyot: AliyahSummary[] = [1, 2, 3, 4, 5, 6, 7].map((a) => {
    const av = verses.filter((v) => v.aliyah === a);
    const first = av[0];
    const last = av[av.length - 1];
    const rangeHe = first && last ? `פרק ${hebrewNum(first.chapter)}:${hebrewNum(first.verse)} – ${hebrewNum(last.chapter)}:${hebrewNum(last.verse)}` : '';
    const doneVerses = av.filter((v) => doneSet.has(v.id)).length;
    const completedVerses = av.filter((v) => p.completedVerseIds.includes(v.id)).length;
    const scores = av.map((v) => scoreForVerse(v.id)).filter((s): s is number => s !== null);
    const averageScore = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
    const rank = gradeRankForScore(averageScore);
    const allUnlocked = av.every((v, idx) => idx === 0 && a === 1 ? true : doneSet.has(v.id) || unlockedSet.has(v.id));

    return {
      aliyah: a,
      nameHe: ALIYAH_NAMES_HE[a]?.full ?? `עלייה ${a}`,
      shortNameHe: ALIYAH_NAMES_HE[a]?.short ?? `${a}`,
      rangeHe,
      verseIds: av.map((v) => v.id),
      totalVerses: av.length,
      doneVerses,
      completedVerses,
      progressPct: av.length ? Math.round((doneVerses / av.length) * 100) : 0,
      averageScore,
      categoryAverages: categoryAvgForVerses(av),
      levelTitleHe: averageScore !== null ? rank.titleHe : 'טרם נבדק',
      levelIcon: averageScore !== null ? rank.icon : '📖',
      hasCrown: p.aliyahCrowns.includes(a),
      bossStreak: Math.min(3, p.aliyahBossStreak[String(a)] ?? 0),
      allUnlocked,
    };
  });

  const allScores = verses.map((v) => scoreForVerse(v.id)).filter((s): s is number => s !== null);
  const averageScore = allScores.length ? Math.round(allScores.reduce((x, y) => x + y, 0) / allScores.length) : null;
  const doneVerses = verses.filter((v) => doneSet.has(v.id)).length;
  const completedVerses = verses.filter((v) => p.completedVerseIds.includes(v.id)).length;
  const rank = gradeRankForScore(averageScore);

  return {
    totalVerses: verses.length,
    doneVerses,
    completedVerses,
    progressPct: verses.length ? Math.round((doneVerses / verses.length) * 100) : 0,
    averageScore,
    categoryAverages: categoryAvgForVerses(verses),
    levelTitleHe: averageScore !== null ? rank.titleHe : 'מתחיל בפרשה',
    levelIcon: averageScore !== null ? rank.icon : '🌱',
    aliyot,
  };
}

/** Computes progress and daily pace for an active Time-Span Challenge. */
export function computeChallengeStatus(
  plan: ChallengePlan | null,
  summary: ParashaSummary,
  today = todayIso(),
): {
  active: boolean;
  titleHe: string;
  daysElapsed: number;
  daysLeft: number;
  totalTargetVerses: number;
  doneTargetVerses: number;
  remainingVerses: number;
  versesPerDayNeeded: number;
  progressPct: number;
  onTrack: boolean;
  completed: boolean;
} | null {
  if (!plan) return null;
  const elapsed = Math.max(0, daysBetween(plan.startedAt, today));
  const daysLeft = Math.max(1, plan.targetDays - elapsed);
  const targetAliyah = plan.targetType === 'aliyah' && plan.aliyah ? summary.aliyot.find((a) => a.aliyah === plan.aliyah) : null;
  const totalTargetVerses = targetAliyah ? targetAliyah.totalVerses : summary.totalVerses;
  const doneTargetVerses = targetAliyah ? targetAliyah.doneVerses : summary.doneVerses;
  const remainingVerses = Math.max(0, totalTargetVerses - doneTargetVerses);
  const versesPerDayNeeded = remainingVerses === 0 ? 0 : Math.ceil(remainingVerses / daysLeft);
  const progressPct = totalTargetVerses ? Math.round((doneTargetVerses / totalTargetVerses) * 100) : 0;
  const expectedDone = Math.floor((elapsed / Math.max(1, plan.targetDays)) * totalTargetVerses);

  return {
    active: true,
    titleHe: plan.titleHe,
    daysElapsed: elapsed,
    daysLeft,
    totalTargetVerses,
    doneTargetVerses,
    remainingVerses,
    versesPerDayNeeded,
    progressPct,
    onTrack: doneTargetVerses >= expectedDone,
    completed: remainingVerses === 0,
  };
}
