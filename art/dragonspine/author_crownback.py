"""Build Crownback in metres. Run Blender --background --python author_crownback.py."""
from pathlib import Path
from math import cos, pi, sin
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "realms" / "ascendant"
ASSETS.mkdir(exist_ok=True)
# Y points aft. A negative Y snout points along +Z in the game.
BONES = {
    "Chest": ((0, 0, 0), (0, -28, 2), None),
    "Neck": ((0, -28, 2), (0, -75, 14), "Chest"),
    "Crown": ((0, -75, 14), (0, -114, 15), "Neck"),
    "Tail": ((0, 26, 0), (0, 81, 5), "Chest"),
    "Fan": ((0, 81, 5), (0, 144, 13), "Tail"),
}
for sign, side in [(-1, "Port"), (1, "Starboard")]:
    BONES[side] = ((sign*12, -15, 6), (sign*99, -38, 24), "Chest")
    BONES[side+"Hand"] = ((sign*99, -38, 24), (sign*228, 18, 6), side)

PALETTE = [
    ("Pelagic jade", (.037, .19, .19), .19),
    ("Oxidized ridge", (.12, .36, .31), .3),
    ("Horn ivory", (.89, .68, .37), .23),
    ("Cinnabar sails", (.52, .105, .055), .12),
    ("Madder in shadow", (.26, .045, .063), .07),
    ("Luminous iris", (.45, .98, .76), .14),
]

