"""Re-read both retained foreground routes. Output is descriptive and preserves both original measurements."""
import argparse
import gzip
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import median

fields = ("seed", "calls", "triangles", "renderObjects", "collisionTriangles", "loadedChunks")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stock", type=Path)
parser.add_argument("candidate", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()

def stats(vals):
    data = sorted(vals)
    if not data:
        return {"n": 0}
    return {"n": len(data), "median": median(data), "p10": data[math.ceil(.1*len(data))-1],
            "p90": data[math.ceil(.9*len(data))-1], "aboveOne": sum(x>1 for x in data)}

def collect(directory):
    receipt = json.loads((directory/"result.json").read_bytes())
    blob = (directory/"samples.json.gz").read_bytes()
    assert hashlib.sha256(blob).hexdigest() == receipt["rawSha256"]
    raw = json.loads(gzip.decompress(blob))
    assert len(raw["frameIntervalsMs"]) == receipt["frames"]
    assert abs(1000*receipt["frames"]/sum(raw["frameIntervalsMs"])-receipt["meanFps"]) < 1e-8
    grouped = defaultdict(list)
    for row in raw["samples"]:
        if not row["buffering"] and row["gpuMs"] is not None and row["gpuMs"] > 0:
            grouped[tuple(row[k] for k in fields)].append(row)
    return receipt, grouped

a, ga = collect(args.stock)
b, gb = collect(args.candidate)
shared = sorted(ga.keys() & gb.keys())
assert len(shared) == 293
ratios, repeated, same_pose, pose_delta, same_epoch_pose, raw_diffs = [], [], [], [], [], []
by_seed, self_split = defaultdict(list), {}
groups = []
for key in shared:
    old, new = ga[key], gb[key]
    u, v = [median(p["gpuMs"] for p in rows) for rows in (old, new)]
    ratios.append(v/u)
    raw_diffs.append(v-u)
    by_seed[key[0]].append(v/u)
    if min(len(old), len(new)) >= 2:
        repeated.append(v/u)
    # Within a group select nearest disjoint pairs first (greedy, deterministic). Coordinates
    # are from the one-second snapshot. The GPU timer can refer to an earlier rendered frame.
    edges = sorted((math.dist(tuple(x["position"][d] for d in "xyz"), tuple(y["position"][d] for d in "xyz")), i, j)
                   for i,x in enumerate(old) for j,y in enumerate(new)
                   if x["worldIndex"]==y["worldIndex"] and x["phase"]==y["phase"]=="ASCENT"
                   and x["covered"]==y["covered"]==x["deployed"]==y["deployed"]==3)
    used_old, used_new, local_pairs = set(), set(), []
    for dist, i, j in edges:
        if dist > 5: break
        if i in used_old or j in used_new: continue
        x,y=old[i],new[j]
        used_old.add(i)
        used_new.add(j)
        local_pairs.append(y["gpuMs"]/x["gpuMs"])
        pose_delta.append(dist)
    if local_pairs:
        same_pose.append(median(local_pairs))
        same_epoch_pose.extend(local_pairs)
    groups.append({"key":key,"stockN":len(old),"candidateN":len(new),"stockMedianMs":u,"candidateMedianMs":v,
                   "nearPairs":len(local_pairs),"nearMedianRatio":median(local_pairs) if local_pairs else None})
for label,grouped in [("stock",ga),("candidate",gb)]:
    halves = []
    for k in shared:
        rows = sorted(grouped[k],key=lambda p:p["wallMs"])
        if len(rows)<2: continue
        half=len(rows)//2
        halves.append(median(p["gpuMs"] for p in rows[-half:])/median(p["gpuMs"] for p in rows[:half]))
    self_split[label] = stats(halves)
result = {
    "method":"Equal-weight within-group medians, no independence assumption. Closest disjoint ASCENT pairs within 5 metres, same world index and three covered aircraft. Within-version time splits overlap a single hardware session.",
    "groupFields":fields, "sources":[{"sha":r["sourceCommit"],"rawSha256":r["rawSha256"],"settings":r["settings"],
        "frames":r["frames"],"meanFps":r["meanFps"],"start":r["measuredStartedUtc"],"finish":r["measuredFinishedUtc"]} for r in (a,b)],
    "all":stats(ratios),"deltaMsMedian":median(raw_diffs),"seeds":{k:stats(v) for k,v in by_seed.items()},
    "twoOrMorePerBuild":stats(repeated),"closest5mGroupRatios":stats(same_pose),"closest5mPairs":len(same_epoch_pose),
    "closest5mMedianMetres":median(pose_delta) if pose_delta else None,
    "withinBuildLaterOverEarlier":self_split,"groups":groups,
}
args.output.write_text(json.dumps(result,indent=2,allow_nan=False)+"\n",encoding="utf8")
print(json.dumps({k:v for k,v in result.items() if k not in ("groups","sources")},indent=2))
