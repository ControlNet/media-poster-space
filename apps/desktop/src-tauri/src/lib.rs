use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, Position, Window};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const APP_SERVICE_NAME: &str = "media-poster-space";
const PLATFORM_STATE_FILE_NAME: &str = "platform-state.json";
// Written by earlier versions: passwords obfuscated with a key derived from data stored
// next to them. It is no longer read, and is deleted whenever we get the chance.
const LEGACY_FALLBACK_CREDENTIAL_FILE_NAME: &str = "credential-fallback.json";
const CREDENTIAL_NOT_STORED_KIND: &str = "not-stored";
const SECURE_SERVICE_KIND: &str = "secure-service";

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PlatformStateFile {
    display_selection: Option<String>,
    autostart_enabled: bool,
    // Keychain account names (`server::username`) this app has written. The keychain
    // cannot be enumerated portably, so "forget all" needs this index. It holds no secret.
    credential_identities: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformCapabilities {
    is_desktop: bool,
    is_linux: bool,
    is_portable: bool,
    secure_credential_storage: bool,
    linux_secret_service_available: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayOption {
    id: String,
    label: String,
    is_primary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialWriteResult {
    storage_kind: String,
    warning: Option<String>,
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

/// Writes through a temporary file and a rename so a crash never leaves a truncated file.
fn write_file_atomically(path: &Path, payload: &str) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, payload).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, path).map_err(|error| error.to_string())
}

fn resolve_portable_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("MPS_PORTABLE_DIR") {
        if !dir.trim().is_empty() {
            return Some(PathBuf::from(dir));
        }
    }

    if std::env::var("MPS_PORTABLE").ok().as_deref() == Some("1") {
        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(parent) = current_exe.parent() {
                return Some(parent.join("portable-data"));
            }
        }
    }

    None
}

fn resolve_data_root(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    if let Some(portable_dir) = resolve_portable_dir() {
        return Ok((portable_dir, true));
    }

    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;

    Ok((data_dir, false))
}

fn platform_state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let (root, _) = resolve_data_root(app)?;
    Ok(root.join(PLATFORM_STATE_FILE_NAME))
}

fn legacy_fallback_credential_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let (root, _) = resolve_data_root(app)?;
    Ok(root.join(LEGACY_FALLBACK_CREDENTIAL_FILE_NAME))
}

fn remove_legacy_fallback_credential_file(app: &AppHandle) -> Result<(), String> {
    let path = legacy_fallback_credential_file_path(app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not delete the legacy credential file: {error}"
        )),
    }
}

fn read_platform_state(app: &AppHandle) -> Result<PlatformStateFile, String> {
    let path = platform_state_file_path(app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(PlatformStateFile::default())
        }
        Err(error) => return Err(format!("Could not read platform state: {error}")),
    };

    match serde_json::from_str(&raw) {
        Ok(state) => Ok(state),
        Err(error) => {
            // A corrupted file must not disable every platform command forever. Start
            // over with defaults (the next write replaces the file) and say so.
            eprintln!(
                "[mps] Ignoring unreadable platform state at {}: {error}",
                path.display()
            );
            Ok(PlatformStateFile::default())
        }
    }
}

fn write_platform_state(app: &AppHandle, state: &PlatformStateFile) -> Result<(), String> {
    let path = platform_state_file_path(app)?;
    let payload = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    write_file_atomically(&path, &payload)
}

fn to_identity_key(server_url: &str, username: &str) -> String {
    format!(
        "{}::{}",
        server_url.trim().to_lowercase(),
        username.trim().to_lowercase()
    )
}

fn linux_secret_service_available() -> bool {
    if !cfg!(target_os = "linux") {
        return true;
    }

    std::env::var("MPS_SECRET_SERVICE_AVAILABLE")
        .map(|value| value != "0")
        .unwrap_or(true)
}

fn keyring_entry(identity_key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(APP_SERVICE_NAME, identity_key).map_err(|error| error.to_string())
}

fn secure_store_write(identity_key: &str, password: &str) -> Result<(), String> {
    keyring_entry(identity_key)?
        .set_password(password)
        .map_err(|error| error.to_string())
}

