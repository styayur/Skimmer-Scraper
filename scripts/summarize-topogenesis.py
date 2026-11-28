"""Recalculate every frozen class and compare byte-identical control replays."""
import argparse
import json
from pathlib import Path

from flight_bench_metrics import summarize

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("evidence", type=Path)
args = parser.parse_args()
matrix = json.loads((args.evidence / "matrix.json").read_bytes())
paired = matrix["pairedProbes"] + [row for row in matrix["development"] if row[1] in matrix["pairedSeeds"]]
expected = {"baseline": ([row + ["entry", 3] for row in matrix["baselines"]], 0),
            **{f"aligned-r{rev}": (paired, rev) for rev in range(3)},
            "development": (matrix["development"], 2), "holdout": (matrix["holdout"], 2)}
seeds = [row[1] for row in matrix["development"] + matrix["holdout"]]
if len(set(seeds)) != len(seeds) or len(seeds) < 20:
    raise ValueError("The frozen seed split is invalid")


def summarize_group(reports):
    rows = [d["metrics"] for d in reports]
    by_class = {}
    failures = []
    windows = 0
    heaps = []
    for d in reports:
        e, m = d["experiment"], d["metrics"]
        counts = by_class.setdefault(e["disposition"], {"met": 0, "runs": 0})
        counts["runs"] += 1
        counts["met"] += int(m["meetsDisposition"])
        if not m["meetsDisposition"]:
            failures.append({"module": e["module"], "seed": e["seed"], "profile": e["profile"], "outcome": d["outcome"]})
        previous = False
        for row in d["trace"]:
            near = row["clearance"] is not None and 3.3 <= row["clearance"] <= 11
            windows += int(near and not previous)
            previous = near
        heap = d["resources"].get("v8HeapBytes")
        if heap:
            heaps.append(heap["afterFlight"]["usedSize"])
    travel = sum(m["flightDistanceM"] for m in rows)
    pulse_count = sum(d["schedule"]["releasePulse"] for d in reports)
    def rate(count, total):
        return {"count": count, "of": total, "percent": round(100 * count / total, 2) if total else None}
    return {"runs": len(rows), "classes": by_class, "failures": failures,
            "captureRate": rate(sum(m["captured"] for m in rows), len(rows)),
            "continuousPassRate": rate(sum(m["continuousPass"] for m in rows), pulse_count),
            "activeReleaseRate": rate(sum(m["activeRelease"] for m in rows), pulse_count),
            "cleanReleaseRate": rate(sum(d["outcome"] == "glide-and-release" for d in reports), pulse_count),
            "safeRejections": sum(m["safeRejection"] for m in rows), "safeExits": sum(m["safeExit"] for m in rows),
            "shieldImpacts": sum(m["shieldImpacts"] for m in rows),
            "sampledHullIntrusions": sum(m["sampledHullIntrusion"] for m in rows),
            "minimumSampledSolidDistanceM": min((m["minimumSampledSolidDistanceM"] for m in rows
                                                 if m["minimumSampledSolidDistanceM"] is not None), default=None),
            "longestSampledGlideM": max(m["longestSampledGlideM"] for m in rows),
            "contactLossesBeforeRelease": sum(m["contactLossesBeforeRelease"] for m in rows),
            "peakSampledAccelerationMps2": max(m["peakSampledAccelerationMps2"] for m in rows),
            "nearSurfaceWindowsPerKm": round(1000 * windows / travel, 4),
            "maxCollisionBVHsAtEnd": max(d["resources"]["adapter"]["bvhCount"] for d in reports),
            "maxCollisionTriangles": max(d["imported"]["collisionTriangles"] for d in reports),
            "v8EndHeap": {"runsMeasured": len(heaps), "minUsedBytes": min(heaps, default=None),
                          "maxUsedBytes": max(heaps, default=None)}}


controls = {}
mismatches = []
comparisons = 0
groups = {}
for group, (cases, revision) in expected.items():
    reports = []
    for module, seed, profile, tick, disposition, approach, wingmates in cases:
        path = Path(group, f"{module}-{seed}-{profile}.json")
        d = json.loads((args.evidence / path).read_bytes())
        e = d["experiment"]
        outcome, metrics = summarize(d)
        if (d["format"] != "flight-diagnostic-2" or d["build"]["dirty"] or d["build"]["sourceCommit"] != matrix["controller"]
                or d["binary"]["sha256"] != matrix["entrySha256"] or d["replayed"] != d["imported"]
                or d["sha256"] != d["world"]["sha256"] or d["releaseTick"] != tick or d["fixedHz"] != 120
                or d["sampleMs"] != matrix["sampleMs"] or len(d["trace"]) != tick + matrix["postReleaseTicks"] + 1
                or not metrics["completed"] or metrics != d["metrics"] or outcome != d["outcome"]
                or [e[k] for k in ("module", "seed", "profile", "disposition", "approach", "wingmates", "ruleRevision")]
                != [module, seed, profile, disposition, approach, wingmates, revision]):
            raise ValueError(f"Unexpected case or inconsistent measurement in {path}")
        if group != "baseline":
            if d["schedule"].get("launchFrameOffsetMs") != 0:
                raise ValueError(f"Unaligned input clock in {path}")
            key = (d["sha256"], seed, e["inputId"], wingmates, d["world"]["layoutSeed"])
            if key in controls:
                comparisons += 1
                if controls[key][1] != d["trace"]:
                    mismatches.append([controls[key][0], path.as_posix()])
            else:
                controls[key] = (path.as_posix(), d["trace"])
        reports.append(d)
    groups[group] = summarize_group(reports)
print(json.dumps({"controller": matrix["controller"], "binarySha256": matrix["entrySha256"], "groups": groups,
                  "identicalControlComparisons": comparisons, "differentControlTraces": mismatches}, indent=2))
