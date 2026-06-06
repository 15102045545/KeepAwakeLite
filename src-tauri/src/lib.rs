mod activity;
mod metrics;
mod state;

#[cfg(test)]
mod activity_tests;

use state::{graceful_exit, ActivitySnapshot, BackendState};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, State, WindowEvent,
};

#[tauri::command]
async fn start_activity(
    app: AppHandle,
    state: State<'_, BackendState>,
) -> Result<ActivitySnapshot, String> {
    state.start(app).await
}

#[tauri::command]
async fn stop_activity(
    app: AppHandle,
    state: State<'_, BackendState>,
) -> Result<ActivitySnapshot, String> {
    state.stop(app).await
}

#[tauri::command]
async fn get_snapshot(state: State<'_, BackendState>) -> Result<ActivitySnapshot, String> {
    Ok(state.snapshot().await)
}

#[tauri::command]
async fn request_graceful_exit(app: AppHandle) -> Result<(), String> {
    graceful_exit(app).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BackendState::default())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    graceful_exit(app).await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_activity,
            stop_activity,
            get_snapshot,
            request_graceful_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running KeepAwakeLite");
}

fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    graceful_exit(app).await;
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