fn secure_store_read(identity_key: &str) -> Result<Option<String>, String> {
    match keyring_entry(identity_key)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn secure_store_delete(identity_key: &str) -> Result<(), String> {
    match keyring_entry(identity_key)?.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn remember_credential_identity(app: &AppHandle, identity_key: &str) -> Result<(), String> {
    let mut state = read_platform_state(app)?;
    if state
        .credential_identities
        .iter()
        .any(|known| known == identity_key)
    {
        return Ok(());
    }

    state.credential_identities.push(identity_key.to_string());
    write_platform_state(app, &state)
}

fn forget_credential_identity(app: &AppHandle, identity_key: &str) -> Result<(), String> {
    let mut state = read_platform_state(app)?;
    let known_count = state.credential_identities.len();
    state
        .credential_identities
        .retain(|known| known != identity_key);
    if state.credential_identities.len() == known_count {
        return Ok(());
    }

    write_platform_state(app, &state)
}

fn monitor_id(index: usize, monitor: &Monitor) -> String {
    let size = monitor.size();
    let position = monitor.position();
    format!(
        "display-{}-{}x{}-{},{}",
        index, size.width, size.height, position.x, position.y
    )
}

/// Moves the window onto the selected monitor (re-entering fullscreen there if needed).
fn apply_display_selection(window: &Window, display_id: &str) -> Result<(), String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let target = monitors
        .iter()
        .enumerate()
        .find(|(index, monitor)| monitor_id(*index, monitor) == display_id)
        .map(|(_, monitor)| monitor)
        .ok_or_else(|| format!("Display \"{display_id}\" is not connected."))?;

    let was_fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    if was_fullscreen {
        window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
    }

    let position = target.position();
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )))
        .map_err(|error| error.to_string())?;

    if was_fullscreen {
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn platform_get_capabilities(app: AppHandle) -> Result<PlatformCapabilities, String> {
    let (_, is_portable) = resolve_data_root(&app)?;
    let linux_secret_service_available = linux_secret_service_available();

    Ok(PlatformCapabilities {
        is_desktop: true,
        is_linux: cfg!(target_os = "linux"),
        is_portable,
        secure_credential_storage: !cfg!(target_os = "linux") || linux_secret_service_available,
        linux_secret_service_available,
    })
}

#[tauri::command]
fn platform_list_displays(window: Window) -> Result<Vec<DisplayOption>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;

    let display_options: Vec<DisplayOption> = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            let monitor_name = monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Display {}", index + 1));
            let monitor_size = monitor.size();
            let monitor_position = monitor.position();

            let is_primary = primary
                .as_ref()
                .map(|primary_monitor| {
                    primary_monitor.position() == monitor_position
                        && primary_monitor.size() == monitor_size
                })
                .unwrap_or(index == 0);

            DisplayOption {
                id: monitor_id(index, monitor),
                label: monitor_name,
                is_primary,
            }
        })
        .collect();

    Ok(display_options)
}

#[tauri::command]
fn platform_get_display_selection(app: AppHandle) -> Result<Option<String>, String> {
    let state = read_platform_state(&app)?;
    Ok(state.display_selection)
}

#[tauri::command]
fn platform_set_display_selection(
    app: AppHandle,
    window: Window,
    display_id: Option<String>,
) -> Result<(), String> {
    if let Some(display_id) = display_id.as_deref() {
        apply_display_selection(&window, display_id)?;
    }

    let mut state = read_platform_state(&app)?;
    state.display_selection = display_id;
    write_platform_state(&app, &state)
}

#[tauri::command]
fn platform_get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("Could not read the autostart setting: {error}"))
}

#[tauri::command]
fn platform_set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| format!("Could not change the autostart setting: {error}"))?;

    let mut state = read_platform_state(&app)?;
    state.autostart_enabled = enabled;
    write_platform_state(&app, &state)
}

#[tauri::command]
fn platform_get_fullscreen(window: Window) -> Result<bool, String> {
    window.is_fullscreen().map_err(|error| error.to_string())
}

