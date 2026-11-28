"""Join the original one-second activity observations to the recorded hardware work groups."""
import argparse
from collections import Counter,defaultdict
import gzip
import hashlib
import json
from pathlib import Path
from statistics import median

p=argparse.ArgumentParser(description=__doc__)
for arg in ("web_stock","web_final","windows_stock","windows_final","output"):
    p.add_argument(arg,type=Path)
args=p.parse_args()
keys=("seed","calls","triangles","renderObjects","collisionTriangles","loadedChunks")
def dataset(folder):
    receipt=json.loads((folder/"result.json").read_bytes())
    raw=(folder/"samples.json.gz").read_bytes()
    sha=hashlib.sha256(raw).hexdigest()
    assert sha==receipt["rawSha256"]
    rows=json.loads(gzip.decompress(raw))["samples"]
    real=defaultdict(list)
    for r in rows:
        m=r["music"]
        if (not r["buffering"] and r["gpuMs"] and r["phase"]=="ASCENT"
            and r["deployed"]==r["covered"]==3 and r["glide"]=="FLIGHT"
            and m["enabled"] and m["active"] and m["playing"] and not m["ducked"]
            and r["voice"]["played"]==r["voice"]["completed"]==0):
            real[tuple(r[k] for k in keys)+(m["selected"],)].append(r["gpuMs"])
    return {"sha":receipt["sourceCommit"],"sampleSha256":sha,"samples":len(rows),
        "glide":dict(Counter(r["glide"] for r in rows)),"threeCovered":sum(r["covered"]==r["deployed"]==3 for r in rows),
        "musicEnabled":sum(r["music"]["enabled"] for r in rows),"musicPlaying":sum(r["music"]["playing"] for r in rows),
        "musicDucked":sum(r["music"]["ducked"] for r in rows),"tracks":dict(Counter(r["music"]["selected"] for r in rows)),
        "maximumCumulativeVoicePlayed":max(r["voice"]["played"] for r in rows),
        "maximumCumulativeVoiceCompleted":max(r["voice"]["completed"] for r in rows)}, real
out={}
for platform in ("web","windows"):
    old,left=dataset(getattr(args,platform+"_stock"))
    new,right=dataset(getattr(args,platform+"_final"))
    pairs=sorted(left.keys() & right.keys())
    ratios=[median(right[k])/median(left[k]) for k in pairs]
    out[platform]={"stock":old,"final":new,"matchedAscentSamePlayingTrackAndNoVoice":{
        "fields":list(keys)+["selected music"],"groups":len(pairs),"stockSamples":sum(len(left[k]) for k in pairs),
        "finalSamples":sum(len(right[k]) for k in pairs),"medianGpuRatio":median(ratios)}}
args.output.write_text(json.dumps(out,indent=2)+"\n",encoding="utf8")
print(json.dumps({k:v["matchedAscentSamePlayingTrackAndNoVoice"] for k,v in out.items()}))
