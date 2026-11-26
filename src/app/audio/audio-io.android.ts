import { Application, Utils } from '@nativescript/core';

declare const com: { baalkore: { app: { PcmRecorder: new (sampleRate: number) => PcmRecorderNative } } };
interface PcmRecorderNative {
  start(path: string): void;
  stop(): number;
  isRecording(): boolean;
  level(): number;
  frames(): number;
  error(): string | null;
}

export const RECORDING_SAMPLE_RATE = 16000;

export function requestMicPermission(): Promise<boolean> {
  const perm = android.Manifest.permission.RECORD_AUDIO;
  const granted = () =>
    androidx.core.content.ContextCompat.checkSelfPermission(Utils.android.getApplicationContext(), perm) ===
    android.content.pm.PackageManager.PERMISSION_GRANTED;
  if (granted()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const code = 7001;
    const onResult = (args: { requestCode: number }) => {
      if (args.requestCode !== code) return;
      Application.android.off('activityRequestPermissions', onResult);
      resolve(granted());
    };
    Application.android.on('activityRequestPermissions', onResult);
    const perms = Array.create(java.lang.String, 1);
    perms[0] = perm;
    androidx.core.app.ActivityCompat.requestPermissions(Application.android.foregroundActivity, perms, code);
  });
}

export class Recorder {
  private native = new com.baalkore.app.PcmRecorder(RECORDING_SAMPLE_RATE);

  start(wavPath: string): void {
    this.native.start(wavPath);
  }

  stop(): number {
    return Number(this.native.stop()); // joins the capture thread (≤ 50 ms)
  }

  get isRecording(): boolean {
    return this.native.isRecording();
  }

  get level(): number {
    return this.native.level();
  }

  get durationMs(): number {
    return (Number(this.native.frames()) / RECORDING_SAMPLE_RATE) * 1000;
  }

  get error(): string | null {
    return this.native.error() || null;
  }
}

export class Player {
  private mp: android.media.MediaPlayer | null = null;
  private currentSpeed = 1.0;

  play(path: string, onEnd?: () => void, startMs = 0, speed = 1.0): void {
    this.stop();
    this.currentSpeed = speed;
    const mp = new android.media.MediaPlayer();
    mp.setDataSource(path);
    mp.setOnCompletionListener(
      new android.media.MediaPlayer.OnCompletionListener({
        onCompletion: () => {
          this.stop();
          onEnd?.();
        },
      }),
    );
    mp.prepare();
    if (startMs > 0) mp.seekTo(Math.round(startMs));
    mp.start();
    if (speed !== 1.0) {
      try {
        mp.setPlaybackParams(mp.getPlaybackParams().setSpeed(speed));
      } catch {
        // Fallback to normal speed if device codec does not support time-stretch
      }
    }
    this.mp = mp;
  }

  setSpeed(speed: number): void {
    this.currentSpeed = speed;
    if (this.mp) {
      try {
        this.mp.setPlaybackParams(this.mp.getPlaybackParams().setSpeed(speed));
      } catch {
        // Ignore if not supported while playing
      }
    }
  }

  stop(): void {
    this.mp?.release();
    this.mp = null;
  }

  get isPlaying(): boolean {
    return this.mp !== null;
  }

  get positionMs(): number {
    return this.mp ? this.mp.getCurrentPosition() : 0;
  }
}
