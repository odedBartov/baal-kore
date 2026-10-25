import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Screen } from '@nativescript/core';
import { THRESHOLDS } from '../analysis/evaluate';
import { CATEGORY_NAME_HE, type CategoryScore, type DetectedError } from '../analysis/types';
import { AudioService } from '../core/audio.service';
import { ContentService, hebrewNumber } from '../core/content.service';
import { computeParashaSummary, gradeRankForScore } from '../core/gamification';
import { Playback, wordAt } from '../core/playback';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { stripAccents } from '../torah/hebrew';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';
import { VerseTextComponent, type WordMark } from '../ui/verse-text.component';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

const MENTION = 0.6; // word-level marks and named mistakes need at least this confidence (spec §10.5)
const SEVERITY_HE = { critical: 'חמור', major: 'משמעותי', moderate: 'בינוני', minor: 'קל' };
const MATURITY_HE = { validated: 'מאומת', experimental: 'ניסיוני', unavailable: 'לא זמין' };

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
                <Label class="status-score" [text]="ev?.overallScore !== null ? ev?.overallScore + '' : '—'"></Label>
                <Label class="grade-pill-lbl" [text]="'סף: ' + ev?.passingThreshold"></Label>
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
                <Label class="reward-pill reward-pill-xp" [text]="'⭐ +' + rw.xpEarned + ' XP'"></Label>
                <Label class="reward-pill reward-pill-coins" [text]="'🪙 +' + rw.coinsEarned + ' מטבעות'"></Label>
                <Label class="reward-pill reward-pill-streak" [text]="'🔥 רצף ' + rw.streakDays + ' ימים (+' + rw.streakBonusCoins + '🪙)'"></Label>
              </FlexboxLayout>
            </StackLayout>
          }

          <!-- Aliyah & Parasha Live Averages -->
          <GridLayout columns="*, *" class="averages-strip">
            <StackLayout col="1" class="avg-mini-card">
              <Label class="avg-mini-lbl" [text]="aliyahSummary().nameHe"></Label>
              <Label class="avg-mini-val" [text]="'ממוצע: ' + (aliyahSummary().averageScore ?? '—') + ' · ' + aliyahSummary().levelIcon + ' ' + aliyahSummary().levelTitleHe"></Label>
            </StackLayout>
            <StackLayout col="0" class="avg-mini-card">
              <Label class="avg-mini-lbl" text="כל פרשת בראשית"></Label>
              <Label class="avg-mini-val" [text]="'ממוצע: ' + (parashaSummary().averageScore ?? '—') + ' (' + parashaSummary().doneVerses + '/' + parashaSummary().totalVerses + ')'"></Label>
            </StackLayout>
          </GridLayout>

          <rabbi [line]="line"></rabbi>
          @for (q of ev?.qualityIssues ?? []; track $index) {
            <Label class="warning" textWrap="true" [text]="'⚠ ' + q"></Label>
          }

          <Label class="section" text="המילים בפסוק"></Label>
          <verse-text [verse]="verse" [marks]="marks" [activeWord]="activeWord()"></verse-text>
          <Label class="legend" textWrap="true" text="✓ נשמע טוב · ? לא בטוח · ✗ כדאי לבדוק (מסומן רק כשהבדיקה בטוחה מספיק)"></Label>

          <Label class="section" text="פירוט הציונים"></Label>
          @for (c of ev?.categories ?? []; track c.category) {
            <GridLayout columns="auto, *" class="cat-row">
              <StackLayout col="1">
                <Label class="cat-name" [text]="catName(c)"></Label>
                @if (c.noteHe) {
                  <Label class="meta" textWrap="true" [text]="c.noteHe"></Label>
                }
              </StackLayout>
              <StackLayout col="0" horizontalAlignment="left">
                <Label class="cat-score" [text]="c.score !== null ? '' + c.score : 'לא נבדק'"></Label>
                <Label [class]="'tag tag-' + c.maturity" [text]="maturity[c.maturity] + (c.score !== null ? ' · ודאות ' + pct(c.confidence) : '')"></Label>
              </StackLayout>
            </GridLayout>
          }

          @if (shownErrors.length) {
            <Label class="section" text="מה כדאי לשפר"></Label>
            @for (x of shownErrors; track $index) {
              <StackLayout class="error-item">
                <Label class="body" textWrap="true" [text]="x.explanationHe"></Label>
                <Label class="meta" [text]="name(x.category) + ' · ' + severity[x.severity] + ' · ודאות ' + pct(x.confidence)"></Label>
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

          <GridLayout columns="*, *" class="buttons">
            <Button col="1" class="btn" [text]="playback.playing() === 'ref' ? 'עצירה' : 'הקורא'" (tap)="playRef()" [isEnabled]="!!ref"></Button>
            <Button col="0" class="btn" [text]="playback.playing() === 'mine' ? 'עצירה' : 'ההקלטה שלי'" (tap)="playMine()"></Button>
          </GridLayout>
          @if (line.suggestLesson) {
            <Button class="btn" text="חזרה על השיעור" (tap)="nav.navigate(['/lesson', verse.id], { queryParams: { taam: line.suggestLesson } })"></Button>
          }
          <Button class="btn btn-primary" text="קריאה חוזרת לשיפור הציון והמטבעות" (tap)="retry()"></Button>
          @if (canMarkPracticed) {
            <Button class="btn" text="סימון הפסוק כמתורגל והמשך" (tap)="markPracticed()"></Button>
          }
          @if (canAdvance() && next) {
            <Button class="btn btn-cta" text="▶ לפסוק הבא" (tap)="goNext()"></Button>
          }
          <Button class="btn-link" text="לרשימת העליות והפסוקים" (tap)="nav.navigate(['/portion', 'bereshit'], { queryParams: { aliyah: verse.aliyah } })"></Button>
          <Label class="meta" textWrap="true" [text]="footer"></Label>
        </StackLayout>
      </ScrollView>
    }
  `,
})
export class ResultsComponent implements OnDestroy {
  nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/portion', 'bereshit'], { aliyah: this.verse.aliyah });
  }
  private route = inject(ActivatedRoute);
  private audio = inject(AudioService);
  private content = inject(ContentService);
  private store = inject(StoreService);
  readonly playback = new Playback(this.audio.player);
  readonly chartW = Math.floor(Screen.mainScreen.widthDIPs - 32);
  readonly severity = SEVERITY_HE;
  readonly maturity = MATURITY_HE;

  readonly verse = this.content.verse(this.route.snapshot.params['id'])!;
  readonly ref = this.content.referenceFor(this.verse.id);
  readonly next = this.content.next(this.verse.id);
  readonly entry = this.store.evaluations.get(this.verse.id) ?? null;

  get ev() {
    this.store.settings();
    return this.store.evaluations.get(this.verse.id)?.evaluation;
  }

  readonly parashaSummary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
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
  readonly activeWord = computed(() => {
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

  goNext(): void {
    if (this.next) this.nav.navigate(['/verse', this.next.id], { replaceUrl: true });
    else this.nav.navigate(['/portion', 'bereshit']);
  }

  ngOnDestroy(): void {
    this.playback.stop();
  }
}
