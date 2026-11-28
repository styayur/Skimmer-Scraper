"""Summarize the hosted captures without using software GPU timings as hardware measurements."""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
from statistics import median

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("artifacts", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()

def digest(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def stable_hashes(s):
    return {key: digest(s[key]) for key in ("position","velocity","attitude","cameraPosition","agents","chunks","rules","settings","relay","world")}

def gpu_frame(a,b):
    ca,cb = (r["draw"]["draws"] for r in (a,b))
    da,db = (stable_hashes(r) for r in (a,b))
    programs = [Counter(row[0] for row in commands) for commands in (ca,cb)]
    canon = [Counter(digest(cmd) for cmd in cmds) for cmds in (ca,cb)]
    mismatches=[(x,y) for x,y in zip(ca,cb) if x!=y]
    same_state=len(ca)==len(cb) and all(x[:2]+x[3:]==y[:2]+y[3:] for x,y in zip(ca,cb))
    shadow_only=len(ca)==len(cb) and all(x[6:8]==y[6:8]==[1536,1536] for x,y in mismatches)
    return {
        "tag":a["tag"], "pose":all(da[k]==db[k] for k in ("position","velocity","attitude","cameraPosition")),
        "agents":da["agents"]==db["agents"],"chunks":da["chunks"]==db["chunks"],"world":da["world"]==db["world"],
        "counts":a["render"]==b["render"],"objects":a["objects"]==b["objects"],
        "activeProgramSet":programs[0].keys()==programs[1].keys(),
        "perProgramDrawCounts":programs[0]==programs[1],
        "drawMultiset":canon[0]==canon[1],"orderedDraws":ca==cb,
        "pipelineSequence":same_state,"differentCommandSlots":len(mismatches)+abs(len(ca)-len(cb)),
        "allSlotDifferencesInShadow":shadow_only,
        "uniformSetterCounts":a["draw"]["uniformWrites"]==b["draw"]["uniformWrites"],
        "leftCalls":len(ca),"rightCalls":len(cb),"leftTriangles":a["render"]["triangles"],"rightTriangles":b["render"]["triangles"],
        "leftCommandSHA256":digest(ca),"rightCommandSHA256":digest(cb),
    }

def tally(matches):
    flags=("pose","agents","chunks","world","counts","objects","activeProgramSet","perProgramDrawCounts","drawMultiset","orderedDraws","pipelineSequence","uniformSetterCounts")
    changed=[r for r in matches if not r["orderedDraws"]]
    return {"n":len(matches),**{k:sum(bool(row[k]) for row in matches) for k in flags},
            "orderDifferencesOnlyInShadow":sum(r["allSlotDifferencesInShadow"] and r["drawMultiset"] for r in changed),
            "commandSlotsInOrderOnlyPairs":sum(r["differentCommandSlots"] for r in changed if r["drawMultiset"])}

def extractfiles(lane):
    ff=sorted(args.artifacts.glob("sakura-"+lane+"*/"+lane+"-*.json.gz"))
    found={}
    for f in ff:
        if ".shader-sources" in f.name:continue
        d=json.loads(gzip.decompress(f.read_bytes()))
        assert not d["errors"] and len(d["rows"])==14
        found[(d["round"],d["seed"])]=d
    assert len(found)==12,(lane,list(found))
    return found

def samples(found):
    seeds=sorted({s for _,s in found})
    for name,pairs in [("cross-forward",[(0,1)]),("cross-reverse",[(3,2)]),("A-A",[(0,3)]),("B-B",[(1,2)])]:
        left,right=pairs[0]
        for seed in seeds:yield name,seed,found[left,seed],found[right,seed]

graphics=extractfiles("graphics")
matchrows=[]
for pair,seed,old,new in samples(graphics):
    for a,b in zip(old["rows"],new["rows"],strict=True):
        assert (a["tag"],a["seed"],a["index"])==(b["tag"],b["seed"],b["index"])
        row=gpu_frame(a,b)
        row.update(pair=pair,seed=seed)
        matchrows.append(row)
summaries={}
for scope in ["cross","A-A","B-B"]:
    all_rows=[r for r in matchrows if r["pair"].startswith(scope)]
    matched=[r for r in all_rows if all(r[k] for k in ("pose","agents","chunks","counts","objects","world"))]
    summaries[scope]={"all":tally(all_rows),"strict":tally(matched),
        "fixedEndpoints":tally([r for r in all_rows if r["tag"].startswith("fixed-")]),
        "running":tally([r for r in matched if r["tag"].startswith("flight-")])}
active_by_ref=defaultdict(set)
gl_inventory=defaultdict(set)
pass_calls=defaultdict(list)
for d in graphics.values():
    ref=d["ref"]
    gl_inventory[ref].update(d["gl"]["programKeys"])
    for row in d["rows"]:
        bins=Counter()
        for cmd in row["draw"]["draws"]:
            active_by_ref[ref].add(cmd[0])
            w,h=cmd[6:8]
            category="1536 shadow" if (w,h)==(1536,1536) else ("backbuffer" if not cmd[3] else ("scene resolution" if [w,h]==d["gl"]["buffer"] else "other offscreen resolutions"))
            bins[category]+=1
        for k,v in bins.items():pass_calls[ref,k].append(v)
counters={}
for lane in ["counters","relay"]:
    data=extractfiles(lane)
    comp=[]
    for pair,seed,old,new in samples(data):
        matches=[]
        for a,b in zip(old["rows"],new["rows"],strict=True):
            matches += [all(a[k]==b[k] for k in ("position","attitude","velocity","speed","agents","shieldImpacts","usedGlide","rules","settings","relay","missions","requests","index","phase"))]
        ca,cb=(d["workload"]["calls"] for d in (old,new))
        essential=("ai/SymbiosisRuntime.step","companions/AgentController.step","flight/surfaceGlide.stepGlide","game/shield.resolveShield","game/shield.sweepFlight","companions/AgentController.perceive")
        comp.append({"pair":pair,"seed":seed,"samePhysicalRows":sum(matches),"rowCount":len(matches),
            "sameEssentialCounts":all(ca.get(k,0)==cb.get(k,0) for k in essential),
            "staticClosestQueries":[ca.get("world/chunkedWorldAdapter.queryNearest",0),cb.get("world/chunkedWorldAdapter.queryNearest",0)],
            "staticBVH":[ca.get("MeshBVH.closestPointToPoint",0),cb.get("MeshBVH.closestPointToPoint",0)]})
    grouped={}
    for ref in sorted({d["ref"] for d in data.values()}):
        runs=[d for d in data.values() if d["ref"]==ref]
        c=Counter()
        for d in runs:c.update(d["workload"]["calls"])
        callers=Counter()
        for d in runs:callers.update(d["workload"]["physicalByCaller"])
        durations={k:median(d["workload"]["inclusiveMs"].get(k,0) for d in runs) for k in sorted(set().union(*(d["workload"]["inclusiveMs"] for d in runs)))}
        grouped[ref]={"runs":len(runs),"physicalSeconds":len(runs)*12,"calls":dict(c),"bvhCallers":dict(callers),
            "medianInclusiveMsPer12sInstrumented":durations,
            "positivePerception": [{"seed":d["seed"],"round":d["round"],"targetCount":d["positive"]["targets"],
                "observe":d["positive"]["calls"].get("ai/semanticTargets.observe",0),
                "semanticCandidates":d["positive"]["calls"].get("world/worldStreamer.semanticCandidates",0),
                "bvhs":d["positive"]["calls"].get("MeshBVH.closestPointToPoint",0)} for d in runs]}
    counters[lane]={"byRef":grouped,"paired":comp}
res={"graphics":{"paired":summaries,"framePairs":matchrows,"activePrograms":{k:sorted(v) for k,v in active_by_ref.items()},
     "linkedPrograms":{k:sorted(v) for k,v in gl_inventory.items()},
     "medianDrawsPerResolution":{ref:{k:median(v) for (r,k),v in pass_calls.items() if r==ref} for ref in gl_inventory}},
     "counters":counters}
args.output.write_text(json.dumps(res,indent=2)+"\n",encoding="utf8")
print(json.dumps({k:v["strict"] for k,v in summaries.items()},indent=2))
