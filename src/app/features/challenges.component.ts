import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService, hebrewNumber } from '../core/content.service';
import {
  CHALLENGE_PRESETS,
  computeChallengeStatus,
  computeParashaSummary,
  type DailyQuest,
} from '../core/gamification';
import { sendLocalReminderNotification } from '../core/notifications';
import { StoreService } from '../core/store.service';
import { GamificationBarComponent } from '../ui/gamification-bar.component';

const TIER_LADDER = [
  { id: 'beginner', icon: '🌱', title: 'מתחיל בקריאה', levels: 'רמות 1–2', desc: 'היכרות עם הפסוקים וטעמי המקרא הראשונים' },
  { id: 'minyan', icon: '📜', title: 'קורא במניין', levels: 'רמות 3–4', desc: 'שליטה ביסודות המנגינה והמשך רציף בעליות' },
  { id: 'barmitzva', icon: '🕍', title: 'מוכן לבר־מצווה', levels: 'רמות 5–7', desc: 'קריאה בטוחה, מדויקת ומרגשת לעלייה לתורה' },
  { id: 'baal-kore', icon: '👑', title: 'בעל קורא מוסמך', levels: 'רמות 8–10', desc: 'בקיאות מלאה במילים, בניקוד ובכל טעמי הפרשה' },
  { id: 'master', icon: '✨', title: 'רב־קורא מומחה', levels: 'רמה 11+', desc: 'מופת של קריאה בתורה ללא פשרות' },
];

