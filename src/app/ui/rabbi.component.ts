import { ChangeDetectionStrategy, Component, ElementRef, NO_ERRORS_SCHEMA, OnDestroy, ViewChild, computed, effect, inject, input, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { CoreTypes, ImageSource, knownFolders, path, type View } from '@nativescript/core';
import type { Expression, RabbiLine } from '../teaching/rabbi';
import { StoreService } from '../core/store.service';

const frames = new Map<string, ImageSource>();
function frame(expr: Expression, kind: '' | '-talk' | '-blink'): ImageSource {
  const key = expr + kind;
  if (!frames.has(key)) frames.set(key, ImageSource.fromFileSync(path.join(knownFolders.currentApp().path, 'assets', 'art', `rabbi-${key}.png`)));
  return frames.get(key)!;
}

/** The 2D rabbi with a Hebrew speech bubble, custom frame/crown from the Shop, blinking, talking, and gentle bobbing. */
@Component({
  selector: 'rabbi',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <GridLayout columns="*, auto" class="rabbi">
      <StackLayout col="1" [class]="'rabbi-avatar-wrap rabbi-frame-' + store.progress().equippedFrame" verticalAlignment="bottom">
        @if (store.progress().equippedFrame === 'crown') {
          <Label class="rabbi-crown-top" text="👑"></Label>
        }
        <Image #img [src]="image()" [width]="size()" [height]="size()" stretch="aspectFit"></Image>
        <Label class="rabbi-frame-badge" [text]="store.equippedFrameInfo().titleBadgeHe"></Label>
      </StackLayout>
      @if (line()?.text) {
        <StackLayout #bubble col="0" class="bubble" verticalAlignment="center">
          <Label class="bubble-text" textWrap="true" [text]="line()!.text"></Label>
        </StackLayout>
      }
    </GridLayout>
  `,
})
export class RabbiComponent implements OnDestroy {
  readonly store = inject(StoreService);
  line = input<Pick<RabbiLine, 'expression' | 'text'> | null>(null);
  size = input(104);
  @ViewChild('img', { static: true }) img!: ElementRef<View>;
  @ViewChild('bubble') bubble?: ElementRef<View>;

  private kind = signal<'' | '-talk' | '-blink'>('');
  image = computed(() => frame(this.line()?.expression ?? 'neutral', this.kind()));
  private timers: ReturnType<typeof setTimeout>[] = [];
  private blink = setInterval(() => {
    if (this.kind()) return;
    this.kind.set('-blink');
    setTimeout(() => this.kind() === '-blink' && this.kind.set(''), 160);
  }, 4200);
  private bob = setInterval(() => {
    const v = this.img?.nativeElement;
    v?.animate({ translate: { x: 0, y: -3 }, duration: 1100, curve: CoreTypes.AnimationCurve.easeInOut })
      .then(() => v.animate({ translate: { x: 0, y: 0 }, duration: 1100, curve: CoreTypes.AnimationCurve.easeInOut }))
      .catch(() => undefined);
  }, 2400);

  constructor() {
    effect(() => {
      const text = this.line()?.text ?? '';
      this.timers.forEach(clearTimeout);
      this.timers = [];
      if (!text) return;
      // Mouth moves for roughly the time it takes to read the bubble, then rests.
      const steps = Math.round(Math.min(3600, Math.max(900, text.length * 32)) / 170);
      for (let i = 0; i < steps; i++) this.timers.push(setTimeout(() => this.kind.set(i % 2 ? '' : '-talk'), i * 170));
      this.timers.push(setTimeout(() => this.kind.set(''), steps * 170));
      setTimeout(() => {
        const b = this.bubble?.nativeElement;
        if (b?.isLoaded) (b.opacity = 0.15), b.animate({ opacity: 1, duration: 220 }).catch(() => (b.opacity = 1)); // never leave the bubble hidden
      });
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.blink);
    clearInterval(this.bob);
    this.timers.forEach(clearTimeout);
  }
}
