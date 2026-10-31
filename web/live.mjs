const LETTER = /^[a-z]$/;
const DIGIT = /^[0-9]$/;
// US-layout characters that end a word: key name -> [plain, shifted]
const ENDERS = {
  Space: [" ", " "], Comma: [",", null], Period: [".", null], Slash: ["/", "?"],
  Semicolon: [";", ":"], Quote: ["'", '"'], Minus: ["-", null],
  1: ["1", "!"], 9: ["9", "("], 0: ["0", ")"],
  ...Object.fromEntries("2345678".split("").map((c) => [c, [c, null]])),
};
const SENTENCE_END = new Set([".", "?", "!", ":", ";"]);
const SPELLINGS = 5;

// System-wide Hinglish typing. Letters land in the focused field as typed; when the word ends we erase them
// and paste the Devanagari. While a word is in progress a floating bar shows spellings and phrase completions.
//
// The native side (Rust) owns the keyboard hook, key synthesis, clipboard and overlay window; `io` is its face:
//   io.setHook(on)            start/stop delivering key events to onKey
//   io.setShortcuts(on)       swallow Tab/Esc/Enter/Ctrl+1..8 while a word is in progress (delivered to onShortcut)
//   io.update(state | null)   show or hide the suggestion bar
//   io.replace(n, text, enter) async: erase n characters, paste text, optionally press Enter
// Key events look like { key, ctrl, shift, alt, meta } with key = "a".."z", "0".."9", "Space", "Comma", "Period",
// "Slash", "Semicolon", "Quote", "Minus", "Backspace", "Tab", "Escape", "Enter", "mouse" or "other".
export function createLive({ engine, io }) {
  let enabled = false, busy = false, shortcuts = false;
  const queued = [];
  let buf = "", sel = 0, cands = [], phr = [], done = []; // done: romanised words of the current phrase

  function bindShortcuts(on) {
    if (on === shortcuts) return;
    shortcuts = on;
    io.setShortcuts(on);
  }

  function show() {
    cands = engine.spellings(buf).slice(0, SPELLINGS);
    phr = engine.phrases(done, buf);
    sel = Math.min(sel, cands.length - 1);
    io.update({ roman: buf, spellings: cands, sel, phrases: phr.map((p) => p.dev), base: SPELLINGS });
  }

  function reset(keepPhrase = false) {
    if (!keepPhrase) { engine.learnPhrase(done); done = []; }
    buf = ""; sel = 0; cands = []; phr = [];
    bindShortcuts(false);
    io.update(null);
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
    Promise.resolve(io.replace(n, text + trail, enter)).catch(() => {}).finally(() => {
      busy = false;
      if (enter) done = [];
      for (const e of queued.splice(0)) onKey(e); // keys typed while we were replacing
    });
  }

  // Keys swallowed by global shortcuts while composing: "Tab", "Escape", "Enter", "1".."8" (with Ctrl).
  function onShortcut(name) {
    if (!enabled || !buf) return;
    if (name === "Tab") cycle();
    else if (name === "Escape") reset();
    else if (name === "Enter") commit({ enter: true });
    else if (/^[1-8]$/.test(name)) pick(+name - 1);
  }

  function onKey(e) {
    if (!enabled) return;
    if (e.key === "mouse") return buf ? reset() : (done = []);
    // Our own Backspace/Ctrl+V taps come back through the hook; only real typing is worth replaying.
    if (busy) { if (!e.ctrl && !e.meta && (LETTER.test(e.key) || ENDERS[e.key])) queued.push(e); return; }
    if (e.ctrl && buf && /^[1-8]$/.test(e.key)) return; // picked via the shortcut
    if (e.ctrl || e.alt || e.meta) return buf ? reset() : (done = []);
    if (LETTER.test(e.key)) { buf += e.key; sel = 0; bindShortcuts(true); return show(); }
    if (e.key === "Backspace") {
      if (!buf) return (done = []);
      buf = buf.slice(0, -1);
      return buf ? show() : reset(true);
    }
    if (buf && ["Tab", "Escape", "Enter"].includes(e.key)) return; // handled by the swallowing shortcuts
    const end = ENDERS[e.key];
    const c = end && (e.shift ? end[1] : end[0]);
    if (c) {
      if (buf) commit({ trail: c, extra: 1 });
      else if (SENTENCE_END.has(c)) engine.learnPhrase(done), (done = []);
      return;
    }
    if (buf) reset(); else done = [];
  }

  return {
    get enabled() { return enabled; },
    onKey,
    onShortcut,
    set(on) {
      if (on) io.setHook(true);
      enabled = on;
      if (!on) { reset(); io.setHook(false); }
    },
    stop() { enabled = false; bindShortcuts(false); io.setHook(false); },
  };
}
