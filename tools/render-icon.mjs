// Renders tools/icon.svg to build/icon.png (1024x1024) using Electron's own renderer: `npx electron tools/render-icon.mjs`
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 820, height: 820, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  const svg = fs.readFileSync(path.join(here, "icon.svg"), "utf8");
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:820px;height:820px}</style>${svg}`));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 820, height: 820 });
  fs.writeFileSync(path.join(here, "..", "build", "icon.png"), img.resize({ width: 1024, height: 1024, quality: "best" }).toPNG());
  app.quit();
});
