"""Assemble a dated Skimmer distribution from a clean product checkout and measured artifacts."""
import argparse
from datetime import date, datetime, timezone
import hashlib
from html.parser import HTMLParser
from itertools import count
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile
from release_identity import same_clean_source

SCRIPTS = Path(__file__).resolve().parent
SHA = re.compile(r"[0-9a-f]{40}")
EXE = "skimmer-scraper.exe"
MANIFEST = "release-manifest.json"
RAW_TREES = ("acceptance/joint-flight/topogenesis/", "acceptance/v011/", "acceptance/v0110/")
SOURCE_FIELDS = ("version", "sourceCommit", "sourceCommitTime", "sourceUrl")


def require(value, message):
    if not value:
        raise ValueError(message)


def read(path):
    return json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def asset(path, kind):
    return dict(name=path.name, kind=kind, bytes=path.stat().st_size, sha256=digest(path))


def checksums(folder):
    files = sorted(p for p in folder.iterdir() if p.is_file() and p.name != "SHA256SUMS.txt")
    (folder / "SHA256SUMS.txt").write_text("".join(f"{digest(p)}  {p.name}\n" for p in files),
                                          encoding="utf-8", newline="\n")


def tool(name, *args, log):
    with log.open("wb") as output:
        subprocess.run([sys.executable, SCRIPTS / name, *args], stdout=output, check=True)


def member(name):
    p = PurePosixPath(name)
    require(p.parts and not p.is_absolute() and p.as_posix() == name
            and not any(t in ("..", ".git", "node_modules") or t.startswith(".env")
                        or ":" in t or "\\" in t for t in p.parts), f"Invalid member {name!r}")
    return name


def local_file(root, name):
    path = (root / member(name)).resolve(strict=True)
    require(path.is_relative_to(root.resolve()) and path.is_file(), f"Expected a file inside {root}: {name}")
    return path


class FlightBuild(HTMLParser):
    def __init__(self):
        super().__init__()
        self.records = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("name") == "skimmer-flight-build":
            self.records.append(json.loads(attrs["content"]))


def check_web(folder, source, seal):
    manifest = read(folder / MANIFEST)
    static, source_zip = (folder / a["name"] for a in manifest["assets"])
    with ZipFile(static) as web, ZipFile(source_zip) as archive:
        build = json.loads(web.read("build-info.json"))
        require(build == json.loads(archive.read("SOURCE_REVISION.json")), "Source and site revision differ")
        require(build["dirty"] is False and all(build[k] == manifest[k] for k in SOURCE_FIELDS),
                "Site and manifest identities differ")
        tracked = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", "-z", "HEAD"], cwd=source)
        missing = set(tracked.decode().split("\0")[:-1]).difference(archive.namelist())
        require(not missing, f"Missing tracked source files: {sorted(missing)[:5]}")
        for n in ("vendor/glib/LICENSE", "vendor/glib/Cargo.toml", "security/glib-provenance.json",
                  "src-tauri/Cargo.lock", "README.md", "CHANGELOG.md"):
            require(n in archive.namelist(), f"Missing corresponding source: {n}")
        notices = ["LICENSE", "CREDITS.md", *(n for n in archive.namelist() if n.startswith("licenses/") and not n.endswith("/"))]
        for n in notices:
            require(web.read(n).replace(b"\r\n", b"\n") == archive.read(n).replace(b"\r\n", b"\n"),
                    f"Site notice differs from corresponding source: {n}")
        catalog = archive.read("src/world/kinetic/kinetic-flight-modules.r2.json")
        credits = web.read("CREDITS.md")
        require(hashlib.sha256(catalog).hexdigest().encode() in credits
                and b"licenses/V2Wpro-kinetic-MIT.txt" in credits, "Kinetic catalog attribution is missing or stale")
        html = FlightBuild()
        html.feed(web.read("index.html").decode())
        [embedded] = html.records
        require(embedded["dirty"] is False and all(embedded[k] == build[k] for k in ("version", "sourceCommit")),
                "Embedded entry metadata differs from the site")
        binary = embedded["binary"]
        entry = web.read(member(binary["url"]))
        require(len(entry) == binary["bytes"] and hashlib.sha256(entry).hexdigest() == binary["sha256"],
                "Site entry differs from the executable recorded in index.html")
        if seal:
            sealed = read(seal)
            files = {n: hashlib.sha256(web.read(n)).hexdigest() for n in web.namelist() if not n.endswith("/")}
            require(sealed["source"] == build["sourceCommit"] and sealed["files"] == files,
                    "Packaged site differs from the supplied sealed file inventory")
        return {"build": build, "entry": binary, "files": len(web.namelist()), "sourceFiles": len(tracked.split(b"\0")) - 1,
                "sealSha256": digest(seal) if seal else None}


