"""Archive a hosted run, check case identities and clocks, and run the original stock comparisons."""
import argparse
from collections import Counter
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
REPO = "repos/styayur/Skimmer-Scraper"
SHARED = ("world", "experiment", "imported", "replayed", "schedule", "boost", "input", "browser",
          "fixedHz", "sampleMs", "releaseTick")
GROUPS = ("development", "holdout", "second-holdout", "third-holdout")


def read(path):
    return json.loads(path.read_bytes())


def save(path, data):
    path.write_bytes((json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"{REPO}/{path}"]))


def clocks(report):
    return [sample["time"] for sample in report["trace"]]


def preserve(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != data:
        raise ValueError(f"Conflicting evidence for {path}")
    path.write_bytes(data)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("run", type=int)
parser.add_argument("harness", type=Path)
parser.add_argument("reader", type=Path)
parser.add_argument("output", type=Path, help="New directory for this run")
args = parser.parse_args()
harness = args.harness.resolve()
bench = harness / "acceptance/joint-flight/topogenesis"
manifest = read(HERE / "inputs.json")
reader = args.reader.resolve()
assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=reader, text=True).strip() == manifest["reader"]
subprocess.run(["git", "diff", "--quiet", "HEAD", "--", "src", "schema", "tools", "package-lock.json"],
               cwd=reader, check=True)
sys.path.insert(0, str(harness / "scripts"))
from flight_bench_metrics import summarize

run = api(f"actions/runs/{args.run}")
assert run["status"] == "completed" and run["path"] == ".github/workflows/final-web-flight-evidence.yml"
assert run["head_branch"] == "codex/final-web-flight-evidence" and run["event"] == "push"
artifacts = api(f"actions/runs/{args.run}/artifacts?per_page=100")["artifacts"]
jobs = api(f'actions/runs/{args.run}/attempts/{run["run_attempt"]}/jobs?per_page=100')["jobs"]
dest = args.output.resolve()
dest.mkdir(parents=True, exist_ok=False)
download_receipts = []
prefix = f'final-web-flight-{args.run}-{run["run_attempt"]}-'
for artifact in sorted(artifacts, key=lambda a: a["name"]):
    if not artifact["name"].startswith(prefix):
        continue
    data = subprocess.check_output(["gh", "api", f'{REPO}/actions/artifacts/{artifact["id"]}/zip'])
    assert "sha256:" + sha(data) == artifact["digest"]
    download_receipts.append({k: artifact[k] for k in ["id", "name", "digest", "size_in_bytes"]})
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for entry in z.infolist():
            member = PurePosixPath(entry.filename)
            if entry.is_dir():
                continue
            if member.is_absolute() or ".." in member.parts:
                raise ValueError(f"Unexpected artifact member {member}")
            key, *tail = member.parts
            raw = z.read(entry)
            if key == "reports":
                preserve(dest.joinpath(*tail), raw)
            elif key == "attempts":
                # Retain the process log and every partial/different report. The canonical report is stored once.
                group, stem, attempt, filename = tail
                same = f"reports/{group}/{filename}"
                if same not in z.namelist() or raw != z.read(same):
                    preserve(dest / member, raw)
            else:
                preserve(dest / member, raw)

receipt = {k: run[k] for k in ["id", "run_attempt", "name", "event", "head_branch", "head_sha", "path",
                                "html_url", "conclusion", "created_at", "updated_at"]}
receipt["artifacts"] = download_receipts
receipt["jobs"] = [{"name": job["name"], "url": job["html_url"], "conclusion": job["conclusion"],
                    "started": job["started_at"], "completed": job["completed_at"],
                    "failedSteps": [s["name"] for s in job["steps"] if s["conclusion"] == "failure"]} for job in jobs]
save(dest / "hosted-run.json", receipt)
target, runtime = read(dest / "target.json"), read(dest / "runtime.json")
assert runtime["controller"] == target["source"] and runtime["entry"]["sha256"] == target["entrySha256"]
assert sha((dest / "SHA256SUMS").read_bytes()) == runtime["sha256sums"]
assert sha((HERE / "inputs.zip").read_bytes()) == manifest["inputZipSha256"]
calibration = target["kind"] == "stock-calibration"
reference = "stock" if calibration else "integrated-946d2f7e"
expected = {row["group"] + "/" + row["name"] for row in manifest["cases"] if row["group"] in GROUPS}
if "only" in target:
    assert set(target["only"]) <= expected
    expected = set(target["only"])
shards = [read(p) for p in dest.glob("shard-*.json")]
selected = [key for shard in shards for key in shard["selected"]]
assert len(selected) == len(set(selected)) and set(selected) <= expected
if len(shards) == target["shards"]:
    assert set(selected) == expected
