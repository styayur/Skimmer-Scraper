"""Prepare a Windows x64 portable archive from a tested installed build."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from release_identity import same_clean_source

parser = argparse.ArgumentParser()
parser.add_argument("installed", type=Path)
parser.add_argument("static_zip", type=Path)
parser.add_argument("smoke_report", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
smoke = json.loads(args.smoke_report.read_bytes())
runtime = smoke["runtime"]["app"]
executable = args.installed / "skimmer-scraper.exe"
licenses = args.installed / "licenses"
if not executable.is_file() or not licenses.is_dir():
    parser.error("Expected an installed executable and its license notices")
with executable.open("rb") as stream:
    if hashlib.file_digest(stream, "sha256").hexdigest() != smoke["executableSha256"].lower():
        parser.error("Portable executable differs from the installed smoke measurement")
with zipfile.ZipFile(args.static_zip) as web:
    provenance = json.loads(web.read("build-info.json"))
    if not same_clean_source(provenance, runtime):
        parser.error(
            "Installed build and Web archive must identify the same clean source"
        )
    supplements = {
        name: web.read(name) for name in ("CREDITS.md", "LICENSE", "licenses/PROJECT-MIT-v0.2.0.txt")
    }
    supplements["build-info.json"] = (json.dumps(runtime, indent=2) + "\n").encode("utf-8")
    entries = {executable.name: executable}
    for source in sorted(licenses.rglob("*")):
        if not source.is_file():
            continue
        name = source.relative_to(args.installed).as_posix()
        if name in supplements:
            if source.read_bytes().replace(b"\r\n", b"\n") != supplements[name].replace(b"\r\n", b"\n"):
                parser.error(f"Conflicting installed notice: {name}")
        else:
            entries[name] = source
    stamp = web.getinfo("build-info.json").date_time
    with zipfile.ZipFile(args.output, "x", zipfile.ZIP_DEFLATED) as portable:
        for name in sorted(entries.keys() | supplements.keys()):
            info = zipfile.ZipInfo(name, stamp)
            info.create_system = 3
            info.external_attr = (0o100755 if name == executable.name else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            if name in supplements:
                portable.writestr(info, supplements[name])
            else:
                with entries[name].open("rb") as src, portable.open(info, "w") as dst:
                    shutil.copyfileobj(src, dst)
with args.output.open("rb") as archive:
    print(hashlib.file_digest(archive, "sha256").hexdigest(), args.output.name)
