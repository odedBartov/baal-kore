import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { BillingService } from '../core/billing.service';
import { ContentService, hebrewNumber } from '../core/content.service';
import { computeParashaSummary, gradeRankForScore } from '../core/gamification';
import { isVerseAccessible, PARASHA_PRICE_LABEL_HE } from '../core/state';
import { StoreService } from '../core/store.service';
import type { VerseData } from '../torah/model';
import { GamificationBarComponent } from '../ui/gamification-bar.component';

/** Screen D — 7 Aliyot & chapters navigator: Aliyah 1 is always free (all verses open), Aliyot 2–7 are behind the ₪10 Parasha paywall. */
@Component({
  selector: 'verse-list',
  imports: [NativeScriptCommonModule, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar [title]="'פרשת ' + portion.nameHe">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="openSettings()"></Label>
      </ActionItem>
    </ActionBar>
    <GridLayout rows="auto, auto, auto, *" class="page-root">
      <!-- Top compact HUD -->
      <StackLayout row="0" padding="8 12 0 12">
        <gamification-bar [compact]="true"></gamification-bar>
      </StackLayout>

      <!-- 7 Aliyot selector chips -->
      <ScrollView row="1" orientation="horizontal" scrollBarIndicatorVisible="false">
        <FlexboxLayout class="chapters" flexDirection="row" justifyContent="center">
          @for (a of summary().aliyot; track a.aliyah) {
            <Button class="chip" [class.chip-on]="a.aliyah === aliyah()"
              [text]="(a.isPaywalled ? '🔒 ' : a.hasCrown ? '👑 ' : a.isFree ? '🎁 ' : '') + a.shortNameHe + (a.isFree ? ' (חינם)' : a.averageScore !== null ? ' (' + a.averageScore + ')' : '')"
              (tap)="aliyah.set(a.aliyah)"></Button>
          }
        </FlexboxLayout>
      </ScrollView>

      <!-- Current Aliyah Summary or ₪10/₪5 Paywall Card -->
      @if (currentAliyah(); as ca) {
        @if (ca.isPaywalled) {
          <StackLayout row="2" class="paywall-card">
            <Label class="paywall-title" textWrap="true" [text]="'🔒 ' + ca.nameHe + ' – המשך פרשת ' + portion.nameHe"></Label>
            <Label class="paywall-sub" textWrap="true"
              [text]="'עלייה ראשונה (כהן) פתוחה תמיד בחינם! פתחו את כל שאר הפרשה (עליות שני עד שביעי – ' + remainingVersesCount() + ' פסוקים) בתשלום חד־פעמי של ' + store.currentPriceLabel() + (store.hasDiscount50() ? ' (50% הנחת קופון!)' : '') + ' דרך Google Play.'"></Label>
            <Button class="btn-paywall" textWrap="true"
              [text]="billing.busy() ? 'מתחבר ל־Google Play…' : '💳 פתיחת כל פרשת ' + portion.nameHe + ' (עליות ב׳–ז׳) – ' + store.currentPriceLabel()"
              [isEnabled]="!billing.busy()"
              (tap)="unlockParasha()"></Button>
            <GridLayout columns="*, *" marginTop="4">
              <Button col="1" class="btn-link" textWrap="true" color="#ffd978" text="🎟️ הזנת קוד קופון / הנחה" (tap)="redeemCoupon()"></Button>
              <Button col="0" class="btn-link" textWrap="true" color="#c7d9f0" text="🔄 שחזור רכישות" (tap)="restorePurchases()"></Button>
            </GridLayout>
          </StackLayout>
        } @else {
          <StackLayout row="2" class="aliyah-banner-card">
            <GridLayout columns="auto, *, auto">
              <!-- Left: Free badge or Crown status -->
              <StackLayout col="0" verticalAlignment="center">
                @if (ca.hasCrown) {
                  <Label class="badge-gold" textWrap="true" text="👑 כתר הושג!"></Label>
                } @else if (ca.isFree) {
                  <Label class="badge-free" textWrap="true" text="🎁 חינם"></Label>
                } @else {
                  <Label class="badge" textWrap="true" [text]="'👑 רצף ' + ca.bossStreak + '/3'"></Label>
                }
              </StackLayout>

              <!-- Center: Aliyah Title, Range & Level -->
              <StackLayout col="1" verticalAlignment="center" marginRight="8" marginLeft="8">
                <Label class="cat-name" textWrap="true" [text]="ca.nameHe + ' · ' + ca.rangeHe"></Label>
                <Label class="meta" textWrap="true" [text]="(ca.isFree ? 'עלייה ראשונה חינם (כל הפסוקים פתוחים) · ' : 'נרכש ✓ · ') + ca.levelIcon + ' ' + ca.levelTitleHe + ' · הושלמו ' + ca.doneVerses + '/' + ca.totalVerses"></Label>
              </StackLayout>

              <!-- Right: Aliyah Average Grade -->
              <StackLayout col="2" class="aliyah-score-box" verticalAlignment="center">
                <Label class="aliyah-score-num" textWrap="true" [text]="ca.averageScore !== null ? '' + ca.averageScore : '—'"></Label>
                <Label class="aliyah-score-lbl" textWrap="true" text="ממוצע עלייה"></Label>
              </StackLayout>
            </GridLayout>
          </StackLayout>
        }
      }

      <!-- Verses ListView -->
      <ListView row="3" [items]="rows()" class="verses" separatorColor="#e3ddd0">
        <ng-template let-r="item">
          <GridLayout columns="auto, *, auto" class="verse-row" [class.locked]="!r.unlocked" (tap)="open(r)">
            <StackLayout col="2" verticalAlignment="center" minWidth="56" marginLeft="6">
              <Label class="verse-num" textWrap="true" [text]="r.refLabel"></Label>
              @if (r.stars) {
                <Label class="verse-stars" textWrap="true" [text]="r.stars"></Label>
              }
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center" marginRight="4" marginLeft="4">
              <Label class="verse-preview" textWrap="true" [text]="r.preview"></Label>
              <Label class="meta" textWrap="true" [text]="r.detail"></Label>
            </StackLayout>
            <StackLayout col="0" verticalAlignment="center" horizontalAlignment="center">
              @if (r.score !== null) {
                <Label class="verse-score-badge" textWrap="true" [class.verse-score-high]="r.score >= 85" [text]="'' + r.score"></Label>
              }
              <Label class="verse-status" textWrap="true" [text]="r.icon"></Label>
            </StackLayout>
          </GridLayout>
        </ng-template>
      </ListView>
    </GridLayout>
  `,
})
export class VerseListComponent {
  private readonly nav = inject(RouterExtensions);
  private readonly route = inject(ActivatedRoute);
  readonly content = inject(ContentService);
  readonly store = inject(StoreService);
  readonly billing = inject(BillingService);
  readonly priceLabel = PARASHA_PRICE_LABEL_HE;
  readonly num = hebrewNumber;

  readonly portionId = this.route.snapshot.params['id'] || 'bereshit';
  readonly portion = this.content.getPortion(this.portionId);
  readonly portionMeta = this.content.getPortionMeta(this.portionId);
  readonly bookNameHe = this.portionMeta?.bookNameHe ?? 'בראשית';

  private readonly curVerseInPortion = this.portion.verses.find((v) => v.id === this.store.progress().currentVerseId);
  private readonly initialAliyah = Number(this.route.snapshot.queryParams['aliyah']) || (this.curVerseInPortion?.aliyah ?? 1);
  readonly aliyah = signal(this.initialAliyah);

  constructor() {
    this.content.activePortionId.set(this.portionId);
  }

  goBack(): void {
    goBack(this.nav, ['/portions']);
  }

  readonly summary = computed(() => computeParashaSummary(this.portion.verses, this.store.progress(), hebrewNumber, this.portionId));
  readonly currentAliyah = computed(() => this.summary().aliyot.find((a) => a.aliyah === this.aliyah()) ?? this.summary().aliyot[0]);
  readonly remainingVersesCount = computed(() =>
    this.summary()
      .aliyot.filter((a) => a.aliyah >= 2)
      .reduce((acc, a) => acc + a.totalVerses, 0),
  );

  readonly rows = computed(() => {
    const p = this.store.progress();
    return this.portion.verses
      .filter((v) => v.aliyah === this.aliyah())
      .map((v: VerseData) => {
        const unlocked = isVerseAccessible(this.portionId, v.aliyah, p);
        const last = p.lastAttempts[v.id];
        const best = p.bestScores[v.id];
        const score = typeof best === 'number' ? best : last?.overallScore ?? null;
        const rank = score !== null ? gradeRankForScore(score) : null;
        const stars = rank ? '⭐'.repeat(rank.stars) : '';
        const icon = p.completedVerseIds.includes(v.id) ? '✓' : p.practicedVerseIds.includes(v.id) ? '●' : v.id === p.currentVerseId ? '▶' : unlocked ? '▶' : '🔒';
        const detail = [
          score !== null
            ? `${rank!.icon} ${rank!.titleHe} (ציון: ${score})`
            : last
              ? `ניסיונות: ${p.attemptCounts[v.id] ?? 0}`
              : unlocked
                ? v.aliyah === 1
                  ? 'פתוח בחינם – הקש לקריאה'
                  : 'פתוח לתרגול – הקש לקריאה'
                : `נעול – הקש לפתיחת כל פרשת ${this.portion.nameHe} ב־${this.store.currentPriceLabel()}`,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          id: v.id,
          refLabel: `${hebrewNumber(v.chapter)}:${hebrewNumber(v.verse)}`,
          preview: v.words.map((w) => w.text).join(' '),
          detail,
          icon,
          score,
          stars,
          unlocked,
        };
      });
  });

  async open(r: { id: string; refLabel: string; unlocked: boolean }): Promise<void> {
    if (r.unlocked) {
      this.nav.navigate(['/verse', r.id]);
      return;
    }
    const unlockedNow = await this.billing.promptUnlockParasha({
      id: this.portionId,
      nameHe: this.portion.nameHe,
      bookNameHe: this.bookNameHe,
    });
    if (unlockedNow) {
      this.nav.navigate(['/verse', r.id]);
    }
  }

  async unlockParasha(): Promise<void> {
    await this.billing.promptUnlockParasha({
      id: this.portionId,
      nameHe: this.portion.nameHe,
      bookNameHe: this.bookNameHe,
    });
  }

  async redeemCoupon(): Promise<void> {
    await this.billing.promptRedeemCoupon({
      id: this.portionId,
      nameHe: this.portion.nameHe,
      bookNameHe: this.bookNameHe,
    });
  }

  async restorePurchases(): Promise<void> {
    const res = await this.billing.restorePurchases();
    await Dialogs.alert({
      title: 'שחזור רכישות',
      message: res.messageHe,
      okButtonText: 'אישור',
    });
  }

  openSettings(): void {
    this.nav.navigate(['/settings']);
  }
}