observations = []
with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(HERE / "inputs.zip") as glbs:
    for row in manifest["cases"]:
        key = row["group"] + "/" + row["name"]
        if row["group"] not in GROUPS or ("only" in target and key not in target["only"]):
            continue
        path = dest / key
        if not path.is_file():
            attempts = sorted((dest / "attempts" / row["group"] / Path(row["name"]).stem).glob("*/" + row["name"]))
            completed = [p for p in attempts if read(p).get("metrics", {}).get("completed")]
            if len(completed) != 1:
                observations.append({"case": key, "status": "unmeasured", "attempts": len(attempts)})
                continue
            # A post-flight reader failure leaves the complete browser JSON in its original attempt.
            preserve(path, completed[0].read_bytes())
        report = read(path)
        prior = read(bench / row["history"][reference]["report"])
        stock = read(bench / row["history"]["stock"]["report"])
        correction = read(bench / row["history"]["integrated-946d2f7e"]["report"])
        for original in [stock, correction]:
            for field in SHARED:
                if report[field] != original[field]:
                    raise ValueError(f"{key} differs from {original['build']['sourceCommit']} in {field}")
            if clocks(report) != clocks(original):
                raise ValueError(f"Unsynchronized sample times at {key}")
        assert report["world"] == row["world"] and report["experiment"] == row["experiment"]
        assert report["schedule"] == row["schedule"] and report["build"]["sourceCommit"] == target["source"]
        assert report["build"]["dirty"] is False and report["binary"] == runtime["entry"]
        asset = glbs.read("glb/" + report["sha256"] + ".glb")
        assert sha(asset) == report["world"]["sha256"] and len(asset) == report["world"]["bytes"]
        outcome, metrics = summarize(report)
        assert outcome == report["outcome"] and metrics == report["metrics"] and metrics["completed"]
        assert report["returnedToBuiltin"] and not report["errors"]
        asset_file = Path(tmp) / "world.glb"
        asset_file.write_bytes(asset)
        result = json.loads(subprocess.check_output(["node", str(reader / "tools/read-flight-diagnostic.js"),
                                                     str(asset_file), str(path)]))
        assert result["sha256"] == sha(asset) and result["outcome"] == outcome
        differences = [math.dist([a["position"][axis] for axis in "xyz"], [b["position"][axis] for axis in "xyz"])
                       for a, b in zip(report["trace"], prior["trace"], strict=True)]
        observed = {
            "case": key, "status": "measured", "outcome": outcome, "met": metrics["meetsDisposition"],
            "disposition": row["experiment"]["disposition"], "reportSha256": sha(path.read_bytes()),
            "worldSha256": sha(asset), "samples": len(differences), "clockMatchesStockAnd946": True,
            "exactTraceVsReference": report["trace"] == prior["trace"], "maxPositionDeltaM": max(differences),
            "referenceCommit": prior["build"]["sourceCommit"], "shieldImpacts": metrics["shieldImpacts"],
            "sampledHullIntrusion": metrics["sampledHullIntrusion"], "captureLosses": metrics["contactLossesBeforeRelease"],
            "releasePhase": report["trace"][report["releaseTick"]]["phase"], "activeRelease": metrics["activeRelease"],
            "longestGlideM": metrics["longestSampledGlideM"], "releaseSpeedRetention": metrics["releaseSpeedRetention"],
            "minimumSolidM": metrics["minimumSampledSolidDistanceM"],
        }
        if calibration:
            assert observed["outcome"] == stock["outcome"] and observed["met"] == stock["metrics"]["meetsDisposition"]
        observations.append(observed)

if not calibration:
    for groups, extra in [(GROUPS[:2], []), *[([name], ["--panel", name, "--sealed-cases", str(bench / (name + ".json")),
              "--panel-stock", str(bench / branch / (name + "-stock"))])
              for name, branch in [("second-holdout", "integrated-7845d30f"), ("third-holdout", "integrated-946d2f7e")]]]:
        rows = [r for r in observations if r["case"].split("/")[0] in groups]
        if not all(r["status"] == "measured" for r in rows):
            continue
        comparison = subprocess.check_output([sys.executable, "-B", str(harness / "scripts/compare-flight-controllers.py"),
                                             str(dest), "--stock", str(bench), *extra])
        assert len(json.loads(comparison)["cases"]) == len(rows)
        (dest / ("compare-" + "-".join(groups) + ".json")).write_bytes(comparison)

shipped = []
if target.get("shippedWorlds") and (dest / "shipped/readback.json").is_file():
    current = read(dest / "shipped/readback.json")
    baseline = read(HERE / "results/shipped-stock/readback.json")
    assert current["sourceCommit"] == target["source"] and current["entrySha256"] == target["entrySha256"]
    assert current["names"] == baseline["names"] and len(current["worlds"]) <= len(baseline["worlds"])
    assert current["complete"] == (len(current["worlds"]) == 5)
    for old, new in zip(baseline["worlds"], current["worlds"]):
        name = old["name"]
        assert name == new["name"] and new["worldSha256"] == old["worldSha256"] and new["bytes"] == old["bytes"]
        old_file, new_file = HERE / f"results/shipped-stock/{name}.json", dest / f"shipped/{name}.json"
        assert sha(old_file.read_bytes()) == old["traceSha256"] and sha(new_file.read_bytes()) == new["traceSha256"]
        assert sha((dest / f"shipped/{name}.glb").read_bytes()) == new["worldSha256"]
        stock, report = read(old_file), read(new_file)
        assert all(stock[k] == report[k] for k in SHARED) and clocks(stock) == clocks(report)
        assert report["binary"] == runtime["entry"] and report["returnedToBuiltin"] and not report["errors"]
        outcome, metrics = summarize(report)
        assert metrics == report["metrics"] and outcome == new["outcome"]
        shipped.append({"name": name, "stock": old, "final": new, "samples": len(clocks(report)),
                        "identicalTraceToStock": stock["trace"] == report["trace"]})
counts = Counter(r["status"] for r in observations)
assert {r["case"] for r in observations} == expected
summary = {"source": target["source"], "entry": runtime["entry"], "run": receipt["html_url"], "reference": reference,
           "assigned": len(observations), "measured": counts["measured"], "met": sum(r.get("met", False) for r in observations),
           "unmeasured": counts["unmeasured"], "cases": observations, "shippedAssigned": 5 if target.get("shippedWorlds") else 0,
           "shipped": shipped}
save(dest / "measurement.json", summary)
print(f'{summary["met"]}/{summary["measured"]} measured dispositions, {summary["unmeasured"]} unmeasured, {len(shipped)} shipped flights.')
