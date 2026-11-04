// Declaring the app commands makes them subject to capabilities: a command is callable
// only from windows/origins that a capability in `capabilities/` grants it to.
const APP_COMMANDS: &[&str] = &[
    "platform_get_capabilities",
    "platform_list_displays",
    "platform_get_display_selection",
    "platform_set_display_selection",
    "platform_get_autostart",
    "platform_set_autostart",
    "platform_get_fullscreen",
    "platform_set_fullscreen",
    "platform_read_credential",
    "platform_write_credential",
    "platform_clear_credential",
    "platform_clear_all_credentials",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
