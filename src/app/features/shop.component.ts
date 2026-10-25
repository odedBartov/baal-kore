import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { ContentService, hebrewNumber } from '../core/content.service';
import {
  computeParashaSummary,
  FRAME_CATALOG,
  YAD_CATALOG,
  type RabbiFrame,
  type YadStyle,
} from '../core/gamification';
import { StoreService } from '../core/store.service';
import { GamificationBarComponent } from '../ui/gamification-bar.component';

@Component({
  selector: 'shop',
  imports: [NativeScriptCommonModule, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="חנות המטבעות והפרסים">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="🎯 אתגרים" class="ab-action" (tap)="nav.navigate(['/challenges'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar [compact]="true"></gamification-bar>

        @if (message()) {
          <Label class="reward-toast" textWrap="true" [text]="message()"></Label>
        }

        <!-- Power-ups & Unlocks -->
        <Label class="section" text="⚡ חיזוקים ופתיחת שלבים"></Label>

        <GridLayout columns="auto, *" class="card shop-item">
          <Button col="0" class="btn-small btn-primary" text="40 🪙 קנייה" (tap)="buyFreeze()"></Button>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="cat-name" [text]="'🧊 הקפאת רצף (ברשותך: ' + store.progress().streakFreezes + ')'"></Label>
            <Label class="meta" textWrap="true" text="שומר על רצף הימים שלכם גם אם פספסתם יום תרגול אחד."></Label>
          </StackLayout>
        </GridLayout>

        <GridLayout columns="auto, *" class="card shop-item">
          <Button col="0" class="btn-small btn-primary" text="35 🪙 קנייה" (tap)="buyBooster()"></Button>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="cat-name" [text]="'⚡ מכפיל תגמולים x2 (פעיל ל־' + store.progress().doubleXpRemaining + ' קריאות)'"></Label>
            <Label class="meta" textWrap="true" text="מכפיל פי 2 את ה־XP והמטבעות ב־3 הקריאות או השיעורים הבאים!"></Label>
          </StackLayout>
        </GridLayout>

        @if (nextLockedAliyah(); as na) {
          <GridLayout columns="auto, *" class="card shop-item">
            <Button col="0" class="btn-small btn-primary" text="40 🪙 פתיחה" (tap)="unlockAliyah(na.verseIds, na.nameHe)"></Button>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" [text]="'🔓 פתיחת כל ' + na.nameHe"></Label>
              <Label class="meta" textWrap="true" [text]="'פותח מיד את כל ' + na.totalVerses + ' הפסוקים של ' + na.nameHe + ' לתרגול חופשי.'"></Label>
            </StackLayout>
          </GridLayout>
        }

        <!-- Custom Yad Pointers -->
        <Label class="section" text="👉 עיצוב היד הקוראת (מוצגת בגרף ובקריאה)"></Label>
        @for (y of yads; track y.id) {
          <GridLayout columns="auto, *, auto" class="card shop-item" [class.shop-equipped]="store.progress().equippedYad === y.id">
            <Image col="2" [src]="y.asset" width="68" height="68" marginLeft="8" stretch="aspectFit"></Image>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" [text]="y.icon + ' ' + y.nameHe"></Label>
              <Label class="meta" textWrap="true" [text]="y.descHe"></Label>
            </StackLayout>
            <Button col="0" class="btn-small" [class.btn-primary]="store.progress().equippedYad !== y.id"
              [text]="store.progress().equippedYad === y.id ? 'בשימוש ✓' : store.progress().ownedYads.includes(y.id) ? 'בחירה' : y.price + ' 🪙'"
              (tap)="selectYad(y.id, y.nameHe, y.price)"></Button>
          </GridLayout>
        }

        <!-- Custom Rabbi Frames & Titles -->
        <Label class="section" text="🖼️ מסגרות ותארים לרב"></Label>
        @for (f of frames; track f.id) {
          <GridLayout columns="auto, *" class="card shop-item" [class.shop-equipped]="store.progress().equippedFrame === f.id">
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" [text]="f.icon + ' ' + f.nameHe + ' (' + f.titleBadgeHe + ')'"></Label>
              <Label class="meta" textWrap="true" [text]="f.descHe"></Label>
            </StackLayout>
            <Button col="0" class="btn-small" [class.btn-primary]="store.progress().equippedFrame !== f.id"
              [text]="store.progress().equippedFrame === f.id ? 'בשימוש ✓' : store.progress().ownedFrames.includes(f.id) ? 'בחירה' : f.price + ' 🪙'"
              (tap)="selectFrame(f.id, f.nameHe, f.price)"></Button>
          </GridLayout>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class ShopComponent {
  readonly nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/']);
  }
  readonly store = inject(StoreService);
  private readonly content = inject(ContentService);
  readonly yads = YAD_CATALOG;
  readonly frames = FRAME_CATALOG;
  readonly message = signal<string | null>(null);

  readonly summary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
  readonly nextLockedAliyah = computed(() => this.summary().aliyot.find((a) => !a.allUnlocked) ?? null);

  buyFreeze(): void {
    if (this.store.buyStreakFreeze()) this.message.set('🧊 רכשתם הקפאת רצף בהצלחה!');
    else this.message.set('אין מספיק מטבעות (נדרשים 40 🪙). תרגלו פסוקים והשלימו משימות!');
  }

  buyBooster(): void {
    if (this.store.buyDoubleXp()) this.message.set('⚡ מכפיל תגמולים x2 הופעל ל־3 הקריאות הבאות!');
    else this.message.set('אין מספיק מטבעות (נדרשים 35 🪙).');
  }

  unlockAliyah(verseIds: string[], nameHe: string): void {
    if (this.store.unlockAliyahWithCoins(verseIds, 40)) this.message.set(`🔓 כל הפסוקים של ${nameHe} נפתחו לתרגול!`);
    else this.message.set('אין מספיק מטבעות (נדרשים 40 🪙).');
  }

  selectYad(id: YadStyle, nameHe: string, price: number): void {
    if (this.store.buyOrEquipYad(id)) this.message.set(`✨ "${nameHe}" נבחרה ותוצג בכל גרפי המנגינה!`);
    else this.message.set(`אין מספיק מטבעות לרכישת "${nameHe}" (נדרשים ${price} 🪙).`);
  }

  selectFrame(id: RabbiFrame, nameHe: string, price: number): void {
    if (this.store.buyOrEquipFrame(id)) this.message.set(`👑 "${nameHe}" הופעלה עבור דמות הרב!`);
    else this.message.set(`אין מספיק מטבעות לרכישת "${nameHe}" (נדרשים ${price} 🪙).`);
  }
}
