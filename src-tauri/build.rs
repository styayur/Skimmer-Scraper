fn main() {
    let app = tauri_build::AppManifest::new().commands(&[
        "world_save",
        "world_list",
        "world_read",
        "world_remove",
        "pack_begin",
        "pack_put",
        "pack_finish",
        "pack_abort",
        "pack_list",
        "pack_read",
        "pack_remove",
        "pack_verify",
        "official_pack_install",
        "official_pack_progress",
        "official_pack_cancel",
        "desktop_release",
        "desktop_open_release",
        "desktop_choose_library",
        "desktop_environment",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(app))
        .expect("Tauri build configuration");
}
