"""Check the content-pinned upstream exchange, optionally requiring the formal release tag."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("producer", type=Path, help="Independent V2Wpro Git checkout")
parser.add_argument("--require-tag", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
lock = json.loads((root/"src/world/kinetic/upstream.json").read_bytes())
commit = lock["sourceCommit"]
def git(*args_):
    return subprocess.check_output(["git", "-C", str(args.producer), *args_])
def blob(name):
    return git("show", commit+":"+name)
def digest(data):
    return hashlib.sha256(data).hexdigest()
tag = "v"+lock["version"]
if args.require_tag and git("rev-parse", tag+"^{commit}").decode().strip() != commit:
    raise ValueError("Producer tag resolves to a different commit")
raw = blob("contracts/manifest.json")
if raw != (root/lock["manifest"]).read_bytes() or digest(raw) != lock["manifestSha256"]:
    raise ValueError("Vendored protocol manifest has different bytes")
manifest = json.loads(raw)
if manifest["version"] != lock["version"] or manifest["format"] != "v2w-contract-manifest-1":
    raise ValueError("Unsupported producer manifest")
for entry in manifest["files"]:
    data = blob(entry["path"])
    if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
        raise ValueError("Producer content mismatch for "+entry["path"])
    if entry["path"] == "examples/kinetic-flight-modules.json":
        if data != (root/"src/world/kinetic/kinetic-flight-modules.r2.json").read_bytes():
            raise ValueError("The game vendors a different module library")
print(json.dumps({"producerCommit":commit,"version":lock["version"],"tagVerified":args.require_tag,
                  "manifestSha256":digest(raw),"verifiedFiles":len(manifest["files"])}))
