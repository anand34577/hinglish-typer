import { app, BrowserWindow, dialog, globalShortcut, ipcMain, clipboard, shell, Tray, Menu, nativeImage, screen } from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "./engine.mjs";
import { createLive } from "./live.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const LIVE_KEY = process.env.HINGLISH_HOTKEY || "CommandOrControl+Shift+Space";
const BOX_KEY = process.env.HINGLISH_BOX_HOTKEY || "CommandOrControl+Shift+H";
const IS_MAC = process.platform === "darwin";

if (!app.requestSingleInstanceLock()) app.quit();
if (IS_MAC) app.dock?.hide();

let box, bar, tray, engine, live;
const webPrefs = { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true };

// ---- typing box (manual popup) -------------------------------------------------------------
ipcMain.handle("analyze", (_e, text) => engine.analyze(text));

function pasteIntoPreviousApp() {
  if (process.platform === "win32") {
    execFile("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command",
      "(New-Object -ComObject WScript.Shell).SendKeys('^v')"], () => {});
  } else if (IS_MAC) {
    execFile("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down'], () => {});
  } else {
    execFile("xdotool", ["key", "--clearmodifiers", "ctrl+v"], () => {}); // X11 only
  }
}

ipcMain.on("commit", (_e, text, picks = []) => {
  picks.forEach(({ src, text: t }) => engine.learnWord(src, t));
  if (!text) return hideBox();
  clipboard.writeText(text);
  hideBox();
  setTimeout(pasteIntoPreviousApp, 120);
});
ipcMain.on("hide", hideBox);

function hideBox() {
  if (!box?.isVisible()) return;
  box.hide();
  if (IS_MAC) app.hide(); // hands focus back to the previous app
}

function showBox() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [w] = box.getSize();
  box.setPosition(Math.round(workArea.x + (workArea.width - w) / 2), Math.round(workArea.y + workArea.height * 0.3));
  box.show();
  box.focus();
  box.webContents.send("shown");
}

// ---- suggestion bar (click-through, never takes focus) ----------------------------------------
function placeBar() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [w, h] = bar.getSize();
  bar.setPosition(Math.round(workArea.x + (workArea.width - w) / 2), Math.round(workArea.y + workArea.height - h - 60));
}
const overlay = {
  update(state) {
    if (state) { placeBar(); bar.showInactive(); } else if (!toastTimer) bar.hide();
    bar.webContents.send("state", state);
  },
};
let toastTimer;
function toast(msg) {
  placeBar(); bar.showInactive(); bar.webContents.send("toast", msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastTimer = null; bar.hide(); }, 1500);
}

// ---- tray / mode ---------------------------------------------------------------------------
function trayIcon(on) {
  const s = 16, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const inside = (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 49;
    buf.set(inside ? (on ? [240, 120, 30, 255] : [150, 150, 150, 255]) : [0, 0, 0, 0], (y * s + x) * 4); // BGRA
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}

function setLive(on) {
  try { live.set(on); } catch (err) {
    toast("Live typing unavailable: " + err.message);
    on = false;
  }
  tray.setImage(trayIcon(on));
  tray.setToolTip(`Hinglish Typer: live typing ${on ? "ON" : "OFF"} (${LIVE_KEY})`);
  buildMenu();
  toast(on ? "Hinglish typing ON — type anywhere" : "Hinglish typing OFF");
}

function about() {
  dialog.showMessageBox({
    type: "info", title: "Hinglish Typer", message: `Hinglish Typer ${app.getVersion()}`,
    detail: [
      "Offline Hinglish to Devanagari typing.",
      "",
      "Transliteration by Lekhani, Copyright 2026 Udgam Labs LLP (Apache-2.0; word list CC0).",
      "Lekhani builds on AI4Bharat's Aksharantar, IndicXlit and IndicCorp v2, and the CMU Pronouncing Dictionary.",
      "Also: Electron (MIT), uiohook-napi (MIT), libuiohook (LGPL-3.0).",
      "",
      "Full credits: THIRD_PARTY_NOTICES.md",
    ].join(String.fromCharCode(10)),
    buttons: ["Close", "Open Lekhani page", "Project on GitHub"], defaultId: 0,
  }).then(({ response }) => {
    if (response === 1) shell.openExternal("https://udgamlabs.com/models/lekhani");
    if (response === 2) shell.openExternal("https://github.com/anand34577/hinglish-typer");
  });
}

function buildMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Live typing in any app", type: "checkbox", accelerator: LIVE_KEY, checked: live.enabled, click: () => setLive(!live.enabled) },
    { label: "Open typing box", accelerator: BOX_KEY, click: showBox },
    { label: "Start at login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: "About / Credits", click: about },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  engine = await createEngine(path.join(app.getPath("userData")));

  box = new BrowserWindow({
    width: 620, height: 190, show: false, frame: false, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, fullscreenable: false, backgroundColor: "#1b1d23", webPreferences: webPrefs,
  });
  box.setAlwaysOnTop(true, "screen-saver");
  box.loadFile(path.join(here, "index.html"));
  box.on("blur", hideBox);

  bar = new BrowserWindow({
    width: 640, height: 130, show: false, frame: false, transparent: true, resizable: false, focusable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, webPreferences: webPrefs,
  });
  bar.setAlwaysOnTop(true, "screen-saver");
  bar.setIgnoreMouseEvents(true);
  bar.loadFile(path.join(here, "overlay.html"));

  live = createLive({ engine, overlay, isPaused: () => box.isVisible() });
  tray = new Tray(trayIcon(false));
  tray.on("click", () => setLive(!live.enabled));
  buildMenu();

  for (const [key, fn] of [[LIVE_KEY, () => setLive(!live.enabled)], [BOX_KEY, () => (box.isVisible() ? hideBox() : showBox())]])
    if (!globalShortcut.register(key, fn)) console.error(`Could not register hotkey ${key}; use the tray icon.`);

  if (!process.argv.includes("--off")) setLive(true);
  if (process.argv.includes("--show")) showBox();
});

app.on("second-instance", () => box && showBox());
app.on("window-all-closed", (e) => e.preventDefault());
app.on("will-quit", () => { globalShortcut.unregisterAll(); live?.stop(); });
