"""Run exactly one preregistered flight per world against the staged official Web archive."""
import argparse
from contextlib import contextmanager
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
import traceback

from classify import classify
from directed_flight import survey_world

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT/"output"
DESIGN = "1ccf35240747aeb7405679d1b517823a7b3f072b"


def load(path):
    return json.loads(path.read_bytes())


def save(path, value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def site():
    with ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(ROOT/"staging/served"))) as server:
        thread = Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


def flight(case, geometry, glb, prior, runtime, url, folder):
    experiment = {"module":case["world"],"seed":case["seed"],"profile":"cruise","ruleRevision":0,
                  "inputId":f'manual-top-lb{case["captureTick"]}-release{case["releaseTick"]}-cruise',
                  "disposition":"may-reject","approach":"manual-top","wingmates":3,"directedCase":case}
    trace = folder/"flight.json"
    save(folder/"request.json",experiment)
    with (folder/"process.log").open("w",encoding="utf-8") as f:
        result = subprocess.run([sys.executable,"-Bu",str(ROOT/"benchmark/scripts/measure-import-flight.py"),
                                 str(glb),str(trace),"--url",url,"--release-tick",str(case["releaseTick"]),
                                 "--case",json.dumps(experiment)],
                                env={**os.environ,"PYTHONPATH":str(HERE)},stdout=f,stderr=subprocess.STDOUT,timeout=270)
    result.check_returncode()
    report = load(trace)
    assert report["build"]["sourceCommit"] == runtime["controller"] and not report["build"]["dirty"]
    assert report["binary"] == runtime["entry"] and report["browser"] == prior["browser"]
    assert report["world"]["sha256"] == case["sha256"] and report["imported"]["bounds"] == prior["imported"]["bounds"]
    assert report["metrics"]["completed"] and not report["errors"]
    with (folder/"reader.json").open("wb") as success, (folder/"reader.log").open("wb") as errors:
        subprocess.run(["node","tools/read-flight-diagnostic.js",str(glb),str(trace)],cwd=ROOT/"producer",
                       check=True,stdout=success,stderr=errors,timeout=30)
    assert load(folder/"reader.json")["sha256"] == case["sha256"]
    verdict = classify(plan,case,geometry,report,load(folder/"frames.json"))
    verdict["reportSha256"] = digest(trace)
    verdict["framesSha256"] = digest(folder/"frames.json")
    save(folder/"verdict.json",verdict)
    return verdict


def run(kind):
    from playwright.sync_api import sync_playwright
    from contextlib import ExitStack
    runt = load(OUT/"runtime.json")
    assert runt["controller"] == plan["source"] and runt["entry"]["sha256"] == plan["entrySha256"]
    producer = subprocess.check_output(["git","-C",str(ROOT/"producer"),"rev-parse","HEAD"],text=True).strip()
    assert producer == plan["producer"]
    geometry = {r["world"]:r for r in load(HERE/"geometry.json")}
    results = {"stage":kind,"designCommit":DESIGN,"source":runt["controller"],"entry":runt["entry"],
               "workflowRun":os.environ["GITHUB_RUN_ID"],"workflowAttempt":os.environ["GITHUB_RUN_ATTEMPT"],
               "workflowCommit":os.environ["GITHUB_SHA"],"worlds":[]}
    report = OUT/("geometry-survey.json" if kind == "survey" else "directed-summary.json")
    if kind == "flights":
        checks = load(OUT/"geometry-survey.json")
        assert checks["complete"] and checks["source"] == plan["source"]
    save(report,results)
    with ExitStack() as stack:
        url = stack.enter_context(site())
        if kind == "survey":
            p = stack.enter_context(sync_playwright())
            browser = p.chromium.launch(headless=True,args=["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
            stack.callback(browser.close)
        for case in plan["cases"]:
            name = case["world"]
            glb = ROOT/plan["priorDirectory"]/(name+".glb")
            prior = load(glb.with_suffix(".json"))
            row = {"world":name,"sha256":case["sha256"]}
            folder = OUT/"attempts"/name/"1"
            try:
                assert digest(glb) == prior["sha256"] == case["sha256"]
                if kind == "survey":
                    survey_world(browser,url,glb,row,geometry[name],prior)
                    assert row["build"]["sourceCommit"] == runt["controller"] and not row["build"]["dirty"]
                    assert row["binary"] == runt["entry"] and row["browser"] == prior["browser"]
                else:
                    folder.mkdir(parents=True,exist_ok=False)
                    row.update(flight(case,geometry[name],glb,prior,runt,url,folder))
                row["recorded"] = True
            except Exception:
                row["error"] = traceback.format_exc()
                if kind == "flights" and folder.is_dir():
                    save(folder/"error.json",row)
            results["worlds"].append(row)
            save(report,results)
            print(name, row.get("error") or row.get("phaseTransitions") or (row["spawnCorridorClear"],row["topVerified"]), flush=True)
    results["complete"] = all(r.get("recorded") for r in results["worlds"]) and len(results["worlds"]) == 3
    save(report,results)
    return results["complete"]


plan = load(HERE/"plan.json")
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage",choices=("survey","flights"))
    sys.exit(0 if run(parser.parse_args().stage) else 1)
