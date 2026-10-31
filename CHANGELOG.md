# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [0.2.0] - 2026-10-31
### Changed
- Rebuilt on Tauri v2 and Rust (system web view, `rdev` keyboard hook): installers are a few MB instead of ~70–100 MB. Behaviour is unchanged.
- `engine.mjs` and `live.mjs` moved to `web/`; the Lekhani files are bundled unmodified.
- About / Credits is now a small window.

## [0.1.1] - 2026-10-31
### Added
- Banner, social preview, promo images and screenshots; contributing, security and conduct docs; issue templates.
### Changed
- Smaller installers (English-only Chromium locales, maximum compression).
- Hide half-letter and stray-sign spellings from suggestions.

## [0.1.0] - 2026-10-31
### Added
- System-wide live Hinglish → Devanagari typing with suggestion bar, phrase completion and learned spellings.
- Typing-box popup, tray app, Windows/macOS/Linux installers, CI and release workflows.
- Powered by Lekhani (Udgam Labs, Apache-2.0); full attribution in `THIRD_PARTY_NOTICES.md`.