#[tauri::command]
fn platform_set_fullscreen(window: Window, enabled: bool) -> Result<(), String> {
    window
        .set_fullscreen(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn platform_read_credential(server_url: String, username: String) -> Result<Option<String>, String> {
    if !linux_secret_service_available() {
        return Ok(None);
    }

    secure_store_read(&to_identity_key(&server_url, &username))
        .map_err(|error| format!("Could not read the remembered password: {error}"))
}

#[tauri::command]
fn platform_write_credential(
    app: AppHandle,
    server_url: String,
    username: String,
    password: String,
) -> Result<CredentialWriteResult, String> {
    // There is deliberately no local-file fallback: without an OS keychain any "encrypted"
    // copy would sit next to its own key. The password is simply not remembered.
    if !linux_secret_service_available() {
        return Ok(CredentialWriteResult {
            storage_kind: CREDENTIAL_NOT_STORED_KIND.to_string(),
            warning: Some(
                "No system keychain (Secret Service) is available, so the password was not remembered."
                    .to_string(),
            ),
        });
    }

    let identity_key = to_identity_key(&server_url, &username);
    if let Err(error_message) = secure_store_write(&identity_key, &password) {
        return Ok(CredentialWriteResult {
            storage_kind: CREDENTIAL_NOT_STORED_KIND.to_string(),
            warning: Some(format!(
                "Saving to the system keychain failed ({error_message}), so the password was not remembered."
            )),
        });
    }

    remember_credential_identity(&app, &identity_key)?;
    remove_legacy_fallback_credential_file(&app)?;

    Ok(CredentialWriteResult {
        storage_kind: SECURE_SERVICE_KIND.to_string(),
        warning: None,
    })
}

#[tauri::command]
fn platform_clear_credential(
    app: AppHandle,
    server_url: String,
    username: String,
) -> Result<(), String> {
    let identity_key = to_identity_key(&server_url, &username);
    remove_legacy_fallback_credential_file(&app)?;
    if linux_secret_service_available() {
        secure_store_delete(&identity_key)
            .map_err(|error| format!("Could not remove the remembered password: {error}"))?;
    }

    forget_credential_identity(&app, &identity_key)
}

#[tauri::command]
fn platform_clear_all_credentials(app: AppHandle) -> Result<(), String> {
    remove_legacy_fallback_credential_file(&app)?;

    let mut state = read_platform_state(&app)?;
    if !linux_secret_service_available() {
        return Ok(());
    }

    let mut failures = Vec::new();
    let mut remaining = Vec::new();
    for identity_key in &state.credential_identities {
        if let Err(error) = secure_store_delete(identity_key) {
            failures.push(error);
            remaining.push(identity_key.clone());
        }
    }

    state.credential_identities = remaining;
    write_platform_state(&app, &state)?;

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Could not remove {} remembered password(s) from the system keychain: {}",
            failures.len(),
            failures.join("; ")
        ))
    }
}

fn restore_window_placement(app: &AppHandle) -> Result<(), String> {
    let display_selection = read_platform_state(app)?.display_selection;
    let Some(display_id) = display_selection else {
        return Ok(());
    };

    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is not available.".to_string());
    };

    apply_display_selection(&window.as_ref().window(), &display_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Option::<Vec<&str>>::None,
        ))
        .setup(|app| {
            let handle = app.handle();
            if let Err(error) = remove_legacy_fallback_credential_file(handle) {
                eprintln!("[mps] {error}");
            }
            // A display that was unplugged since the last run is not fatal: the window
            // simply opens where the OS puts it.
            if let Err(error) = restore_window_placement(handle) {
                eprintln!("[mps] Could not restore the selected display: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_get_capabilities,
            platform_list_displays,
            platform_get_display_selection,
            platform_set_display_selection,
            platform_get_autostart,
            platform_set_autostart,
            platform_get_fullscreen,
            platform_set_fullscreen,
            platform_read_credential,
            platform_write_credential,
            platform_clear_credential,
            platform_clear_all_credentials
        ])
        .run(tauri::generate_context!())
        .expect("error while running media-poster-space desktop application");
}
