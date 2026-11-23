use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager,
};

const MAX_GLB: usize = 128 << 20;
const MAX_METADATA: usize = 2 << 20;
const MAX_LIBRARY: i64 = 2 << 30;
type Failure = Box<dyn std::error::Error + Send + Sync>;
pub(crate) type Result<T> = std::result::Result<T, Failure>;

fn check_path(path: &Path) -> Result<()> {
    for component in path.ancestors() {
        match fs::symlink_metadata(component) {
            Ok(meta) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err("World library path contains a reparse point".into());
                    }
                }
                if meta.is_symlink() {
                    return Err("World library contains a symbolic link".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

fn connect(directory: &Path) -> Result<Connection> {
    check_path(directory)?;
    fs::create_dir_all(directory)?;
    for name in [
        "worlds.sqlite",
        "worlds.sqlite-journal",
        "worlds.sqlite-wal",
        "worlds.sqlite-shm",
    ] {
        check_path(&directory.join(name))?;
    }
    let db = Connection::open(directory.join("worlds.sqlite"))?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.execute_batch("PRAGMA trusted_schema=OFF; PRAGMA auto_vacuum=FULL;
        CREATE TABLE IF NOT EXISTS worlds (
            id TEXT PRIMARY KEY, metadata TEXT NOT NULL, glb BLOB NOT NULL, saved_at INTEGER NOT NULL
        );")?;
    crate::packs::init(&db)?;
    Ok(db)
}

pub(crate) fn check_id(id: &str) -> Result<()> {
    if id.len() != 64
        || !id
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("Invalid world fingerprint".into());
    }
    Ok(())
}

fn save(db: &mut Connection, packet: &[u8]) -> Result<()> {
    let prefix = packet.get(..4).ok_or("Incomplete world record")?;
    let size = u32::from_le_bytes(prefix.try_into()?) as usize;
    if size > MAX_METADATA {
        return Err("World metadata exceeds budget".into());
    }
    let metadata = std::str::from_utf8(packet.get(4..4 + size).ok_or("Missing world metadata")?)?;
    let record: Value = serde_json::from_str(metadata)?;
    let manifest = &record["manifest"];
    let id = manifest["id"].as_str().ok_or("Missing world fingerprint")?;
    check_id(id)?;
    let data = &packet[4 + size..];
    if !(20..=MAX_GLB).contains(&data.len())
        || manifest["bytes"].as_u64() != Some(data.len() as u64)
        || data[..8] != *b"glTF\x02\0\0\0"
        || u32::from_le_bytes(data[8..12].try_into()?) as usize != data.len()
    {
        return Err("Invalid GLB header or size".into());
    }
    let hash: String = Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if hash != id {
        return Err("GLB integrity check failed".into());
    }
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let (count, bytes): (i64, i64) = tx.query_row(
        "SELECT count(*),coalesce(sum(length(glb)),0) FROM worlds WHERE id<>?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    if count >= 64 || bytes + data.len() as i64 > MAX_LIBRARY {
        return Err("World library is full".into());
    }
    tx.execute("INSERT INTO worlds VALUES(?1,?2,?3,unixepoch('subsec')*1000)
        ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,glb=excluded.glb,saved_at=excluded.saved_at",
        params![id,metadata,data])?;
    tx.commit()?;
    Ok(())
}

fn directory(app: &AppHandle) -> std::result::Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("world-library-v1"))
        .map_err(|e| e.to_string())
}

pub(crate) async fn run<T: Send + 'static>(
    app: AppHandle,
    operation: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
) -> std::result::Result<T, String> {
    let dir = directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || operation(&mut connect(&dir)?))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn world_save(app: AppHandle, request: Request<'_>) -> std::result::Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Expected binary world".into());
    };
    if data.len() > MAX_GLB + MAX_METADATA + 4 {
        return Err("World exceeds library budget".into());
    }
    let data = data.clone();
    run(app, move |db| save(db, &data)).await
}

#[tauri::command]
pub async fn world_list(app: AppHandle) -> std::result::Result<Vec<Value>, String> {
    run(app, |db| {
        let mut query = db.prepare("SELECT metadata FROM worlds ORDER BY saved_at DESC, id")?;
        let mut rows = query.query([])?;
        let mut records = Vec::new();
        while let Some(row) = rows.next()? {
            let record: String = row.get(0)?;
            records.push(serde_json::from_str(&record)?);
        }
        Ok(records)
    })
    .await
}

#[tauri::command]
pub async fn world_read(
    app: AppHandle,
    id: String,
    offset: u32,
    length: u32,
) -> std::result::Result<Response, String> {
    run(app, move |db| {
        check_id(&id)?;
        if length == 0 || length > 1024 * 1024 || offset as usize >= MAX_GLB {
            return Err("Invalid GLB read range".into());
        }
        let bytes: Option<Vec<u8>> = db
            .query_row(
                "SELECT substr(glb,?2,?3) FROM worlds WHERE id=?1",
                params![id, offset + 1, length],
                |r| r.get(0),
            )
            .optional()?;
        let data = bytes.ok_or("World no longer installed")?;
        if data.len() != length as usize {
            return Err("Incomplete GLB read".into());
        }
        Ok(Response::new(data))
    })
    .await
}

#[tauri::command]
pub async fn world_remove(app: AppHandle, id: String) -> std::result::Result<(), String> {
    run(app, move |db| {
        check_id(&id)?;
        db.execute("DELETE FROM worlds WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_survive_restart_and_invalid_replacement() -> Result<()> {
        let directory = std::env::temp_dir().join(format!(
            "skimmer-world-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
        ));
        let data = include_bytes!("../../tests/fixtures/test-aircraft.glb");
        let id: String = Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let record = serde_json::json!({"manifest":{"id":id,"bytes":data.len()}});
        let metadata = serde_json::to_vec(&record)?;
        let mut packet = (metadata.len() as u32).to_le_bytes().to_vec();
        packet.extend(metadata);
        packet.extend(data);
        {
            let mut db = connect(&directory)?;
            save(&mut db, &packet)?;
            *packet.last_mut().unwrap() ^= 1;
            assert!(save(&mut db, &packet).is_err());
            assert!(save(&mut db, &packet[..6]).is_err());
        }
        {
            let db = connect(&directory)?;
            let bytes: Vec<u8> =
                db.query_row("SELECT glb FROM worlds WHERE id=?1", [&id], |r| r.get(0))?;
            assert_eq!(bytes.as_slice(), data);
            assert_eq!(db.execute("DELETE FROM worlds WHERE id=?1", [&id])?, 1);
        }
        fs::remove_file(directory.join("worlds.sqlite"))?;
        fs::remove_dir(directory)?;
        Ok(())
    }

    #[test]
    fn identifiers_cannot_name_files() {
        assert!(check_id("../private").is_err());
        assert!(check_id("C:\\files").is_err());
        assert!(check_id(&"z".repeat(64)).is_err());
    }
}
