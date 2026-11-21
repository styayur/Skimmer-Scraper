"""Verify exact release hashes, embedded revision metadata, and archive privacy."""
import hashlib
import json
import os
import pathlib
import sys
import zipfile

folder = pathlib.Path(sys.argv[1]).resolve()
manifest_name = 'release-manifest.json'
manifest = json.loads((folder / manifest_name).read_text(encoding='utf-8'))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


checksums = {}
for line in (folder / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
    checksum, name = line.split('  ', 1)
    if pathlib.Path(name).name != name or name in checksums or sha256(folder / name) != checksum:
        raise SystemExit('Release checksum failure')
    checksums[name] = checksum

if set(checksums) != {manifest_name, *(asset['name'] for asset in manifest['assets'])}:
    raise SystemExit('Release checksum list does not match the manifest')

secrets = [os.environ[name].encode() for name in ('DEEPSEEK_API_KEY', 'OPENAI_API_KEY') if len(os.getenv(name, '')) >= 8]
if any(secret in (folder / name).read_bytes() for name in (manifest_name, 'SHA256SUMS.txt') for secret in secrets):
    raise SystemExit('An operator credential matched release metadata')

results = []
for asset in manifest['assets']:
    name = asset['name']
    if asset['sha256'] != checksums[name] or (folder / name).stat().st_size != asset['bytes']:
        raise SystemExit('Archive size or digest does not match the manifest')
    with zipfile.ZipFile(folder / name) as archive:
        if archive.testzip():
            raise SystemExit('Release archive failed its integrity check')
        revision_name = 'SOURCE_REVISION.json' if name.endswith('-source.zip') else 'build-info.json'
        revision = json.loads(archive.read(revision_name))
        required = {'LICENSE', 'CREDITS.md', 'licenses/PROJECT-MIT-v0.2.0.txt', revision_name}
        if not required.issubset(archive.namelist()) or revision['dirty'] or any(
            revision[field] != manifest[field] for field in ('sourceCommit', 'version', 'sourceUrl')
        ):
            raise SystemExit('Archive revision metadata or license files do not match')
        audio_files = []
        scanned = 0
        for member in archive.infolist():
            path = pathlib.PurePosixPath(member.filename)
            if path.is_absolute() or '..' in path.parts or any(part in ('.git', 'node_modules') or part.startswith('.env') for part in path.parts):
                raise SystemExit('Unexpected private or local build file in an archive')
            if member.is_dir():
                continue
            if path.suffix.lower() in ('.wav', '.ogg', '.pcm', '.mp3', '.m4a', '.flac'):
                audio_files.append(member.filename)
            data = archive.read(member)
            if any(secret in data for secret in secrets):
                raise SystemExit('An operator credential matched archive content')
            scanned += 1
        results.append({ 'name': name, 'entriesScanned': scanned, 'audioFiles': audio_files, 'sha256': checksums[name] })

print(json.dumps({ 'status': 'passed', 'version': manifest['version'], 'sourceCommit': manifest['sourceCommit'],
    'operatorCredentialsChecked': len(secrets), 'credentialMatches': 0, 'archives': results }, indent=2))
