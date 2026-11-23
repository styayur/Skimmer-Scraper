#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod library;
use library::*;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            world_save,
            world_list,
            world_read,
            world_remove
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Skimmer-Scraper");
}
