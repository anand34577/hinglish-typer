# Third-party notices

Hinglish Typer is built on the work of others. Thank you.

## Lekhani (Udgam Labs LLP) — the transliteration model
- What: 0.81M-parameter Hindi transliterator, 200,000-word list, and JavaScript runner (`lekhani/`), unmodified.
- By: Udgam Labs LLP, Copyright 2026. https://udgamlabs.com/models/lekhani · https://huggingface.co/udgamlabs/Lekhani
- License: Apache-2.0 for the model and `translit.js`; CC0 1.0 for the word list. See `lekhani/LICENSE` and `lekhani/NOTICE`.
- Citation: Prasad, Jitesh K. "Lekhani: a 0.87 MB in-browser Hindi transliterator". Udgam Labs, 2026.

Lekhani's own credits, reproduced from its NOTICE:
- Trained on word pairs from **Aksharantar** (AI4Bharat; hand-collected part CC-BY, mined parts CC0) —
  Madhani et al., "Aksharantar: Towards Building Open Transliteration Tools for the Next Billion Users", 2022,
  arXiv:2205.03018. https://huggingface.co/datasets/ai4bharat/Aksharantar
- **IndicXlit** (AI4Bharat, MIT) was used as a teacher to label training words. https://github.com/AI4Bharat/IndicXlit
- The word list derives from word counts of **IndicCorp v2** Hindi (AI4Bharat, CC0). https://huggingface.co/datasets/ai4bharat/IndicCorpV2
- English words given to the teacher came from the **CMU Pronouncing Dictionary** (Copyright 1993-2015 Carnegie Mellon
  University; BSD-style licence). https://github.com/cmusphinx/cmudict

## Runtime dependencies
| Component | License | Link |
|---|---|---|
| Electron (app shell, Chromium, Node.js) | MIT (plus Chromium's third-party licenses, shipped as `LICENSES.chromium.html`) | https://github.com/electron/electron |
| uiohook-napi (global keyboard hook, key synthesis) | MIT | https://github.com/SnosMe/uiohook-napi |
| libuiohook (bundled in uiohook-napi) | LGPL-3.0-or-later | https://github.com/kwhat/libuiohook |

libuiohook is distributed unmodified inside uiohook-napi's prebuilt binaries; its source is available at the link above.

## Build tooling (not shipped)
electron-builder (MIT).

## Original to this project
The app code, the phrase list (`phrases.json`) and the icon (`tools/icon.svg`) are Copyright 2026 Anand, Apache-2.0.
