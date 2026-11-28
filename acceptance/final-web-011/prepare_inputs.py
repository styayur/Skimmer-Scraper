"""Reproduce the public inputs without running a browser. Input checkouts are documented in inputs.json."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
HARNESS = "d66b343cdd88d7d499e77afa4a63e8e3594f2813"
RELEASE = "241bd0eec72439d77a43e8d289cc29c714bf0e4e"
PACK = "9c02582b401a238fb8bdedb72b102f52c73bb599e0482588602f770ba37be59c"
READ = lambda path: json.loads(path.read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("harness", type=Path)
parser.add_argument("release_source", type=Path)
parser.add_argument("worlds_zip", type=Path)
args = parser.parse_args()
root = args.harness.resolve() / "acceptance/joint-flight/topogenesis"
sys.path.insert(0, str(args.harness.resolve() / "scripts"))
from flight_bench_cases import read_sealed_holdout

if subprocess.check_output(["git","rev-parse","HEAD"], cwd=args.release_source, text=True).strip() != RELEASE:
    raise ValueError("Use the v0.4.0 release source")
subprocess.run(["git","diff","--quiet","HEAD","--","src","tools"], cwd=args.release_source, check=True)
if sha(args.worlds_zip.read_bytes()) != PACK:
    raise ValueError("Unexpected v0.4.0 worlds archive")
matrix = READ(root / "matrix.json")
prior = root / "integrated-946d2f7e"
groups = {name:matrix[name] for name in ["development", "holdout"]}
for group in ["second-holdout", "third-holdout"]:
    groups[group], _ = read_sealed_holdout(root / f"{group}.json", root / f"{group}-commitment.json", matrix)
sources = {"stock": {"controller": matrix["controller"], "entrySha256": matrix["entrySha256"]}}
for name in ["integrated-0a5272b3", "integrated-7845d30f", "integrated-946d2f7e"]:
    runtime = READ(root / name / "runtime.json")
    sources[name] = {"controller":runtime["controller"], "entrySha256":runtime["entry"]["sha256"]}

cases = []
blobs = {}
def append(group, ref, data):
    name = ref.name
    report = READ(ref)
    identity = {"bytes":len(data), "sha256":sha(data)}
    assert all(report["world"][key] == value for key,value in identity.items())
    blobs[identity["sha256"]] = data
    stock_group = {"second-holdout":root/"integrated-7845d30f/second-holdout-stock",
                   "third-holdout":prior/"third-holdout-stock", "legacy":root/"baseline"}.get(group,root/group)
    paths = {"stock":stock_group/name, **{key:root/key/group/name for key in sources if key != "stock"}}
    history = {}
    for key,path in paths.items():
        if path.is_file():
            old = READ(path)
            assert old["build"]["sourceCommit"] == sources[key]["controller"]
            assert old["binary"]["sha256"] == sources[key]["entrySha256"]
            history[key] = {"report":path.relative_to(root).as_posix(), "outcome":old["outcome"],
                            "met":old["metrics"]["meetsDisposition"]}
    assert history["integrated-946d2f7e"]["report"] == ref.relative_to(root).as_posix()
    cases.append({"group":group, "name":name, "experiment":report["experiment"], "schedule":report["schedule"],
                  "world":report["world"], "history":history})

with tempfile.TemporaryDirectory() as generated, zipfile.ZipFile(args.worlds_zip) as worlds:
    for group, rows in groups.items():
        for module,seed,profile,release,disposition,approach,wingmates in rows:
            base = f"{module}-{seed}-{profile}"
            prefix = Path(generated)/base
            subprocess.run(["node","tools/topogenesis.js","fixture",module,str(seed),profile,"2",str(prefix)],
                           cwd=args.release_source, check=True)
            append(group, prior/group/(base+".json"), prefix.with_suffix(".glb").read_bytes())
            row = cases[-1]
            assert [row["experiment"][k] for k in ["module","seed","profile","disposition","approach","wingmates"]] == [
                module,seed,profile,disposition,approach,wingmates]
            assert row["schedule"]["releaseTick"] == release
    for ref in sorted((prior/"legacy").glob("*.json")):
        asset = "examples/contact.glb" if ref.name.startswith("contact-deck-") else "examples/district.glb"
        append("legacy", ref, worlds.read(asset))
        cases[-1]["releaseArchiveMember"] = asset
assert len(cases) == 37 and len({(c["group"],c["name"]) for c in cases}) == 37
bundle = HERE / "inputs.zip"
with zipfile.ZipFile(bundle, "w") as z:
    for name,data in sorted({**{f"glb/{k}.glb":v for k,v in blobs.items()},
                             "LICENSE.txt":subprocess.check_output(["git","show",f"{RELEASE}:LICENSE"],cwd=args.release_source)}.items()):
        z.writestr(zipfile.ZipInfo(name),data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
manifest = {"harness":HARNESS, "v2wRelease":RELEASE, "generator":matrix["producerRevisions"][2],
    "reader":"5656a74f5786001e1011b1b3beb4649a903f76e6", "releaseWorldsZipSha256":PACK,
    "inputZipSha256":sha(bundle.read_bytes()), "historicalSources":sources,"cases":cases}
(HERE/"inputs.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
print(f"{len(cases)} cases, {len(blobs)} unique verified GLBs, archive {manifest['inputZipSha256']}")
