# Supported-feature matrix

**Legend:**
- ✅ works, with evidence;
- 🧪 works but **experimental** (not validated against labelled student data);
- ⏳ built, not yet verified on a physical device;
- ❌ not available;
- 📝 needs human review.

**Test environment:** Windows 11 PC, Android 16 emulator (x86_64). **No physical phone has been tested.**

## Non-negotiable requirements (spec §2)

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 1 | Angular + NativeScript | ✅ | Angular 22, NativeScript 9 |
| 2 | Works fully offline | ✅ | Release manifest requests only `RECORD_AUDIO` (aapt2 dump); no network code. Airplane-mode run on a phone ⏳ |
| 3 | No cloud, server, external API or telemetry | ✅ | onnxruntime's telemetry provider and network permissions are **stripped**, and `setTelemetry(false)` is called |
| 4 | No paid SDKs | ✅ | Every dependency is MIT, Apache-2.0, OFL or CC (see NOTICE.md) |
| 5 | Recordings stay on device | ✅ | Files in app storage only; deletable in settings |
| 6 | Hebrew instructions | ✅ | All UI and rabbi text is Hebrew |
| 7 | Full RTL | ✅ | Native window mirrored; verified on the emulator |
| 8 | Exact letters, niqqud, te'amim | ✅ 📝 | MAM edition kept verbatim (tested against the snapshot); Ezra SIL font. Review against a printed tikkun pending |
| 9 | Bereshit 1:1–6:8, 146 verses | ✅ | `test/content.test.ts` |
| 10 | Whole portion navigable | ✅ | Verse list, sequential unlock |
| 11 | Accuracy on a representative subset | 🧪 | Engineering validation on real chant ([validation.md](validation.md)); labelled student corpus not yet collected |
| 12 | Extensible to portions and traditions | ✅ | Portion JSON pipeline, `traditionId`, reader JSON, analyzer registry |
| 13 | No accounts | ✅ | |
| 14 | Local progress + reset | ✅ | Schema-versioned, migration tested; reset in settings |
| 15 | Real recording, playback, pitch analysis | ✅ ⏳ | Emulator: recording pipeline, playback, analysis. Real-voice capture on a phone ⏳ |
| 16 | Confidence and uncertainty exposed | ✅ | Per category and per error; `inconclusive` states |
| 17 | Runs on a physical Android device | ⏳ | Not yet; see README "Run on a phone" |
| 18 | Minimal Android coupling | ✅ | Platform code behind `audio-io.d.ts` + 3 Java helpers; everything else is shared TypeScript |
| 19 | Unvalidated audio never shown as approved | ✅ | Every reference is labelled "ממתינה לאישור מומחה" |
| 20 | Android not presented as iOS | ✅ | iOS untested and stated as such ([ios.md](ios.md)) |

## POC features (spec §3.1)

| Feature | Status | Notes |
|---|---|---|
| Complete Bereshit text | ✅ 📝 | 146 verses, 1,931 tokens, syllables and stress |
| Chapter / verse navigation | ✅ | |
| Persistent progress | ✅ | |
| Reference audio playback | ✅ 📝 | Real human reader (Asael, CC BY-SA), all 146 verses, pending review |
| Pitch analysis + visualisation | ✅ | Karaoke contour, right-to-left time, word ticks, playhead |
| Microphone recording | ✅ ⏳ | Java capture thread, 16 kHz WAV |
| Synchronisation and comparison | ✅ 🧪 | Word-anchored DTW; reference word timing cross-checked (median 20 ms) |
| Real feedback and scores | 🧪 | Category scores from real analyzers; **no definitive overall score until validated** |
| New-ta'am detection | ✅ | 22 te'amim, 19 lessons across the portion |
| Interactive te'amim lessons | ✅ 🧪 | Demonstration from the real reader; the reader's and the student's melody are both drawn after a take; imitation check experimental (lenient) |
| Animated 2D rabbi | ✅ | 6 expressions, blinking, talking, idle motion |
| Configurable passing threshold | ✅ | Applies once analyzers are validated |
| Settings | ✅ | No key/voice tuning: the reader plays in the original key, the student sings in any key |
| Offline operation | ✅ ⏳ | Airplane-mode test on a phone pending |
| Audio validation tests | ✅ | `npm test`, `validate-analyzers` |

## Analysis capabilities (spec §8)

| Analyzer | Status | Notes |
|---|---|---|
| Audio quality (silence, too quiet, short, incomplete, clipping, noise) | ✅ 🧪 | Thresholds heuristic |
| Words: missing / different / extra / repeated | 🧪 | On-device CTC (Omnilingual 300M int8, 365 MB). On a second reader + spliced errors: deleted 79%, substituted 71%, repeated 25% caught; 2.6% of correct words falsely flagged ([validation.md](validation.md)) |
| Niqqud / vowel accuracy | 🧪 | On-device phone model (ZIPA-small, 71 MB) + expected pronunciation from the pointed text + per-vowel score; Israeli or Ashkenazi pronunciation (setting). Real chant: 0.3% of correct vowels flagged, 89% of substituted vowels caught. Also sheva na skipped / nach sounded (89% / 93% caught), dagesh in ב כ פ (92%) and the shin dot (95%), each at ≤ 0.3% false alarms on the Israeli reader (Ashkenazi chanters: sheva na 7–10%) ([validation.md](validation.md)) |
| Consonant / dagesh distinctions | 🧪 / ❌ | Dagesh in ב כ פ and the shin dot are checked (niqqud); other merged sounds (ח/כ, ט/ת, ע/א) deliberately tolerated |
| Stress (mil'el / milra) | ❌ | Expected stress is in the data; no acoustic analyzer yet |
| Cantillation melody per word | 🧪 | Key-free pitch alignment; names the off-tune word. Real chant, held out: finds 53% of wrong-ta'am words (was 21%); flags 4.7% of correct same-melody phrases, 10.6% for another singer. A verse said instead of chanted gets one `not-chanted` error (37 verses: all spoken readings, 1 of 37 by another singer) |
| Pauses / phrasing | 🧪 | Stops inside conjunctive phrases |
| Uncertainty / "cannot tell" | ✅ | Every analyzer can return `unavailable` or `inconclusive` |

## Screens (spec §13)

| Screen | Status | Notes |
|---|---|---|
| A Welcome | ✅ | Continue button for returning students |
| C Portions | ✅ | Future portions shown disabled |
| D Chapter & verse list | ✅ | Completed vs. practised, current position, last result, reference status |
| E Lesson | ✅ | |
| F Practice | ✅ | |
| G Results | ✅ | Two charts, playback with Yad |
| H Settings | ✅ | Includes analyzer status and attributions |
| + Diagnostics | ✅ | Phase 3 spike + on-device validation runner |

## Yad (spec §10.4)

| Requirement | Status |
|---|---|
| Follows the current word, driven by real timing | ✅ |
| Marks the current point on the melody | ✅ |
| Present for reference and student playback | ✅ |
| Syllable-level tracking | ❌ (word-level only) |
