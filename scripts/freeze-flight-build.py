"""Snapshot a clean Skimmer static build before serving it for controlled replays."""
import argparse
import hashlib
import json
import shutil
from html.parser import HTMLParser
from pathlib import Path


class ModuleScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("type") == "module" and values.get("src"):
            self.urls.append(values["src"])


def manifest(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob("*") if p.is_file()}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Clean, independently built distribution")
parser.add_argument("copy", type=Path, help="Unused directory for the loopback server")
parser.add_argument("evidence", type=Path, help="Unused evidence directory for runtime.json and SHA256SUMS")
parser.add_argument("--controller", required=True, help="Expected clean source commit")
args = parser.parse_args()
source, copy, evidence = (p.resolve() for p in (args.source, args.copy, args.evidence))
if copy.exists() or evidence.exists() or copy.is_relative_to(source) or evidence.is_relative_to(copy):
    parser.error("Use new, separate copy and evidence directories outside the source")
if evidence.is_relative_to(source) or copy.is_relative_to(evidence):
    parser.error("Keep evidence separate from the distribution and server copy")
original = manifest(source)
shutil.copytree(source, copy)
if original != manifest(copy) or original != manifest(source):
    raise ValueError("Distribution changed while creating the snapshot")
build = json.loads((copy / "build-info.json").read_bytes())
if build["sourceCommit"] != args.controller or build["dirty"] is not False:
    raise ValueError("Unexpected or dirty build")
scripts = ModuleScripts()
scripts.feed((copy / "index.html").read_text(encoding="utf-8"))
entry_url, = scripts.urls
entry = entry_url.removeprefix("./")
sums = "".join(original[name] + "  " + name + "\n" for name in sorted(original)).encode("utf-8")
matrix = Path(__file__).resolve().parents[1] / "acceptance/joint-flight/topogenesis/matrix.json"
runtime = {"build": build["version"], "controller": args.controller,
           "entry": {"url": "/" + entry, "bytes": (copy / entry).stat().st_size, "sha256": original[entry]},
           "files": len(original), "totalBytes": sum((copy / name).stat().st_size for name in original),
           "sha256sums": hashlib.sha256(sums).hexdigest(), "producerRevision": 2,
           "producerCommit": json.loads(matrix.read_bytes())["producerRevisions"][2]}
evidence.mkdir(parents=True)
(evidence / "SHA256SUMS").write_bytes(sums)
(evidence / "runtime.json").write_bytes((json.dumps(runtime, indent=2) + "\n").encode("utf-8"))
print(json.dumps(runtime, indent=2))
