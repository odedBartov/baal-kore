# Architecture

**Product:** an offline Angular + NativeScript app. All audio processing, analysis and storage happen on the device. There is no backend, no account and no runtime network use.

**Build status:**
- Android is built and running on an emulator. No physical phone has been tested yet.
- iOS is not built. The NativeScript iOS build needs macOS; see [ios.md](ios.md).

## Module map

```
src/app/
  core/            app state & services
    state.ts          persisted contracts (StudentProgress, Settings), schema migrations, unlock rule
    store.service.ts  ApplicationSettings persistence (signals)
    content.service.ts  portion data, reference timings, coverage per verse, Hebrew numerals
    audio.service.ts  the one analysis worker (promise RPC), recorder/player, file layout, caches
    playback.ts       real playback position → word highlight / playhead / yad
    recording.ts      permission, level meter, auto-stop, interruption & backgrounding
  torah/           content model
    hebrew.ts         Unicode classes, graphemes, consonants, spoken form (perpetual qere)
    cantillation.ts   te'amim catalog + context rules + phrase groups
    model.ts          verse/word/syllable/phrase contracts
  audio/           signal processing (pure TS) + platform I/O
    audio-io.{d,android,ios}.ts  recorder/player/permission behind one interface (iOS = stub)
    wav.ts, pitch.ts (YIN), mfcc.ts, align.ts (DTW + contour comparison)
    fbank.ts          Kaldi-compatible 80-dim log mel features for the phone model
    pitch-shift.ts    WSOLA + resampling transposition (validation scripts only; the reader always plays in the original key)
    analysis.worker.ts  every heavy job, off the UI thread
  analysis/        evaluation
    ctc.ts            CTC log-prob reduction, forced alignment, greedy decode
    letters.ts        pronunciation-tolerant letter comparison
    phonemes.ts       pointed word → expected sound slots (Israeli reading; optional sheva, silent matres, Adonai)
    vowels.ts         CTC alignment of the slots to the phone model + per-vowel goodness score
    melody.ts         key-free phrase melody comparison (pitch DTW in a corridor around the content alignment)
    evaluate.ts       analyzers → categories → status (quality gate, words, melody, pauses)
    registry.ts       analyzer maturity: validated / experimental / unavailable
    types.ts          VerseEvaluation, CategoryScore, DetectedError, weights
  teaching/        pedagogy
    lessons.ts        new te'amim → phrase-group lessons
    lesson-check.ts   imitation assessment
    rabbi.ts          deterministic rule engine → Hebrew line + expression
  ui/              rabbi.component, verse-text.component (words + yad)
  visualization/   pitch-chart.component (contours, word ticks, playhead + yad)
  features/        screens (welcome, portions, verse-list, lesson, practice, results, settings)
  spike/           diagnostics (Phase 3 spike + on-device validation runner)
src/data/          bereshit.json, reference-asael-israeli.json, ctc-model.json (generated, versioned)
src/assets/        rabbi/yad PNGs, original reference recordings (.oga)
src/fonts/         Ezra SIL (OFL)
App_Resources/Android/src/main/java/il/co/infraedge/torahtutor/
  PcmRecorder.java  capture thread → WAV      AudioDecoder.java  any format → WAV segment
  CtcModel.java     onnxruntime session, windowed inference, reduced log-probs
  PhoneModel.java   ZIPA phone model session: fbank features in, T×127 log-probs out
scripts/           build-time pipelines (import-torah, align-reference, fetch-model, build-art, validation)
test/              node:test suites on real audio
```

Platform code sits behind `audio-io.d.ts` and the three Java helpers. Everything else is cross-platform TypeScript. The DSP and analysis code has no NativeScript imports, so the same code runs in the device worker and in the Node tests. That parity was verified: the emulator produced the same comparison numbers as Node.

## Threads and data flow

```
UI thread (Angular)          analysis worker (NativeScript Worker)          Java threads
──────────────────           ─────────────────────────────────────          ─────────────
RecordingSession ──start──────────────────────────────────────────────────▶ PcmRecorder thread → attempt.wav
   (polls level 10×/s)
Practice: evaluateVerse ─▶ read WAV (zero-copy) → resample
                           CtcModel.logProbsToFile (ORT, 4 threads) ─────▶ ORT intra-op threads
                           evaluate(): pitch, MFCC, DTW, letters, scoring
                    ◀───── { evaluation, charts, timings } (plain JSON)
Results screen, rabbi rules, StoreService.recordAttempt
Reference: AudioDecoder (Ogg → verse WAV), lesson phrase clips (cutPhrase), contour — all in the worker, cached in temp/
```

