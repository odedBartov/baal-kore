// Which analyzers exist and how far they are trusted. Flip an entry to 'validated' only after it passes the
// labelled-corpus procedure in docs/validation.md — that is what unlocks definitive scores (spec §9.2).
import type { AnalyzerMaturity, Category } from './types';

export interface AnalyzerInfo {
  maturity: AnalyzerMaturity;
  version: string;
  noteHe?: string;
}

export const ANALYZERS: Record<Category, AnalyzerInfo> = {
  words: { maturity: 'experimental', version: 'ctc-letters-1' },
  cantillation: { maturity: 'experimental', version: 'melody-dtw-1' },
  stress: { maturity: 'experimental', version: 'pauses-1', noteHe: 'נבדקות רק ההפסקות. ההטעמה עצמה עדיין אינה נבדקת.' },
  niqqud: { maturity: 'experimental', version: 'zipa-niqqud-2', noteHe: 'נבדקים התנועות, שווא נע ונח, דגש ברפה ובדגושה (ב, כ, פ) ונקודת השין. שווא שבמחלוקת אינו נבדק.' },
  pronunciation: { maturity: 'unavailable', version: '-', noteHe: 'בדיקת דיוקי ההגייה עדיין אינה זמינה.' },
};
