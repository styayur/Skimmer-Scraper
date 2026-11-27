"""Compare original flight matrices, optionally including a fixed paired rerun campaign.

Example: python scripts/compare-flight-matrices.py baseline.json candidate.json summary.json --reruns rerun-directory
Rows use zero-based indices from the full original matrix. Median paired deltas include the original measurement.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import median

METRICS = ("averageFps", "p95Ms", "p99Ms", "worstMs")
CONFIG = ("theme", "quality", "count", "voice", "music", "glide")
SIDES = ("baseline", "candidate")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def signature(row):
    return {key: row.get(key) for key in (*CONFIG, "canvas")}


def metrics(row):
    values = {key: row[key] for key in METRICS}
    require(all(math.isfinite(v) and v > 0 for v in values.values()), "Invalid frame metric")
    return values


def within_target(fps, p95):
    return fps >= -5 - 1e-10 and p95 <= 10 + 1e-10


def compare(before, after):
    a, b = metrics(before), metrics(after)
    fps = 100 * (b["averageFps"] / a["averageFps"] - 1)
    p95 = 100 * (b["p95Ms"] / a["p95Ms"] - 1)
    return dict(baseline=a, candidate=b, fpsChangePercent=fps, p95ChangePercent=p95, withinTarget=within_target(fps, p95))


def load(path, sources):
    data = path.read_bytes()
    sources.append(dict(path=str(path.resolve()), sha256=hashlib.sha256(data).hexdigest()))
    return json.loads(data)


def profile(document):
    return document.get("run", {}).get("profile", any(row.get("cpuAtStart") is not None for row in document["rows"]))


def runtime(doc):
    return tuple(doc["device"][key] for key in ("native", "renderer"))


def summarize(originals, directory=None):
    sources = []
    old, new = (load(p, sources) for p in originals)
    require(old["seed"] == new["seed"] and runtime(old) == runtime(new), "The seed, runtime or GPU differs")
    require(old["method"] == new["method"] and profile(old) == profile(new), "The sampling or profiling method differs")
    require(old["rows"] and [signature(r) for r in old["rows"]] == [signature(r) for r in new["rows"]], "Original scenario lists differ or are empty")
    size = len(old["rows"])
    for doc in (old, new):
        require(doc.get("run", {}).get("status", "passed") == "passed", "Original run did not pass")
        for index, row in enumerate(doc["rows"]):
            require(row.get("scenarioIndex", index) == index and row.get("status", "passed") == "passed", "Original rows are incomplete or out of order")
    rows = [dict(scenarioIndex=i, scenario=signature(a), **compare(a, b)) for i, (a, b) in enumerate(zip(old["rows"], new["rows"]))]
    initial = sum(not r["withinTarget"] for r in rows)
    report = dict(baseline=old["device"], candidate=new["device"], seed=new["seed"], method=new["method"],
                  outsideTarget=initial, rows=rows, sources=sources)
    if directory is None:
        return report

    campaign = load(directory / "paired-reruns.json", sources)
    indices = campaign["indices"]
    require(campaign["schema"] == 1 and indices and indices == sorted(set(indices)) and
            all(type(i) is int and 0 <= i < size for i in indices), "Invalid campaign indices")
    require(size == campaign["catalogSize"] and campaign["seed"] == new["seed"] and
            campaign["method"] == new["method"] and campaign["profile"] == profile(new), "Campaign differs from the original catalog or method")
    require(campaign["scenarios"] == [dict(scenarioIndex=i, **{k: old["rows"][i][k] for k in CONFIG if k in old["rows"][i]}) for i in indices],
            "Campaign scenario configuration differs from the original")
    require(type(campaign["pairs"]) is int and campaign["pairs"] > 0, "Invalid pair count")
    order = [(p, side) for p in range(1, campaign["pairs"] + 1) for side in (SIDES if p % 2 else reversed(SIDES))]
    require(order == [(a["pair"], a["side"]) for a in campaign["attempts"]], "Campaign is missing or reordering scheduled attempts")
    by_attempt = {}
    complete = True
    run_ids = set()
    user_agent = None
    for attempt in campaign["attempts"]:
        pair, side = attempt["pair"], attempt["side"]
        original = old if side == "baseline" else new
        file = f"pair-{pair}-{side}.json"
        require(file == attempt["file"], "Unexpected campaign filename")
        path = directory / file
        passed = attempt["status"] == "passed"
        if not path.exists():
            require(not passed, f"Missing successful attempt file {file}")
            complete = False
            continue
        doc = load(path, sources)
        if not passed and not doc.get("run"):
            complete = False
            continue
        run = doc["run"]
        require((run["pair"], run["side"], run["indices"], run["catalogSize"], run["runnerSha256"]) ==
                (pair, side, indices, size, campaign["runnerSha256"]), f"Wrong run identity in {file}")
        require(run["requestedUrl"] == campaign["urls"][side] and run["viewport"] == [1920, 1080] and
                run["deviceScaleFactor"] == 1 and run["sampling"] == campaign["sampling"], f"URL, viewport or sampling differs in {file}")
        require(run["id"] not in run_ids, "Repeated measurement ID")
        run_ids.add(run["id"])
        require(doc["seed"] == original["seed"] and runtime(doc) == runtime(original) and
                doc["method"] == original["method"] and profile(doc) == campaign["profile"], f"Device or method mismatch in {file}")
        build = doc["device"]["build"]
        require(build["dirty"] is False and all(build[k] == original["device"]["build"][k] for k in ("version", "sourceCommit")),
                f"Wrong build for {side} in {file}")
        agent = doc["device"]["userAgent"]
        require(agent and (user_agent is None or agent == user_agent), f"Browser version differs in {file}")
        user_agent = agent
        if original["device"].get("userAgent"):
            require(agent == original["device"]["userAgent"], f"Browser version differs from original in {file}")
        row_indices = [r["scenarioIndex"] for r in doc["rows"]]
        require(row_indices == indices[:len(row_indices)], f"Unexpected row order in {file}")
        if passed:
            require(run["status"] == "passed" and row_indices == indices and all(r["status"] == "passed" for r in doc["rows"]),
                    f"Incomplete successful run in {file}")
        complete &= passed
        for row in doc["rows"]:
            index = row["scenarioIndex"]
            initial_row = original["rows"][index]
            require(all(row.get(k) == initial_row.get(k) for k in CONFIG), f"Scenario mismatch in {file} row {index}")
            if row["status"] == "passed":
                require(row["canvas"] == initial_row["canvas"], f"Canvas mismatch in {file} row {index}")
                metrics(row)
            by_attempt[pair, side, index] = row

    for index, row in enumerate(rows):
        initial_pair = {k: row[k] for k in ("baseline", "candidate", "fpsChangePercent", "p95ChangePercent", "withinTarget")}
        row["original"] = initial_pair
        attempts = [dict(pair=0, status="original", **initial_pair)]
        if index in indices:
            for pair in range(1, campaign["pairs"] + 1):
                a, b = (by_attempt.get((pair, side, index)) for side in SIDES)
                if all(r and r["status"] == "passed" for r in (a, b)):
                    attempts.append(dict(pair=pair, status="measured", **compare(a, b)))
                else:
                    attempts.append(dict(pair=pair, status="incomplete", baseline=a, candidate=b))
        measured = [a for a in attempts if a["status"] != "incomplete"]
        fps = median(a["fpsChangePercent"] for a in measured)
        p95 = median(a["p95ChangePercent"] for a in measured)
        row["attempts"] = attempts
        row["median"] = dict(fpsChangePercent=fps, p95ChangePercent=p95,
                             withinTarget=within_target(fps, p95) if len(measured) == len(attempts) else None,
                             **{side: {k: median(a[side][k] for a in measured) for k in METRICS} for side in SIDES})
        row.update(row["median"])
    report.update(campaign=campaign, complete=complete, originalOutsideTarget=initial,
                  aggregation="Per-scenario median of paired percentage changes, including the original as pair 0. Thresholds: FPS >= -5%, p95 <= +10%.",
                  outsideTarget=sum(r["median"]["withinTarget"] is False for r in rows) if complete else None)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reruns", type=Path, help="Directory containing paired-reruns.json and all recorded attempts")
    args = parser.parse_args()
    try:
        result = summarize([args.baseline, args.candidate], args.reruns)
        require(all(Path(s["path"]) != args.output.resolve() for s in result["sources"]), "Output aliases input evidence")
        with args.output.open("x" if args.reruns else "w", encoding="utf-8") as out:
            json.dump(result, out, indent=2, ensure_ascii=False, allow_nan=False)
            out.write("\n")
    except (ValueError, KeyError, OSError) as error:
        parser.exit(2, f"{error}\n")
    if not result.get("complete", True):
        parser.exit(2, "Incomplete campaign. Saved the attempts and provisional medians.\n")
    print(f"{len(result['rows'])} paired scenarios, {result['outsideTarget']} outside target.")
