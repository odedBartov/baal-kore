import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { CATEGORY_NAME_HE, type Category } from '../analysis/types';
import { BillingService } from '../core/billing.service';
import { BOOKS, ContentService, hebrewNumber, PORTIONS } from '../core/content.service';
import { computeCatalogPortionSummary } from '../core/gamification';
import { PARASHA_PRICE_LABEL_HE } from '../core/state';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import type { BookId } from '../torah/model';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';

/** Screen C — 5 Books of the Torah, all 54 Parashot, overall average grade, category averages, and 7 Aliyot grade cards. */
@Component({
  selector: 'portions',
  imports: [NativeScriptCommonModule, RabbiComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="חמשת חומשי התורה">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar></gamification-bar>
        <rabbi [line]="line"></rabbi>

        <!-- 5 Books of the Torah (Chumashim) Selector -->
        <Label class="section" textWrap="true" text="📚 בחירת חומש (5 חומשי התורה)"></Label>
        <ScrollView orientation="horizontal" scrollBarIndicatorVisible="false">
          <FlexboxLayout class="chapters" flexDirection="row" justifyContent="center">
            @for (b of books; track b.id) {
              <Button class="chip" [class.chip-on]="b.id === selectedBookId()"
                [text]="'חומש ' + b.nameHePlain + ' (' + b.portionIds.length + ')'"
                (tap)="selectBook(b.id)"></Button>
            }
          </FlexboxLayout>
        </ScrollView>

        <!-- Parashot chips inside the selected Chumash -->
        <ScrollView orientation="horizontal" scrollBarIndicatorVisible="false" marginTop="4">
          <FlexboxLayout class="chapters" flexDirection="row" justifyContent="center">
            @for (p of bookPortions(); track p.id) {
              <Button class="chip" [class.chip-on]="p.id === selectedPortionId()"
                [text]="p.nameHe"
                (tap)="selectPortion(p.id)"></Button>
            }
          </FlexboxLayout>
        </ScrollView>

        <!-- Selected Parasha Hero Card -->
        <StackLayout class="hero-card" (tap)="openAliyah(1)">
          <GridLayout columns="auto, *">
            <StackLayout col="0" class="grade-pill-box" verticalAlignment="center">
              <Label class="grade-pill-num" textWrap="true" [text]="summary().averageScore !== null ? '' + summary().averageScore : '—'"></Label>
              <Label class="grade-pill-lbl" textWrap="true" text="ממוצע פרשה"></Label>
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="card-title-gold" textWrap="true" [text]="'פרשת ' + selectedPortionMeta().nameHe + ' · ' + summary().levelIcon + ' ' + summary().levelTitleHe"></Label>
              <Label class="body-light" textWrap="true" [text]="selectedPortionMeta().rangeHe + ' · ' + summary().doneVerses + ' מתוך ' + summary().totalVerses + ' פסוקים (' + summary().progressPct + '%)'"></Label>
              <GridLayout class="hud-xp-track" height="8">
                <StackLayout class="hud-xp-fill" horizontalAlignment="right" [width]="(summary().progressPct / 100) * 230"></StackLayout>
              </GridLayout>
            </StackLayout>
          </GridLayout>

          @if (catEntries().length) {
            <FlexboxLayout flexDirection="row" flexWrap="wrap" justifyContent="flex-end" marginTop="8">
              @for (c of catEntries(); track c.cat) {
                <Label class="cat-avg-chip" textWrap="true" [text]="c.name + ': ' + c.score"></Label>
              }
            </FlexboxLayout>
          }

          <Button class="btn btn-primary" textWrap="true" marginTop="10"
            [text]="summary().isPurchased ? '📖 פתיחת פרשת ' + selectedPortionMeta().nameHe + ' (כל 7 העליות פתוחות)' : '🎁 התחלת עלייה ראשונה בחינם (פרשת ' + selectedPortionMeta().nameHe + ')'"
            (tap)="openAliyah(1)"></Button>
          @if (!summary().isPurchased) {
            <Button class="btn-paywall" textWrap="true" marginTop="6"
              [text]="'💳 פתיחת כל פרשת ' + selectedPortionMeta().nameHe + ' (עליות ב׳–ז׳) – ' + store.currentPriceLabel() + (store.hasDiscount50() ? ' (50% הנחה!)' : '')"
              (tap)="unlockSelectedParasha()"></Button>
            <Button class="btn-link" textWrap="true" color="#ffd978" text="🎟️ יש לכם קוד קופון או הנחה? לחצו כאן" (tap)="redeemCoupon()"></Button>
          }
        </StackLayout>

        <!-- Breakdown by 7 Aliyot with Average Grade per Aliyah -->
        <Label class="section" textWrap="true" [text]="'📜 שבע העליות בפרשת ' + selectedPortionMeta().nameHe + (summary().isPurchased ? ' (הכול פתוח ✓)' : ' (עלייה א׳ חינם · ב׳–ז׳ ב־' + store.currentPriceLabel() + ')')"></Label>
        @for (a of summary().aliyot; track a.aliyah) {
          <GridLayout columns="auto, *, auto" class="card aliyah-card" (tap)="openAliyah(a.aliyah)">
            <!-- Left: Average Score or Free/Paywall Badge -->
            <StackLayout col="0" class="aliyah-score-box" verticalAlignment="center">
              @if (a.isPaywalled) {
                <Label class="aliyah-score-num" textWrap="true" text="🔒"></Label>
                <Label class="aliyah-score-lbl" textWrap="true" [text]="store.currentPriceLabel()"></Label>
              } @else if (a.averageScore !== null) {
                <Label class="aliyah-score-num" textWrap="true" [text]="'' + a.averageScore"></Label>
                <Label class="aliyah-score-lbl" textWrap="true" text="ממוצע"></Label>
              } @else if (a.isFree) {
                <Label class="aliyah-score-num" textWrap="true" text="חינם"></Label>
                <Label class="aliyah-score-lbl" textWrap="true" text="פתוח לתרגול"></Label>
              } @else {
                <Label class="aliyah-score-num" textWrap="true" text="פתוח"></Label>
                <Label class="aliyah-score-lbl" textWrap="true" text="טרם נבדק"></Label>
              }
            </StackLayout>

            <!-- Middle: Aliyah info & progress bar -->
            <StackLayout col="1" verticalAlignment="center" marginRight="10" marginLeft="10">
              <Label class="cat-name" textWrap="true" [text]="(a.hasCrown ? '👑 ' : a.isFree ? '🎁 ' : a.isPaywalled ? '🔒 ' : '') + a.nameHe + (a.isFree ? ' · חינם' : '')"></Label>
              <Label class="meta" textWrap="true" [text]="a.rangeHe + ' · ' + a.doneVerses + '/' + a.totalVerses + ' פסוקים · ' + (a.isPaywalled ? 'נעול – פתיחת כל הפרשה ב־' + store.currentPriceLabel() : a.levelIcon + ' ' + a.levelTitleHe)"></Label>
              <GridLayout class="meter" height="8">
                <StackLayout class="meter-fill" horizontalAlignment="right" [width]="(a.progressPct / 100) * 200"></StackLayout>
              </GridLayout>
            </StackLayout>

            <!-- Right: Aliyah number badge -->
            <Label col="2" class="aliyah-num-circle" [text]="num(a.aliyah)"></Label>
          </GridLayout>
        }

        <!-- All Parashot in the Selected Book -->
        <Label class="section" textWrap="true" [text]="'📖 כל הפרשות בחומש ' + selectedBookMeta().nameHePlain + ' (' + bookPortionsWithSummary().length + ' פרשות)'"></Label>
        @for (item of bookPortionsWithSummary(); track item.meta.id) {
          <GridLayout columns="auto, *, auto" class="card aliyah-card" [class.tier-current]="item.meta.id === selectedPortionId()" (tap)="openPortion(item.meta.id)">
            <StackLayout col="0" class="aliyah-score-box" verticalAlignment="center">
              <Label class="aliyah-score-num" textWrap="true" [text]="item.summary.averageScore !== null ? '' + item.summary.averageScore : item.summary.isPurchased ? '✓ מלא' : 'חינם'"></Label>
              <Label class="aliyah-score-lbl" textWrap="true" [text]="item.summary.averageScore !== null ? 'ממוצע' : item.summary.isPurchased ? 'כל העליות' : 'עלייה א׳'"></Label>
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center" marginRight="10" marginLeft="10">
              <Label class="portion-name" textWrap="true" [text]="'פרשת ' + item.meta.nameHe"></Label>
              <Label class="meta" textWrap="true" [text]="item.meta.rangeHe + ' · ' + item.summary.doneVerses + '/' + item.meta.totalVerses + ' פסוקים · ' + (item.summary.isPurchased ? '✓ כל 7 העליות פתוחות' : '🎁 עלייה א׳ חינם · ב׳–ז׳ ב־' + store.currentPriceLabel())"></Label>
            </StackLayout>
            <Label col="2" class="aliyah-num-circle" [text]="num(item.orderInBook)"></Label>
          </GridLayout>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class PortionsComponent {
  readonly nav = inject(RouterExtensions);
  readonly content = inject(ContentService);
  readonly store = inject(StoreService);
  readonly billing = inject(BillingService);
  readonly priceLabel = PARASHA_PRICE_LABEL_HE;
  readonly num = hebrewNumber;
  readonly books = BOOKS;
  readonly line = rabbiSays({ kind: 'portions' });

  private readonly initialPortion = this.content.portionOfVerse(this.store.progress().currentVerseId);
  readonly selectedBookId = signal<BookId>(this.initialPortion.book);
  readonly selectedPortionId = signal<string>(this.initialPortion.id);

  readonly selectedBookMeta = computed(() => this.content.getBook(this.selectedBookId()));
  readonly bookPortions = computed(() => this.content.getPortionsByBook(this.selectedBookId()));
  readonly selectedPortionMeta = computed(() => this.content.getPortionMeta(this.selectedPortionId()) ?? PORTIONS[0]);

  readonly summary = computed(() => computeCatalogPortionSummary(this.selectedPortionMeta(), this.store.progress()));
  readonly catEntries = computed(() => {
    const avgs = this.summary().categoryAverages;
    return (Object.keys(avgs) as Category[]).map((cat) => ({
      cat,
      name: CATEGORY_NAME_HE[cat],
      score: avgs[cat]!,
    }));
  });

  readonly bookPortionsWithSummary = computed(() => {
    const p = this.store.progress();
    return this.bookPortions().map((meta, idx) => ({
      meta,
      orderInBook: idx + 1,
      summary: computeCatalogPortionSummary(meta, p),
    }));
  });

  goBack(): void {
    goBack(this.nav, ['/']);
  }

  selectBook(bookId: BookId): void {
    this.selectedBookId.set(bookId);
    const first = this.content.getPortionsByBook(bookId)[0];
    if (first) {
      this.selectedPortionId.set(first.id);
      this.content.activePortionId.set(first.id);
    }
  }

  selectPortion(portionId: string): void {
    this.selectedPortionId.set(portionId);
    this.content.activePortionId.set(portionId);
  }

  openPortion(portionId: string): void {
    this.selectedPortionId.set(portionId);
    this.content.activePortionId.set(portionId);
    this.nav.navigate(['/portion', portionId], { queryParams: { aliyah: 1 } });
  }

  openAliyah(aliyah: number): void {
    const pid = this.selectedPortionId();
    this.content.activePortionId.set(pid);
    this.nav.navigate(['/portion', pid], { queryParams: { aliyah } });
  }

  async unlockSelectedParasha(): Promise<void> {
    await this.billing.promptUnlockParasha(this.selectedPortionMeta());
  }

  async redeemCoupon(): Promise<void> {
    await this.billing.promptRedeemCoupon(this.selectedPortionMeta());
  }
}
