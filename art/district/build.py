"""Rebuild the metre-scale district, its game meshes and the loft profiles."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "art/district"
EVIDENCE = ROOT / "evidence/v0.7/pr1"
EVIDENCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_end = 193
palette = {
    "shellCeladon": (.12, .43, .38), "shellIvory": (.83, .66, .48),
    "shellPlum": (.31, .12, .22), "glass": (.045, .15, .21),
    "bridge": (.16, .25, .26), "teal": (.19, .95, .81),
    "rose": (.99, .19, .39), "windowWarm": (1, .61, .22),
    "blossom": (.98, .43, .58), "wood": (.28, .14, .15),
    "soil": (.18, .33, .24), "rock": (.24, .19, .26), "ground": (.19, .17, .21)
}
materials = {}
for key, rgb in palette.items():
    mat = bpy.data.materials.new(key)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Metallic"].default_value = .38 if key.startswith("shell") else .15
    if key in ("teal", "rose", "windowWarm"):
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = 1.25
    materials[key] = mat

# Rings in a loft may shift sideways. Each adjacent pair is joined with a ruled skin.
# A strip has square ends on its longitudinal axis so adjacent bridge spans meet.
octagon = [(-.36,-.5),(.36,-.5),(.5,-.36),(.5,.36),(.36,.5),(-.36,.5),(-.5,.36),(-.5,-.36)]
square = [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]
def polygon(n):
    return [(round(.5*math.cos(i*math.tau/n),6),round(.5*math.sin(i*math.tau/n),6)) for i in range(n)]

recipes = {}
def part(name, mat, rings, shape=octagon):
    recipes.setdefault(name, []).append(dict(material=mat, rings=rings, outline=shape))

def slab(name, mat, x, y, z, w, d, h, shape=octagon):
    part(name, mat, [(x,y,z,w,d),(x,y,z+h,w,d)], shape)

def tree(name, x, y, z, size):
    part(name, "wood", [(x,y,z,.7,.8),(x+.5,y,z+size,.5,.5)], polygon(5))
    for dx,dy,dz,s in [(-.35,0,.02,.82),(.32,.11,.14,.7),(.04,-.15,.39,.84)]:
        cx,cy,cz=x+dx*size,y+dy*size,z+size+dz*size
        part(name,"blossom",[(cx,cy,cz-.8,size*s,size*s),(cx,cy,cz+.45,size*s*1.8,size*s*1.5),
                             (cx+.2,cy,cz+1.3,size*s*.65,size*s*.56)],polygon(6))

# Towers use a 32 m lot and a nominal height of 100 m.
for name, skin in [("moonGate","shellIvory"),("foldedFan","shellCeladon"),("lanternCourt","shellPlum"),
                   ("terraceOrchard","shellCeladon"),("needleExchange","shellIvory")]:
    slab(name,skin,0,0,0,32,30,6)
    if name in ("moonGate","lanternCourt"):
        for side in (-1,1):
            part(name,skin,[(side*10,0,6,11,25),(side*11,0,32,9,21),
                            (side*11.4,1,63,8,18),(side*7,2,76,12,21)])
            slab(name,"windowWarm",side*11,-10.6,32,.55,.35,28)
            part(name,"glass",[(side*10,-9,6,5,8),(side*11,-8,32,5.8,7),
                               (side*11.4,-6,63,4,7),(side*7,-5,74,3,8)])
            for z in range(16,63,6):
                slab(name,"windowWarm",side*10.8,-11.1+(z-32)*.06,z,3.2,1.4,.42)
        part(name,skin,[(0,1,73,25,17),(0,1,78,32,22),(0,2,84,29,19)])
        if name=="lanternCourt":
            slab(name,"glass",0,2,84,21,15,11)
            part(name,"shellIvory",[(0,2,95,30,20),(0,2,97,32,22),(0,2,101,16,11)])
            slab(name,"bridge",0,0,36,28,7,2.5)
        else:
            part(name,"glass",[(3,2,84,19,17),(6,3,99,11,9)])
            tree(name,-9,1,84,3.8)
    elif name=="terraceOrchard":
        for i,(x,z,w,d,h) in enumerate([(0,6,30,28,26),(-3,32,25,24,25),(-5,57,18,19,24),(-7,81,12,14,18)]):
            part(name,skin,[(x,0,z,w,d),(x,0,z+h-2,w*.9,d*.9),(x,0,z+h,w,d)])
            slab(name,"rose",x,0,z+h-1,w+.1,d+.1,.45)
            tree(name,x+w*.34,1,z+h,2.6)
    else:
        sign = 1 if name=="foldedFan" else -1
        for i in range(3):
            x=(i-1)*8
            h=[70,98,83][i] if sign==1 else [86,100,63][i]
            part(name,skin,[(x,0,6,12,23),(x,0,35,10,23),(x+sign*2,i-1,h-15,10,18),
                            (x+sign*5,i-1,h,5,11)])
            part(name,"glass",[(x,-8,7,6,9),(x,-8,35,7,9),(x+sign*2,-6,h-16,5,8)])
            for z in range(16,h-18,8):
                slab(name,"windowWarm",x,-11.9,z,5,.9,.48)
        slab(name,"bridge",0,1,47,30,25,2)
        slab(name,"teal",0,1,49,30,25,.45)

part("skyGarden","rock",[(2,0,-22,8,11),(-4,1,-15,26,35),(0,0,-6,52,43),(0,0,0,60,52)],polygon(11))
slab("skyGarden","soil",0,0,0,60,52,2,polygon(11))
for x,y in [(-17,-5),(14,8),(-7,13),(7,-13)]:
    tree("skyGarden",x,y,2,4.5)
for x in [-10,10]:
    part("skyGarden","shellIvory",[(x,0,2,4,11),(x*1.15,0,12,3,8)])
part("skyGarden","shellCeladon",[(0,0,12,27,16),(0,0,14,32,21),(0,0,17,22,13)])
slab("skyGarden","shellIvory",0,0,2.2,29,13,.7)
for x in [-12,-6,0,6,12]:
    slab("skyGarden","wood",x,4,3,1,1,9)
    slab("skyGarden","windowWarm",x,-4,11,1.3,1.3,1.3)
part("skyGarden","shellIvory",[(0,0,-5,52,43),(0,0,-3,56,47)],polygon(11))

# Lenticular truss: floor and two side arches leave the centre open.
slab("span","bridge",0,0,0,40,6,1.4,square)
for side in [-1,1]:
    for i in range(6):
        a,b=i/6,(i+1)/6
        low,high=sorted([(math.sin(a*math.pi)*6+1,a*40-20),(math.sin(b*math.pi)*6+1,b*40-20)])
        if high[0]-low[0]>.01:
            part("span","shellIvory",[(low[1],side*2.7,low[0],2,.7),(high[1],side*2.7,high[0],2,.7)],square)
        if i in [1,2,3,4,5]:
            slab("span","bridge",a*40-20,side*2.7,1,.5,.5,max(.5,math.sin(a*math.pi)*6),square)
    slab("span","rose",0,side*3,1,40,.22,.25,square)

# A rotating annular sky station. Individual wedges make the through-hole explicit.
for i in range(16):
    angle = math.tau*i/16
    edge = math.tau*(i+1)/16
    outline = [(r*math.cos(t),r*math.sin(t)) for r,t in [(1,angle),(1,edge),(.73,edge),(.73,angle)]]
    slab("orbit","shellCeladon",0,0,-1.4,18,18,2.8,outline)
    if i%4==0:
        slab("orbit","windowWarm",15.4*math.cos(angle+.18),15.4*math.sin(angle+.18),1.4,2,2,2)

def mesh_for(name):
    vertices,faces,slots=[],[],[]
    for piece in recipes[name]:
        shape=piece["outline"]
        n=len(shape)
        start=len(vertices)
        for x,y,z,w,d in piece["rings"]:
            vertices.extend([(x+u*w,y+v*d,z) for u,v in shape])
        end=len(vertices)-n
        polys=[tuple(reversed(range(start,start+n)))]
        for ring in range(len(piece["rings"])-1):
            k=start+ring*n
            polys.extend([(k+i,k+(i+1)%n,k+(i+1)%n+n,k+i+n) for i in range(n)])
        polys.append(tuple(range(end,end+n)))
        faces.extend(polys)
        slots.extend([list(palette).index(piece["material"])]*len(polys))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    for mat in materials.values():
        mesh.materials.append(mat)
    for face,slot in zip(mesh.polygons,slots):
        face.material_index=slot
    mesh.update()
    return mesh

slab("plaza","ground",0,0,-2,220,220,2,square)
meshes={name:mesh_for(name) for name in recipes}
def place(name,loc,scale=(1,1,1),yaw=0):
    obj=bpy.data.objects.new(name,meshes[name])
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.scale=scale
    obj.rotation_euler.z=yaw
    return obj

place("plaza",(0,0,0))
for name,x,y,h,s in [
    ("moonGate",0,42,1.4,1.5),("lanternCourt",-65,-32,1.1,1.1),
    ("foldedFan",67,42,1.62,1.12),("terraceOrchard",65,-32,.88,1.25),
    ("needleExchange",-65,45,1.55,1),("terraceOrchard",-72,86,.83,.84),
    ("lanternCourt",66,84,1.02,.85),("foldedFan",77,-83,.6,.7)]:
    place(name,(x,y,0),(s,s,h))
# Keep an editable metre-based span controller on each deck in the blend.
# The glTF exporter evaluates it to ordinary triangles at the chosen span.
truss = bpy.data.node_groups.new("Viaduct span in metres", "GeometryNodeTree")
truss.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
truss.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
dimensions = []
for label, nominal in [("Length",40),("Deck width",6),("Arch rise",6)]:
    socket = truss.interface.new_socket(name=label, in_out="INPUT", socket_type="NodeSocketFloat")
    socket.default_value = nominal
    socket.min_value = .1
    dimensions.append((socket.identifier,nominal))
inputs = truss.nodes.new("NodeGroupInput")
inputs.location = (-500,120)
outputs = truss.nodes.new("NodeGroupOutput")
outputs.location = (360,120)
combine = truss.nodes.new("ShaderNodeCombineXYZ")
combine.location = (-50,-60)
transform = truss.nodes.new("GeometryNodeTransform")
transform.location = (160,120)
for axis,(_,nominal) in enumerate(dimensions):
    divide = truss.nodes.new("ShaderNodeMath")
    divide.operation = "DIVIDE"
    divide.inputs[1].default_value = nominal
    divide.location = (-270,-axis*150)
    truss.links.new(inputs.outputs[axis+1],divide.inputs[0])
    truss.links.new(divide.outputs[0],combine.inputs[axis])
truss.links.new(inputs.outputs["Geometry"],transform.inputs["Geometry"])
truss.links.new(combine.outputs[0],transform.inputs["Scale"])
truss.links.new(transform.outputs["Geometry"],outputs.inputs["Geometry"])
for location,length,yaw in [((-40.5,42,65),49,0),((33.5,42,110),67,0),((66,5,51),74,math.pi/2)]:
    obj = place("span",location,yaw=yaw)
    modifier = obj.modifiers.new("Viaduct dimensions","NODES")
    modifier.node_group = truss
    length_input = getattr(modifier.properties.inputs, dimensions[0][0])
    length_input.value = float(length)
place("skyGarden",(-35,-72,131))
station=place("orbit",(8,-39,65))
station.rotation_euler.x=math.radians(70)
for frame in [1,97,193]:
    station.rotation_euler.z=(frame-1)*math.tau/192
    station.keyframe_insert(data_path="rotation_euler",frame=frame)
scene.frame_set(1)
scene["generator"]="Skimmer-Scraper district 0.7.0 / AGPL-3.0-only"
bpy.ops.export_scene.gltf(filepath=str(ART/"district.glb"),export_format="GLB",export_yup=True,export_apply=True)
# The same rings are the editable geometric contract for the streamer.
(ART/"profiles.json").write_text(json.dumps({k:v for k,v in recipes.items() if k!="plaza"},separators=(",",":"))+"\n")

world=bpy.data.worlds.new("Apricot haze")
scene.world=world
world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.66,.34,.44,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.85
def sunlight(name,angle,energy,color):
    bpy.ops.object.light_add(type="SUN",rotation=angle)
    obj=bpy.context.object
    obj.name=name
    obj.data.energy=energy
    obj.data.angle=.16
    obj.data.color=color
sunlight("West sun",(.65,-.9,-.4),3.8,(1,.75,.56))
sunlight("Sky fill",(-.7,1.4,.3),1.5,(.57,.83,1))
bpy.ops.object.camera_add()
cam=bpy.context.object
scene.camera=cam
scene.render.engine="CYCLES"
scene.cycles.samples=6
scene.cycles.use_denoising=True
scene.render.resolution_x=960
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="JPEG"
scene.render.image_settings.quality=88
views=[("overlook",(203,-305,193),(0,7,73),34),("low",(0,-110,24),(0,48,66),25),
       ("roof",(-87,-111,148),(-28,-45,120),29),("plan",(0,-24,385),(0,0,0),28)]
for i,(name,eye,target,lens) in enumerate(views):
    cam.location=eye
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.lens=lens
    if i==0:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(ART/"district.blend"),compress=True)
    scene.render.filepath=str(EVIDENCE/(name+".jpg"))
    bpy.ops.render.render(write_still=True)

