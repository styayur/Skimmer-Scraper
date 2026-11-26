"""Build versioned content packs from the same checked archives as the installer."""

import hashlib
import json
from pathlib import Path
import zipfile


def write_content_pack(path, entries, stamp):
    with zipfile.ZipFile(path, 'w') as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, stamp)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def package_content(folder, manifest, static_path, source_path, forge_directory):
    prefix = 'skimmer-scraper-v' + manifest['version']
    with zipfile.ZipFile(static_path) as static, zipfile.ZipFile(source_path) as source:
        stamp = static.getinfo('build-info.json').date_time
        shared = {name: static.read(name) for name in (
            'build-info.json', 'LICENSE', 'CREDITS.md', 'licenses/PROJECT-MIT-v0.2.0.txt'
        )}
        inputs = ('public/world-modules/celadon-court.glb', 'src/world/procedural/forge-profile.json',
                  'src/world/procedural/forgeChunk.ts', 'src/world/procedural/forgeAirspace.ts')
        forge = dict(shared)
        proof = json.loads((forge_directory / 'manifest.json').read_bytes())
        if [entry['path'] for entry in proof['inputs']] != list(inputs):
            raise ValueError('WorldForge exporter and release recipe inventory differ')
        for entry in proof['inputs']:
            name = entry['path']
            data = source.read(name)
            if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('WorldForge export differs from release source: ' + name)
            forge[name] = data
        if static.read('world-modules/celadon-court.glb') != forge[inputs[0]]:
            raise ValueError('Web prototype differs from release source')
        for name in ('docs/WORLDFORGE.md', 'art/world-modules/build_celadon_gate.py',
                     'art/world-modules/extract_forge.py', 'scripts/export-worldforge.mjs'):
            forge[name] = source.read(name)
        forge['manifest.json'] = (forge_directory / 'manifest.json').read_bytes()
        # Retain the baked comparison digest, while shipping only the compact kit.
        baked = forge_directory / 'world.glb'
        with baked.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != proof['bakedSha256']:
                raise ValueError('Baked reference differs from export manifest')
        voice = dict(shared)
        for name in ('licenses/CMU-ARCTIC-SLT.txt', 'licenses/APACHE-2.0.txt'):
            voice[name] = static.read(name)
        for name in ('art/radio/lines.json', 'art/radio/render.py', 'art/radio/render_mandarin.py',
                     'docs/RADIO.md', 'docs/VOICE.md'):
            voice[name] = source.read(name)
        clip_names = set()
        for clip in json.loads(voice['art/radio/lines.json']):
            for locale in clip['spokenLanguages']:
                name = f"radio/{locale}/{clip['agent']}-{clip['event']}.opus"
                if Path(name).as_posix() != name or '..' in Path(name).parts or name in clip_names:
                    raise ValueError('Invalid character radio clip name')
                clip_names.add(name)
                data = static.read(name)
                if data != source.read('public/' + name) or not data.startswith(b'OggS') or b'OpusHead' not in data[:128]:
                    raise ValueError('Radio clip differs from authored Opus: ' + name)
                voice[name] = data
        if clip_names != {name for name in static.namelist() if name.startswith('radio/') and name.endswith('.opus')}:
            raise ValueError('Radio manifest and shipped clips differ')
    packs = []
    for kind, entries in [('worldforge-kit', forge), ('character-radio', voice)]:
        filename = f'{prefix}-{kind}.zip'
        write_content_pack(folder / filename, entries, stamp)
        packs.append((filename, kind))
    return packs
