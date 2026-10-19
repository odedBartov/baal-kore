# Validation: dataset, procedure, results

Three things live here:

1. the **labelled student corpus** the spec requires (§19). It does not exist yet and needs human recordings plus a qualified Torah reader;
2. the procedure that promotes an analyzer from `experimental` to `validated` and so unlocks definitive scores;
3. the **engineering validation already done** on real human chanting.

## 1. Labelled corpus format (spec §19)

The corpus is a folder of WAV files plus one `corpus.json` manifest:

```jsonc
{
  "schemaVersion": 1,
  "tradition": "ashkenazi-israeli",
  "labelledBy": "name / qualification of the Torah reader who labelled it",
  "items": [
    {
      "file": "Genesis.1.1__s07__wrong-vowel.wav",   // 16 kHz+ mono WAV; any rate is resampled
      "verseId": "Genesis.1.1",
      "speaker": { "id": "s07", "age": 12, "voice": "unchanged", "consent": "parental" },
      "device": "Pixel 7, app recorder",
      "conditions": ["quiet"],                       // quiet | background-noise | clipped | far-mic
      "category": "incorrect-vowel",                 // one of the 18 situations below
      "expected": {
        "status": "failed",                          // passed | failed | inconclusive
        "errors": [
          { "category": "niqqud", "wordIndex": 1, "severity": "major", "note": "בָּרָא read as בָּרֶא" }
        ]
      },
      "notes": "free text"
    }
  ]
}
```

The 18 situations the corpus must cover, with what the app should do in each:

| # | Situation | Expected app behaviour |
|---|---|---|
| 1 | correct reading | no errors (a pass once the analyzers are validated) |
| 2 / 3 | higher / lower key | no errors; the key offset is reported, not penalised |
| 4 / 5 | faster / slower | no errors |
| 6 | acceptable modern pronunciation | no errors |
| 7 | incorrect word | `word-different` at that word |
| 8 | omitted word | `word-missing` |
| 9 | extra word | `extra-speech` |
| 10 | repeated word | `word-repeated` |
| 11 | incorrect vowel | niqqud error *(analyzer unavailable today)* |
| 12 | wrong stressed syllable | stress error *(analyzer unavailable today)* |
| 13 | wrong cantillation melody | `melody` at that word (or at the phrase, when it is sung at the wrong height) |
| 14 | wrong pause | `pause-inside-phrase` |
| 15 | background noise | quality warning; maybe inconclusive |
| 16 | silence | `inconclusive / audio-quality` |
| 17 | clipped / distorted | quality warning |
| 18 | incomplete recording | `inconclusive / audio-quality` ("stopped before the end") |

**Collection rules:**
- Record **in the app** on the target phones. Real children and adults, with consent, covering several voice types.
- At least **3 speakers × 10 verses** per situation where it applies.
- Labels come from a qualified Torah reader, **blind** to the app's output.
- Keep a **held-out** half that is never used to tune thresholds (spec: no training/validation overlap).

## 2. Running a corpus and promoting an analyzer

**On a phone** (this measures real latency too):

1. Copy WAVs named `<verseId>__<anything>.wav` into the app's `files/validation/` folder:
   ```
   adb push X.wav /data/local/tmp/
   adb shell "cat /data/local/tmp/X.wav | run-as il.co.infraedge.torahtutor sh -c 'cat > files/validation/X.wav'"
   ```
2. Open **Settings → בדיקת שמע טכנית → בדיקת קבצים**.
3. Each file runs through exactly the student pipeline. Collect the logged lines with `adb logcat | findstr VALIDATION_RESULT`.
4. Tap a result to open the normal results screen for that file.

**On a PC:** `scripts/validate-analyzers.ts` shows how to run the same `evaluate()` in Node over many files; extend it to read `corpus.json`.

**Acceptance rule (proposed; to be agreed with the Torah expert).** An analyzer may be set to `validated` in `src/app/analysis/registry.ts` when, on the **held-out** half:

