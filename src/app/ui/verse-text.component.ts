import { ChangeDetectionStrategy, Component, ElementRef, NO_ERRORS_SCHEMA, OnDestroy, QueryList, ViewChild, ViewChildren, effect, inject, input, output, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { CoreTypes, type View } from '@nativescript/core';
import { StoreService } from '../core/store.service';
import { stripMarks } from '../torah/hebrew';
import type { VerseData, WordToken } from '../torah/model';

export type WordMark = 'ok' | 'doubtful' | 'problem' | null;
const ICON: Record<string, string> = { ok: '✓', doubtful: '?', problem: '✗' };

/**
 * The verse in a Biblical Hebrew font, one view per word token (stable token ids, never character offsets),
 * wrapping right-to-left. Supports:
 * - Equipped custom Yad pointer from the Shop (`store.equippedYadAsset()`)
 * - Tikkun Kor'im mode (מצב ספר תורה / תיקון קוראים – ללא ניקוד וטעמים) with tap-to-peek on any word
 * - Tapping any word to emit `wordTap` (plays that word's studio audio clip)
 */
@Component({
  selector: 'verse-text',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <StackLayout>
      @if (showToolbar()) {
        <FlexboxLayout flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom="4">
          <Button class="chip" [class.chip-on]="tikkunMode()"
            [text]="tikkunMode() ? '📜 מצב ספר תורה (ללא ניקוד – הקש לחזרה)' : '📖 מצב תיקון קוראים (הסתר ניקוד וטעמים)'"
            (tap)="toggleTikkun()"></Button>
          <Label class="meta" textWrap="true" [text]="tikkunMode() ? '💡 הקישו על מילה להצצה והשמעה' : '💡 הקישו על מילה להשמעה'"></Label>
        </FlexboxLayout>
      }
      <GridLayout #box class="verse-box">
        <FlexboxLayout flexDirection="row" flexWrap="wrap" class="verse">
          @for (w of verse().words; track w.id; let i = $index) {
            <StackLayout #word class="vw" [class.active]="i === activeWord() || i === peekWord()" [class.dim]="focus() !== null && !focus()!.includes(i)" [class.joined]="w.maqafToNext" (tap)="onWordTap(i)">
              <Label class="vw-text" [fontSize]="fontSize()" [text]="displayWord(w, i)"></Label>
              @if (marks()?.[i]; as m) {
                <Label [class]="'vw-mark ' + m" [text]="icon[m]"></Label>
              }
            </StackLayout>
          }
        </FlexboxLayout>
        <Image #yad [src]="store.equippedYadAsset()" width="46" height="46" horizontalAlignment="left" verticalAlignment="top"
          [opacity]="activeWord() !== null ? 1 : 0" isUserInteractionEnabled="false"></Image>
      </GridLayout>
    </StackLayout>
  `,
})
export class VerseTextComponent implements OnDestroy {
  readonly store = inject(StoreService);
  verse = input.required<VerseData>();
  activeWord = input<number | null>(null);
  marks = input<WordMark[] | null>(null);
  focus = input<number[] | null>(null); // lesson: the phrase being taught
  fontSize = input(30);
  showToolbar = input(true);
  wordTap = output<number>();
  readonly icon = ICON;

  readonly tikkunMode = signal(false);
  readonly peekWord = signal<number | null>(null);
  private peekTimer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('box', { static: true }) box!: ElementRef<View>;
  @ViewChild('yad', { static: true }) yad!: ElementRef<View>;
  @ViewChildren('word') words!: QueryList<ElementRef<View>>;

  constructor() {
    // Yad follows the word being chanted. The pointer tip is the image's bottom-left corner.
    effect(() => {
      const i = this.activeWord();
      if (i === null) return;
      setTimeout(() => {
        const w = this.words?.get(i)?.nativeElement, box = this.box?.nativeElement, yad = this.yad?.nativeElement;
        if (!w || !box || !yad || !w.isLoaded) return;
        const at = w.getLocationRelativeTo(box), size = w.getActualSize();
        if (!at) return;
        yad.animate({ translate: { x: at.x + size.width / 2 - 4, y: Math.max(0, at.y - 30) }, duration: 180, curve: CoreTypes.AnimationCurve.easeOut }).catch(() => undefined);
      });
    });
  }

  toggleTikkun(): void {
    this.tikkunMode.update((v) => !v);
    this.peekWord.set(null);
  }

  displayWord(w: WordToken, index: number): string {
    if (!this.tikkunMode() || this.peekWord() === index) {
      return w.text + (w.paseqAfter ? ' ׀' : '');
    }
    return stripMarks(w.text);
  }

  onWordTap(index: number): void {
    if (this.tikkunMode()) {
      this.peekWord.set(index);
      if (this.peekTimer) clearTimeout(this.peekTimer);
      this.peekTimer = setTimeout(() => this.peekWord.set(null), 2600);
    }
    this.wordTap.emit(index);
  }

  ngOnDestroy(): void {
    if (this.peekTimer) clearTimeout(this.peekTimer);
  }
}
