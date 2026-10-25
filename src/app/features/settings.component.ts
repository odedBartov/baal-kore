import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { ANALYZERS } from '../analysis/registry';
import { CATEGORY_NAME_HE, type Category } from '../analysis/types';
import type { CtcStatus } from '../audio/analysis.worker';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import { sendLocalReminderNotification } from '../core/notifications';
import { StoreService } from '../core/store.service';

export const APP_VERSION = '0.6.0 (Gamified Edition)'; // keep in step with versionName in App_Resources/Android/app.gradle

/** Screen H — settings, daily reminder notifications, privacy, analyzer status and attributions. */
@Component({
  selector: 'settings',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="הגדרות">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        @if (notifToast()) {
          <Label class="reward-toast" textWrap="true" [text]="notifToast()"></Label>
        }

        <Label class="section" text="בדיקה ורמת קושי"></Label>
        <GridLayout columns="auto, auto, auto, *" class="setting">
          <Label col="3" class="body" text="ציון מעבר"></Label>
          <Button col="2" class="btn-small" text="−" (tap)="set('passingThreshold', s().passingThreshold - 5)"></Button>
          <Label col="1" class="setting-value" [text]="'' + s().passingThreshold"></Label>
          <Button col="0" class="btn-small" text="+" (tap)="set('passingThreshold', s().passingThreshold + 5)"></Button>
        </GridLayout>
        <Label class="meta" textWrap="true" text="הציון המשוקלל הנדרש כדי לעבור פסוק ולהמשיך לפסוק הבא (50–100)."></Label>
        <GridLayout columns="auto, auto, auto, *" class="setting">
          <Label col="3" class="body" text="סבלנות בשיעורי טעמים (חצאי טון)"></Label>
          <Button col="2" class="btn-small" text="−" (tap)="set('lessonMaxDeviation', s().lessonMaxDeviation - 0.25)"></Button>
          <Label col="1" class="setting-value" [text]="s().lessonMaxDeviation.toFixed(2)"></Label>
          <Button col="0" class="btn-small" text="+" (tap)="set('lessonMaxDeviation', s().lessonMaxDeviation + 0.25)"></Button>
        </GridLayout>

        <Label class="section" text="🔔 התראות ותזכורות יומיות"></Label>
        <GridLayout columns="auto, *" class="setting">
          <Label col="1" class="body" textWrap="true" text="תזכורת יומית לשמירה על רצף הקריאה"></Label>
          <Switch col="0" [checked]="s().reminderEnabled" (checkedChange)="set('reminderEnabled', $any($event).value)"></Switch>
        </GridLayout>
        <GridLayout columns="auto, auto, auto, *" class="setting">
          <Label col="3" class="body" text="שעת תזכורת מועדפת"></Label>
          <Button col="2" class="btn-small" text="−" (tap)="set('reminderHour', (s().reminderHour + 23) % 24)"></Button>
          <Label col="1" class="setting-value" [text]="s().reminderHour + ':00'"></Label>
          <Button col="0" class="btn-small" text="+" (tap)="set('reminderHour', (s().reminderHour + 1) % 24)"></Button>
        </GridLayout>
        <Button class="btn" text="🔔 שלח התראת תזכורת עכשיו (בדיקה)" (tap)="testNotification()"></Button>

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

  goBack(): void {
    goBack(this.nav, ['/']);
  }
  private store = inject(StoreService);
  private audio = inject(AudioService);
  private content = inject(ContentService);
  readonly s = this.store.settings;
  readonly version = APP_VERSION;
  readonly categories = Object.keys(ANALYZERS) as Category[];
  readonly ctcText = signal('רכיב זיהוי המילים: בודק…');
  readonly notifToast = signal<string | null>(null);
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

  testNotification(): void {
    const ok = sendLocalReminderNotification(this.store.progress().streakDays);
    this.notifToast.set(ok ? '🔔 התראת תזכורת נשלחה בהצלחה לוילון ההתראות!' : 'לא ניתן היה לשלוח התראה.');
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