- detection ≥ 90% for its error types;
- false alarms ≤ 2% of words (or phrases) on correct readings, *for errors shown to the student* (confidence ≥ 0.6);
- no false alarms in situations 1–6.

Only when **every** category is validated does the app compute a definitive score and allow "passed" (spec §9.2). Until then results are labelled "בדיקה חלקית".

## 3. Engineering validation done so far (real human audio)

These are **not** the labelled student corpus.

- The "students" are adult readers, plus **edits of their real recordings**: a word deleted, repeated or replaced, or a phrase re-pitched.
- The edits test the detectors on real voice and real chant, but they are cleaner than real student mistakes.
- Accuracy for real children's errors remains **unmeasured**.

| Check | Data | Result | Source |
|---|---|---|---|
| Pitch tracking | vocadito, 20 held-out sung excerpts (musician-annotated f0) | raw pitch accuracy **93.8%**, voicing recall 96.2%, false alarm 10.8%, octave errors 0.4% | `npm test` |
| Alignment, speech | CMU ARCTIC, 3 speaker pairs, 1,941 phone boundaries | median 19–32 ms; ≤ 50 ms for 63–88% | `npm test` |
| Alignment, real chant | Asael vs. Nahum, Gen 1:1–8 | phrase pauses land 35–75 ms from the true pause (linear stretch: 294–547 ms) | `npm test` |
| Reference word timing | Asael vs. Nahum, all of Bereshit, 1,336 words | CTC and DTW agree: median **20 ms**, 85% ≤ 100 ms, 95% ≤ 250 ms | `align-reference` |
| Transposition | real singing, ±3/4 semitones | interval within 0.01 st; 98–99% of frames within ±0.5 st | `npm test` |
| Self-check | Asael's own reading vs. his reference (Gen 1:1, 1:3) | no word or melody errors | `npm test` |
| **Analyzers vs. a second reader + spliced errors** | Nahum (Ashkenazi pronunciation) vs. Asael reference | see `docs/data/analyzer-validation.json` and the table below | `npm run validate-analyzers` |
| **Melody on real chant** | correct readings (same singer, another singer) vs. real wrong-ta'am words | see `docs/data/melody-validation.json` and the section below | `npm run validate-melody` |

### Analyzer validation results (`npm run validate-analyzers`, 2026-10-11)

**Setup.**
- **Students:** Nahum, a second adult reader with Ashkenazi pronunciation and a fairly noisy recording, reading the verses correctly. Errors were spliced into his real audio.
- **Reference:** Asael.
- **Verses:** 51 cleanly aligned verses (684 words, 375 phrases), plus 24 cases per spliced error type.

**Final thresholds** (`THRESHOLDS` in `analysis/evaluate.ts`) were chosen from the sweeps in `docs/data/analyzer-validation.json`. The same data was used to choose and to report them, so treat these as optimistic engineering numbers.

**False alarms on correct readings:**

| Measure | Result |
|---|---|
| Words flagged | **2.6%** (shown to the student at confidence ≥ 0.6: 2.2%) |
| Phrases flagged for melody | **3.5%** |
| Pause or extra-speech flags | none |
| Median "words" category score | 88 |

**Detection of spliced errors:**

| Error | Caught at the right word / phrase |
|---|---|
| Word deleted | **79%** |
| Word replaced by another verse's word | **71%** |
| Word repeated | **25%** (weak) |
| Phrase sung +4 semitones (WSOLA re-pitch) | **42%** (63% at that phrase or its neighbour). The re-pitched audio also confuses the word model: about 1.6 extra word flags per case |

**Lesson check:** a different reader singing the same phrase passes **60%** of the time; a different phrase passes 16%.

**On the Android emulator** (x86_64, same pipeline as the phone, diagnostics runner): **2.6–5.5 s per verse**, of which CTC is 2.1–3.5 s for 5–8 s of audio. **Physical phones are not yet measured.**

