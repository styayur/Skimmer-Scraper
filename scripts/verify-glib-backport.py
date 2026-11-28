"""Rebuild the GTK3 source from the published crate and compare every byte."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import tomllib


ROOT = Path(__file__).resolve().parents[1]
SECURITY = ROOT / "security"
PAYLOAD = ROOT / "vendor/glib"
RECEIPT_SHA256 = "b863f4971c150a0dcc0a5167c8d6b573ab12bfac0c22489be7c68f96d2849ecb"
UPSTREAM_DIFF_SHA256 = "e9322e189cd49b401a9ad01dbb3ef3c522e6cb9856cecb8190796908726a0083"


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(directory):
    return {
        file.relative_to(directory).as_posix(): checksum(file)
        for file in directory.rglob("*") if file.is_file()
    }


def verify(archive):
    receipt = SECURITY / "glib-provenance.json"
    upstream = SECURITY / "glib-upstream.patch"
    if checksum(receipt) != RECEIPT_SHA256 or checksum(upstream) != UPSTREAM_DIFF_SHA256:
        raise ValueError("Source receipt or upstream fix differs from its pinned revision")
    source = json.loads(receipt.read_bytes())
    delta = ROOT / source["localHardening"]["patch"]
    if checksum(archive) != source["archiveSha256"] or checksum(delta) != source["localHardening"]["patchSha256"]:
        raise ValueError("Registry archive or donor delta checksum mismatch")
    expected = source["payloadSha256"]
    if inventory(PAYLOAD) != expected:
        raise ValueError("Vendored files differ from the donor inventory")

    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        crate = work / "vendor/glib"
        prefix = "glib-" + source["version"] + "/"
        with tarfile.open(archive, "r:gz") as tar:
            members = tar.getmembers()
            if sorted(m.name for m in members) != sorted(prefix + name for name in expected):
                raise ValueError("Registry file inventory differs from the pinned receipt")
            for name in expected:
                member = tar.getmember(prefix + name)
                if not member.isfile():
                    raise ValueError(f"Expected a regular crate member at {name}")
                path = crate / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(tar.extractfile(member).read())
        original = inventory(crate)
        changes = {path for path in expected if original[path] != expected[path]}
        if changes != set(source["modifiedUpstreamFiles"]):
            raise ValueError("Changes from crates.io differ from the donor's inventory")
        apply = ["git", "-c", "core.autocrlf=false", "apply"]
        subprocess.run([*apply, "-p2", "--directory=vendor/glib", str(upstream)], cwd=work, check=True)
        subprocess.run([*apply, str(delta)], cwd=work, check=True)
        with (crate / "Cargo.toml").open("ab") as manifest:
            manifest.write(b"\n[workspace]\n")
        if inventory(crate) != expected:
            raise ValueError("Reconstructed files differ from the vendored source")

    manifest = tomllib.loads((ROOT / "src-tauri/Cargo.toml").read_text())
    patch = manifest["patch"]["crates-io"]["glib"]
    if (ROOT / "src-tauri" / patch["path"]).resolve() != PAYLOAD:
        raise ValueError("The Tauri manifest selects a different GLib source")
    lock = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text())
    [glib] = [p for p in lock["package"] if p["name"] == "glib"]
    if glib["version"] != source["version"] or "source" in glib or "checksum" in glib:
        raise ValueError("Expected one local GLib package at its original version")
    print(f"Rebuilt and verified all {len(expected)} GLib {glib['version']} files, including LICENSE and COPYRIGHT.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Published glib-0.18.5.crate")
    verify(parser.parse_args().archive)