def smoke_ok(smoke):
    return (smoke["errors"] == [] and smoke["escapePause"] is True and smoke["fullscreenRoundTrip"] is True
            and smoke["flight"]["companions"] == 3 and smoke["flight"]["time"] >= 2)


def native_attestation(native, installed, site, destination, previous):
    raw = native / "acceptance/installed-smoke"
    [installer] = (native / "src-tauri/target/release/bundle/nsis").glob("*-setup.exe")
    smoke = read(raw / "desktop-smoke.json")
    runtime = smoke["runtime"]["app"]
    require(runtime == read(native / "dist/build-info.json") and same_clean_source(runtime, site)
            and smoke_ok(smoke), "Installed smoke identity or flight failed")
    hashes = {r["File"]: r["Hash"].lower() for r in read(raw / "hashes.json")}
    exe_hash = digest(installed / EXE)
    require(hashes[installer.name] == digest(installer) and hashes[EXE] == exe_hash == smoke["executableSha256"].lower(),
            "Installer, installed measurement or portable input bytes differ")
    receipt = dict(sha=runtime["sourceCommit"], version=runtime["version"], installer=installer.name,
                   installerSha256=hashes[installer.name], installedExecutableSha256=exe_hash, installExit=0)
    if previous:
        supplied = read(previous)
        require(all(supplied[k] == v for k, v in receipt.items()) and supplied.get("signing"), "Install receipt differs")
        receipt = supplied
    else:
        require(os.name == "nt", "Supply the matching Windows --install-receipt when assembling on another OS")
        result = subprocess.check_output(["powershell.exe", "-NoProfile", "-Command",
            "(Get-AuthenticodeSignature -LiteralPath $env:SKIMMER_ASSEMBLY_INSTALLER).Status.ToString()"],
            env={**os.environ, "SKIMMER_ASSEMBLY_INSTALLER": str(installer)}, text=True).strip()
        receipt.update(signing=result, scope="currentUser", method="Windows desktop workflow wrote installed hashes after checking NSIS exit zero and WebView2 flight.")
    destination.mkdir()
    for n in ("desktop-smoke.json", "hashes.json"):
        shutil.copyfile(raw / n, destination / n)
    write(destination / "install.json", receipt)
    return installer, receipt