**What changed along the way.** The first run exposed three problems:

1. **Script switching.** The multilingual model wrote Ashkenazi-pronounced chant in **Latin letters** ("alpne moim" = על פני המים). Latin letters now count toward the matching Hebrew letter.
2. **Clipped audio.** It transcribed clipped audio poorly. Audio is now padded with 0.4 s of silence.
3. **Deleted words looked fine.** A deleted word with several vowel letters (אלהים) still scored as acceptable. Word scores are now credit-based: nothing heard means missing.

| Measure | First run | Final |
|---|---|---|
| False word flags | 9.2% | 2.6% |
| Deleted words caught | 38% | 79% |
| Repeated words caught | 0% | 25% |
| Lesson check: same / different phrase pass | 12% / 0% | 60% / 16% |

**Reading these numbers.**
- Adult chant with spliced errors is far cleaner than a 12-year-old's real mistakes.
- Correct readings still drew 15 false word flags shown to the student across 51 verses, up to about 30% of verses.
- Hence every analyzer stays `experimental`, and the app never turns them into a pass/fail.


### Melody validation on real chant (`npm run validate-melody`, 2026-10-15)

The first melody numbers above rest on a synthetic error (a whole phrase digitally re-pitched). A real cantillation mistake is different: the student sings a word with **another ta'am's tune**. This validation uses only real chant.

**Setup.**
- **Reference:** Asael, Israeli-pronunciation session (the bundled reader), 140 cleanly aligned verses.
- **Correct, same melody:** Asael's second session (Ashkenazi pronunciation), 87 verses. Same singer and tradition, sung on a different occasion.
- **Correct, another singer:** Nahum, 102 verses. Same tradition, but his own way of singing it.
- **Wrong ta'am:** 85 cases. In Asael's second session, a word inside a verse is replaced by **the same word sung with a different ta'am** elsewhere in Bereshit. All 85 involve a disjunctive ta'am.
- **No tuning on the reported data.** Thresholds are chosen on even verses, and only from correct readings. Results are reported on odd verses. The wrong-ta'am cases never influence a threshold.

**How different is a wrong ta'am, really?** Compare the singer's own two renditions of the same word directly. They differ by a median of only **0.9 semitones**, while two correct sessions of the same singer differ by 0.6. Most te'amim share most of their notes on a given word; they part ways on one or two. This is why the old phrase-average comparison missed most of them.

**What changed in the analyzer** (`analysis/melody.ts`, `MELODY_CONFIG`):
1. **Pitch alignment.** Notes are aligned on pitch inside a ±240 ms corridor around the word alignment, instead of reading pitch at MFCC-aligned frames (MFCCs cannot place notes inside a sung vowel).
2. **Local key.** One vote per neighbouring phrase, so slow drift is not an error and a wrong phrase cannot set its own key.
3. **Per-word judgement.** Each phrase's worst word is compared with the verse's typical word, and the error names that word.
4. **Key shift.** A phrase sung above or below its neighbours is caught directly.

**Methods compared** (held-out half; each threshold set for ≤ 3% false alarms on correct same-melody phrases of the tuning half; phrases with ≥ 50% coverage):

| Method / criterion | False alarms, same melody | False alarms, another singer | Wrong ta'am detected |
|---|---|---|---|
| Frames, one key, phrase median (the old analyzer) | 5.5% | 14.2% | 33% |
| Pitch alignment, local key, phrase deviation | 3.1% | 20.8% | 30% |
| Pitch alignment, local key, worst word | 2.7% | 13.9% | 33% |
| **Pitch alignment, local key, worst word vs. the verse's typical word** | **3.4%** | **9.7%** | **52%** |

Also tried, and no better at equal false alarms:
- one global key;
- corridors of ±120 / ±400 ms;
- step penalties 0.5 and 2.

**What the app reports** (held-out half, all phrases, the shipped thresholds):

