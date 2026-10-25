import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, inject } from '@angular/core';
import { goBack } from '../core/navigation';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { CATEGORY_NAME_HE, type Category } from '../analysis/types';
import { ContentService, hebrewNumber, PORTIONS } from '../core/content.service';
import { computeParashaSummary } from '../core/gamification';
import { StoreService } from '../core/store.service';
import { rabbiSays } from '../teaching/rabbi';
import { GamificationBarComponent } from '../ui/gamification-bar.component';
import { RabbiComponent } from '../ui/rabbi.component';

/** Screen C — Parasha overview, overall average grade, category averages, and 7 Aliyot grade cards. */
@Component({
  selector: 'portions',
  imports: [NativeScriptCommonModule, RabbiComponent, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="פרשות ועליות">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label text="הגדרות" class="ab-action" (tap)="nav.navigate(['/settings'])"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar></gamification-bar>
        <rabbi [line]="line"></rabbi>

        <!-- Master Parashat Bereshit Card -->
        <StackLayout class="hero-card" (tap)="openAliyah(1)">
          <GridLayout columns="auto, *">
            <StackLayout col="0" class="grade-pill-box" verticalAlignment="center">
              <Label class="grade-pill-num" [text]="summary().averageScore !== null ? '' + summary().averageScore : '—'"></Label>
              <Label class="grade-pill-lbl" text="ממוצע פרשה"></Label>
            </StackLayout>
            <StackLayout col="1" verticalAlignment="center">
              <Label class="card-title-gold" [text]="'פרשת בראשית · ' + summary().levelIcon + ' ' + summary().levelTitleHe"></Label>
              <Label class="body-light" [text]="summary().doneVerses + ' מתוך ' + summary().totalVerses + ' פסוקים (' + summary().progressPct + '%)'"></Label>
              <GridLayout class="hud-xp-track" height="8">
                <StackLayout class="hud-xp-fill" horizontalAlignment="right" [width]="(summary().progressPct / 100) * 230"></StackLayout>
              </GridLayout>
            </StackLayout>
          </GridLayout>

          @if (catEntries().length) {
            <FlexboxLayout flexDirection="row" flexWrap="wrap" justifyContent="flex-end" marginTop="8">
              @for (c of catEntries(); track c.cat) {
                <Label class="cat-avg-chip" [text]="c.name + ': ' + c.score"></Label>
              }
            </FlexboxLayout>
          }
        </StackLayout>

        <!-- Breakdown by 7 Aliyot with Average Grade per Aliyah -->
        <Label class="section" text="📜 שבע העליות בפרשת בראשית (ממוצע ציונים לכל עלייה)"></Label>
        @for (a of summary().aliyot; track a.aliyah) {
          <GridLayout columns="auto, *, auto" class="card aliyah-card" (tap)="openAliyah(a.aliyah)">
            <!-- Left: Average Score Badge -->
            <StackLayout col="0" class="aliyah-score-box" verticalAlignment="center">
              <Label class="aliyah-score-num" [text]="a.averageScore !== null ? '' + a.averageScore : '—'"></Label>
              <Label class="aliyah-score-lbl" [text]="a.averageScore !== null ? 'ממוצע' : 'טרם נבדק'"></Label>
            </StackLayout>

            <!-- Middle: Aliyah info & progress bar -->
            <StackLayout col="1" verticalAlignment="center" marginRight="10" marginLeft="10">
              <Label class="cat-name" [text]="(a.hasCrown ? '👑 ' : '') + a.nameHe"></Label>
              <Label class="meta" [text]="a.rangeHe + ' · ' + a.doneVerses + '/' + a.totalVerses + ' פסוקים · ' + a.levelIcon + ' ' + a.levelTitleHe"></Label>
              <GridLayout class="meter" height="8">
                <StackLayout class="meter-fill" horizontalAlignment="right" [width]="(a.progressPct / 100) * 200"></StackLayout>
              </GridLayout>
            </StackLayout>

            <!-- Right: Aliyah number badge -->
            <Label col="2" class="aliyah-num-circle" [text]="num(a.aliyah)"></Label>
          </GridLayout>
        }

        <Label class="section" text="פרשות נוספות בספר בראשית"></Label>
        @for (p of otherPortions; track p.id) {
          <GridLayout columns="auto, *" class="card portion disabled">
            <StackLayout col="1">
              <Label class="portion-name" [text]="'פרשת ' + p.nameHe"></Label>
              <Label class="meta" text="בקרוב"></Label>
            </StackLayout>
            <Label col="0" class="chevron" text="🔒"></Label>
          </GridLayout>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class PortionsComponent {
  readonly nav = inject(RouterExtensions);

  goBack(): void {
    goBack(this.nav, ['/']);
  }
  readonly content = inject(ContentService);
  readonly store = inject(StoreService);
  readonly num = hebrewNumber;
  readonly otherPortions = PORTIONS.filter((p) => !p.available);
  readonly line = rabbiSays({ kind: 'portions' });

  readonly summary = computed(() => computeParashaSummary(this.content.verses, this.store.progress(), hebrewNumber));
  readonly catEntries = computed(() => {
    const avgs = this.summary().categoryAverages;
    return (Object.keys(avgs) as Category[]).map((cat) => ({
      cat,
      name: CATEGORY_NAME_HE[cat],
      score: avgs[cat]!,
    }));
  });

  openAliyah(aliyah: number): void {
    this.nav.navigate(['/portion', 'bereshit'], { queryParams: { aliyah } });
  }
}
