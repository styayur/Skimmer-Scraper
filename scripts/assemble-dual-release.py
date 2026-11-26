"""Attach an installed NSIS build and an integrity-checked terrain pack to verified Web/source archives."""

import argparse
import hashlib
import json
import pathlib
import shutil
import zipfile

from release_content import package_content

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=pathlib.Path)
parser.add_argument("installer", type=pathlib.Path)
parser.add_argument("pack_directory", type=pathlib.Path)
parser.add_argument("evidence_directory", type=pathlib.Path)
parser.add_argument("--forge-directory", required=True, type=pathlib.Path)
parser.add_argument("--portable", type=pathlib.Path)
parser.add_argument("--portable-smoke", type=pathlib.Path)
args = parser.parse_args()
if bool(args.portable) != bool(args.portable_smoke):
    parser.error("--portable and --portable-smoke must be supplied together")
folder = args.directory


def digest(p):
    with p.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def record(name, kind):
    p = folder / name
    return {"name": name, "kind": kind, "bytes": p.stat().st_size, "sha256": digest(p)}


def read(p):
    return json.loads(p.read_bytes())


manifest_path = folder / "release-manifest.json"
manifest = read(manifest_path)
web, source = (
    [a for a in manifest["assets"] if a["name"].endswith(suffix)][0]
    for suffix in ("-static.zip", "-source.zip")
)
for a in [web, source]:
    if digest(folder / a["name"]) != a["sha256"]:
        raise SystemExit("Existing distribution differs from its manifest")
installation = read(args.evidence_directory / "install.json")
smoke = read(args.evidence_directory / "desktop-smoke.json")
desktop_hash = digest(args.installer)
if (
    installation["installerSha256"].lower() != desktop_hash
    or installation["sha"] != manifest["sourceCommit"]
    or installation["installExit"] != 0
):
    raise SystemExit("Installer does not match the installation under test")
runtime = smoke["runtime"]["app"]
if runtime["dirty"] or any(
    runtime[k] != manifest[k] for k in ["version", "sourceCommit", "sourceUrl"]
):
    raise SystemExit("Installed runtime does not match the static/source build")
target = folder / args.installer.name
if target.resolve() != args.installer.resolve():
    shutil.copyfile(args.installer, target)
installer = record(target.name, "windows-nsis")
installer["authenticode"] = installation["signing"]
pack = read(args.pack_directory / "world-pack.json")
expected_id = f"ascendant-high-2-{pack['seed']}"
if pack["id"] != expected_id or pack["tier"] != "high" or pack.get("schema") != 2:
    raise SystemExit("Unexpected world pack")
pack_name = f"skimmer-scraper-v{manifest['version']}-dragonspine-high.zip"
with zipfile.ZipFile(folder / web["name"]) as static, zipfile.ZipFile(
    folder / pack_name, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5
) as z:
    for asset in pack["builtinResources"]:
        data = static.read("realms/dragonspine/" + asset["name"])
        if hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise SystemExit("Bundled world asset differs from world manifest")
    for tile in sorted(pack["files"], key=lambda f: f["name"]):
        name = tile["name"]
        if pathlib.Path(name).name != name:
            raise SystemExit("Invalid tile name")
        p = args.pack_directory / name
        if p.stat().st_size != tile["bytes"] or digest(p) != tile["sha256"]:
            raise SystemExit("Incorrect terrain chunk")
        z.write(p, name)
    z.write(args.pack_directory / "world-pack.json", "world-pack.json")
    for name in [
        "build-info.json",
        "LICENSE",
        "CREDITS.md",
        "licenses/PROJECT-MIT-v0.2.0.txt",
    ]:
        z.writestr(name, static.read(name))
manifest["assets"] = [web, source, installer, record(pack_name, "world-pack")]
if args.portable:
    portable_smoke = read(args.portable_smoke)
    with zipfile.ZipFile(args.portable) as portable:
        with portable.open("skimmer-scraper.exe") as binary:
            executable_hash = hashlib.file_digest(binary, "sha256").hexdigest()
        if (
            json.loads(portable.read("build-info.json")) != runtime
            or portable_smoke["runtime"]["app"] != runtime
            or portable_smoke["executableSha256"] != executable_hash
            or installation["installedExecutableSha256"].lower() != executable_hash
            or portable_smoke["errors"] or not portable_smoke["escapePause"]
            or not portable_smoke["fullscreenRoundTrip"]
        ):
            raise SystemExit("Portable archive differs from the qualified Windows executable")
    output = folder / args.portable.name
    if output.resolve() != args.portable.resolve():
        shutil.copyfile(args.portable, output)
    manifest["assets"].append({**record(output.name, "windows-portable"), "executableSha256": executable_hash})
for name, kind in package_content(folder, manifest, folder / web["name"], folder / source["name"], args.forge_directory):
    manifest["assets"].append(record(name, kind))
manifest["scope"] = (
    "Web static distribution, qualified Windows x64 builds, corresponding source and optional Dragonspine, WorldForge and character radio packs"
)
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
lines = [a["sha256"] + "  " + a["name"] for a in manifest["assets"]]
lines.append(digest(manifest_path) + "  " + manifest_path.name)
(folder / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
