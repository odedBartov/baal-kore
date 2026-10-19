# Offline Hebrew speech analysis: research notes (2026-10-11)

This is desk research done during the Phase 3 spike. Nothing here has been measured on our audio yet; spike 3b does that.

**How licences were checked:**
- Licences come from LICENSE files, Hugging Face (HF) YAML/API tags, or licence pages.
- "No licence" means all rights reserved.
- **(unverified)** marks claims not confirmed from a primary source.
- Sizes are published file sizes unless marked "est.".

## Main findings

1. **No usable Hebrew ASR model gives the vowels.** Whisper and the ivrit-ai fine-tunes, wav2vec2-he, GigaAM-He, Omnilingual and whistle-he all output bare consonantal text, so niqqud errors are invisible.
   - Checking vowels needs a **phone (IPA) recogniser** plus G2P from the vocalized text.
   - The only exceptions found are two experimental, very large Whisper fine-tunes with data-provenance problems.
2. **Whisper is a poor fit for spotting errors.** Its autoregressive decoder behaves like a language model and "repairs" what was said, and it has no frame-level posteriors.
   - CTC models are frame-synchronous and expose a T×V log-probability matrix. That matrix is exactly what forced alignment and Goodness of Pronunciation (GOP) scoring need.
3. **Tradition matters.** Models trained on Modern Israeli Hebrew (all ivrit.ai-based ones) penalise Ashkenazi realisations:
   - qamatz as /ɔ/
   - tav without dagesh as /s/
   - holam as a diphthong

   A universal phone model plus a G2P that emits *alternative accepted pronunciations* handles any nusach.
4. **Licences that rule a candidate out:**
   - Meta MMS, including the MMS_FA aligner weights: CC BY-NC 4.0.
   - ZIPA "NS" variants: CC BY-NC-SA 4.0.
   - Allosaurus and espeak-ng: GPL-3.0.
   - Cactus engine: revenue/funding-threshold licence.
   - MultIPA and imvladikon/wav2vec2-xls-r-300m-hebrew: no licence.
   - Vosk: no Hebrew model exists.

## Ranked plan for the POC

