"""Compare native WebGL storage and uncomposited canvas pixels in the same hosted Chromium."""
import base64
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import traceback

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = Path("output")
PLAN = json.loads((HERE/"plan.json").read_bytes())


def save(path, data):
    path.write_bytes((json.dumps(data,indent=2,allow_nan=False)+"\n").encode())


def capture(browser, role, url):
    dest=OUT/role
    dest.mkdir()
    result={"role":role,"urlPath":url.split("/")[-2],"frames":[],"errors":[],"console":[],"browser":browser.version}
    context=browser.new_context(viewport={"width":640,"height":360},device_scale_factor=PLAN["devicePixelRatio"])
    page=context.new_page()
    page.on("pageerror",lambda e:result["errors"].append(str(e)))
    page.on("console",lambda m:result["console"].append([m.type,m.text]) if m.type in ("warning","error") else None)
    page.add_init_script("""(() => {
      let seed=SEED;
      Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);
        t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
      window.probeTime=1000; window.probeStep='setup';
      Object.defineProperty(performance,'now',{value:()=>window.probeTime});
      Date.now=()=>1700000000000+Math.floor(window.probeTime);
    })()""".replace("SEED",str(PLAN["mathRandomSeed"])))
    try:
        page.goto(url)
        page.wait_for_function("window.measure || window.probeError",timeout=75000)
        failure=page.evaluate("window.probeError")
        if failure:
            raise RuntimeError(failure)
        result["initial"]=page.evaluate("window.measure.initial")
        for i,s in enumerate(PLAN["steps"]):
            row=page.evaluate("s=>window.measure.step(s)",{**s,"index":i})
            raw=base64.b64decode(row.pop("rgba"),validate=True)
            im=Image.frombytes("RGBA",(row["width"],row["height"]),raw)
            im.transpose(Image.Transpose.FLIP_TOP_BOTTOM).save(dest/(s["name"]+".png"))
            row["rgbaSha256"]=hashlib.sha256(raw).hexdigest()
            row["channelExtrema"]=im.getextrema()
            result["frames"].append(row)
            save(dest/"observations.json",result)
    except Exception:
        result["errors"].append(traceback.format_exc())
    finally:
        try:
            result["storageEvents"]=page.evaluate("window.measure?.events ?? []")
        finally:
            save(dest/"observations.json",result)
            context.close()
    return result


def pixels(a,b,name):
    with Image.open(OUT/a/(name+".png")) as ia, Image.open(OUT/b/(name+".png")) as ib:
        if ia.size!=ib.size:
            return {"sizeMismatch":[ia.size,ib.size]}
        chans=ImageChops.difference(ia,ib).split()
        maximum=chans[0]
        for ch in chans[1:]:
            maximum=ImageChops.lighter(maximum,ch)
        hist=maximum.histogram()
        n=ia.width*ia.height
        total=sum(i*freq for ch in chans for i,freq in enumerate(ch.histogram()))
        return {"pixelCount":n,"different":n-hist[0],"overOneLsb":sum(hist[2:]),
                "maxChannelDelta":maximum.getextrema()[1],"meanAbsChannelDelta":total/(4*n)}


