const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("hx", {
  analyze: (t) => ipcRenderer.invoke("analyze", t),
  commit: (t, picks) => ipcRenderer.send("commit", t, picks),
  hide: () => ipcRenderer.send("hide"),
  onShown: (f) => ipcRenderer.on("shown", f),
  onState: (f) => ipcRenderer.on("state", (_e, s) => f(s)),
  onToast: (f) => ipcRenderer.on("toast", (_e, m) => f(m)),
});
