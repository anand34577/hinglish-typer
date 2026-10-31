# Contributing

Thanks for helping! Bug reports, phrase-list additions, translations of the docs and code are all welcome.

## Setup
```bash
git clone https://github.com/anand34577/hinglish-typer && cd hinglish-typer
npm install
npm test       # engine tests (Node's built-in runner)
npm start      # run the app
```

## Layout
| File | Role |
|---|---|
| `main.mjs` | Electron main process: tray, hotkeys, typing box, suggestion bar |
| `live.mjs` | System-wide typing: key hook → word buffer → replace text in the focused app |
| `engine.mjs` | Lekhani wrapper, learned spellings/phrases, phrase completion |
| `lekhani/` | Upstream model files, **unmodified**: do not edit; update from Hugging Face |
| `phrases.json` | Built-in phrase list: add common Hinglish phrases here (lowercase, romanised) |
| `tools/` | Icon, banner, screenshot generators (`npm run icon`, `npm run art`) |

## Guidelines
- Keep it light: no new runtime dependency without a strong reason.
- Wrong top-1 spelling for a word? That's the Lekhani model; report upstream, or add a phrase.
- Changes to what is shown or credited must keep `THIRD_PARTY_NOTICES.md` accurate.
- Sign your work with a `Signed-off-by` line (`git commit -s`): contributions are licensed Apache-2.0.

## Releasing (maintainers)
Bump `version` in `package.json`, update `CHANGELOG.md`, commit, then `git tag vX.Y.Z && git push --tags`.
The release workflow builds and publishes installers.