Rules that keep this responsive:
- **Capture never waits on JavaScript:** audio is captured on a Java thread.
- **Only small data crosses into JS:** only paths and small results cross the worker boundary. The model's 9,812-column output is reduced to 30 columns in Java, so a 10 s verse is ~15 k floats instead of 20 MB.
- **The model stays loaded:** it is loaded lazily on first use and kept in memory.

## Verse evaluation pipeline (`analysis/evaluate.ts`)

1. **Quality gate.**
   - Blocking problems: silence, too quiet, too short, or the recording stopped before the verse ended. These give `inconclusive / audio-quality` with a Hebrew instruction.
   - Warnings: clipping, background noise.
2. **Words (CTC, experimental).**
   - **Input preparation:** the audio is padded with 0.4 s of silence each side, because the model handles clipped edges poorly.
   - **Reduction:**
     - The 9,812 output tokens are reduced to 30 columns: blank, word separator, the 27 Hebrew letter forms, and the best other token.
     - Each Hebrew column also absorbs the **Latin letters** spelling the same sound. For Ashkenazi-pronounced chant the multilingual model sometimes switches to Latin script, e.g. "alpne moim" = על פני המים.
   - **Comparison:**
     - The free transcription is compared with the verse's *spoken* consonants using pronunciation-tolerant costs (Israeli and Ashkenazi sound merges, plene spelling).
     - Word score is credit-based. Exact = 1, sound-alike = 0.8, a dropped mater lectionis = 0.6, but only if part of the word was heard. A word with no letters heard is "missing".
   - **Errors reported:** missing, different, extra and repeated words. A repeat is reported on the repeated word.
   - **Word timings** come from forced alignment over the expected letters.
2b. **Niqqud (experimental)** — `analysis/phonemes.ts`, `analysis/vowels.ts`, thresholds in `NIQQUD`.
   - **Model.** ZIPA-small CR-CTC (int8, 71 MB, CC BY 4.0) recognises IPA phones; Hebrew was not in its training, but it hears chanted Hebrew vowels (validation below). Features: `audio/fbank.ts` (lhotse/Kaldi defaults, checked end to end on English speech).
   - **Expected pronunciation.** From the pointed text and the havarotjs syllables: one slot per sound, each a set of accepted IPA tokens. Consonants are tolerant (they anchor the alignment; dagesh is not judged). Vocal sheva, א/ה/ע and a glide yod are optional. Silent matres, holam male, shuruk, furtive patah and qamats qatan are handled; the Tetragrammaton is aligned as "Adonai" and not checked.
   - **Checks** (`scoreChecks`, thresholds per check in `NIQQUD`). After one CTC Viterbi alignment of the slots:
     - *Vowel:* best log-probability of the written vowel group minus the best other group, around where it was sung.
     - *Dagesh* (בּ/ב, כּ/כ, פּ/פ; תּ/ת with the Ashkenazi setting) and the *shin dot* (שׁ/שׂ): the written sound against the other one, the same way.
     - *Sheva na / nach,* only where every reader agrees (na: first letter, second of two shevas, dagesh hazaq, identical letters; nach: after a short vowel; and havarotjs must agree). A local re-alignment of the stretch around it, with a short vowel required versus none, says whether a vowel was sounded.
     - Below the threshold it is a finding; one finding per word (its clearest), none on a missing word.
3. **Alignment.**
   - With word timings: word-anchored DTW on MFCCs.
   - Without them: whole-verse DTW.
4. **Melody (experimental)** — `analysis/melody.ts`, settings in `MELODY_CONFIG`.
   - **Key.** The student's key is removed first; it is never an error. The key reference is local (median over ±2 phrases), so slow drift during a verse is not an error either.
   - **Alignment on pitch.** Inside a sung vowel the timbre does not change, so the content alignment (word timings plus MFCC) cannot tell which note of a melisma is which. Per phrase, the two pitch contours are aligned on pitch itself (DTW, 20 ms frames, octave slips folded away). The alignment may stray at most ±240 ms from the content alignment, and every extra warping step costs a penalty, so a wrong note cannot be warped onto a different note of the reference.
   - **Deviation.** Mean semitone distance over every cell of that alignment. Each word also gets its own deviation.
   - **Errors are judged per word, relative to the verse.** A wrong ta'am changes a note or two of one word, while a different but consistent singing style raises every word. A melody error is the phrase's worst word sitting `wordErrorSt` above the verse's median word, or a whole phrase off by `phraseErrorSt` (a safety net for a reading that is off throughout). The error names that word.
   - **No double counting.** At least 50% coverage is required, and there is no verdict where a word is missing.
   - **Chanted at all?** Per-word errors are relative to the verse, so a verse said like a sentence would raise every word equally and pass. Over the whole verse, words matched by their timings and stretched linearly, the student's pitch must rise and fall with the reader's (correlation ≥ `chantMinCorr`) and stay near it (median distance ≤ `chantMaxSpreadSt`, key removed). Otherwise one critical `not-chanted` error replaces the per-word melody errors, the melody score is 0, and "mark as practiced" is not offered.
   - Per-phrase and per-word deviations are kept in `VerseEvaluation.phrases` and `words[].melodyDeviation`.
   - **Lesson check** (`teaching/lesson-check.ts`): the same pitch alignment over the imitated phrase, guided by the MFCC alignment, with the student's take trimmed to where they sing. The phrase is cut out of the verse by `cutPhrase` at the energy dip before each boundary word's aligned start, faded, written to its own file and played whole, so no neighbouring word and no seek/stop latency is heard.
