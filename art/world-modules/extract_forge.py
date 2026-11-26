"""Extract radial sections from the labelled, symmetric Celadon SURFACE front face."""
import hashlib
import json
import math
from pathlib import Path
import struct

root = Path(__file__).resolve().parents[2]
source = root / 'public/world-modules/celadon-court.glb'
raw = source.read_bytes()
length = struct.unpack_from('<I',raw,12)[0]
doc = json.loads(raw[20:20+length])
data = memoryview(raw)[28+length:]
node, = (n for n in doc['nodes'] if n.get('extras',{}).get('skimmerRole')=='SURFACE')
primitive, = doc['meshes'][node['mesh']]['primitives']
acc = doc['accessors'][primitive['attributes']['POSITION']]
assert acc['componentType']==5126 and acc['type']=='VEC3' and 'indices' not in primitive
view = doc['bufferViews'][acc['bufferView']]
pts = list(struct.iter_unpack('<3f',data[view['byteOffset']:view['byteOffset']+view['byteLength']]))
# This profile is explicitly authored as a stone vault with a 13 m spring line.
# Only the cap at the near Z plane encodes the 2D section.
front = max(p[2] for p in pts)
caps = [pts[i:i+3] for i in range(0,len(pts),3) if all(abs(p[2]-front)<1e-5 for p in pts[i:i+3])]
def radii(angle):
    dx, dy = math.cos(angle), math.sin(angle)
    hits=[]
    for triangle in caps:
        for a,b in zip(triangle,triangle[1:]+triangle[:1]):
            ex, ey = b[0]-a[0], b[1]-a[1]
            det = dx*ey-dy*ex
            if abs(det)<1e-7: continue
            x,y=a[0],a[1]-13
            u=(x*dy-y*dx)/det
            t=(x*ey-y*ex)/det
            if -1e-5<=u<=1.00001 and t>0: hits.append(t)
    if not hits: raise ValueError('Unsupported open section')
    return [round(min(hits),5),round(max(hits),5)]

profile = [radii(math.pi*i/28) for i in range(29)]
assert all(6.7 < inside < 7.2 and outside>inside for inside,outside in profile)
recipe = dict(schema=1, prototype=source.name,sha256=hashlib.sha256(raw).hexdigest(),
    ports={n['extras']['skimmerSocket']:n.get('translation',[0,0,0]) for n in doc['nodes'] if 'skimmerSocket' in n.get('extras',{})},
    bounds=[acc['min'],acc['max']], spring=13, radii=profile)
out=root/'src/world/procedural/forge-profile.json'
out.write_text(json.dumps(recipe,indent=2)+'\n', encoding='utf-8', newline='\n')