class Hide:
    def __init__(self, sides):
        self.vertices, self.faces, self.colors, self.weights = [], [], [], []
        self.sides = sides

    def vertex(self, pos, bone):
        self.vertices.append(tuple(pos))
        weights = {bone: 1} if isinstance(bone, str) else bone
        # The two surfaces meeting at each finger use the same skinning field.
        if any(name.startswith(("Port", "Starboard")) for name in weights):
            x = abs(pos[0])
            side = "Port" if pos[0] < 0 else "Starboard"
            shoulder = min(1, max(0, (x-11)/17))
            wrist = min(1, max(0, (x-75)/40))
            weights = {"Chest":1-shoulder, side:shoulder*(1-wrist), side+"Hand":shoulder*wrist}
        self.weights.append(weights)
        return len(self.vertices)-1

    def face(self, verts, color):
        self.faces.append(verts)
        self.colors.append(color)

    def spine(self, rings, color):
        previous = None
        for y,z,rx,rz,bone in rings:
            ring = [self.vertex((rx*cos(i*2*pi/self.sides), y,
                                 z+rz*sin(i*2*pi/self.sides)), bone) for i in range(self.sides)]
            if previous:
                for i in range(self.sides):
                    j = (i+1) % self.sides
                    self.face((previous[i], ring[i], ring[j], previous[j]), color)
            else:
                self.face(tuple(reversed(ring)), color)
            previous = ring
        self.face(tuple(previous), color)

    def horn(self, a, b, base, tip, color, bone, end_bone=None):
        a,b = Vector(a),Vector(b)
        direction=(b-a).normalized()
        u=direction.orthogonal().normalized()
        v=direction.cross(u)
        rings=[]
        count=max(4,self.sides//2)
        for point, radius, owner in [(a,base,bone),(b,tip,end_bone or bone)]:
            rings.append([self.vertex(point+radius*(u*cos(i*2*pi/count)+v*sin(i*2*pi/count)),owner)
                          for i in range(count)])
        for i in range(count):
            j=(i+1)%count
            self.face((rings[0][i],rings[0][j],rings[1][j],rings[1][i]),color)
        self.face(tuple(reversed(rings[0])),color)
        self.face(tuple(rings[1]),color)

    def sail(self, wrist, a, b, bone, divisions, inner=None):
        # Broad finger bays have a concave trailing edge and a cambered centre.
        wrist,a,b=map(Vector,(wrist,a,b))
        apex=self.vertex(wrist,bone)
        previous=None
        for i in range(1, divisions+1):
            t=i/divisions
            row=[]
            for j in range(divisions+1):
                s=j/divisions
                p=wrist.lerp(a.lerp(b,s), t)
                p.z += sin(pi*s)*sin(pi*t)*5
                p.y -= sin(pi*s)*t*t*7
                weights=bone
                if inner:
                    w=t*s
                    weights={bone:1-w,inner:w}
                row.append(self.vertex(p, weights))
            for j in range(divisions):
                color=4 if i==divisions and divisions>2 else 3
                if previous:
                    self.face((previous[j],row[j],row[j+1],previous[j+1]),color)
                else:
                    self.face((apex,row[j],row[j+1]),color)
            previous=row

def sculpt(detail):
    skin=Hide((8,12,20)[detail])
    skin.spine([(-118,14,1.8,1.1,"Crown"),(-110,15,8,3.2,"Crown"),
                (-94,18,13,8,"Crown"),(-80,15,8,7,"Crown"),
                (-74,14,6,6,{"Crown":.5,"Neck":.5}),(-51,9,8,7,"Neck"),
                (-29,4,13,10,{"Chest":.5,"Neck":.5}),(-11,1,17,14,"Chest"),
                (12,-1,16,12,"Chest"),(27,0,12,9,{"Chest":.5,"Tail":.5}),
                (55,3,8,6,"Tail"),(82,5,5,4,{"Tail":.5,"Fan":.5}),
                (114,9,3.3,2.2,"Fan"),(148,12,1,.5,"Fan")],0)
    # Three ranks of backward raked dorsal plates.
    for y in range(-69, 111, (13,8,5)[detail]):
        bone="Neck" if y < -29 else "Chest" if y < 27 else "Tail" if y < 80 else "Fan"
        ridge=15+max(0,-y-30)*.13 if y<27 else 9
        for side in ([-1,0,1] if detail==2 else [0]):
            mantle = .48 + .52 * cos((y+25)*pi/98)**2
            height=(18 if side==0 else 8)*mantle*(.8+.2*sin(y*.28))
            skin.horn((side*5,y,ridge-2),(side*(12+height*.3),y+5+height*.5,ridge+height),2.8,.2,2,bone)
    for sign,side in [(-1,"Port"),(1,"Starboard")]:
        def p(x,y,z): return (sign*x,y,z)
        hand=side+"Hand"
        root, elbow, wrist=p(12,-15,6),p(54,0,16),p(99,-38,24)
        skin.horn(root,elbow,8,5.2,0,side)
        skin.horn(elbow,wrist,5.3,4.2,1,side,hand)
        tips=[p(228,18,6),p(203,49,2),p(151,77,-1),p(95,79,-4),p(46,62,-2),p(13,27,1)]
        skin.face(tuple(skin.vertex(point,side) for point in (root,elbow,wrist)),3)
        skin.sail(wrist,root,tips[-1],side,(2,4,8)[detail],"Chest")
        for i,tip in enumerate(tips):
            owner=hand if i<4 else side if i==4 else "Chest"
            skin.horn(wrist,tip,3.1-i*.26,.45,2 if i==0 else 1,hand,owner)
        for i,(a,b) in enumerate(zip(tips,tips[1:])):
            skin.sail(wrist,a,b,hand,(2,4,8)[detail],None if i<3 else side if i==3 else "Chest")
        # Split tail rudder with a swept leading spar.
        skin.sail(p(1,91,7),p(33,143,13),p(1,134,11),"Fan",(2,3,5)[detail])
        skin.horn(p(1,91,7),p(33,143,13),2,.18,2,"Fan")
        for off in (-5,5):
            skin.horn(p(8,-92+off,22),p(25,-55+off,41+off),3.7,.25,2,"Crown")
        skin.horn(p(10.3,-100,19),p(10.5,-96,20),1.9,1.2,5,"Crown")
        for y in (-14,19):
            knee=p(22,y+11,-17)
            ankle=p(18,y+24,-14)
            skin.horn(p(10,y,-4),knee,5,2.7,0,"Chest")
            skin.horn(knee,ankle,3,1.7,1,"Chest")
            for digit in (-1,1):
                skin.horn(ankle,p(18+digit*3,y+30,-17),1.6,.2,2,"Chest")
    return skin

def build(lod,detail):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version=0
    scene=bpy.context.scene
    scene.render.fps=24
    scene.frame_end=193
    rig_data=bpy.data.armatures.new("Crownback bones")
    rig=bpy.data.objects.new("Crownback",rig_data)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name,(head,tail,parent) in BONES.items():
        bone=rig_data.edit_bones.new(name)
        bone.head,bone.tail=head,tail
        if parent: bone.parent=rig_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    skin=sculpt(detail)
    mesh=bpy.data.meshes.new("Crownback "+lod)
    mesh.from_pydata(skin.vertices,[],skin.faces)
    mesh.update()
    obj=bpy.data.objects.new(mesh.name,mesh)
    scene.collection.objects.link(obj)
    for name,rgb,metal in PALETTE:
        mat=bpy.data.materials.new(name)
        mat.diffuse_color=(*rgb,1)
        mat.use_nodes=True
        bsdf=mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value=(*rgb,1)
        bsdf.inputs["Metallic"].default_value=metal
        bsdf.inputs["Roughness"].default_value=.55
        mesh.materials.append(mat)
    for poly,color in zip(mesh.polygons,skin.colors):
        poly.material_index=color
        poly.use_smooth=color in (0,1)
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    groups={k:obj.vertex_groups.new(name=k) for k in BONES}
    for i,weights in enumerate(skin.weights):
        for name,weight in weights.items():
            if weight>0: groups[name].add([i],weight,"REPLACE")
    obj.parent=rig
    arm=obj.modifiers.new("Crownback skin","ARMATURE")
    arm.object=rig
    # Rotate in armature space about the fore-aft axis, also on swept wrist bones.
    from mathutils import Quaternion
    frames=[(1,.0,.0),(31,.32,.17),(60,.48,.26),(77,-.09,.21),
            (97,-.33,-.20),(123,-.04,-.10),(145,0,0),(193,0,0)]
    for frame,shoulder,hand in frames:
        for name in BONES:
            pose=rig.pose.bones[name]
            axis=Vector((0,1,0))
            sign=-1 if name.startswith("Port") else 1
            if name.endswith("Hand"): angle=sign*hand
            elif name in ("Port","Starboard"): angle=sign*shoulder
            else:
                axis=Vector((0,0,1))
                angle=sin((frame-1)*2*pi/192)*{"Fan":.11,"Tail":.065,"Crown":.035,"Neck":.025}.get(name,0)
            local=pose.bone.matrix_local.to_quaternion().inverted() @ axis
            pose.rotation_quaternion=Quaternion(local,angle)
            pose.keyframe_insert(data_path="rotation_quaternion",frame=frame)
    rig.animation_data.action.name="Crownback soaring"
    scene.frame_set(1)
    if lod=="near":
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name("crownback.blend")),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/f"crownback-{lod}.glb"),export_format="GLB",
                              export_animations=True,export_frame_range=True,export_frame_step=4,
                              export_yup=True,export_cameras=False,export_lights=False)

for index, level in enumerate(("far","middle","near")):
    build(level,index)
