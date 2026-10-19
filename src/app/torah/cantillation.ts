// Te'amim (cantillation) catalog for the prose ("21 books") system, Ashkenazi naming, and the context rules
// that turn raw Unicode accents into the functional ta'am a reader chants.
// reviewStatus 'pending': names, classifications and explanations await review by a qualified Torah reader.
import { accentsOf, METEG } from './hebrew';

export type TaamKind = 'disjunctive' | 'conjunctive';
/** 1 = "emperor" (strongest pause) … 4 = "count" (weakest disjunctive). */
export type DisjunctiveLevel = 1 | 2 | 3 | 4;
export type Placement = 'stress' | 'postpositive' | 'prepositive';

export interface TaamDef {
  id: string;
  nameHe: string;
  symbol: string; // code point(s) shown in lessons, on a dotted circle
  kind: TaamKind;
  level?: DisjunctiveLevel;
  placement: Placement;
  explanationHe: string;
  rare?: boolean;
}

export const TRADITION_ID = 'ashkenazi-israeli';
export const CATALOG_REVIEW_STATUS = 'pending' as const;

const T = (d: TaamDef) => d;
export const TAAMIM: TaamDef[] = [
  T({ id: 'sof-pasuk', nameHe: 'סוֹף פָּסוּק (סִלּוּק)', symbol: 'ֽ', kind: 'disjunctive', level: 1, placement: 'stress',
    explanationHe: 'בא על המילה האחרונה בפסוק, בהברה המוטעמת, ואחריו נקודתיים (׃). זה המפסיק החזק ביותר: כאן הפסוק נגמר והמנגינה נחה.' }),
  T({ id: 'etnachta', nameHe: 'אֶתְנַחְתָּא', symbol: '֑', kind: 'disjunctive', level: 1, placement: 'stress',
    explanationHe: 'מחלק את הפסוק לשני חלקים. זו העצירה הגדולה באמצע הפסוק – נחים רגע לפני החלק השני.' }),
  T({ id: 'segol', nameHe: 'סֶגּוֹל', symbol: '֒', kind: 'disjunctive', level: 2, placement: 'postpositive',
    explanationHe: 'מפסיק חזק: שלוש נקודות מעל האות האחרונה של המילה. בא בחלק הראשון של הפסוק, ולפניו בדרך כלל זרקא.' }),
  T({ id: 'shalshelet', nameHe: 'שַׁלְשֶׁלֶת', symbol: '֓', kind: 'disjunctive', level: 2, placement: 'stress', rare: true,
    explanationHe: 'מפסיק נדיר מאוד (ארבע פעמים בתורה), בעל מנגינה ארוכה ומסולסלת. אחריו בא קו מפריד.' }),
  T({ id: 'zakef-katon', nameHe: 'זָקֵף קָטֹן', symbol: '֔', kind: 'disjunctive', level: 2, placement: 'stress',
    explanationHe: 'שתי נקודות זו מעל זו, מעל ההברה המוטעמת. מפסיק חשוב שמחלק את חצי הפסוק לחלקים קטנים יותר.' }),
  T({ id: 'zakef-gadol', nameHe: 'זָקֵף גָּדוֹל', symbol: '֕', kind: 'disjunctive', level: 2, placement: 'stress',
    explanationHe: 'צורה מיוחדת של זקף, עם קו ליד הנקודות. בא בדרך כלל על מילה שאין לפניה משרתים.' }),
  T({ id: 'tipcha', nameHe: 'טִפְחָא', symbol: '֖', kind: 'disjunctive', level: 2, placement: 'stress',
    explanationHe: 'קו נטוי מתחת למילה. מפסיק שבא לפני האתנחתא או לפני סוף הפסוק, ומכין את הסיום.' }),
  T({ id: 'revia', nameHe: 'רְבִיעַ', symbol: '֗', kind: 'disjunctive', level: 3, placement: 'stress',
    explanationHe: 'נקודה מעוינת מעל ההברה המוטעמת. מפסיק בינוני.' }),
  T({ id: 'zarka', nameHe: 'זַרְקָא', symbol: '֮', kind: 'disjunctive', level: 3, placement: 'postpositive',
    explanationHe: 'מפסיק שבא לפני סגול. נכתב על האות האחרונה של המילה.' }),
  T({ id: 'pashta', nameHe: 'פַּשְׁטָא', symbol: '֙', kind: 'disjunctive', level: 3, placement: 'postpositive',
    explanationHe: 'מפסיק שבא לפני זקף קטן. נכתב תמיד על האות האחרונה; כשההטעמה אינה בסוף המילה, מופיע סימן נוסף גם על ההברה המוטעמת.' }),
  T({ id: 'yetiv', nameHe: 'יְתִיב', symbol: '֚', kind: 'disjunctive', level: 3, placement: 'prepositive',
    explanationHe: 'בא במקום פשטא במילה קצרה שההטעמה בה בהברה הראשונה. נכתב לפני האות הראשונה.' }),
  T({ id: 'tevir', nameHe: 'תְּבִיר', symbol: '֛', kind: 'disjunctive', level: 3, placement: 'stress',
    explanationHe: 'מפסיק שנכתב מתחת למילה ובא לפני טפחא. לפניו בא בדרך כלל דרגא או מרכא.' }),
  T({ id: 'geresh', nameHe: 'גֵּרֵשׁ (אַזְלָא)', symbol: '֜', kind: 'disjunctive', level: 4, placement: 'stress',
    explanationHe: 'מפסיק קטן שנכתב מעל המילה. כשקדמא באה לפניו, השילוב נקרא "קַדְמָא וְאַזְלָא".' }),
  T({ id: 'gershayim', nameHe: 'גֵּרְשַׁיִם', symbol: '֞', kind: 'disjunctive', level: 4, placement: 'stress',
    explanationHe: 'מפסיק קטן עם שני קווים מעל המילה, קרוב לגרש.' }),
  T({ id: 'pazer', nameHe: 'פָּזֵר', symbol: '֡', kind: 'disjunctive', level: 4, placement: 'stress',
    explanationHe: 'מפסיק בעל מנגינה ארוכה ומסולסלת.' }),
  T({ id: 'karne-para', nameHe: 'קַרְנֵי פָרָה', symbol: '֟', kind: 'disjunctive', level: 4, placement: 'stress', rare: true,
    explanationHe: 'מפסיק נדיר מאוד – פעם אחת בתורה.' }),
  T({ id: 'telisha-gedola', nameHe: 'תְּלִישָׁא גְּדוֹלָה', symbol: '֠', kind: 'disjunctive', level: 4, placement: 'prepositive',
    explanationHe: 'מפסיק שנכתב מעל האות הראשונה של המילה.' }),
  T({ id: 'munach-legarmeh', nameHe: 'מֻנַּח לְגַרְמֵיהּ', symbol: '֣׀', kind: 'disjunctive', level: 4, placement: 'stress',
    explanationHe: 'מונח שאחריו קו מפריד (׀). כאן המונח הוא מפסיק ולא משרת, ועוצרים אחריו מעט.' }),
  T({ id: 'munach', nameHe: 'מֻנַּח', symbol: '֣', kind: 'conjunctive', placement: 'stress',
    explanationHe: 'משרת: מחבר את המילה למילה שאחריה בלי לעצור. בא לפני אתנחתא, זקף, רביע, סגול ועוד.' }),
  T({ id: 'mahpach', nameHe: 'מַהְפַּךְ', symbol: '֤', kind: 'conjunctive', placement: 'stress',
    explanationHe: 'משרת שבא בדרך כלל לפני פשטא.' }),
  T({ id: 'mercha', nameHe: 'מֵרְכָא', symbol: '֥', kind: 'conjunctive', placement: 'stress',
    explanationHe: 'משרת שנכתב מתחת למילה. בא בדרך כלל לפני טפחא, לפני סוף פסוק או לפני תביר.' }),
  T({ id: 'mercha-kefula', nameHe: 'מֵרְכָא כְּפוּלָה', symbol: '֦', kind: 'conjunctive', placement: 'stress', rare: true,
    explanationHe: 'משרת נדיר (חמש פעמים בתורה) שבא לפני תביר.' }),
  T({ id: 'darga', nameHe: 'דַּרְגָּא', symbol: '֧', kind: 'conjunctive', placement: 'stress',
    explanationHe: 'משרת שבא לפני תביר.' }),
  T({ id: 'kadma', nameHe: 'קַדְמָא', symbol: '֨', kind: 'conjunctive', placement: 'stress',
    explanationHe: 'משרת שנראה כמו פשטא אבל נכתב על ההברה המוטעמת. בא לפני מהפך ופשטא, או לפני גרש ("קדמא ואזלא").' }),
  T({ id: 'telisha-ketana', nameHe: 'תְּלִישָׁא קְטַנָּה', symbol: '֩', kind: 'conjunctive', placement: 'postpositive',
    explanationHe: 'משרת שנכתב מעל האות האחרונה של המילה.' }),
  T({ id: 'yerach-ben-yomo', nameHe: 'יֶרַח בֶּן יוֹמוֹ', symbol: '֪', kind: 'conjunctive', placement: 'stress', rare: true,
    explanationHe: 'משרת נדיר מאוד שבא לפני קרני פרה.' }),
];

