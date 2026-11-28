"""Describe captures only inside the preregistered window, preserving the stock diagnostic."""
import math

from directed_flight import list_xyz


def classify(plan, case, geometry, flight, detail):
    frames, edges, coarse = detail["frames"], detail["edges"], flight["trace"]
    capture, release = case["captureTick"], case["releaseTick"]
    assert len(coarse) == release + plan["postReleaseIntervals"] + 1
    assert len(frames) == (len(coarse)-1)*4+1
    assert all(a["time"] < b["time"] for a,b in zip(frames,frames[1:]))
    assert all(f["mode"] == "running" and not f["boost"] and f["axes"] == [0]*4 for f in frames)
    for a,b in zip(frames[::4],coarse,strict=True):
        for k in ("time","phase","position","velocity","impacts","solidDistance"):
            assert a[k] == b[k], k
    assert flight["schedule"] == dict(captureTick=capture,releaseTick=release,releasePulse=True,
                                     postReleaseTicks=16,yawAxis=0,wingmates=3,launchFrameOffsetMs=0)
    assert [(e["index"],e["requested"]) for e in edges] == [(4,True),(4,False),(4,True),(4,False)]
    for i,e in zip((capture,capture+1,release,release+1),edges,strict=True):
        assert e["before"] == frames[4*i] and e["before"]["lb"] != e["requested"]
    for i,f in enumerate(frames):
        assert f["lb"] == (4*capture < i <= 4*(capture+1) or 4*release < i <= 4*(release+1))
    assert frames[0]["position"] == case["spawn"] and frames[0]["speed"] == 66
    assert math.dist(list_xyz(frames[0]["velocity"]),[66*x for x in geometry["heading"]]) < 1e-6
    assert detail["layoutAfterReload"] == detail["flightTabLayout"]
    assert detail["flightTabLayout"]["layoutSeed"] == flight["world"]["layoutSeed"]
    assert flight["imported"] == flight["replayed"] and flight["returnedToBuiltin"]
    assert flight["imported"]["collisionTriangles"] == geometry["collisionTriangles"]
    assert flight["imported"]["spawn"] == case["spawn"] and flight["imported"]["id"] == case["sha256"]

    before = frames[4*capture:4*release+1]
    after = frames[4*release+1:]
    lo, hi = geometry["target"]["min"], geometry["target"]["max"]
    def target(f):
        hit, p, n = f["nearestGlide"], f["contactPoint"], f["normal"]
        tol = plan["topToleranceM"]
        return bool(f["phase"] == "GLIDING" and p and n and hit
                    and f["impacts"] == frames[0]["impacts"]
                    and f["surfaceId"] == hit["surfaceId"] == "local-"+case["sha256"]+"-surface"
                    and f["geometryId"] == hit["contact"]["geometryId"]
                    and n["y"] >= plan["minimumUpNormal"] and abs(p["y"]-hi[1]) <= tol
                    and lo[0]-tol <= p["x"] <= hi[0]+tol and lo[2]-tol <= p["z"] <= hi[2]+tol)
    segments = []
    current = []
    for f in before:
        if target(f):
            current.append(f)
        elif current:
            segments.append(current)
            current = []
    if current:
        segments.append(current)
    runs = []
    for segment in segments:
        distance = sum(math.dist(list_xyz(a["position"]),list_xyz(b["position"]))
                       for a,b in zip(segment,segment[1:]))
        runs.append(dict(firstTime=segment[0]["time"],lastTime=segment[-1]["time"],samples=len(segment),
                         chordM=distance,firstContact=segment[0]["contactPoint"],lastContact=segment[-1]["contactPoint"]))
    gliding = [f for f in before if f["phase"] == "GLIDING"]
    active = before[-1]["phase"] == "GLIDING" and any(f["phase"] == "DETACHING" for f in after) and after[-1]["phase"] == "FLIGHT"
    times = [f["solidDistance"] for f in frames if f["solidDistance"] is not None]
    phases = []
    for f in frames:
        if not phases or f["phase"] != phases[-1]["phase"]:
            phases.append(dict(time=f["time"],phase=f["phase"]))
    return dict(world=case["world"], target=case["target"], frames=len(frames), coarseSamples=len(coarse),
                captureWindowSeconds=[before[0]["time"],before[-1]["time"]],
                captured=bool(gliding), firstGlideTime=gliding[0]["time"] if gliding else None,
                glidingSamplesBeforeRelease=len(gliding), onTarget=bool(runs),
                sustainedOnTarget=any(r["samples"] >= plan["sustainedFrames"] and r["chordM"] >= plan["sustainedChordM"] for r in runs),
                targetSegments=runs, longestTargetChordM=max((r["chordM"] for r in runs),default=0),
                releaseEdgePhase=before[-1]["phase"], activeRelease=active, finalPhase=after[-1]["phase"],
                shieldImpacts=frames[-1]["impacts"]-frames[0]["impacts"], minimumSampledSolidDistanceM=min(times),
                sampledHullIntrusion=any(d < 3.2-1e-5 for d in times),phaseTransitions=phases,
                stockDiagnosticOutcome=flight["outcome"], stockDiagnosticMetrics=flight["metrics"])
