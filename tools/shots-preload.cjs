// Stand-in for the Tauri bridge when tools/shots.mjs renders web/overlay.html inside Electron.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("hx", {
  onState: (f) => ipcRenderer.on("state", (_e, s) => f(s)),
  onToast: (f) => ipcRenderer.on("toast", (_e, m) => f(m)),
});
