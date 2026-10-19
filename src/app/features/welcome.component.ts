import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService } from '../core/content.service';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { RabbiComponent } from '../ui/rabbi.component';

/** Screen A — welcome. */
@Component({
  selector: 'welcome',
  imports: [NativeScriptCommonModule, RabbiComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="בעל קורא">
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <Label class="h1" text="בעל קורא"></Label>
        <Label class="sub" text="לימוד קריאה בתורה, עם טעמי המקרא"></Label>
        <rabbi [line]="line" [size]="150"></rabbi>
        @if (returning) {
          <Button class="btn btn-primary" [text]="'להמשיך: ' + where" (tap)="continue()"></Button>
          <Button class="btn" text="בחירת פסוק" (tap)="nav.navigate(['/portions'])"></Button>
        } @else {
          <Button class="btn btn-primary" text="מתחילים ללמוד" (tap)="start()"></Button>
        }
        <Label class="note" textWrap="true" text="האפליקציה עובדת בלי אינטרנט. ההקלטות שלכם נשארות רק במכשיר."></Label>
      </StackLayout>
    </ScrollView>
  `,
})
export class WelcomeComponent {
  nav = inject(RouterExtensions);
  private store = inject(StoreService);
  private content = inject(ContentService);
  readonly returning = this.store.progress().welcomed;
  readonly where = this.content.label(this.content.verse(this.store.progress().currentVerseId) ?? this.content.verses[0]);
  readonly line = rabbiSays({ kind: 'welcome', returning: this.returning, where: this.where });

  start(): void {
    this.store.updateProgress((p) => (p.welcomed = true));
    this.nav.navigate(['/portions']);
  }

  continue(): void {
    this.nav.navigate(['/verse', this.store.progress().currentVerseId]);
  }
}
