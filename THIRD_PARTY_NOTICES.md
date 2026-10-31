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
| Tauri (app shell, tray, windows) and its plugins: global-shortcut, clipboard-manager, single-instance, autostart, opener | MIT or Apache-2.0 | https://github.com/tauri-apps/tauri · https://github.com/tauri-apps/plugins-workspace |
| rdev, RustDesk's fork (global keyboard hook, key synthesis) | MIT | https://github.com/fufesou/rdev (upstream: https://github.com/Narsil/rdev) |
| serde, serde_json | MIT or Apache-2.0 | https://github.com/serde-rs/serde |
| Further Rust crates pulled in by the above (wry, tao, global-hotkey, arboard, ...) | MIT, Apache-2.0, BSD or similar permissive licenses | `cargo tree` / `cargo about` in `src-tauri/` lists them all |

The app uses the operating system's web view (Microsoft Edge WebView2 on Windows, WebKit on macOS and Linux) instead of
bundling a browser; those are separate system components with their own licenses.

## Build tooling (not shipped)
Tauri CLI (MIT or Apache-2.0).

## Original to this project
The app code, the phrase list (`phrases.json`) and the icon (`tools/icon.svg`) are Copyright 2026 Anand, Apache-2.0.
