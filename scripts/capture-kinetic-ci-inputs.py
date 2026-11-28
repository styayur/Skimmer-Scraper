"""Read the two official Actions archives for hosted qualification of the merged release."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import time
from zipfile import ZipFile

API = "repos/styayur/Skimmer-Scraper/actions"


def query(path):
    return json.loads(subprocess.check_output(["gh", "api", f"{API}/{path}"]))


def capture(root, source, run_id, event, workflow, name, folder, artifact_id=None, pinned_digest=None):
    run = query(f"runs/{run_id}")
    if (run["head_sha"], run["head_branch"], run["event"], run["path"]) != (source, "main", event, workflow):
        raise ValueError(f"Unexpected workflow input: {run_id}")
    if event == "workflow_dispatch" and run["conclusion"] != "success":
        raise ValueError(f"Windows build has not succeeded: {run_id}")
    artifacts = query(f"runs/{run_id}/artifacts?per_page=100")["artifacts"]
    [asset] = [a for a in artifacts if a["name"] == name and not a["expired"]]
    if artifact_id is not None and asset["id"] != artifact_id:
        raise ValueError("The staged Web archive ID differs from the supplied readback")
    archive = root / (folder + ".zip")
    with archive.open("xb") as dest:
        subprocess.run(["gh", "api", f"{API}/artifacts/{asset['id']}/zip"], stdout=dest, check=True)
    with archive.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if (asset["digest"] != "sha256:" + digest or archive.stat().st_size != asset["size_in_bytes"]
            or (pinned_digest is not None and digest != pinned_digest)):
        raise ValueError(f"Original archive digest differs for {asset['name']}")
    target = root / folder
    names = set()
    with ZipFile(archive) as z:
        for entry in z.infolist():
            name = entry.filename.rstrip("/")
            path = PurePosixPath(name)
            if (not path.parts or path.is_absolute() or name != path.as_posix() or ".." in path.parts
                    or any(c in name for c in "\\:") or name.casefold() in names):
                raise ValueError(f"Unexpected archive path: {name}")
            names.add(name.casefold())
            output = target.joinpath(*path.parts)
            if entry.is_dir():
                output.mkdir(parents=True, exist_ok=True)
                continue
            output.parent.mkdir(parents=True, exist_ok=True)
            with z.open(entry) as stream, output.open("xb") as dest:
                shutil.copyfileobj(stream, dest)
    return dict(run=run_id, url=run["html_url"], attempt=run["run_attempt"], id=asset["id"], name=asset["name"],
                sha256=digest, bytes=archive.stat().st_size)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("web_run", type=int)
    parser.add_argument("web_artifact", type=int)
    parser.add_argument("web_digest")
    parser.add_argument("native_run", type=int)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir()
    # The upload in the main CI build precedes the foreground tests and their final status.
    web = capture(args.output, args.source, args.web_run, "push", ".github/workflows/ci.yml",
                  "release-web-" + args.source, "web", args.web_artifact, args.web_digest)
    for _ in range(40):
        if query(f"runs/{args.native_run}")["status"] == "completed":
            break
        time.sleep(15)
    windows = capture(args.output, args.source, args.native_run, "workflow_dispatch",
                      ".github/workflows/windows-desktop.yml", "windows-x64-" + args.source, "windows")
    receipt = dict(sourceCommit=args.source, web=web, windows=windows)
    (args.output / "ci-inputs.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
