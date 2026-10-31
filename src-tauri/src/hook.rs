//! System-wide keyboard hook (rdev) and key synthesis. Key events go to the "engine" window, which owns the
//! Hinglish state machine (web/live.mjs).

use rdev::{listen, simulate, Button, EventType, Key};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::{mpsc, Once};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub static HOOK_ON: AtomicBool = AtomicBool::new(false);
pub static BOX_VISIBLE: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct KeyEvent {
    key: &'static str,
    ctrl: bool,
    shift: bool,
    alt: bool,
    meta: bool,
}

fn key_name(k: Key) -> &'static str {
    use Key::*;
    match k {
        KeyA => "a", KeyB => "b", KeyC => "c", KeyD => "d", KeyE => "e", KeyF => "f", KeyG => "g",
        KeyH => "h", KeyI => "i", KeyJ => "j", KeyK => "k", KeyL => "l", KeyM => "m", KeyN => "n",
        KeyO => "o", KeyP => "p", KeyQ => "q", KeyR => "r", KeyS => "s", KeyT => "t", KeyU => "u",
        KeyV => "v", KeyW => "w", KeyX => "x", KeyY => "y", KeyZ => "z",
        Num0 => "0", Num1 => "1", Num2 => "2", Num3 => "3", Num4 => "4",
        Num5 => "5", Num6 => "6", Num7 => "7", Num8 => "8", Num9 => "9",
        Space => "Space", Comma => "Comma", Dot => "Period", Slash => "Slash", SemiColon => "Semicolon",
        Quote => "Quote", Minus => "Minus", Backspace => "Backspace", Tab => "Tab", Escape => "Escape",
        Return => "Enter",
        _ => "other",
    }
}

pub fn start(app: AppHandle) {
    static ONCE: Once = Once::new();
    ONCE.call_once(move || {
        // The hook callback must return quickly (on Windows it blocks every keystroke), so hand events off.
        let (tx, rx) = mpsc::channel::<KeyEvent>();
        let emitter = app.clone();
        std::thread::spawn(move || {
            for ev in rx {
                let _ = emitter.emit_to("engine", "key", ev);
            }
        });
        std::thread::spawn(move || {
            let (mut ctrl, mut shift, mut alt, mut meta) = (false, false, false, false);
            let res = listen(move |event| {
                let (key, down) = match event.event_type {
                    EventType::KeyPress(k) => (Some(k), true),
                    EventType::KeyRelease(k) => (Some(k), false),
                    EventType::ButtonPress(Button::Left | Button::Right | Button::Middle) => {
                        if HOOK_ON.load(Relaxed) && !BOX_VISIBLE.load(Relaxed) {
                            let _ = tx.send(KeyEvent { key: "mouse", ctrl, shift, alt, meta });
                        }
                        return;
                    }
                    _ => return,
                };
                let k = key.unwrap();
                match k {
                    Key::ControlLeft | Key::ControlRight => return ctrl = down,
                    Key::ShiftLeft | Key::ShiftRight => return shift = down,
                    Key::Alt | Key::AltGr => return alt = down,
                    Key::MetaLeft | Key::MetaRight => return meta = down,
                    Key::CapsLock => return,
                    _ => {}
                }
                if down && HOOK_ON.load(Relaxed) && !BOX_VISIBLE.load(Relaxed) {
                    let _ = tx.send(KeyEvent { key: key_name(k), ctrl, shift, alt, meta });
                }
            });
            if let Err(e) = res {
                eprintln!("keyboard hook failed: {e:?}");
            }
        });
    });
}

fn tap(keys: &[Key]) {
    let send = |t: EventType| {
        let _ = simulate(&t);
        std::thread::sleep(Duration::from_millis(2));
    };
    for k in keys {
        send(EventType::KeyPress(*k));
    }
    for k in keys.iter().rev() {
        send(EventType::KeyRelease(*k));
    }
}

pub fn backspace(n: usize) {
    for _ in 0..n {
        tap(&[Key::Backspace]);
    }
}

pub fn paste() {
    let m = if cfg!(target_os = "macos") { Key::MetaLeft } else { Key::ControlLeft };
    tap(&[m, Key::KeyV]);
}

pub fn enter() {
    tap(&[Key::Return]);
}
