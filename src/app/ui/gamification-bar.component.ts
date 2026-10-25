import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, inject, input } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { StoreService } from '../core/store.service';

/** Persistent Duolingo-style top HUD: Streak, Coins, User Rank/Level, XP bar, and quick access to Challenges & Shop. */
@Component({
  selector: 'gamification-bar',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <StackLayout class="hud-card">
      <GridLayout columns="auto, auto, *, auto" class="hud-top">
        <!-- Left: Shop & Challenges quick buttons -->
        <Button col="0" class="hud-pill hud-pill-shop" text="🏪 חנות" (tap)="go('/shop')"></Button>
        <Button col="1" class="hud-pill hud-pill-quest" text="🎯 אתגרים" (tap)="go('/challenges')"></Button>

        <!-- Center: Coins & Booster -->
        <FlexboxLayout col="2" flexDirection="row" justifyContent="center" alignItems="center">
          @if (store.progress().doubleXpRemaining > 0) {
            <Label class="hud-stat hud-boost" [text]="'⚡x2 (' + store.progress().doubleXpRemaining + ')'"></Label>
          }
          <Label class="hud-stat hud-coins" [text]="'🪙 ' + store.progress().coins" (tap)="go('/shop')"></Label>
        </FlexboxLayout>

        <!-- Right: Streak & Freeze -->
        <FlexboxLayout col="3" flexDirection="row" alignItems="center" (tap)="go('/challenges')">
          @if (store.progress().streakFreezes > 0) {
            <Label class="hud-freeze" [text]="'🧊' + store.progress().streakFreezes"></Label>
          }
          <Label class="hud-stat hud-streak" [text]="'🔥 ' + store.progress().streakDays"></Label>
        </FlexboxLayout>
      </GridLayout>

      @if (!compact()) {
        <GridLayout columns="auto, *" class="hud-rank-row" (tap)="go('/challenges')">
          <Label col="0" class="hud-xp-text" [text]="store.rank().currentXp + ' / ' + store.rank().nextLevelXp + ' XP'"></Label>
          <Label col="1" class="hud-rank-title" [text]="store.rank().badgeIcon + ' רמה ' + store.rank().level + ' · ' + store.rank().titleHe"></Label>
        </GridLayout>
        <GridLayout class="hud-xp-track" height="7">
          <StackLayout class="hud-xp-fill" horizontalAlignment="right" [width]="(store.rank().progressPct / 100) * 320"></StackLayout>
        </GridLayout>
      }
    </StackLayout>
  `,
})
export class GamificationBarComponent {
  compact = input(false);
  readonly store = inject(StoreService);
  private nav = inject(RouterExtensions);

  go(route: string): void {
    this.nav.navigate([route]);
  }
}
