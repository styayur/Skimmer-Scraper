"""Describe the retained frame and resource samples without changing the release comparison."""
import argparse
import gzip
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import median

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stock", type=Path)
parser.add_argument("candidate", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()


def summarize(values):
    data = sorted(values)
    if not data:
        return None
    return {"count": len(data), "median": median(data), "p95": data[math.ceil(len(data) * .95) - 1]}


def describe(directory):
    result = json.loads((directory / "result.json").read_bytes())
    compressed = (directory / "samples.json.gz").read_bytes()
    if hashlib.sha256(compressed).hexdigest() != result["rawSha256"]:
        raise ValueError(f"Raw digest differs in {directory}")
    raw = json.loads(gzip.decompress(compressed))
    frames = raw["frameIntervalsMs"]
    samples = raw["samples"]
    if len(frames) != result["frames"] or abs(1000 * len(frames) / sum(frames) - result["meanFps"]) > 1e-8:
        raise ValueError(f"Frame duration witness differs in {directory}")
    bins = defaultdict(list)
    elapsed = 0
    for interval in frames:
        elapsed += interval
        bins[int(elapsed // 120000)].append(interval)
    thread = result["rendererThreadCpu"]
    per_frame = {key: 1000 * seconds / len(frames) for key, seconds in thread.get("seconds", {}).items()}
    metrics = {key: summarize([p[key] for p in samples if p.get(key) is not None])
               for key in ("gpuMs", "calls", "triangles", "loadedChunks", "heap", "residentGeometry")}
    matching = defaultdict(list)
    for point in samples:
        if point.get("gpuMs") is not None and not point["buffering"]:
            key = (point["seed"], point["calls"], point["triangles"], point["renderObjects"],
                   point["collisionTriangles"], point["loadedChunks"])
            matching[key].append(point["gpuMs"])
    by_seed = {}
    for seed in sorted({point["seed"] for point in samples}):
        values = [point for point in samples if point["seed"] == seed]
        by_seed[str(seed)] = {key: summarize([p[key] for p in values if p.get(key) is not None])
                              for key in ("gpuMs", "calls", "triangles")}
    receipt = {"source": result["sourceCommit"], "rawSha256": result["rawSha256"],
               "measuredStart": result["measuredStartedUtc"], "measuredFinish": result["measuredFinishedUtc"],
               "meanFps": result["meanFps"], "frames": len(frames), "p95Ms": result["frameMs"]["p95"],
               "focus": result["focus"]["lost"], "idleHostCpu": result["idleCpu"], "runningHostCpu": result["measuredCpu"],
               "intervalFractions": {"under12ms": sum(v < 12 for v in frames)/len(frames),
                                     "12to20ms": sum(12 <= v < 20 for v in frames)/len(frames),
                                     "20msOrLonger": sum(v >= 20 for v in frames)/len(frames)},
               "observedRendererThreadMsPerDeliveredFrame": per_frame, "oneSecondSamples": metrics,
               "perSeed": by_seed, "wallClockSegments": [
                   {"startSeconds": 120 * index, "sampledSeconds": sum(chunk) / 1000,
                    "meanFps": 1000 * len(chunk) / sum(chunk)}
                   for index, chunk in sorted(bins.items())]}
    return receipt, matching


stock, stock_samples = describe(args.stock)
candidate, candidate_samples = describe(args.candidate)
pairs = sorted(set(stock_samples) & set(candidate_samples))
ratios = [median(candidate_samples[key]) / median(stock_samples[key]) for key in pairs if median(stock_samples[key]) > 0]
analysis = {"definition": "Descriptive only. Match nonbuffering snapshots by seed, draw calls, rendered triangle count, render objects, collision triangles and resident chunk count. GPU values are renderer timer samples, and each matched group receives equal weight. Driver clocks, power and temperature were not recorded. These measurements do not establish a cause.",
            "stock": stock, "candidate": candidate, "matchedGpuTiming": {
                "groups": len(pairs), "stockObservations": sum(len(stock_samples[key]) for key in pairs),
                "candidateObservations": sum(len(candidate_samples[key]) for key in pairs),
                "candidateToStockRatioOfWithinGroupMedians": summarize(ratios)}}
with args.output.open("x", encoding="utf-8") as dest:
    json.dump(analysis, dest, indent=2, allow_nan=False)
    dest.write("\n")
