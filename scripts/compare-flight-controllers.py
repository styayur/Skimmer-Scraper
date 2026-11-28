"""Compare fixed inputs and observed gates on two identified Skimmer controllers."""
import argparse
import hashlib
import json
from pathlib import Path

from flight_bench_cases import read_sealed_holdout
from flight_bench_metrics import summarize


def load(path):
    return json.loads(path.read_bytes())


def observation(report):
    outcome, metrics = summarize(report)
    if outcome != report["outcome"] or metrics != report["metrics"] or not metrics["completed"]:
        raise ValueError("Recorded outcome does not reproduce from a completed flight")
    trace = report["trace"]
    observations = {
        "outcome": outcome, "met": metrics["meetsDisposition"], "captured": metrics["captured"],
        "activeRelease": metrics["activeRelease"], "preReleasePhase": trace[report["releaseTick"]]["phase"],
        "endPhase": trace[-1]["phase"], "sampledGlideM": round(metrics["sampledGlideM"], 3),
        "minimumSolidM": metrics["minimumSampledSolidDistanceM"], "hullIntrusion": metrics["sampledHullIntrusion"],
        "impactTimesS": [round(b["time"], 4) for a, b in zip(trace, trace[1:]) if b["impacts"] > a["impacts"]],
    }
    if not observations["met"]:
        observations["phaseChanges"] = [
            [round(row["time"], 4), row["phase"]] for i, row in enumerate(trace)
            if i == 0 or row["phase"] != trace[i - 1]["phase"]
        ]
    return observations


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("candidate", type=Path, help="Directory with runtime.json and the two completed batches")
parser.add_argument("--stock", type=Path, help="Stock evidence directory containing matrix.json")
parser.add_argument("--sealed-cases", type=Path, help="Compare only the independently committed second holdout")
args = parser.parse_args()
stock_dir = args.stock or args.candidate.parent
matrix = load(stock_dir / "matrix.json")
runtime = load(args.candidate / "runtime.json")
if runtime["producerRevision"] != 2 or runtime["producerCommit"] != matrix["producerRevisions"][2]:
    raise ValueError("Expected the frozen revision-2 generator")
hash_list = (args.candidate / "SHA256SUMS").read_text(encoding="utf-8")
files = {name: digest for digest, name in (line.split("  ", 1) for line in hash_list.splitlines())}
entry_name = runtime["entry"]["url"].lstrip("/")
if (hashlib.sha256(hash_list.encode()).hexdigest() != runtime["sha256sums"] or len(files) != runtime["files"]
        or files.get(entry_name) != runtime["entry"]["sha256"]):
    raise ValueError("The distribution manifest and runtime identity disagree")

cases = []
by_split, by_class = {}, {}
shared = ("world", "experiment", "imported", "replayed", "schedule", "boost", "input", "browser",
          "fixedHz", "sampleMs", "releaseTick")
groups = {split: (matrix[split], stock_dir / split) for split in ("development", "holdout")}
if args.sealed_cases:
    rows = read_sealed_holdout(args.sealed_cases, stock_dir / "second-holdout-commitment.json", matrix)
    groups = {"second-holdout": (rows, args.candidate / "second-holdout-stock")}
for split, (rows, stock_group) in groups.items():
    for module, seed, profile, tick, disposition, approach, wingmates in rows:
        path = Path(split, f"{module}-{seed}-{profile}.json")
        stock, candidate = load(stock_group / path.name), load(args.candidate / path)
        if any(stock[key] != candidate[key] for key in shared):
            raise ValueError(f"World, saved replay, or controlled input differs at {path}")
        case = stock["experiment"]
        if ([case[key] for key in ("module", "seed", "profile", "disposition", "approach", "wingmates", "ruleRevision")]
                != [module, seed, profile, disposition, approach, wingmates, 2]
                or stock["releaseTick"] != tick or stock["fixedHz"] != 120 or stock["sampleMs"] != matrix["sampleMs"]
                or stock["schedule"]["launchFrameOffsetMs"] != 0):
            raise ValueError(f"Inputs differ from the frozen matrix at {path}")
        for report, commit, digest in [(stock, matrix["controller"], matrix["entrySha256"]),
                                       (candidate, runtime["controller"], runtime["entry"]["sha256"])]:
            if (report["format"] != "flight-diagnostic-2" or report["build"]["dirty"]
                    or report["build"]["sourceCommit"] != commit or report["binary"]["sha256"] != digest
                    or report["sha256"] != report["world"]["sha256"]
                    or len(report["trace"]) != tick + matrix["postReleaseTicks"] + 1):
                raise ValueError(f"Unidentified runtime, world or frame count at {path}")
        if candidate["binary"] != runtime["entry"]:
            raise ValueError(f"The candidate entry bytes or URL differ at {path}")
        if [row["time"] for row in stock["trace"]] != [row["time"] for row in candidate["trace"]]:
            raise ValueError(f"Observed simulation times differ at {path}")
        old, new = observation(stock), observation(candidate)
        for counts in (by_split.setdefault(split, {}), by_class.setdefault(disposition, {})):
            counts["runs"] = counts.get("runs", 0) + 1
            counts["stockMet"] = counts.get("stockMet", 0) + int(old["met"])
            counts["candidateMet"] = counts.get("candidateMet", 0) + int(new["met"])
        cases.append({
            "case": path.as_posix(), "inputId": case["inputId"], "disposition": disposition,
            "sha256": stock["sha256"], "identicalTrace": stock["trace"] == candidate["trace"],
            "stock": old, "candidate": new,
        })
print(json.dumps({"stock": {"controller": matrix["controller"], "entrySha256": matrix["entrySha256"]},
                  "candidate": runtime, "bySplit": by_split, "byClass": by_class, "cases": cases}, indent=2))
