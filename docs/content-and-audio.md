# Content and reference-audio pipelines

Both pipelines run at **build time**. The app only reads the bundled results and never contacts the sources at runtime.

## 1. Torah text: `npm run import-torah`

| | |
|---|---|
| **Source** | Sefaria API, edition **"Miqra according to the Masorah" (MAM)**, based on the Aleppo Codex and designed for readers; licence **CC BY-SA**. |
| **Snapshot** | `data-src/sefaria/genesis-1-6.mam.json`: raw API text, retrieval date, licence, Sefaria's aliyah list. Rebuilds are offline. `--refresh` refetches. |
| **Output** | `src/data/bereshit.json` (schema v1): 146 verses, 1,931 word tokens. |
| **Review status** | `pending`: not yet compared word-for-word with a recognised printed tikkun by a qualified reader. |

What the importer does:

1. **Cleans the markup.**
   - Legarmeh (bold stroke) is kept apart from paseq (small stroke).
   - Large and small letters are recorded (בּ of Bereshit, small ה in 2:4).
   - Petucha and setuma breaks are recorded.
   - Footnotes become verse `notes`. One matters for an Ashkenazi reader: in 4:13 Ashkenazi and Sephardi scrolls read מִנְּשֽׂוֹא, with a vav.
2. **Tokenises into words.** Maqaf words become separate tokens with `maqafToNext`, and stable ids like `Genesis.1.1.3` are assigned. Highlighting and audio alignment use these ids, never character offsets.
3. **Resolves te'amim with context rules** (`torah/cantillation.ts`):
   - duplicate postpositive marks count once;
   - meteg on the last word is silluq;
   - munach + legarmeh stroke is munach legarmeh;
   - mahpach + paseq is *not* legarmeh;
   - words without an accent belong to the next word.
4. **Builds phrase groups:** conjunctives together with their disjunctive.
5. **Adds syllables and stress** from `havarotjs` (MIT). Reduced (sheva/hataf) syllables are not counted. The Tetragrammaton gets its spoken form אדני with final stress.
6. **Integrity checks.** These fail the build:
   - 146 verses with the correct chapter sizes;
   - every verse ends in sof pasuq and silluq;
   - no unknown characters;
   - every accent is catalogued.

   `test/content.test.ts` also checks that the cleaned text keeps *every* letter and mark of the edition.

The te'amim catalog (names, classification, Hebrew explanations) is marked `reviewStatus: 'pending'`.

## 2. Reference readings: `npm run align-reference`

**Bundled reader.**
- **Who:** *Asael*, Wikimedia Commons, **CC BY-SA 3.0**.
- **Tradition:** Ashkenazi cantillation with Israeli pronunciation, which is the spec's "Israeli Ashkenazi" tradition.
- **Coverage:** all 7 aliyot of Bereshit.
- **Files:** the original Ogg files are bundled **unmodified** (15 MB) in `src/assets/reference/asael-israeli/`, with links to their Commons pages in the JSON.

**Validation reader (not bundled).** *Nahum*, Commons, CC BY 2.5, Ashkenazi pronunciation.

### Steps

1. **Transcribe.** Each recording runs through the Omnilingual ASR CTC-300M model (Apache-2.0) in 30 s windows.
2. **Force-align** the known text (spoken consonants) to get per-word start times.
   - **Word ends** extend through the sung melisma until the voice stops or the next word starts.
   - **Verse cuts** fall in the pause before the next verse and never clip the last word.
3. **Check file ranges.** These recordings split aliyot 5 and 6 after **4:26**, not after 4:22 as in Sefaria's list. Each file's verse range was verified by transcribing its start and end (`FILE_RANGES`). The script fails if a file does not match its text.
4. **Rate each verse:**
   - a tolerant transcription error rate per verse;
   - `quality: 'check'` when that rate is above 0.2 or a word's confidence is below 0.05.
