// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "windows")]
const WINDOW_RADIUS_PX: i32 = 12;

#[cfg(target_os = "windows")]
fn apply_round_region(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Gdi::CreateRoundRectRgn;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClientRect, SetWindowRgn};

    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = hwnd.0 as HWND;
    unsafe {
        let mut rect: RECT = std::mem::zeroed();
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
        // Windows takes ownership of the region handle.
        SetWindowRgn(hwnd, region, 1);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|window, event| {
            #[cfg(target_os = "windows")]
            if let tauri::WindowEvent::Resized(_) = event {
                apply_round_region(window);
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = (window, event);
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
                use windows_sys::Win32::Foundation::HWND;
                use windows_sys::Win32::Graphics::Dwm::{
                    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
                    DWMWCP_DONOTROUND,
                };

                let window = app.get_webview_window("main").unwrap();
                apply_acrylic(&window, Some((18, 18, 20, 90))).ok();

                if let Ok(hwnd) = window.hwnd() {
                    let hwnd_raw = hwnd.0 as HWND;
                    let prefer_no_round: u32 = DWMWCP_DONOTROUND;
                    unsafe {
                        DwmSetWindowAttribute(
                            hwnd_raw,
                            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                            &prefer_no_round as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );
                    }
                }

                apply_round_region(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
