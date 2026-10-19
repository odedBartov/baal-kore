// Evaluation contracts (spec §8–9, §16). Every analyzer reports a result, its confidence and evidence,
// or that it could not decide. Unknowns are never turned into mistakes.

export type Category = 'words' | 'niqqud' | 'cantillation' | 'stress' | 'pronunciation';
export type EvaluationStatus = 'passed' | 'failed' | 'inconclusive';
export type Severity = 'critical' | 'major' | 'moderate' | 'minor';

/** How far an analyzer can be trusted. Only 'validated' may contribute to a definitive score (spec §9.2). */
export type AnalyzerMaturity = 'validated' | 'experimental' | 'unavailable';

export interface DetectedError {
  category: Category | 'pause';
  kind: string; // e.g. 'word-missing', 'word-unclear', 'extra-speech', 'melody', 'pause-inside-phrase'
  tokenId?: string; // word the evidence maps to
  wordIndex?: number;
  explanationHe: string;
  confidence: number; // 0..1
  severity: Severity;
  taam?: string; // cantillation errors: the ta'am of the phrase
}

export interface CategoryScore {
  category: Category;
  score: number | null; // 0..100, null = not assessed
  confidence: number; // 0..1
  maturity: AnalyzerMaturity;
  validated: boolean;
  noteHe?: string; // why unavailable / what is partial
}

export interface WordAssessment {
  wordIndex: number;
  status: 'ok' | 'doubtful' | 'problem' | 'unknown';
  startMs: number | null; // in the student recording
  endMs: number | null;
  wordScore: number | null; // words analyzer, 0..1
  melodyDeviation: number | null; // semitones, after removing the global key difference
}

export interface VerseEvaluation {
  verseId: string;
  status: EvaluationStatus;
  inconclusiveReason?: 'audio-quality' | 'unvalidated-analyzers' | 'reference-missing';
  overallScore: number | null;
  passingThreshold: number;
  categories: CategoryScore[];
  errors: DetectedError[];
  words: WordAssessment[];
  // Melody per phrase group: deviation along the pitch alignment, and keyShift = the phrase sung higher (+) or lower
  // than its neighbouring phrases (semitones, from the content alignment).
  phrases: { taam: string | null; words: number[]; deviation: number | null; coverage: number; keyShift: number | null }[];
  // Whole verse, key removed: does the pitch follow the reader's notes (correlation) and stay near them (median semitones)?
  chant?: { correlation: number; spreadSt: number } | null;
  qualityIssues: string[]; // Hebrew, actionable
  transpositionSemitones: number | null; // student key relative to the reference (not an error)
  referenceApproval: 'approved' | 'pending' | 'missing';
  analyzedAt: string;
  analyzerVersions: Record<string, string>;
}

/** Initial product weights (spec §9.1) — not scientifically validated. */
export const CATEGORY_WEIGHTS: Record<Category, number> = { words: 30, niqqud: 25, cantillation: 30, stress: 10, pronunciation: 5 };

export const CATEGORY_NAME_HE: Record<Category | 'pause', string> = {
  words: 'מילים וסדר',
  niqqud: 'ניקוד והגייה',
  cantillation: 'טעמים ומנגינה',
  stress: 'הטעמה והפסקות',
  pronunciation: 'דיוקי הגייה',
  pause: 'הפסקות',
};
