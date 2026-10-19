# Phase 3 — Audio Technical Spike: Report

**Date:** 2026-10-11 · **Status:** Gate passed for the audio foundation, conditional for speech analysis (see §6).

**Scope:**
- Record voice on Android and extract PCM.
- Detect pitch and display real contours.
- Align two human recordings.
- Benchmark the pipeline.
- Investigate offline Hebrew speech recognition.
- Report which phonetic and cantillation requirements are feasible.

**Reproduce everything in this report:**

```
npm install
npm run fetch-test-audio
npm test
npm run bench
```

## 1. What was built

| Piece | File | Notes |
|---|---|---|
| Native recorder | `App_Resources/Android/src/main/java/il/co/infraedge/torahtutor/PcmRecorder.java` | `AudioRecord` with the `VOICE_RECOGNITION` source (no AGC on most devices). Mono, 16-bit, 16 kHz. Runs on its own Java thread and streams straight into a WAV file. JS only calls start/stop and polls the level. |
| Platform audio I/O | `src/app/audio/audio-io.{d,android,ios}.ts` | Runtime `RECORD_AUDIO` permission, recorder wrapper, `MediaPlayer` playback with position for the playhead. **The iOS file is a stub** (needs macOS to build and test). |
| WAV decode + resampling | `src/app/audio/wav.ts` | PCM 8/16/24/32-bit and float32, any channel count, tolerant of interrupted files. Hann-windowed-sinc resampler. |
| Pitch | `src/app/audio/pitch.ts` | YIN plus energy gating, short-island removal, a 5-frame median, and octave folding. Per frame it outputs time, Hz or null, confidence, voiced, relative semitones, and dBFS. Also recording-level quality: clipping, level, noise floor, voiced ratio. |
| Alignment features | `src/app/audio/mfcc.ts` | 12 MFCCs plus deltas, per-recording mean/variance normalisation, 10 ms grid shared with the pitch frames. |
| Alignment + comparison | `src/app/audio/align.ts` | Full DTW (cosine distance, symmetric steps). Transposition-invariant contour comparison: global offset, then median deviation and share of frames within 1 semitone. |
| Off-UI-thread analysis | `src/app/audio/analysis.worker.ts` | A NativeScript Worker reads the WAVs itself, so only paths go in and small arrays come out. Times every stage. |
| Spike screen | `src/app/spike/*`, `src/app/visualization/pitch-chart.component.ts` | Hebrew RTL. Record/play takes A and B, analyse, and show three contour charts (A, B, and B aligned onto A) with a live playhead driven by the real playback position. Shows per-stage timings and microphone-quality warnings. Logs `SPIKE_RESULT {json}` to logcat. |
| Tests | `test/*.test.ts` | Unit tests on constructed signals, plus accuracy tests on **real human recordings** (§2). |

The DSP is plain TypeScript with no NativeScript imports. The same code runs in Node tests and in the on-device worker. On the emulator, the singing pair produced the same comparison numbers as Node: offset 2.00 st, deviation 0.03 st, 96% within 1 st.

## 2. Accuracy on real human voices

All corpora are dev-time only and never bundled. `scripts/fetch-test-audio.mjs` downloads them and checks vocadito's MD5.

| Corpus | What it is | License |
|---|---|---|
| vocadito (Zenodo 5578259) | 40 solo singing excerpts, 7 languages, f0 annotated by musicians | CC BY 4.0 |
| CMU ARCTIC bdl/rms/slt a0001–a0020 | Same sentences read by 2 male speakers and 1 female, with phone labels | CMU permissive (free for any use) |
| Wikimedia Commons, Parashat Bereshit weekday readings (Gen 1:1–5, 1:6–8, 1:9–13) | **Real Torah cantillation** by two readers: Asael (Ashkenazi and Israeli pronunciation) and Nahum (Ashkenazi) | Asael CC BY-SA 3.0, Nahum CC BY 2.5 |

### 2.1 Pitch tracking (vocadito, recordings resampled to the 16 kHz device rate)

- **Tuning:** parameters were tuned on the 20 odd-numbered excerpts.
- **Held-out:** the 20 even-numbered excerpts are reported here and asserted in `test/voice.test.ts`.

| Metric (held-out, frame-weighted) | YIN as built |
|---|---|
| Voicing recall | **96.2%** |
| Voicing false alarm | 10.8% |
| Raw pitch accuracy (voiced and within 50 cents) | **93.8%** |
| Accuracy when both voiced | 97.6% |
| Octave errors | 0.4% (was 2.5% before octave folding) |
| Overall accuracy | 92.2% |

