import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import { StoreService } from '../core/store.service';
import type { CtcStatus } from '../audio/analysis.worker';
import { ANALYZERS } from '../analysis/registry';
import { CATEGORY_NAME_HE, type Category } from '../analysis/types';

export const APP_VERSION = '0.5.0 (POC)'; // keep in step with versionName in App_Resources/Android/app.gradle

/** Screen H — settings, privacy, analyzer status and attributions. */
@Component({
  selector: 'settings',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="הגדרות"></ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <Label class="section" text="בדיקה ומעבר"></Label>
        <GridLayout columns="auto, auto, auto, *" class="setting">
          <Label col="3" class="body" text="ציון מעבר"></Label>
          <Button col="2" class="btn-small" text="−" (tap)="set('passingThreshold', s().passingThreshold - 5)"></Button>
          <Label col="1" class="setting-value" [text]="'' + s().passingThreshold"></Label>
          <Button col="0" class="btn-small" text="+" (tap)="set('passingThreshold', s().passingThreshold + 5)"></Button>
        </GridLayout>
        <Label class="meta" textWrap="true" text="הציון קובע מעבר רק כשכל הבדיקות מאומתות. כרגע חלקן ניסיוניות, ולכן מוצגת בדיקה חלקית."></Label>
        <GridLayout columns="auto, auto, auto, *" class="setting">
          <Label col="3" class="body" text="סבלנות בשיעורי טעמים (חצאי טון)"></Label>
          <Button col="2" class="btn-small" text="−" (tap)="set('lessonMaxDeviation', s().lessonMaxDeviation - 0.25)"></Button>
          <Label col="1" class="setting-value" [text]="s().lessonMaxDeviation.toFixed(2)"></Label>
          <Button col="0" class="btn-small" text="+" (tap)="set('lessonMaxDeviation', s().lessonMaxDeviation + 0.25)"></Button>
        </GridLayout>

        <Label class="section" text="הגייה"></Label>
        <GridLayout columns="*, *" class="setting">
          <Button col="1" [class]="s().pronunciation === 'israeli' ? 'btn btn-primary' : 'btn'" text="הגייה ישראלית" (tap)="set('pronunciation', 'israeli')"></Button>
          <Button col="0" [class]="s().pronunciation === 'ashkenazi' ? 'btn btn-primary' : 'btn'" text="הגייה אשכנזית" (tap)="set('pronunciation', 'ashkenazi')"></Button>
        </GridLayout>
        <Label class="meta" textWrap="true" text="בדיקת הניקוד בודקת את התנועות לפי ההגייה שבחרתם. באשכנזית קמץ נקרא o, וחולם וצירה יכולים להישמע כ-oi, ei או ou."></Label>

        <Label class="section" text="נתונים ופרטיות"></Label>
        <GridLayout columns="auto, *" class="setting">
          <Label col="1" class="body" textWrap="true" text="לשמור את הקריאה האחרונה של כל פסוק להאזנה חוזרת"></Label>
          <Switch col="0" [checked]="s().keepRecordings" (checkedChange)="set('keepRecordings', $any($event).value)"></Switch>
        </GridLayout>
        <Button class="btn" text="מחיקת ההקלטות השמורות" (tap)="clearRecordings()"></Button>
        <Button class="btn btn-danger" text="איפוס ההתקדמות" (tap)="reset()"></Button>
        <Label class="body" textWrap="true" text="כל ההקלטות והניתוחים נשארים במכשיר. האפליקציה פועלת בלי אינטרנט, בלי חשבון, ובלי לשלוח נתונים לשום מקום."></Label>

        <Label class="section" text="מצב הבדיקות"></Label>
        @for (c of categories; track c) {
          <Label class="meta" textWrap="true" [text]="analyzerLine(c)"></Label>
        }
        <Label class="meta" textWrap="true" [text]="ctcText()"></Label>
        <Label class="meta" textWrap="true" [text]="coverageText"></Label>
        <Button class="btn-link" text="בדיקת שמע טכנית" (tap)="nav.navigate(['/diagnostics'])"></Button>

        <Label class="section" text="קרדיטים ורישיונות"></Label>
        <Label class="credits" textWrap="true" [text]="credits"></Label>
        <Label class="meta" [text]="'גרסה ' + version"></Label>
      </StackLayout>
    </ScrollView>
  `,
})
export class SettingsComponent {
  nav = inject(RouterExtensions);
  private store = inject(StoreService);
  private audio = inject(AudioService);
  private content = inject(ContentService);
  readonly s = this.store.settings;
  readonly version = APP_VERSION;
  readonly categories = Object.keys(ANALYZERS) as Category[];
  readonly ctcText = signal('רכיב זיהוי המילים: בודק…');
  readonly coverageText = (() => {
    const c = this.content.verseIds.map((id) => this.content.coverage(id));
    return `תוכן: ${c.length} פסוקים. הקלטות קורא: ${c.filter((x) => x.reference !== 'missing').length} (כולן ממתינות לאישור מומחה), מתוכן ${c.filter((x) => x.timing === 'check').length} עם תזמון שדורש בדיקה.`;
  })();
  readonly credits = [
    `נוסח המקרא: "מקרא על פי המסורה" (Miqra according to the Masorah), דרך ספריא, CC BY-SA. ממתין לבדיקה מול תיקון מוכר.`,
    `הקלטות הקורא: ${this.content.reference.attribution}. מקור: ויקישיתוף.`,
    'זיהוי מילים: Omnilingual ASR CTC-300M של Meta, Apache-2.0, רץ במכשיר עם ONNX Runtime (MIT).',
    'בדיקת הניקוד: ZIPA-small (Zhu et al., 2025), CC BY 4.0, רץ במכשיר.',
    'גופן: Ezra SIL, SIL Open Font License 1.1 (ורכיב פריסה ברישיון MIT).',
    'נבנה עם NativeScript ו-Angular (MIT).',
  ].join('\n\n');

  constructor() {
    this.audio
      .run<CtcStatus>({ type: 'ctc-status' })
      .then((r) => this.ctcText.set(r.available ? `רכיב זיהוי המילים פעיל במכשיר${r.loadMs ? ` (נטען ב-${(r.loadMs / 1000).toFixed(1)} שניות)` : ''}.` : r.reasonHe ?? 'רכיב זיהוי המילים אינו זמין.'))
      .catch((e) => this.ctcText.set(`רכיב זיהוי המילים: שגיאה (${e})`));
  }

  set<K extends keyof ReturnType<typeof this.s>>(key: K, value: ReturnType<typeof this.s>[K]): void {
    this.store.updateSettings({ [key]: value });
  }

  analyzerLine(c: Category): string {
    const a = ANALYZERS[c];
    const m = a.maturity === 'validated' ? 'מאומת' : a.maturity === 'experimental' ? 'ניסיוני' : 'לא זמין';
    return `${CATEGORY_NAME_HE[c]}: ${m}${a.noteHe ? ' – ' + a.noteHe : ''}`;
  }

  async clearRecordings(): Promise<void> {
    if (await Dialogs.confirm({ title: 'מחיקת הקלטות', message: 'למחוק את כל ההקלטות השמורות במכשיר?', okButtonText: 'מחיקה', cancelButtonText: 'ביטול' })) {
      await this.audio.clearRecordings();
      this.store.evaluations.clear();
    }
  }

  async reset(): Promise<void> {
    if (await Dialogs.confirm({ title: 'איפוס התקדמות', message: 'למחוק את כל ההתקדמות, השיעורים והציונים?', okButtonText: 'איפוס', cancelButtonText: 'ביטול' }))
      this.store.resetProgress();
  }
}
