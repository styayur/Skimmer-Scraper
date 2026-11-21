"""Package an already verified, clean build; does not publish or deploy anything."""
import hashlib
import json
import pathlib
import platform
import subprocess
import sys
import zipfile
import zlib
from datetime import datetime, timezone

root = pathlib.Path(__file__).resolve().parent.parent
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

if git('status', '--porcelain', '--untracked-files=no'):
    raise SystemExit('Refusing to package tracked uncommitted changes')
meta = json.loads((root / 'dist/build-info.json').read_text(encoding='utf-8'))
commit = git('rev-parse', 'HEAD')
if meta['sourceCommit'] != commit or meta['dirty']:
    raise SystemExit('Build metadata must identify this clean commit')
lockfile = subprocess.check_output(['git', 'show', 'HEAD:package-lock.json'], cwd=root)
if (root / 'package-lock.json').read_bytes() != lockfile:
    raise SystemExit('Build the release in a clean checkout with Git core.autocrlf=false')
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
destination = pathlib.Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
stamp = datetime.fromtimestamp(int(git('show', '-s', '--format=%ct', 'HEAD')), timezone.utc)
date = (stamp.year, stamp.month, stamp.day, stamp.hour, stamp.minute, stamp.second // 2 * 2)
static = destination / f'skimmer-scraper-v{version}-static.zip'
with zipfile.ZipFile(static, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file():
            info = zipfile.ZipInfo(path.relative_to(root / 'dist').as_posix(), date)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
source = destination / f'skimmer-scraper-v{version}-source.zip'
paths = [p for p in git('ls-files').splitlines() if '/' not in p]
paths += ['.github', 'src', 'public', 'tests', 'scripts', 'docs', 'licenses', 'acceptance']
paths += [
    'evidence/v0.5/pr9-release/candidate-chrome-title.png',
    'evidence/v0.5/pr9-release/gpu-matrix-balanced.png',
]
if git('ls-files', 'automation'):
    paths.append('automation')
subprocess.run(['git', '-c', 'core.autocrlf=false', 'archive', '--format=zip', '-o', str(source),
                'HEAD', '--', *paths], cwd=root, check=True)
with zipfile.ZipFile(source, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    supplements = {'SOURCE_REVISION.json': json.dumps(meta, indent=2) + '\n', 'evidence/v0.3/regression/v0.2/.gitkeep': ''}
    for name, content in sorted(supplements.items()):
        info = zipfile.ZipInfo(name, date)
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
manifest = {
    'version': version, 'sourceCommit': commit, 'sourceCommitTime': meta['sourceCommitTime'],
    'sourceUrl': meta['sourceUrl'], 'scope': 'Static distribution and complete corresponding project source/build instructions; historical screenshot evidence remains in GitHub.',
    'reproducibility': 'Sorted static ZIP entries, fixed commit timestamp/mode, compression level9. Same clean commit, lockfile and documented toolchain. Cross-platform ZIP identity is not asserted.',
    'toolchain': {
        'build': meta.get('toolchain'),
        'packaging': { 'git': git('--version'), 'python': platform.python_version(), 'zlib': zlib.ZLIB_RUNTIME_VERSION,
                       'platform': platform.system(), 'machine': platform.machine() },
        'lockfileSha256': hashlib.sha256(lockfile).hexdigest(),
    },
    'assets': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [static, source]],
}
manifest_file = destination / 'release-manifest.json'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
checksums = ''.join(f"{asset['sha256']}  {asset['name']}\n" for asset in manifest['assets'])
checksums += f'{hashlib.sha256(manifest_file.read_bytes()).hexdigest()}  {manifest_file.name}\n'
(destination / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8', newline='\n')
print(json.dumps(manifest, indent=2))
