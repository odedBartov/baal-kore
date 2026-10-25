import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService, hebrewNumber } from '../core/content.service';
import {
  computeChallengeStatus,
  computeParashaSummary,
  type DailyQuest,
} from '../core/gamification';
import { requestNotificationPermission } from '../core/notifications';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';

/** Screen A — Duolingo-style gamified Home Dashboard. */
@Component({
  selector: 'welcome',
  imports: [NativeScriptCommonModule, RabbiComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="בעל קורא">
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar></gamification-bar>

        @if (toast()) {
          <Label class="reward-toast" textWrap="true" [text]="toast()"></Label>
        }

        <!-- Hero Rank & Parasha Overview Card -->
        <StackLayout class="hero-card">
          <GridLayout columns="auto, *">
            <StackLayout col="0" class="grade-pill-box" verticalAlignment="center">
              <Label class="grade-pill-num" [text]="summary().averageScore !== null ? '' + summary().averageScore : '—'"></Label>
              <Label class="grade-pill-lbl" text="ממוצע פרשה"></Label>
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="card-title-gold" [text]="store.rank().badgeIcon + ' ' + store.rank().titleHe + ' (רמה ' + store.rank().level + ')'"></Label>
              <Label class="body-light" textWrap="true" [text]="store.rank().subtitleHe"></Label>
              <Label class="meta-light" [text]="'פרשת בראשית: ' + summary().doneVerses + ' מתוך ' + summary().totalVerses + ' פסוקים · כתרי עליות: 👑 ' + store.progress().aliyahCrowns.length + '/7'"></Label>
            </StackLayout>
          </GridLayout>
        </StackLayout>

        <rabbi [line]="line()" [size]="126"></rabbi>

        <!-- Primary Action CTA -->
        @if (returning()) {
          <Button class="btn btn-primary btn-cta" [text]="'▶ להמשיך בקריאה: ' + where()" (tap)="continue()"></Button>
          <GridLayout columns="*, *" class="buttons">
            <Button col="1" class="btn" text="📖 עליות וציונים" (tap)="nav.navigate(['/portions'])"></Button>
            <Button col="0" class="btn" text="🎯 אתגרים וחנות" (tap)="nav.navigate(['/challenges'])"></Button>
          </GridLayout>
        } @else {
          <Button class="btn btn-primary btn-cta" text="🚀 מתחילים ללמוד (+50 🪙 מתנת פתיחה!)" (tap)="start()"></Button>
        }

        <!-- Time-Span Challenge Card -->
        @if (challengeStatus(); as cs) {
          <StackLayout class="challenge-active-card" (tap)="nav.navigate(['/challenges'])">
            <GridLayout columns="auto, *">
              <Label col="0" class="badge-gold" [text]="'נותרו ' + cs.daysLeft + ' ימים'"></Label>
              <Label col="1" class="cat-name" [text]="'⏱️ ' + cs.titleHe"></Label>
            </GridLayout>
            <Label class="meta" [text]="'התקדמות: ' + cs.doneTargetVerses + '/' + cs.totalTargetVerses + ' פסוקים · יעד יומי: ' + cs.versesPerDayNeeded + ' פסוקים ליום'"></Label>
            <GridLayout class="meter" height="9">
              <StackLayout class="meter-fill" horizontalAlignment="right" [width]="(cs.progressPct / 100) * 310"></StackLayout>
            </GridLayout>
          </StackLayout>
        } @else {
          <GridLayout columns="auto, *" class="card challenge-invite" (tap)="quickStartChallenge()">
            <Button col="0" class="btn-small btn-primary" text="התחל אתגר" (tap)="quickStartChallenge()"></Button>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" text="⏱️ אתגר 14 ימים לפרשת בראשית"></Label>
              <Label class="meta" textWrap="true" text="הגדירו יעד יומי לסיום הפרשה וזכו ב־180 🪙 ו־450 XP!"></Label>
            </StackLayout>
          </GridLayout>
        }

        <!-- Daily Quests Preview -->
        <Label class="section" text="🎯 משימות היום"></Label>
        @for (q of store.dailyQuests(); track q.id) {
          <GridLayout columns="auto, *, auto" class="quest-card" [class.quest-done]="q.completed">
            <Label col="2" class="quest-icon" [text]="q.icon"></Label>
            <StackLayout col="1">
              <Label class="quest-title" [text]="q.titleHe"></Label>
              <Label class="meta" [text]="q.current + ' / ' + q.target + ' הושלמו'"></Label>
            </StackLayout>
            <StackLayout col="0" verticalAlignment="center">
              @if (q.claimed) {
                <Label class="quest-claimed" text="✓ נאסף"></Label>
              } @else if (q.completed) {
                <Button class="btn-claim" [text]="'+' + q.rewardCoins + '🪙 איסוף'" (tap)="claim(q)"></Button>
              } @else {
                <Label class="quest-reward" [text]="'+' + q.rewardCoins + ' 🪙'"></Label>
              }
            </StackLayout>
          </GridLayout>
        }

        <Label class="note center" textWrap="true" text="האפליקציה עובדת בלי אינטרנט. ההקלטות והנתונים שלכם נשמרים רק במכשיר."></Label>
      </StackLayout>
    </ScrollView>
  `,
})
export class WelcomeComponent implements OnInit {
  readonly nav = inject(RouterExtensions);
  readonly store = inject(StoreService);
  private readonly content = inject(ContentService);
  readonly toast = signal<string | null>(null);

  readonly returning = computed(() => this.store.progress().welcomed);
  readonly where = computed(() => this.content.label(this.content.verse(this.store.progress().currentVerseId) ?? this.content.verses[0]));
  readonly line = computed(() => rabbiSays({ kind: 'welcome', returning: this.returning(), where: this.where() }));
  readonly summary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
  readonly challengeStatus = computed(() => computeChallengeStatus(this.store.progress().challengePlan, this.summary()));

  ngOnInit(): void {
    if (this.store.settings().reminderEnabled) {
      requestNotificationPermission();
    }
  }

  start(): void {
    this.store.updateProgress((p) => (p.welcomed = true));
    this.nav.navigate(['/portions']);
  }

  continue(): void {
    this.nav.navigate(['/verse', this.store.progress().currentVerseId]);
  }

  quickStartChallenge(): void {
    this.store.startChallenge('parasha-14d');
    this.toast.set('⏱️ אתגר 14 הימים לפרשת בראשית הופעל! בהצלחה!');
  }

  claim(q: DailyQuest): void {
    if (this.store.claimDailyQuest(q.id)) {
      this.toast.set(`🎉 קיבלתם +${q.rewardCoins} 🪙 ו־+${q.rewardXp} XP!`);
    }
  }
}
