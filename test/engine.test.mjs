import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { Transliterator } from "../lekhani/translit.js";
import { createEngine } from "../web/engine.mjs";

const read = (f) => new Uint8Array(fs.readFileSync(new URL("../lekhani/" + f, import.meta.url)));
const engine = await createEngine({
  Transliterator,
  assets: {
    model: read("model.q4.gz"), json: read("model.json.gz"), words: read("words.bin.gz"),
    rerank: JSON.parse(fs.readFileSync(new URL("../lekhani/rerank.json", import.meta.url), "utf8")),
  },
  phrases: JSON.parse(fs.readFileSync(new URL("../phrases.json", import.meta.url), "utf8")),
});

test("transliterates common Hinglish", () => {
  const out = engine.analyze("aaj office mein meeting hai").map((t) => (t.cands ? t.cands[0] : t.src)).join("");
  assert.equal(out, "आज ऑफिस में मीटिंग है");
});

test("keeps punctuation and digits", () => {
  const out = engine.analyze("kaise ho, 123!").map((t) => (t.cands ? t.cands[0] : t.src)).join("");
  assert.equal(out, "कैसे हो, 123!");
});

test("offers several spellings, none of them stray signs", () => {
  const c = engine.spellings("ha");
  assert.ok(c.length >= 2);
  assert.ok(c.every((x) => /[\u0905-\u0939]/.test(x)));
});

test("learned spelling moves to the front", () => {
  engine.learnWord("kal", "कल");
  assert.equal(engine.best("kal"), "कल");
});

test("phrase completion continues a phrase in progress", () => {
  const p = engine.phrases(["kya", "haal"], "ha");
  assert.equal(p[0].dev, "है");
  assert.ok(engine.phrases([], "kya ha".split(" ")[0]).some((x) => x.dev.startsWith("क्या हाल")));
});
