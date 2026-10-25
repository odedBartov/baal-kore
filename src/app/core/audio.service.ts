import { Injectable, inject } from '@angular/core';
import { File, Folder, knownFolders, path } from '@nativescript/core';
import { Player, Recorder } from '../audio/audio-io';
import type { ContourResult, WorkerRequest, WorkerResult } from '../audio/analysis.worker';
import type { EvalCharts } from '../analysis/evaluate';
import type { VerseEvaluation } from '../analysis/types';
import type { VerseData } from '../torah/model';
import { ContentService, type ReferenceVerse } from './content.service';
import { StoreService } from './store.service';

/** One shared analysis worker, plus recorder/player and the local file layout. */
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly recorder = new Recorder();
  readonly player = new Player();
  private content = inject(ContentService);
  private store = inject(StoreService);
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: WorkerResult) => void; reject: (e: Error) => void }>();
  private contours = new Map<string, Promise<ContourResult>>();

  run<T extends WorkerResult>(req: WorkerRequest): Promise<T> {
    if (!this.worker) {
      this.worker = new Worker(new URL('../audio/analysis.worker', import.meta.url));
      this.worker.onmessage = ({ data }: MessageEvent<{ id: number; ok: boolean; result?: WorkerResult; error?: string }>) => {
        const p = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.ok) p?.resolve(data.result!);
        else p?.reject(new Error(data.error));
      };
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(String((e as ErrorEvent).message ?? e)));
        this.pending.clear();
        this.worker = null; // a crashed worker is recreated on the next call
      };
    }
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: WorkerResult) => void, reject });
      this.worker!.postMessage({ id, req });
    });
  }

  // ---- File layout: attempts in documents (kept for replay, deletable in settings), derived audio in temp.
  private folder(base: Folder, ...names: string[]): string {
    return names.reduce((f, n) => f.getFolder(n), base).path;
  }
  attemptWav(verseId: string): string {
    const keep = this.store.settings().keepRecordings;
    return path.join(this.folder(keep ? knownFolders.documents() : knownFolders.temp(), 'recordings'), `${verseId}.wav`);
  }
  scratchWav(name: string): string {
    return path.join(this.folder(knownFolders.temp(), 'scratch'), `${name}.wav`);
  }

  clearRecordings(): Promise<void> {
    this.contours.clear();
    return Promise.all([knownFolders.documents().getFolder('recordings').clear(), knownFolders.temp().getFolder('recordings').clear()]).then(() => undefined);
  }

  /** The verse's segment of the original reference recording, decoded once to WAV. */
  async referenceWav(verseId: string, ref: ReferenceVerse): Promise<string> {
    const dst = path.join(this.folder(knownFolders.temp(), 'reference', ref.readerId), `${verseId}.wav`);
    if (!File.exists(dst)) await this.run({ type: 'decode', src: ref.file, dst, startMs: ref.startMs, endMs: ref.endMs });
    return dst;
  }

  /** Words first..last of the reference, cut exactly into their own file (played whole: no seek or stop latency). */
  async phraseClip(verseId: string, ref: ReferenceVerse, first: number, last: number): Promise<{ path: string; startMs: number; endMs: number }> {
    const src = await this.referenceWav(verseId, ref), path = src.replace(/\.wav$/, `.w${first}-${last}.wav`);
    const b = await this.run<{ startMs: number; endMs: number }>({ type: 'clip', src, dst: path, words: ref.words, first, last });
    return { path, ...b };
  }

  contour(wav: string): Promise<ContourResult> {
    if (!this.contours.has(wav)) this.contours.set(wav, this.run<ContourResult>({ type: 'contour', wav }).catch((e) => (this.contours.delete(wav), Promise.reject(e))));
    return this.contours.get(wav)!;
  }

  forget(wav: string): void {
    this.contours.delete(wav);
  }

  /** Full on-device evaluation of a student's reading of a verse (worker: CTC + analyzers + scoring). */
  async evaluateVerse(verse: VerseData, studentWav: string): Promise<{ evaluation: VerseEvaluation; charts: EvalCharts; timingsMs: Record<string, number> }> {
    const ref = this.content.referenceFor(verse.id);
    return this.run({
      type: 'evaluate',
      verseId: verse.id,
      words: verse.words.map((w) => ({ id: w.id, text: w.text, spoken: w.spoken, primary: w.primary, syllables: w.syllables })),
      groups: verse.groups,
      studentWav,
      referenceWav: ref ? await this.referenceWav(verse.id, ref) : null,
      referenceWords: ref?.words.map((w) => ({ startMs: w.startMs, endMs: w.endMs })) ?? null,
      referenceApproval: this.content.coverage(verse.id).reference,
      passingThreshold: this.store.settings().passingThreshold,
      pronunciation: this.store.settings().pronunciation,
      melody: {
        wordErrorSt: this.store.settings().lessonMaxDeviation,
        wordMajorSt: this.store.settings().lessonMaxDeviation + 0.5,
        scoreBad: Math.max(1.0, this.store.settings().lessonMaxDeviation * 2),
      },
    });
  }
}