- **Silence and noise:** they produce no notes. This is unit-tested, and an emulator recording of digital silence came out 0% voiced with a "very quiet" warning.
- **Octave folding:** it was added after the on-device chart showed confident, sustained octave-up runs. These are YIN locking onto the 2nd harmonic. A frame more than 11 semitones from the recording's median is folded by an octave. This assumes a chanted verse spans about an octave (observed p5–p95 range on real cantillation: about ±4.5 st). A wide-range melody would need per-phrase centres.
- **Caveat:** vocadito is pop/folk singing, not cantillation. No f0-annotated cantillation corpus exists that we know of.

### 2.2 Alignment of two different human recordings

**Read speech (CMU ARCTIC).** Phone-boundary error after mapping A's boundaries through the DTW path into B, over 647 boundaries per pair.

| Pair | DTW median | DTW ≤ 50 ms | DTW ≤ 100 ms | Linear stretch, median / ≤ 50 ms |
|---|---|---|---|---|
| bdl → rms (male → male) | 20 ms | 88.4% | 99.4% | 52 ms / 48.4% |
| bdl → slt (male → female) | 19 ms | 77.0% | 89.8% | 77 ms / 33.2% |
| rms → slt (male → female) | 32 ms | 63.4% | 79.0% | 46 ms / 55.3% |

- **Feature choice:** deltas plus cosine distance beat plain MFCC with Euclidean distance on every pair. For rms → slt the mean error fell from 193 to 67 ms.
- **Ruled out:** a Sakoe-Chiba band and silence trimming gave no meaningful gain. A band would also penalise students who pause.
- **Limitation:** rms → slt still has outlier utterances with mean error above the linear baseline. Word-anchored alignment (§4) is the fix.

**Real Torah chanting, two readers (Asael → Nahum, same verses).**
- There are no word labels, so correctness is checked on phrase pauses. Pauses of 250 ms or more fall where the te'amim put them, so a correct alignment maps A's pauses onto B's pauses.
- The linear baseline shows the chance level.

| Passage | DTW: median distance to nearest B pause | Linear stretch |
|---|---|---|
| Gen 1:1–5 | **35 ms** (10/13 within 150 ms) | 547 ms (1/13) |
| Gen 1:6–8 | **75 ms** (6/9) | 294 ms (3/9) |
| Gen 1:9–13 | 135 ms (14/26) | 416 ms (4/26) |
| Gen 1:1–5, same reader, Ashkenazi vs Israeli pronunciation | 60 ms (11/13) | 682 ms (5/13) |

### 2.3 Transposition-invariant melody comparison

**Controlled test.**
- **Setup:** a real sung excerpt resampled to be +2 semitones higher and 12% faster, standing in for "same melody, other key and tempo".
- **Result:** the offset is recovered as **+2.00 ± 0.01 st** and **95–100% of frames fall within 1 st**, against 17–36% for a different melody (5 excerpts).
- **Caveat:** this checks the machinery. It uses one performance, so it says nothing about human variation.

**Real cantillation.** Frame-level agreement after alignment and offset removal:

| Comparison | Median deviation | Frames within 1 st |
|---|---|---|
| Same verses, different readers (Gen 1:1–5 / 1:6–8) | 0.79 / 0.88 st | 58% / 54% |
| Same verses, same reader, Ashkenazi vs Israeli pronunciation | 0.77 / 0.76 st | 60% / 61% |
| **Different verses** (negative control) | 1.32 – 2.06 st | 28% – 42% |

**Finding.** Whole-verse, frame-level contour agreement separates right text from wrong text, but the margin is thin. Even the same reader chanting the same verses twice only agrees on about 60% of frames within a semitone. Ornaments, glides and timing differ between performances, and two "correct" Ashkenazi readings are not frame-identical. **A single whole-verse contour score must not be used for grading.** This matches spec §7.4.

Grading needs:
- word- and ta'am-anchored alignment
- note/plateau segmentation, comparing stable pitch levels and the direction and size of movements per ta'am group rather than raw frames
- tolerances set from labelled data (spec §19)

## 3. Performance

| Where | Workload | Time |
|---|---|---|
| Desktop, Node 24, i7-1355U | 10 s vs 10 s, full comparison (2× pitch + 2× MFCC + DTW) | **0.26 s** (RTF 0.026) |
| Desktop | 30 s vs 30 s | 1.24 s. The DTW matrix is 45 MB and is O(n·m). |
| Android emulator (x86_64, Android 16, same PC) | 3.2 s vs 3.4 s speech, wall-clock including the worker round trip | 0.55 s |
| Android emulator | 35 s vs 31 s singing | 4.0 s (pitch 0.6–1.7 s per take, the first including JIT warm-up; DTW 1.0 s) |
| **Physical Android device** | — | **Not measured yet.** No device was connected (§7). |

