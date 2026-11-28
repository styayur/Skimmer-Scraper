"""Replay one bounded subset against the staged Web distribution with the original diagnostics."""
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from threading import Thread
import zipfile

HERE = Path(__file__).resolve().parent
BENCH = Path("benchmark/acceptance/joint-flight/topogenesis")
OUT = Path("output")
read = lambda path: json.loads(path.read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.now(timezone.utc).isoformat()
target = read(HERE / "target.json")
inputs = read(HERE / "inputs.json")
runtime = read(OUT / "runtime.json")
sys.path.insert(0, str(Path("benchmark/scripts").resolve()))
from flight_bench_metrics import summarize

shard = int(sys.argv[1])
rows = inputs["cases"]
if "only" in target:
    chosen = set(target["only"])
    rows = [r for r in rows if r["group"]+"/"+r["name"] in chosen]
    assert len(rows) == len(chosen)
rows = sorted(rows,key=lambda r:(r["group"]=="legacy",r["experiment"]["disposition"]!="must-succeed"))
rows = rows[shard::target["shards"]]
assert sha((HERE/"inputs.zip").read_bytes()) == inputs["inputZipSha256"]
for directory, expected in [("benchmark",inputs["harness"]),("producer",inputs["generator"]),("reader",inputs["reader"])]:
    assert subprocess.check_output(["git","rev-parse","HEAD"],cwd=directory,text=True).strip()==expected
index = {"runId":os.environ["GITHUB_RUN_ID"],"runAttempt":os.environ["GITHUB_RUN_ATTEMPT"],"shard":shard,
         "harness":inputs["harness"],"reader":inputs["reader"],"python":platform.python_version(),
         "system":platform.platform(),"rendererFlags":["--use-angle=swiftshader","--enable-unsafe-swiftshader"],
         "beganUtc":now(),"selected":[r["group"]+"/"+r["name"] for r in rows],"cases":[]}
def checkpoint():
    (OUT/f"shard-{shard}.json").write_text(json.dumps(index,indent=2)+"\n")

class LocalHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def observe(row, report, glb):
    references = row["history"]
    prior = read(BENCH/references["integrated-946d2f7e"]["report"])
    for key in ("world","experiment","imported","replayed","schedule","boost","input","browser","fixedHz","sampleMs","releaseTick"):
        if report[key] != prior[key]:
            raise ValueError(f"Frozen field {key} differs")
    assert report["world"]==row["world"] and report["experiment"]==row["experiment"] and report["schedule"]==row["schedule"]
    assert report["build"]["sourceCommit"]==target["source"] and report["build"]["dirty"] is False
    assert report["binary"]==runtime["entry"] and report["sha256"]==sha(glb.read_bytes())
    assert [r["time"] for r in report["trace"]] == [r["time"] for r in prior["trace"]]
    outcome, metrics = summarize(report)
    assert outcome == report["outcome"] and metrics == report["metrics"] and metrics["completed"]
    reference = read(BENCH/references["stock"]["report"]) if target["kind"]=="stock-calibration" else prior
    assert [r["time"] for r in reference["trace"]]==[r["time"] for r in report["trace"]]
    if target["kind"]=="stock-calibration":
        assert report["outcome"]==reference["outcome"] and metrics["meetsDisposition"]==reference["metrics"]["meetsDisposition"]
    divergence = max(math.dist([a["position"][i] for i in "xyz"],[b["position"][i] for i in "xyz"])
                     for a,b in zip(report["trace"],reference["trace"],strict=True))
    return {"outcome":outcome,"met":metrics["meetsDisposition"],"shieldImpacts":metrics["shieldImpacts"],
            "activeRelease":metrics["activeRelease"],"sampledHullIntrusion":metrics["sampledHullIntrusion"],
            "captureLosses":metrics["contactLossesBeforeRelease"],"releasePhase":report["trace"][report["releaseTick"]]["phase"],
            "sampleCount":len(report["trace"]),"longestGlideM":metrics["longestSampledGlideM"],
            "minimumSolidM":metrics["minimumSampledSolidDistanceM"],"comparisonSource":reference["build"]["sourceCommit"],
            "identicalTrace":report["trace"]==reference["trace"],"maximumPositionDifferenceM":divergence}

checkpoint()
retry_count = 0
with zipfile.ZipFile(HERE/"inputs.zip") as archived, ThreadingHTTPServer(
        ("127.0.0.1",0),partial(LocalHandler,directory="staging/served")) as server:
    Thread(target=server.serve_forever,daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    for row in rows:
        group, name = row["group"], row["name"]
        item = {"group":group,"name":name,"attempts":[]}
        index["cases"].append(item)
        checkpoint()
        asset = archived.read("glb/"+row["world"]["sha256"]+".glb")
        assert sha(asset)==row["world"]["sha256"] and len(asset)==row["world"]["bytes"]
        glb = Path("staging")/(Path(name).stem+".glb")
        glb.write_bytes(asset)
        for attempt in [1,2]:
            dest = OUT/"attempts"/group/Path(name).stem/str(attempt)
            dest.mkdir(parents=True)
            trial = {"number":attempt,"startedUtc":now()}
            item["attempts"].append(trial)
            checkpoint()
            print(f"Starting {group}/{name}, attempt {attempt}",flush=True)
            if group=="legacy":
                cmd = [sys.executable,"-B","benchmark/scripts/measure-import-flight.py",str(glb),str(dest/name),"--url",url,
                       "--case",json.dumps(row["experiment"]),"--release-tick",str(row["schedule"]["releaseTick"])]
                if row["experiment"]["profile"]=="boost":
                    cmd.append("--boost")
            else:
                cmd = [sys.executable,"-B","benchmark/scripts/run-topogenesis.py",group,"producer",str(dest),"--revision","2",
                       "--url",url,"--controller",target["source"],"--entry-sha256",target["entrySha256"],
                       "--only",str(row["experiment"]["seed"])]
                if group in ("second-holdout","third-holdout"):
                    cmd.extend(["--sealed-cases",str(BENCH/(group+".json"))])
            with (dest/"process.log").open("w") as log:
                status = subprocess.run(["timeout","--kill-after=15s","240s",*cmd],stdout=log,stderr=subprocess.STDOUT)
            trial["exitCode"]=status.returncode
            trial["finishedUtc"]=now()
            if status.returncode:
                trial["error"] = (dest/"process.log").read_text(errors="replace")[-2000:]
                print(trial["error"],flush=True)
                checkpoint()
                # Keep each setup failure. A completed physics verdict is never retried.
                raw = read(dest/name) if (dest/name).is_file() else {}
                if attempt==1 and retry_count<1 and not raw.get("metrics",{}).get("completed"):
                    retry_count+=1
                    continue
                break
            try:
                report = read(dest/name)
                verdict = observe(row,report,glb)
                result = subprocess.check_output(["node","reader/tools/read-flight-diagnostic.js",str(glb),str(dest/name)],text=True)
                reader = json.loads(result)
                assert reader["sha256"]==row["world"]["sha256"] and reader["outcome"]==verdict["outcome"]
                directory=OUT/"reports"/group
                directory.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(dest/name,directory/name)
                item["observation"]=verdict
                item["producerReader"]=reader
                print(f"{group}/{name} {verdict['outcome']} met={verdict['met']}",flush=True)
            except (ValueError,KeyError,AssertionError,subprocess.CalledProcessError) as error:
                trial["verificationError"]=f"{type(error).__name__}: {error}"
                print(trial["verificationError"],flush=True)
            break
        checkpoint()
    server.shutdown()
index["finishedUtc"]=now()
checkpoint()
measured = [r for r in index["cases"] if "observation" in r]
with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as summary:
    summary.write(f"Measured {len(measured)}/{len(rows)} assigned cases.\n\n| Case | Outcome | Frozen gate |\n| --- | --- | --- |\n")
    for row in index["cases"]:
        obs=row.get("observation",{})
        summary.write(f"| {row['group']}/{row['name']} | {obs.get('outcome','incomplete')} | {obs.get('met','unverified')} |\n")
if len(measured)!=len(rows):
    raise SystemExit("Incomplete or unverified flights. See retained attempts.")
