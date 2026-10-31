mod hook;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const LEKHANI_URL: &str = "https://udgamlabs.com/models/lekhani";
const GITHUB_URL: &str = "https://github.com/anand34577/hinglish-typer";
const COMPOSING_KEYS: [&str; 11] = [
    "Tab", "Escape", "Enter", "Control+1", "Control+2", "Control+3", "Control+4", "Control+5", "Control+6",
    "Control+7", "Control+8",
];

struct Ui {
    tray: TrayIcon,
    live_item: CheckMenuItem<tauri::Wry>,
    live_key: String,
}

#[derive(Default)]
struct State {
    ui: Mutex<Option<Ui>>,
    shortcuts_on: AtomicBool,
    live_on: AtomicBool,
    toast_gen: AtomicU64,
    toast_active: AtomicBool,
}

fn win(app: &AppHandle, label: &str) -> WebviewWindow {
    app.get_webview_window(label).expect("window declared in tauri.conf.json")
}

// ---- placement ------------------------------------------------------------------------------

/// Work area of the monitor under the cursor: (x, y, width, height) in physical pixels.
fn work_area(app: &AppHandle) -> Option<(i32, i32, i32, i32)> {
    let cur = app.cursor_position().ok()?;
    let mon = app.monitor_from_point(cur.x, cur.y).ok().flatten().or_else(|| app.primary_monitor().ok().flatten())?;
    let wa = mon.work_area();
    Some((wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32))
}

fn place(app: &AppHandle, w: &WebviewWindow, y_of: impl Fn(i32, i32) -> i32) {
    let (Some((x, y, aw, ah)), Ok(size)) = (work_area(app), w.outer_size()) else { return };
    let (ww, wh) = (size.width as i32, size.height as i32);
    let _ = w.set_position(PhysicalPosition::new(x + (aw - ww) / 2, y + y_of(ah, wh)));
}

// ---- suggestion bar (click-through, never takes focus) ------------------------------------------

fn show_bar(app: &AppHandle) -> WebviewWindow {
    let bar = win(app, "overlay");
    place(app, &bar, |ah, wh| ah - wh - (60.0 * bar.scale_factor().unwrap_or(1.0)) as i32);
    let _ = bar.show();
    bar
}

#[tauri::command]
fn overlay_update(app: AppHandle, state: Option<serde_json::Value>) {
    let st = app.state::<State>();
    let bar = if state.is_some() { show_bar(&app) } else {
        let bar = win(&app, "overlay");
        if !st.toast_active.load(Relaxed) { let _ = bar.hide(); }
        bar
    };
    let _ = bar.emit("state", state);
}

fn toast(app: &AppHandle, msg: &str) {
    let st = app.state::<State>();
    let bar = show_bar(app);
    let _ = bar.emit("toast", msg);
    st.toast_active.store(true, Relaxed);
    let gen = st.toast_gen.fetch_add(1, Relaxed) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        let st = app.state::<State>();
        if st.toast_gen.load(Relaxed) == gen {
            st.toast_active.store(false, Relaxed);
            let _ = win(&app, "overlay").hide();
        }
    });
}

// ---- typing box ---------------------------------------------------------------------------------

fn show_box(app: &AppHandle) {
    let b = win(app, "box");
    place(app, &b, |ah, _| (ah as f64 * 0.3) as i32);
    hook::BOX_VISIBLE.store(true, Relaxed);
    let _ = b.show();
    let _ = b.set_focus();
    let _ = b.emit("shown", ());
}

#[tauri::command]
fn hide_box(app: AppHandle) {
    let b = win(&app, "box");
    if !hook::BOX_VISIBLE.swap(false, Relaxed) { return; }
    let _ = b.hide();
    #[cfg(target_os = "macos")]
    let _ = app.hide(); // hands focus back to the previous app
}

#[tauri::command]
fn box_commit(app: AppHandle, text: String) {
    if text.is_empty() { return hide_box(app); }
    let _ = app.clipboard().write_text(text);
    hide_box(app);
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(120));
        hook::paste();
    });
}