export const TAAM_BY_ID: Record<string, TaamDef> = Object.fromEntries(TAAMIM.map((t) => [t.id, t]));

/** Unicode accent → base ta'am id (before context rules). Poetic-system accents are left unmapped. */
const CODEPOINT_TO_ID: Record<string, string> = {
  '֑': 'etnachta', '֒': 'segol', '֓': 'shalshelet', '֔': 'zakef-katon', '֕': 'zakef-gadol',
  '֖': 'tipcha', '֗': 'revia', '֘': 'zarka', '֮': 'zarka', '֙': 'pashta', '֚': 'yetiv',
  '֛': 'tevir', '֜': 'geresh', '֝': 'geresh', '֞': 'gershayim', '֟': 'karne-para',
  '֠': 'telisha-gedola', '֡': 'pazer', '֣': 'munach', '֤': 'mahpach', '֥': 'mercha',
  '֦': 'mercha-kefula', '֧': 'darga', '֨': 'kadma', '֩': 'telisha-ketana', '֪': 'yerach-ben-yomo',
};

export function taamIdOf(codepoint: string): string | null {
  return CODEPOINT_TO_ID[codepoint] ?? null;
}

export interface WordTaamim {
  taamim: string[]; // distinct functional te'amim on the word, in order
  primary: string | null; // the one that governs the word (its disjunctive if it has one); null = joined by maqaf
}

