import { clipboard, globalShortcut } from "electron";
import pkg from "uiohook-napi";

const { uIOhook, UiohookKey: K } = pkg;
const IS_MAC = process.platform === "darwin";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LETTERS = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz"].map((c) => [K[c.toUpperCase()], c]));
const DIGITS = Object.fromEntries([..."0123456789"].map((c) => [K[c], c]));
// US-layout characters that end a word: [plain, shifted]
const ENDERS = {
  [K.Space]: [" ", " "], [K.Comma]: [",", null], [K.Period]: [".", null], [K.Slash]: ["/", "?"],
  [K.Semicolon]: [";", ":"], [K.Quote]: ["'", '"'], [K.Minus]: ["-", null],
  [K[1]]: ["1", "!"], [K[9]]: ["9", "("], [K[0]]: ["0", ")"],
  ...Object.fromEntries("2345678".split("").map((c) => [K[c], [c, null]])),
};
const SENTENCE_END = new Set([".", "?", "!", ":", ";"]);
const MODIFIERS = new Set([K.Shift, K.ShiftRight, K.Ctrl, K.CtrlRight, K.Alt, K.AltRight, K.Meta, K.MetaRight, K.CapsLock]);
const COMPOSING_KEYS = ["Tab", "Escape", "Return", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Control+${n}`)];
const SPELLINGS = 5;

// System-wide Hinglish typing. Letters land in the focused field as typed; when the word ends we erase them
// and paste the Devanagari. While a word is in progress a floating bar shows spellings and phrase completions.
export function createLive({ engine, overlay, isPaused }) {
  let enabled = false, started = false, busy = false, shortcuts = false;
  const queued = [];
  let buf = "", sel = 0, cands = [], phr = [], done = []; // done: romanised words of the current phrase

  const paste = IS_MAC ? K.Meta : K.Ctrl;

  function bindShortcuts(on) {
    if (on === shortcuts) return;
    shortcuts = on;
    COMPOSING_KEYS.forEach((acc, i) => {
      if (!on) return globalShortcut.unregister(acc);
      const run = acc === "Tab" ? () => cycle() : acc === "Escape" ? () => reset()
        : acc === "Return" ? () => commit({ enter: true }) : () => pick(i - 3);
      globalShortcut.register(acc, run);
    });
  }

  function show() {
    cands = engine.spellings(buf).slice(0, SPELLINGS);
    phr = engine.phrases(done, buf);
    sel = Math.min(sel, cands.length - 1);
    overlay.update({ roman: buf, spellings: cands, sel, phrases: phr.map((p) => p.dev), base: SPELLINGS });
  }

  function reset(keepPhrase = false) {
    if (!keepPhrase) { engine.learnPhrase(done); done = []; }
    buf = ""; sel = 0; cands = []; phr = [];
    bindShortcuts(false);
    overlay.update(null);
  }

  function cycle() { if (cands.length) { sel = (sel + 1) % cands.length; show(); } }

  function pick(i) {
    if (i < SPELLINGS) { if (i < cands.length) { sel = i; commit({ trail: " " }); } }
    else if (phr[i - SPELLINGS]) commit({ trail: " ", phrase: phr[i - SPELLINGS] });
  }

  // Replace the typed letters (+ `extra` characters the app already inserted) with Devanagari + `trail`.
  function commit({ trail = "", extra = 0, enter = false, phrase = null }) {
    if (!buf) return;
    const roman = buf, text = phrase ? phrase.dev : cands[sel] ?? roman;
    if (!phrase && sel > 0) engine.learnWord(roman, text);
    if (phrase) done.push(...phrase.words); else done.push(roman.toLowerCase());
    const n = roman.length + extra;
    reset(true);
    busy = true;
    run(n, text + trail, enter).finally(() => {
      busy = false;
      for (const e of queued.splice(0)) onKey(e); // keys typed while we were replacing
    });
  }

  async function run(backspaces, text, enter) {
    const saved = clipboard.readText();
    for (let i = 0; i < backspaces; i++) uIOhook.keyTap(K.Backspace);
    clipboard.writeText(text);
    uIOhook.keyTap(K.V, [paste]);
    await sleep(90);
    if (enter) { uIOhook.keyTap(K.Enter); done = []; }
    await sleep(30);
    clipboard.writeText(saved);
  }

  function onKey(e) {
    if (!enabled || isPaused()) return;
    // Our own Backspace/Ctrl+V taps come back through the hook; only real typing is worth replaying.
    if (busy) { if (!e.ctrlKey && !e.metaKey && (LETTERS[e.keycode] || ENDERS[e.keycode])) queued.push(e); return; }
    if (MODIFIERS.has(e.keycode)) return;
    if (e.ctrlKey && buf && /^[1-8]$/.test(DIGITS[e.keycode] ?? "")) return; // picked via the shortcut
    if (e.ctrlKey || e.altKey || e.metaKey) return buf ? reset() : (done = []);
    const ch = LETTERS[e.keycode];
    if (ch) { buf += ch; sel = 0; bindShortcuts(true); return show(); }
    if (e.keycode === K.Backspace) {
      if (!buf) return (done = []);
      buf = buf.slice(0, -1);
      return buf ? show() : reset(true);
    }
    if (buf && [K.Tab, K.Escape, K.Enter].includes(e.keycode)) return; // handled by the swallowing shortcuts
    const end = ENDERS[e.keycode];
    const c = end && (e.shiftKey ? end[1] : end[0]);
    if (c) {
      if (buf) commit({ trail: c, extra: 1 });
      else if (SENTENCE_END.has(c) || e.keycode === K.Enter) engine.learnPhrase(done), (done = []);
      return;
    }
    if (buf) reset(); else done = [];
  }

  return {
    get enabled() { return enabled; },
    set(on) {
      enabled = on;
      if (on && !started) {
        uIOhook.on("keydown", onKey);
        uIOhook.on("mousedown", () => (buf ? reset() : (done = [])));
        uIOhook.start();
        started = true;
      }
      if (!on) reset();
    },
    stop() { if (started) uIOhook.stop(); bindShortcuts(false); },
  };
}
