// Copies the Lekhani model files (unmodified) and the phrase list next to the web pages so Tauri bundles them.
// Run automatically by `npm run build`/`dev` (see src-tauri/tauri.conf.json); the copies are git-ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.rmSync(path.join(root, "web", "lekhani"), { recursive: true, force: true });
fs.cpSync(path.join(root, "lekhani"), path.join(root, "web", "lekhani"), { recursive: true });
fs.copyFileSync(path.join(root, "phrases.json"), path.join(root, "web", "phrases.json"));
