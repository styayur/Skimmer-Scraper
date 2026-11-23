fn main() {
    let app = tauri_build::AppManifest::new().commands(&[
        "world_save",
        "world_list",
        "world_read",
        "world_remove",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(app))
        .expect("Tauri build configuration");
}