- **Expected cost on a phone:** emulator numbers are not phone numbers. An ARM phone is expected to be 2–4× slower than this desktop, so about 1 s for a typical 10–15 s verse. That is acceptable in a worker with a spinner.
- **Speed-ups if needed:** the YIN difference function is the hot spot and can move to the FFT form, about 4× fewer operations. DTW memory needs a band only for verses well over 30 s.
- **UI thread:** recording and analysis keep the UI responsive. Capture runs on a Java thread and DSP in a worker.
- **Charts:** rendering about 900 dot views is noticeable but acceptable for the spike. Phase 7's animated Yad should use a native canvas.

## 4. Offline Hebrew speech recognition: findings

Full sourced research is in [research/offline-hebrew-asr.md](research/offline-hebrew-asr.md). Main points:

1. **No usable Hebrew ASR model outputs niqqud.** Whisper, the ivrit-ai fine-tunes, wav2vec2-he, GigaAM-He and Omnilingual all emit consonantal text. That text cannot reveal vowel errors (spec §8.1 already anticipates this).
2. **Whisper-style models are wrong for error detection.** Their decoder language model tends to "repair" what the student actually said, and they expose no frame posteriors. Stock tiny/base/small also score poorly on Hebrew (FLEURS WER 72 / 62 / 44).
3. **The feasible path is CTC.** A CTC acoustic model gives frame-level posteriors, and because the verse text is known in advance:
   - **CTC forced alignment** (about 100 lines, reimplementable in TS or Java) gives word and syllable time anchors. It also detects omitted or substituted words by comparing the score of the expected token path against a free path, with a wildcard token for extra speech.
   - **Goodness of Pronunciation (GOP)** on a phone-level CTC model gives per-vowel evidence. The expected-vs-alternative vowel likelihood ratio is the niqqud check.