// ---- live typing plumbing (driven by the engine window) ------------------------------------------

#[tauri::command]
fn set_hook(app: AppHandle, on: bool) {
    if on { hook::start(app); }
    hook::HOOK_ON.store(on, Relaxed);
}

#[tauri::command]
fn bind_shortcuts(app: AppHandle, on: bool) {
    let st = app.state::<State>();
    if st.shortcuts_on.swap(on, Relaxed) == on { return; }
    let gs = app.global_shortcut();
    for acc in COMPOSING_KEYS {
        if !on { let _ = gs.unregister(acc); continue; }
        let name = acc.strip_prefix("Control+").unwrap_or(acc).to_string();
        let _ = gs.on_shortcut(acc, move |app, _, ev| {
            if ev.state == ShortcutState::Pressed { let _ = win(app, "engine").emit("shortcut", &name); }
        });
    }
}

#[tauri::command]
async fn replace_text(app: AppHandle, backspaces: usize, text: String, enter: bool) -> Result<(), String> {
    let saved = app.clipboard().read_text().unwrap_or_default();
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        hook::backspace(backspaces);
        let _ = a.clipboard().write_text(text);
        hook::paste();
        std::thread::sleep(Duration::from_millis(90));
        if enter { hook::enter(); }
        std::thread::sleep(Duration::from_millis(30));
        let _ = a.clipboard().write_text(saved);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn prefs_load(app: AppHandle) -> String {
    std::fs::read_to_string(prefs_path(&app)).unwrap_or_default()
}

#[tauri::command]
fn prefs_save(app: AppHandle, json: String) {
    let p = prefs_path(&app);
    if let Some(dir) = p.parent() { let _ = std::fs::create_dir_all(dir); }
    let _ = std::fs::write(p, json);
}

fn prefs_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap_or_default().join("prefs.json")
}

#[derive(serde::Serialize)]
struct Startup { off: bool }

#[tauri::command]
fn engine_ready(app: AppHandle) -> Startup {
    if std::env::args().any(|a| a == "--show") { show_box(&app); }
    Startup { off: std::env::args().any(|a| a == "--off") }
}

#[tauri::command]
fn live_state(app: AppHandle, on: bool, error: Option<String>) {
    let st = app.state::<State>();
    st.live_on.store(on, Relaxed);
    if let Some(ui) = st.ui.lock().unwrap().as_ref() {
        let _ = ui.tray.set_icon(Some(tray_icon(on)));
        let _ = ui.tray.set_tooltip(Some(format!(
            "Hinglish Typer: live typing {} ({})", if on { "ON" } else { "OFF" }, ui.live_key)));
        let _ = ui.live_item.set_checked(on);
    }
    match error {
        Some(e) => toast(&app, &format!("Live typing unavailable: {e}")),
        None => toast(&app, if on { "Hinglish typing ON — type anywhere" } else { "Hinglish typing OFF" }),
    }
}

// ---- about --------------------------------------------------------------------------------------

#[tauri::command]
fn open_link(app: AppHandle, which: String) {
    let url = match which.as_str() { "lekhani" => LEKHANI_URL, "github" => GITHUB_URL, _ => return };
    let _ = app.opener().open_url(url, None::<&str>);
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

fn show_about(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("about") { let _ = w.show(); let _ = w.set_focus(); return; }
    let built = tauri::WebviewWindowBuilder::new(app, "about", tauri::WebviewUrl::App("about.html".into()))
        .title("About Hinglish Typer").inner_size(480.0, 420.0).resizable(false).center().build();
    if let Ok(w) = built { let _ = w.set_focus(); }
}

// ---- tray ---------------------------------------------------------------------------------------

fn tray_icon(on: bool) -> Image<'static> {
    const S: u32 = 32;
    let (r, g, b) = if on { (240, 120, 30) } else { (150, 150, 150) };
    let mut px = Vec::with_capacity((S * S * 4) as usize);
    for y in 0..S {
        for x in 0..S {
            let d = (x as f32 - 15.5).powi(2) + (y as f32 - 15.5).powi(2);
            let a = ((15.0 - d.sqrt()).clamp(0.0, 1.0) * 255.0) as u8; // anti-aliased disc
            px.extend_from_slice(&[r, g, b, a]);
        }
    }
    Image::new_owned(px, S, S)
}

