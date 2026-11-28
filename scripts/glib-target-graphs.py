"""Record the locked desktop graphs and verify the native GTK3 path."""

import argparse
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src-tauri/Cargo.toml"
LINUX = "x86_64-unknown-linux-gnu"
WINDOWS = "x86_64-pc-windows-msvc"


def record(target, output):
    options = ["--locked", "--all-features", "--manifest-path", str(MANIFEST)]
    metadata = subprocess.check_output([
        "cargo", "metadata", *options, "--filter-platform", target, "--format-version", "1",
    ])
    (output / f"{target}.metadata.json").write_bytes(metadata)
    tree = subprocess.check_output([
        "cargo", "tree", *options, "--target", target, "--edges", "normal,build",
        "--invert", "glib", "--charset", "ascii",
    ])
    (output / f"{target}.reverse-tree.txt").write_bytes(tree)
    data = json.loads(metadata)
    packages = {p["id"]: p for p in data["packages"]}
    nodes = {n["id"]: n for n in data["resolve"]["nodes"]}
    root = data["resolve"]["root"]
    pending = [root]
    seen = set()
    edges = set()
    while pending:
        caller = pending.pop()
        if caller in seen:
            continue
        seen.add(caller)
        for dep in nodes[caller]["deps"]:
            if any(kind["kind"] in (None, "build") for kind in dep["dep_kinds"]):
                edges.add((packages[caller]["name"], packages[dep["pkg"]]["name"]))
                pending.append(dep["pkg"])
    glibs = [packages[i] for i in seen if packages[i]["name"] == "glib"]
    if target == WINDOWS:
        if tree.strip() or glibs:
            raise ValueError("GLib is reachable from the Windows desktop")
    else:
        [glib] = glibs
        if (glib["source"] is not None or glib["version"] != "0.18.5"
                or Path(glib["manifest_path"]) != ROOT / "vendor/glib/Cargo.toml"):
            raise ValueError("The Linux desktop resolved a different GLib")
        path = [
            packages[root]["name"], "tauri", "tauri-runtime-wry", "wry", "webkit2gtk", "gtk", "glib",
        ]
        if not tree.strip() or not set(zip(path, path[1:])).issubset(edges):
            raise ValueError("The native Wry / WebKitGTK / GTK dependency path changed")
    print(f"{target}: {len(seen)} build/runtime packages, {len(glibs)} GLib")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    directory = parser.parse_args().output
    directory.mkdir(parents=True, exist_ok=True)
    for triple in (LINUX, WINDOWS):
        record(triple, directory)