def prepare(args):
    source, dist, native = (p.resolve(strict=True) for p in (args.source, args.dist, args.native))
    require(SHA.fullmatch(args.sha) and subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip() == args.sha,
            "Expected SHA differs from the source checkout")
    site = read(dist / "build-info.json")
    version = read(source / "package.json")["version"]
    require(version == "0.11.0" and site["version"] == version and site["sourceCommit"] == args.sha and site["dirty"] is False,
            "Expected a clean v0.11.0 site and matching checkout")
    commit_time = subprocess.check_output(["git", "show", "-s", "--format=%cI", "HEAD"], cwd=source, text=True).strip()
    require(same_clean_source(site, {**site, "sourceCommitTime": commit_time,
            "sourceUrl": f"https://github.com/styayur/Skimmer-Scraper/tree/{args.sha}"}), "Unexpected site source provenance")
    stage = args.output.resolve() / f"{args.date}-v{version}-{args.sha[:12]}"
    require(not stage.is_relative_to(dist) and not stage.is_relative_to(native) and not stage.is_relative_to(source),
            "Use separate staging outside the product inputs")
    base = stage
    for number in count(1):
        stage = base if number == 1 else base.with_name(f"{base.name}-attempt{number}")
        try:
            stage.mkdir(parents=True)
            break
        except FileExistsError:
            continue
    print(stage, flush=True)
    prepared = stage / "prepared"
    tool("package-release.py", prepared, "--source", source, "--dist", dist, "--full-source", log=stage / "static-source.json")
    web = check_web(prepared, source, args.site_seal)
    manifest = read(prepared / MANIFEST)
    static = prepared / manifest["assets"][0]["name"]
    prefix = f"skimmer-scraper-v{version}"
    itch = prepared / f"{prefix}-itch-html5.zip"
    shutil.copyfile(static, itch)
    manifest["assets"].append(asset(itch, "itch-html5"))
    installed = (args.installed or native / "portable").resolve(strict=True)
    installer, receipt = native_attestation(native, installed, site, stage / "installed", args.install_receipt)
    shutil.copyfile(installer, prepared / installer.name)
    manifest["assets"].append({**asset(prepared / installer.name, "windows-nsis"), "authenticode": receipt["signing"]})
    portable = prepared / f"{prefix}-windows-x64-portable.zip"
    tool("package-windows-portable.py", installed, static, stage / "installed/desktop-smoke.json", portable,
         log=stage / "portable-sha256.txt")
    manifest["assets"].append({**asset(portable, "windows-portable"), "executableSha256": receipt["installedExecutableSha256"]})
    write(prepared / MANIFEST, manifest)
    checksums(prepared)
    tool("verify-release-package.py", prepared, log=stage / "verified-preparation.json")
    write(stage / "preparation.json", dict(date=args.date.isoformat(), stage="rehearsal" if args.rehearsal else "release",
        sourceCommit=args.sha, version=version, site=web, native=read(native / "dist/build-info.json"),
        installer=receipt, manifestSha256=digest(prepared / MANIFEST)))


def itch_files(directory, archive, build):
    summary = read(directory / "summary.json")
    require(summary["stage"] == "final" and summary["passed"] is True and summary["build"] == build
            and summary["expectedCommit"] == build["sourceCommit"] and summary["archiveSha256"] == digest(archive)
            and summary["archiveBytes"] == archive.stat().st_size and summary["archiveName"] == archive.name,
            "Itch qualification must measure these final ZIP bytes")
    cases = {(row["mode"], row["locale"]) for row in summary["cases"] if row["passed"] is True}
    require(len(summary["cases"]) == 4 and cases == {(m, l) for m in ("standalone", "embed") for l in ("en-US", "zh-CN")},
            "Missing qualified itch presentation or locale")
    files = {"summary.json": directory / "summary.json"}
    for row in summary["cases"]:
        name = f"{row['mode']}/{row['locale']}"
        require(row["receipt"] == name + ".json", "Wrong itch case receipt")
        receipt = local_file(directory, row["receipt"])
        result = read(receipt)
        require(result["passed"] is True and result["identity"]["build"] == build and result["mode"] == row["mode"]
                and result["locale"] == row["locale"], "Itch case evidence differs")
        files[row["receipt"]] = receipt
        for view in ("title", "flight"):
            image = name + f"-{view}.png"
            files[image] = local_file(directory, image)
    return files


def check_lifecycle(receipt, state):
    require(receipt["passed"] is True and receipt["target"] == state["version"]
            and [s["step"] for s in receipt["stages"]] == ["original", "upgrade", "rollback", "reupgrade"],
            "Incomplete Windows upgrade and rollback receipt")
    for stage in (s for s in receipt["stages"] if s["step"] in ("upgrade", "reupgrade")):
        installed = stage["install"]
        require(installed["source"] == state["sourceCommit"] and installed["exitCode"] == 0
                and installed["installerSha256"].lower() == state["installer"]["installerSha256"]
                and installed["exeSha256"].lower() == state["installer"]["installedExecutableSha256"],
                "Windows lifecycle exercised different installer or executable bytes")
    return receipt["from"]


