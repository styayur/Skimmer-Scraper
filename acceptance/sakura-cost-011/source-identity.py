"""Record authoritative Git blobs and dependency integrities for the review's rendering scope."""
import json
from pathlib import Path
import subprocess
import sys

refs = ["991138b8c67c188bd47731d6c193142750225818", "ac943acd6a2c6d21431aa138327bc3e64ed8552f"]
scope = ["src/render","src/world/materials.ts","src/world/chunkGenerator.ts","src/world/cityDistricts.ts",
         "src/world/architectureLibrary.ts","src/world/proceduralCity.ts","src/world/proceduralArchitecture.ts",
         "src/world/worldConfig.ts","src/world/terrain.ts","src/world/cityChunk.worker.ts",
         "src/world/packedGeometry.ts","src/world/dynamicColliderRegistry.ts","src/game/shield.ts",
         "src/game/cooperation.ts","src/companions/AgentController.ts","src/audio","src/voice/VoiceRadio.ts"]
def git(*args):
    return subprocess.check_output(["git",*args])
versions=[]
for ref in refs:
    tree=git("ls-tree","-r",ref,"--",*scope).decode().splitlines()
    blobs={path:meta.split()[2] for meta,path in (row.split("\t") for row in tree)}
    lock=json.loads(git("show",ref+":package-lock.json"))["packages"]
    versions.append({"source":ref,"tree":git("rev-parse",ref+"^{tree}").decode().strip(),
      "blobs":blobs,"lockedPackages":{k:{f:lock["node_modules/"+k][f] for f in ("version","integrity")}
        for k in ("three","three-mesh-bvh","vite","@playwright/test")}})
all_paths=sorted(set(versions[0]["blobs"])|set(versions[1]["blobs"]))
result={"sources":versions,"identicalBlobs":[p for p in all_paths if versions[0]["blobs"].get(p)==versions[1]["blobs"].get(p)],
        "changedBlobs":[p for p in all_paths if versions[0]["blobs"].get(p)!=versions[1]["blobs"].get(p)]}
Path(sys.argv[1]).write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
print(json.dumps({"identical":len(result["identicalBlobs"]),"changed":result["changedBlobs"],"sameDependencies":versions[0]["lockedPackages"]==versions[1]["lockedPackages"]}))
