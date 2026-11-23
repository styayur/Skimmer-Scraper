"""Collect notices from the Windows Cargo.lock resolution before bundling."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
data = json.loads(subprocess.check_output([
    "cargo", "metadata", "--locked", "--manifest-path", str(ROOT/"src-tauri/Cargo.toml"),
    "--format-version", "1", "--filter-platform", "x86_64-pc-windows-msvc",
]))
resolved = {node["id"] for node in data["resolve"]["nodes"]}
notices = ["Skimmer-Scraper Windows desktop dependency notices\n"]
texts = {}
for package in sorted(data["packages"], key=lambda p: (p["name"], p["version"])):
    if package["id"] not in resolved or not package["source"]:
        continue
    base = Path(package["manifest_path"]).parent
    files = sorted(p for p in base.iterdir() if p.is_file() and p.name.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE", "COPYRIGHT")))
    if package["license_file"]:
        extra = base / package["license_file"]
        if extra.is_file() and extra not in files:
            files.append(extra)
    label = package["name"]+" "+package["version"]
    notices.append(label+" | "+(package["license"] or "see bundled license")+" | "+(package["repository"] or "https://crates.io/crates/"+package["name"]))
    for file in files:
        body = file.read_text(encoding="utf-8",errors="replace").strip()
        if body:
            texts.setdefault(body, []).append(label+" / "+file.name)
for body, packages in texts.items():
    notices.extend(["", ", ".join(packages), body])
dest = ROOT/"src-tauri/desktop-notices.txt"
dest.write_text("\n".join(notices)+"\n", encoding="utf-8")
print(f"{len(resolved)-1} resolved dependencies, {len(texts)} distinct notice texts")
