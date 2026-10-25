import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { ContentService, hebrewNumber } from '../core/content.service';
import { computeParashaSummary, gradeRankForScore } from '../core/gamification';
import { isUnlocked } from '../core/state';
import { StoreService } from '../core/store.service';
import type { VerseData } from '../torah/model';
import { GamificationBarComponent } from '../ui/gamification-bar.component';

/** Screen D — 7 Aliyot & chapters navigator with per-Aliyah average grade, Boss Crown tracker, and coin unlock. */
@Component({
  selector: 'verse-list',
  imports: [NativeScriptCommonModule, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="פרשת בראשית">
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
              [text]="(a.hasCrown ? '👑 ' : '') + a.shortNameHe + (a.averageScore !== null ? ' (' + a.averageScore + ')' : '')"
              (tap)="aliyah.set(a.aliyah)"></Button>
          }
        </FlexboxLayout>
      </ScrollView>

      <!-- Current Aliyah Summary Card -->
      @if (currentAliyah(); as ca) {
        <StackLayout row="2" class="aliyah-banner-card">
          <GridLayout columns="auto, *, auto">
            <!-- Left: Unlock Aliyah or Crown status -->
            <StackLayout col="0" verticalAlignment="center">
              @if (!ca.allUnlocked) {
                <Button class="btn-claim" text="🔓 פתיחה 40🪙" (tap)="unlockCurrentAliyah()"></Button>
              } @else if (ca.hasCrown) {
                <Label class="badge-gold" text="👑 כתר הושג!"></Label>
              } @else {
                <Label class="badge" [text]="'👑 רצף ' + ca.bossStreak + '/3'"></Label>
              }
            </StackLayout>

            <!-- Center: Aliyah Title, Range & Level -->
            <StackLayout col="1" verticalAlignment="center" marginRight="8" marginLeft="8">
              <Label class="cat-name" [text]="ca.nameHe + ' · ' + ca.rangeHe"></Label>
              <Label class="meta" [text]="ca.levelIcon + ' ' + ca.levelTitleHe + ' · הושלמו ' + ca.doneVerses + '/' + ca.totalVerses + ' · ממוצע פרשה: ' + (summary().averageScore ?? '—')"></Label>
            </StackLayout>

            <!-- Right: Aliyah Average Grade -->
            <StackLayout col="2" class="aliyah-score-box" verticalAlignment="center">
              <Label class="aliyah-score-num" [text]="ca.averageScore !== null ? '' + ca.averageScore : '—'"></Label>
              <Label class="aliyah-score-lbl" text="ממוצע עלייה"></Label>
            </StackLayout>
          </GridLayout>
        </StackLayout>
      }

      <!-- Verses ListView -->
      <ListView row="3" [items]="rows()" class="verses" separatorColor="#e3ddd0">
        <ng-template let-r="item">
          <GridLayout columns="auto, *, auto" class="verse-row" [class.locked]="!r.unlocked" (tap)="open(r)">
            <StackLayout col="2" verticalAlignment="center" width="56">
              <Label class="verse-num" [text]="r.refLabel"></Label>
              @if (r.stars) {
                <Label class="verse-stars" [text]="r.stars"></Label>
              }
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="verse-preview" [text]="r.preview"></Label>
              <Label class="meta" [text]="r.detail" textWrap="true"></Label>
            </StackLayout>
            <StackLayout col="0" verticalAlignment="center" horizontalAlignment="center">
              @if (r.score !== null) {
                <Label class="verse-score-badge" [class.verse-score-high]="r.score >= 85" [text]="'' + r.score"></Label>
              }
              <Label class="verse-status" [text]="r.icon"></Label>
            </StackLayout>
          </GridLayout>
        </ng-template>
      </ListView>
    </GridLayout>
  `,
})
export class VerseListComponent {
  private readonly nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/portions']);
  }
  private readonly route = inject(ActivatedRoute);
  readonly content = inject(ContentService);
  readonly store = inject(StoreService);
  readonly num = hebrewNumber;

  private readonly initialAliyah = Number(this.route.snapshot.queryParams['aliyah']) || (this.content.verse(this.store.progress().currentVerseId)?.aliyah ?? 1);
  readonly aliyah = signal(this.initialAliyah);

  readonly summary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
  readonly currentAliyah = computed(() => this.summary().aliyot.find((a) => a.aliyah === this.aliyah()) ?? this.summary().aliyot[0]);

  readonly rows = computed(() => {
    const p = this.store.progress();
    return this.content.verses
      .filter((v) => v.aliyah === this.aliyah())
      .map((v: VerseData) => {
        const unlocked = isUnlocked(this.content.verseIds, v.id, p);
        const last = p.lastAttempts[v.id];
        const best = p.bestScores[v.id];
        const score = typeof best === 'number' ? best : last?.overallScore ?? null;
        const rank = score !== null ? gradeRankForScore(score) : null;
        const stars = rank ? '⭐'.repeat(rank.stars) : '';
        const icon = p.completedVerseIds.includes(v.id) ? '✓' : p.practicedVerseIds.includes(v.id) ? '●' : v.id === p.currentVerseId ? '▶' : unlocked ? '' : '🔒';
        const detail = [
          score !== null ? `${rank!.icon} ${rank!.titleHe} (ציון: ${score})` : last ? `ניסיונות: ${p.attemptCounts[v.id] ?? 0}` : unlocked ? 'מוכן לקריאה' : 'נעול – הקש לפתיחה ב־15 🪙',
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          id: v.id,
          refLabel: `${hebrewNumber(v.chapter)}:${hebrewNumber(v.verse)}`,
          preview: v.words.slice(0, 4).map((w) => w.text).join(' ') + ' …',
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
    const confirm = await Dialogs.confirm({
      title: `פתיחת פסוק ${r.refLabel}`,
      message: `האם לפתוח את פסוק ${r.refLabel} כעת תמורת 15 🪙 מטבעות? (ברשותך: ${this.store.progress().coins} 🪙)`,
      okButtonText: 'פתיחה ב־15 🪙',
      cancelButtonText: 'ביטול',
    });
    if (confirm) {
      if (this.store.unlockVerseWithCoins(r.id, 15)) {
        this.nav.navigate(['/verse', r.id]);
      } else {
        await Dialogs.alert({ title: 'אין מספיק מטבעות', message: 'תרגלו פסוקים פתוחים או השלימו משימות יומיות כדי להרוויח עוד מטבעות!', okButtonText: 'הבנתי' });
      }
    }
  }

  async unlockCurrentAliyah(): Promise<void> {
    const ca = this.currentAliyah();
    if (!ca) return;
    if (this.store.unlockAliyahWithCoins(ca.verseIds, 40)) {
      await Dialogs.alert({ title: 'העלייה נפתחה! 🔓', message: `כל הפסוקים של ${ca.nameHe} פתוחים כעת לתרגול.`, okButtonText: 'מעולה!' });
    } else {
      await Dialogs.alert({ title: 'אין מספיק מטבעות', message: `נדרשים 40 🪙 לפתיחת כל העלייה (ברשותך: ${this.store.progress().coins} 🪙).`, okButtonText: 'הבנתי' });
    }
  }

  openSettings(): void {
    this.nav.navigate(['/settings']);
  }
}
