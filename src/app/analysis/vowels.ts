// Niqqud check: the expected sound slots (phonemes.ts) are force-aligned to the ZIPA phone model's output (CTC,
// 20 ms frames), then each written vowel is scored against the other vowel qualities around where it was sung:
// goodness = best log-probability of the written vowel − best log-probability of any other vowel group.
import { MODIFIER_TOKENS, VOWELS, type Slot, type VowelClass } from './phonemes';

export interface PhoneLogProbs {
  lp: Float32Array; // T×V log-probabilities (ZIPA log_probs, full vocabulary)
  T: number;
  V: number;
}

/** Token index lookup for the model's tokens.txt (one "token id" per line). */
export function tokenIndex(tokensTxt: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of tokensTxt.split(/\r?\n/)) {
    const [t, id] = line.trim().split(/\s+/);
    if (t && id !== undefined) m.set(t, Number(id));
  }
  return m;
}

const lse = (xs: number[]) => {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return m;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
};

/** Per-frame log-probability of a token set (log-sum-exp over its members), memoised per recording. */
const memo = new WeakMap<PhoneLogProbs, Map<string, Float64Array>>();
function setScores(o: PhoneLogProbs, ids: number[]): Float64Array {
  const key = ids.join(','), m = memo.get(o) ?? new Map<string, Float64Array>();
  memo.set(o, m);
  const hit = m.get(key);
  if (hit) return hit;
  const r = new Float64Array(o.T);
  m.set(key, r);
  for (let t = 0; t < o.T; t++) r[t] = lse(ids.map((k) => o.lp[t * o.V + k]));
  return r;
}

type Spans = ({ t0: number; t1: number } | null)[];

/**
 * CTC Viterbi alignment of slots (each a token set, possibly optional) to the frames. Returns each slot's frame span,
 * or null for a skipped optional slot / when the audio is too short.
 */
export function alignSlots(o: PhoneLogProbs, slots: Slot[], idx: Map<string, number>): Spans | null {
  return viterbi(o, slots, idx)?.spans ?? null;
}

function viterbi(o: PhoneLogProbs, slots: Slot[], idx: Map<string, number>): { spans: Spans; score: number } | null {
  const P = slots.length, S = 2 * P + 1, T = o.T;
  if (!P || T < 2) return null;
  const ids = slots.map((s) => [...new Set(s.tokens.map((t) => idx.get(t)).filter((k): k is number => k !== undefined))]);
  const blankIds = [0, ...MODIFIER_TOKENS.map((t) => idx.get(t)).filter((k): k is number => k !== undefined)];
  const emit = [setScores(o, blankIds), ...ids.map((s) => setScores(o, s))];
  const em = (s: number, t: number) => (s % 2 ? emit[1 + (s >> 1)][t] : emit[0][t]);
  const disjoint = (a: number, b: number) => !ids[a].some((k) => ids[b].includes(k));
  // Predecessors of each state (besides itself).
  const pred: number[][] = Array.from({ length: S }, (_, s) => {
    if (s % 2 === 0) return s ? [s - 1] : [];
    const p = s >> 1, out = [s - 1];
    for (let q = p - 1; q >= 0; q--) {
      if (disjoint(q, p)) out.push(2 * q + 1); // a shared token would merge into one CTC emission: needs a blank
      if (q < p - 1) out.push(2 * q + 2);
      if (!slots[q].optional) break;
    }
    return out;
  });
  const startable = new Set<number>([0]);
  for (let p = 0; p < P; p++) {
    startable.add(2 * p + 1).add(2 * p);
    if (!slots[p].optional) break;
  }
  const NEG = -1e30;
  let prev = new Float64Array(S).fill(NEG), cur = new Float64Array(S);
  const back = new Int32Array(T * S).fill(-1);
  for (const s of startable) prev[s] = em(s, 0);
  for (let t = 1; t < T; t++) {
    for (let s = 0; s < S; s++) {
      let best = prev[s], arg = s;
      for (const q of pred[s]) if (prev[q] > best) (best = prev[q]), (arg = q);
      cur[s] = best <= NEG / 2 ? NEG : best + em(s, t);
      back[t * S + s] = arg;
    }
    [prev, cur] = [cur, prev];
  }
  let end = -1, bestEnd = NEG;
  for (let s = S - 1; s >= 0; s--) {
    if (prev[s] > bestEnd) (bestEnd = prev[s]), (end = s);
    if (s % 2 === 1 && !slots[s >> 1].optional) break; // states before the last required slot cannot end the path
  }
  if (end < 0 || bestEnd <= NEG / 2) return null;
  const spans: Spans = new Array(P).fill(null);
  for (let t = T - 1, s = end; t >= 0; t--) {
    if (s % 2) {
      const p = s >> 1, sp = spans[p];
      spans[p] = sp ? { t0: t, t1: sp.t1 } : { t0: t, t1: t };
    }
    if (t) s = back[t * S + s];
  }
  return { spans, score: bestEnd };
}

