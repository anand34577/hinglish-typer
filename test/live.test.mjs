import assert from "node:assert/strict";
import { test } from "node:test";
import { createLive } from "../web/live.mjs";

const engine = {
  spellings: (w) => [w.toUpperCase(), w + "2"],
  phrases: () => [],
  learnWord() {}, learnPhrase() {},
};

function setup() {
  const calls = [];
  const io = {
    setHook: (on) => calls.push(["hook", on]),
    setShortcuts: (on) => calls.push(["shortcuts", on]),
    update: (s) => calls.push(["update", s && s.roman]),
    replace: async (n, text, enter) => calls.push(["replace", n, text, enter]),
  };
  const live = createLive({ engine, io });
  live.set(true);
  const key = (k, extra = {}) => live.onKey({ key: k, ctrl: false, shift: false, alt: false, meta: false, ...extra });
  return { calls, live, key };
}

test("a word ended by space is replaced, letters plus the space erased", () => {
  const { calls, key } = setup();
  for (const k of "ho") key(k);
  key("Space");
  assert.deepEqual(calls.at(-1), ["replace", 3, "HO ", false]);
});

test("Tab cycles spellings, Enter commits and presses Enter", () => {
  const { calls, live, key } = setup();
  key("h"); key("i");
  live.onShortcut("Tab");
  live.onShortcut("Enter");
  assert.deepEqual(calls.at(-1), ["replace", 2, "hi2", true]);
});

test("shortcuts are only bound while composing", () => {
  const { calls, live, key } = setup();
  key("a");
  assert.deepEqual(calls.filter((c) => c[0] === "shortcuts"), [["shortcuts", true]]);
  live.onShortcut("Escape");
  assert.deepEqual(calls.filter((c) => c[0] === "shortcuts").at(-1), ["shortcuts", false]);
});

test("ctrl chords and mouse clicks abandon the word", () => {
  const { calls, key } = setup();
  key("a"); key("c", { ctrl: true });
  assert.deepEqual(calls.at(-1), ["update", null]);
  key("b"); key("mouse");
  assert.deepEqual(calls.at(-1), ["update", null]);
});
