"""Replay one frozen batch on an independently served, identified game build."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from flight_bench_cases import read_sealed_holdout

root = Path(__file__).resolve().parents[1]
evidence = root / "acceptance/joint-flight/topogenesis"
matrix = json.loads((evidence / "matrix.json").read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("batch", choices=["baseline", "paired", "development", "holdout", "second-holdout", "third-holdout"])
parser.add_argument("producer", type=Path, help="Independent V2Wpro checkout with its dependencies installed")
parser.add_argument("output", type=Path, help="New directory, or an existing directory without the selected reports")
parser.add_argument("--revision", type=int, choices=[0, 1, 2], default=0)
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--browser")
parser.add_argument("--controller", default=matrix["controller"], help="Expected clean game source commit")
parser.add_argument("--entry-sha256", default=matrix["entrySha256"], help="Expected served JavaScript entry digest")
parser.add_argument("--sealed-cases", type=Path, help="Input payload for the selected committed holdout")
parser.add_argument("--verify-with", type=Path, help="Regenerate the GLB and validate an existing report with the producer reader")
parser.add_argument("--only", help="Filter by module or decimal seed")
parser.add_argument("--resume", action="store_true", help="Reuse completed reports matching the frozen case and controller")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
producer = args.producer.resolve()
sealed_assets = {}
if args.batch == "baseline":
    rows = [row + ["entry", 3] for row in matrix["baselines"]]
elif args.batch == "paired":
    rows = matrix["pairedProbes"] + [row for row in matrix["development"] if row[1] in matrix["pairedSeeds"]]
elif args.batch in {"second-holdout", "third-holdout"}:
    if not args.sealed_cases or args.revision != 2:
        parser.error("A sealed holdout requires --sealed-cases and --revision 2")
    rows, sealed_assets = read_sealed_holdout(args.sealed_cases, evidence / f"{args.batch}-commitment.json", matrix)
else:
    rows = matrix[args.batch]
if args.only:
    rows = [row for row in rows if args.only in [row[0], str(row[1])]]
if not rows:
    parser.error("No matching case")
for module, seed, profile, tick, disposition, approach, wingmates in rows:
    report = args.output / f"{module}-{seed}-{profile}.json"
    if args.verify_with and not report.is_file():
        parser.error(f"Missing report to verify: {report}")
    if report.exists() and not args.verify_with:
        if args.resume:
            saved = json.loads(report.read_text())
            expected = dict(module=module, seed=seed, profile=profile, ruleRevision=args.revision,
                            disposition=disposition, approach=approach, wingmates=wingmates)
            if (all(saved.get("experiment", {}).get(key) == value for key, value in expected.items())
                    and saved.get("releaseTick") == tick and saved.get("metrics", {}).get("completed")
                    and saved.get("build", {}).get("sourceCommit") == args.controller
                    and saved.get("binary", {}).get("sha256") == args.entry_sha256
                    and saved["build"]["dirty"] is False and saved.get("schedule", {}).get("launchFrameOffsetMs") == 0):
                continue
        parser.error(f"Report already exists: {report}")
    with tempfile.TemporaryDirectory(prefix="skimmer-fixture-") as temp:
        asset = Path(temp) / "world.glb"
        if args.batch != "baseline":
            subprocess.run(["node", "tools/topogenesis.js", "fixture", module, str(seed), profile,
                            str(args.revision), str(asset.with_suffix(""))], cwd=producer, check=True)
        elif module == "lattice":
            subprocess.run(["node", "tools/export-exchange.js", "examples/lattice.json", str(asset)],
                           cwd=producer, check=True)
        elif module in {"cruise-deck", "boost-deck"}:
            preset = module.removesuffix("-deck")
            subprocess.run(["node", "tools/generate-contact-study.js", "examples/lattice.json",
                            f"examples/profiles/skimmer-{preset}.json", str(seed), str(asset.with_suffix(""))],
                           cwd=producer, check=True)
        else:
            asset = producer / "examples" / ("contact.glb" if module == "contact-deck" else "district.glb")
        if seed in sealed_assets:
            identity = {"bytes": asset.stat().st_size, "sha256": hashlib.sha256(asset.read_bytes()).hexdigest()}
            if identity != sealed_assets[seed]:
                raise ValueError("Generated GLB differs from its sealed byte count or digest")
        if args.verify_with:
            verified = json.loads(subprocess.check_output(["node", str(args.verify_with.resolve()), str(asset), str(report)]))
            print(report, verified["sha256"], verified["outcome"])
            continue
        input_id = f"lb4-release{tick}-{profile}"
        if approach != "entry":
            input_id += "-" + approach
        case = dict(module=module, seed=seed, profile=profile, ruleRevision=args.revision, inputId=input_id,
                    disposition=disposition, approach=approach, wingmates=wingmates)
        command = [sys.executable, "-B", str(root / "scripts/measure-import-flight.py"), str(asset), str(report),
                   "--url", args.url, "--release-tick", str(tick), "--case", json.dumps(case)]
        if args.browser:
            command.extend(["--browser", args.browser])
        if profile == "boost":
            command.append("--boost")
        subprocess.run(command, check=True)
        result = json.loads(report.read_text())
        if (result["build"]["sourceCommit"] != args.controller or result["build"]["dirty"]
                or result["binary"]["sha256"] != args.entry_sha256):
            raise ValueError("The served source or JavaScript digest differs from the expected controller")
        print(result["experiment"]["inputId"], result["outcome"], result["metrics"]["meetsDisposition"], flush=True)
