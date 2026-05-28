// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
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
                    DwmSetWindowAttribute, DWMWA_BORDER_COLOR,
                    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
                };

                let window = app.get_webview_window("main").unwrap();
                apply_acrylic(&window, Some((18, 18, 20, 90))).ok();

                if let Ok(hwnd) = window.hwnd() {
                    let hwnd = hwnd.0 as HWND;
                    let prefer_no_round: u32 = DWMWCP_DONOTROUND;
                    let border_none: u32 = 0xFFFFFFFE; // DWMWA_COLOR_NONE
                    unsafe {
                        DwmSetWindowAttribute(
                            hwnd,
                            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                            &prefer_no_round as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );
                        DwmSetWindowAttribute(
                            hwnd,
                            DWMWA_BORDER_COLOR as u32,
                            &border_none as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
