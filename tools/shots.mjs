// Builds docs/screenshot-*.png from the app's real UI (web/overlay.html + a preload stub) fed by the real engine:
//   npx electron tools/shots.mjs
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Transliterator } from "../lekhani/translit.js";
import { createEngine } from "../web/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const best = (s) => s.replace(/[A-Za-z]+/g, (w) => engine.best(w));
let engine;

async function render(win, url, w, h) {
  win.setContentSize(w, h);
  await win.loadURL(url);
  await sleep(700);
  return win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
}

app.whenReady().then(async () => {
  const bytes = (f) => new Uint8Array(fs.readFileSync(path.join(root, "lekhani", f)));
  engine = await createEngine({
    Transliterator,
    assets: { model: bytes("model.q4.gz"), json: bytes("model.json.gz"), words: bytes("words.bin.gz"),
      rerank: JSON.parse(fs.readFileSync(path.join(root, "lekhani", "rerank.json"), "utf8")) },
    phrases: JSON.parse(fs.readFileSync(path.join(root, "phrases.json"), "utf8")),
  });

  // 1) the suggestion bar, rendered by the real overlay.html
  const bar = new BrowserWindow({ width: 640, height: 130, show: false, transparent: true, frame: false, useContentSize: true,
    webPreferences: { offscreen: true, preload: path.join(here, "shots-preload.cjs"), contextIsolation: true } });
  await bar.loadFile(path.join(root, "web", "overlay.html"));
  const done = ["shaam", "ko"], part = "mil", spellings = engine.spellings(part).slice(0, 5);
  bar.webContents.send("state", { roman: part, spellings, sel: 0, phrases: engine.phrases(done, part).map((p) => p.dev), base: 5 });
  await sleep(600);
  const barImg = await bar.webContents.capturePage({ x: 0, y: 0, width: 640, height: 130 });
  const barUrl = "data:image/png;base64," + barImg.toPNG().toString("base64");

  // 2) scenes
  const sentence = (s) => best(s);
  const scene = new BrowserWindow({ width: 1100, height: 560, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  const load = (text, bar) => pathToFileURL(path.join(here, "art", "scene.html")).href +
    "?text=" + encodeURIComponent(text) + (bar ? "&bar=" + encodeURIComponent(bar) : "");
  const k = 0.8;
  for (const [name, text, withBar] of [
    ["screenshot-live", sentence("kaise ho dost, aaj shaam ko") + " <span class=lat>mil</span>", true],
    ["screenshot-result", sentence("kaise ho dost, aaj shaam ko milte hain. mujhe bahut khushi hui."), false],
  ]) {
    scene.setContentSize(Math.round(1100 * k), Math.round(560 * k));
    await scene.loadURL(load(text, withBar ? barUrl : null));
    scene.webContents.setZoomFactor(k);
    await sleep(900);
    const img = await scene.webContents.capturePage({ x: 0, y: 0, width: Math.round(1100 * k), height: Math.round(560 * k) });
    fs.writeFileSync(path.join(root, "docs", name + ".png"), img.resize({ width: 1100, height: 560, quality: "best" }).toPNG());
  }
  app.quit();
});
