import { Injectable, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import type { VerseEvaluation } from '../analysis/types';
import type { EvalCharts } from '../analysis/evaluate';
import { defaultProgress, migrateProgress, migrateSettings, type AttemptSummary, type Settings, type StudentProgress } from './state';

export interface StoredEvaluation {
  evaluation: VerseEvaluation;
  charts: EvalCharts;
  recording: string;
  previous?: AttemptSummary;
}

const KEY = { progress: 'torah-tutor.progress', settings: 'torah-tutor.settings' };

function load(key: string): unknown {
  try {
    return JSON.parse(ApplicationSettings.getString(key, 'null'));
  } catch {
    return null;
  }
}

/** Local persistence only — nothing leaves the device (spec §17). */
@Injectable({ providedIn: 'root' })
export class StoreService {
  readonly progress = signal<StudentProgress>(migrateProgress(load(KEY.progress)));
  readonly settings = signal<Settings>(migrateSettings(load(KEY.settings)));
  /** Latest full evaluation per verse, for the results screen (in memory; the summary is persisted). */
  readonly evaluations = new Map<string, StoredEvaluation>();

  updateProgress(change: (p: StudentProgress) => void): void {
    const p: StudentProgress = JSON.parse(JSON.stringify(this.progress()));
    change(p);
    this.progress.set(p);
    ApplicationSettings.setString(KEY.progress, JSON.stringify(p));
  }

  updateSettings(change: Partial<Settings>): void {
    const s = migrateSettings({ ...this.settings(), ...change });
    this.settings.set(s);
    ApplicationSettings.setString(KEY.settings, JSON.stringify(s));
  }

  /** Clears learning progress. */
  resetProgress(): void {
    this.updateProgress((p) => Object.assign(p, defaultProgress(), { welcomed: true }));
    this.evaluations.clear();
  }

  recordAttempt(e: VerseEvaluation): void {
    this.updateProgress((p) => {
      p.currentVerseId = e.verseId;
      p.attemptCounts[e.verseId] = (p.attemptCounts[e.verseId] ?? 0) + 1;
      p.lastAttempts[e.verseId] = {
        at: e.analyzedAt,
        status: e.status,
        overallScore: e.overallScore,
        categories: e.categories.map((c) => ({ category: c.category, score: c.score })),
        errorKinds: e.errors.map((x) => x.kind),
      };
      for (const x of e.errors) {
        const k = x.taam ? `taam:${x.taam}` : x.category;
        p.mistakeCounts[k] = (p.mistakeCounts[k] ?? 0) + 1;
      }
      if (e.status === 'passed') {
        if (!p.completedVerseIds.includes(e.verseId)) p.completedVerseIds.push(e.verseId);
        p.bestScores[e.verseId] = Math.max(p.bestScores[e.verseId] ?? 0, e.overallScore ?? 0);
      }
    });
  }

  markPracticed(verseId: string, nextVerseId?: string): void {
    this.updateProgress((p) => {
      if (!p.practicedVerseIds.includes(verseId)) p.practicedVerseIds.push(verseId);
      if (nextVerseId) p.currentVerseId = nextVerseId;
    });
  }

  masterTaamim(ids: string[]): void {
    this.updateProgress((p) => {
      for (const t of ids) if (!p.masteredCantillationIds.includes(t)) p.masteredCantillationIds.push(t);
    });
  }
}
