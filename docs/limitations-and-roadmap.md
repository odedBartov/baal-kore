# Known limitations, risks and roadmap

## Limitations (stated in the app as well)

1. **No definitive scores yet.**
   - No analyzer has passed the labelled student-corpus procedure ([validation.md](validation.md)).
   - So the app gives a *partial diagnostic*, never "passed".
   - Progression works through student confirmation ("practiced"), stored apart from verified completion.
2. **Niqqud covers vowels, sheva na/nach, dagesh in ב כ פ and the shin dot; stress is not checked.** Doubtful shevas (after a long vowel, meteg, under ו/י) are not judged, and every check was validated on adult chant by changing the text, not on labelled student mistakes. Expected stress is in the data; no acoustic analyzer exists yet.
3. **Words analyzer limits.**
   - It hears consonants only. It cannot hear ב/ו, כ/ח, א/ע or ת/ס distinctions; this is deliberately tolerated so both Israeli and Ashkenazi pronunciations pass.
   - On adult readers with spliced errors it catches about 3 in 4 deleted or replaced words but only 1 in 4 repeated words.
   - It still falsely flags 2.6% of correctly read words.
   - It is not yet tested on children.
4. **Melody comparison is relative to one reader, and catches about half of ta'am mistakes.**
   - On real chant it finds about half of the words sung with a wrong ta'am. Most misses differ from the right tune by less than a semitone on average.
   - A student who learned a different but valid Ashkenazi melody gets more flags: 10.6% of another singer's correct phrases, 4.6% shown as ✗.
   - The lesson check is lenient (tolerance 1.0): it lets about two thirds of single-word ta'am mistakes pass, so it does not block a student who sings the phrase roughly right.
   - Numbers: [validation.md](validation.md), "Melody validation on real chant".
5. **Reference recordings are not expert-approved.**
   - All 146 are a real reader's chanting, labelled pending.
   - 6 verses have timing marked "check".
6. **Text review pending.** MAM (Aleppo-based) still has to be compared with the printed tikkun the student will use. Known: 4:13 differs in Ashkenazi scrolls, and the app shows a note there.
7. **Physical-device evidence missing.**
   - Not yet measured: microphone capture quality, latency, memory, battery, airplane mode, interruptions (calls, backgrounding), and stability over many recordings.
   - Built and run on an emulator only.
8. **App size and storage.**
   - The debug APK is 495 MB, mostly the 365 MB model.
   - On first use the model is copied out of the APK, about 730 MB on the device in total.
   - Upgrade path: memory-map the uncompressed asset (`createSession(ByteBuffer)`), or deliver the model as an on-demand asset pack.
9. **iOS** is not built or tested ([ios.md](ios.md)).
10. **Engineering heuristics.** The charts draw one view per dot, which is fine for static charts and a 40 ms playhead; the Yad animation is not frame-perfect.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Analyzer accuracy on children is much worse than on adults | Wrong feedback | Mention threshold (≥ 0.6) before naming a word; corpus validation before enabling scores |
| Melody tolerance too strict or too lax | Discouraging or uninformative | Settings expose the lesson tolerance; collect labelled melody mistakes |
| On-device model too slow or too large on low-end phones | Long waits, out-of-memory | Measure on target phones (diagnostics runner logs timings); fallback: the words analyzer reports "unavailable" and the rest still works |
| Licence obligations (CC BY-SA text and audio, Apache model, OFL font) | Distribution | Attribution in Settings and NOTICE.md; BY-SA derivatives stay BY-SA |
| **Patents** on comparing a student's chanting with model recordings (US11062615 family, priority 2011, listed as expired–fee related) | Legal | **Confirm with counsel before distribution** |
| Ashkenazi tradition variance (melodies, pronunciation) | Disputed corrections | One reader per tradition; expert approval per verse |

## Roadmap

**Next (finish the POC gate):**
1. Physical-phone run: install, airplane mode, interruptions, the diagnostics runner on the validation files, and `EVAL_TIMINGS`.
2. Expert review: the text against a tikkun, the reference audio per verse (approval flags), and the te'amim explanations.
3. Collect the labelled student corpus (validation.md §1) and run the acceptance procedure.
4. Tune the thresholds on the training half, then evaluate on the held-out half.

**Analysis:**
5. Niqqud: vowels, sheva, dagesh and shin dot done (ZIPA-small + `analysis/phonemes.ts` + `analysis/vowels.ts`). Next: validate on recorded student mistakes; then the "minor pronunciation" category (ח/כ, ע/א, stress) on the same phone alignment.
6. Stress: syllable timing from the phone alignment, plus intensity, duration and pitch at the expected stressed syllable.
7. Melody: per-ta'am templates from several approved readers, so a word can be checked as "closer to the expected ta'am than to the others" rather than only "close to one reader"; and real student melody mistakes, labelled, to replace the spliced ones.

**Product:**
8. A per-verse reference approval UI (for the reviewing expert) and a tap-along timing editor.
9. A second reader and tradition selector (the `traditionId` already exists in the data).
10. Further portions: run `import-torah` for the next parashah range and `align-reference` for its recordings.
11. iOS implementation on a Mac ([ios.md](ios.md)).
12. Model delivery: memory-mapped loading and an optional on-demand model pack.
