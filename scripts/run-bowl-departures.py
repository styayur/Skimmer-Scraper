"""Replay the frozen longitudinal-relief comparison using an independent producer and a stock game."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

parser = argparse.ArgumentParser()
parser.add_argument("producer", type=Path, help="V2Wpro checkout with installed dependencies")
parser.add_argument("game", help="HTTP origin of the unmodified v0.10.0 game")
parser.add_argument("output", type=Path, help="New directory for raw reports")
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
plan = json.loads((repo/"acceptance/joint-flight/topogenesis/bowl-relief/plan.json").read_bytes())
args.output.mkdir(parents=True, exist_ok=False)
producer = args.producer.resolve()
if subprocess.check_output(["git","-C",str(producer),"rev-parse","HEAD"],text=True).strip() != plan["baselineProducer"]:
    raise ValueError("Check out the producer revision recorded in plan.json")
for seed in [plan["development"], *plan["unseen"]]:
    with TemporaryDirectory() as directory:
        prefix = Path(directory)/"base"
        subprocess.run(["node","tools/topogenesis.js","fixture","bowl",str(seed),"cruise","2",str(prefix)],
                       cwd=producer,check=True)
        world = json.loads(prefix.with_suffix(".json").read_bytes())
        for relief in [plan["baselineRelief"],plan["candidateRelief"]]:
            name = f"{seed}-{relief}"
            world["extensions"]["kineticRecipe"]["relief"] = relief
            asset = Path(directory)/(name+".glb")
            recipe = asset.with_suffix(".json")
            recipe.write_text(json.dumps(world),encoding="utf-8")
            subprocess.run(["node","tools/export-exchange.js",str(recipe),str(asset)],cwd=producer,check=True)
            case = {"module":"bowl","seed":seed,"profile":"cruise","ruleRevision":2,
                    "inputId":"lb4-release48-cruise","disposition":"may-reject","approach":"entry",
                    "wingmates":3,"authoredRelief":relief}
            report = args.output/(name+".report.json")
            subprocess.run([sys.executable,"-B",str(repo/"scripts/measure-import-flight.py"),str(asset),
                str(report),"--url",args.game,"--release-tick","48","--case",json.dumps(case)],check=True)
            d = json.loads(report.read_bytes())
            if (d["sha256"] != hashlib.sha256(asset.read_bytes()).hexdigest() or
                d["build"]["sourceCommit"] != plan["controller"] or d["build"]["dirty"] or
                d["binary"]["sha256"] != plan["gameEntry"] or d["schedule"]["launchFrameOffsetMs"] != 0):
                raise ValueError("Run or source identity mismatch for "+name)
