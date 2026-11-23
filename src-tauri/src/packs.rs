use crate::library::{run, Result};
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle,
};

const MAX_FILE: usize = 8 << 20;
const MAX_PACK: i64 = 1 << 30;

pub(crate) fn init(db: &Connection) -> Result<()> {
    db.execute_batch(
        "PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS packs(
        token TEXT PRIMARY KEY, id TEXT NOT NULL, metadata TEXT NOT NULL,
        ready INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL DEFAULT(unixepoch())
      );
      CREATE TABLE IF NOT EXISTS tiles(
        token TEXT NOT NULL REFERENCES packs(token) ON DELETE CASCADE,
        digest TEXT NOT NULL, bytes INTEGER NOT NULL, data BLOB,
        PRIMARY KEY(token,digest)
      );",
    )?;
    Ok(())
}

fn begin(db: &mut Connection, manifest: Value) -> Result<String> {
    let metadata = serde_json::to_string(&manifest)?;
    if metadata.len() > 1 << 20
        || manifest["schema"] != 1
        || manifest["theme"] != "dragon"
        || manifest["generatorVersion"] != 1
        || manifest["collision"] != "dragonspine-base-1"
    {
        return Err("Incompatible world pack".into());
    }
    let id = manifest["id"].as_str().ok_or("Missing pack ID")?;
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid pack ID".into());
    }
    let files = manifest["files"].as_array().ok_or("Missing files")?;
    if files.is_empty() || files.len() > 1024 {
        return Err("File count exceeds budget".into());
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "DELETE FROM packs WHERE ready=0 AND created<unixepoch()-3600",
        [],
    )?;
    let count: i64 = tx.query_row("SELECT count(*) FROM packs", [], |r| r.get(0))?;
    if count >= 32 {
        return Err("Too many installed or staged packs".into());
    }
    let installed: i64 =
        tx.query_row("SELECT coalesce(sum(bytes),0) FROM tiles", [], |r| r.get(0))?;
    let token: String = tx.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))?;
    tx.execute(
        "INSERT INTO packs(token,id,metadata) VALUES(?1,?2,?3)",
        params![token, id, metadata],
    )?;
    let mut total = 0;
    let mut names = HashSet::new();
    let mut coords = HashSet::new();
    for f in files {
        let name = f["name"].as_str().ok_or("Invalid tile name")?;
        if name.len() > 100
            || !name.ends_with(".glb")
            || name.contains("..")
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            || !names.insert(name)
        {
            return Err("Invalid GLB name".into());
        }
        let digest = f["sha256"].as_str().ok_or("Missing hash")?;
        super::library::check_id(digest)?;
        let bytes = f["bytes"].as_i64().ok_or("Missing size")?;
        let x = f["cx"].as_i64().ok_or("Missing chunk X")?;
        let z = f["cz"].as_i64().ok_or("Missing chunk Z")?;
        if !coords.insert((x, z)) || !(20..=MAX_FILE as i64).contains(&bytes) {
            return Err("Invalid chunk".into());
        }
        total += bytes;
        tx.execute(
            "INSERT INTO tiles(token,digest,bytes) VALUES(?1,?2,?3)",
            params![token, digest, bytes],
        )?;
    }
    if total > MAX_PACK || installed + total > 4 * MAX_PACK {
        return Err("Pack library is full".into());
    }
    tx.commit()?;
    Ok(token)
}

#[tauri::command]
pub async fn pack_begin(app: AppHandle, manifest: Value) -> std::result::Result<String, String> {
    run(app, move |db| begin(db, manifest)).await
}