def evidence_files(index, state, source_zip, static_zip):
    document = read(index)
    require(document["sourceCommit"] == state["sourceCommit"], "Evidence index identifies another assembly")
    result, roles, lanes, names = {}, set(), set(), set()
    for item in document["files"]:
        name = member(item["path"])
        path = local_file(index.parent, name)
        require(name.casefold() not in names and digest(path) == item["sha256"]
                and SHA.fullmatch(item["sourceCommit"]), f"Duplicate or mismatched evidence: {name}")
        names.add(name.casefold())
        role = item["role"]
        if role in ("source-rebuild", "public-web", "web-audio", "desktop-audio", "windows-lifecycle"):
            require(item["sourceCommit"] == state["sourceCommit"], f"Wrong product revision for {role}")
        if role == "source-rebuild":
            rebuild = read(path)
            require(rebuild["build"] == state["site"]["build"] and rebuild["sourceZipSha256"] == digest(source_zip)
                    and rebuild["deployedFiles"] == rebuild["rebuiltFiles"] == state["site"]["files"]
                    and rebuild["differences"] == [], "Source rebuild did not reproduce this site")
        elif role == "windows-lifecycle":
            lanes.add(check_lifecycle(read(path), state))
        elif role in ("web-audio", "desktop-audio"):
            audio = read(path)
            expected = state["native"] if role == "desktop-audio" else state["site"]["build"]
            require(all(audio["build"][k] == v for k, v in expected.items()) and audio["endpointVerified"] is True
                    and audio["issues"] == [], f"Audio receipt differs from the measured {role} build")
        elif role == "public-web":
            proof = read(path)
            run = proof["workflow"]
            require(proof["build"] == state["site"]["build"] and run["headSha"] == state["sourceCommit"]
                    and run["headBranch"] == "main" and run["event"] == "workflow_dispatch" and run["conclusion"] == "success",
                    "Public Pages proof does not identify the expected deployment")
            with ZipFile(static_zip) as web:
                files = {n: hashlib.sha256(web.read(n)).hexdigest() for n in web.namelist() if not n.endswith("/")}
            require(files == proof["files"] == {n: v["sha256"] for n, v in proof["servedFiles"].items()},
                    "Public response bytes differ from the distributed site")
        result[name] = path
        roles.add(role)
    required = {"raw", "failed"}
    if state["stage"] == "release":
        require(lanes == {"0.8.2", "0.9.1", "0.9.2", "0.10.0"}, "Missing Windows version lanes for this installer")
        required |= {"source-rebuild", "public-web", "web-audio", "desktop-audio", "city-matrix", "desktop-soak",
                     "web-soak", "windows-lifecycle", "linux-security"}
    require(required <= roles, f"Missing evidence roles: {sorted(required - roles)}")
    return result


