"""Stage the expected main deployment and check every public file against its Pages artifact."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
from zipfile import ZipFile


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/styayur/Skimmer-Scraper/{path}"]))


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def stage_site(archive, site):
    files = {}
    with ZipFile(archive) as outer:
        if outer.namelist() != ["artifact.tar"]:
            raise ValueError("Unexpected GitHub Pages artifact members")
        with outer.open("artifact.tar") as payload, tarfile.open(fileobj=payload, mode="r|*") as bundle:
            for member in bundle:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts or any(c in member.name for c in "\\:"):
                    raise ValueError(f"Invalid site member {member.name}")
                target = site.joinpath(*path.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    raise ValueError(f"Unsupported site member {member.name}")
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                files[path.as_posix()] = digest(target)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=int, help="Manual GitHub Pages deployment run")
    parser.add_argument("commit", help="Full merged source SHA")
    parser.add_argument("output", type=Path, help="New directory for the official site and receipt")
    args = parser.parse_args()
    run = api(f"actions/runs/{args.run}")
    if (not re.fullmatch(r"[a-f0-9]{40}", args.commit) or run["head_sha"] != args.commit or
            (run["path"], run["event"], run["head_branch"], run["conclusion"]) !=
            (".github/workflows/deploy-github-pages.yml", "workflow_dispatch", "main", "success")):
        raise ValueError("Run is not the successful manual main deployment for this commit")
    name = f"github-pages-{args.run}-{run['run_attempt']}"
    artifacts = api(f"actions/runs/{args.run}/artifacts")["artifacts"]
    artifact, = [item for item in artifacts if item["name"] == name and not item["expired"]]
    if artifact["workflow_run"]["id"] != args.run or artifact["workflow_run"]["head_sha"] != args.commit:
        raise ValueError("Artifact run or revision does not match the requested deployment")

    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    archive = root / "pages-artifact.zip"
    with archive.open("xb") as destination:
        subprocess.run(["gh", "api", f"repos/styayur/Skimmer-Scraper/actions/artifacts/{artifact['id']}/zip"],
                       stdout=destination, check=True)
    if archive.stat().st_size != artifact["size_in_bytes"] or "sha256:" + digest(archive) != artifact["digest"]:
        raise ValueError("Downloaded GitHub artifact fails its published size or SHA-256")
    site = root / "site"
    files = stage_site(archive, site)
    build = json.loads((site / "build-info.json").read_bytes())
    if build["sourceCommit"] != args.commit or build["dirty"] is not False:
        raise ValueError("Site build identity differs from the merged source")
    raw = root / "public-files.json"
    subprocess.run(["node", str(Path(__file__).with_name("verify-deployed-assets.mjs")), str(site), str(raw)], check=True)
    public = json.loads(raw.read_bytes())
    served = {entry["file"]: {"bytes": entry["bytes"], "sha256": entry["sha256"]} for entry in public["files"]}
    if files != {path: entry["sha256"] for path, entry in served.items()}:
        raise ValueError("Public and workflow inventories differ")
    proof = {"url": public["url"], "build": build,
             "workflow": {"url": run["html_url"], "id": args.run, "attempt": run["run_attempt"],
                          "headSha": args.commit, "headBranch": run["head_branch"], "event": run["event"],
                          "conclusion": run["conclusion"]},
             "artifact": {k: artifact[k] for k in ("id", "name", "digest", "size_in_bytes")},
             "files": files, "servedFiles": served}
    (root / "live-proof.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(files)} public files from {name} at {args.commit}")


if __name__ == "__main__":
    main()
