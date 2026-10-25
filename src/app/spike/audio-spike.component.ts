// Diagnostics (from the Phase 3 spike): record two takes, compare their melodies, and time every stage on
// this device. Engineering screen — measurements, never a reading score.
import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Device, File, Screen, knownFolders } from '@nativescript/core';
import { AudioService } from '../core/audio.service';
import { goBack } from '../core/navigation';
import { ContentService } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { Playback } from '../core/playback';
import { RecordingSession } from '../core/recording';
import type { CompareResult } from '../audio/analysis.worker';
import { PitchChartComponent, type ChartSeries } from '../visualization/pitch-chart.component';

type Take = 'A' | 'B';
const ltr = (s: string | number) => `⁦${s}⁩`;

@Component({
  selector: 'audio-spike',
  imports: [NativeScriptCommonModule, PitchChartComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="בדיקת שמע טכנית">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <Label class="body" textWrap="true" text="הקליטו את אותו פסוק פעמיים (א׳ ו־ב׳), אפשר בגובה או בקצב אחר. המסך מציג את קו המנגינה, מיישר בין ההקלטות ומודד זמני עיבוד במכשיר."></Label>
        @for (t of takes; track t) {
          <GridLayout columns="auto, auto, *" class="setting">
            <Label col="2" class="body" [text]="'הקלטה ' + (t === 'A' ? 'א' : 'ב') + (rec.active() && recording() === t ? ' — מקליט…' : has()[t] ? ' — מוכנה' : '')"></Label>
            <Button col="1" class="btn-small" [text]="rec.active() && recording() === t ? 'עצירה' : 'הקלטה'" (tap)="record(t)" [isEnabled]="!busy()"></Button>
            <Button col="0" class="btn-small" text="השמעה" (tap)="playback.play(file(t), t)" [isEnabled]="has()[t] && !rec.active()"></Button>
          </GridLayout>
        }
        <Button class="btn btn-primary" [text]="busy() ? 'מנתח…' : 'ניתוח והשוואה'" (tap)="analyze()" [isEnabled]="has().A && !rec.active() && !busy()"></Button>
        @for (c of charts(); track $index) {
          <pitch-chart [title]="c.title" [series]="c.series" [durationMs]="c.durationMs" [width]="chartW"></pitch-chart>
        }
        @for (l of lines(); track $index) {
          <Label class="meta" textWrap="true" [text]="l"></Label>
        }
        @if (error()) {
          <Label class="error" textWrap="true" [text]="error()"></Label>
        }
        <Label class="section" text="בדיקה על קבצים"></Label>
        <Label class="meta" textWrap="true" text="קבצי WAV בתיקייה validation של האפליקציה, בשם כמו Genesis.1.1__name.wav, נבדקים בדיוק כמו קריאה של תלמיד (כולל זיהוי המילים במכשיר). ראו docs/validation.md."></Label>
        <Button class="btn" [text]="busy() ? 'בודק…' : 'בדיקת קבצים (' + files().length + ')'" (tap)="runFiles()" [isEnabled]="files().length > 0 && !busy()"></Button>
        @for (r of runs(); track r.name) {
          <StackLayout class="error-item" (tap)="nav.navigate(['/results', r.verseId])">
            <Label class="body" textWrap="true" [text]="r.name + ': ' + r.summary"></Label>
          </StackLayout>
        }
        <Label class="meta" [text]="device"></Label>
      </StackLayout>
    </ScrollView>
  `,
})
export class AudioSpikeComponent implements OnDestroy {
  nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/settings']);
  }
  private audio = inject(AudioService);
  private content = inject(ContentService);
  private store = inject(StoreService);
  private readonly validationDir = knownFolders.documents().getFolder('validation');
  readonly files = signal(this.validationDir.getEntitiesSync().map((e) => e.name).filter((n) => /^Genesis\.\d+\.\d+__.*\.wav$/.test(n)).sort());
  readonly runs = signal<{ name: string; verseId: string; summary: string }[]>([]);
  readonly playback = new Playback(this.audio.player);
  readonly rec = new RecordingSession(this.audio.recorder);
  readonly takes: Take[] = ['A', 'B'];
  readonly chartW = Math.floor(Screen.mainScreen.widthDIPs - 32);
  readonly device = `${Device.manufacturer} ${Device.model} · ${Device.os} ${Device.osVersion}`;
  readonly recording = signal<Take | null>(null);
  readonly has = signal<Record<Take, boolean>>({ A: File.exists(this.file('A')), B: File.exists(this.file('B')) });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private result = signal<CompareResult | null>(null);
  private wallMs = 0;

  file(t: Take): string {
    return this.audio.scratchWav(`diagnostics-${t}`);
  }

  async record(t: Take): Promise<void> {
    if (this.rec.active()) return this.rec.stop();
    this.playback.stop();
    this.recording.set(t);
    const err = await this.rec.start(this.file(t), (r) => (r.interruptedHe ? this.error.set(r.interruptedHe) : this.has.update((h) => ({ ...h, [t]: r.samples > 0 }))));
    if (err) this.error.set(err);
  }

  async analyze(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const t = Date.now();
    try {
      const r = await this.audio.run<CompareResult>({ type: 'compare', paths: this.takes.filter((k) => this.has()[k]).map((k) => this.file(k)) });
      this.wallMs = Date.now() - t;
      this.result.set(r);
      console.log('SPIKE_RESULT ' + JSON.stringify({ device: this.device, wallMs: this.wallMs, recordings: r.recordings.map((x) => ({ quality: x.quality, medianHz: x.medianHz, timingsMs: x.timingsMs })), alignment: r.alignment && { cost: r.alignment.normalizedCost, dtwMs: r.alignment.dtwMs, comparison: r.alignment.comparison } }));
    } catch (e) {
      this.error.set(`הניתוח נכשל: ${e}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Runs every validation file through the same evaluation as a student's reading and logs the outcome. */
  async runFiles(): Promise<void> {
    this.busy.set(true);
    this.runs.set([]);
    for (const name of this.files()) {
      const verse = this.content.verse(name.split('__')[0]);
      if (!verse) continue;
      const path = `${this.validationDir.path}/${name}`;
      try {
        const t = Date.now();
        const res = await this.audio.evaluateVerse(verse, path);
        const e = res.evaluation;
        this.store.evaluations.set(verse.id, { evaluation: e, charts: res.charts, recording: path });
        const cats = e.categories.filter((c) => c.score !== null).map((c) => `${c.category} ${c.score}`).join(', ');
        const errs = e.errors.map((x) => `${x.kind}@${x.wordIndex ?? '-'}(${x.confidence})`).join(' ');
        this.runs.update((r) => [...r, { name, verseId: verse.id, summary: `${e.status}${e.inconclusiveReason ? '/' + e.inconclusiveReason : ''} · ${cats} · ${errs || 'ללא שגיאות'} · ${Date.now() - t} ms` }]);
        console.log('VALIDATION_RESULT ' + JSON.stringify({ file: name, wallMs: Date.now() - t, timingsMs: res.timingsMs, status: e.status, reason: e.inconclusiveReason, categories: e.categories.map((c) => [c.category, c.score, c.maturity]), errors: e.errors.map((x) => [x.kind, x.wordIndex, x.confidence]) }));
      } catch (err) {
        this.runs.update((r) => [...r, { name, verseId: verse.id, summary: `שגיאה: ${err}` }]);
      }
    }
    this.busy.set(false);
  }

  readonly charts = computed(() => {
    const r = this.result();
    if (!r) return [];
    const series = (i: number, color: string): ChartSeries => ({ points: r.recordings[i].frames.map((f) => f.relativeSemitones), color });
    const out = r.recordings.map((x, i) => ({ title: `קו המנגינה – הקלטה ${i ? 'ב' : 'א'}`, series: [series(i, i ? '#e07b00' : '#1f5d99')], durationMs: x.quality.durationMs }));
    if (r.alignment?.comparison.offsetSemitones != null) {
      const a = r.recordings[0], b = r.recordings[1], off = r.alignment.comparison.offsetSemitones;
      const mapped = a.frames.map((_, i) => {
        const f = b.frames[Math.round(r.alignment!.aToB[i])]?.frequencyHz;
        return f && a.medianHz ? 12 * Math.log2(f / a.medianHz) - off : null;
      });
      out.push({ title: 'הקלטה ב׳ מיושרת לזמן ולגובה של הקלטה א׳', series: [series(0, '#9e9e9e'), { points: mapped, color: '#e07b00' }], durationMs: a.quality.durationMs });
    }
    return out;
  });

  readonly lines = computed(() => {
    const r = this.result();
    if (!r) return [];
    const out = r.recordings.map((x, i) => `הקלטה ${i ? 'ב' : 'א'}: ${ltr((x.quality.durationMs / 1000).toFixed(1))} ש׳, קולי ${ltr(Math.round(x.quality.voicedRatio * 100) + '%')}, גובה ${ltr((x.medianHz ?? 0).toFixed(0) + ' Hz')}, עיבוד ${ltr(Object.entries(x.timingsMs).map(([k, v]) => `${k} ${v}`).join(', ') + ' ms')}`);
    const c = r.alignment?.comparison;
    if (c && c.offsetSemitones !== null)
      out.push(`הפרש גובה ${ltr(c.offsetSemitones.toFixed(2))} חצאי טון · סטייה חציונית ${ltr(c.medianDeviationSemitones!.toFixed(2))} · בטווח חצי טון ${ltr(Math.round(c.within1Semitone! * 100) + '%')} · DTW ${ltr(r.alignment!.dtwMs + ' ms')}`);
    out.push(`זמן כולל ${ltr(this.wallMs + ' ms')}. מדדים טכניים בלבד, לא ציון.`);
    return out;
  });

  ngOnDestroy(): void {
    this.playback.stop();
    this.rec.dispose();
  }
}
