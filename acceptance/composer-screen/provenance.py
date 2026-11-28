import hashlib
import json
from pathlib import Path
import re
import subprocess

here=Path(__file__).resolve().parent
plan=json.loads((here/"plan.json").read_bytes())
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def entry(folder):
    html=(folder/"index.html").read_text("utf8")
    path=re.search(r'<script[^>]+src="([^"]+\.js)"',html).group(1).removeprefix("./").lstrip("/")
    return {"file":path,"bytes":(folder/path).stat().st_size,"sha256":sha(folder/path)}

out=Path("output")
out.mkdir(exist_ok=True)
result={}
for label in ("base","candidate"):
    root=Path(label)
    rev=subprocess.check_output(["git","-C",label,"rev-parse","HEAD"],text=True).strip()
    assert rev==plan[label]
    lock=json.loads((root/"package-lock.json").read_bytes())["packages"]["node_modules/three"]
    three=root/"node_modules/three"
    assert lock["version"]==json.loads((three/"package.json").read_bytes())["version"]==plan["three"]
    paths=["examples/jsm/postprocessing/"+s+".js" for s in ("EffectComposer","Pass","OutputPass","RenderPass","UnrealBloomPass")]
    paths+=["src/core/RenderTarget.js","src/renderers/WebGLRenderer.js","src/renderers/webgl/WebGLTextures.js"]
    result[label]={"source":rev,"lockSha256":sha(root/"package-lock.json"),"threeLock":lock,
                   "threeSourceSha256":{s:sha(three/s) for s in paths},
                   "gameRendererSha256":sha(root/"src/render/GameRenderer.ts"),
                   "productBuild":json.loads((root/"dist/build-info.json").read_bytes()),
                   "productEntry":entry(root/"dist"),"measurementEntry":entry(Path("sites")/label)}
    assert result[label]["productBuild"]["sourceCommit"]==rev and not result[label]["productBuild"]["dirty"]
assert result["base"]["lockSha256"]==result["candidate"]["lockSha256"]
assert result["base"]["threeSourceSha256"]==result["candidate"]["threeSourceSha256"]
(out/"builds.json").write_text(json.dumps(result,indent=2)+"\n")
