"""Prepare a Windows x64 portable archive from a tested installed build."""

import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("installed", type=Path)
parser.add_argument("static_zip", type=Path)
parser.add_argument("smoke_report", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
runtime = json.loads(args.smoke_report.read_bytes())["runtime"]["app"]
executable = args.installed / "skimmer-scraper.exe"
licenses = args.installed / "licenses"
if not executable.is_file() or not licenses.is_dir():
    parser.error("Expected an installed executable and its license notices")
with zipfile.ZipFile(args.static_zip) as web:
    provenance = json.loads(web.read("build-info.json"))
    if provenance != runtime or runtime["dirty"]:
        parser.error(
            "Installed build and Web archive must identify the same clean source"
        )
    with zipfile.ZipFile(args.output, "x", zipfile.ZIP_DEFLATED) as portable:
        portable.write(executable, executable.name)
        for source in sorted(licenses.rglob("*")):
            if source.is_file():
                portable.write(source, source.relative_to(args.installed).as_posix())
        for name in (
            "build-info.json",
            "CREDITS.md",
            "LICENSE",
            "licenses/PROJECT-MIT-v0.2.0.txt",
        ):
            portable.writestr(name, web.read(name))
with args.output.open("rb") as archive:
    print(hashlib.file_digest(archive, "sha256").hexdigest(), args.output.name)
