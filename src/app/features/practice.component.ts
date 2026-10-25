import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Screen } from '@nativescript/core';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { Playback, wordAt } from '../core/playback';
import { RecordingSession } from '../core/recording';
import type { ContourResult } from '../audio/analysis.worker';
import { planLessons } from '../teaching/lessons';
import { stripAccents } from '../torah/hebrew';
import { rabbiSays, type RabbiLine } from '../teaching/rabbi';
import { RabbiComponent } from '../ui/rabbi.component';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { ALIYAH_NAMES_HE } from '../core/gamification';
import { VerseTextComponent } from '../ui/verse-text.component';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

/** Screen F — verse practice: listen (with the yad), then record the whole verse and analyse it on-device. */
@Component({
  selector: 'practice',
  imports: [NativeScriptCommonModule, RabbiComponent, VerseTextComponent, PitchChartComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar [title]="label">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar [compact]="true"></gamification-bar>
        <rabbi [line]="line()"></rabbi>
        <verse-text [verse]="verse" [activeWord]="activeWord()"></verse-text>
        @if (verse.notes.length) {
          <Label class="note" textWrap="true" [text]="'הערת נוסח: ' + verse.notes.join(' ')"></Label>
        }
        <FlexboxLayout class="badges" flexDirection="row" flexWrap="wrap">
          <Label class="badge-gold" [text]="aliyahName"></Label>
          <Label class="badge" [class.badge-warn]="cov.reference !== 'approved'" [text]="refBadge"></Label>
          @if (cov.timing === 'check') {
            <Label class="badge badge-warn" text="תזמון המילים דורש בדיקה"></Label>
          }
        </FlexboxLayout>

        @if (ref) {
          <Button class="btn" [text]="playback.playing() === 'ref' ? 'עצירה' : preparing() ? 'מכין את ההקלטה…' : 'השמעת הקורא'" (tap)="listen()"
            [isEnabled]="!rec.active() && !analyzing() && !preparing()"></Button>
          @if (refSeries().length) {
            <pitch-chart title="המנגינה של הקורא" [series]="refSeries()" [durationMs]="refContour()!.durationMs" [wordStartsMs]="refStarts" [words]="chartWords" [activeWord]="activeWord()"
              [playheadMs]="playback.playing() === 'ref' ? playback.positionMs() : null" [yad]="true" [width]="chartW"></pitch-chart>
          }
        } @else {
          <Label class="error" textWrap="true" text="אין הקלטת קורא לפסוק הזה. אפשר לקרוא, אבל לא תהיה השוואת מנגינה."></Label>
        }

        <Button class="btn btn-record" [text]="rec.active() ? 'סיום הקריאה' : 'קריאת הפסוק'" (tap)="record()" [isEnabled]="!analyzing() && !preparing()"></Button>
        @if (rec.active()) {
          <Label class="meta center" [text]="'מקליט… ' + (rec.elapsedMs() / 1000).toFixed(0) + ' שניות'"></Label>
          <GridLayout class="meter" height="12"><StackLayout class="meter-fill" horizontalAlignment="right" [width]="meter()"></StackLayout></GridLayout>
          <Button class="btn-link" text="ביטול ההקלטה" (tap)="cancel()"></Button>
        }
        @if (analyzing()) {
          <ActivityIndicator busy="true"></ActivityIndicator>
          <Label class="meta center" textWrap="true" text="מנתח את הקריאה במכשיר… בפעם הראשונה זה לוקח יותר זמן."></Label>
        }
        @if (last(); as l) {
          <pitch-chart title="הקריאה הקודמת שלכם" [series]="lastSeries()" [durationMs]="l.charts.student.durationMs" [wordStartsMs]="l.charts.student.wordStartsMs" [words]="chartWords" [width]="chartW"></pitch-chart>
          <Button class="btn-link" text="לתוצאות של הקריאה הקודמת" (tap)="nav.navigate(['/results', verse.id])"></Button>
        }
        @if (error()) {
          <Label class="error" textWrap="true" [text]="error()"></Label>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class PracticeComponent implements OnDestroy {
  nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/portion', 'bereshit'], { aliyah: this.verse.aliyah });
  }
  private route = inject(ActivatedRoute);
  private audio = inject(AudioService);
  private content = inject(ContentService);
  private store = inject(StoreService);
  readonly playback = new Playback(this.audio.player);
  readonly rec = new RecordingSession(this.audio.recorder);
  readonly chartW = Math.floor(Screen.mainScreen.widthDIPs - 32);

  readonly verse = this.content.verse(this.route.snapshot.params['id'])!;
  readonly label = this.content.label(this.verse);
  readonly aliyahName = ALIYAH_NAMES_HE[this.verse.aliyah]?.full ?? `עלייה ${this.verse.aliyah}`;
  readonly ref = this.content.referenceFor(this.verse.id);
  readonly cov = this.content.coverage(this.verse.id);
  readonly refBadge = this.cov.reference === 'approved' ? 'הקלטת קורא מאושרת' : this.cov.reference === 'pending' ? 'הקלטת קורא אמיתי – ממתינה לאישור מומחה' : 'אין הקלטת קורא';
  readonly refStarts = this.ref?.words.map((w) => w.startMs) ?? [];

  readonly line = signal<RabbiLine>(
    rabbiSays({ kind: 'verse-intro', where: this.label, attempts: this.store.progress().attemptCounts[this.verse.id] ?? 0, done: this.isDone() }),
  );
  readonly preparing = signal(false);
  readonly analyzing = signal(false);
  readonly busy = computed(() => this.preparing() || this.analyzing() || this.rec.active());
  readonly error = signal<string | null>(null);
  readonly refContour = signal<ContourResult | null>(null);
  readonly last = signal(this.store.evaluations.get(this.verse.id));

  readonly activeWord = computed(() => (this.playback.playing() === 'ref' ? wordAt(this.playback.positionMs(), this.refStarts) : null));
  readonly refSeries = computed<ChartSeries[]>(() => (this.refContour() ? [{ points: this.refContour()!.semitones, color: '#2f6fd0', lane: true }] : []));
  readonly chartWords = this.verse.words.map((w) => stripAccents(w.text));
  readonly lastSeries = computed<ChartSeries[]>(() => (this.last() ? [{ points: this.last()!.charts.student.semitones, color: '#e07b00' }] : []));

  constructor() {
    const lessons = planLessons(this.verse, this.store.progress().masteredCantillationIds);
    if (lessons.length && !this.route.snapshot.queryParams['skipLessons']) {
      setTimeout(() => this.nav.navigate(['/lesson', this.verse.id], { replaceUrl: true }));
      return;
    }
    this.store.updateProgress((p) => (p.currentVerseId = this.verse.id));
    if (this.ref)
      this.audio
        .referenceWav(this.verse.id, this.ref)
        .then((w) => this.audio.contour(w))
        .then((c) => this.refContour.set(c))
        .catch((e) => this.error.set(`לא הצלחתי להכין את הקלטת הקורא: ${e}`));
  }

  private isDone(): boolean {
    const p = this.store.progress();
    return p.completedVerseIds.includes(this.verse.id) || p.practicedVerseIds.includes(this.verse.id);
  }

  meter(): number {
    return Math.min(1, this.rec.level() * 4) * this.chartW;
  }

  async listen(): Promise<void> {
    if (this.playback.playing()) return this.playback.stop();
    if (!this.ref) return;
    this.preparing.set(true);
    try {
      const file = await this.audio.referenceWav(this.verse.id, this.ref);
      this.line.set(rabbiSays({ kind: 'listening' }));
      this.playback.play(file, 'ref');
    } catch (e) {
      this.error.set(`לא הצלחתי להשמיע את הקורא: ${e}`);
    } finally {
      this.preparing.set(false);
    }
  }

  async record(): Promise<void> {
    if (this.rec.active()) return this.rec.stop();
    this.playback.stop();
    this.error.set(null);
    const wav = this.audio.attemptWav(this.verse.id);
    this.audio.forget(wav);
    const err = await this.rec.start(wav, (r) => {
      if (r.interruptedHe) return this.error.set(r.interruptedHe);
      if (r.samples < 16000) return this.error.set('ההקלטה קצרה מדי. צריך לקרוא את כל הפסוק ורק אז ללחוץ על "סיום הקריאה".');
      this.analyze(wav, r.samples);
    }, 120_000);
    if (err) this.error.set(err);
    else this.line.set(rabbiSays({ kind: 'recording' }));
  }

  cancel(): void {
    this.rec.dispose();
    this.line.set(rabbiSays({ kind: 'verse-intro', where: this.label, attempts: 0, done: this.isDone() }));
  }

  private async analyze(wav: string, samples: number): Promise<void> {
    this.analyzing.set(true);
    this.line.set(rabbiSays({ kind: 'analyzing' }));
    try {
      const res = await this.audio.evaluateVerse(this.verse, wav);
      // Collected with `adb logcat | findstr EVAL_TIMINGS` for the performance report.
      console.log('EVAL_TIMINGS ' + JSON.stringify({ verse: this.verse.id, audioMs: Math.round(samples / 16), ...res.timingsMs }));
      const previous = this.store.progress().lastAttempts[this.verse.id];
      this.store.evaluations.set(this.verse.id, { evaluation: res.evaluation, charts: res.charts, recording: wav, previous });
      this.store.recordAttempt(res.evaluation, this.verse.aliyah);
      this.nav.navigate(['/results', this.verse.id]);
    } catch (e) {
      this.error.set(`הניתוח נכשל: ${e}`);
      this.line.set(rabbiSays({ kind: 'verse-intro', where: this.label, attempts: 1, done: this.isDone() }));
    } finally {
      this.analyzing.set(false);
    }
  }

  ngOnDestroy(): void {
    this.playback.stop();
    this.rec.dispose();
  }
}
