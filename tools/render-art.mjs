// Renders tools/art/*.html to docs/*.png: `npx electron tools/render-art.mjs`
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "docs");
const jobs = [
  ["banner", 1600, 400, "banner"], ["social", 1280, 640, "social-preview"],
  ["card-live", 1200, 675, "promo-live"], ["card-phrases", 1200, 675, "promo-phrases"],
  ["card-learns", 1200, 675, "promo-learns"], ["card-private", 1200, 675, "promo-private"],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 400, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  for (const [page, w, h, name] of jobs) {
    // Render at a size that fits any screen, then scale to the target.
    const k = Math.min(1, 800 / h), vw = Math.round(w * k), vh = Math.round(h * k);
    win.setContentSize(vw, vh);
    await win.loadURL(pathToFileURL(path.join(here, "art", page + ".html")).href);
    win.webContents.setZoomFactor(k);
    await sleep(700);
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: vw, height: vh });
    fs.writeFileSync(path.join(out, name + ".png"), img.resize({ width: w, height: h, quality: "best" }).toPNG());
  }
  app.quit();
});
