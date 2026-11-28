"""Compare verified matrix and shipped-world reports from two hosted production Web runs."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def read(path):
    return json.loads(path.read_bytes())


def reports(directory):
    measurement = read(directory / "measurement.json")
    files = {case["case"]: case["reportSha256"] for case in measurement["cases"] if case["status"] == "measured"}
    files.update({f'shipped/{case["name"]}.json': case["final"]["traceSha256"] for case in measurement["shipped"]})
    return measurement, files


def verified_report(directory, key, digest, run):
    data = (directory / key).read_bytes()
    assert hashlib.sha256(data).hexdigest() == digest, key
    report = json.loads(data)
    assert report["build"]["sourceCommit"] == run["source"] and report["build"]["dirty"] is False, key
    assert report["binary"] == run["entry"] and report["metrics"]["completed"], key
    return report


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous", type=Path)
parser.add_argument("candidate", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
before, old_reports = reports(args.previous)
after, new_reports = reports(args.candidate)
assert set(new_reports) <= set(old_reports), "The candidate contains an unexpected case"
frozen = ("format", "sha256", "world", "experiment", "schedule", "browser", "fixedHz", "sampleMs",
          "boost", "input", "releaseTick", "imported", "replayed")
cases = []
for key, old_hash in old_reports.items():
    if key not in new_reports:
        cases.append({"case": key, "status": "unmeasured"})
        continue
    old = verified_report(args.previous, key, old_hash, before)
    new = verified_report(args.candidate, key, new_reports[key], after)
    for field in frozen:
        if old[field] != new[field]:
            raise ValueError(f"Changed input or runtime protocol at {key}: {field}")
    paired = list(zip(old["trace"], new["trace"], strict=True))
    if any(a["time"] != b["time"] for a, b in paired):
        raise ValueError(f"Different simulation clocks at {key}")
    first_change = next(({"index": i, "timeSeconds": a["time"],
                          "fields": sorted(k for k in a.keys() | b.keys() if a.get(k) != b.get(k))}
                         for i, (a, b) in enumerate(paired) if a != b), None)
    max_position_delta = max(math.dist([a["position"][k] for k in "xyz"], [b["position"][k] for k in "xyz"])
                             for a, b in paired)
    cases.append({"case": key, "status": "measured", "samples": len(paired), "worldSha256": new["sha256"],
                  "previousReportSha256": old_hash, "candidateReportSha256": new_reports[key],
                  "previousOutcome": old["outcome"], "candidateOutcome": new["outcome"],
                  "identicalTrace": first_change is None, "identicalMetrics": old["metrics"] == new["metrics"],
                  "maxPositionDeltaM": max_position_delta, "firstDifferentSample": first_change})

summary = {"previous": {key: before[key] for key in ("source", "entry", "run")},
           "candidate": {key: after[key] for key in ("source", "entry", "run")},
           "expected": len(old_reports), "measured": len(new_reports),
           "identicalTraces": sum(row.get("identicalTrace", False) for row in cases),
           "identicalMetrics": sum(row.get("identicalMetrics", False) for row in cases),
           "cases": cases}
with args.output.open("xb") as out:
    out.write((json.dumps(summary, indent=2) + "\n").encode("utf-8"))
print(f'{summary["measured"]}/{summary["expected"]} synchronized flights, {summary["identicalTraces"]} identical traces.')