def analyze(runs):
    base=runs["base"]
    rows=[]; failures=[]
    def check(condition,message):
        if not condition:
            failures.append(message)
    for name,r in runs.items():
        check(not r["errors"] and len(r["frames"])==len(PLAN["steps"]),name+" collection")
        if "initial" not in r: continue
        init=r["initial"]
        check(init==base.get("initial"),name+" initial scene / context")
        check(init["threeRevision"]=="187" and "SwiftShader" in init["renderer"],name+" renderer")
        check(len(init["geometry"])==9 and all(not t["allocated"] for t in init["initialTargets"]),name+" lazy construction")
        previous=set(); previous_size=None
        for i,f in enumerate(r["frames"]):
            label=name+"/"+f["name"]
            screen=f["control"]=="screen"
            size=(f["width"],f["height"])
            changed=size!=previous_size
            allocated=[t for t in f["targets"] if t["allocated"]]
            current={t[k]["id"] for t in allocated for k in ("color","depth")}|{t["fbo"] for t in allocated}
            if changed and previous:
                deletions={e["id"] for e in r["storageEvents"] if e["op"]=="delete" and e["frame"]==f["name"]}
                check(previous<=deletions and previous.isdisjoint(current),label+" prior stores deleted on resize")
            if i < 12:
                expected=1 if changed or name=="candidate" else 2
                check(len(allocated)==expected,label+" full-size target count")
            else:
                check(len(allocated)==2,label+" valid offscreen buffers")
            for t in allocated:
                check(t["complete"] and t["colorBits"]==[16]*4 and t["floatColor"] and t["color"]["format"]==0x881a,
                      label+" queried RGBA16F")
                check(t["depthBits"]==24 and t["rbFormat"]==t["depth"]["format"]==0x81a6 and t["samples"]==0,
                      label+" queried DEPTH_COMPONENT24")
                check((t["color"]["width"],t["color"]["height"])==size==(t["rbWidth"],t["rbHeight"]) and
                      (t["depth"]["width"],t["depth"]["height"])==size and t["color"]["levels"]==1,
                      label+" allocated dimensions")
                check(t["payloadBytes"]==11*size[0]*size[1],label+" logical payload")
            expect_swap=(name!="candidate" or not screen)
            check(f["outputToScreen"]==screen and f["outputNeedsSwap"]==expect_swap,label+" output mode")
            check((f["before"]!=f["after"])==expect_swap,label+" actual buffer rotation")
            other="EffectComposer.rt1" if f["before"]=="EffectComposer.rt2" else "EffectComposer.rt2"
            check((other in f["renderTargets"])==(not screen),label+" actual offscreen destination")
            check(f["error"]==0 and all(b>a for a,b in f["channelExtrema"][:3]),label+" nonblank valid canvas")
            previous=current; previous_size=size
    for i,f in enumerate(base["frames"]):
        name=f["name"]; row={"name":name,"width":f["width"],"height":f["height"]}
        for secondary in ("base-repeat","candidate"):
            if i>=len(runs[secondary]["frames"]): continue
            alt=runs[secondary]["frames"][i]
            match=all(f[k]==alt[k] for k in ("name","time","quality","state","camera","projection","draw","geometries","bloom","shadow","antialias"))
            check(match,"scene/camera/draw "+secondary+"/"+name)
            diff=pixels("base",secondary,name)
            row[secondary]=diff
            check(diff.get("different")==0,"pixels "+secondary+"/"+name)
            if secondary=="candidate":
                row.update(stockTargets=sum(t["allocated"] for t in f["targets"]),candidateTargets=sum(t["allocated"] for t in alt["targets"]),
                           stockBytes=f["payloadBytes"],candidateBytes=alt["payloadBytes"],savedPayloadBytes=f["payloadBytes"]-alt["payloadBytes"])
        rows.append(row)
    check(len({f["rgbaSha256"] for f in base["frames"]})==len(PLAN["steps"]),"animated frame diversity")
    return {"workflowRun":os.environ["GITHUB_RUN_ID"],"workflowAttempt":os.environ["GITHUB_RUN_ATTEMPT"],
            "workflowSha":os.environ["GITHUB_SHA"],"plan":PLAN,"frames":rows,"failures":failures,"passed":not failures}


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass


if __name__=="__main__":
    OUT.mkdir(exist_ok=True)
    with ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory="sites")) as server, sync_playwright() as p:
        threading.Thread(target=server.serve_forever,daemon=True).start()
        browser=p.chromium.launch(args=["--use-angle=swiftshader","--enable-webgl","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        try:
            runs={}
            for role,build in (("base","base"),("base-repeat","base"),("candidate","candidate")):
                runs[role]=capture(browser,role,f"http://127.0.0.1:{server.server_port}/{build}/")
                print(role,len(runs[role]["frames"]),runs[role]["errors"],flush=True)
            summary=analyze(runs)
            save(OUT/"comparison.json",summary)
            print("gates",summary["failures"],flush=True)
            raise SystemExit(0 if summary["passed"] else 1)
        finally:
            browser.close()
            server.shutdown()
