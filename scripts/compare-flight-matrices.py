"""Compare two complete realm-quality-matrix runs by scenario, in execution order."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("baseline", type=Path)
parser.add_argument("candidate", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
old, new = [json.loads(p.read_bytes()) for p in (args.baseline, args.candidate)]

def signature(row):
    return {k: row.get(k) for k in ("theme", "quality", "count", "voice", "music", "glide", "canvas")}

if old["seed"] != new["seed"] or any(old["device"][k] != new["device"][k] for k in ("native", "renderer")):
    raise SystemExit("The seed, runtime or GPU differs")
if [signature(r) for r in old["rows"]] != [signature(r) for r in new["rows"]] or not old["rows"]:
    raise SystemExit("The two scenario lists differ or are empty")

rows = []
for before, after in zip(old["rows"], new["rows"]):
    fps = after["averageFps"] / before["averageFps"] - 1
    p95 = after["p95Ms"] / before["p95Ms"] - 1
    rows.append(dict(scenario=signature(before), fpsChangePercent=100*fps,
                     p95ChangePercent=100*p95, withinTarget=fps >= -.05 and p95 <= .10,
                     baseline={k: before[k] for k in ("averageFps","p95Ms","p99Ms","worstMs")},
                     candidate={k: after[k] for k in ("averageFps","p95Ms","p99Ms","worstMs")}))
report = dict(baseline=old["device"], candidate=new["device"], seed=new["seed"],
              outsideTarget=sum(not r["withinTarget"] for r in rows), rows=rows)
args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"{len(rows)} paired scenarios, {report['outsideTarget']} outside the initial performance targets.")