| Phrases | Old analyzer | New: flagged | New: shown as ✗ (confidence ≥ 0.6) |
|---|---|---|---|
| Correct, same melody (279) | 4.7% | 4.7% | 1.4% |
| Correct, another singer (348) | 6.9% | 10.6% | 4.6% |
| **Wrong ta'am (34)** | **21%** | **53%** | **21%** |

Notes on these numbers:
- Across all 85 wrong-ta'am cases (both halves), the new analyzer flags 44%.
- The held-out half is small (34), so treat 53% as roughly 45–55%.
- Lower-confidence flags appear on the results screen as "?" rather than ✗.

**Synthetic check** (`validate-analyzers`): a phrase digitally re-pitched by +4 semitones is caught at that phrase in **72%** of cases (18 of 25). The old analyzer caught 42%.

**Lesson check** (one phrase imitated right after the demonstration; 24–29 held-out cases per row):

| Tolerance | Correct, reference singer passes | Correct, another singer passes | Wrong ta'am passes (should fail) |
|---|---|---|---|
| Old analyzer, tolerance 1.03 | 85% | 34% | 53% |
| New, 0.75 | 86% | 50% | 21% |
| **New, 1.0 (default)** | **97%** | **80%** | **63%** |
| New, 1.25 | 100% | 95% | 92% |

The lesson gate is deliberately lenient: a wrongly failed lesson blocks the student. It catches only about a third of single-word ta'am mistakes. A lesson phrase has no surrounding verse to compare one word against, so the verse check is where these mistakes are reliably named.

### Niqqud: vowel quality on real chant (`npm run validate-niqqud`, 2026-10-19)

**Model.** ZIPA-small CR-CTC (int8, CC BY 4.0), a universal IPA phone recogniser. Hebrew was not in its training. Its features (`audio/fbank.ts`) were checked end to end: CMU ARCTIC sentence 1 comes out as "ɔθə˞ əv ðə deɪndʒə˞ tɹeɪl fɪlɪp stilz ɛtsɛtəɹə". On chant, Gen 1:2 comes out as "…tohu vavɔhu vexoʃex al pene tehom veruwax elohim meraxefet…".

**Method.** Every written vowel of real readings is scored against the expected pronunciation. There are no labelled student mistakes yet, so wrong vowels are made the standard way: for every vowel of the Israeli-pronunciation reader (every 4th verse), the written vowel is replaced in the text by each of the other four vowel qualities, the verse is re-aligned and the changed vowel scored. The audio stays real chant. The threshold is chosen from correct readings of even verses only; false alarms are reported on odd verses.

| At the shipped threshold (−2.5) | Rate |
|---|---|
| Correct vowels flagged, Israeli reader (1,960 held-out) | 0.3% |
| Correct vowels flagged, Ashkenazi readers with the Ashkenazi setting (2,702) | 0.5% |
| … the same readers with the Israeli setting | 8–17% (kamatz "o", holam "oi") |
| Correct verses with any flag, Israeli reader | 7% |
| Substituted vowels caught (4,096) | 89% (named to the student, confidence ≥ 0.6: about 84%) |

Weakest substitutions: i read as e (74% caught at −2), a as e (82%). Every other pair is 84–99%.

Limits: substituting the text is cleaner than a real student's half-right vowel; only adult professional readers.

**Sheva, dagesh and the shin dot** (same run, same split; shipped thresholds in `NIQQUD`):

| Check | What counts as wrong | Wrong caught | Correct flagged: Israeli reader | Correct flagged: Ashkenazi chanters |
|---|---|---|---|---|
| Dagesh (בּ/ב, כּ/כ, פּ/פ) | the text asks for the other sound | 92% | 0.3% | 0–3% (Nahum sounds some rafe ב/כ close to b/k) |
| שׁ / שׂ dot | the text asks for the other sound | 95% | 0% | 0% |
| Sheva na skipped | a real sheva-nach position (no vowel sung) judged as na | 89% | 0% | 7–10% |
| Sheva nach sounded | a real sheva-na position (vowel sung) judged as nach | 93% | 0% | 0% |

