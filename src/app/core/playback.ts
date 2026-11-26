import { signal } from '@angular/core';
import type { Player } from '../audio/audio-io';

/**
 * Plays a file (or a segment of it) and publishes the real playback position, which drives the word
 * highlight, chart playhead and yad (spec §10.4: animation from real timing, not a guess).
 */
export class Playback {
  readonly positionMs = signal<number | null>(null); // relative to the segment start
  readonly playing = signal<string | null>(null); // a caller-chosen tag for what is playing
  readonly speed = signal<number>(1.0); // 1.0 (normal) or 0.75 (slow-motion pitch-preserved)
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private player: Player) {}

  toggleSpeed(): void {
    const next = this.speed() === 1.0 ? 0.75 : 1.0;
    this.speed.set(next);
    this.player.setSpeed?.(next);
  }

  play(file: string, tag: string, startMs = 0, endMs: number | null = null, onEnd?: () => void): void {
    this.stop();
    this.player.play(file, () => this.finish(onEnd), startMs, this.speed());
    this.playing.set(tag);
    this.timer = setInterval(() => {
      const pos = this.player.positionMs - startMs;
      if (endMs !== null && this.player.positionMs >= endMs) return this.finish(onEnd);
      this.positionMs.set(Math.max(0, pos));
    }, 40);
  }

  stop(): void {
    this.player.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.positionMs.set(null);
    this.playing.set(null);
  }

  private finish(onEnd?: () => void): void {
    this.stop();
    onEnd?.();
  }
}

/** Index of the word being heard at `ms`, from word start times (null before the first word). */
export function wordAt(ms: number | null, starts: (number | null)[]): number | null {
  if (ms === null) return null;
  let k: number | null = null;
  starts.forEach((s, i) => {
    if (s !== null && s <= ms) k = i;
  });
  return k;
}
