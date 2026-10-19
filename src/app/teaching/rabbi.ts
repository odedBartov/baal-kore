// The rabbi's deterministic teaching rules (spec §11.3). Inputs are real analysis results and learning
// history; output is a Hebrew text bubble plus an expression. No language model, no audio narration.
// Wording is gender-neutral (infinitives / plural), so it suits Bar and Bat Mitzvah students and adults.
import type { VerseEvaluation } from '../analysis/types';
import type { AttemptSummary } from '../core/state';
import { TAAM_BY_ID } from '../torah/cantillation';

export type Expression = 'neutral' | 'happy' | 'encouraging' | 'explaining' | 'thinking' | 'correcting';

export interface RabbiLine {
  expression: Expression;
  text: string;
  ruleId: string;
  suggestLesson?: string; // ta'am id the student should revisit
}

export type RabbiEvent =
  | { kind: 'welcome'; returning: boolean; where?: string }
  | { kind: 'portions' }
  | { kind: 'verse-intro'; where: string; attempts: number; done: boolean }
  | { kind: 'listening' }
  | { kind: 'recording' }
  | { kind: 'analyzing' }
  | { kind: 'lesson-intro'; newTaamim: string[]; words: string }
  | { kind: 'lesson-result'; passed: boolean; inconclusive: boolean; reasonHe?: string; failures: number; newTaamim: string[] }
  | { kind: 'evaluation'; evaluation: VerseEvaluation; previous?: AttemptSummary; attempt: number; mistakeCounts: Record<string, number> };

interface Rule {
  id: string;
  when: (e: RabbiEvent) => boolean;
  say: (e: RabbiEvent) => Omit<RabbiLine, 'ruleId'>;
}

const names = (ids: string[]) => ids.map((t) => TAAM_BY_ID[t]?.nameHe ?? t).join(', ');
const ev = (e: RabbiEvent) => (e.kind === 'evaluation' ? e : null);
const pick = <T>(variants: T[], n: number) => variants[Math.abs(n) % variants.length]; // deterministic variety
const MENTION_CONFIDENCE = 0.6; // never name a word or ta'am on weaker evidence (spec §4.4)

