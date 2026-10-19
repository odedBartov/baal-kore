import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService, hebrewNumber } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { isUnlocked } from '../core/state';
import type { VerseData } from '../torah/model';

/** Screen D — chapters and verses with status, last result and the current position. */
@Component({
  selector: 'verse-list',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="פרשת בראשית"></ActionBar>
    <GridLayout rows="auto, auto, *" class="page-root">
      <FlexboxLayout row="0" class="chapters" flexDirection="row" justifyContent="center">
        @for (c of content.chapters; track c) {
          <Button class="chip" [class.chip-on]="c === chapter()" [text]="'פרק ' + num(c)" (tap)="chapter.set(c)"></Button>
        }
      </FlexboxLayout>
      <Label row="1" class="legend" textWrap="true" text="✓ עבר בדיקה מלאה · ● תורגל · ▶ המקום שלך · 🔒 נעול עד שמתרגלים את הפסוק הקודם"></Label>
      <ListView row="2" [items]="rows()" class="verses" separatorColor="#e3ddd0">
        <ng-template let-r="item">
          <GridLayout columns="auto, *, auto" class="verse-row" [class.locked]="!r.unlocked" (tap)="open(r)">
            <Label col="2" class="verse-num" [text]="r.num"></Label>
            <StackLayout col="1">
              <Label class="verse-preview" [text]="r.preview"></Label>
              <Label class="meta" [text]="r.detail" textWrap="true"></Label>
            </StackLayout>
            <Label col="0" class="verse-status" [text]="r.icon"></Label>
          </GridLayout>
        </ng-template>
      </ListView>
    </GridLayout>
  `,
})
export class VerseListComponent {
  private nav = inject(RouterExtensions);
  content = inject(ContentService);
  private store = inject(StoreService);
  readonly num = hebrewNumber;
  readonly chapter = signal(this.content.verse(this.store.progress().currentVerseId)?.chapter ?? 1);

  readonly rows = computed(() => {
    const p = this.store.progress();
    return this.content.verses
      .filter((v) => v.chapter === this.chapter())
      .map((v: VerseData) => {
        const unlocked = isUnlocked(this.content.verseIds, v.id, p);
        const last = p.lastAttempts[v.id];
        const cov = this.content.coverage(v.id);
        const icon = p.completedVerseIds.includes(v.id) ? '✓' : p.practicedVerseIds.includes(v.id) ? '●' : v.id === p.currentVerseId ? '▶' : unlocked ? '' : '🔒';
        const detail = [
          last ? (last.overallScore !== null ? `ציון אחרון: ${last.overallScore}` : `ניסיונות: ${p.attemptCounts[v.id] ?? 0}, ללא ציון סופי`) : 'עוד לא נקרא',
          cov.reference === 'missing' ? 'אין הקלטת קורא' : cov.reference === 'pending' ? 'הקלטת הקורא ממתינה לבדיקת מומחה' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return { id: v.id, num: hebrewNumber(v.verse), preview: v.words.slice(0, 4).map((w) => w.text).join(' ') + ' …', detail, icon, unlocked };
      });
  });

  open(r: { id: string; unlocked: boolean }): void {
    if (r.unlocked) this.nav.navigate(['/verse', r.id]);
  }
}