The Ashkenazi chanters' "sheva na skipped" rate is the open question: they may really drop some shevas, or the model may miss short vowels in their style. Decide on labelled recordings before trusting it for Ashkenazi readers.

- Sheva is judged only where readers agree: na on the first letter, the second of two shevas, under dagesh hazaq or before an identical letter; nach after a short vowel; havarotjs must agree. A sheva after a long vowel or a meteg is not judged.
- **Not under ו and י:** the reader's few "skipped" flags were nearly all וְ / יְ, which glide into the next sound in chant; those are left out.
- Spoken Hebrew (Windows TTS, Israeli speech) gets "sheva na skipped" on about a third of its shevas, as expected of everyday speech.

### Spoken instead of chanted (2026-10-19)

**Problem.** Melody errors are judged per word *relative to the verse*, so a verse said like an ordinary sentence raised every word equally and drew no error: spoken readings scored 41–86 on melody (median 65), overlapping another real singer (Nahum, median 74).

**Data.** 37 verses spread over Bereshit, Asael (bundled) as the reader. Chanted: Asael's second session and Nahum. Spoken: the Windows Hebrew TTS voice (Asaf) reading each verse at normal and 0.6× rate, through the full pipeline (CTC included); and real human read speech (CMU ARCTIC, 3 speakers) mapped word by word onto each verse at 0.6× and 1× its duration, for pitch only.

**Check** (`MELODY_CONFIG.chantMinCorr` / `chantMaxSpreadSt`). Over the whole verse, words matched by timing and stretched linearly: correlation of the student's pitch with the reader's, and the median semitone distance after removing the key. Spoken if correlation < 0.25 or distance > 1.65 st.

| Readings | Flagged as not chanted |
|---|---|
| Asael, second session (34 usable verses) | 1 (a verse whose test alignment is broken) |
| Nahum, another singer (37) | 1 (distance 1.69 st) |
| TTS, normal rate (27; 10 more already stop at "the recording ended early") | 27 |
| TTS, 0.6× rate (37) | 37 |
| Real read speech, pitch only (74) | 89–95% |

Not used for lessons: on a single phrase the same measures flag 30–40% of correct phrases by another singer.

Threshold sources are TTS and English speech, not Hebrew-speaking students reading a verse; confirm on the labelled corpus.

**Reading these numbers.**
- The new analyzer finds about **2.5×** as many wrong-ta'am words as the old one, with the same false-alarm rate on correct same-melody readings.
- A student who learned a different valid melody (here: Nahum) gets more flags than before: 10.6% of phrases, 4.6% shown as ✗.
- Half of the realistic ta'am mistakes still go unflagged. Most of them differ from the right tune by less than a semitone on average (detection: 40% below 1 st of true difference, 48% between 1 and 2 st).
- Children, and genuine (not spliced) mistakes, are still unmeasured. The analyzer stays `experimental`.

## 4. What remains unvalidated

- **Words:**
  - accuracy on children's voices;
  - accuracy on genuine misreadings (as opposed to spliced audio);
  - very fast or very slow readers.
- **Melody:**
  - real student melodic mistakes (the wrong-ta'am cases are spliced from an adult's correct chant);
  - children's voices and pitch accuracy;
  - te'amim mistakes between two conjunctive te'amim (none in the test set);
  - other Ashkenazi melodic sub-traditions: one other singer measured (10.6% of his correct phrases flagged).
- **Pauses:** the 700 ms threshold.
- **Niqqud, stress, minor pronunciation:** no analyzer exists. The path is a universal phone recognizer plus G2P plus GOP (see `research/offline-hebrew-asr.md`).
- **Microphone-quality thresholds:** need situations 15–18.
- **Lesson tolerance:** the 1.0 default, measured on adult imitations only.