// Highest priority first.
export const RULES: Rule[] = [
  { id: 'welcome-back', when: (e) => e.kind === 'welcome' && e.returning, say: (e) => ({ expression: 'happy', text: `ברוכים השבים! נמשיך מ${(e as { where?: string }).where ?? 'המקום שבו עצרנו'}.` }) },
  {
    id: 'welcome',
    when: (e) => e.kind === 'welcome',
    say: () => ({ expression: 'happy', text: 'שלום! אני הרב שילמד אתכם לקרוא בתורה. נקשיב יחד לקורא, נלמד את הטעמים, ואחר כך תקראו בעצמכם ואגיד לכם מה כבר טוב ומה כדאי לשפר. אפשר לשיר בגובה שנוח לכם – אני בודק רק את המנגינה עצמה.' }),
  },
  { id: 'portions', when: (e) => e.kind === 'portions', say: () => ({ expression: 'neutral', text: 'נתחיל בפרשת בראשית. את שאר הפרשות נוסיף בהמשך.' }) },
  { id: 'listening', when: (e) => e.kind === 'listening', say: () => ({ expression: 'explaining', text: 'הקשיבו לקורא ועקבו אחרי היד. שימו לב איפה המנגינה עולה ואיפה היא יורדת.' }) },
  { id: 'recording', when: (e) => e.kind === 'recording', say: () => ({ expression: 'neutral', text: 'אני מקשיב. קראו את כל הפסוק, ובסוף לחצו על "סיום".' }) },
  { id: 'analyzing', when: (e) => e.kind === 'analyzing', say: () => ({ expression: 'thinking', text: 'רגע, אני מקשיב שוב להקלטה…' }) },
  {
    id: 'verse-intro-done',
    when: (e) => e.kind === 'verse-intro' && e.done,
    say: (e) => ({ expression: 'encouraging', text: `את ${(e as { where: string }).where} כבר תרגלתם. אפשר לקרוא שוב לחזרה, או להמשיך לפסוק הבא.` }),
  },
  {
    id: 'verse-intro',
    when: (e) => e.kind === 'verse-intro',
    say: (e) => ({ expression: 'explaining', text: `${(e as { where: string }).where}. קודם נקשיב לקורא, ואז תורכם לקרוא את כל הפסוק.` }),
  },
  {
    id: 'lesson-intro',
    when: (e) => e.kind === 'lesson-intro',
    say: (e) => {
      const l = e as { newTaamim: string[]; words: string };
      return { expression: 'explaining', text: `בפסוק הזה יש ${l.newTaamim.length > 1 ? 'טעמים חדשים' : 'טעם חדש'}: ${names(l.newTaamim)}. נלמד ${l.newTaamim.length > 1 ? 'אותם' : 'אותו'} בתוך המילים "${l.words}". קודם נקשיב, ואחר כך תורכם.` };
    },
  },
  { id: 'lesson-passed', when: (e) => e.kind === 'lesson-result' && e.passed, say: (e) => ({ expression: 'happy', text: `יפה מאוד! ה${names((e as { newTaamim: string[] }).newTaamim)} יצא מצוין. נמשיך.` }) },
  {
    id: 'lesson-unclear',
    when: (e) => e.kind === 'lesson-result' && e.inconclusive,
    say: (e) => ({ expression: 'thinking', text: `${(e as { reasonHe?: string }).reasonHe ?? 'לא הצלחתי לשמוע טוב.'} ננסה שוב.` }),
  },
  {
    id: 'lesson-third-failure',
    when: (e) => e.kind === 'lesson-result' && e.failures >= 3,
    say: (e) => ({
      expression: 'explaining',
      text: `ה${names((e as { newTaamim: string[] }).newTaamim)} לא פשוט. כדאי להקשיב לדוגמה כמה פעמים, לשיר אותה בשקט יחד עם הקורא, ורק אז להקליט שוב.`,
    }),
  },
  { id: 'lesson-retry', when: (e) => e.kind === 'lesson-result', say: () => ({ expression: 'encouraging', text: 'כמעט! הקשיבו שוב ושימו לב לאן המנגינה עולה ולאן היא יורדת. ננסה עוד פעם.' }) },

  // ---- After reading a verse (most specific first).
  {
    id: 'eval-audio',
    when: (e) => ev(e)?.evaluation.inconclusiveReason === 'audio-quality',
    say: (e) => ({ expression: 'thinking', text: `לא הצלחתי לשמוע טוב את ההקלטה. ${ev(e)!.evaluation.qualityIssues[0] ?? ''} ננסה שוב?` }),
  },
  {
    id: 'eval-passed',
    when: (e) => ev(e)?.evaluation.status === 'passed',
    say: () => ({ expression: 'happy', text: 'כל הכבוד! קראתם יפה מאוד. דייקתם במילים ובטעמים, ואפשר לעבור לפסוק הבא.' }),
  },
  {
    id: 'eval-not-chanted',
    when: (e) => !!ev(e)?.evaluation.errors.some((m) => m.kind === 'not-chanted'),
    say: () => ({ expression: 'explaining', text: 'שמעתי את המילים, אבל בלי המנגינה. בקריאה בתורה לא מדברים – שרים כל מילה לפי הטעם שלה. הקשיבו שוב לקורא ונסו לשיר יחד איתו את העליות והירידות.' }),
  },
  {
    id: 'eval-repeated-taam',
    when: (e) => {
      const x = ev(e);
      return !!x && x.evaluation.errors.some((m) => m.taam && m.confidence >= MENTION_CONFIDENCE && (x.mistakeCounts[`taam:${m.taam}`] ?? 0) >= 3);
    },
    say: (e) => {
      const x = ev(e)!;
      const t = x.evaluation.errors.find((m) => m.taam && m.confidence >= MENTION_CONFIDENCE && (x.mistakeCounts[`taam:${m.taam}`] ?? 0) >= 3)!.taam!;
      return { expression: 'explaining', text: `כבר כמה פעמים קשה לנו עם ה${names([t])}. כדאי לחזור לשיעור עליו, להקשיב שוב לדוגמה, ואז לקרוא את הפסוק מחדש.`, suggestLesson: t };
    },
  },
  {
    id: 'eval-word',
    when: (e) => !!ev(e)?.evaluation.errors.some((m) => m.category === 'words' && m.confidence >= MENTION_CONFIDENCE),
    say: (e) => {
      const x = ev(e)!;
      const m = x.evaluation.errors.find((k) => k.category === 'words' && k.confidence >= MENTION_CONFIDENCE)!;
      return { expression: 'correcting', text: `${pick(['כמעט!', 'קרוב!', 'עוד מאמץ קטן!'], x.attempt)} ${m.explanationHe} בואו נשמע שוב את הקורא ונקרא את כל הפסוק מחדש.` };
    },
  },
  {
    id: 'eval-niqqud',
    when: (e) => !!ev(e)?.evaluation.errors.some((m) => m.category === 'niqqud' && m.confidence >= MENTION_CONFIDENCE),
    say: (e) => {
      const m = ev(e)!.evaluation.errors.find((k) => k.category === 'niqqud' && k.confidence >= MENTION_CONFIDENCE)!;
      return { expression: 'correcting', text: `${m.explanationHe} שימו לב לניקוד שמתחת לאותיות, הקשיבו לקורא ונסו שוב.` };
    },
  },
  {
    id: 'eval-melody',
    when: (e) => !!ev(e)?.evaluation.errors.some((m) => m.category === 'cantillation' && m.confidence >= MENTION_CONFIDENCE),
    say: (e) => {
      const x = ev(e)!;
      const m = x.evaluation.errors.find((k) => k.category === 'cantillation' && k.confidence >= MENTION_CONFIDENCE)!;
      return { expression: 'correcting', text: `המילים נשמעו טוב. ${m.explanationHe} הקשיבו שוב לקורא ונסו לחקות את העליות והירידות.` };
    },
  },
  {
    id: 'eval-improved',
    when: (e) => {
      const x = ev(e);
      if (!x?.previous) return false;
      const avg = (cs: { score: number | null }[]) => {
        const s = cs.map((c) => c.score).filter((v): v is number => v !== null);
        return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
      };
      const now = avg(x.evaluation.categories), before = avg(x.previous.categories);
      return now !== null && before !== null && now - before >= 10;
    },
    say: () => ({ expression: 'encouraging', text: 'יפה! השתפרתם מהניסיון הקודם. ממשיכים ככה.' }),
  },
  {
    id: 'eval-pause',
    when: (e) => !!ev(e)?.evaluation.errors.some((m) => m.category === 'pause' && m.confidence >= 0.5),
    say: (e) => ({ expression: 'explaining', text: `${ev(e)!.evaluation.errors.find((m) => m.category === 'pause')!.explanationHe}` }),
  },
  {
    id: 'eval-clean-unverified',
    when: (e) => ev(e)?.evaluation.inconclusiveReason === 'unvalidated-analyzers',
    say: () => ({
      expression: 'encouraging',
      text: 'קראתם את כל הפסוק, ולא מצאתי בעיות ברורות במילים, בניקוד או במנגינה. הבדיקה שלי עדיין ניסיונית ואינה בודקת את כל דיוקי ההגייה, ולכן אין ציון סופי. אפשר לקרוא שוב, או לסמן את הפסוק כמתורגל ולהמשיך.',
    }),
  },
  { id: 'eval-failed', when: (e) => ev(e)?.evaluation.status === 'failed', say: () => ({ expression: 'encouraging', text: 'עוד לא שם, אבל זה בדרך. בואו נקשיב שוב ונקרא את הפסוק מחדש.' }) },
  { id: 'fallback', when: () => true, say: () => ({ expression: 'neutral', text: 'אני כאן. נמשיך?' }) },
];

export function rabbiSays(e: RabbiEvent): RabbiLine {
  const r = RULES.find((x) => x.when(e))!;
  return { ...r.say(e), ruleId: r.id };
}
