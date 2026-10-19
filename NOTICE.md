# Third-party content and software

Everything shipped in the app is free to use under the licences below. Attribution is also shown in the app (Settings → קרדיטים ורישיונות).

| Item | Where | Licence | Source |
|---|---|---|---|
| Hebrew Bible text, "Miqra according to the Masorah" (Genesis 1:1–6:8) | `src/data/bereshit.json`, `data-src/sefaria/` | CC BY-SA (per Sefaria) | Sefaria API; edition by Dovi Gottesman et al., he.wikisource |
| Reference chanting, reader "Asael" (Israeli pronunciation), Bereshit aliyot 1–7 | `src/assets/reference/asael-israeli/` (files unmodified) | CC BY-SA 3.0 | Wikimedia Commons, Category:Cantillation for Parashat Bereshit (links in `src/data/reference-asael-israeli.json`) |
| Omnilingual ASR CTC-300M (int8 ONNX export) | APK asset `models/omnilingual-ctc-300m.int8.onnx` | Apache-2.0 (Meta) | huggingface.co/csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12 |
| ZIPA-small CR-CTC phone model (int8 ONNX export), Zhu et al. 2025 | APK asset `models/zipa-small.int8.onnx` | CC BY 4.0 (weights), MIT (code) | huggingface.co/anyspeech/zipa-small-crctc-300k, github.com/lingjzhu/zipa |
| ONNX Runtime for Android | Gradle dependency | MIT | Microsoft |
| Ezra SIL font 2.51 | `src/fonts/EzraSIL.ttf` | SIL Open Font License 1.1 + MIT (layout) — see `src/fonts/EzraSIL-LICENSE.txt` | SIL International |
| NativeScript, Angular | npm | MIT / MIT | |
| Rabbi and yad artwork | `src/assets/art/` | Original to this project (`scripts/build-art.mjs`) | |

**Development only (not shipped):**

| Item | Licence | Source |
|---|---|---|
| havarotjs (syllables and stress at import time) | MIT | |
| @resvg/resvg-js (renders the artwork) | MPL-2.0 | |
| onnxruntime-node | MIT | |
| @wasm-audio-decoders/ogg-vorbis | MIT | |
| tsx | MIT | |
| Test corpora: vocadito | CC BY 4.0 | |
| Test corpora: CMU ARCTIC | permissive CMU licence | |
| Test corpora: Wikimedia Commons cantillation (Asael CC BY-SA 3.0, Nahum CC BY 2.5) | as listed | |