5. **Write the output:** `src/data/reference-asael-israeli.json`, holding per-verse file/start/end, `[start, end, confidence]` for every word, `approvalStatus: 'pending'` and the reader's median pitch (145 Hz, informational). The validation report goes to `docs/data/reference-alignment-report.json`.

### Measured results (2026-10-12, current code)

| | Asael (bundled) | Nahum (validation) | Asael, Ashkenazi-pronunciation session (validation) |
|---|---|---|---|
| Mean tolerant transcription error | 5.4% | 15.3% | 19.1% |
| Verses with clean timing | **140 / 146** | 106 / 146 | 91 / 146 |
| Verses flagged `check` | 6 (2:16, 2:25, 3:22, 3:24, 4:2, 4:20) | 40 | 55 (22 of them in file 6, whose Commons recording holds only 91 s for 24 verses) |

The two validation readers are not bundled. They are downloaded by `align-reference` and used only by `validate-analyzers` and `validate-melody`. Their timings go to `.cache/reference/`.

**Cross-check of word timing.** Asael's word starts were mapped into Nahum's reading with MFCC-DTW, which is independent of the CTC model, and compared with Nahum's own CTC word starts. Over 1,356 words:

- median difference **20 ms**;
- **86%** within 100 ms;
- **95%** within 250 ms.

Two independent methods agree, so the timings are trustworthy for highlighting, the Yad and per-word feedback.

The flagged verses still play and still get feedback. The practice screen shows "תזמון המילים דורש בדיקה".


### Approval status

- Every reference is shown as **"הקלטת קורא אמיתי – ממתינה לאישור מומחה"** (a real reader's recording, awaiting expert approval).
- Nothing is labelled approved.
- Automatic checks cannot certify a reading (spec §6.3). A qualified Torah reader must listen to each verse, check text and melody, and then set `approvalStatus` to `approved`.

**Recommended next step:** per-verse approval rather than per-reader. Add `approval` per verse to the JSON, and have `ContentService.referenceFor` prefer it.

**Melody differences between readers.** The two readers' melodies differ measurably: frames within one semitone were 54–61% even for the same verses (see `phase3-audio-spike.md`). The app must use **one** reader per tradition, and lessons and grading are relative to that reader.

## 3. Replacing the references with professional recordings (deliverable 15)

No UI or scoring code changes are needed. The app reads any reader's JSON with this shape.

1. **Record.** One file per aliyah, or one per verse. Any format Android decodes works: WAV, FLAC, MP3, AAC/M4A, Ogg. Mono or stereo, 44.1 or 48 kHz. Use a quiet room, a steady distance from the microphone, and a short silence between verses.
2. **Add a reader** to `READERS` in `scripts/align-reference.ts`: `id`, `name`, `pronunciation`, `license`, `bundle: true`. Replace `download()` with a local path if the files are not on Commons. If each file covers a single verse, set `FILE_RANGES` accordingly.
3. **Run** `npm run fetch-model` (once), then `npm run align-reference`. Review the per-file error rates and the `check` list.
4. **Bundle.** Point `ContentService` at the new `src/data/reference-<id>.json`: change the import, or add a reader setting if several readers should be offered.
5. **Expert review.** Mark verses `approved` only after a qualified reader has reviewed them. The app plays them unchanged (no transposition).
6. **Update credits:** change the attribution text in `settings.component.ts`.

**If automatic alignment fails** for a verse (CTC error high, `check` flag), there are two options:
- record that verse again;
- edit its word timings by hand in the JSON. The values are milliseconds in the source file.

A tap-along timing editor is on the roadmap.

## 4. AI-generated chanting (spec §6.1): investigated, not used

No free, local model was found that chants Torah text with correct Ashkenazi te'amim. Generic Hebrew TTS does not produce cantillation, and the spec forbids assuming it does. Human recordings with clear licences exist for the whole portion, so the POC uses those as **pending** references.

Generated audio can be added later through the same reader pipeline. It must be reviewed exactly like a human recording before it is approved.
