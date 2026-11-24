import { Injectable, inject, signal } from '@angular/core';
import { Application, Dialogs, Utils, isAndroid } from '@nativescript/core';
import { PORTIONS } from './content.service';
import {
  PARASHA_PRICE_LABEL_HE,
  playProductIdForPortion,
  portionIdFromPlayProductId,
} from './state';
import { StoreService } from './store.service';

declare const com: {
  baalkore: {
    app: {
      PaywallBridge: new (context: unknown) => {
        connect(): void;
        isReady(): boolean;
        isDebugBuild(): boolean;
        getLastResponseCode(): number;
        getLastDebugMessage(): string;
        getPurchaseState(): string;
        resetPurchaseState(): void;
        getOwnedProductsCsv(): string;
        getFormattedPrice(productId: string): string;
        refreshPurchases(): void;
        queryProductsCsv(csvProductIds: string): void;
        launchPurchase(activity: unknown, productId: string): void;
      };
    };
  };
};

export interface PurchaseOutcome {
  purchased: boolean;
  canceled?: boolean;
  messageHe?: string;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly store = inject(StoreService);
  private bridge: InstanceType<typeof com.baalkore.app.PaywallBridge> | null = null;

  readonly busy = signal(false);
  readonly statusMessage = signal<string | null>(null);

  private readonly allPortionIds = PORTIONS.map((p) => p.id);

  constructor() {
    this.initBridge();
  }

  private initBridge(): void {
    if (!isAndroid || this.bridge) return;
    try {
      const ctx = Utils.android.getApplicationContext();
      if (!ctx) return;
      this.bridge = new com.baalkore.app.PaywallBridge(ctx);
      // Sync any owned Google Play purchases shortly after connection completes.
      setTimeout(() => this.syncOwnedFromBridge(), 1500);
      setTimeout(() => {
        this.syncOwnedFromBridge();
        const csv = this.allPortionIds.map((id) => playProductIdForPortion(id)).join(',');
        this.bridge?.queryProductsCsv(csv);
      }, 3500);
    } catch (e) {
      console.warn('BillingService init failed:', e);
    }
  }

  isPlayBillingReady(): boolean {
    this.initBridge();
    return Boolean(this.bridge?.isReady());
  }

  productIdFor(portionId: string): string {
    return playProductIdForPortion(portionId);
  }

  priceLabelFor(portionId: string): string {
    if (!this.bridge) return PARASHA_PRICE_LABEL_HE;
    const pid = playProductIdForPortion(portionId);
    return this.bridge.getFormattedPrice(pid) || PARASHA_PRICE_LABEL_HE;
  }

  private syncOwnedFromBridge(): number {
    if (!this.bridge) return 0;
    const csv = this.bridge.getOwnedProductsCsv();
    if (!csv) return 0;
    const productIds = csv.split(',').map((s) => s.trim()).filter(Boolean);
    const portionIds = productIds
      .map((pid) => portionIdFromPlayProductId(pid, this.allPortionIds))
      .filter((id): id is string => id !== null);
    return this.store.syncPurchasedPortions(portionIds);
  }

