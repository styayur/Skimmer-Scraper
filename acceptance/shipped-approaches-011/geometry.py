"""Inventory the actual indexed GLB faces of the three pinned, axis-aligned shipped exports."""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PLAN = json.loads((HERE / "plan.json").read_bytes())
ASSETS = ROOT / PLAN["priorDirectory"]


def accessor(gltf, binary, index, fmt):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    first = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride", struct.calcsize(fmt))
    return [struct.unpack_from(fmt, binary, first + i * stride) for i in range(acc["count"])]


def cuboid(gltf, binary, primitive):
    pos = primitive["attributes"]["POSITION"]
    idx = primitive["indices"]
    assert gltf["accessors"][pos]["componentType"] == 5126 and gltf["accessors"][idx]["componentType"] == 5123
    verts = accessor(gltf, binary, pos, "<3f")
    indices = [i for (i,) in accessor(gltf, binary, idx, "<H")]
    face_areas = Counter()
    assert len(indices) == 36 and set(verts) == {(x,y,z) for x in (-.5,.5) for y in (-.5,.5) for z in (-.5,.5)}
    for i in range(0, len(indices), 3):
        tri = [verts[j] for j in indices[i:i+3]]
        axis, = [k for k in range(3) if len({point[k] for point in tri}) == 1]
        a, b = (axis + 1) % 3, (axis + 2) % 3
        edge1 = [tri[1][k] - tri[0][k] for k in (a,b)]
        edge2 = [tri[2][k] - tri[0][k] for k in (a,b)]
        twice_area = abs(edge1[0] * edge2[1] - edge1[1] * edge2[0])
        assert twice_area == 1
        face_areas[axis,tri[0][axis]] += twice_area / 2
    assert len(face_areas) == 6 and set(face_areas.values()) == {1}
    return len(indices) // 3


def footprint(case, lo, hi):
    angle = math.radians(case["spawnYaw"])
    direction = [-math.sin(angle), 0, -math.cos(angle)]
    origin = [case["spawn"][k] for k in "xyz"]
    intervals = []
    for axis in (0,2):
        if abs(direction[axis]) < 1e-10:
            assert lo[axis] < origin[axis] < hi[axis]
            continue
        intervals.append(sorted((edge-origin[axis])/direction[axis] for edge in (lo[axis],hi[axis])))
    start, end = max(pair[0] for pair in intervals), min(pair[1] for pair in intervals)
    assert 0 < start < end
    return direction, start, end


def inspect(case):
    name = case["world"]
    data = (ASSETS / (name + ".glb")).read_bytes()
    previous = json.loads((ASSETS / (name + ".json")).read_bytes())
    assert hashlib.sha256(data).hexdigest() == previous["world"]["sha256"] == case["sha256"]
    magic, version, total, length, kind = struct.unpack_from("<4sIII4s", data)
    assert (magic, version, total, kind) == (b"glTF", 2, len(data), b"JSON")
    gltf = json.loads(data[20:20+length])
    binary = data[28+length:]
    nodes = gltf["nodes"]
    assert not gltf.get("animations") and set(gltf["scenes"][gltf["scene"]]["nodes"]) == set(range(len(nodes)))
    solids, excluded, meshes = [], [], {}
    for node in nodes:
        assert not any(key in node for key in ("children","rotation","matrix","skin","weights"))
        role = node["extras"]["skimmerRole"]
        if role == "DECORATION":
            excluded.append(node["name"])
            continue
        assert role == "SURFACE" and min(node["scale"]) > 0
        mesh = node["mesh"]
        if mesh not in meshes:
            primitive, = gltf["meshes"][mesh]["primitives"]
            meshes[mesh] = cuboid(gltf, binary, primitive)
        t, s = node["translation"], node["scale"]
        solids.append({"name":node["name"], "role":role, "triangles":meshes[mesh],
                       "min":[t[k]-s[k]/2 for k in range(3)], "max":[t[k]+s[k]/2 for k in range(3)]})
    low = [min(s["min"][k] for s in solids) for k in range(3)]
    high = [max(s["max"][k] for s in solids) for k in range(3)]
    shift = [-(low[0]+high[0])/2, -low[1], -(low[2]+high[2])/2]
    for solid in solids:
        for bound in ("min","max"):
            solid[bound] = [v+shift[k] for k,v in enumerate(solid[bound])]
    old = previous["imported"]
    assert all(abs(old["bounds"][k]-(high[i]-low[i])) < 1e-5 for i,k in enumerate("xyz"))
    assert old["collisionTriangles"] == sum(s["triangles"] for s in solids)
    target, = [s for s in solids if s["name"] == case["target"]]
    direction, start, end = footprint(case, target["min"], target["max"])
    def query_point(metres, height):
        return {"x":case["spawn"]["x"] + direction[0]*metres, "y":height,
                "z":case["spawn"]["z"] + direction[2]*metres}
    corridor = [query_point(m,case["spawn"]["y"]) for m in range(0,23,2)]
    def clearance(p):
        return min(math.sqrt(sum(max(s["min"][i]-p[k], p[k]-s["max"][i], 0)**2 for i,k in enumerate("xyz")))
                   for s in solids)
    top = target["max"][1]
    probes = [query_point(m, top + .35) for m in (start+1,(start+end)/2,end-1)]
    assert min(map(clearance,corridor)) > 6.5
    assert all(abs(clearance(p)-.35)<1e-5 for p in probes)
    return {"world":name, "sha256":case["sha256"], "bytes":len(data), "previousDefaultSpawn":old["spawn"],
            "solidBoundsTranslation":shift, "collisionTriangles":old["collisionTriangles"],
            "surfaceNodes":len(solids), "excludedDecorations":excluded, "solids":solids,
            "target":target,"heading":direction,"straightFootprintMetresFromSpawn":[start,end],
            "straightLengthOnTopM":end-start,"startingHeightAboveTopM":case["spawn"]["y"]-top,
            "spawnCorridorPoints":corridor,"minimumGeometryClearanceOnSpawnChecksM":min(map(clearance,corridor)),
            "topProbePoints":probes}


if __name__ == "__main__":
    inventory = [inspect(case) for case in PLAN["cases"]]
    text = (json.dumps(inventory,indent=2)+"\n").encode()
    if "--check" in sys.argv:
        assert json.loads((HERE/"geometry.json").read_bytes()) == inventory
    else:
        (HERE/"geometry.json").write_bytes(text)
    for row in inventory:
        print(row["world"], row["target"]["name"], row["target"]["min"], row["target"]["max"],
              "top chord",round(row["straightLengthOnTopM"],3),"spawn corridor",round(row["minimumGeometryClearanceOnSpawnChecksM"],3))
