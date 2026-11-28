"""Verify the revised official native artifact before the exclusive desktop slot."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
from datetime import datetime, timezone
from zipfile import ZipFile


REPO = "styayur/Skimmer-Scraper"


def gh(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", "repos/" + REPO + "/" + endpoint]))


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(file):
    return json.loads(file.read_bytes().decode("utf-8-sig"))


def official_bytes(handoff, archive_path):
    sha = handoff["sourceCommit"]
    executable, installer = (Path(handoff[k]).resolve(strict=True) for k in ("exe", "installer"))
    assert digest(archive_path) == handoff["artifactSha256"]
    with ZipFile(archive_path) as archive:
        def member(name):
            return archive.read(name)

        build = json.loads(member("dist/build-info.json").decode("utf-8-sig"))
        smoke = json.loads(member("acceptance/installed-smoke/desktop-smoke.json").decode("utf-8-sig"))
        hashes = json.loads(member("acceptance/installed-smoke/hashes.json").decode("utf-8-sig"))
        installed = {row["File"].lower(): row["Hash"].lower() for row in hashes}
        bundles = [name for name in archive.namelist() if PurePosixPath(name).suffix == ".exe"
                   and "/bundle/nsis/" in name]
        assert len(bundles) == 1 and PurePosixPath(bundles[0]).name == installer.name
        installer_hash = hashlib.sha256(member(bundles[0])).hexdigest()
    assert build == read_json(Path(handoff["metadata"])) == smoke["runtime"]["app"]
    assert build["sourceCommit"] == sha and build["dirty"] is False and build["toolchain"]["platform"] == "win32"
    assert build["sourceUrl"] == "https://github.com/" + REPO + "/tree/" + sha
    assert installer_hash == digest(installer) == handoff["installerSha256"] == installed[installer.name.lower()]
    exe_hash = digest(executable)
    assert exe_hash == smoke["executableSha256"] == handoff["exeSha"] == installed[executable.name.lower()]
    return {"build": build, "nsis": {"name": installer.name, "sha256": installer_hash},
            "executable": {"name": executable.name, "sha256": exe_hash, "bytes": executable.stat().st_size},
            "hostedInstalledSmoke": "acceptance/installed-smoke/desktop-smoke.json"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("handoff", type=Path)
    parser.add_argument("directory", type=Path, help="new staging directory")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--installed-exe", type=Path, help="already installed local client from the same NSIS")
    opts = parser.parse_args()
    handoff = read_json(opts.handoff)
    sha = handoff["sourceCommit"]
    pr = gh("pulls/97")
    assert pr["merged"] and pr["base"]["ref"] == "main", "The release correction in PR 97 has not merged"
    merge = pr["merge_commit_sha"]
    if merge != sha:
        assert gh("compare/" + merge + "..." + sha)["status"] == "ahead", "Native input predates PR 97"
    source = gh("commits/" + sha)
    run = gh("actions/runs/" + str(handoff["run"]))
    artifact = gh("actions/artifacts/" + str(handoff["artifactId"]))
    assert run["head_sha"] == sha and run["head_branch"] == "main" and run["conclusion"] == "success"
    assert run["path"] == ".github/workflows/windows-desktop.yml" and run["event"] in ("workflow_dispatch", "push")
    assert artifact["name"] == "windows-x64-" + sha and artifact["workflow_run"]["id"] == run["id"]
    assert artifact["digest"] == "sha256:" + handoff["artifactSha256"]
    archive = opts.archive or opts.handoff.parent / "actions-artifact.zip"
    identity = official_bytes(handoff, archive)
    exe = (opts.installed_exe or Path(handoff["exe"])).resolve(strict=True)
    assert exe.name.lower() == identity["executable"]["name"].lower()
    assert digest(exe) == identity["executable"]["sha256"]
    identity.update({
        "preparedUtc": datetime.now(timezone.utc).isoformat(), "pr97Merge": merge,
        "tree": source["commit"]["tree"]["sha"], "verifiedSourceSignature": source["commit"]["verification"]["verified"],
        "workflow": run["html_url"], "artifactId": artifact["id"], "archiveSha256": handoff["artifactSha256"],
        "launchImage": ("supplied local installation of the revised official NSIS" if opts.installed_exe
                        else "official NSIS payload from the release handoff, verified against the CI installation"),
        "method": "Official main Windows build. Local NSIS bytes match the installer member of the verified Actions ZIP. "
                  "The launched NSIS payload matches the SHA-256 of that workflow's normally installed, smoke-tested exe.",
    })
    opts.directory.mkdir(parents=True, exist_ok=False)
    def save(name, data):
        (opts.directory / name).write_bytes((json.dumps(data, indent=2) + "\n").encode())
    save("inputs.json", identity)
    save("local-launch.json", {"exe": str(exe), "bytes": exe.stat().st_size, "mtimeNs": str(exe.stat().st_mtime_ns)})
    print("Verified", sha, "and staged its installed client identity in", opts.directory)


if __name__ == "__main__":
    main()
