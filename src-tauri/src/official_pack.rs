use crate::{library, packs};
use reqwest::{blocking::Client, redirect::Policy};
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, State};

const URL: &str = "https://github.com/styayur/Skimmer-Scraper/releases/download/v0.8.0/skimmer-scraper-v0.8.0-dragonspine-high.zip";
const SHA256: &str = "b71809dd42002004e8e7585626fde5c12fe0cf85980010d7166ac4a045bee6ae";
const SIZE: u64 = 112674389;

#[derive(Default)]
struct Transfer {
    cancelled: AtomicBool,
    received: AtomicU64,
    verified: AtomicU64,
}

impl Transfer {
    fn check(&self) -> library::Result<()> {
        if self.cancelled.load(Ordering::Relaxed) {
            return Err("安装已取消。".into());
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct PackDownload(Mutex<Option<Arc<Transfer>>>);

#[cfg(windows)]
pub fn check_space(directory: &Path, required: u64) -> library::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let path: Vec<u16> = directory.as_os_str().encode_wide().chain([0]).collect();
    let mut available = 0;
    // Windows writes the caller's available bytes to this live u64.
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    if available < required {
        return Err("资源库磁盘可用空间不足。".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn check_space(_: &Path, _: u64) -> library::Result<()> {
    Err("需要 Windows 桌面版。".into())
}

fn download(directory: &Path, transfer: &Transfer) -> library::Result<Value> {
    let mut db = library::connect(directory)?;
    check_space(directory, 4 * SIZE + (32 << 20))?;
    let mut temporary = tempfile::tempfile_in(directory)?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(300))
        .redirect(Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() <= 4
                && url.scheme() == "https"
                && matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.follow()
            } else {
                attempt.error("Unexpected release redirect")
            }
        }))
        .build()?;
    let mut body = client
        .get(URL)
        .header("User-Agent", "Skimmer-Scraper/WorldLibrary")
        .send()?
        .error_for_status()?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0; 128 << 10];
    let mut received = 0;
    loop {
        transfer.check()?;
        let count = body.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        received += count as u64;
        if received > SIZE {
            return Err("下载大小不符合发行清单。".into());
        }
        temporary.write_all(&buffer[..count])?;
        digest.update(&buffer[..count]);
        transfer.received.store(received, Ordering::Relaxed);
    }
    if received != SIZE || crate::library::hex_digest(&digest.finalize()) != SHA256 {
        return Err("发行附件 SHA-256 校验失败。".into());
    }
    temporary.rewind()?;
    install_archive(&mut db, temporary, transfer)
}

fn install_archive(db: &mut Connection, file: File, transfer: &Transfer) -> library::Result<Value> {
    let mut zip = zip::ZipArchive::new(file)?;
    let manifest: Value = serde_json::from_reader(zip.by_name("world-pack.json")?.take(1 << 20))?;
    let token = packs::begin(db, manifest.clone())?;
    let result = (|| -> library::Result<()> {
        for entry in manifest["files"].as_array().ok_or("缺少分块清单。")? {
            transfer.check()?;
            let tile = zip.by_name(entry["name"].as_str().ok_or("缺少分块名。")?)?;
            let size = entry["bytes"].as_u64().ok_or("缺少分块长度。")?;
            if size > 8 << 20 || tile.size() != size {
                return Err("分块大小错误。".into());
            }
            let mut data = Vec::with_capacity(size as usize);
            tile.take(size + 1).read_to_end(&mut data)?;
            packs::put(db, &token, &data)?;
            transfer.verified.fetch_add(1, Ordering::Relaxed);
        }
        transfer.check()?;
        packs::finish(db, token.clone())
    })();
    if let Err(error) = result {
        db.execute("DELETE FROM packs WHERE token=?1 AND ready=0", [&token])?;
        return Err(error);
    }
    Ok(manifest)
}

#[tauri::command]
pub async fn official_pack_install(
    app: AppHandle,
    state: State<'_, PackDownload>,
) -> Result<Value, String> {
    let dir = library::directory(&app)?;
    let transfer = Arc::new(Transfer::default());
    {
        let mut active = state.0.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("已有安装正在进行。".into());
        }
        *active = Some(transfer.clone());
    }
    let result = tauri::async_runtime::spawn_blocking(move || download(&dir, &transfer)).await;
    *state.0.lock().map_err(|e| e.to_string())? = None;
    result
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn official_pack_progress(state: State<PackDownload>) -> Result<Value, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.as_ref().map(|t| json!({
        "received": t.received.load(Ordering::Relaxed), "total": SIZE, "verified": t.verified.load(Ordering::Relaxed)
    })).unwrap_or(Value::Null))
}

#[tauri::command]
pub fn official_pack_cancel(state: State<PackDownload>) -> Result<(), String> {
    if let Some(t) = state.0.lock().map_err(|e| e.to_string())?.as_ref() {
        t.cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "downloads the pinned GitHub Release archive"]
    fn installs_public_archive_in_isolated_library() -> library::Result<()> {
        let dir = tempfile::tempdir()?;
        let transfer = Transfer::default();
        let manifest = download(dir.path(), &transfer)?;
        assert_eq!(manifest["id"], "dragonspine-high-1");
        assert_eq!(transfer.verified.load(Ordering::Relaxed), 100);
        let db = library::connect(dir.path())?;
        let size: u64 = db.query_row(
            "SELECT SUM(length(data)) FROM tiles JOIN packs USING(token) WHERE ready=1",
            [], |row| row.get(0))?;
        assert_eq!(size, manifest["files"].as_array().unwrap().iter()
            .map(|f| f["bytes"].as_u64().unwrap()).sum::<u64>());
        Ok(())
    }
}
