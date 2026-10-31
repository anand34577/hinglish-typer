import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_LEARNED = 3000;

// Lekhani model + learned preferences (word spellings, phrases) + built-in phrase list.
export async function createEngine(dataDir) {
  const d = path.join(here, "lekhani");
  const { Transliterator } = await import(pathToFileURL(path.join(d, "translit.js")).href);
  const tr = await Transliterator.load({
    model: fs.readFileSync(path.join(d, "model.q4.gz")),
    json: fs.readFileSync(path.join(d, "model.json.gz")),
    words: fs.readFileSync(path.join(d, "words.bin.gz")),
    rerank: JSON.parse(fs.readFileSync(path.join(d, "rerank.json"), "utf8")),
  });

  const prefFile = path.join(dataDir, "prefs.json");
  let prefs = { words: {}, phrases: {} };
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefFile, "utf8")) }; } catch {}
  let saveTimer;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(prefFile, JSON.stringify(prefs)); } catch {}
    }, 1500);
  };

  const builtin = JSON.parse(fs.readFileSync(path.join(here, "phrases.json"), "utf8")).map((p) => p.split(" "));
  const phraseList = () => [
    ...builtin.map((w) => ({ w, n: 1 })),
    ...Object.entries(prefs.phrases).map(([k, n]) => ({ w: k.split(" "), n: n + 1 })),
  ];

  const modelCache = new Map();
  const modelCands = (w) => {
    let r = modelCache.get(w);
    if (!r) {
      const all = tr.word(w).candidates.map((c) => c.text).filter((t) => /^[ऄ-हक़-य़]/.test(t)); // drop stray signs/matras
      const full = all.filter((t) => !t.endsWith("्")); // and half-letters ending in a virama
      r = full.length ? full : all;
      if (modelCache.size > 5000) modelCache.clear();
      modelCache.set(w, r);
    }
    return r;
  };

  // Candidate spellings, with the user's earlier choice moved to the front.
  const spellings = (word) => {
    const w = word.toLowerCase(), c = modelCands(w), p = prefs.words[w];
    return p ? [p, ...c.filter((x) => x !== p)] : c;
  };

  return {
    spellings,
    best: (w) => spellings(w)[0],
    // Split into Latin words (transliterated) and everything else (kept as typed).
    analyze: (text) => [...text.matchAll(/([A-Za-z]+)|([^A-Za-z]+)/g)].map((m) =>
      m[1] ? { src: m[1], cands: spellings(m[1]) } : { src: m[2], cands: null }),

    learnWord(roman, chosen) {
      prefs.words[roman.toLowerCase()] = chosen;
      if (Object.keys(prefs.words).length > MAX_LEARNED) delete prefs.words[Object.keys(prefs.words)[0]];
      save();
    },
    learnPhrase(words) {
      if (words.length < 2) return;
      const k = words.slice(-4).join(" ");
      prefs.phrases[k] = (prefs.phrases[k] || 0) + 1;
      const keys = Object.keys(prefs.phrases);
      if (keys.length > MAX_LEARNED) delete prefs.phrases[keys[0]];
      save();
    },

    // Phrases that continue what was typed: `done` = romanised words already committed in this phrase,
    // `part` = the word being typed. Returns [{ dev, label, words }] where dev replaces `part`.
    phrases(done, part, limit = 3) {
      if (part.length < 2) return [];
      const loose = part.length < 3; // short fragments only complete a phrase already under way
      const out = [];
      for (const { w, n } of phraseList()) {
        let best = -1;
        for (let k = Math.min(done.length, w.length - 1); k >= 0; k--) {
          if (done.slice(done.length - k).join(" ") === w.slice(0, k).join(" ")) { best = k; break; }
        }
        if (best < 0 || (best === 0 && loose)) continue;
        const rest = w.slice(best);
        if (!rest[0].startsWith(part) || (rest.length === 1 && rest[0] === part)) continue;
        out.push({ n: n + best * 2, words: rest, dev: rest.map((x) => spellings(x)[0]).join(" ") });
      }
      const seen = new Set();
      return out.sort((a, b) => b.n - a.n).filter((p) => !seen.has(p.dev) && seen.add(p.dev)).slice(0, limit);
    },
  };
}
