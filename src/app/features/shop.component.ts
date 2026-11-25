import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { BillingService } from '../core/billing.service';
import { ContentService } from '../core/content.service';
import {
  computeCatalogPortionSummary,
  FRAME_CATALOG,
  YAD_CATALOG,
  type RabbiFrame,
  type YadStyle,
} from '../core/gamification';
import { PARASHA_PRICE_LABEL_HE } from '../core/state';
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
        <Label class="section" textWrap="true" text="⚡ חיזוקים ופתיחת שלבים"></Label>

        <GridLayout columns="auto, *" class="card shop-item">
          <Button col="0" class="btn-small btn-primary" textWrap="true" text="40 🪙 קנייה" (tap)="buyFreeze()"></Button>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="cat-name" textWrap="true" [text]="'🧊 הקפאת רצף (ברשותך: ' + store.progress().streakFreezes + ')'"></Label>
            <Label class="meta" textWrap="true" text="שומר על רצף הימים שלכם גם אם פספסתם יום תרגול אחד."></Label>
          </StackLayout>
        </GridLayout>

        <GridLayout columns="auto, *" class="card shop-item">
          <Button col="0" class="btn-small btn-primary" textWrap="true" text="35 🪙 קנייה" (tap)="buyBooster()"></Button>
          <StackLayout col="1" verticalAlignment="center">
            <Label class="cat-name" textWrap="true" [text]="'⚡ מכפיל תגמולים x2 (פעיל ל־' + store.progress().doubleXpRemaining + ' קריאות)'"></Label>
            <Label class="meta" textWrap="true" text="מכפיל פי 2 את ה־XP והמטבעות ב־3 הקריאות או השיעורים הבאים!"></Label>
          </StackLayout>
        </GridLayout>

        <!-- Parasha Full Access & Coupons (Google Play ₪10 / ₪5 Paywall) -->
        <Label class="section" textWrap="true" text="📜 פתיחת פרשות מלאות וקופונים"></Label>
        @if (!summary().isPurchased) {
          <GridLayout columns="auto, *" class="card shop-item">
            <Button col="0" class="btn-small btn-primary" textWrap="true" [text]="store.currentPriceLabel() + ' פתיחה'" (tap)="unlockActiveParasha()"></Button>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="'🔓 פתיחת כל פרשת ' + activePortion().nameHe + ' (עליות ב׳–ז׳)'"></Label>
              <Label class="meta" textWrap="true" [text]="'עלייה ראשונה פתוחה תמיד בחינם. פתחו את כל שאר הפרשה בתשלום חד־פעמי של ' + store.currentPriceLabel() + (store.hasDiscount50() ? ' (אחרי 50% הנחת קופון!)' : '') + ' דרך Google Play.'"></Label>
            </StackLayout>
          </GridLayout>
        } @else {
          <GridLayout columns="auto, *" class="card shop-item shop-equipped">
            <Label col="0" class="badge-free" textWrap="true" verticalAlignment="center" text="פתוח ✓"></Label>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="'✓ כל 7 העליות בפרשת ' + activePortion().nameHe + ' פתוחות'"></Label>
              <Label class="meta" textWrap="true" text="כל הפסוקים בעליות א׳–ז׳ זמינים לתרגול מלא ללא הגבלה."></Label>
            </StackLayout>
          </GridLayout>
        }
        <GridLayout columns="*, *" class="buttons">
          <Button col="1" class="btn" textWrap="true" text="🎟️ הזנת קוד קופון / הנחה" (tap)="redeemCoupon()"></Button>
          <Button col="0" class="btn" textWrap="true" text="🔄 שחזור רכישות" (tap)="restorePurchases()"></Button>
        </GridLayout>

        <!-- Custom Yad Pointers -->
        <Label class="section" textWrap="true" text="👉 עיצוב היד הקוראת (מוצגת בגרף ובקריאה)"></Label>
        @for (y of yads; track y.id) {
          <GridLayout columns="auto, *, auto" class="card shop-item" [class.shop-equipped]="store.progress().equippedYad === y.id">
            <Image col="2" [src]="y.asset" width="68" height="68" marginLeft="8" stretch="aspectFit"></Image>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="y.icon + ' ' + y.nameHe"></Label>
              <Label class="meta" textWrap="true" [text]="y.descHe"></Label>
            </StackLayout>
            <Button col="0" class="btn-small" textWrap="true" [class.btn-primary]="store.progress().equippedYad !== y.id"
              [text]="store.progress().equippedYad === y.id ? 'בשימוש ✓' : store.progress().ownedYads.includes(y.id) ? 'בחירה' : y.price + ' 🪙'"
              (tap)="selectYad(y.id, y.nameHe, y.price)"></Button>
          </GridLayout>
        }

        <!-- Custom Rabbi Frames & Titles -->
        <Label class="section" textWrap="true" text="🖼️ מסגרות ותארים לרב"></Label>
        @for (f of frames; track f.id) {
          <GridLayout columns="auto, *" class="card shop-item" [class.shop-equipped]="store.progress().equippedFrame === f.id">
            <StackLayout col="1" verticalAlignment="center">
              <Label class="cat-name" textWrap="true" [text]="f.icon + ' ' + f.nameHe + ' (' + f.titleBadgeHe + ')'"></Label>
              <Label class="meta" textWrap="true" [text]="f.descHe"></Label>
            </StackLayout>
            <Button col="0" class="btn-small" textWrap="true" [class.btn-primary]="store.progress().equippedFrame !== f.id"
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
  readonly billing = inject(BillingService);
  private readonly content = inject(ContentService);
  readonly priceLabel = PARASHA_PRICE_LABEL_HE;
  readonly yads = YAD_CATALOG;
  readonly frames = FRAME_CATALOG;
  readonly message = signal<string | null>(null);

  readonly activePortion = computed(() => this.content.portionOfVerse(this.store.progress().currentVerseId));
  readonly summary = computed(() => computeCatalogPortionSummary(this.activePortion(), this.store.progress()));

  buyFreeze(): void {
    if (this.store.buyStreakFreeze()) this.message.set('🧊 רכשתם הקפאת רצף בהצלחה!');
    else this.message.set('אין מספיק מטבעות (נדרשים 40 🪙). תרגלו פסוקים והשלימו משימות!');
  }

  buyBooster(): void {
    if (this.store.buyDoubleXp()) this.message.set('⚡ מכפיל תגמולים x2 הופעל ל־3 הקריאות הבאות!');
    else this.message.set('אין מספיק מטבעות (נדרשים 35 🪙).');
  }

  async unlockActiveParasha(): Promise<void> {
    const ok = await this.billing.promptUnlockParasha(this.activePortion());
    if (ok) this.message.set(`🎉 כל העליות בפרשת ${this.activePortion().nameHe} נפתחו לתרגול!`);
  }

  async restorePurchases(): Promise<void> {
    const res = await this.billing.restorePurchases();
    this.message.set(res.messageHe);
  }

  async redeemCoupon(): Promise<void> {
    const ok = await this.billing.promptRedeemCoupon(this.activePortion());
    if (ok) this.message.set(`🎉 הקופון הופעל בהצלחה עבור פרשת ${this.activePortion().nameHe}!`);
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
