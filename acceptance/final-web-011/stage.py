"""Fetch and verify an identified production artifact. No build or deployment takes place here."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

HERE = Path(__file__).resolve().parent
REPO = "styayur/Skimmer-Scraper"
target = json.loads((HERE / "target.json").read_bytes())
out = Path("output")
out.mkdir(exist_ok=False)
shutil.copyfile(HERE / "target.json", out / "target.json")
workspace = Path("staging")
workspace.mkdir(exist_ok=False)

def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{endpoint}"]))

artifact = workspace / "distribution.zip"
if target["kind"] == "stock-calibration":
    release = api("releases/tags/v0.10.0")
    asset, = [a for a in release["assets"] if a["id"] == target["assetId"]]
    assert asset["digest"] == "sha256:" + target["archiveSha256"]
    subprocess.run(["gh", "release", "download", "v0.10.0", "--repo", REPO, "--pattern", asset["name"],
                    "--output", str(artifact)], check=True)
else:
    assert target["kind"] == "merged-main-artifact"
    pr = api(f'pulls/{target.get("pullRequest", 92)}')
    assert pr["merged"] and pr["merge_commit_sha"] == target["source"] and pr["base"]["ref"] == "main"
    asset = api(f'actions/artifacts/{target["artifactId"]}')
    run = api(f'actions/runs/{target["mainRunId"]}')
    assert asset["workflow_run"]["id"] == run["id"] and asset["workflow_run"]["head_sha"] == target["source"]
    assert asset["name"] == "release-web-" + target["source"] and not asset["expired"]
    assert asset["digest"] == "sha256:" + target["archiveSha256"]
    assert run["head_branch"] == "main" and run["head_sha"] == target["source"] and run["event"] == "push"
    assert run["path"] == ".github/workflows/ci.yml"
    with artifact.open("wb") as file:
        subprocess.run(["gh","api",f'repos/{REPO}/actions/artifacts/{asset["id"]}/zip'],stdout=file,check=True)

assert hashlib.sha256(artifact.read_bytes()).hexdigest() == target["archiveSha256"]
dist = workspace / "extracted"
with zipfile.ZipFile(artifact) as bundle:
    for name in bundle.namelist():
        if not (dist / name).resolve().is_relative_to(dist.resolve()):
            raise ValueError(f"Unexpected artifact member {name}")
    bundle.extractall(dist)
info, = dist.rglob("build-info.json")
subprocess.run([sys.executable, "-B", "benchmark/scripts/freeze-flight-build.py", str(info.parent),
                str(workspace/"served"), str(workspace/"identity"), "--controller", target["source"]], check=True)
identity = json.loads((workspace/"identity/runtime.json").read_bytes())
if identity["entry"]["sha256"] != target["entrySha256"] or identity["entry"]["bytes"] != target["entryBytes"]:
    raise ValueError("The exact served entry differs from the preflighted archive")
for name in ["runtime.json", "SHA256SUMS"]:
    shutil.copyfile(workspace/"identity"/name, out/name)
