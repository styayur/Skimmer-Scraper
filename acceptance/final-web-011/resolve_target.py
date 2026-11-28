"""Identify the actual merged-main distribution and derive the expected browser entry from its HTML."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile


REPO = "repos/styayur/Skimmer-Scraper"


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"{REPO}/{path}"]))


class Entries(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("type") == "module" and values.get("src"):
            self.paths.append(values["src"])


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive_directory", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
pr = api("pulls/92")
if not pr["merged"] or pr["base"]["ref"] != "main":
    raise SystemExit("PR #92 has not merged into main.")
source = pr["merge_commit_sha"]
runs = api(f"actions/workflows/ci.yml/runs?branch=main&event=push&head_sha={source}&per_page=30")
matches = []
for run in runs["workflow_runs"]:
    assert run["path"] == ".github/workflows/ci.yml" and run["head_sha"] == source
    assets = api(f'actions/runs/{run["id"]}/artifacts?per_page=100')
    for asset in assets["artifacts"]:
        if asset["name"] == "release-web-" + source and not asset["expired"]:
            matches.append((run, asset))
if not matches:
    raise SystemExit(f"Merged at {source}. The main CI artifact is still pending.")
if len(matches) != 1:
    raise ValueError("Multiple distinct distributions exist for the merge. Inspect the run provenance.")
run, asset = matches[0]
digest = asset["digest"].removeprefix("sha256:")
args.archive_directory.mkdir(exist_ok=True, parents=True)
archive = args.archive_directory / f'{asset["id"]}.zip'
if not archive.exists():
    with archive.open("xb") as out:
        subprocess.run(["gh", "api", f'{REPO}/actions/artifacts/{asset["id"]}/zip'], stdout=out, check=True)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == digest
with zipfile.ZipFile(archive) as z:
    metadata, = [PurePosixPath(name) for name in z.namelist() if PurePosixPath(name).name == "build-info.json"]
    build = json.loads(z.read(str(metadata)))
    assert build["sourceCommit"] == source and build["dirty"] is False
    entries = Entries()
    entries.feed(z.read(str(metadata.parent / "index.html")).decode("utf-8"))
    entry, = entries.paths
    body = z.read(str(metadata.parent / entry.removeprefix("./")))
target = {
    "kind": "merged-main-artifact", "source": source, "mergedAt": pr["merged_at"],
    "mainRunId": run["id"], "artifactId": asset["id"], "archiveSha256": digest,
    "entryUrl": "/" + entry.removeprefix("./"), "entrySha256": hashlib.sha256(body).hexdigest(),
    "entryBytes": len(body), "shards": 6, "shippedWorlds": True,
}
document = json.dumps(target, indent=2) + "\n"
args.output.write_bytes(document.encode())
print(document)
