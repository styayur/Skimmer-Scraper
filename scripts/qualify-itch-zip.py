"""Play an extracted HTML5 ZIP from a nested HTTP mount in both supported locales."""
import argparse
import functools
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent


class GameFiles(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript",
                      ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".opus": "audio/ogg"}

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, *args):
        pass


def check(condition, message):
    if not condition:
        raise ValueError(message)


def unpack(archive, mount, sha, preview):
    seen = set()
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            name = entry.filename.rstrip("/")
            parts = PurePosixPath(name).parts
            check(parts and name == "/".join(parts) and all(
                part not in (".", "..", "/") and not any(c in part for c in ':\\')
                for part in parts), f"Invalid package path: {name}")
            check(name.casefold() not in seen, f"Duplicate package path: {name}")
            seen.add(name.casefold())
            target = mount.joinpath(*parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.open(entry) as stream, target.open("xb") as output:
                shutil.copyfileobj(stream, output)
    check((mount / "index.html").is_file(), "The ZIP must have index.html at its root.")
    build = json.loads((mount / "build-info.json").read_bytes())
    check(build["sourceCommit"] == sha and build["version"] == "0.9.1", "Unexpected build identity.")
    check(preview or build["dirty"] is False, "The final package must contain a clean build.")
    return build


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--zip", type=Path, help="Final itch ZIP alongside release-manifest.json")
    source.add_argument("--preview-dist", type=Path, help="Create a disposable ZIP from an existing preview build")
    parser.add_argument("--sha", required=True, help="Expected 40-character source commit")
    parser.add_argument("--output", required=True, type=Path, help="Parent directory for separate run receipts")
    args = parser.parse_args()
    check(re.fullmatch("[0-9a-f]{40}", args.sha), "Supply the full expected Git SHA.")
    args.output.mkdir(parents=True, exist_ok=True)
    preview = args.preview_dist is not None
    stage = "preview" if preview else "final"
    output = Path(tempfile.mkdtemp(prefix=f"{stage}-{args.sha[:8]}-", dir=args.output.resolve()))
    report = {"stage": stage, "expectedCommit": args.sha, "started": datetime.now(timezone.utc).isoformat(),
              "liveItchListing": "unverified", "cases": [], "passed": False}
    print(f"Evidence: {output}", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="skimmer-itch-") as workspace:
            temp = Path(workspace)
            if preview:
                dist = args.preview_dist.resolve(strict=True)
                check((dist / "index.html").is_file(), "Preview dist has no index.html.")
                archive = Path(shutil.make_archive(str(temp / "preview-itch-html5"), "zip", dist))
                report["previewDist"] = str(dist)
            else:
                archive = args.zip.resolve(strict=True)
                report["archivePath"] = str(archive)
            with archive.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            report.update(archiveName=archive.name, archiveSha256=digest, archiveBytes=archive.stat().st_size)
            if not preview:
                manifest = json.loads((archive.parent / "release-manifest.json").read_bytes())
                [asset] = [a for a in manifest["assets"] if a.get("kind") == "itch-html5"]
                [static] = [a for a in manifest["assets"] if a["name"].endswith("-static.zip")]
                check(manifest["sourceCommit"] == args.sha and manifest["version"] == "0.9.1",
                      "Release manifest does not identify the expected source.")
                check(asset["name"] == archive.name and asset["bytes"] == archive.stat().st_size
                      and asset["sha256"] == static["sha256"] == digest, "Final itch/static asset identity mismatch.")
            host = temp / "host"
            prefix = f"uploads/{args.sha[:12]}/html5"
            report["build"] = unpack(archive, host / prefix, args.sha, preview)
            handler = functools.partial(GameFiles, directory=str(host))
            with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    url = f"http://127.0.0.1:{server.server_port}/{prefix}/"
                    failed_modes = []
                    for mode in ["standalone", "embed"]:
                        directory = output / mode
                        command = ["node", "scripts/verify-shift-web.mjs", url, args.sha, str(directory), mode, "--smoke"]
                        result = subprocess.run(command, cwd=ROOT)
                        for locale in ["zh-CN", "en-US"]:
                            receipt = directory / f"{locale}.json"
                            row = json.loads(receipt.read_bytes()) if receipt.exists() else {}
                            report["cases"].append({"mode": mode, "locale": locale, "passed": row.get("passed", False),
                                                    "receipt": receipt.relative_to(output).as_posix() if row else None})
                        if result.returncode:
                            failed_modes.append(mode)
                    check(not failed_modes, f"Browser smoke failed for {failed_modes}. See {output}.")
                finally:
                    server.shutdown()
                    thread.join()
            check(all(row["passed"] for row in report["cases"]), "Missing browser smoke evidence.")
            report["passed"] = True
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        (output / "summary.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