/**
 * Context rules (the same symbol does not always mean the same thing):
 *  - duplicated postpositive marks (MAM adds a copy on the stressed syllable) count once;
 *  - meteg on the verse's last word is silluq → sof pasuk; elsewhere it is not a ta'am;
 *  - munach followed by a legarmeh stroke is munach legarmeh, a disjunctive;
 *  - a word with no accent belongs to the next word's ta'am (maqaf).
 */
export function resolveWordTaamim(word: string, opts: { lastInVerse: boolean; legarmeh: boolean }): WordTaamim {
  const ids: string[] = [];
  for (const cp of accentsOf(word)) {
    const id = taamIdOf(cp);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (opts.lastInVerse && word.includes(METEG) && !ids.some((i) => TAAM_BY_ID[i].kind === 'disjunctive')) ids.push('sof-pasuk');
  if (opts.legarmeh) {
    const k = ids.indexOf('munach');
    if (k >= 0) ids[k] = 'munach-legarmeh';
  }
  const primary = ids.find((i) => TAAM_BY_ID[i].kind === 'disjunctive') ?? ids[0] ?? null;
  return { taamim: ids, primary };
}

/** Conjunctive words chant into the next disjunctive, so a phrase group = conjunctives + their disjunctive. */
export function phraseGroups(primaries: (string | null)[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  primaries.forEach((p, i) => {
    cur.push(i);
    if (p && TAAM_BY_ID[p].kind === 'disjunctive') {
      groups.push(cur);
      cur = [];
    }
  });
  if (cur.length) groups.push(cur); // only if a verse lacked a final disjunctive (should not happen)
  return groups;
}
