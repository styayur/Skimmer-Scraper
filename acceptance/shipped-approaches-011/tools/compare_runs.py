"""Compare two directed receipts, exposing both raw and per-session geometry identities."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE))
from classify import classify


def read(p):
    return json.loads(p.read_bytes())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def normalize_ids(obj):
    ids={}
    def visit(value):
        if isinstance(value,list):
            return [visit(v) for v in value]
        if isinstance(value,dict):
            out={}
            for key,val in value.items():
                if key=="geometryId" and isinstance(val,str):
                    out[key]=ids.setdefault(val,len(ids)+1)
                else:
                    out[key]=visit(val)
            return out
        return value
    return visit(obj),ids


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous",type=Path)
parser.add_argument("current",type=Path)
args=parser.parse_args()
old_dir,new_dir=args.previous/"raw",args.current/"raw"
old,new=read(old_dir/"directed-summary.json"),read(new_dir/"directed-summary.json")
assert old["complete"] and new["complete"] and old["designCommit"]==new["designCommit"]
assert new["registeredOn"]==old["source"]
plan=read(HERE/"plan.json")
geometry={x["world"]:x for x in read(HERE/"geometry.json")}
surveys=[read(p/"geometry-survey.json") for p in (old_dir,new_dir)]
result={"registeredDesign":new["designCommit"],"previousSource":old["source"],"previousEntry":old["entry"],
        "source":new["source"],"entry":new["entry"],"workflowRun":new["workflowRun"],"cases":[]}
for case,old_v,new_v in zip(plan["cases"],old["worlds"],new["worlds"],strict=True):
    name=case["world"]
    assert old_v["world"]==new_v["world"]==name
    sessions=[]
    for root,run,verdict,sv in zip((old_dir,new_dir),(old,new),(old_v,new_v),surveys,strict=True):
        where=root/"attempts"/name/"1"
        frame=read(where/"frames.json"); f=read(where/"flight.json"); reader=read(where/"reader.json")
        assert (sha(where/"frames.json"),sha(where/"flight.json"))==(verdict["framesSha256"],verdict["reportSha256"])
        assert f["build"]["sourceCommit"]==reader["consumer"]==run["source"] and not f["build"]["dirty"]
        assert f["binary"]==run["entry"] and reader["binarySha256"]==run["entry"]["sha256"]
        assert reader["level"]=="engine-replayed" and reader["sha256"]==f["world"]["sha256"]==case["sha256"]
        assert abs(reader["longestContinuousMeters"]-f["metrics"]["longestSampledGlideM"])<1e-6
        check=classify(plan,case,geometry[name],f,frame)
        assert all(verdict[k]==v for k,v in check.items())
        assert sv["source"]==run["source"] and sv["entry"]==run["entry"]
        probe,=[x for x in sv["worlds"] if x["world"]==name]
        assert probe["topVerified"] and probe["spawnCorridorClear"]
        survey_points=[probe[k] for k in ("spawnCorridor","topProbes")]
        sessions.append((f,frame,survey_points))
    (a,af,ap),(b,bf,bp)=sessions
    for k in ("world","imported","replayed","schedule","experiment","browser","input","fixedHz","sampleMs","releaseTick"):
        assert a[k]==b[k],(name,k)
    stable_a,ids_a=normalize_ids(af); stable_b,ids_b=normalize_ids(bf)
    stable_ap,_=normalize_ids(ap); stable_bp,_=normalize_ids(bp)
    times=[s["time"] for s in af["frames"]]
    assert times==[s["time"] for s in bf["frames"]]
    result["cases"].append({
        "world":name,"unchangedGLB":case["sha256"],"previousReportSha256":old_v["reportSha256"],
        "currentReportSha256":new_v["reportSha256"],"samples16ms":len(times),"samples64ms":len(b["trace"]),
        "edges":len(bf["edges"]),"same64msTrace":a["trace"]==b["trace"],"same64msMetrics":a["metrics"]==b["metrics"],
        "rawDetailIdentical":af==bf,"rawFrameDifferences":sum(x!=y for x,y in zip(af["frames"],bf["frames"],strict=True)),
        "sameDetailWithGeometryIdMapped":stable_a==stable_b,"previousGeometryIds":ids_a,"currentGeometryIds":ids_b,
        "rawProbeIdentity":ap==bp,"sameProbesWithGeometryIdMapped":stable_ap==stable_bp,
        "outcome":b["outcome"],"sustainedOnTarget":new_v["sustainedOnTarget"],"activeRelease":new_v["activeRelease"],
        "targetSamples":new_v["glidingSamplesBeforeRelease"],"longestTargetChordM":new_v["longestTargetChordM"],
        "minimumSampledSolidDistanceM":new_v["minimumSampledSolidDistanceM"],
        "shieldImpacts":new_v["shieldImpacts"],"sampledHullIntrusion":new_v["sampledHullIntrusion"]})
out=args.current/"compare-previous.json"
out.write_bytes((json.dumps(result,indent=2)+"\n").encode())
print([(x["world"],x["outcome"],x["same64msTrace"],x["sameDetailWithGeometryIdMapped"]) for x in result["cases"]])
