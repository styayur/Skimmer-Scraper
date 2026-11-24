#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod library;
mod official_pack;
mod packs;
use library::*;
use official_pack::*;
use packs::*;

fn main() {
    tauri::Builder::default()
        .manage(PackDownload::default())
        .invoke_handler(tauri::generate_handler![
            world_save,
            world_list,
            world_read,
            world_remove,
            pack_begin,
            pack_put,
            pack_finish,
            pack_abort,
            pack_list,
            pack_read,
            pack_remove,
            pack_verify,
            official_pack_install,
            official_pack_progress,
            official_pack_cancel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Skimmer-Scraper");
}
