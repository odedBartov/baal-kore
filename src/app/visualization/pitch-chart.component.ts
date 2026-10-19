import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, input } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { stripMarks } from '../torah/hebrew';
import { fitRange, HOP_MS, runs, smooth } from './chart-lines';
import { drawLines, type DrawnLine } from './draw-lines';

export interface ChartSeries {
  points: (number | null)[]; // semitones per 10 ms frame (null = silence/unvoiced)
  color: string;
  lane?: boolean; // the melody to follow (the reader): a wide soft band the student's line should stay inside
  label?: string; // legend text
}

const PAD = 8; // DIPs above/below the sung range
const LABEL_H = 26; // word labels under the chart

/**
 * Karaoke-style melody chart: time flows right-to-left like the Hebrew text, one column per word with the word
 * under it, smooth pitch lines on a scale fitted to what was sung. Words with a melody mistake are tinted red,
 * the word being heard is highlighted. Lines are drawn natively into one image; playhead and yad sit on top.
 */
@Component({
  selector: 'pitch-chart',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <StackLayout class="chart-box">
      @if (title()) {
        <Label class="chart-title" [text]="title()" textWrap="true"></Label>
      }
      @if (legend().length) {
        <FlexboxLayout class="chart-legend" flexDirection="row" justifyContent="flex-end">
          @for (s of legend(); track $index) {
            <Label class="chart-legend-text" [text]="s.label"></Label>
            <StackLayout class="chart-legend-swatch" width="22" [height]="s.lane ? 12 : 5" [borderRadius]="6" [backgroundColor]="s.color" [opacity]="s.lane ? 0.3 : 1"></StackLayout>
          }
        </FlexboxLayout>
      }
      <AbsoluteLayout class="chart" [width]="width()" [height]="height() + (words().length ? labelH : 0)">
        @for (b of bands(); track $index) {
          <StackLayout [left]="b.x" top="0" [width]="b.w" [height]="height()" [backgroundColor]="b.bg"></StackLayout>
          @if (b.label) {
            <Label [left]="b.x" [top]="height() + 2" [width]="b.w" class="chart-word" [class.chart-word-bad]="b.bad" [fontSize]="b.fontSize" [text]="b.label"></Label>
          }
        }
        @for (y of grid(); track $index) {
          <StackLayout left="0" [top]="y" [width]="width()" height="1" class="chart-grid"></StackLayout>
        }
        <Image left="0" top="0" [width]="width()" [height]="height()" [src]="image()" stretch="fill"></Image>
        @if (head(); as h) {
          <StackLayout [left]="h.x" top="0" width="2" [height]="height()" class="chart-playhead"></StackLayout>
          @if (yad()) {
            <Image src="~/assets/art/yad.png" width="30" height="30" [left]="h.x - 2" [top]="h.y - 28"></Image>
          }
        }
      </AbsoluteLayout>
    </StackLayout>
  `,
})
export class PitchChartComponent {
  title = input('');
  series = input<ChartSeries[]>([]);
  durationMs = input(1);
  wordStartsMs = input<(number | null)[]>([]);
  words = input<string[]>([]); // labels, one per word start (empty: no labels)
  badWords = input<number[]>([]); // word indexes tinted as melody mistakes
  activeWord = input<number | null>(null);
  playheadMs = input<number | null>(null);
  yad = input(false);
  width = input(300);
  height = input(150);
  readonly labelH = LABEL_H;

  private smoothed = computed(() => this.series().map((s) => smooth(s.points)));
  private range = computed(() => fitRange(this.smoothed()));
  private xAt(ms: number): number {
    return this.width() - (ms / Math.max(1, this.durationMs())) * this.width();
  }
  private yAt(st: number): number {
    const { lo, hi } = this.range();
    return PAD + ((hi - st) / (hi - lo)) * (this.height() - 2 * PAD);
  }

  legend = computed(() => [...this.series()].filter((s) => s.label).reverse()); // first series rightmost (RTL)

  image = computed(() => {
    const { lo, hi } = this.range();
    const lines: DrawnLine[] = this.series().flatMap((s, k) => {
      const r = runs(this.smoothed()[k], lo, hi).map((run) => run.map(({ i, v }) => [this.xAt(i * HOP_MS), this.yAt(v)] as [number, number]));
      return s.lane
        ? [{ runs: r, color: s.color, width: 12, opacity: 0.25 }, { runs: r, color: s.color, width: 1.5, opacity: 0.6 }]
        : [{ runs: r, color: s.color, width: 3.5, opacity: 1 }];
    });
    return drawLines(this.width(), this.height(), lines);
  });

  grid = computed(() => {
    const { lo, hi } = this.range(), out: number[] = [];
    for (let st = Math.ceil(lo / 2) * 2; st <= hi; st += 2) out.push(Math.round(this.yAt(st)));
    return out;
  });

  bands = computed(() => {
    const starts = this.wordStartsMs(), labels = this.words(), bad = new Set(this.badWords()), active = this.activeWord();
    return starts.flatMap((s, w) => {
      if (s === null) return [];
      const next = starts.slice(w + 1).find((n): n is number => n !== null);
      const x1 = this.xAt(s), x0 = next !== undefined ? this.xAt(next) : 0, width = Math.max(0, x1 - x0);
      const label = labels[w] ?? '', chars = stripMarks(label).length || 1;
      return [{
        x: x0,
        w: width,
        bg: bad.has(w) ? '#fde3e1' : w === active ? '#fff1c2' : w % 2 ? '#faf6ee' : '#ffffff',
        bad: bad.has(w),
        label: width >= 14 ? label : '',
        fontSize: Math.max(9, Math.min(15, width / (chars * 0.62 + 0.6))),
      }];
    });
  });

  head = computed(() => {
    const ms = this.playheadMs();
    if (ms === null) return null;
    const pts = this.smoothed()[0] ?? [], { lo, hi } = this.range();
    let v: number | null = null;
    for (let d = 0, i = Math.round(ms / HOP_MS); d < 30 && v === null; d++) v = pts[i - d] ?? pts[i + d] ?? null;
    return { x: Math.max(0, Math.min(this.width() - 2, this.xAt(ms))), y: v !== null && v >= lo && v <= hi ? this.yAt(v) : this.height() / 2 };
  });
}
