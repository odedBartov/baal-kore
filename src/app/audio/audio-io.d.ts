// Platform audio I/O. Implementations: audio-io.android.ts (device-tested), audio-io.ios.ts (not yet implemented).

/** Rate of student recordings; the analysis pipeline resamples anything else to it. */
export const RECORDING_SAMPLE_RATE: number;

/** Resolves true once RECORD_AUDIO is granted (prompts the user if needed). */
export function requestMicPermission(): Promise<boolean>;

/** Records mono 16-bit PCM straight into a WAV file. */
export class Recorder {
  start(wavPath: string): void;
  /** Stops and finalises the file; returns the number of samples written. */
  stop(): number;
  readonly isRecording: boolean;
  readonly level: number; // RMS of the last 50 ms, 0..1
  readonly durationMs: number;
  readonly error: string | null; // set when capture failed mid-recording
}

export class Player {
  play(path: string, onEnd?: () => void, startMs?: number): void;
  stop(): void;
  readonly isPlaying: boolean;
  readonly positionMs: number;
}
