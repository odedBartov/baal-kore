import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService, PORTIONS } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { RabbiComponent } from '../ui/rabbi.component';

/** Screen C — portion selection. Only Bereshit has content; the rest are shown disabled. */
@Component({
  selector: 'portions',
  imports: [NativeScriptCommonModule, RabbiComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="פרשות">
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <rabbi [line]="line"></rabbi>
        @for (p of portions; track p.id) {
          <GridLayout columns="auto, *" class="card portion" [class.disabled]="!p.available" (tap)="open(p)">
            <StackLayout col="1">
              <Label class="portion-name" [text]="'פרשת ' + p.nameHe"></Label>
              @if (p.available) {
                <Label class="meta" [text]="done() + ' מתוך ' + content.verses.length + ' פסוקים'"></Label>
                <GridLayout class="meter" height="8"><StackLayout class="meter-fill" horizontalAlignment="right" [width]="(done() / content.verses.length) * 260"></StackLayout></GridLayout>
              } @else {
                <Label class="meta" text="בקרוב"></Label>
              }
            </StackLayout>
            <Label col="0" class="chevron" [text]="p.available ? '‹' : '🔒'"></Label>
          </GridLayout>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class PortionsComponent {
  nav = inject(RouterExtensions);
  content = inject(ContentService);
  private store = inject(StoreService);
  readonly portions = PORTIONS;
  readonly line = rabbiSays({ kind: 'portions' });
  readonly done = computed(() => new Set([...this.store.progress().completedVerseIds, ...this.store.progress().practicedVerseIds]).size);

  open(p: { id: string; available: boolean }): void {
    if (p.available) this.nav.navigate(['/portion', p.id]);
  }
}