@Component({
  selector: 'challenges',
  imports: [NativeScriptCommonModule, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="אתגרים ודרגות">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="🏪 חנות" class="ab-action" (tap)="nav.navigate(['/shop'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar [compact]="true"></gamification-bar>

        @if (banner()) {
          <Label class="reward-toast" textWrap="true" [text]="banner()"></Label>
        }

        <!-- Streak Hero Banner -->
        <GridLayout columns="auto, *" class="hero-card hero-streak">
          <StackLayout col="0" class="streak-badge-big" verticalAlignment="center">
            <Label class="streak-num-big" [text]="'🔥 ' + store.progress().streakDays"></Label>
            <Label class="streak-lbl-big" text="ימים ברצף"></Label>
          </StackLayout>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="card-title-gold" [text]="'שיא רצף אישי: ' + store.progress().bestStreak + ' ימים'"></Label>
            <Label class="body-light" textWrap="true" [text]="'מגיני הקפאת רצף זמינים: 🧊 ' + store.progress().streakFreezes"></Label>
            <Label class="meta-light" textWrap="true" text="כל יום של קריאה מגדיל את בונוס המטבעות שלכם עד +20 🪙 לכל פסוק!"></Label>
          </StackLayout>
        </GridLayout>

        <!-- Daily Quests -->
        <Label class="section" text="🎯 משימות יומיות (מתאפסות כל יום)"></Label>
        @for (q of store.dailyQuests(); track q.id) {
          <GridLayout columns="auto, *, auto" class="quest-card" [class.quest-done]="q.completed">
            <Label col="2" class="quest-icon" [text]="q.icon"></Label>
            <StackLayout col="1">
              <Label class="quest-title" [text]="q.titleHe"></Label>
              <Label class="meta" [text]="q.subtitleHe + ' (' + q.current + '/' + q.target + ')'"></Label>
              <GridLayout class="meter" height="8">
                <StackLayout class="meter-fill-gold" horizontalAlignment="right" [width]="(q.current / q.target) * 200"></StackLayout>
              </GridLayout>
            </StackLayout>
            <StackLayout col="0" verticalAlignment="center">
              @if (q.claimed) {
                <Label class="quest-claimed" text="✓ נאסף"></Label>
              } @else if (q.completed) {
                <Button class="btn-claim" [text]="'איסוף +' + q.rewardCoins + '🪙'" (tap)="claim(q)"></Button>
              } @else {
                <Label class="quest-reward" [text]="'+' + q.rewardCoins + ' 🪙'"></Label>
              }
            </StackLayout>
          </GridLayout>
        }

        <!-- Time-Span Parasha / Aliyah Challenge -->
        <Label class="section" text="⏱️ אתגר זמן ללימוד הפרשה"></Label>
        @if (challengeStatus(); as cs) {
          <StackLayout class="challenge-active-card">
            <GridLayout columns="auto, *">
              <Label col="0" class="badge-gold" [text]="cs.onTrack ? '✓ בקצב היעד!' : '⚡ הגבירו קצב'"></Label>
              <Label col="1" class="card-title" [text]="cs.titleHe" textWrap="true"></Label>
            </GridLayout>
            <Label class="body" textWrap="true" [text]="'נותרו ' + cs.daysLeft + ' ימים · הושלמו ' + cs.doneTargetVerses + ' מתוך ' + cs.totalTargetVerses + ' פסוקים (' + cs.progressPct + '%)'"></Label>
            <GridLayout class="meter" height="10">
              <StackLayout class="meter-fill" horizontalAlignment="right" [width]="(cs.progressPct / 100) * 310"></StackLayout>
            </GridLayout>
            <Label class="challenge-pace" textWrap="true" [text]="cs.remainingVerses > 0 ? 'יעד יומי לסיום בזמן: ' + cs.versesPerDayNeeded + ' פסוקים ליום' : '🎉 השלמתם את יעד האתגר! כל הכבוד!'"></Label>
          </StackLayout>
        } @else {
          <Label class="meta" textWrap="true" text="בחרו טווח זמן ללימוד הפרשה או העלייה הנוכחית וקבלו יעד יומי ובונוס מטבעות ענק:"></Label>
        }

        @for (p of presets; track p.id) {
          <GridLayout columns="auto, *" class="card preset-card" [class.preset-selected]="store.progress().challengePlan?.id === p.id">
            <Button col="0" class="btn-small btn-primary" [text]="store.progress().challengePlan?.id === p.id ? 'פעיל ✓' : 'הפעלה'" (tap)="startPreset(p.id)"></Button>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" [text]="p.titleHe"></Label>
              <Label class="meta" [text]="'פרס סיום: +' + p.rewardCoins + ' 🪙 · +' + p.rewardXp + ' XP'"></Label>
            </StackLayout>
          </GridLayout>
        }

        <!-- Aliyah Boss Crowns -->
        <Label class="section" text="👑 אתגר כתרי העליות (3 פסוקים עוברים ברצף)"></Label>
        @for (a of summary().aliyot; track a.aliyah) {
          <GridLayout columns="auto, *, auto" class="card aliyah-boss-row" (tap)="openAliyah(a.aliyah)">
            <Label col="2" class="boss-crown-icon" [text]="a.hasCrown ? '👑' : '🛡️'"></Label>
            <StackLayout col="1">
              <Label class="cat-name" [text]="a.nameHe + ' (' + a.rangeHe + ')'"></Label>
              <Label class="meta" [text]="a.hasCrown ? 'כתר העלייה הושג! · ממוצע: ' + (a.averageScore ?? '—') : 'רצף הצלחות בעלייה: ' + a.bossStreak + '/3 · ממוצע: ' + (a.averageScore ?? 'טרם נבדק')"></Label>
            </StackLayout>
            <Label col="0" class="badge" [class.badge-warn]="!a.hasCrown" [text]="a.doneVerses + '/' + a.totalVerses"></Label>
          </GridLayout>
        }

        <!-- User Level & Rank Ladder -->
        <Label class="section" text="🏆 סולם הדרגות של בעל קורא"></Label>
        @for (t of tiers; track t.id) {
          <GridLayout columns="auto, *" class="card tier-row" [class.tier-current]="store.rank().tierId === t.id">
            <Label col="1" class="cat-name" [text]="t.icon + ' ' + t.title + ' (' + t.levels + ')'"></Label>
            <Label col="0" class="badge" [text]="store.rank().tierId === t.id ? 'הדרגה שלך כעת' : ''"></Label>
            <Label col="1" class="meta" textWrap="true" [text]="t.desc" marginTop="24"></Label>
          </GridLayout>
        }

        <Button class="btn" text="🔔 שליחת התראת תזכורת עכשיו (בדיקה)" (tap)="testNotification()"></Button>
      </StackLayout>
    </ScrollView>
  `,
})
export class ChallengesComponent {
  readonly nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/']);
  }
  readonly store = inject(StoreService);
  private readonly content = inject(ContentService);
  readonly presets = CHALLENGE_PRESETS;
  readonly tiers = TIER_LADDER;
  readonly banner = signal<string | null>(null);

  readonly summary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
  readonly challengeStatus = computed(() => computeChallengeStatus(this.store.progress().challengePlan, this.summary()));

  claim(q: DailyQuest): void {
    if (this.store.claimDailyQuest(q.id)) {
      this.banner.set(`🎉 אספתם פרס משימה יומית: +${q.rewardCoins} 🪙 ו־+${q.rewardXp} XP!`);
    }
  }

  startPreset(id: string): void {
    const curVerse = this.content.verse(this.store.progress().currentVerseId) ?? this.content.verses[0];
    this.store.startChallenge(id, curVerse.aliyah);
    this.banner.set('⏱️ אתגר הזמן החדש הופעל בהצלחה! בהצלחה בלימוד!');
  }

  openAliyah(aliyah: number): void {
    this.nav.navigate(['/portion', 'bereshit'], { queryParams: { aliyah } });
  }

  testNotification(): void {
    const ok = sendLocalReminderNotification(this.store.progress().streakDays);
    this.banner.set(ok ? '🔔 התראת תזכורת נשלחה לוילון ההתראות של המכשיר!' : 'לא ניתן היה לשלוח התראה.');
  }
}