fn put(db: &mut Connection, token: &str, data: &[u8]) -> Result<()> {
    if !(20..=MAX_FILE).contains(&data.len())
        || data[..8] != *b"glTF\x02\0\0\0"
        || u32::from_le_bytes(data[8..12].try_into()?) as usize != data.len()
    {
        return Err("Invalid chunk data".into());
    }
    let digest: String = Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let changed = db.execute(
        "UPDATE tiles SET data=?1 WHERE token=?2 AND digest=?3 AND bytes=?4
        AND EXISTS(SELECT 1 FROM packs WHERE token=?2 AND ready=0)",
        params![data, token, digest, data.len() as i64],
    )?;
    if changed != 1 {
        return Err("Unknown or corrupt world chunk".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn pack_put(app: AppHandle, request: Request<'_>) -> std::result::Result<(), String> {
    let token = request
        .headers()
        .get("x-pack-session")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Expected GLB bytes".into());
    };
    if data.len() > MAX_FILE {
        return Err("Chunk is too large".into());
    }
    let data = data.clone();
    run(app, move |db| put(db, &token, &data)).await
}

fn finish(db: &mut Connection, token: String) -> Result<()> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let id: String = tx.query_row(
        "SELECT id FROM packs WHERE token=?1 AND ready=0",
        [&token],
        |r| r.get(0),
    )?;
    let missing: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM tiles WHERE token=?1 AND data IS NULL)",
        [&token],
        |r| r.get(0),
    )?;
    if missing {
        return Err("Incomplete world pack".into());
    }
    tx.execute("DELETE FROM packs WHERE id=?1 AND ready=1", [id])?;
    tx.execute("UPDATE packs SET ready=1 WHERE token=?1", [token])?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn pack_finish(app: AppHandle, token: String) -> std::result::Result<(), String> {
    run(app, move |db| finish(db, token)).await
}

#[tauri::command]
pub async fn pack_abort(app: AppHandle, token: String) -> std::result::Result<(), String> {
    run(app, move |db| {
        db.execute("DELETE FROM packs WHERE token=?1 AND ready=0", [token])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn pack_list(app: AppHandle) -> std::result::Result<Vec<Value>, String> {
    run(app, |db| {
        let mut query = db.prepare("SELECT metadata FROM packs WHERE ready=1 ORDER BY id")?;
        let mut rows = query.query([])?;
        let mut result = Vec::new();
        while let Some(row) = rows.next()? {
            result.push(serde_json::from_str(&row.get::<_, String>(0)?)?);
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn pack_read(
    app: AppHandle,
    id: String,
    digest: String,
) -> std::result::Result<Response, String> {
    run(app,move|db|{
        let data:Vec<u8>=db.query_row("SELECT data FROM tiles JOIN packs USING(token) WHERE packs.id=?1 AND ready=1 AND digest=?2",params![id,digest],|r|r.get(0))?;
        Ok(Response::new(data))
    }).await
}

#[tauri::command]
pub async fn pack_remove(app: AppHandle, id: String) -> std::result::Result<(), String> {
    run(app, move |db| {
        db.execute("DELETE FROM packs WHERE id=?1 AND ready=1", [id])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn a_failed_replacement_preserves_the_complete_pack() -> Result<()> {
        let mut db = Connection::open_in_memory()?;
        init(&db)?;
        let data = include_bytes!("../../public/realms/dragonspine/web/ridge_0_0.glb");
        let digest: String = Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let manifest = json!({"schema":1,"theme":"dragon","generatorVersion":1,"collision":"dragonspine-base-1","id":"test-ridge","files":[
          {"cx":0,"cz":0,"name":"ridge.glb","bytes":data.len(),"sha256":digest}
        ]});
        let first = begin(&mut db, manifest.clone())?;
        put(&mut db, &first, data)?;
        finish(&mut db, first.clone())?;
        let second = begin(&mut db, manifest)?;
        assert!(finish(&mut db, second.clone()).is_err());
        let mut bad = data.to_vec();
        *bad.last_mut().unwrap() ^= 1;
        assert!(put(&mut db, &second, &bad).is_err());
        db.execute("DELETE FROM packs WHERE token=?1 AND ready=0", [second])?;
        assert_eq!(
            db.query_row("SELECT token FROM packs WHERE ready=1", [], |r| r
                .get::<_, String>(0))?,
            first
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM tiles", [], |r| r.get::<_, i64>(0))?,
            1
        );
        Ok(())
    }
}
