#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "windows")]
mod win {
    use std::ffi::c_void;

    pub type HWND = *mut c_void;
    pub type HRGN = *mut c_void;

    #[repr(C)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn GetClientRect(hwnd: HWND, rect: *mut RECT) -> i32;
        pub fn SetWindowRgn(hwnd: HWND, hrgn: HRGN, bredraw: i32) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateRoundRectRgn(
            x1: i32,
            y1: i32,
            x2: i32,
            y2: i32,
            ellipse_w: i32,
            ellipse_h: i32,
        ) -> HRGN;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        pub fn DwmSetWindowAttribute(
            hwnd: HWND,
            attr: u32,
            value: *const c_void,
            size: u32,
        ) -> i32;
    }

    pub const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    pub const DWMWCP_DONOTROUND: u32 = 1;

    pub const WINDOW_RADIUS_PX: i32 = 12;

    pub fn round_hwnd(hwnd: HWND) {
        unsafe {
            let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            if GetClientRect(hwnd, &mut rect) == 0 {
                return;
            }
            let w = rect.right - rect.left + 1;
            let h = rect.bottom - rect.top + 1;
            let region = CreateRoundRectRgn(
                0,
                0,
                w,
                h,
                WINDOW_RADIUS_PX * 2 + 1,
                WINDOW_RADIUS_PX * 2 + 1,
            );
            // Windows takes ownership of the region after this call.
            SetWindowRgn(hwnd, region, 1);
        }
    }

    pub fn disable_dwm_round(hwnd: HWND) {
        let prefer: u32 = DWMWCP_DONOTROUND;
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &prefer as *const _ as *const c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn tauri_hwnd_to_raw<T: tauri::Runtime>(window: &tauri::Window<T>) -> Option<win::HWND> {
    window.hwnd().ok().map(|h| h.0 as win::HWND)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "windows")]
            if let tauri::WindowEvent::Resized(_) = _event {
                if let Some(hwnd) = tauri_hwnd_to_raw(_window) {
                    win::round_hwnd(hwnd);
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                use window_vibrancy::{
                    apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
                };

                let window = app.get_webview_window("main").unwrap();
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(12.0),
                )
                .ok();
            }

            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                use window_vibrancy::apply_acrylic;

                let window = app.get_webview_window("main").unwrap();
                apply_acrylic(&window, Some((18, 18, 20, 90))).ok();

                if let Ok(h) = window.hwnd() {
                    let hwnd = h.0 as win::HWND;
                    win::disable_dwm_round(hwnd);
                    win::round_hwnd(hwnd);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
