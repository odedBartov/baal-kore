// ponytail: iOS audio I/O not implemented — it cannot be built or tested without macOS (see docs/phase3-audio-spike.md).
// Planned: AVAudioSession(.playAndRecord) + AVAudioRecorder with kAudioFormatLinearPCM 16 kHz mono → WAV, AVAudioPlayer.
const unavailable = () => {
  throw new Error('Audio recording is not implemented on iOS yet');
};

export const RECORDING_SAMPLE_RATE = 16000;

export function requestMicPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

export class Recorder {
  start(_wavPath: string): void {
    unavailable();
  }
  stop(): number {
    return 0;
  }
  readonly isRecording = false;
  readonly level = 0;
  readonly durationMs = 0;
  readonly error: string | null = null;
}

export class Player {
  play(_path: string, _onEnd?: () => void, _startMs?: number): void {
    unavailable();
  }
  stop(): void {}
  readonly isPlaying = false;
  readonly positionMs = 0;
}