4. **Candidate models (license-checked):**
   - **Universal phone CTC:** `anyspeech/zipa-small-crctc` (64M params, **int8 ONNX 70.7 MB**, weights CC BY 4.0, code MIT). Fallback: `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0, about 318 MB int8, estimated). **Hebrew is zero-shot for both, so accuracy is unknown until measured.**
   - **Hebrew consonantal CTC for word checks:** Omnilingual ASR CTC-300M (Apache-2.0, sherpa-onnx int8 365 MB, Hebrew supported).
   - **Disqualified by license:** Meta MMS and its aligner weights (CC BY-NC), Allosaurus and espeak-ng (GPL-3.0), ZIPA "NS" variants (NC-SA). Vosk has no Hebrew model.
5. **Runtime.** There is no NativeScript ONNX plugin. `com.microsoft.onnxruntime:onnxruntime-android` (MIT) can be added in `App_Resources/Android/app.gradle` and driven from a small Java helper, the same pattern as `PcmRecorder`. On iOS: the `onnxruntime-objc` pod.
6. **G2P.** Rule-based G2P from fully pointed text is realistic. `havarotjs` and `hebrew-transliteration` are MIT TypeScript libraries that handle syllabification, vocal sheva, qamatz qatan and dagesh. The te'amim mark stress, so stress expectations come from the text. The G2P should emit a **lattice of accepted pronunciations** (Ashkenazi and Modern Israeli) so that a correct modern pronunciation can pass (spec §8.2).

## 5. Feasibility of the phonetic and cantillation requirements

| Spec requirement | Status after the spike | Basis |
|---|---|---|
| §7.1 Microphone → PCM on Android | **Working** on the emulator (Android 16). WAV header and content verified. **Physical device pending.** | §1, §7 |
| §7.1 Permission, interruption, cancellation | Permission prompt verified on the emulator. Denial and backgrounding paths are coded but not yet exercised. | — |
| §7.2 Pitch extraction with confidence, voicing and no fabricated notes | **Feasible, validated** on real singing (§2.1). Not yet validated on f0-annotated chant (no such corpus). | §2.1 |
| §7.3 Alignment of two recordings with different timing | **Feasible.** Validated on cross-speaker speech, and at phrase level on real chant by two readers. Word-level accuracy on chant is unmeasured. | §2.2 |
| §6.4 / §7.4 Different absolute pitch must not be penalised | **Feasible, validated.** The global offset is removed exactly. | §2.3 |
| §7.4 Contour comparison (direction, intervals, peaks, phrase endings) | **Partially feasible.** Whole-verse frame agreement discriminates only weakly. Per-ta'am, note-level comparison over word-anchored alignment is required. Its accuracy is **unknown until a labelled corpus exists** (spec §19). | §2.3 |
| §8.4 Cantillation (te'amim) assessment | **Experimental.** The melody signal is measurable and alignable. A pass/fail per ta'am needs reference templates per tradition, word anchors and labelled student errors. Must ship labelled "experimental" until validated. | §2.3, §4 |
| §8.5 Pauses | **Feasible.** Pauses are detected from voicing and energy and align across readers. Expected pause positions come from the disjunctive te'amim. Thresholds for "hesitation" vs "wrong phrasing" are unvalidated. | §2.2 |
| §8.1 Word accuracy (missing, extra, wrong, repeated) | **Not implemented. Likely feasible** via CTC forced alignment with a Hebrew CTC model. On-device latency and APK size are unmeasured. | §4 |
| §8.2 Niqqud / phonetic accuracy | **Not implemented. Uncertain.** The only license-clean path is a zero-shot universal phone model plus G2P plus GOP. Vowel discrimination on Hebrew children's chanting must be measured before anything is promised. | §4 |
| §8.3 Stress (mil'el / milra) | **Not implemented. Uncertain.** Needs syllable alignment (from the phone CTC) and intensity, duration and pitch features. Expectations are known from the te'amim. | §4 |
| §8.6 Uncertainty and "cannot determine" | Designed in. The pitch frames carry confidence and voicing, and quality warnings exist. Analysers that do not exist yet must report "unavailable" rather than a score. | — |
| Microphone-quality feedback | Heuristic warnings (clipping, too quiet, background noise, no voice). Thresholds are unvalidated and need the noisy, clipped and silent items of the spec §19 corpus. | `audio-spike.component.ts` |

## 6. Gate decision

- **Proceed** with capture, pitch, alignment, transposition-invariant comparison, and worker-based processing as the audio foundation. These are implemented and tested on real voices.
- **Before Phase 5 scoring design, run spike 3b** (it fits in this phase's budget):
  - onnxruntime-android plus ZIPA-small (int8) in the Java helper
  - CTC forced alignment of Gen 1:1–5 against vocalized text from the Commons recordings
  - measure phone and vowel accuracy, word-boundary accuracy, latency on the phone, and APK size growth
  - its outcome decides whether niqqud, stress and word checks can be "validated" or must ship as "experimental" or "unavailable"
- **Do not design a whole-verse melody score.** Design per-ta'am, note-level comparison over word anchors, and collect the labelled corpus (spec §19) early. The tolerances cannot be set without it.

## 7. Open items needing you

1. **Physical Android device run.** Enable USB debugging, connect the phone, then run `ns run android` (or install the APK, see README). Then:
   - Record the same verse twice, the second time higher or faster.
   - Deny the permission once, then retry.
   - Background the app mid-recording.
   - Repeat the recordings about 10 times (leak and stability check).
   - Repeat in airplane mode.
   - Send the `adb logcat | findstr SPIKE_RESULT` lines. They hold the device model and per-stage timings for §3.
2. **Reference audio candidates.** The Commons recordings (Asael CC BY-SA 3.0, Nahum CC BY 2.5) and PocketTorah (CC BY-SA 3.0, archive.org) are human Ashkenazi readings. They could become approved references only after expert review.
   - BY-SA means derived audio clips stay BY-SA. That is compatible with an app but must be attributed.
   - The two readers' melodies differ measurably (§2.3). Pick **one** reader per tradition.
3. **Freedom to operate.** The research surfaced US patents on comparing a student's Bible chanting with model recordings (US11062615 family, priority 2011, listed as expired–fee related). Have counsel confirm before any distribution.

## 8. Engineering decisions and assumptions

- **Audio format:** 16 kHz mono 16-bit WAV for student audio. Other rates are resampled in the worker.
- **No speed-change transposition:** pitch adaptation of the reference (Phase 4) will not use playback-speed change. The comparison is offset-invariant anyway.
- **Chart time axis runs right to left** so that contours line up under the Hebrew text in Phase 7. Out-of-range points are hidden, not clamped (a clamped dot would be a note nobody sang).
- **No network in release:** release builds have no `INTERNET` permission. The debug manifest adds it only for `ns run` tooling.
- **Own DSP instead of a library:** YIN, MFCC and DTW were reimplemented rather than taken from a library. The usual Java DSP library, TarsosDSP, is GPL-3.0. These are small standard algorithms, now tested against annotated real audio.
- **iOS:** the audio I/O is not implemented and has never been built. Everything else is cross-platform TypeScript.