1. **Universal phone CTC + rule-based G2P + CTC forced alignment + GOP, all on-device.**
   - **Model:** `anyspeech/zipa-small-crctc-300k` (64M params, **int8 ONNX 70.7 MB**, weights CC BY 4.0, code MIT, 127 IPA tokens).
     - Its input is 80-dim Kaldi fbank, which must be reimplemented to match lhotse defaults.
     - Fallback: `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0, about 315M params, 1.26 GB fp32, int8 about 318 MB est.). It takes the raw waveform, so the front-end is simpler.
   - **G2P:** rule-based, on top of `havarotjs` (MIT) and `hebrew-transliteration` (MIT), with Israeli and Ashkenazi schemas.
   - **Alignment and scoring:** about 100 lines of CTC Viterbi alignment, plus a GOP-SF-style vowel test.
   - **Runtime:** onnxruntime-android (MIT) from a Java helper.
   - **Risk:** Hebrew is zero-shot for both models, so this **must be measured on real recordings**.
2. **Optional Hebrew consonantal CTC model for robust word checks.**
   - **Omnilingual ASR CTC-300M:** Apache-2.0. `heb_Hebr` is covered with 155.5 h of training data. sherpa-onnx int8 is 365 MB, input limit 40 s.
   - **GigaAM-He (`asfberlin/fast-hebrew-asr`):** MIT, 220M, WER 13.6–14.7%. ONNX export is DIY **(unverified)**.
3. **whisper.cpp (MIT):** only as a free-transcription fallback, never for vowels.
   - Stock tiny/base/small are poor on Hebrew: FLEURS WER 71.6 / 61.7 / 44.4.
   - ivrit-ai large-v3-turbo (809M, Apache-2.0) is good but 1.62 GB as f16 ggml.
4. **Research reference only:**
   - **Technion "cantillation" Whisper fine-tunes:** output text with te'amim and niqqud. Tagged Apache-2.0, but trained on YouTube-scraped audio.
   - **`renikud/whisper-he-ipa`:** Modern Hebrew IPA, 2.4% CER. 809M; partly trained on SASpeech, which is non-commercial.
5. **Cantillation melody:** pitch over word spans plus per-ta'am contour comparison against reference audio, as implemented in the spike.
   - Academic precedent: van Kranenburg, Biró, Ness and Tzanetakis.
   - No off-the-shelf model exists.

## ASR candidates

| Model | Size | Licence (code / weights) | Hebrew accuracy | Output | Verdict |
|---|---|---|---|---|---|
| Whisper tiny / base / small | 39M / 74M / 244M; ggml 75 / 142 / 466 MiB | MIT | FLEURS WER 71.6 / 61.7 / 44.4 | Consonantal | Too inaccurate at mobile sizes |
| ivrit-ai/whisper-large-v3-turbo | 809M; ggml f16 1.62 GB; ONNX int8 enc 645 MB + dec 438 MB | Apache-2.0; ivrit.ai data licence allows AI training | eval-d1 4.8%, FLEURS-he 17.7% WER | Consonantal | Best accuracy, too large |
| mike249/whisper-small-he-v4 | 242M | Apache-2.0 | Not reported | Consonantal | Unbenchmarked |
| MaorB/whistle-he | 55M | Weights Apache-2.0; **Cactus engine restricted** | Card WER 8.8–20.3% | Consonantal | ONNX path only; new and single-author |
| imvladikon/wav2vec2-xls-r-300m-hebrew | 300M | **No licence** | WER 23.2% (private data) | Consonantal | Avoid |
| asfberlin/fast-hebrew-asr (GigaAM-He) | 220M CTC; 883 MB checkpoint | MIT | WER 13.6 / 14.7% | Consonantal | Good permissive CTC; ONNX export DIY |
| facebook/omniASR-CTC-300M | 325M; sherpa int8 365 MB | Apache-2.0 | 300M Hebrew CER **unverified** | Consonantal | Best permissive multilingual CTC |
| facebook/mms-1b-all | 1B | **CC BY-NC 4.0** | — | — | Disqualified |
| Vosk | — | — | **No Hebrew model** | — | N/A |
| cantillation/* (Technion) | tiny…turbo | Apache-2.0 tags; YouTube data | Varies | **Text with te'amim (+ niqqud)** | Proof of concept only |
| renikud/whisper-he-ipa | 809M | Apache-2.0 tag; SASpeech NC data | 2.4% CER | **Modern Hebrew IPA + stress** | Too big; provenance risk |

**Mobile latency:** no Hebrew-specific Android benchmarks were found. Benchmark it in spike 3b.

## Phone-level recognisers (for niqqud)

| Model | Size | Licence | Hebrew vowels distinguishable? | On-device |
|---|---|---|---|---|
| **ZIPA-CR-small** | 64M; int8 ONNX 70.7 MB | MIT code, CC BY 4.0 weights | Has /a e i o u ɔ/ and diphthong tokens. Hebrew is zero-shot. Its paper notes "vowels are more difficult to predict crosslinguistically". | Plain ORT CTC with a Kaldi fbank front-end |
| **wav2vec2-xlsr-53-espeak-cv-ft** | ~315M; int8 ~318 MB est. | Apache-2.0 | 392 espeak-IPA tokens; Hebrew not in training | ORT, raw waveform, 20 ms frames |
| Allosaurus | small | **GPL-3.0** | yes in principle | Avoid |
| POWSM | 1.37 GB | CC BY 4.0 | — | Research only |

## CTC forced alignment and GOP

- **Viterbi alignment:**
  - Interleave blanks into the target, giving S = 2L+1 states.
  - Recurrence: `dp[t][s] = logp[t][ext[s]] + max(dp[t-1][s], dp[t-1][s-1], dp[t-1][s-2] if ext[s] ≠ blank and ext[s] ≠ ext[s-2])`, then backtrack.
  - Cost is O(T·S), trivial for a verse.
  - Specs to follow: the torchaudio tutorial (`forced_align` is deprecated from 2.8) and ctc-segmentation (Apache-2.0).
  - Add a `<star>` wildcard token for unexpected speech, as in the MMS aligner. The idea is free to use; the MMS weights are NC.
- **GOP:**
  - Witt & Young 2000.
  - CTC-specific: Cao et al., Interspeech 2024 (GOP-SA) and arXiv 2507.16838 (GOP-SF: CTC loss with the target phone replaced by an alternative, minus CTC loss of the canonical sequence).
  - Logit-based GOP: Parikh et al. 2025.
  - **Closest analogue:** Quran recitation assessment (arXiv 2509.00094: fixed diacritised text, rule-based phonetic script, multi-level CTC, 0.21% PER).

## Cantillation prior work and audio

- **Academic work:**
  - van Kranenburg, Biró, Ness & Tzanetakis, ISMIR 2011: melodic contour stability across Torah trope traditions. Hand-segmented by te'amim; no public dataset.
  - Ness, Biró & Tzanetakis 2010, Biró et al. 2012, Tzanetakis 2014.
  - Technion SIPL 2025: Whisper with te'amim.
- **Patents:** US11062615 family (US10019995, US10565997, US11380334; priority 2011) claims comparing a student's chanting with model recordings. Google Patents shows "Expired – Fee Related". **Confirm with counsel.**
- **Products:**
  - Kol Torah – Bar Mitzvah Prep (Android) claims AI feedback against a rabbi's reading.
  - TropeTrainer, Kol Kore and LainingLab offer playback or synchronisation, not assessment.
- **Licensed reference audio:**
  - **PocketTorah** (archive.org `PockettorahAudioFiles`): CC BY-SA 3.0, American Ashkenazi, 515 MP3s.
  - **Wikimedia Commons, Category:Audio_files_of_cantillation:** Asael is CC BY-SA 3.0 (Ashkenazi cantillation, both pronunciations); Nahum is CC BY 2.5 (Ashkenazi). These are the recordings used in the spike tests.
- **Not usable:** Shmuelof (NC-ND), Chabad (©), Virtual Cantor and LearnTrope (no licence), Meertens (NC).

## Hebrew G2P

- **Rule-based is realistic for fully pointed Biblical text.**
  - `havarotjs` (MIT, TS): syllables with `isClosed`/`isAccented` from te'amim, plus options for qamats qatan, sheva, holam and similar.
  - `hebrew-transliteration` (MIT, TS): configurable schema covering vocal sheva, qamats qatan, furtive patah, dagesh hazaq and BGDKPT.
- **phonikud:** code CC BY 4.0, Modern Israeli only.
  - It repurposes U+05AB (ole) and U+05BD (meteg). Torah text must be cleaned before using it.
- **espeak-ng `he`:** GPL-3.0, ignores te'amim.
- **Hard cases:** sheva na vs nach, qamats gadol vs qatan, dagesh hazaq vs qal, furtive patah, ketiv/qere (incl. YHWH), Ashkenazi variants.
- **Approach:** emit a per-word lattice of accepted pronunciations.

## ONNX inside NativeScript

- **No NativeScript ONNX or TFLite plugin exists.**
- **onnxruntime-android** (MIT, 1.31.0): add it as a Gradle dependency and wrap it in a Java helper in `App_Resources/Android/src/main/java`, returning small results to JS.
  - Java arrays cross into JS element by element, which is slow.
  - Android runtime 8.2+ can pass TypedArrays as NIO buffers (NativeScript/android PR #1678).
- **iOS:** the `onnxruntime-objc` pod.
- **sherpa-onnx** (Apache-2.0): Android AAR with a Kotlin API that supports Whisper, NeMo CTC and Omnilingual.
  - Its Kotlin offline result does **not** expose log-probs, so GOP needs raw ORT.

## Not verified

- On-device RTF for ZIPA-small, wav2vec2-espeak int8 and Omnilingual-300M.
- Whether ZIPA's ONNX loads in sherpa-onnx.
- The exact int8 size of xlsr-53-espeak.
- Omnilingual-300M Hebrew CER.
- Patent status.
- The licence of PocketTorah's label repo.

## Sources

**ASR models and licences**
- Whisper: https://github.com/openai/whisper; Whisper paper (Table 13): https://arxiv.org/pdf/2212.04356
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- ivrit.ai:
  - models: https://huggingface.co/ivrit-ai/models
  - licence: https://www.ivrit.ai/en/the-license/
  - leaderboard: https://ivrit-ai-hebrew-transcription-leaderboard.hf.space/
- Whisper fine-tunes and trims:
  - https://huggingface.co/mike249/whisper-small-he-v4
  - https://huggingface.co/alphaedge-ai/whisper-tiny-heb-16384
- whistle-he: https://huggingface.co/MaorB/whistle-he; Cactus licence: https://raw.githubusercontent.com/cactus-compute/cactus/main/LICENSE
- wav2vec2 Hebrew:
  - https://huggingface.co/imvladikon/wav2vec2-xls-r-300m-hebrew
  - https://huggingface.co/imvladikon/wav2vec2-large-xlsr-53-hebrew
- GigaAM-He: https://huggingface.co/asfberlin/fast-hebrew-asr; HebDB: https://huggingface.co/datasets/SLPRL-HUJI/HebDB
- Omnilingual:
  - https://github.com/facebookresearch/omnilingual-asr
  - https://huggingface.co/csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12
- MMS: https://huggingface.co/facebook/mms-1b-all
- Vosk models: https://alphacephei.com/vosk/models
- sherpa-onnx models: https://k2-fsa.github.io/sherpa/onnx/pretrained_models/index.html
- Technion: https://huggingface.co/cantillation
- whisper-he-ipa: https://huggingface.co/renikud/whisper-he-ipa; SASpeech: https://www.openslr.org/resources/134/about.html

**Phone models**
- ZIPA: https://github.com/lingjzhu/zipa, https://huggingface.co/anyspeech/zipa-small-crctc-300k, https://arxiv.org/html/2505.23170v1
- espeak phoneme models:
  - https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft
  - https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX
  - paper: https://arxiv.org/pdf/2109.11680
- Allosaurus: https://github.com/xinjli/allosaurus
- POWSM: https://huggingface.co/espnet/powsm

**Alignment and GOP**
- torchaudio forced alignment: https://docs.pytorch.org/audio/stable/tutorials/forced_alignment_tutorial.html
- ctc-segmentation: https://github.com/lumaku/ctc-segmentation
- Witt & Young 2000: https://mi.eng.cam.ac.uk/~sjy/papers/wiyo00.pdf
- Cao et al.: https://www.isca-archive.org/interspeech_2024/cao24b_interspeech.pdf and https://arxiv.org/html/2507.16838v3
- Parikh et al.: https://arxiv.org/abs/2506.12067
- Quran analogue: https://arxiv.org/abs/2509.00094

**Cantillation and audio**
- van Kranenburg et al.: https://archives.ismir.net/ismir2011/paper/000009.pdf
- Tzanetakis 2014: https://speech.di.uoa.gr/ICMC-SMC-2014/images/VOL_1/0069.pdf
- Patent: https://patents.google.com/patent/US11062615
- Kol Torah: https://play.google.com/store/apps/details?id=com.almog.bar_mitzva
- PocketTorah: https://archive.org/details/PockettorahAudioFiles
- Wikimedia Commons: https://commons.wikimedia.org/wiki/Category:Audio_files_of_cantillation

**G2P**
- phonikud: https://github.com/phonikud/phonikud
- hebrew-transliteration: https://github.com/charlesLoder/hebrew-transliteration
- havarot: https://github.com/charlesLoder/havarot
- espeak-ng Hebrew rules: https://github.com/espeak-ng/espeak-ng/blob/master/dictsource/he_rules

**Runtime**
- onnxruntime-android: https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/maven-metadata.xml
- NativeScript TypedArray → buffer PR: https://github.com/NativeScript/android/pull/1678
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx
