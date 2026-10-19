import { ChangeDetectionStrategy, Component, ElementRef, NO_ERRORS_SCHEMA, QueryList, ViewChild, ViewChildren, effect, input } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { CoreTypes, type View } from '@nativescript/core';
import type { VerseData } from '../torah/model';

export type WordMark = 'ok' | 'doubtful' | 'problem' | null;
const ICON: Record<string, string> = { ok: '✓', doubtful: '?', problem: '✗' };

/**
 * The verse in a Biblical Hebrew font, one view per word token (stable token ids, never character offsets),
 * wrapping right-to-left. The yad moves to the active word; marks use an icon as well as a colour.
 */
@Component({
  selector: 'verse-text',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <GridLayout #box class="verse-box">
      <FlexboxLayout flexDirection="row" flexWrap="wrap" class="verse">
        @for (w of verse().words; track w.id; let i = $index) {
          <StackLayout #word class="vw" [class.active]="i === activeWord()" [class.dim]="focus() !== null && !focus()!.includes(i)" [class.joined]="w.maqafToNext">
            <Label class="vw-text" [fontSize]="fontSize()" [text]="w.text + (w.paseqAfter ? ' ׀' : '')"></Label>
            @if (marks()?.[i]; as m) {
              <Label [class]="'vw-mark ' + m" [text]="icon[m]"></Label>
            }
          </StackLayout>
        }
      </FlexboxLayout>
      <Image #yad src="~/assets/art/yad.png" width="46" height="46" horizontalAlignment="left" verticalAlignment="top"
        [opacity]="activeWord() !== null ? 1 : 0" isUserInteractionEnabled="false"></Image>
    </GridLayout>
  `,
})
export class VerseTextComponent {
  verse = input.required<VerseData>();
  activeWord = input<number | null>(null);
  marks = input<WordMark[] | null>(null);
  focus = input<number[] | null>(null); // lesson: the phrase being taught
  fontSize = input(30);
  readonly icon = ICON;

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
}
