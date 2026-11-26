import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Screen } from '@nativescript/core';
import { THRESHOLDS } from '../analysis/evaluate';
import { CATEGORY_NAME_HE, type CategoryScore, type DetectedError } from '../analysis/types';
import { AudioService } from '../core/audio.service';
import { BillingService } from '../core/billing.service';
import { ContentService } from '../core/content.service';
import { computeCatalogPortionSummary, gradeRankForScore } from '../core/gamification';
import { Playback, wordAt } from '../core/playback';
import { PARASHA_PRICE_LABEL_HE } from '../core/state';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { stripAccents } from '../torah/hebrew';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';
import { VerseTextComponent, type WordMark } from '../ui/verse-text.component';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

const MENTION = 0.6; // word-level marks and named mistakes need at least this confidence (spec §10.5)
const SEVERITY_HE = { critical: 'חמור', major: 'משמעותי', moderate: 'בינוני', minor: 'קל' };
const MATURITY_HE = { validated: 'מדויק', experimental: 'מדויק', unavailable: 'לא זמין' };

/** Screen G — results: Duolingo-style effort level celebration, XP/Coins/Streak rewards, Aliyah & Parasha averages, and melody comparison. */
@Component({
  selector: 'results',
  imports: [NativeScriptCommonModule, RabbiComponent, VerseTextComponent, PitchChartComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="תוצאות ותגמולים">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    @if (entry; as e) {
      <ScrollView>
        <StackLayout class="page">
          <gamification-bar [compact]="true"></gamification-bar>

          <!-- Status & Effort Level Hero Card -->
          <StackLayout [class]="'status status-' + ev?.status">
            <GridLayout columns="auto, *">
              <StackLayout col="0" class="grade-pill-box" verticalAlignment="center">
                <Label class="status-score" textWrap="true" [text]="ev?.overallScore !== null ? ev?.overallScore + '' : '—'"></Label>
                <Label class="grade-pill-lbl" textWrap="true" [text]="'סף: ' + ev?.passingThreshold"></Label>
              </StackLayout>
              <StackLayout col="1" verticalAlignment="center" marginRight="10">
                <Label class="status-title" [text]="statusTitle" textWrap="true"></Label>
                <Label class="effort-rank-title" [text]="effortRank().icon + ' רמת הביצוע: ' + effortRank().titleHe + ' ' + effortStars()" textWrap="true"></Label>
                <Label class="meta" textWrap="true" [text]="effortRank().subtitleHe"></Label>
              </StackLayout>
            </GridLayout>
          </StackLayout>

          <!-- Gamified Rewards Banner (XP, Coins, Streak, Level Up, Aliyah Crown) -->
          @if (e.reward; as rw) {
            <StackLayout class="reward-card">
              @if (rw.leveledUp) {
                <Label class="level-up-banner" textWrap="true" [text]="'🎉 עליתם לרמה ' + rw.newLevel + ' (' + rw.newRankTitleHe + ')! כל הכבוד!'"></Label>
              }
              @if (rw.aliyahCrownEarned) {
                <Label class="level-up-banner" textWrap="true" text="👑 השגתם 3 פסוקים ברצף וזכיתם בכתר העלייה (+50 🪙 ו־+100 XP)!"></Label>
              }
              <FlexboxLayout flexDirection="row" flexWrap="wrap" justifyContent="space-around" alignItems="center">
                <Label class="reward-pill reward-pill-xp" textWrap="true" [text]="'⭐ +' + rw.xpEarned + ' XP'"></Label>
                <Label class="reward-pill reward-pill-coins" textWrap="true" [text]="'🪙 +' + rw.coinsEarned + ' מטבעות'"></Label>
                <Label class="reward-pill reward-pill-streak" textWrap="true" [text]="'🔥 רצף ' + rw.streakDays + ' ימים (+' + rw.streakBonusCoins + '🪙)'"></Label>
              </FlexboxLayout>
            </StackLayout>
          }

          <!-- Aliyah & Parasha Live Averages -->
          <GridLayout columns="*, *" class="averages-strip">
            <StackLayout col="1" class="avg-mini-card">
              <Label class="avg-mini-lbl" textWrap="true" [text]="aliyahSummary().nameHe"></Label>
              <Label class="avg-mini-val" textWrap="true" [text]="'ממוצע: ' + (aliyahSummary().averageScore ?? '—') + ' · ' + aliyahSummary().levelIcon + ' ' + aliyahSummary().levelTitleHe"></Label>
            </StackLayout>
            <StackLayout col="0" class="avg-mini-card">
              <Label class="avg-mini-lbl" textWrap="true" [text]="'כל פרשת ' + portionMeta.nameHe"></Label>
              <Label class="avg-mini-val" textWrap="true" [text]="'ממוצע: ' + (parashaSummary().averageScore ?? '—') + ' (' + parashaSummary().doneVerses + '/' + parashaSummary().totalVerses + ')'"></Label>
            </StackLayout>
          </GridLayout>

          <rabbi [line]="line"></rabbi>
          @for (q of ev?.qualityIssues ?? []; track $index) {
            <Label class="warning" textWrap="true" [text]="'⚠ ' + q"></Label>
          }

          <Label class="section" textWrap="true" text="המילים בפסוק (הקישו על כל מילה להשמעת הקורא)"></Label>
          <verse-text [verse]="verse" [marks]="marks" [activeWord]="activeWord()" (wordTap)="playWord($event)"></verse-text>
          <Label class="legend" textWrap="true" text="✓ נשמע טוב · ? לא בטוח · ✗ כדאי לבדוק (הקישו על המילה כדי לשמוע איך הקורא מבטא אותה)"></Label>

          <Label class="section" textWrap="true" text="פירוט הציונים"></Label>
          @for (c of ev?.categories ?? []; track c.category) {
            <GridLayout columns="auto, *" class="cat-row">
              <StackLayout col="1">
                <Label class="cat-name" textWrap="true" [text]="catName(c)"></Label>
                @if (c.noteHe) {
                  <Label class="meta" textWrap="true" [text]="c.noteHe"></Label>
                }
              </StackLayout>
              <StackLayout col="0" horizontalAlignment="left">
                <Label class="cat-score" textWrap="true" [text]="c.score !== null ? '' + c.score : 'לא נבדק'"></Label>
                <Label [class]="'tag tag-' + c.maturity" textWrap="true" [text]="maturity[c.maturity] + (c.score !== null ? ' · ודאות ' + pct(c.confidence) : '')"></Label>
              </StackLayout>
            </GridLayout>
          }

          @if (shownErrors.length) {
            <Label class="section" textWrap="true" text="מה כדאי לשפר"></Label>
            @for (x of shownErrors; track $index) {
              <StackLayout class="error-item">
                <Label class="body" textWrap="true" [text]="x.explanationHe"></Label>
                <Label class="meta" textWrap="true" [text]="name(x.category) + ' · ' + severity[x.severity] + ' · ודאות ' + pct(x.confidence)"></Label>
              </StackLayout>
            }
          }
          @if (hiddenErrors) {
            <Label class="meta" textWrap="true" [text]="'עוד ' + hiddenErrors + ' סימנים לא ודאיים לא הוצגו.'"></Label>
          }

          @if (compareSeries().length > 1) {
            <pitch-chart title="המנגינה שלכם מול הקורא (בלי הבדלי גובה)" [series]="compareSeries()"
              [durationMs]="e.charts.reference!.durationMs" [wordStartsMs]="e.charts.reference!.wordStartsMs" [words]="chartWords" [badWords]="melodyBad" [activeWord]="activeWord()"
              [playheadMs]="playback.playing() === 'ref' ? playback.positionMs() : null" [yad]="playback.playing() === 'ref'" [width]="chartW"></pitch-chart>
            <Label class="meta" textWrap="true" text="כדאי שהקו הכתום יישאר בתוך הפס הכחול: עולה כשהקורא עולה ויורד כשהוא יורד. מילה באדום – שם המנגינה שונה."></Label>
          } @else {
            <pitch-chart title="המנגינה שלכם" [series]="studentSeries" [durationMs]="e.charts.student.durationMs" [wordStartsMs]="e.charts.student.wordStartsMs" [words]="chartWords" [activeWord]="activeWord()"
              [playheadMs]="playback.playing() === 'mine' ? playback.positionMs() : null" [yad]="playback.playing() === 'mine'" [width]="chartW"></pitch-chart>
          }

          <GridLayout columns="*, auto, *" class="buttons">
            <Button col="2" class="btn" textWrap="true" [text]="playback.playing() === 'ref' ? 'עצירה' : 'הקורא'" (tap)="playRef()" [isEnabled]="!!ref"></Button>
            <Button col="1" class="btn-small" [class.btn-primary]="playback.speed() < 1" textWrap="true" [text]="playback.speed() < 1 ? '🐢 0.75×' : '1.0×'" (tap)="playback.toggleSpeed()"></Button>
            <Button col="0" class="btn" textWrap="true" [text]="playback.playing() === 'mine' ? 'עצירה' : 'ההקלטה שלי'" (tap)="playMine()"></Button>
          </GridLayout>
          @if (line.suggestLesson && ref) {
            <Button class="btn" textWrap="true" text="חזרה על השיעור" (tap)="nav.navigate(['/lesson', verse.id], { queryParams: { taam: line.suggestLesson } })"></Button>
          }
          <Button class="btn btn-primary" textWrap="true" text="קריאה חוזרת לשיפור הציון והמטבעות" (tap)="retry()"></Button>
          @if (canMarkPracticed) {
            <Button class="btn" textWrap="true" text="סימון הפסוק כמתורגל והמשך" (tap)="markPracticed()"></Button>
          }
          @if (canAdvance() && next) {
            <Button class="btn btn-cta" textWrap="true"
              [text]="nextNeedsPurchase() ? '🔒 המשך לעלייה שנייה (פתיחת הפרשה ב־' + store.currentPriceLabel() + ')' : '▶ לפסוק הבא'"
              (tap)="goNext()"></Button>
          }
          <Button class="btn-link" textWrap="true" text="לרשימת העליות והפסוקים" (tap)="nav.navigate(['/portion', portionMeta.id], { queryParams: { aliyah: verse.aliyah } })"></Button>
          <Label class="meta" textWrap="true" [text]="footer"></Label>
        </StackLayout>
      </ScrollView>
    }
  `,
})
export class ResultsComponent implements OnDestroy {
  nav = inject(RouterExtensions);
  private route = inject(ActivatedRoute);
  private audio = inject(AudioService);
  private billing = inject(BillingService);
  private content = inject(ContentService);
  readonly store = inject(StoreService);
  readonly priceLabel = PARASHA_PRICE_LABEL_HE;
  readonly playback = new Playback(this.audio.player);
  readonly chartW = Math.floor(Screen.mainScreen.widthDIPs - 32);
  readonly severity = SEVERITY_HE;
  readonly maturity = MATURITY_HE;

  readonly verse = this.content.verse(this.route.snapshot.params['id'])!;
  readonly portionMeta = this.content.portionOfVerse(this.verse.id);
  readonly ref = this.content.referenceFor(this.verse.id);
  readonly next = this.content.next(this.verse.id);
  readonly entry = this.store.evaluations.get(this.verse.id) ?? null;

  goBack(): void {
    goBack(this.nav, ['/portion', this.portionMeta.id], { aliyah: this.verse.aliyah });
  }

  get ev() {
    this.store.settings();
    return this.store.evaluations.get(this.verse.id)?.evaluation;
  }

  readonly parashaSummary = computed(() => computeCatalogPortionSummary(this.portionMeta, this.store.progress()));
  readonly aliyahSummary = computed(() => this.parashaSummary().aliyot.find((a) => a.aliyah === this.verse.aliyah) ?? this.parashaSummary().aliyot[0]);
  readonly effortRank = computed(() => gradeRankForScore(this.ev?.overallScore ?? null));
  readonly effortStars = computed(() => '⭐'.repeat(this.effortRank().stars));

  get line() {
    return this.ev
      ? rabbiSays({ kind: 'evaluation', evaluation: this.ev, previous: this.entry!.previous, attempt: this.store.progress().attemptCounts[this.verse.id] ?? 1, mistakeCounts: this.store.progress().mistakeCounts })
      : rabbiSays({ kind: 'verse-intro', where: '', attempts: 0, done: false });
  }

  readonly shownErrors: DetectedError[] = this.ev?.errors.filter((e) => e.confidence >= MENTION) ?? [];
  readonly hiddenErrors = (this.ev?.errors.length ?? 0) - this.shownErrors.length;
  readonly marks: WordMark[] = this.verse.words.map((_, i) => {
    const w = this.ev?.words[i];
    if (this.shownErrors.some((e) => e.wordIndex === i && e.category !== 'pause')) return 'problem';
    if (!w || w.wordScore === null) return null;
    return w.wordScore >= THRESHOLDS.wordOk ? 'ok' : 'doubtful';
  });
  readonly canMarkPracticed =
    (this.ev?.inconclusiveReason === 'unvalidated-analyzers' || this.ev?.inconclusiveReason === 'reference-missing') && !this.ev.errors.some((e) => e.kind === 'not-chanted');
  readonly canAdvance = computed(() => {
    const p = this.store.progress();
    return p.completedVerseIds.includes(this.verse.id) || p.practicedVerseIds.includes(this.verse.id);
  });
  readonly nextNeedsPurchase = computed(() => {
    if (!this.next) return false;
    return !this.store.isAliyahAccessible(this.portionMeta.id, this.next.aliyah);
  });
  get statusTitle(): string {
    return !this.ev
      ? ''
      : this.ev.status === 'passed'
        ? '✓ עבר בהצלחה!'
        : this.ev.status === 'failed'
          ? '✗ עוד קצת תרגול ונעבור'
          : this.ev.inconclusiveReason === 'audio-quality'
            ? 'לא ניתן היה לבדוק את ההקלטה'
            : 'בדיקה חלקית';
  }
  readonly footer = this.ev
    ? `הקלטת הקורא: ${this.ev.referenceApproval === 'approved' ? 'מאושרת' : this.ev.referenceApproval === 'pending' ? 'ממתינה לאישור מומחה' : 'חסרה'}. הבדיקה נעשתה כולה במכשיר.`
    : '';

  readonly studentSeries: ChartSeries[] = this.entry ? [{ points: this.entry.charts.student.semitones, color: '#e07b00' }] : [];
  readonly chartWords = this.verse.words.map((w) => stripAccents(w.text));
  readonly melodyBad = this.shownErrors.filter((x) => x.category === 'cantillation' && x.wordIndex !== undefined).map((x) => x.wordIndex!);
  readonly compareSeries = signal<ChartSeries[]>(
    this.entry?.charts.reference && this.entry.charts.studentOnReference
      ? [{ points: this.entry.charts.reference.semitones, color: '#2f6fd0', lane: true, label: 'הקורא' }, { points: this.entry.charts.studentOnReference, color: '#e07b00', label: 'אתם' }]
      : [],
  );
  private readonly tappedWord = signal<number | null>(null);
  readonly activeWord = computed(() => {
    if (this.playback.playing() === 'word') return this.tappedWord();
    const ms = this.playback.positionMs();
    if (this.playback.playing() === 'ref') return wordAt(ms, this.ref?.words.map((w) => w.startMs) ?? []);
    if (this.playback.playing() === 'mine') return wordAt(ms, this.entry?.charts.student.wordStartsMs ?? []);
    return null;
  });

  constructor() {
    if (!this.entry) setTimeout(() => this.nav.navigate(['/verse', this.verse.id], { replaceUrl: true }));
  }

  catName(c: CategoryScore): string {
    return CATEGORY_NAME_HE[c.category];
  }
  name(c: DetectedError['category']): string {
    return CATEGORY_NAME_HE[c];
  }
  pct(x: number): string {
    return `${Math.round(x * 100)}%`;
  }
  async playRef(): Promise<void> {
    if (this.playback.playing()) return this.playback.stop();
    if (!this.ref) return;
    this.playback.play(await this.audio.referenceWav(this.verse.id, this.ref), 'ref');
  }

  async playWord(wordIndex: number): Promise<void> {
    if (!this.ref) return;
    try {
      this.tappedWord.set(wordIndex);
      const c = await this.audio.phraseClip(this.verse.id, this.ref, wordIndex, wordIndex);
      this.playback.play(c.path, 'word', 0, null, () => this.tappedWord.set(null));
    } catch {
      this.tappedWord.set(null);
    }
  }

  playMine(): void {
    if (this.playback.playing()) return this.playback.stop();
    this.playback.play(this.entry!.recording, 'mine');
  }

  retry(): void {
    this.nav.navigate(['/verse', this.verse.id], { replaceUrl: true });
  }

  markPracticed(): void {
    this.store.markPracticed(this.verse.id, this.next?.id);
    this.goNext();
  }

  async goNext(): Promise<void> {
    if (!this.next) {
      this.nav.navigate(['/portion', this.portionMeta.id]);
      return;
    }
    if (!this.store.isAliyahAccessible(this.portionMeta.id, this.next.aliyah)) {
      const unlocked = await this.billing.promptUnlockParasha(this.portionMeta);
      if (unlocked) {
        this.nav.navigate(['/verse', this.next.id], { replaceUrl: true });
      } else {
        this.nav.navigate(['/portion', this.portionMeta.id], { replaceUrl: true, queryParams: { aliyah: this.next.aliyah } });
      }
      return;
    }
    this.nav.navigate(['/verse', this.next.id], { replaceUrl: true });
  }

  ngOnDestroy(): void {
    this.playback.stop();
  }
}