def finish(args):
    stage = args.stage.resolve()
    prepared = stage / "prepared"
    state = read(stage / "preparation.json")
    require(not (stage / "release").exists(), "A verified output already exists here")
    require(digest(prepared / MANIFEST) == state["manifestSha256"], "Preparation manifest changed")
    report = read(args.report)
    require(all(report[k] == state[k] for k in ("sourceCommit", "version")) and isinstance(report["limitations"], list),
            "The supplied display report must identify this source and its limitations")
    display = args.visual.read_bytes()
    require(display.startswith(b"\xff\xd8\xff") and display.endswith(b"\xff\xd9"), "Expected a JPEG comparison image")
    manifest = read(prepared / MANIFEST)
    for a in manifest["assets"]:
        require(digest(prepared / a["name"]) == a["sha256"], f"Prepared bytes changed: {a['name']}")
    source_zip = prepared / next(a["name"] for a in manifest["assets"] if a["name"].endswith("-source.zip"))
    selected = evidence_files(args.evidence_index, state, source_zip, prepared / manifest["assets"][0]["name"])
    by_kind = {a["kind"]: prepared / a["name"] for a in manifest["assets"] if "kind" in a}
    itch = itch_files(args.itch_evidence, by_kind["itch-html5"], state["site"]["build"])
    portable_smoke = read(args.portable_smoke)
    require(not args.portable_smoke.samefile(stage / "installed/desktop-smoke.json") and smoke_ok(portable_smoke)
            and portable_smoke["runtime"]["app"] == state["native"]
            and portable_smoke["executableSha256"].lower() == state["installer"]["installedExecutableSha256"],
            "Portable smoke must measure the same installed executable and a running flight")
    require(not portable_smoke.get("fixture") or state["stage"] == "rehearsal", "Fixture portable smoke in release mode")
    target = Path(tempfile.mkdtemp(prefix="assembly-", dir=stage))
    for a in manifest["assets"][:2]:
        shutil.copyfile(prepared / a["name"], target / a["name"])
    write(target / MANIFEST, manifest)
    tool("assemble-dual-release.py", target, by_kind["windows-nsis"], args.high_pack, stage / "installed",
         "--forge-directory", args.forge, "--portable", by_kind["windows-portable"], "--portable-smoke", args.portable_smoke,
         log=stage / f"{target.name}-content.log")
    manifest = read(target / MANIFEST)
    bundle = target / f"skimmer-scraper-v{state['version']}-qualification.zip"
    static = target / manifest["assets"][0]["name"]
    with ZipFile(bundle, "x", ZIP_DEFLATED) as z, ZipFile(static) as web, ZipFile(source_zip) as src:
        for n in ("build-info.json", "LICENSE", "CREDITS.md", *(n for n in web.namelist() if n.startswith("licenses/"))):
            z.writestr(n, web.read(n))
        for n in src.namelist():
            if n.startswith(RAW_TREES) and not n.endswith("/"):
                z.writestr(n, src.read(n))
        for n in ("install.json", "desktop-smoke.json", "hashes.json"):
            z.write(stage / "installed" / n, "installed/" + n)
        z.write(args.portable_smoke, "portable/desktop-smoke.json")
        z.write(stage / "preparation.json", "preparation.json")
        z.write(args.evidence_index, "evidence-index.json")
        for n, p in selected.items():
            z.write(p, "experiments/" + n)
        for n, p in itch.items():
            z.write(p, "itch/" + n)
    manifest["assets"].append(asset(bundle, "qualification"))
    manifest["assemblyDate"] = state["date"]
    manifest["qualificationStage"] = state["stage"]
    write(target / MANIFEST, manifest)
    details = dict(qualificationArchive=bundle.name, visualComparisonSha256=digest(args.visual),
                   qualificationStage=state["stage"], assemblyDate=state["date"],
                   distributionBuilds={"site": state["site"], "native": state["native"]},
                   portableSmokeMethod="fixture" if portable_smoke.get("fixture") else "executed",
                   installed=read(stage / "installed/desktop-smoke.json"))
    for key, value in details.items():
        require(key not in report or report[key] == value, f"Display report has conflicting {key}")
        report[key] = value
    write(target / f"v{state['version']}.json", report)
    shutil.copyfile(args.visual, target / "visual-comparison.jpg")
    checksums(target)
    log = stage / f"{target.name}-verified.json"
    tool("verify-release-package.py", target, log=log)
    verified = read(log)
    require(verified["status"] == "passed" and verified["sourceCommit"] == state["sourceCommit"]
            and len(verified["archives"]) == 9, "Incomplete distribution verification")
    target.rename(stage / "release")
    shutil.copyfile(log, stage / "verified-release.json")
    print(stage / "release")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    command = parser.add_subparsers(dest="command", required=True)
    p = command.add_parser("prepare", help="Package the sealed site, source, installer and portable")
    for name in ("source", "dist", "native", "output"):
        p.add_argument("--" + name, required=True, type=Path)
    for name in ("site-seal", "installed", "install-receipt"):
        p.add_argument("--" + name, type=Path)
    p.add_argument("--sha", required=True)
    p.add_argument("--date", type=date.fromisoformat, default=datetime.now(timezone.utc).date())
    p.add_argument("--rehearsal", action="store_true")
    f = command.add_parser("finish", help="Assemble the nine assets and verify their checksums")
    f.add_argument("stage", type=Path)
    for name in ("high-pack", "forge", "portable-smoke", "itch-evidence", "report", "visual", "evidence-index"):
        f.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    (prepare if args.command == "prepare" else finish)(args)


if __name__ == "__main__":
    main()
