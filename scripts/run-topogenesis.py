"""Replay one frozen batch on an independently served, identified game build."""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
matrix = json.loads((root / "acceptance/joint-flight/topogenesis/matrix.json").read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("batch", choices=["baseline", "paired", "development", "holdout"])
parser.add_argument("producer", type=Path, help="Independent V2Wpro checkout with its dependencies installed")
parser.add_argument("output", type=Path, help="New directory, or an existing directory without the selected reports")
parser.add_argument("--revision", type=int, choices=[0, 1, 2], default=0)
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--browser")
parser.add_argument("--only", help="Filter by module or decimal seed")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
producer = args.producer.resolve()
if args.batch == "baseline":
    rows = [row + ["entry", 3] for row in matrix["baselines"]]
elif args.batch == "paired":
    rows = matrix["pairedProbes"] + [row for row in matrix["development"] if row[1] in matrix["pairedSeeds"]]
else:
    rows = matrix[args.batch]
if args.only:
    rows = [row for row in rows if args.only in [row[0], str(row[1])]]
if not rows:
    parser.error("No matching case")
for module, seed, profile, tick, disposition, approach, wingmates in rows:
    report = args.output / f"{module}-{seed}-{profile}.json"
    if report.exists():
        parser.error(f"Report already exists: {report}")
    with tempfile.TemporaryDirectory(prefix="skimmer-fixture-") as temp:
        asset = Path(temp) / "world.glb"
        if args.batch != "baseline":
            subprocess.run(["node", "tools/topogenesis.js", "fixture", module, str(seed), profile,
                            str(args.revision), str(asset.with_suffix(""))], cwd=producer, check=True)
        elif module == "lattice":
            subprocess.run(["node", "tools/export-exchange.js", "examples/lattice.json", str(asset)],
                           cwd=producer, check=True)
        else:
            asset = producer / "examples" / ("contact.glb" if module == "contact-deck" else "district.glb")
        input_id = f"lb4-release{tick}-{profile}"
        if approach != "entry":
            input_id += "-" + approach
        case = dict(module=module, seed=seed, profile=profile, ruleRevision=args.revision, inputId=input_id,
                    disposition=disposition, approach=approach, wingmates=wingmates)
        command = [sys.executable, str(root / "scripts/measure-import-flight.py"), str(asset), str(report),
                   "--url", args.url, "--release-tick", str(tick), "--case", json.dumps(case)]
        if args.browser:
            command.extend(["--browser", args.browser])
        if profile == "boost":
            command.append("--boost")
        subprocess.run(command, check=True)
        result = json.loads(report.read_text())
        if result["build"]["sourceCommit"] != matrix["controller"] or result["build"]["dirty"]:
            raise ValueError("The served build differs from the frozen benchmark controller")
        print(result["experiment"]["inputId"], result["outcome"], result["metrics"]["meetsDisposition"], flush=True)
