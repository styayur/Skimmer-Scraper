"""Build the bronze-crested wyvern. Run with Blender --background --python author_dragon.py."""
from pathlib import Path
from math import sin, cos, pi
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
out = root / "public" / "realms" / "dragonspine"
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, rgb, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = .51
    return m

hide = material("Verdigris scales", (.065,.24,.205), .22)
belly = material("Ivory scutes", (.6,.47,.23))
crest = material("Antique gold", (.65,.32,.065), .48)
membrane = material("Amber wing membrane", (.48,.155,.045), .12)
eye = material("Celadon eye", (.18,.97,.78))
dark = material("Obsidian claw", (.027,.052,.05), .2)

def mesh(name, verts, faces, mat, parent=None):
    data=bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.parent=parent
    data.materials.append(mat)
    return obj

def body(name, sections, mat, parent=None, sides=12):
    # Elliptical sections run from the snout toward the tail.
    verts=[]; faces=[]
    for y,z,w,h in sections:
        verts.extend((w*cos(i*2*pi/sides), y, z+h*sin(i*2*pi/sides)) for i in range(sides))
    for j in range(len(sections)-1):
        for i in range(sides):
            k=j*sides; n=(i+1)%sides
            faces.append((k+i,k+sides+i,k+sides+n,k+n))
    faces.extend([tuple(range(sides)),tuple(reversed(range(len(verts)-sides,len(verts))))])
    obj=mesh(name,verts,faces,mat,parent)
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

def spar(name, a, b, r0, r1, mat, parent=None):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    u=axis.orthogonal().normalized()
    v=axis.cross(u)
    verts=[tuple(p+r*(u*cos(i*pi/4)+v*sin(i*pi/4))) for p,r in [(a,r0),(b,r1)] for i in range(8)]
    faces=[(i,(i+1)%8,8+(i+1)%8,8+i) for i in range(8)]
    faces.extend([tuple(reversed(range(8))),tuple(range(8,16))])
    return mesh(name,verts,faces,mat,parent)

def pivot(name, location, parent=None):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.location=location;obj.parent=parent
    return obj

rig=pivot("DragonRoot",(0,0,0))
body("Chest and haunches",[(-4,.55,.8,.8),(-2,.4,1.8,1.65),(0,0,2.15,1.85),(3,-.1,1.55,1.23),(5,.1,.9,.8)],hide,rig)
body("Serpentine neck",[(-11,2.1,.57,.58),(-8.5,2.2,.75,.75),(-6,1.25,.88,.91),(-3,.6,1.08,1.08)],hide,rig)
body("Crowned head",[(-14.5,1.9,.49,.24),(-13.2,2.03,.72,.5),(-11.9,2.34,1.08,.87),(-10.3,2.15,.72,.58)],hide,rig)
body("Jaw plates",[(-14.3,1.56,.46,.14),(-12.8,1.5,.74,.22),(-11,1.66,.76,.3)],belly,rig)
for side in (-1,1):
    spar("Brow horn",(side*.72,-11.3,2.85),(side*1.86,-8.6,4.65),.32,.025,crest,rig)
    spar("Jaw barb",(side*.84,-11.4,2.05),(side*1.53,-9.6,1.6),.24,.015,belly,rig)
    spar("Luminous eye",(side*.88,-12.18,2.48),(side*.96,-12.54,2.52),.21,.14,eye,rig)
    spar("Swept hindleg",(side*.95,2.6,-.34),(side*2.18,4.0,-1.8),.64,.34,hide,rig)
    spar("Hock",(side*2.18,4,-1.8),(side*1.8,5.9,-1.42),.34,.17,belly,rig)
    for k in range(3):
        spar("Talon",(side*1.8,5.8,-1.42),(side*(1.5+k*.27),6.64,-1.9),.13,.014,dark,rig)
for k in range(14):
    y=-9+k*.95
    z=2.85 if y < -6 else (2.58 if y<2 else 1.4)
    spar("Dorsal vane",(0,y,z-.55),(0,y+.78,z+.77),.32,.02,crest,rig)

tail=pivot("TailBase",(0,4.6,.12),rig)
body("Tapered tail",[(0,0,.98,.84),(3,.1,.83,.65),(6,.3,.55,.4),(9,.75,.36,.31),(13,1.65,.16,.18),(16,2.55,.015,.025)],hide,tail)
for side in (-1,1):
    mesh("Tail fin",[(0,11,1.15),(side*1.8,15,2.2),(0,14.6,2.2)],[(0,1,2),(2,1,0)],crest,tail)

for side,label in [(-1,"Left"),(1,"Right")]:
    wing=pivot(label+"Wing",(side*1.55,-1.55,.67),rig)
    elbow=(side*5.1,.9,1.62)
    wrist=(side*8.65,-2.64,2.18)
    spar(label+" humerus",(0,0,0),elbow,.55,.34,hide,wing)
    spar(label+" leading edge",elbow,wrist,.38,.31,crest,wing)
    tips=[(side*17.4,1.3,.22),(side*14.5,5.8,-.18),(side*10.3,7.85,-.68),(side*5.6,7.3,-.86),(0,4.7,-.48)]
    mesh(label+" inner sail",[(0,0,0),elbow,wrist,tips[-1]],[(0,1,3),(1,2,3)],membrane,wing)
    for i,end in enumerate(tips):
        spar(label+" finger "+str(i),wrist,end,.24,.025,hide,wing)
    verts=[wrist];faces=[]
    for a,b in zip(tips,tips[1:]):
        notch=(.48*a[0]+.52*b[0],(a[1]+b[1])*.5-1,(a[2]+b[2])*.5+.38)
        k=len(verts);verts.extend([a,notch,b])
        faces.extend([(0,k,k+1),(0,k+1,k+2)])
    mesh(label+" scalloped sail",verts,faces,membrane,wing)
    for frame,angle in [(1,.36),(9,-.2),(18,-.59),(29,.08),(37,.36)]:
        wing.rotation_euler.y=side*angle
        wing.keyframe_insert(data_path="rotation_euler",frame=frame)
for frame,angle in [(1,0),(10,.065),(19,0),(28,-.065),(37,0)]:
    tail.rotation_euler.z=angle
    tail.keyframe_insert(data_path="rotation_euler",frame=frame)
scene=bpy.context.scene
scene.render.fps=24;scene.frame_start=1;scene.frame_end=37;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(root/"art/dragonspine/bronze-crest.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"bronze-crest.glb"),export_format="GLB",export_animations=True, export_animation_mode="SCENE",export_yup=True)