  /** Queries Google Play Store for existing purchases on this Google account and restores them. */
  async restorePurchases(): Promise<{ ok: boolean; count: number; messageHe: string }> {
    this.initBridge();
    if (!this.bridge) {
      return { ok: false, count: 0, messageHe: 'שירות Google Play Billing זמין במכשירי אנדרואיד בלבד.' };
    }
    this.busy.set(true);
    try {
      this.bridge.refreshPurchases();
      await new Promise((r) => setTimeout(r, 1400));
      this.syncOwnedFromBridge();
      const totalOwned = this.store.progress().purchasedPortionIds.length;
      if (totalOwned > 0) {
        return {
          ok: true,
          count: totalOwned,
          messageHe: `✓ שחזור הרכישות הושלם! ${totalOwned} פרשות פתוחות במכשיר זה.`,
        };
      }
      return {
        ok: true,
        count: 0,
        messageHe: 'לא נמצאו רכישות קודמות בחשבון Google Play המחובר.',
      };
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Opens the ₪10 Parasha Paywall dialog and launches the native Google Play Billing purchase sheet
   * for `parasha_<portionId>`. Returns true if the Parasha is now unlocked.
   */
  async promptUnlockParasha(portion: { id: string; nameHe: string; bookNameHe?: string }): Promise<boolean> {
    if (this.store.isPortionPurchased(portion.id)) return true;

    const sku = playProductIdForPortion(portion.id);
    const confirm = await Dialogs.confirm({
      title: `🔓 פתיחת פרשת ${portion.nameHe} – ${PARASHA_PRICE_LABEL_HE}`,
      message:
        `עליית ראשון (כהן) פתוחה בחינם בכל 54 הפרשות!\n\n` +
        `פתיחת שאר העליות (עליות שני עד שביעי) בפרשת ${portion.nameHe}:\n` +
        `• תשלום חד־פעמי: ${PARASHA_PRICE_LABEL_HE} בלבד\n` +
        `• פותח מיד את כל הפסוקים בעליות ב׳–ז׳ של פרשת ${portion.nameHe}\n` +
        `• רכישה מאובטחת דרך Google Play (מזהה מוצר: ${sku})`,
      okButtonText: `💳 רכישה ב־${PARASHA_PRICE_LABEL_HE}`,
      cancelButtonText: 'ביטול',
    });

    if (!confirm) return false;

    const outcome = await this.launchGooglePlayPurchase(portion.id, portion.nameHe);
    if (outcome.purchased) {
      await Dialogs.alert({
        title: `🎉 פרשת ${portion.nameHe} נפתחה!`,
        message: `כל העליות (א׳–ז׳) והפסוקים של פרשת ${portion.nameHe} פתוחים כעת לתרגול מלא. בהצלחה!`,
        okButtonText: 'מעולה!',
      });
      return true;
    }
    return false;
  }

  /** Launches the native Google Play Billing flow and polls the Java bridge until completion. */
  async launchGooglePlayPurchase(portionId: string, portionNameHe: string): Promise<PurchaseOutcome> {
    this.initBridge();
    const productId = playProductIdForPortion(portionId);
    const activity = Application.android?.foregroundActivity || Application.android?.startActivity;

    if (!this.bridge || !activity) {
      return { purchased: false, messageHe: 'לא ניתן לפתוח את Google Play כרגע.' };
    }

    this.busy.set(true);
    try {
      this.bridge.resetPurchaseState();
      this.bridge.launchPurchase(activity, productId);

      // Wait up to 90 seconds while the user interacts with the Google Play purchase sheet.
      const started = Date.now();
      while (Date.now() - started < 90_000) {
        await new Promise((r) => setTimeout(r, 180));
        const st = this.bridge.getPurchaseState();

        if (st.startsWith('PURCHASED:') || st === 'ALREADY_OWNED') {
          this.store.markPortionPurchased(portionId);
          this.syncOwnedFromBridge();
          this.bridge.resetPurchaseState();
          return { purchased: true };
        }

        if (st === 'CANCELED') {
          this.bridge.resetPurchaseState();
          return { purchased: false, canceled: true };
        }

        if (st === 'PENDING') {
          this.bridge.resetPurchaseState();
          await Dialogs.alert({
            title: 'הרכישה בטיפול',
            message: 'התשלום ב־Google Play ממתין לאישור. הפרשה תיפתח אוטומטית מיד עם השלמת התשלום.',
            okButtonText: 'הבנתי',
          });
          return { purchased: false };
        }

        if (st.startsWith('PRODUCT_NOT_IN_PLAY_CONSOLE:') || st.startsWith('BILLING_UNAVAILABLE:') || st.startsWith('ERROR:')) {
          this.bridge.resetPurchaseState();
          return await this.handlePlayConsoleSetupOrDevUnlock(portionId, portionNameHe, productId, st);
        }
      }
      return { purchased: false, messageHe: 'זמן ההמתנה ל־Google Play הסתיים.' };
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * In release builds: shows a clean Google Play connection error and never allows bypassing payment.
   * In debug builds only (android:debuggable="true"): displays the SKU details and offers a developer test unlock.
   */
  private async handlePlayConsoleSetupOrDevUnlock(
    portionId: string,
    portionNameHe: string,
    productId: string,
    rawState: string,
  ): Promise<PurchaseOutcome> {
    const isDebug = Boolean(this.bridge?.isDebugBuild());
    if (!isDebug) {
      await Dialogs.alert({
        title: 'שגיאת חיבור ל־Google Play',
        message: 'לא ניתן להשלים את הרכישה כרגע מול חנות Google Play. אנא בדקו את החיבור לאינטרנט ונסו שוב.',
        okButtonText: 'הבנתי',
      });
      return { purchased: false };
    }

    const devUnlock = await Dialogs.confirm({
      title: `חיבור Google Play Billing (${PARASHA_PRICE_LABEL_HE})`,
      message:
        `שירות Google Play Billing הופעל עבור פרשת ${portionNameHe}.\n` +
        `מזהה מוצר (Product ID): ${productId}\n` +
        `מחיר: ${PARASHA_PRICE_LABEL_HE}\n` +
        `סטטוס מ־Google Play: ${rawState}\n\n` +
        `המוצר טרם פורסם ב־Google Play Console או שה־APK מותקן בבדיקה מקומית (Build: DEBUG).\n` +
        `האם לפתוח את פרשת ${portionNameHe} כעת במצב בדיקת מפתח?`,
      okButtonText: '🧪 פתיחה (מצב בדיקה)',
      cancelButtonText: 'סגירה',
    });

    if (devUnlock) {
      this.store.markPortionPurchased(portionId);
      return { purchased: true };
    }
    return { purchased: false };
  }
}
