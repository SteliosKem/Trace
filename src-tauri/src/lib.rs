#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "windows")]
const WINDOW_RADIUS_PX: i32 = 12;

#[cfg(target_os = "windows")]
fn round_hwnd(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::CreateRoundRectRgn;
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, SetWindowRgn};

    let mut rect = RECT::default();
    unsafe {
        if GetClientRect(hwnd, &mut rect).is_err() {
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
        // Windows takes ownership of the region handle after this call.
        SetWindowRgn(hwnd, Some(region), true);
    }
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
                if let Ok(hwnd) = _window.hwnd() {
                    round_hwnd(hwnd);
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
                use windows::Win32::Graphics::Dwm::{
                    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
                    DWMWCP_DONOTROUND,
                };

                let window = app.get_webview_window("main").unwrap();
                apply_acrylic(&window, Some((18, 18, 20, 90))).ok();

                if let Ok(hwnd) = window.hwnd() {
                    let prefer_no_round = DWMWCP_DONOTROUND.0 as u32;
                    unsafe {
                        let _ = DwmSetWindowAttribute(
                            hwnd,
                            DWMWA_WINDOW_CORNER_PREFERENCE,
                            &prefer_no_round as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );
                    }
                    round_hwnd(hwnd);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
