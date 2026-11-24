use crate::library::{self, Result as LibraryResult};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    time::Duration,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn desktop_environment(app: AppHandle) -> Result<Value, String> {
    Ok(
        json!({ "webview2": tauri::webview_version().map_err(|e| e.to_string())?,
        "directory": library::directory(&app)? }),
    )
}

const RELEASES: &str = "https://github.com/styayur/Skimmer-Scraper/releases";

#[tauri::command]
pub async fn desktop_release() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| -> LibraryResult<Value> {
        let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none()).build()?;
        let response = client.get("https://api.github.com/repos/styayur/Skimmer-Scraper/releases/latest")
            .header("User-Agent", "Skimmer-Scraper/UpdateCheck").send()?.error_for_status()?;
        let release: Value = serde_json::from_reader(response.take(512 << 10))?;
        let tag = release["tag_name"].as_str().ok_or("缺少发行版本。")?;
        if !stable_tag(tag) || release["prerelease"] != false || release["draft"] != false {
            return Err("未找到正式发行版本。".into());
        }
        Ok(json!({ "tag": tag, "notes": release["body"].as_str().unwrap_or("").chars().take(8000).collect::<String>() }))
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

fn stable_tag(tag: &str) -> bool {
    let Some(version) = tag.strip_prefix('v') else {
        return false;
    };
    let parts: Vec<_> = version.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|s| {
            !s.is_empty()
                && s.len() <= 6
                && (s.len() == 1 || !s.starts_with('0'))
                && s.bytes().all(|c| c.is_ascii_digit())
        })
}

#[tauri::command]
pub fn desktop_open_release(tag: Option<String>) -> Result<(), String> {
    let url = match tag {
        Some(tag) if stable_tag(&tag) => format!("{RELEASES}/tag/{tag}"),
        None => format!("{RELEASES}/latest"),
        _ => return Err("无效的正式版本。".into()),
    };
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        let link: Vec<u16> = url.encode_utf16().chain([0]).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                windows_sys::w!("open"),
                link.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            return Err("无法打开默认浏览器。".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("需要 Windows 桌面版。".into())
    }
}

#[tauri::command]
pub async fn desktop_choose_library(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || -> LibraryResult<Option<String>> {
        #[cfg(windows)]
        let selected = rfd::FileDialog::new()
            .set_title("选择世界资源库存放位置")
            .pick_folder();
        #[cfg(not(windows))]
        let selected: Option<std::path::PathBuf> = None;
        let Some(parent) = selected else {
            return Ok(None);
        };
        let target = parent.join("Skimmer-Scraper-Worlds");
        library::check_path(&target)?;
        let _guard = library::LOCATION_LOCK
            .try_write()
            .map_err(|_| "世界库忙，请稍后重试。")?;
        let original = library::directory(&app)?;
        if target == original {
            return Ok(Some(target.display().to_string()));
        }
        let source = library::connect(&original)?;
        let active: bool = source.query_row(
            "SELECT EXISTS(SELECT 1 FROM packs WHERE ready=0 AND created>=unixepoch()-3600)",
            [],
            |r| r.get(0),
        )?;
        if active {
            return Err("请先完成或取消正在进行的资源包安装。".into());
        }
        std::fs::create_dir_all(&target)?;
        let destination = target.join("worlds.sqlite");
        library::check_path(&destination)?;
        if destination.exists() {
            return Err("此目录已有世界库，请选择空目录。".into());
        }
        let temporary = tempfile::NamedTempFile::new_in(&target)?;
        let (_, path) = temporary.into_parts();
        source.execute("VACUUM INTO ?1", [path.to_str().ok_or("无效目录。")?])?;
        let copy = rusqlite::Connection::open_with_flags(
            &path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        if copy.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))? != "ok" {
            return Err("世界库复制校验失败。".into());
        }
        drop(copy);
        path.persist_noclobber(destination)?;
        let root = app.path().app_local_data_dir()?;
        let mut pointer = tempfile::NamedTempFile::new_in(&root)?;
        pointer.write_all(&serde_json::to_vec(&target)?)?;
        pointer.as_file().sync_all()?;
        pointer.persist(root.join("library-location.json"))?;
        Ok(Some(target.display().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_links_accept_stable_versions_only() {
        assert!(stable_tag("v0.8.1"));
        for tag in ["v0.8.2-rc.1", "v0.8", "v0.8.01", "latest", "v0.8.1/path"] {
            assert!(!stable_tag(tag));
        }
    }
}
