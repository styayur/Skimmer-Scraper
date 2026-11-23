"""Compare a rebuilt source distribution with every member of the published static ZIP."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

static_zip, rebuilt_dist, output = map(Path, sys.argv[1:])

def digest(data):
    return hashlib.sha256(data).hexdigest()

with zipfile.ZipFile(static_zip) as archive:
    metadata = json.loads(archive.read("build-info.json"))
    expected = {name: digest(archive.read(name)) for name in archive.namelist() if not name.endswith("/")}

actual = {p.relative_to(rebuilt_dist).as_posix(): digest(p.read_bytes())
          for p in rebuilt_dist.rglob("*") if p.is_file()}
mismatches = sorted(name for name in expected.keys() | actual.keys() if expected.get(name) != actual.get(name))
report = {"version": metadata["version"], "sourceCommit": metadata["sourceCommit"], "toolchain": metadata["toolchain"],
          "originalFiles": len(expected), "rebuiltFiles": len(actual), "mismatches": mismatches,
          "status": "failed" if mismatches else "passed"}
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
sys.exit(bool(mismatches))