5. **Pauses (experimental).** A stop of 700 ms or more after a conjunctive ta'am or maqaf is flagged. Breathing at disjunctive te'amim is fine.
6. **Categories.**
   - Weights 30/25/30/10/5 (spec §9.1).
   - Niqqud and minor pronunciation are *unavailable*.
   - A definitive score exists only if **every** category is `validated` (`registry.ts`). Today none is, so every reading is `inconclusive / unvalidated-analyzers`, shown as a partial diagnostic.
7. **Mention threshold.** Mistakes are named to the student only at confidence ≥ 0.6. Lower-confidence findings are counted, not named.

## Learning flow

```
Welcome → Portions → Verse list → [Lesson per new phrase group] → Practice → Results
                                                                     ↑ review lesson (rabbi rule) ─┘
```

- **Unlocking:**
  - A verse unlocks when the previous verse is *completed* (verified pass) or *practiced*.
  - The student can confirm "practiced" after a partial diagnostic.
  - The two states are stored separately.
- **Lessons:** they block practice until the new te'amim are mastered. Mastery and failure counts persist.
- **Rabbi:** `teaching/rabbi.ts` holds an ordered rule list. Inputs are the event, the evaluation, the previous attempt and mistake counts. Wording is gender-neutral.

## Persistence (`core/state.ts`)

- **What is stored:**
  - `ApplicationSettings` keys `torah-tutor.progress` (schema v2) and `torah-tutor.settings` (v1).
  - `migrateProgress` and `migrateSettings` accept any stored value and return a valid current object (tested).
- **Recordings:**
  - The latest attempt per verse is kept in `documents/recordings/` (optional; it can be cleared).
  - Lesson and diagnostic takes go to `temp/scratch/`.
  - Decoded reference audio and lesson phrase clips are cached in `temp/reference/`.
- **Reset:** "Reset progress" clears progress, lessons and scores.

## Data contracts (spec §16)

| Spec contract | Where |
|---|---|
| `StudentProgress` (+ `practicedVerseIds`, `lessonFailures`, `lastAttempts`) | `core/state.ts` |
| `PitchFrame` (+ `rmsDb` signal quality) | `audio/pitch.ts` |
| `AudioReference`, `WordTiming` | `core/content.service.ts` `ReferenceVerse` (verse-relative word timings, approval, timing quality) |
| `EvaluationStatus`, `DetectedError`, `CategoryScore`, `VerseEvaluation` (+ `words`, `qualityIssues`, `inconclusiveReason`) | `analysis/types.ts` |
| Hebrew words / syllables / phrase structures | `torah/model.ts` (`WordToken`, `Syllable`, `PhraseGroup`) |
| Audio processing capabilities | `analysis.worker.ts` `CtcStatus` + `analysis/registry.ts` |
| Feedback rules | `teaching/rabbi.ts` `RULES` |
| Asset coverage | `ContentService.coverage()` |
| Alignment maps | `audio/align.ts` `Alignment`, word timings in `WordAssessment` |
| Pronunciation variants | Accepted variants are encoded as tolerated letter equivalences in `analysis/letters.ts`. A per-word phonetic lattice is future work, tied to niqqud analysis. |

## Native dependencies

| Dependency | Licence | Why |
|---|---|---|
| `com.microsoft.onnxruntime:onnxruntime-android:1.31.0` | MIT | Runs the CTC model. Its telemetry provider and network permissions are **stripped** in `AndroidManifest.xml`, and `setTelemetry(false)` is also called. |
| Android `AudioRecord`, `MediaExtractor`/`MediaCodec`, `MediaPlayer` | platform | Capture, decoding, playback |

Release builds request only `RECORD_AUDIO`. This was verified with `aapt2 dump permissions`; the debug manifest alone adds `INTERNET` for `ns run` tooling.
