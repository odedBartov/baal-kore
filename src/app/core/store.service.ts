import { Injectable, computed, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import type { VerseEvaluation } from '../analysis/types';
import type { EvalCharts } from '../analysis/evaluate';
import {
  defaultProgress,
  isAliyahAccessible,
  isPortionPurchased,
  migrateProgress,
  migrateSettings,
  priceLabelForDiscount,
  type AttemptSummary,
  type RabbiFrame,
  type Settings,
  type StudentProgress,
  type YadStyle,
} from './state';
import {
  fetchOnlineCouponsManifest,
  findRevokedCouponIds,
  verifyCouponAgainstManifest,
  type CouponKind,
  type OnlineCouponsManifest,
  type VerifiedCoupon,
} from './coupons';
import {
  applyEffortReward,
  CHALLENGE_PRESETS,
  FRAME_CATALOG,
  getDailyQuests,
  getUserRank,
  syncDailyState,
  todayIso,
  YAD_CATALOG,
  type EffortAssessment,
} from './gamification';

export interface StoredEvaluation {
  evaluation: VerseEvaluation;
  charts: EvalCharts;
  recording: string;
  previous?: AttemptSummary;
  reward?: EffortAssessment;
}

const KEY = { progress: 'torah-tutor.progress', settings: 'torah-tutor.settings' };

function load(key: string): unknown {
  try {
    return JSON.parse(ApplicationSettings.getString(key, 'null'));
  } catch {
    return null;
  }
}

/** Local persistence only — nothing leaves the device (spec §17). */
@Injectable({ providedIn: 'root' })
export class StoreService {
  readonly progress = signal<StudentProgress>(migrateProgress(load(KEY.progress)));
  readonly settings = signal<Settings>(migrateSettings(load(KEY.settings)));
  /** Latest full evaluation per verse, for the results screen (in memory; the summary is persisted). */
  readonly evaluations = new Map<string, StoredEvaluation>();

  readonly rank = computed(() => getUserRank(this.progress().xp));
  readonly dailyQuests = computed(() => getDailyQuests(this.progress()));
  readonly equippedYadAsset = computed(() => {
    const id = this.progress().equippedYad;
    return YAD_CATALOG.find((y) => y.id === id)?.asset ?? '~/assets/art/yad.png';
  });
  readonly equippedFrameInfo = computed(() => {
    const id = this.progress().equippedFrame;
    return FRAME_CATALOG.find((f) => f.id === id) ?? FRAME_CATALOG[0];
  });

  updateProgress(change: (p: StudentProgress) => void): void {
    const p: StudentProgress = JSON.parse(JSON.stringify(this.progress()));
    syncDailyState(p);
    change(p);
    this.progress.set(p);
    ApplicationSettings.setString(KEY.progress, JSON.stringify(p));
  }

  updateSettings(change: Partial<Settings>): void {
    const s = migrateSettings({ ...this.settings(), ...change });
    this.settings.set(s);
    ApplicationSettings.setString(KEY.settings, JSON.stringify(s));
    if (change.passingThreshold !== undefined) {
      for (const [verseId, stored] of this.evaluations) {
        const ev = stored.evaluation;
        if (ev.overallScore !== null) {
          const spoken = ev.errors.some((e) => e.kind === 'not-chanted');
          const status = ev.overallScore >= s.passingThreshold && !spoken ? 'passed' : 'failed';
          stored.evaluation = { ...ev, passingThreshold: s.passingThreshold, status };
          this.updateProgress((p) => {
            if (p.lastAttempts[verseId]) p.lastAttempts[verseId].status = status;
            if (status === 'passed') {
              if (!p.completedVerseIds.includes(verseId)) p.completedVerseIds.push(verseId);
              p.bestScores[verseId] = Math.max(p.bestScores[verseId] ?? 0, ev.overallScore!);
            }
          });
        } else {
          stored.evaluation = { ...ev, passingThreshold: s.passingThreshold };
        }
      }
    }
  }

  /** Clears learning progress while preserving any real-money Parasha purchases and redeemed coupons. */
  resetProgress(): void {
    const owned = [...(this.progress().purchasedPortionIds ?? [])];
    const coupons = [...(this.progress().redeemedCoupons ?? [])];
    const couponMap = JSON.parse(JSON.stringify(this.progress().couponUnlockedPortions ?? {}));
    const discount = this.progress().activeDiscountPct ?? 0;
    this.updateProgress((p) =>
      Object.assign(p, defaultProgress(), {
        welcomed: true,
        purchasedPortionIds: owned,
        redeemedCoupons: coupons,
        couponUnlockedPortions: couponMap,
        activeDiscountPct: discount,
      }),
    );
    this.evaluations.clear();
  }

  readonly currentPriceLabel = computed(() => priceLabelForDiscount(0));
  readonly hasDiscount50 = computed(() => false);

  /** Applies a verified online coupon (1 free Parasha or VIP all 54 Parashot) and records which Parashot it unlocked for revocation tracking. */
  applyVerifiedOnlineCoupon(
    coupon: VerifiedCoupon,
    targetPortionId: string,
    allPortionIds: string[],
  ): { ok: boolean; kind?: CouponKind; unlockedPortion?: boolean; messageHe: string } {
    const cur = this.progress();
    if (coupon.singleUse && cur.redeemedCoupons?.includes(coupon.id)) {
      return { ok: false, messageHe: 'קוד קופון זה כבר מומש במכשיר זה.' };
    }

    const portionsToUnlock = coupon.kind === 'free-all' ? allPortionIds : [targetPortionId];
    this.updateProgress((p) => {
      if (!p.couponUnlockedPortions) p.couponUnlockedPortions = {};
      const tracked = p.couponUnlockedPortions[coupon.id] ?? [];
      for (const pid of portionsToUnlock) {
        if (!p.purchasedPortionIds.includes(pid)) {
          p.purchasedPortionIds.push(pid);
        }
        if (!tracked.includes(pid)) {
          tracked.push(pid);
        }
      }
      p.couponUnlockedPortions[coupon.id] = tracked;
      if (!p.redeemedCoupons.includes(coupon.id)) {
        p.redeemedCoupons.push(coupon.id);
      }
    });

    return {
      ok: true,
      kind: coupon.kind,
      unlockedPortion: true,
      messageHe: coupon.descriptionHe,
    };
  }

  /**
   * Removes any Parashot unlocked by coupons that have since been revoked or deleted in the online `coupons.json` manifest.
   * Returns the number of revoked coupon IDs found.
   */
  syncRevokedCouponsFromManifest(manifest: OnlineCouponsManifest): number {
    const cur = this.progress();
    const redeemed = cur.redeemedCoupons ?? [];
    const revokedIds = findRevokedCouponIds(redeemed, manifest);
    if (!revokedIds.length) return 0;

    this.updateProgress((p) => {
      if (!p.couponUnlockedPortions) p.couponUnlockedPortions = {};
      const revokedSet = new Set(revokedIds);
      // Keep track of portions still unlocked by OTHER active coupons
      const stillCouponUnlocked = new Set<string>();
      for (const [cid, pids] of Object.entries(p.couponUnlockedPortions)) {
        if (!revokedSet.has(cid) && Array.isArray(pids)) {
          for (const pid of pids) stillCouponUnlocked.add(pid);
        }
      }
      // Remove portions that belonged to revoked coupons (unless covered by another active coupon)
      for (const cid of revokedIds) {
        const pids = p.couponUnlockedPortions[cid] ?? [];
        for (const pid of pids) {
          if (!stillCouponUnlocked.has(pid)) {
            p.purchasedPortionIds = p.purchasedPortionIds.filter((id) => id !== pid);
          }
        }
        delete p.couponUnlockedPortions[cid];
      }
      p.redeemedCoupons = p.redeemedCoupons.filter((id) => !revokedSet.has(id));
    });
    return revokedIds.length;
  }

  /** Fetches the online `coupons.json` manifest, syncs any revocations, and validates `rawCode`. */
  async redeemCouponOnline(
    rawCode: string,
    targetPortionId: string,
    allPortionIds: string[],
  ): Promise<{ ok: boolean; kind?: CouponKind; unlockedPortion?: boolean; messageHe: string }> {
    let manifest: OnlineCouponsManifest;
    try {
      manifest = await fetchOnlineCouponsManifest();
    } catch {
      return {
        ok: false,
        messageHe: 'לא ניתן לאמת את הקופון כרגע. אנא בדקו את החיבור לאינטרנט ונסו שוב.',
      };
    }

    this.syncRevokedCouponsFromManifest(manifest);
    const check = verifyCouponAgainstManifest(rawCode, manifest);
    if (check.status !== 'valid') {
      return { ok: false, messageHe: check.messageHe };
    }
    return this.applyVerifiedOnlineCoupon(check.coupon, targetPortionId, allPortionIds);
  }

  isPortionPurchased(portionId: string): boolean {
    return isPortionPurchased(portionId, this.progress());
  }

  isAliyahAccessible(portionId: string, aliyah: number): boolean {
    return isAliyahAccessible(portionId, aliyah, this.progress());
  }

  /** Marks a Parasha (Aliyot 2–7) as purchased via Google Play Billing. */
  markPortionPurchased(portionId: string): void {
    this.markPortionsPurchased([portionId]);
  }

  /** Marks multiple Parashot (e.g. an entire Chumash or all 54 Parashot) as purchased via Google Play Billing. */
  markPortionsPurchased(portionIds: string[]): void {
    this.updateProgress((p) => {
      for (const id of portionIds) {
        if (!p.purchasedPortionIds.includes(id)) {
          p.purchasedPortionIds.push(id);
        }
      }
    });
  }

  /** Merges a list of owned Parasha IDs restored from Google Play Billing. Returns count of newly added Parashot. */
  syncPurchasedPortions(portionIds: string[]): number {
    let added = 0;
    const cur = this.progress().purchasedPortionIds ?? [];
    const missing = portionIds.filter((id) => !cur.includes(id));
    if (!missing.length) return 0;
    this.updateProgress((p) => {
      for (const id of missing) {
        if (!p.purchasedPortionIds.includes(id)) {
          p.purchasedPortionIds.push(id);
          added += 1;
        }
      }
    });
    return added;
  }

  recordAttempt(e: VerseEvaluation, aliyah?: number): EffortAssessment {
    let reward!: EffortAssessment;
    this.updateProgress((p) => {
      p.currentVerseId = e.verseId;
      p.attemptCounts[e.verseId] = (p.attemptCounts[e.verseId] ?? 0) + 1;
      p.lastAttempts[e.verseId] = {
        at: e.analyzedAt,
        status: e.status,
        overallScore: e.overallScore,
        categories: e.categories.map((c) => ({ category: c.category, score: c.score })),
        errorKinds: e.errors.map((x) => x.kind),
      };
      for (const x of e.errors) {
        const k = x.taam ? `taam:${x.taam}` : x.category;
        p.mistakeCounts[k] = (p.mistakeCounts[k] ?? 0) + 1;
      }
      if (e.overallScore !== null) {
        p.bestScores[e.verseId] = Math.max(p.bestScores[e.verseId] ?? 0, e.overallScore);
      }
      if (e.status === 'passed') {
        if (!p.completedVerseIds.includes(e.verseId)) p.completedVerseIds.push(e.verseId);
      }
      reward = applyEffortReward(p, {
        kind: 'verse',
        score: e.overallScore,
        passed: e.status === 'passed',
        aliyah,
      });
    });
    const stored = this.evaluations.get(e.verseId);
    if (stored) stored.reward = reward;
    return reward;
  }

  recordLessonAttempt(passed: boolean, newTaamim: string[], deviation: number | null): EffortAssessment {
    let reward!: EffortAssessment;
    const score = deviation !== null ? Math.max(40, Math.min(100, Math.round(100 - deviation * 20))) : passed ? 90 : 60;
    this.updateProgress((p) => {
      if (passed) {
        for (const t of newTaamim) if (!p.masteredCantillationIds.includes(t)) p.masteredCantillationIds.push(t);
      } else {
        for (const t of newTaamim) p.lessonFailures[t] = (p.lessonFailures[t] ?? 0) + 1;
      }
      reward = applyEffortReward(p, { kind: 'lesson', score, passed });
    });
    return reward;
  }

  markPracticed(verseId: string, nextVerseId?: string): void {
    this.updateProgress((p) => {
      if (!p.practicedVerseIds.includes(verseId)) p.practicedVerseIds.push(verseId);
      if (nextVerseId) p.currentVerseId = nextVerseId;
    });
  }

  masterTaamim(ids: string[]): void {
    this.updateProgress((p) => {
      for (const t of ids) if (!p.masteredCantillationIds.includes(t)) p.masteredCantillationIds.push(t);
    });
  }

  claimDailyQuest(questId: 'q-verses' | 'q-score' | 'q-lesson'): boolean {
    const q = this.dailyQuests().find((x) => x.id === questId);
    if (!q || !q.completed || q.claimed) return false;
    this.updateProgress((p) => {
      if (!p.claimedQuestIds.includes(questId)) {
        p.claimedQuestIds.push(questId);
        p.coins += q.rewardCoins;
        p.xp += q.rewardXp;
      }
    });
    return true;
  }

  startChallenge(presetId: string, aliyah = 1, portionId?: string): void {
    const preset = CHALLENGE_PRESETS.find((c) => c.id === presetId);
    if (!preset) return;
    this.updateProgress((p) => {
      p.challengePlan = {
        ...preset,
        portionId,
        aliyah: preset.targetType === 'aliyah' ? aliyah : undefined,
        startedAt: todayIso(),
        completed: false,
      };
    });
  }

  startCustomTargetPlan(opts: {
    portionId: string;
    portionNameHe: string;
    targetDays: number;
    targetType: 'parasha' | 'aliyah';
    aliyah?: number;
  }): void {
    const days = Math.max(1, Math.min(365, Math.round(opts.targetDays)));
    const scopeHe = opts.targetType === 'aliyah' ? `עלייה ${opts.aliyah ?? 1} בפרשת ${opts.portionNameHe}` : `כל פרשת ${opts.portionNameHe}`;
    this.updateProgress((p) => {
      p.challengePlan = {
        id: `custom-${opts.portionId}-${days}d`,
        titleHe: `תוכנית יעד: ${scopeHe} ב־${days} ימים`,
        targetDays: days,
        targetType: opts.targetType,
        portionId: opts.portionId,
        aliyah: opts.targetType === 'aliyah' ? (opts.aliyah ?? 1) : undefined,
        startedAt: todayIso(),
        rewardCoins: Math.min(500, Math.max(60, days * 5)),
        rewardXp: Math.min(1200, Math.max(150, days * 12)),
        completed: false,
      };
    });
  }

  buyStreakFreeze(): boolean {
    if (this.progress().coins < 40) return false;
    this.updateProgress((p) => {
      p.coins -= 40;
      p.streakFreezes += 1;
    });
    return true;
  }

  buyDoubleXp(): boolean {
    if (this.progress().coins < 35) return false;
    this.updateProgress((p) => {
      p.coins -= 35;
      p.doubleXpRemaining += 3;
    });
    return true;
  }

  unlockVerseWithCoins(verseId: string, cost = 15): boolean {
    if (this.progress().coins < cost) return false;
    this.updateProgress((p) => {
      p.coins -= cost;
      if (!p.unlockedVerseIds.includes(verseId)) p.unlockedVerseIds.push(verseId);
    });
    return true;
  }

  unlockAliyahWithCoins(verseIds: string[], cost = 40): boolean {
    if (this.progress().coins < cost) return false;
    this.updateProgress((p) => {
      p.coins -= cost;
      for (const id of verseIds) {
        if (!p.unlockedVerseIds.includes(id)) p.unlockedVerseIds.push(id);
      }
    });
    return true;
  }

  buyOrEquipYad(id: YadStyle): boolean {
    const item = YAD_CATALOG.find((y) => y.id === id);
    if (!item) return false;
    const p = this.progress();
    if (p.ownedYads.includes(id)) {
      this.updateProgress((st) => (st.equippedYad = id));
      return true;
    }
    if (p.coins < item.price) return false;
    this.updateProgress((st) => {
      st.coins -= item.price;
      st.ownedYads.push(id);
      st.equippedYad = id;
    });
    return true;
  }

  buyOrEquipFrame(id: RabbiFrame): boolean {
    const item = FRAME_CATALOG.find((f) => f.id === id);
    if (!item) return false;
    const p = this.progress();
    if (p.ownedFrames.includes(id)) {
      this.updateProgress((st) => (st.equippedFrame = id));
      return true;
    }
    if (p.coins < item.price) return false;
    this.updateProgress((st) => {
      st.coins -= item.price;
      st.ownedFrames.push(id);
      st.equippedFrame = id;
    });
    return true;
  }
}