fn toggle_live(app: &AppHandle) {
    let _ = win(app, "engine").emit("toggle-live", ());
}

fn setup_tray(app: &AppHandle, live_key: &str, box_key: &str) -> tauri::Result<()> {
    let pretty = |k: &str| k.replace("CommandOrControl", if cfg!(target_os = "macos") { "Cmd" } else { "Ctrl" });
    let live_item = CheckMenuItem::with_id(app, "live", format!("Live typing in any app  ({})", pretty(live_key)), true, false, None::<&str>)?;
    let box_item = MenuItem::with_id(app, "box", format!("Open typing box  ({})", pretty(box_key)), true, None::<&str>)?;
    let login = CheckMenuItem::with_id(app, "login", "Start at login", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "About / Credits", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&live_item, &box_item, &login, &about, &PredefinedMenuItem::separator(app)?, &quit])?;

    let login_item = login.clone();
    let tray = TrayIconBuilder::with_id("main")
        .icon(tray_icon(false))
        .tooltip("Hinglish Typer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                toggle_live(tray.app_handle());
            }
        })
        .on_menu_event(move |app, ev| match ev.id().as_ref() {
            "live" => toggle_live(app),
            "box" => show_box(app),
            "login" => {
                let al = app.autolaunch();
                let _ = if login_item.is_checked().unwrap_or(false) { al.enable() } else { al.disable() };
            }
            "about" => show_about(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    *app.state::<State>().ui.lock().unwrap() = Some(Ui { tray, live_item, live_key: pretty(live_key) });
    Ok(())
}

pub fn run() {
    let live_key = std::env::var("HINGLISH_HOTKEY").unwrap_or_else(|_| "CommandOrControl+Shift+Space".into());
    let box_key = std::env::var("HINGLISH_BOX_HOTKEY").unwrap_or_else(|_| "CommandOrControl+Shift+H".into());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_box(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(State::default())
        .invoke_handler(tauri::generate_handler![
            overlay_update, hide_box, box_commit, set_hook, bind_shortcuts, replace_text, prefs_load, prefs_save,
            engine_ready, live_state, open_link, app_version
        ])
        .setup(move |app| {
            let h = app.handle();
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let bar = win(h, "overlay");
            let _ = bar.set_ignore_cursor_events(true);
            let _ = bar.set_always_on_top(true);

            let b = win(h, "box");
            let hh = h.clone();
            b.on_window_event(move |ev| {
                if let WindowEvent::Focused(false) = ev { hide_box(hh.clone()); }
            });

            setup_tray(h, &live_key, &box_key)?;

            let gs = h.global_shortcut();
            let live_sc: Result<Shortcut, _> = live_key.parse();
            let box_sc: Result<Shortcut, _> = box_key.parse();
            for (sc, key, is_live) in [(live_sc, &live_key, true), (box_sc, &box_key, false)] {
                let ok = sc.ok().map(|sc| gs.on_shortcut(sc, move |app, _, ev| {
                    if ev.state != ShortcutState::Pressed { return; }
                    if is_live { toggle_live(app) }
                    else if hook::BOX_VISIBLE.load(Relaxed) { hide_box(app.clone()) } else { show_box(app) }
                }).is_ok()).unwrap_or(false);
                if !ok { eprintln!("Could not register hotkey {key}; use the tray icon."); }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Hinglish Typer");

    app.run(|app, ev| match ev {
        tauri::RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(), // tray app: windows come and go
        tauri::RunEvent::Exit => { let _ = app.global_shortcut().unregister_all(); }
        _ => {}
    });
}
