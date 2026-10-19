# iOS compatibility assessment

**Status: not built and not tested.** Building or running the NativeScript iOS target requires macOS with Xcode. All development and testing so far happened on Windows, on an Android emulator. Nothing in this repository has been verified on iOS, and no statement here should be read as an iOS test result.

## What is already cross-platform

About 90% of the code is plain TypeScript with no platform imports:

- **Screens and UI:** all screens, the rabbi, verse text, charts and the Yad (NativeScript core views).
- **Content:** Torah parsing, the te'amim catalog, lessons and the rabbi's rules.
- **Signal processing:** pitch (YIN), MFCC, DTW, contour comparison, phrase cutting.
- **Evaluation:** CTC alignment, letter comparison and scoring.
- **State and persistence:** these use `ApplicationSettings`, which is cross-platform.

## What must be written for iOS

| Piece | Android today | iOS work needed |
|---|---|---|
| Microphone capture → 16 kHz mono WAV | `PcmRecorder.java` (`AudioRecord` on its own thread) | Implement `audio-io.ios.ts` `Recorder` with `AVAudioSession` (`.playAndRecord`, `.measurement` mode to avoid AGC) and `AVAudioRecorder` writing linear PCM (16 kHz, mono, 16-bit) to a WAV/CAF file. Level metering via `updateMeters()`. |
| Microphone permission | runtime `RECORD_AUDIO` | `AVAudioSession.requestRecordPermission` plus `NSMicrophoneUsageDescription` (Hebrew text) in `App_Resources/iOS/Info.plist`. |
| Playback + position | `MediaPlayer` | `AVAudioPlayer` (`currentTime` for the playhead, `play(atTime:)`/`currentTime` for segments). |
| Decoding reference audio | `AudioDecoder.java` (`MediaExtractor`/`MediaCodec`) | **iOS cannot decode Ogg Vorbis natively.** Either convert the reference files to AAC/M4A or FLAC at build time (needs an encoder, e.g. ffmpeg, in the pipeline) and decode with `AVAudioFile`, or decode Vorbis in the worker with a WebAssembly decoder (`@wasm-audio-decoders/ogg-vorbis` already works in the Node pipeline; its use inside the NativeScript iOS runtime is unverified). |
| CTC model | `CtcModel.java` + `onnxruntime-android` | `onnxruntime-objc` (or `onnxruntime-c`) CocoaPod via `App_Resources/iOS/Podfile`, and an Objective-C/Swift helper with the same `logProbsToFile` contract. Ship the `.onnx` as a bundle resource. The windowing and column reduction must match `scripts/lib/ctc-model.ts`. |
| RTL window | `decorView.setLayoutDirection` in `main.ts` | Set `UIView.appearance().semanticContentAttribute = .forceRightToLeft` at launch; check navigation-bar mirroring. |
| Fonts | `src/fonts/EzraSIL.ttf` by file name | NativeScript registers fonts by family name on iOS ("Ezra SIL"); the CSS already lists both names. Te'amim placement must be checked visually (CoreText shaping differs from HarfBuzz). |
| Worker access to native APIs | works (Java from worker) | NativeScript iOS workers can call native APIs; ORT and AVFoundation calls from the worker thread must be verified. |
| Backgrounding during recording | stop on `suspendEvent` | Same event; also handle `AVAudioSession` interruptions (phone calls, Siri). |

## What needs macOS to verify

1. `ns build ios` and `ns run ios` on a simulator: UI, RTL, fonts, navigation, persistence.
2. **A physical iPhone or iPad** for anything involving audio: microphone permission, capture quality without AGC, playback latency, the playhead and Yad synchronisation, and ORT performance and memory. The simulator's audio path does not represent a device.
3. App size: the 365 MB model plus ORT. On-demand resources may be needed beyond a POC.
4. An Apple developer account (free is enough) to install on a physical device.

## Effort estimate

Roughly 2–4 developer-days on a Mac:

- recorder, player and permission: about 1 day;
- ORT helper and model packaging: about 1 day;
- reference audio conversion: half a day;
- RTL, fonts and device testing: 1–1.5 days.

The analysis and UI need no changes.
