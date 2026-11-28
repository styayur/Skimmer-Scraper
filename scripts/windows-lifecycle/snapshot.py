"""Capture a closed test profile; use SQLite's backup API so committed WAL pages are included."""
import hashlib
import json
import shutil
import sqlite3
import sys
from contextlib import closing
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def database_records(db):
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('SQLite integrity_check failed')
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise ValueError('SQLite foreign_key_check failed')
    worlds = []
    for key, metadata, data, saved in db.execute('SELECT * FROM worlds ORDER BY id'):
        manifest = json.loads(metadata)['manifest']
        if digest(data) != key or manifest['id'] != key or manifest['bytes'] != len(data):
            raise ValueError('Stored GLB differs from its manifest')
        worlds.append([key, digest(metadata.encode()), saved])
    packs = list(db.execute('SELECT token,id,metadata,ready,created FROM packs ORDER BY token'))
    tiles = []
    for token, key, size, data in db.execute('SELECT * FROM tiles ORDER BY token,digest'):
        if data is None or len(data) != size or digest(data) != key:
            raise ValueError('Incomplete or corrupt test pack tile')
        tiles.append([token, key, size])
    if not worlds or not tiles or not packs or any(p[3] != 1 for p in packs):
        raise ValueError('Expected populated worlds and completed packs')
    return {'worlds': worlds, 'packs': [[t, i, digest(m.encode()), r, c] for t, i, m, r, c in packs],
            'tiles': tiles}


def origin_files(profile):
    # Tauri uses the Windows profile's default WebView2 data directory. Include the
    # complete origin stores, including IndexedDB when created by the installed build.
    roots = list(profile.glob('**/Default/Local Storage'))
    if len(roots) != 1 or not (roots[0] / 'leveldb' / 'CURRENT').is_file():
        raise ValueError(f'Expected one live WebView2 origin store in {profile}, found {roots}')
    default = roots[0].parent
    return sorted(p for name in ('Local Storage', 'IndexedDB') for p in (default / name).rglob('*') if p.is_file())


def snapshot(mode, profile, backup, report):
    if mode not in ('capture', 'verify'):
        raise ValueError(mode)
    library = Path('world-library-v1/worlds.sqlite')
    if (profile / 'library-location.json').exists():
        raise ValueError('Expected a fresh runner with the default world library')
    if mode == 'capture':
        backup.mkdir()
        (backup / library).parent.mkdir()
    files = {}
    for path in origin_files(profile):
        relative = path.relative_to(profile)
        files[relative.as_posix()] = file_digest(path)
        if mode == 'capture':
            dest = backup / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest)
            if file_digest(dest) != files[relative.as_posix()]:
                raise ValueError(f'Origin snapshot changed during copy: {relative}')
    with closing(sqlite3.connect((profile / library).as_uri() + '?mode=ro', uri=True)) as source:
        source.execute('BEGIN')
        records = database_records(source)
        if mode == 'capture':
            with closing(sqlite3.connect(backup / library)) as dest:
                source.backup(dest)
    with closing(sqlite3.connect((backup / library).as_uri() + '?mode=ro', uri=True)) as copy:
        if database_records(copy) != records:
            raise ValueError('Restorable SQLite snapshot differs from live records')
    witness = {'integrityCheck': 'ok', 'foreignKeyViolations': 0, 'records': records,
               'snapshotSha256': file_digest(backup / library), 'originFiles': files}
    manifest = backup / 'capture.json'
    if mode == 'capture':
        manifest.write_text(json.dumps(witness), encoding='utf-8')
    elif json.loads(manifest.read_text(encoding='utf-8')) != witness:
        raise ValueError('Installer changed native records or the closed WebView2 origin stores')
    report.write_text(json.dumps(witness, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    snapshot(sys.argv[1], *(Path(arg).resolve() for arg in sys.argv[2:]))
