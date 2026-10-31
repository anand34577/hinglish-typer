// Thin wrapper over the Tauri globals for the box and suggestion-bar pages (window.hx).
(() => {
  if (!window.__TAURI__) return; // docs tooling supplies its own window.hx
  const { invoke } = window.__TAURI__.core;
  const { listen, emit } = window.__TAURI__.event;
  let seq = 0;
  const pending = new Map();
  listen("analyze-result", ({ payload }) => { pending.get(payload.id)?.(payload.toks); pending.delete(payload.id); });
  window.hx = {
    analyze: (text) => new Promise((res) => { const id = ++seq; pending.set(id, res); emit("analyze", { id, text }); }),
    commit: (text, picks = []) => {
      picks.forEach(({ src, text: t }) => emit("learn", { src, text: t }));
      invoke("box_commit", { text });
    },
    hide: () => invoke("hide_box"),
    onShown: (f) => listen("shown", () => f()),
    onState: (f) => listen("state", ({ payload }) => f(payload)),
    onToast: (f) => listen("toast", ({ payload }) => f(payload)),
  };
})();
