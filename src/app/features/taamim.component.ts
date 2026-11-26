import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, OnDestroy, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { AudioService } from '../core/audio.service';
import { ContentService } from '../core/content.service';
import { goBack } from '../core/navigation';
import { Playback } from '../core/playback';
import { StoreService } from '../core/store.service';
import { TAAMIM, type TaamDef } from '../torah/cantillation';
import { GamificationBarComponent } from '../ui/gamification-bar.component';

interface TaamExample {
  verseId: string;
  verseLabelHe: string;
  wordText: string;
  firstWordIdx: number;
  lastWordIdx: number;
}

/** Curated Torah verse locations for rare tropes not present in Parashat Bereshit. */
const RARE_TAAM_LOCATIONS: Record<string, { portionId: string; verseId: string }> = {
  'shalshelet': { portionId: 'vayera', verseId: 'Genesis.19.16' },
  'karne-para': { portionId: 'masei', verseId: 'Numbers.35.5' },
  'yerach-ben-yomo': { portionId: 'masei', verseId: 'Numbers.35.5' },
  'mercha-kefula': { portionId: 'toldot', verseId: 'Genesis.27.25' },
};

/** Screen I — Cantillation Reference & Audio Dictionary (מילון טעמי המקרא): browse all 26 tropes, hear real studio examples, and practice any trope. */
@Component({
  selector: 'taamim',
  imports: [NativeScriptCommonModule, GamificationBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ActionBar title="מילון טעמי המקרא">
      <NavigationButton text="חזרה" android.systemIcon="ic_menu_back" (tap)="goBack()"></NavigationButton>
      <ActionItem android.position="actionBar" ios.position="right">
        <Label [text]="playback.speed() < 1 ? '🐢 0.75×' : '1.0× מהירות'" class="ab-action" (tap)="playback.toggleSpeed()"></Label>
      </ActionItem>
    </ActionBar>
    <ScrollView>
      <StackLayout class="page">
        <gamification-bar [compact]="true"></gamification-bar>

        <StackLayout class="hero-card">
          <Label class="card-title-gold" textWrap="true" text="🎵 מילון טעמי המקרא ודוגמאות שמע"></Label>
          <Label class="body-light" textWrap="true" [text]="'שליטה בטעמים: ' + masteredCount() + ' מתוך ' + allTaamim.length + ' טעמים נרכשו · לחצו על כל טעם להאזנה או לתרגול מודרך.'"></Label>
        </StackLayout>

        <!-- Filter Chips -->
        <ScrollView orientation="horizontal" scrollBarIndicatorVisible="false">
          <FlexboxLayout class="chapters" flexDirection="row" justifyContent="center">
            <Button class="chip" [class.chip-on]="filter() === 'all'" [text]="'הכול (' + allTaamim.length + ')'" (tap)="filter.set('all')"></Button>
            <Button class="chip" [class.chip-on]="filter() === 'disjunctive'" text="מפסיקים (18)" (tap)="filter.set('disjunctive')"></Button>
            <Button class="chip" [class.chip-on]="filter() === 'conjunctive'" text="משרתים (8)" (tap)="filter.set('conjunctive')"></Button>
            <Button class="chip" [class.chip-on]="filter() === 'mastered'" [text]="'נרכשו ✓ (' + masteredCount() + ')'" (tap)="filter.set('mastered')"></Button>
          </FlexboxLayout>
        </ScrollView>

        @for (item of filteredTaamim(); track item.def.id) {
          <GridLayout columns="*, auto" class="card taam-card" [class.tier-current]="item.mastered">
            <Label col="1" class="taam-symbol" textWrap="true" [text]="item.example.wordText"></Label>
            <StackLayout col="0">
              <FlexboxLayout flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center">
                <Label class="card-title" textWrap="true" [text]="item.def.nameHe"></Label>
                @if (item.mastered) {
                  <Label class="badge" textWrap="true" text="✓ נרכש"></Label>
                } @else if (item.def.rare) {
                  <Label class="badge-gold" textWrap="true" text="נדיר בתורה"></Label>
                }
              </FlexboxLayout>
              <Label class="tag" textWrap="true" [text]="item.def.kind === 'disjunctive' ? 'מפסיק (דרגה ' + (item.def.level ?? 4) + ') – עוצר את הקריאה' : 'משרת – מחבר למילה הבאה'"></Label>
              <Label class="body" textWrap="true" [text]="item.def.explanationHe"></Label>
              <Label class="meta" textWrap="true" [text]="'דוגמה מהתורה: ' + item.example.verseLabelHe"></Label>
              <GridLayout columns="*, *" marginTop="6">
                <Button col="1" class="btn-small" [class.btn-primary]="playback.playing() === item.def.id" textWrap="true"
                  [text]="playback.playing() === item.def.id ? '⏹ עצירה' : loadingId() === item.def.id ? 'מכין…' : '🔊 השמעת דוגמה'"
                  (tap)="playExample(item.def.id, item.example)"></Button>
                <Button col="0" class="btn-small" textWrap="true" text="🎤 תרגול הטעם" (tap)="practiceTaam(item.def.id, item.example)"></Button>
              </GridLayout>
            </StackLayout>
          </GridLayout>
        }
      </StackLayout>
    </ScrollView>
  `,
})
export class TaamimComponent implements OnDestroy {
  private readonly nav = inject(RouterExtensions);
  private readonly content = inject(ContentService);
  private readonly audio = inject(AudioService);
  readonly store = inject(StoreService);
  readonly playback = new Playback(this.audio.player);

  readonly allTaamim = TAAMIM;
  readonly filter = signal<'all' | 'disjunctive' | 'conjunctive' | 'mastered'>('all');
  readonly loadingId = signal<string | null>(null);

  private readonly examplesMap = new Map<string, TaamExample>();

  readonly masteredCount = computed(() => this.store.progress().masteredCantillationIds.length);

  readonly filteredTaamim = computed(() => {
    const f = this.filter();
    const masteredSet = new Set(this.store.progress().masteredCantillationIds);
    return this.allTaamim
      .filter((t) => {
        if (f === 'disjunctive') return t.kind === 'disjunctive';
        if (f === 'conjunctive') return t.kind === 'conjunctive';
        if (f === 'mastered') return masteredSet.has(t.id);
        return true;
      })
      .map((def) => ({
        def,
        mastered: masteredSet.has(def.id),
        example: this.getExample(def),
      }));
  });

  goBack(): void {
    goBack(this.nav, ['/']);
  }

  private getExample(def: TaamDef): TaamExample {
    const cached = this.examplesMap.get(def.id);
    if (cached) return cached;

    // 1. Search Parashat Bereshit first (bundled audio)
    for (const v of this.content.verses) {
      const wIdx = v.words.findIndex((w) => w.taamim.includes(def.id));
      if (wIdx >= 0) {
        const grp = v.groups.find((g) => g.words.includes(wIdx));
        const ex: TaamExample = {
          verseId: v.id,
          verseLabelHe: this.content.label(v),
          wordText: v.words[wIdx].text,
          firstWordIdx: grp ? grp.words[0] : wIdx,
          lastWordIdx: grp ? grp.words[grp.words.length - 1] : wIdx,
        };
        this.examplesMap.set(def.id, ex);
        return ex;
      }
    }

    // 2. Check curated rare locations across other Parashot
    const rareLoc = RARE_TAAM_LOCATIONS[def.id];
    if (rareLoc) {
      const p = this.content.getPortion(rareLoc.portionId);
      const v = p.verses.find((x) => x.id === rareLoc.verseId) ?? p.verses[0];
      const wIdx = Math.max(0, v.words.findIndex((w) => w.taamim.includes(def.id)));
      const grp = v.groups.find((g) => g.words.includes(wIdx));
      const ex: TaamExample = {
        verseId: v.id,
        verseLabelHe: this.content.label(v),
        wordText: v.words[wIdx]?.text ?? ('א' + def.symbol),
        firstWordIdx: grp ? grp.words[0] : wIdx,
        lastWordIdx: grp ? grp.words[grp.words.length - 1] : wIdx,
      };
      this.examplesMap.set(def.id, ex);
      return ex;
    }

    // 3. Fallback to Genesis 1:1
    const v0 = this.content.verses[0];
    const fallback: TaamExample = {
      verseId: v0.id,
      verseLabelHe: this.content.label(v0),
      wordText: 'א' + (def.id === 'sof-pasuk' ? 'ֽ׃' : def.symbol),
      firstWordIdx: 0,
      lastWordIdx: 0,
    };
    this.examplesMap.set(def.id, fallback);
    return fallback;
  }

  async playExample(taamId: string, ex: TaamExample): Promise<void> {
    if (this.playback.playing() === taamId) {
      this.playback.stop();
      return;
    }
    const ref = this.content.referenceFor(ex.verseId);
    if (!ref) return;
    this.loadingId.set(taamId);
    try {
      const clip = await this.audio.phraseClip(ex.verseId, ref, ex.firstWordIdx, ex.lastWordIdx);
      this.playback.play(clip.path, taamId);
    } finally {
      this.loadingId.set(null);
    }
  }

  practiceTaam(taamId: string, ex: TaamExample): void {
    this.playback.stop();
    this.nav.navigate(['/lesson', ex.verseId], { queryParams: { taam: taamId } });
  }

  ngOnDestroy(): void {
    this.playback.stop();
  }
}
