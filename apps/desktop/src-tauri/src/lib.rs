use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const APP_SERVICE_NAME: &str = "media-poster-space";
const PLATFORM_STATE_FILE_NAME: &str = "platform-state.json";
const FALLBACK_CREDENTIAL_FILE_NAME: &str = "credential-fallback.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformStateFile {
    display_selection: Option<String>,
    autostart_enabled: bool,
}

impl Default for PlatformStateFile {
    fn default() -> Self {
        Self {
            display_selection: None,
            autostart_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FallbackCredentialEntry {
    nonce: String,
    cipher_text: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FallbackCredentialStore {
    entries: HashMap<String, FallbackCredentialEntry>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialIdentityInput {
    server_url: String,
    username: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialWriteInput {
    server_url: String,
    username: String,
    password: String,
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

fn fallback_credential_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let (root, _) = resolve_data_root(app)?;
    Ok(root.join(FALLBACK_CREDENTIAL_FILE_NAME))
}

fn read_platform_state(app: &AppHandle) -> Result<PlatformStateFile, String> {
    let path = platform_state_file_path(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return Ok(PlatformStateFile::default()),
    };

    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_platform_state(app: &AppHandle, state: &PlatformStateFile) -> Result<(), String> {
    let path = platform_state_file_path(app)?;
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn read_fallback_store(app: &AppHandle) -> Result<FallbackCredentialStore, String> {
    let path = fallback_credential_file_path(app)?;
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return Ok(FallbackCredentialStore::default()),
    };

    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_fallback_store(app: &AppHandle, store: &FallbackCredentialStore) -> Result<(), String> {
    let path = fallback_credential_file_path(app)?;
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string_pretty(store).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn to_identity_key(server_url: &str, username: &str) -> String {
    format!(
        "{}::{}",
        server_url.trim().to_lowercase(),
        username.trim().to_lowercase()
    )
}

fn weak_fallback_key(identity_key: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(APP_SERVICE_NAME.as_bytes());
    hasher.update(identity_key.as_bytes());
    let digest = hasher.finalize();
    let mut key = [0_u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn weak_encrypt(identity_key: &str, plain_text: &str) -> FallbackCredentialEntry {
    let key = weak_fallback_key(identity_key);
    let mut nonce = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut nonce);
    let plain_bytes = plain_text.as_bytes();

    let cipher_bytes: Vec<u8> = plain_bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()] ^ nonce[index % nonce.len()])
        .collect();

    FallbackCredentialEntry {
        nonce: BASE64_STANDARD.encode(nonce),
        cipher_text: BASE64_STANDARD.encode(cipher_bytes),
    }
}

fn weak_decrypt(identity_key: &str, entry: &FallbackCredentialEntry) -> Option<String> {
    let key = weak_fallback_key(identity_key);
    let nonce = BASE64_STANDARD.decode(&entry.nonce).ok()?;
    let cipher_bytes = BASE64_STANDARD.decode(&entry.cipher_text).ok()?;

    if nonce.is_empty() {
        return None;
    }

    let plain_bytes: Vec<u8> = cipher_bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()] ^ nonce[index % nonce.len()])
        .collect();

    String::from_utf8(plain_bytes).ok()
}

fn linux_secret_service_available() -> bool {
    if !cfg!(target_os = "linux") {
        return true;
    }

    std::env::var("MPS_SECRET_SERVICE_AVAILABLE")
        .map(|value| value != "0")
        .unwrap_or(true)
}

fn secure_store_write(server_url: &str, username: &str, password: &str) -> Result<(), String> {
    let identity_key = to_identity_key(server_url, username);
    let entry =
        keyring::Entry::new(APP_SERVICE_NAME, &identity_key).map_err(|error| error.to_string())?;
    entry
        .set_password(password)
        .map_err(|error| error.to_string())
}

fn secure_store_read(server_url: &str, username: &str) -> Result<Option<String>, String> {
    let identity_key = to_identity_key(server_url, username);
    let entry =
        keyring::Entry::new(APP_SERVICE_NAME, &identity_key).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn secure_store_delete(server_url: &str, username: &str) -> Result<(), String> {
    let identity_key = to_identity_key(server_url, username);
    let entry =
        keyring::Entry::new(APP_SERVICE_NAME, &identity_key).map_err(|error| error.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn fallback_store_write(app: &AppHandle, input: &CredentialWriteInput) -> Result<(), String> {
    let identity_key = to_identity_key(&input.server_url, &input.username);
    let mut store = read_fallback_store(app)?;
    let encrypted = weak_encrypt(&identity_key, &input.password);
    store.entries.insert(identity_key, encrypted);
    write_fallback_store(app, &store)
}

fn fallback_store_read(
    app: &AppHandle,
    identity: &CredentialIdentityInput,
) -> Result<Option<String>, String> {
    let identity_key = to_identity_key(&identity.server_url, &identity.username);
    let store = read_fallback_store(app)?;
    let entry = match store.entries.get(&identity_key) {
        Some(entry) => entry,
        None => return Ok(None),
    };

    Ok(weak_decrypt(&identity_key, entry))
}

fn fallback_store_delete(
    app: &AppHandle,
    identity: &CredentialIdentityInput,
) -> Result<(), String> {
    let identity_key = to_identity_key(&identity.server_url, &identity.username);
    let mut store = read_fallback_store(app)?;
    store.entries.remove(&identity_key);
    write_fallback_store(app, &store)
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

            let monitor_id = format!(
                "display-{}-{}x{}-{},{}",
                index,
                monitor_size.width,
                monitor_size.height,
                monitor_position.x,
                monitor_position.y
            );

            let is_primary = primary
                .as_ref()
                .map(|primary_monitor| {
                    primary_monitor.position() == monitor_position
                        && primary_monitor.size() == monitor_size
                })
                .unwrap_or(index == 0);

            DisplayOption {
                id: monitor_id,
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
    display_id: Option<String>,
) -> Result<(), String> {
    let mut state = read_platform_state(&app)?;
    state.display_selection = display_id;
    write_platform_state(&app, &state)
}

#[tauri::command]
fn platform_get_autostart(app: AppHandle) -> Result<bool, String> {
    let fallback = read_platform_state(&app)?.autostart_enabled;
    let manager = app.autolaunch();
    match manager.is_enabled() {
        Ok(enabled) => Ok(enabled),
        Err(_) => Ok(fallback),
    }
}

#[tauri::command]
fn platform_set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let _ = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };

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
fn platform_read_credential(
    app: AppHandle,
    server_url: String,
    username: String,
) -> Result<Option<String>, String> {
    let identity = CredentialIdentityInput {
        server_url,
        username,
    };

    if linux_secret_service_available() {
        match secure_store_read(&identity.server_url, &identity.username) {
            Ok(value) => return Ok(value),
            Err(_) => {}
        }
    }

    fallback_store_read(&app, &identity)
}

#[tauri::command]
fn platform_write_credential(
    app: AppHandle,
    server_url: String,
    username: String,
    password: String,
) -> Result<CredentialWriteResult, String> {
    let input = CredentialWriteInput {
        server_url,
        username,
        password,
    };

    if cfg!(target_os = "linux") && !linux_secret_service_available() {
        fallback_store_write(&app, &input)?;
        return Ok(CredentialWriteResult {
      storage_kind: "linux-weak-fallback".to_string(),
      warning: Some(
        "Linux secret-service unavailable. Using weak encrypted fallback in local app data.".to_string(),
      ),
    });
    }

    match secure_store_write(&input.server_url, &input.username, &input.password) {
        Ok(()) => Ok(CredentialWriteResult {
            storage_kind: "secure-service".to_string(),
            warning: None,
        }),
        Err(error_message) => {
            fallback_store_write(&app, &input)?;

            let warning = if cfg!(target_os = "linux") {
                Some(format!(
          "Secret-service write failed ({error_message}). Falling back to weak encrypted local storage."
        ))
            } else {
                Some(format!(
          "Secure credential write failed ({error_message}). Falling back to encrypted local storage."
        ))
            };

            Ok(CredentialWriteResult {
                storage_kind: if cfg!(target_os = "linux") {
                    "linux-weak-fallback".to_string()
                } else {
                    "local-encrypted-fallback".to_string()
                },
                warning,
            })
        }
    }
}

#[tauri::command]
fn platform_clear_credential(
    app: AppHandle,
    server_url: String,
    username: String,
) -> Result<(), String> {
    let identity = CredentialIdentityInput {
        server_url,
        username,
    };
    let _ = secure_store_delete(&identity.server_url, &identity.username);
    fallback_store_delete(&app, &identity)
}

#[tauri::command]
fn platform_clear_all_credentials(app: AppHandle) -> Result<(), String> {
    let empty_store = FallbackCredentialStore::default();
    write_fallback_store(&app, &empty_store)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Option::<Vec<&str>>::None,
        ))
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
