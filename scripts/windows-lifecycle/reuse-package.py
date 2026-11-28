"""Verify the original Windows desktop run and stage that same NSIS for all four lanes."""
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main(run, source, version, output):
    if not run.isdecimal() or not re.fullmatch('[0-9a-f]{40}', source):
        raise ValueError('Expected a build run ID and immutable candidate SHA')
    api = 'repos/styayur/Skimmer-Scraper/actions/'

    def get(resource):
        return subprocess.check_output(['gh', 'api', api + resource])

    job = json.loads(get('runs/' + run))
    if (job['path'], job['event'], job['conclusion'], job['head_sha']) != (
            '.github/workflows/windows-desktop.yml', 'workflow_dispatch', 'success', source):
        raise ValueError('The selected run must be a successful Windows desktop dispatch on this source')
    assets = json.loads(get('runs/' + run + '/artifacts'))['artifacts']
    asset, = [a for a in assets if a['name'] == 'windows-x64-' + source and not a['expired']]
    archive = get(f'artifacts/{asset["id"]}/zip')
    if asset['digest'] != 'sha256:' + digest(archive):
        raise ValueError('Downloaded Windows build artifact digest mismatch')
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        build = json.loads(package.read('dist/build-info.json'))
        smoke = json.loads(package.read('acceptance/installed-smoke/desktop-smoke.json'))
        hashes = {h['File']: h['Hash'].lower() for h in json.loads(package.read('acceptance/installed-smoke/hashes.json'))}
        member, = [m for m in package.namelist() if PurePosixPath(m).parent.as_posix() == 'src-tauri/target/release/bundle/nsis'
                   and m.endswith('-setup.exe')]
        name = PurePosixPath(member).name
        if not re.fullmatch(r'[\w.-]+-setup\.exe', name):
            raise ValueError('Unexpected installer filename')
        installer = package.read(member)
    if (build['sourceCommit'], build['version'], build['dirty']) != (source, version, False) or smoke['runtime']['app'] != build:
        raise ValueError('Packaged WebView2 build does not match original installed smoke or requested version')
    exe = smoke['executableSha256'].lower()
    if hashes[name] != digest(installer) or hashes['skimmer-scraper.exe'] != exe or not re.fullmatch('[0-9a-f]{64}', exe):
        raise ValueError('Installer or installed executable differs from the original smoke receipt')
    identity = dict(source=source, installer=name, installerSha256=digest(installer), exeSha256=exe,
                    buildRun=run, buildArtifactId=asset['id'], buildArtifactSha256=digest(archive))
    output.mkdir()
    (output / name).write_bytes(installer)
    (output / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(identity))


if __name__ == '__main__':
    main(*sys.argv[1:4], Path(sys.argv[4]))
