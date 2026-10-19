import { signal } from '@angular/core';
import { Application } from '@nativescript/core';
import { requestMicPermission, type Recorder } from '../audio/audio-io';

export interface RecordingOutcome {
  samples: number;
  interruptedHe?: string; // set when capture stopped for a reason other than the student finishing
}

/** Microphone permission, level meter, auto-stop and interruption handling for one recording. */
export class RecordingSession {
  readonly active = signal(false);
  readonly level = signal(0);
  readonly elapsedMs = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private onStop: ((r: RecordingOutcome) => void) | null = null;
  private readonly onSuspend = () => this.active() && this.stop('ההקלטה נעצרה כי האפליקציה עברה לרקע. אפשר להקליט שוב.');

  constructor(private recorder: Recorder) {}

  /** Returns a Hebrew error message, or null once recording has started. */
  async start(wav: string, onStop: (r: RecordingOutcome) => void, maxMs = 90_000): Promise<string | null> {
    if (this.active()) return null;
    if (!(await requestMicPermission())) return 'אין הרשאה למיקרופון. אפשר לאשר אותה בהגדרות המכשיר ולנסות שוב.';
    try {
      this.recorder.start(wav);
    } catch (e) {
      return `לא הצלחתי להפעיל את המיקרופון (${e}). אולי אפליקציה אחרת משתמשת בו?`;
    }
    this.onStop = onStop;
    this.active.set(true);
    Application.on(Application.suspendEvent, this.onSuspend);
    this.timer = setInterval(() => {
      this.level.set(this.recorder.level);
      this.elapsedMs.set(this.recorder.durationMs);
      if (!this.recorder.isRecording) this.stop(`ההקלטה נקטעה (${this.recorder.error ?? 'שגיאה לא ידועה'}). אפשר להקליט שוב.`);
      else if (this.recorder.durationMs >= maxMs) this.stop();
    }, 100);
    return null;
  }

  stop(interruptedHe?: string): void {
    if (!this.active()) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    Application.off(Application.suspendEvent, this.onSuspend);
    const samples = this.recorder.stop();
    this.active.set(false);
    this.level.set(0);
    const cb = this.onStop;
    this.onStop = null;
    cb?.({ samples, interruptedHe });
  }

  /** Stops without reporting (screen left mid-recording). */
  dispose(): void {
    this.onStop = null;
    this.stop();
  }
}