export type CheckKind = 'vowel' | 'dagesh' | 'shin' | 'sheva-na' | 'sheva-nach';

export interface CheckScore {
  slot: number;
  kind: CheckKind;
  goodness: number; // > 0: sounds as written; < 0: the other possibility was heard more strongly
  vowel?: VowelClass;
  heard?: VowelClass; // vowels: the vowel group heard most strongly there
}

/**
 * Scores every checked slot. Vowels, dagesh and the shin dot compare the written sound with the alternatives on the
 * frames between the neighbours' alignments (a CTC spike may sit just off). A sheva compares how well the stretch
 * around it fits with a short vowel there versus without one (a local re-alignment both ways).
 */
export function scoreChecks(o: PhoneLogProbs, slots: Slot[], spans: Spans, idx: Map<string, number>, reach = 3): CheckScore[] {
  const ids = (tokens: string[]) => tokens.map((t) => idx.get(t)).filter((k): k is number => k !== undefined);
  const groups = (Object.keys(VOWELS) as VowelClass[]).map((c) => ({ c, s: setScores(o, ids(VOWELS[c])) }));
  const region = (k: number) => {
    const sp = spans[k]!;
    let lo = Math.max(0, sp.t0 - reach), hi = Math.min(o.T - 1, sp.t1 + reach);
    for (let j = k - 1; j >= 0; j--) if (spans[j]) { lo = Math.max(lo, spans[j]!.t1 + 1); break; }
    for (let j = k + 1; j < slots.length; j++) if (spans[j]) { hi = Math.min(hi, spans[j]!.t0 - 1); break; }
    return hi < lo ? [sp.t0, sp.t1] : [lo, hi];
  };
  const peak = (s: Float64Array, [lo, hi]: number[]) => {
    let m = -Infinity;
    for (let t = lo; t <= hi; t++) m = Math.max(m, s[t]);
    return m;
  };
  const out: CheckScore[] = [];
  slots.forEach((slot, k) => {
    if (slot.sheva) {
      const d = shevaPresence(o, slots, spans, idx, k);
      if (d !== null) out.push({ slot: k, kind: slot.sheva === 'na' ? 'sheva-na' : 'sheva-nach', goodness: slot.sheva === 'na' ? d : -d });
      return;
    }
    if (!spans[k]) return;
    const r = region(k);
    if (slot.vowel) {
      const p = groups.map(({ c, s }) => ({ c, m: peak(s, r) }));
      const ok = new Set([slot.vowel, ...(slot.also ?? [])]);
      const own = Math.max(...p.filter((g) => ok.has(g.c)).map((g) => g.m)), other = p.filter((g) => !ok.has(g.c)).reduce((a, b) => (b.m > a.m ? b : a));
      out.push({ slot: k, kind: 'vowel', vowel: slot.vowel, goodness: own - other.m, heard: own >= other.m ? slot.vowel : other.c });
    }
    if (slot.contrast) out.push({ slot: k, kind: slot.contrast.kind, goodness: peak(setScores(o, ids(slot.contrast.want)), r) - peak(setScores(o, ids(slot.contrast.against)), r) });
  });
  return out;
}

/**
 * Log-likelihood of the sheva's neighbourhood with a short vowel sounded there minus without one: > 0 means a vowel
 * was heard. The window runs from two aligned slots before to two after, so the rest of the verse cannot interfere.
 */
function shevaPresence(o: PhoneLogProbs, slots: Slot[], spans: Spans, idx: Map<string, number>, k: number): number | null {
  const step = (from: number, dir: number, n: number) => {
    let j = from;
    for (let found = 0; found < n; ) {
      const next = j + dir;
      if (next < 0 || next >= slots.length) break;
      j = next;
      if (spans[j]) found++;
    }
    return j;
  };
  const a = step(k, -1, 2), b = step(k, 1, 2);
  const t0 = a < k && spans[a] ? spans[a]!.t0 : 0, t1 = b > k && spans[b] ? spans[b]!.t1 : o.T - 1;
  if (t1 - t0 < 2) return null;
  const sub: PhoneLogProbs = { lp: o.lp.subarray(t0 * o.V, (t1 + 1) * o.V), T: t1 - t0 + 1, V: o.V };
  const window = slots.slice(a, b + 1), at = k - a;
  const withV = viterbi(sub, window.map((s, j) => (j === at ? { ...s, optional: false } : s)), idx);
  const without = viterbi(sub, window.filter((_, j) => j !== at), idx);
  return withV && without ? withV.score - without.score : null;
}
