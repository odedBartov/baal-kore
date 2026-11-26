import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { BOOKS, ContentService, PORTIONS } from '../core/content.service';
import {
  ALIYAH_NAMES_HE,
  CHALLENGE_PRESETS,
  computeCatalogPortionSummary,
  computeChallengeStatus,
  getWeeklyParashaId,
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
            <Label class="streak-num-big" textWrap="true" [text]="'🔥 ' + store.progress().streakDays"></Label>
            <Label class="streak-lbl-big" textWrap="true" text="ימים ברצף"></Label>
          </StackLayout>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="card-title-gold" textWrap="true" [text]="'שיא רצף אישי: ' + store.progress().bestStreak + ' ימים'"></Label>
            <Label class="body-light" textWrap="true" [text]="'מגיני הקפאת רצף זמינים: 🧊 ' + store.progress().streakFreezes"></Label>
            <Label class="meta-light" textWrap="true" text="כל יום של קריאה מגדיל את בונוס המטבעות שלכם עד +20 🪙 לכל פסוק!"></Label>
          </StackLayout>
        </GridLayout>

        <!-- Daily Quests -->
        <Label class="section" textWrap="true" text="🎯 משימות יומיות (מתאפסות כל יום)"></Label>
        @for (q of store.dailyQuests(); track q.id) {
          <GridLayout columns="auto, *, auto" class="quest-card" [class.quest-done]="q.completed">
            <Label col="2" class="quest-icon" [text]="q.icon"></Label>
            <StackLayout col="1">
              <Label class="quest-title" textWrap="true" [text]="q.titleHe"></Label>
              <Label class="meta" textWrap="true" [text]="q.subtitleHe + ' (' + q.current + '/' + q.target + ')'"></Label>
              <GridLayout class="meter" height="8">
                <StackLayout class="meter-fill-gold" horizontalAlignment="right" [width]="(q.current / q.target) * 200"></StackLayout>
              </GridLayout>
            </StackLayout>
            <StackLayout col="0" verticalAlignment="center">
              @if (q.claimed) {
                <Label class="quest-claimed" textWrap="true" text="✓ נאסף"></Label>
              } @else if (q.completed) {
                <Button class="btn-claim" textWrap="true" [text]="'איסוף +' + q.rewardCoins + '🪙'" (tap)="claim(q)"></Button>
              } @else {
                <Label class="quest-reward" textWrap="true" [text]="'+' + q.rewardCoins + ' 🪙'"></Label>
              }
            </StackLayout>
          </GridLayout>
        }

        <!-- Bar-Mitzvah & Shabbat Target Date Planner -->
        <Label class="section" textWrap="true" text="🕍 מתכנן קריאה לתאריך יעד (בר־מצווה / שבת)"></Label>
        <StackLayout class="card">
          <Label class="card-title" textWrap="true" [text]="'פרשת יעד: פרשת ' + plannerPortion().nameHe + ' (' + plannerPortion().bookNameHe + ')'"></Label>
          <Label class="meta" textWrap="true" [text]="plannerScopeLabel() + ' · סה״כ ' + plannerTotalVerses() + ' פסוקים · קצב מומלץ: ' + plannerDailyPace() + ' פסוקים ביום'"></Label>
          <GridLayout columns="*, *" marginTop="6">
            <Button col="1" class="btn-small" textWrap="true" text="📖 החלפת פרשה" (tap)="pickPlannerPortion()"></Button>
            <Button col="0" class="btn-small" textWrap="true" [text]="'📜 היקף: ' + (plannerAliyah() === 0 ? 'כל הפרשה' : 'עלייה ' + plannerAliyah())" (tap)="pickPlannerScope()"></Button>
          </GridLayout>
          <ScrollView orientation="horizontal" scrollBarIndicatorVisible="false" marginTop="6">
            <FlexboxLayout class="chapters" flexDirection="row" justifyContent="center">
              @for (d of plannerDayChoices; track d) {
                <Button class="chip" [class.chip-on]="plannerDays() === d" [text]="d + ' ימים'" (tap)="plannerDays.set(d)"></Button>
              }
              <Button class="chip" text="📅 ימים מותאם…" (tap)="promptCustomDays()"></Button>
            </FlexboxLayout>
          </ScrollView>
          <Button class="btn btn-primary" textWrap="true" marginTop="6"
            [text]="'🚀 הפעל תוכנית יעד (' + plannerDailyPace() + ' פסוקים ביום ל־' + plannerDays() + ' ימים)'"
            (tap)="activateCustomPlan()"></Button>
        </StackLayout>

        <!-- Time-Span Parasha / Aliyah Challenge -->
        <Label class="section" textWrap="true" [text]="'⏱️ אתגר זמן פעיל לפרשת ' + activePortion().nameHe"></Label>
        @if (challengeStatus(); as cs) {
          <StackLayout class="challenge-active-card">
            <GridLayout columns="auto, *">
              <Label col="0" class="badge-gold" textWrap="true" [text]="cs.onTrack ? '✓ בקצב היעד!' : '⚡ הגבירו קצב'"></Label>
              <Label col="1" class="card-title" [text]="cs.titleHe" textWrap="true"></Label>
            </GridLayout>
            <Label class="body" textWrap="true" [text]="'נותרו ' + cs.daysLeft + ' ימים · הושלמו ' + cs.doneTargetVerses + ' מתוך ' + cs.totalTargetVerses + ' פסוקים (' + cs.progressPct + '%)'"></Label>
            <GridLayout class="meter" height="10">
              <StackLayout class="meter-fill" horizontalAlignment="right" [width]="(cs.progressPct / 100) * 310"></StackLayout>
            </GridLayout>
            <Label class="challenge-pace" textWrap="true" [text]="cs.remainingVerses > 0 ? 'יעד יומי לסיום בזמן: ' + cs.versesPerDayNeeded + ' פסוקים ליום' : '🎉 השלמתם את יעד האתגר! כל הכבוד!'"></Label>
            <Button class="btn btn-cta" textWrap="true" marginTop="6" text="▶ המשך לתרגול הפסוק הבא בתוכנית" (tap)="continueTargetPlan()"></Button>
          </StackLayout>
        } @else {
          <Label class="meta" textWrap="true" text="או בחרו אחד ממסלולי האתגר המהירים:"></Label>
        }

        @for (p of presets; track p.id) {
          <GridLayout columns="auto, *" class="card preset-card" [class.preset-selected]="store.progress().challengePlan?.id === p.id">
            <Button col="0" class="btn-small btn-primary" textWrap="true" [text]="store.progress().challengePlan?.id === p.id ? 'פעיל ✓' : 'הפעלה'" (tap)="startPreset(p.id)"></Button>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="p.titleHe"></Label>
              <Label class="meta" textWrap="true" [text]="'פרס סיום: +' + p.rewardCoins + ' 🪙 · +' + p.rewardXp + ' XP'"></Label>
            </StackLayout>
          </GridLayout>
        }

        <!-- Aliyah Boss Crowns -->
        <Label class="section" textWrap="true" [text]="'👑 אתגר כתרי העליות בפרשת ' + activePortion().nameHe + ' (3 פסוקים עוברים ברצף)'"></Label>
        @for (a of summary().aliyot; track a.aliyah) {
          <GridLayout columns="auto, *, auto" class="card aliyah-boss-row" (tap)="openAliyah(a.aliyah)">
            <Label col="2" class="boss-crown-icon" [text]="a.hasCrown ? '👑' : '🛡️'"></Label>
            <StackLayout col="1">
              <Label class="cat-name" textWrap="true" [text]="a.nameHe + ' (' + a.rangeHe + ')'"></Label>
              <Label class="meta" textWrap="true" [text]="a.hasCrown ? 'כתר העלייה הושג! · ממוצע: ' + (a.averageScore ?? '—') : 'רצף הצלחות בעלייה: ' + a.bossStreak + '/3 · ממוצע: ' + (a.averageScore ?? 'טרם נבדק')"></Label>
            </StackLayout>
            <Label col="0" class="badge" textWrap="true" [class.badge-warn]="!a.hasCrown" [text]="a.doneVerses + '/' + a.totalVerses"></Label>
          </GridLayout>
        }

        <!-- User Level & Rank Ladder -->
        <Label class="section" textWrap="true" text="🏆 סולם הדרגות של בעל קורא"></Label>
        @for (t of tiers; track t.id) {
          <GridLayout columns="auto, *" class="card tier-row" [class.tier-current]="store.rank().tierId === t.id">
            @if (store.rank().tierId === t.id) {
              <Label col="0" class="badge" textWrap="true" verticalAlignment="center" text="הדרגה שלך כעת"></Label>
            }
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="t.icon + ' ' + t.title + ' (' + t.levels + ')'"></Label>
              <Label class="meta" textWrap="true" [text]="t.desc"></Label>
            </StackLayout>
          </GridLayout>
        }

        <Button class="btn" textWrap="true" text="🔔 שליחת התראת תזכורת עכשיו (בדיקה)" (tap)="testNotification()"></Button>
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

  readonly activePortion = computed(() => {
    const planPid = this.store.progress().challengePlan?.portionId;
    if (planPid) {
      const m = this.content.getPortionMeta(planPid);
      if (m) return m;
    }
    return this.content.portionOfVerse(this.store.progress().currentVerseId);
  });
  readonly summary = computed(() => computeCatalogPortionSummary(this.activePortion(), this.store.progress()));
  readonly challengeStatus = computed(() => computeChallengeStatus(this.store.progress().challengePlan, this.summary()));

  // Bar-Mitzvah / Shabbat Target Date Planner state
  readonly plannerDayChoices = [7, 14, 30, 60, 90];
  readonly plannerPortionId = signal<string>(this.store.progress().challengePlan?.portionId ?? getWeeklyParashaId());
  readonly plannerAliyah = signal<number>(this.store.progress().challengePlan?.targetType === 'aliyah' ? (this.store.progress().challengePlan?.aliyah ?? 1) : 0);
  readonly plannerDays = signal<number>(this.store.progress().challengePlan?.targetDays ?? 30);

  readonly plannerPortion = computed(() => this.content.getPortionMeta(this.plannerPortionId()) ?? PORTIONS[0]);
  readonly plannerTotalVerses = computed(() => {
    const meta = this.plannerPortion();
    const al = this.plannerAliyah();
    if (al === 0) return meta.totalVerses;
    return meta.aliyot.find((a) => a.n === al)?.verseIds.length ?? meta.totalVerses;
  });
  readonly plannerDailyPace = computed(() => Math.max(1, Math.ceil(this.plannerTotalVerses() / Math.max(1, this.plannerDays()))));
  readonly plannerScopeLabel = computed(() => {
    const al = this.plannerAliyah();
    return al === 0 ? 'כל 7 העליות בפרשה' : (ALIYAH_NAMES_HE[al]?.full ?? `עלייה ${al}`);
  });

  async pickPlannerPortion(): Promise<void> {
    const bookChoices = BOOKS.map((b) => `חומש ${b.nameHePlain}`);
    const bookPick = await Dialogs.action({
      title: 'בחירת חומש לתוכנית היעד',
      message: 'בחרו את החומש של פרשת בר־המצווה או השבת שלכם:',
      cancelButtonText: 'ביטול',
      actions: bookChoices,
    });
    const bookIdx = bookChoices.indexOf(bookPick);
    if (bookIdx < 0) return;
    const book = BOOKS[bookIdx];
    const portions = this.content.getPortionsByBook(book.id);
    const pChoices = portions.map((p) => `פרשת ${p.nameHe}`);
    const pPick = await Dialogs.action({
      title: `בחירת פרשה בחומש ${book.nameHePlain}`,
      cancelButtonText: 'ביטול',
      actions: pChoices,
    });
    const pIdx = pChoices.indexOf(pPick);
    if (pIdx >= 0) {
      this.plannerPortionId.set(portions[pIdx].id);
    }
  }

  async pickPlannerScope(): Promise<void> {
    const actions = [
      'כל הפרשה (עליות א׳–ז׳)',
      ...[1, 2, 3, 4, 5, 6, 7].map((a) => ALIYAH_NAMES_HE[a].full),
    ];
    const res = await Dialogs.action({
      title: 'בחירת היקף הקריאה',
      cancelButtonText: 'ביטול',
      actions,
    });
    const idx = actions.indexOf(res);
    if (idx >= 0) {
      this.plannerAliyah.set(idx); // 0 = whole parasha, 1..7 = specific aliyah
    }
  }

  async promptCustomDays(): Promise<void> {
    const res = await Dialogs.prompt({
      title: '📅 מספר ימים עד לתאריך היעד',
      message: 'הזינו את מספר הימים שנותרו עד לשבת או לבר־המצווה (1–365):',
      okButtonText: 'אישור',
      cancelButtonText: 'ביטול',
      defaultText: String(this.plannerDays()),
    });
    if (res.result && res.text) {
      const n = parseInt(res.text.trim(), 10);
      if (!isNaN(n) && n >= 1 && n <= 365) {
        this.plannerDays.set(n);
      }
    }
  }

  activateCustomPlan(): void {
    const meta = this.plannerPortion();
    const al = this.plannerAliyah();
    this.store.startCustomTargetPlan({
      portionId: meta.id,
      portionNameHe: meta.nameHe,
      targetDays: this.plannerDays(),
      targetType: al === 0 ? 'parasha' : 'aliyah',
      aliyah: al === 0 ? undefined : al,
    });
    const firstVerseId = al === 0 ? meta.aliyot[0].verseIds[0] : (meta.aliyot.find((a) => a.n === al)?.verseIds[0] ?? meta.aliyot[0].verseIds[0]);
    this.store.updateProgress((p) => (p.currentVerseId = firstVerseId));
    this.banner.set(`🕍 תוכנית היעד לפרשת ${meta.nameHe} הופעלה (${this.plannerDailyPace()} פסוקים ביום)!`);
  }

  continueTargetPlan(): void {
    const meta = this.activePortion();
    const al = this.store.progress().challengePlan?.aliyah ?? 1;
    this.nav.navigate(['/portion', meta.id], { queryParams: { aliyah: al } });
  }

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
    this.nav.navigate(['/portion', this.activePortion().id], { queryParams: { aliyah } });
  }

  testNotification(): void {
    const ok = sendLocalReminderNotification(this.store.progress().streakDays);
    this.banner.set(ok ? '🔔 התראת תזכורת נשלחה לוילון ההתראות של המכשיר!' : 'לא ניתן היה לשלוח התראה.');
  }
}
