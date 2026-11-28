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

const URL: &str = "https://github.com/styayur/Skimmer-Scraper/releases/download/v0.8.2/skimmer-scraper-v0.8.2-dragonspine-high.zip";
const SIZE: u64 = 133983219;
const SHA256: &str = "9c5dd4a211d348139101b85205619c0fd51bb007f5105fa98e9b3796f249616c";
const MANIFEST_SHA256: &str = "1f928dc502885002502d54bc882eebcef8a7c6694482e5e6304e6d8e829db788";

#[derive(Default)]
struct Transfer {
    cancelled: AtomicBool,
    received: AtomicU64,
    verified: AtomicU64,
    total: AtomicU64,
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

    let mut temporary = tempfile::tempfile_in(directory)?;
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(75))
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
    transfer.check()?;
    transfer.total.store(SIZE, Ordering::Relaxed);
    check_space(directory, 4 * SIZE + (32 << 20))?;
    let mut digest = Sha256::new();
    let mut received = 0;
    let mut address = reqwest::Url::parse(URL)?;
    let mut buffer = vec![0; 128 << 10];
    let mut failures = 0;
    while received < SIZE {
        transfer.check()?;
        let end = (received + (2 << 20)).min(SIZE) - 1;
        let start = received;
        let part = (|| -> library::Result<()> {
            let mut body = client
                .get(address.clone())
                .header("User-Agent", "Skimmer-Scraper/WorldLibrary")
                .header("Accept-Encoding", "identity")
                .header("Range", format!("bytes={start}-{end}"))
                .send()?
                .error_for_status()?;
            address = body.url().clone();
            let limit = if body.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                let expected = format!("bytes {start}-{end}/{SIZE}");
                if body
                    .headers()
                    .get("Content-Range")
                    .and_then(|v| v.to_str().ok())
                    != Some(&expected)
                {
                    return Err("服务器返回了错误的文件分段。".into());
                }
                end + 1
            } else if start == 0 && body.status() == reqwest::StatusCode::OK {
                SIZE
            } else {
                return Err("服务器未能续传此资源包。".into());
            };
            loop {
                transfer.check()?;
                let count = body.read(&mut buffer)?;
                if count == 0 {
                    break;
                }
                if received + count as u64 > limit {
                    return Err("下载大小不符合发行清单。".into());
                }
                temporary.write_all(&buffer[..count])?;
                digest.update(&buffer[..count]);
                received += count as u64;
                transfer.received.store(received, Ordering::Relaxed);
            }
            if received != limit {
                return Err("下载中断。".into());
            }
            Ok(())
        })();
        if let Err(error) = part {
            transfer.check()?;
            // A slow connection can time out after delivering a valid prefix of a range.
            // Only consecutive attempts that make no forward progress exhaust the retry budget.
            failures = if received > start { 0 } else { failures + 1 };
            if failures >= 4 {
                return Err(error);
            }
            address = reqwest::Url::parse(URL)?;
            for _ in 0..(5 * failures) {
                transfer.check()?;
                std::thread::sleep(Duration::from_millis(100));
            }
        } else {
            failures = 0;
        }
    }
    if received != SIZE || crate::library::hex_digest(&digest.finalize()) != SHA256 {
        return Err("发行附件 SHA-256 校验失败。".into());
    }
    temporary.rewind()?;
    install_archive(&mut db, temporary, transfer)
}

fn install_archive(db: &mut Connection, file: File, transfer: &Transfer) -> library::Result<Value> {
    let mut zip = zip::ZipArchive::new(file)?;
    let mut bytes = Vec::new();
    zip.by_name("world-pack.json")?
        .take((1 << 20) + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1 << 20 || library::hex_digest(&Sha256::digest(&bytes)) != MANIFEST_SHA256 {
        return Err("资源清单与客户端的内容哈希不符。".into());
    }
    let manifest: Value = serde_json::from_slice(&bytes)?;
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
    let transfer = Arc::new(Transfer::default());
    {
        let mut active = state.0.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("已有安装正在进行。".into());
        }
        *active = Some(transfer.clone());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        library::with_directory(&app, |directory| download(directory, &transfer))
    })
    .await;
    *state.0.lock().map_err(|e| e.to_string())? = None;
    result
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn official_pack_progress(state: State<PackDownload>) -> Result<Value, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.as_ref().map(|t| json!({
        "received": t.received.load(Ordering::Relaxed), "total": t.total.load(Ordering::Relaxed), "verified": t.verified.load(Ordering::Relaxed)
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
    #[ignore = "requires the released ZIP at SKIMMER_QA_PUBLIC_PACK"]
    fn reinstall_and_cancel_preserve_verified_tiles() -> library::Result<()> {
        let archive = std::env::var_os("SKIMMER_QA_PUBLIC_PACK").ok_or("Missing released ZIP")?;
        exercise_archive(Path::new(&archive), 121, "ascendant-high-2-334458")
    }

    fn exercise_archive(archive: &Path, tiles: i64, id: &str) -> library::Result<()> {
        let dir = tempfile::tempdir()?;
        let mut db = library::connect(dir.path())?;
        let count = |db: &Connection| -> rusqlite::Result<(i64, i64, i64)> {
            db.query_row(
                "SELECT (SELECT count(*) FROM packs WHERE ready=1),
                (SELECT count(*) FROM packs WHERE ready=0), (SELECT count(*) FROM tiles)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
        };
        for _ in 0..2 {
            let transfer = Transfer::default();
            install_archive(&mut db, File::open(archive)?, &transfer)?;
            assert_eq!(transfer.verified.load(Ordering::Relaxed), tiles as u64);
            assert_eq!(count(&db)?, (1, 0, tiles));
        }
        let cancelled = Transfer::default();
        cancelled.cancelled.store(true, Ordering::Relaxed);
        assert!(install_archive(&mut db, File::open(archive)?, &cancelled).is_err());
        assert_eq!(count(&db)?, (1, 0, tiles));
        db.execute("DELETE FROM packs WHERE ready=1 AND id=?1", [id])?;
        assert_eq!(count(&db)?, (0, 0, 0));
        Ok(())
    }

    #[test]
    #[ignore = "downloads the pinned GitHub Release archive"]
    fn installs_public_archive_in_isolated_library() -> library::Result<()> {
        let dir = tempfile::tempdir()?;
        let transfer = Transfer::default();
        let manifest = download(dir.path(), &transfer)?;
        assert_eq!(manifest["id"], "ascendant-high-2-334458");
        assert_eq!(transfer.verified.load(Ordering::Relaxed), 121);
        let db = library::connect(dir.path())?;
        let size: i64 = db.query_row(
            "SELECT SUM(length(data)) FROM tiles JOIN packs USING(token) WHERE ready=1",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(
            size as u64,
            manifest["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| f["bytes"].as_u64().unwrap())
                .sum::<u64>()
        );
        Ok(())
    }
}
