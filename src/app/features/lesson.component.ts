import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { ActivatedRoute } from '@angular/router';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Screen } from '@nativescript/core';
import type { ContourResult } from '../audio/analysis.worker';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import type { EffortAssessment } from '../core/gamification';
import { Playback, wordAt } from '../core/playback';
import { RecordingSession } from '../core/recording';
import { StoreService } from '../core/store.service';
import type { LessonCheck } from '../teaching/lesson-check';
import { planLessons, type LessonUnit } from '../teaching/lessons';
import { rabbiSays, type RabbiLine } from '../teaching/rabbi';
import { TAAM_BY_ID } from '../torah/cantillation';
import { stripAccents } from '../torah/hebrew';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';
import { VerseTextComponent } from '../ui/verse-text.component';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

/** Screen E — cantillation lesson for the new te'amim of a verse, taught inside their phrase (spec §12). */
@Component({
  selector: 'lesson',
  imports: [NativeScriptCommonModule, RabbiComponent, VerseTextComponent, PitchChartComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="שיעור טעמים">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="openSettings()"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar [compact]="true"></gamification-bar>
        @if (unit(); as u) {
          <Label class="meta" [text]="'שיעור ' + (index() + 1) + ' מתוך ' + units.length"></Label>
          <rabbi [line]="line()"></rabbi>
          @for (t of u.newTaamim; track t) {
            <GridLayout columns="*, auto" class="card taam-card">
              <Label col="1" class="taam-symbol" [text]="symbol(t)"></Label>
              <StackLayout col="0">
                <Label class="card-title" [text]="def(t).nameHe"></Label>
                <Label class="tag" [text]="def(t).kind === 'disjunctive' ? 'מפסיק – עוצר את הקריאה' : 'משרת – מחבר למילה הבאה'"></Label>
                <Label class="body" textWrap="true" [text]="def(t).explanationHe"></Label>
              </StackLayout>
            </GridLayout>
          }
          <verse-text [verse]="verse" [focus]="u.wordIndexes" [activeWord]="activeWord()"></verse-text>
          @if (chart().length) {
            <pitch-chart [title]="chart().length > 1 ? 'השירה שלכם מול הקורא (בלי הבדלי גובה)' : 'המנגינה של הצירוף'"
              [series]="chart()" [durationMs]="segment().endMs - segment().startMs" [wordStartsMs]="segmentWordStarts()" [words]="unitWords()" [activeWord]="activeWordInUnit()"
              [playheadMs]="playback.playing() === 'demo' ? playback.positionMs() : null" [yad]="true" [width]="chartW"></pitch-chart>
          }
          @if (mineChart().length) {
            <pitch-chart title="השירה שלכם" [series]="mineChart()" [durationMs]="check()!.student.length * 10"
              [playheadMs]="playback.playing() === 'mine' ? playback.positionMs() : null" [yad]="playback.playing() === 'mine'" [width]="chartW"></pitch-chart>
          }
          @if (!ref) {
            <Label class="error" textWrap="true" text="אין הקלטת קורא לפסוק הזה, ולכן אי אפשר להשמיע דוגמה או לבדוק את השירה."></Label>
            <Button class="btn btn-primary" text="המשך לפסוק" (tap)="finish()"></Button>
          } @else {
            <GridLayout columns="*, *" class="buttons">
              <Button col="1" class="btn" [text]="playback.playing() === 'demo' ? 'עצירה' : 'האזנה לדוגמה'" (tap)="demo()" [isEnabled]="!rec.active() && !busy()"></Button>
              <Button col="0" class="btn btn-record" [text]="rec.active() ? 'סיום' : 'הקלטה'" (tap)="record()" [isEnabled]="heard() && !busy()"></Button>
            </GridLayout>
            @if (rec.active()) {
              <GridLayout class="meter" height="12"><StackLayout class="meter-fill" horizontalAlignment="right" [width]="meter()"></StackLayout></GridLayout>
            }
            @if (busy()) {
              <ActivityIndicator busy="true"></ActivityIndicator>
            }
            @if (check(); as c) {
              @if (lessonReward(); as rw) {
                <StackLayout class="reward-card">
                  <Label class="effort-rank-title" [text]="rw.badgeIcon + ' רמת ביצוע: ' + rw.titleHe + ' ' + '⭐'.repeat(rw.stars)"></Label>
                  <FlexboxLayout flexDirection="row" flexWrap="wrap" justifyContent="space-around">
                    <Label class="reward-pill reward-pill-xp" [text]="'⭐ +' + rw.xpEarned + ' XP'"></Label>
                    <Label class="reward-pill reward-pill-coins" [text]="'🪙 +' + rw.coinsEarned + ' מטבעות'"></Label>
                  </FlexboxLayout>
                </StackLayout>
              }
              @if (c.deviation !== null) {
                <Label class="meta" [text]="'סטייה מהמנגינה: ' + c.deviation.toFixed(1) + ' חצאי טון (הסף: ' + maxDev.toFixed(2) + ')'"></Label>
              }
              @if (c.status === 'passed' || (c.status === 'failed' && c.wordsHeard !== false && c.deviation !== null && c.deviation <= maxDev)) {
                <Button class="btn btn-primary btn-cta" [text]="index() + 1 < units.length ? '▶ לשיעור הבא' : '▶ לקריאת הפסוק'" (tap)="next()"></Button>
              }
              <Button class="btn" [text]="playback.playing() === 'mine' ? 'עצירה' : 'האזנה להקלטה שלי'" (tap)="playMine()"></Button>
            }
          }
          @if (error()) {
            <Label class="error" textWrap="true" [text]="error()"></Label>
          }
          <Label class="note" textWrap="true" text="הבדיקה בשיעור ניסיונית. ההקלטה לדוגמה היא של קורא אמיתי וממתינה לאישור מומחה."></Label>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class LessonComponent implements OnDestroy {
  private nav = inject(RouterExtensions);

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
  get maxDev(): number {
    return this.store.settings().lessonMaxDeviation;
  }
  openSettings(): void {
    this.nav.navigate(['/settings']);
  }

  readonly verse = this.content.verse(this.route.snapshot.params['verseId'])!;
  readonly ref = this.content.referenceFor(this.verse.id);
  private readonly review: string | undefined = this.route.snapshot.queryParams['taam'];
  readonly units: LessonUnit[] = this.review
    ? this.verse.groups.map((g, gi) => ({ g, gi })).filter(({ g }) => g.words.some((w) => this.verse.words[w].taamim.includes(this.review!))).slice(0, 1)
        .map(({ g, gi }) => ({ verseId: this.verse.id, groupIndex: gi, wordIndexes: g.words, taamim: [this.review!], newTaamim: [this.review!] }))
    : planLessons(this.verse, this.store.progress().masteredCantillationIds);
  readonly index = signal(0);
  readonly unit = computed(() => this.units[this.index()] ?? null);
  readonly line = signal<RabbiLine | null>(null);
  readonly busy = signal(false);
  readonly heard = signal(false);
  readonly check = signal<LessonCheck | null>(null);
  readonly lessonReward = signal<EffortAssessment | null>(null);
  readonly error = signal<string | null>(null);
  private refContour = signal<ContourResult | null>(null);
  private clip = signal<{ path: string; startMs: number; endMs: number } | null>(null); // the phrase alone, cut from the verse
  private readonly mine = this.audio.scratchWav('lesson');

  readonly segment = computed(() => this.clip() ?? { startMs: 0, endMs: 1 });
  readonly segmentWordStarts = computed(() => (this.unit()?.wordIndexes ?? []).map((w) => this.ref!.words[w].startMs - this.segment().startMs));
  readonly unitWords = computed(() => (this.unit()?.wordIndexes ?? []).map((w) => stripAccents(this.verse.words[w].text)));
  readonly activeWordInUnit = computed(() => {
    const w = this.activeWord(), u = this.unit();
    return w === null || !u ? null : u.wordIndexes.indexOf(w);
  });
  readonly activeWord = computed(() => {
    const u = this.unit(), ms = this.playback.positionMs();
    if (!u || ms === null || this.playback.playing() !== 'demo') return null;
    const k = wordAt(ms, this.segmentWordStarts());
    return k === null ? null : u.wordIndexes[k];
  });
  readonly chart = computed<ChartSeries[]>(() => {
    const c = this.refContour(), s = this.segment(), chk = this.check();
    // After a check, both lines come from it so they share one scale (the phrase's own centre, key removed).
    if (chk?.studentOnReference.some((v) => v !== null))
      return [{ points: chk.reference, color: '#2f6fd0', lane: true, label: 'הקורא' }, { points: chk.studentOnReference, color: '#e07b00', label: 'אתם' }];
    return c ? [{ points: c.semitones.slice(Math.floor(s.startMs / 10), Math.ceil(s.endMs / 10)), color: '#2f6fd0', lane: true }] : [];
  });
  readonly mineChart = computed<ChartSeries[]>(() => {
    const chk = this.check();
    // Only when there is no comparison to show (the student's line is already on the chart above otherwise).
    return this.chart().length < 2 && chk?.student.some((v) => v !== null) ? [{ points: chk.student, color: '#e07b00' }] : [];
  });

  constructor() {
    if (!this.units.length) {
      setTimeout(() => this.finish());
      return;
    }
    this.intro();
    if (this.ref)
      this.audio
        .referenceWav(this.verse.id, this.ref)
        .then((master) => this.audio.contour(master))
        .then((c) => this.refContour.set(c))
        .catch((e) => this.error.set(`לא הצלחתי להכין את הדוגמה: ${e}`));
  }

  meter(): number {
    return Math.min(1, this.rec.level() * 4) * this.chartW;
  }

  def(t: string) {
    return TAAM_BY_ID[t];
  }

  /** The ta'am shown on the word of this verse that carries it (Ezra SIL has no dotted-circle glyph). */
  symbol(t: string): string {
    const w = this.unit()?.wordIndexes.find((i) => this.verse.words[i].taamim.includes(t));
    if (w !== undefined) return this.verse.words[w].text;
    return 'א' + (t === 'sof-pasuk' ? 'ֽ׃' : TAAM_BY_ID[t].symbol);
  }

  private intro(): void {
    const u = this.unit()!;
    this.heard.set(false);
    this.check.set(null);
    this.lessonReward.set(null);
    this.line.set(rabbiSays({ kind: 'lesson-intro', newTaamim: u.newTaamim, words: u.wordIndexes.map((w) => this.verse.words[w].text).join(' ') }));
    this.clip.set(null);
    if (this.ref)
      this.audio
        .phraseClip(this.verse.id, this.ref, u.wordIndexes[0], u.wordIndexes[u.wordIndexes.length - 1])
        .then((c) => this.unit() === u && this.clip.set(c))
        .catch((e) => this.error.set(`לא הצלחתי להכין את הדוגמה: ${e}`));
  }

  demo(): void {
    if (this.playback.playing()) return this.playback.stop();
    const c = this.clip();
    if (!c) return;
    this.line.set(rabbiSays({ kind: 'listening' }));
    this.playback.play(c.path, 'demo', 0, null, () => this.heard.set(true));
  }

  async record(): Promise<void> {
    if (this.rec.active()) return this.rec.stop();
    this.playback.stop();
    this.error.set(null);
    this.check.set(null);
    this.lessonReward.set(null);
    const err = await this.rec.start(this.mine, (r) => this.assess(r.interruptedHe), 30_000);
    if (err) this.error.set(err);
    else this.line.set(rabbiSays({ kind: 'recording' }));
  }

  private async assess(interrupted?: string): Promise<void> {
    if (interrupted) return this.error.set(interrupted);
    const u = this.unit()!, clip = this.clip();
    if (!clip) return;
    this.busy.set(true);
    this.line.set(rabbiSays({ kind: 'analyzing' }));
    try {
      const c = await this.audio.run<LessonCheck>({
        type: 'lesson', studentWav: this.mine, referenceWav: clip.path,
        maxDeviation: this.maxDev, spokenWords: u.wordIndexes.map((w) => this.verse.words[w].spoken),
      });
      this.check.set(c);
      if (c.status !== 'inconclusive') {
        const rw = this.store.recordLessonAttempt(c.status === 'passed', u.newTaamim, c.deviation);
        this.lessonReward.set(rw);
      }
      const failures = u.newTaamim.reduce((m, t) => Math.max(m, this.store.progress().lessonFailures[t] ?? 0), 0);
      this.line.set(rabbiSays({ kind: 'lesson-result', passed: c.status === 'passed', inconclusive: c.status === 'inconclusive', reasonHe: c.reasonHe, failures, newTaamim: u.newTaamim }));
    } catch (e) {
      this.error.set(`הבדיקה נכשלה: ${e}`);
    } finally {
      this.busy.set(false);
    }
  }

  playMine(): void {
    if (this.playback.playing() === 'mine') return this.playback.stop();
    this.playback.play(this.mine, 'mine');
  }

  next(): void {
    if (this.index() + 1 < this.units.length) {
      this.index.update((i) => i + 1);
      this.intro();
    } else this.finish();
  }

  finish(): void {
    if (this.review) this.nav.back();
    else this.nav.navigate(['/verse', this.verse.id], { replaceUrl: true, queryParams: this.ref ? {} : { skipLessons: 1 } });
  }

  ngOnDestroy(): void {
    this.playback.stop();
    this.rec.dispose();
  }
}
