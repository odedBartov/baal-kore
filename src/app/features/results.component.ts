import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Screen } from '@nativescript/core';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { Playback, wordAt } from '../core/playback';
import { THRESHOLDS } from '../analysis/evaluate';
import { CATEGORY_NAME_HE, type CategoryScore, type DetectedError } from '../analysis/types';
import { rabbiSays } from '../teaching/rabbi';
import { stripAccents } from '../torah/hebrew';
import { RabbiComponent } from '../ui/rabbi.component';
import { VerseTextComponent, type WordMark } from '../ui/verse-text.component';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

const MENTION = 0.6; // word-level marks and named mistakes need at least this confidence (spec §10.5)
const SEVERITY_HE = { critical: 'חמור', major: 'משמעותי', moderate: 'בינוני', minor: 'קל' };
const MATURITY_HE = { validated: 'מאומת', experimental: 'ניסיוני', unavailable: 'לא זמין' };

/** Screen G — results: status, categories with their maturity, word-level marks, melody comparison. */
@Component({
  selector: 'results',
  imports: [NativeScriptCommonModule, RabbiComponent, VerseTextComponent, PitchChartComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="תוצאות"></ActionBar>
    @if (entry; as e) {
      <ScrollView>
        <StackLayout class="page">
          <StackLayout [class]="'status status-' + e.evaluation.status">
            <Label class="status-title" [text]="statusTitle" textWrap="true"></Label>
            <Label class="status-score" [text]="e.evaluation.overallScore !== null ? e.evaluation.overallScore + ' / 100' : 'אין ציון סופי'"></Label>
            <Label class="meta" textWrap="true" [text]="statusDetail"></Label>
          </StackLayout>
          <rabbi [line]="line"></rabbi>
          @for (q of e.evaluation.qualityIssues; track $index) {
            <Label class="warning" textWrap="true" [text]="'⚠ ' + q"></Label>
          }

          <Label class="section" text="המילים בפסוק"></Label>
          <verse-text [verse]="verse" [marks]="marks" [activeWord]="activeWord()"></verse-text>
          <Label class="legend" textWrap="true" text="✓ נשמע טוב · ? לא בטוח · ✗ כדאי לבדוק (מסומן רק כשהבדיקה בטוחה מספיק)"></Label>

          <Label class="section" text="פירוט"></Label>
          @for (c of e.evaluation.categories; track c.category) {
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
          <Button class="btn btn-primary" text="קריאה חוזרת של כל הפסוק" (tap)="retry()"></Button>
          @if (canMarkPracticed) {
            <Button class="btn" text="סימון הפסוק כמתורגל והמשך" (tap)="markPracticed()"></Button>
          }
          @if (canAdvance() && next) {
            <Button class="btn" text="לפסוק הבא" (tap)="goNext()"></Button>
          }
          <Button class="btn-link" text="לרשימת הפסוקים" (tap)="nav.navigate(['/portion', 'bereshit'], { clearHistory: false })"></Button>
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
  private readonly ev = this.entry?.evaluation;
  readonly line = this.ev
    ? rabbiSays({ kind: 'evaluation', evaluation: this.ev, previous: this.entry!.previous, attempt: this.store.progress().attemptCounts[this.verse.id] ?? 1, mistakeCounts: this.store.progress().mistakeCounts })
    : rabbiSays({ kind: 'verse-intro', where: '', attempts: 0, done: false });

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
  readonly statusTitle = !this.ev
    ? ''
    : this.ev.status === 'passed'
      ? '✓ עבר בהצלחה'
      : this.ev.status === 'failed'
        ? '✗ עוד לא עבר'
        : this.ev.inconclusiveReason === 'audio-quality'
          ? 'לא ניתן היה לבדוק את ההקלטה'
          : 'בדיקה חלקית';
  readonly statusDetail = !this.ev
    ? ''
    : this.ev.status !== 'inconclusive'
      ? `סף המעבר: ${this.ev.passingThreshold}`
      : this.ev.inconclusiveReason === 'audio-quality'
        ? 'כדאי לתקן את הבעיה שבהקלטה ולקרוא שוב.'
        : this.ev.inconclusiveReason === 'reference-missing'
          ? 'אין הקלטת קורא לפסוק, ולכן לא נבדקה המנגינה.'
          : 'חלק מהבדיקות עדיין ניסיוניות או לא זמינות (למשל דיוקי ההגייה), ולכן האפליקציה לא נותנת ציון סופי ולא מאשרת מעבר.';
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
