# בעל קורא: Torah Reading Tutor (POC)

An offline Angular + NativeScript app that teaches Torah chanting (Parashat Bereshit, Israeli Ashkenazi tradition). The flow:

1. A 2D rabbi guides the student in Hebrew.
2. New te'amim are taught inside their phrase.
3. The student hears a real reader with a Yad that follows the words.
4. The student records the whole verse.
5. On-device analysis checks the words (missing, wrong, extra, repeated), the vowels (niqqud), the melody (independent of key) and the phrasing.

There is no server, no account and no runtime network. Recordings never leave the device.

**Status:**
- Android build runs on an emulator. **Not yet run on a physical phone. iOS not built.**
- Analyzers are **experimental**. The app shows a partial diagnostic and never claims a verified pass until the labelled-corpus validation is done.
- See [docs/feature-matrix.md](docs/feature-matrix.md) and [docs/limitations-and-roadmap.md](docs/limitations-and-roadmap.md).

## Prerequisites (Windows, tested)

- Node 24
- NativeScript CLI 9 (`npm i -g nativescript`)
- JDK 17+ (Android Studio's JBR works)
- Android SDK with platform 36, and `ANDROID_HOME` set

Check with `ns doctor android`, then:

```
npm install
npm run fetch-model        # on-device models: 365 MB words + 71 MB phones (optional: without them, word / niqqud checks show "unavailable")
```

The bundled data (`src/data/*.json`, `src/assets/reference/*`, `src/assets/art/*`) is already generated. To regenerate it:

```
npm run import-torah       # Torah text from the Sefaria snapshot in data-src/ (--refresh refetches)
npm run align-reference    # downloads reader recordings from Wikimedia Commons, aligns verse/word timings (~30 min)
npm run build-art          # rabbi + yad PNGs from SVG
```

## Run on an Android phone

1. Enable Developer options and USB debugging, connect the phone, and accept the prompt. `adb devices` should list it.
2. Run `ns run android`, or build and install manually:
   ```
   ns build android
   adb install -r platforms/android/app/build/outputs/apk/debug/app-debug.apk
   ```
   The debug APK is about 500 MB, mostly the word model, so installing takes a minute.
3. Things to check on the phone:
   - first launch (permission);
   - a lesson;
   - a verse reading;
   - airplane mode;
   - backgrounding during recording;
   - about 10 repeated readings.
4. Collect timings with `adb logcat | findstr "EVAL_TIMINGS VALIDATION_RESULT SPIKE_RESULT"`.
5. On-device validation on real recordings: run `npm run make-validation-files` and follow [docs/validation.md](docs/validation.md) §2.

**Windows gotcha:** if the build fails with `'gradlew.bat' is not recognized`, the shell has `NoDefaultCurrentDirectoryInExePath` set. Clear it for the session:

```
Remove-Item Env:NoDefaultCurrentDirectoryInExePath
```

**Network:** release builds request **only** `RECORD_AUDIO`. ONNX Runtime's telemetry provider and network permissions are stripped. The debug-only manifest adds `INTERNET` for `ns run` tooling.

## Tests

```
npm run fetch-test-audio   # one-off: vocadito (CC BY 4.0), CMU ARCTIC, Wikimedia Commons cantillation → test-data/ (~140 MB)
npm test                   # content, teaching, persistence, DSP, evaluation — real audio where it matters
npm run bench              # desktop timings
npm run validate-analyzers # analyzers vs. a second human reader + spliced errors → docs/data/analyzer-validation.json
npm run validate-melody    # melody on real chant: correct readings vs. real wrong-ta'am words → docs/data/melody-validation.json
npm run validate-niqqud    # vowels on real chant: correct readings vs. vowels changed in the text → docs/data/niqqud-validation.json
                           # (needs `npm run align-reference` for the non-bundled readers first)
```

Corpus- and model-dependent tests skip themselves when their data is missing.

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Modules, threads, evaluation pipeline, data contracts, native dependencies |
| [docs/content-and-audio.md](docs/content-and-audio.md) | Text and reference-audio pipelines, measured alignment quality, **replacing the references with professional recordings** |
| [docs/validation.md](docs/validation.md) | Labelled corpus format and procedure, results so far, what is unvalidated |
| [docs/feature-matrix.md](docs/feature-matrix.md) | Requirement-by-requirement status |
| [docs/ios.md](docs/ios.md) | iOS compatibility assessment and what needs macOS |
| [docs/limitations-and-roadmap.md](docs/limitations-and-roadmap.md) | Limitations, risks (incl. patents), roadmap |
| [docs/phase3-audio-spike.md](docs/phase3-audio-spike.md) | Phase 3 spike report |
| [docs/research/offline-hebrew-asr.md](docs/research/offline-hebrew-asr.md) | Offline Hebrew ASR and phoneme research |
| [NOTICE.md](NOTICE.md) | Third-party licences and attribution |
