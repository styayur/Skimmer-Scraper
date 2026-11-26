"""Rebuild both metre-scale flight presets with Blender --background --python."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

art = Path(__file__).resolve().parent
public = art.parents[1] / 'public' / 'aircraft'
public.mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

def material(name, color, metallic=0.15):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = 0.33
    return m

def oval(name, center, radius, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=center)
    obj = bpy.context.object
    obj.name, obj.scale = name, radius
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def strut(name, a, b, radius, mat):
    a, b = Vector(a), Vector(b)
    ob = oval(name, (a+b)/2, (radius, radius, (b-a).length/2+radius*0.5), mat)
    ob.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()

def panel(name, outline, height, mat):
    n = len(outline)
    verts = list(outline) + [(x,y,z-height) for x,y,z in outline]
    faces = [tuple(range(n)), tuple(reversed(range(n, 2*n)))]
    faces += [(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(topology, faces=topology.faces[:])
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    bevel = ob.modifiers.new('Bound seam', 'BEVEL')
    bevel.width, bevel.segments = height*0.28, 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)

def build(code):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shell = material('Bone ceramic', (.76,.79,.67))
    fabric = material('Petrol weave', (.028,.17,.18))
    frame = material('Graphite titanium', (.052,.078,.095), .7)
    glass = material('Smoked amber visor', (.37,.12,.036), .72)
    trim = material('Vermilion stitch', (.94,.17,.048))
    if code == 'kite-w':
        oval('Pressure jacket',(0,.08,0),(.28,.45,.16),fabric)
        oval('Sealed helmet',(0,.55,.07),(.155,.18,.17),shell)
        oval('Visor',(0,.65,.09),(.148,.10,.11),glass)
        oval('Dorsal impeller',(0,-.02,.14),(.20,.34,.11),frame)
        for sign in (-1,1):
            def side(x,y,z): return (x*sign,y,z)
            strut('Upper sleeve',side(.2,.3,0),side(.56,.23,-.02),.10,fabric)
            strut('Gauntlet',side(.55,.23,-.02),side(.86,.30,0),.077,shell)
            strut('Thigh',side(.12,-.22,0),side(.23,-.65,.01),.125,fabric)
            strut('Boot',side(.23,-.65,.01),side(.31,-1.14,.05),.092,frame)
            panel('Arm membrane',[side(.15,.17,0),side(.84,.29,0),side(2.90,-.12,.06),
                side(2.13,-.43,-.015),side(.34,-.85,0)],.038,fabric)
            strut('Deployable carbon spar',side(.77,.28,.02),side(2.88,-.12,.06),.043,shell)
            strut('Tip signal',side(2.5,-.05,.06),side(2.88,-.12,.06),.047,trim)
            panel('Leg membrane',[side(.05,-.26,0),side(.27,-1.08,.02),side(.02,-.89,.01)],.025,fabric)
    else:
        oval('Pressure hull',(0,.05,0),(.83,2.60,.48),shell)
        oval('Navigation blister',(0,.82,.27),(.58,1.16,.36),glass)
        oval('Ventral keel',(0,-.25,-.3),(.43,1.94,.27),frame)
        for sign in (-1,1):
            def side(x,y,z): return (x*sign,y,z)
            panel('Swept radiator',[side(.44,1.1,0),side(1.98,-1.11,-.07),
                side(1.77,-1.73,-.03),side(.54,-1.38,.05)],.12,fabric)
            oval('Gimballed nacelle',side(.79,-1.35,.05),(.34,1.01,.32),frame)
            oval('Aft nozzle collar',side(.79,-2.12,.05),(.28,.26,.26),trim)
            oval('Exhaust throat',side(.79,-2.29,.05),(.19,.12,.17),frame)
            panel('Thruster vane',[side(.71,-.65,.22),side(.91,-1.76,.80),
                side(.78,-2.07,.56)],.09,shell)
    meshes = list(bpy.context.scene.objects)
    for ob in meshes: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(public/(code+'.glb')),export_format='GLB',use_selection=True)
    scene=bpy.context.scene
    bpy.ops.object.camera_add(location=(4.4,5.8,4.2))
    camera=bpy.context.object
    camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=7.1
    scene.camera=camera
    scene.render.engine='BLENDER_WORKBENCH'
    scene.display.shading.color_type='MATERIAL'
    scene.display.shading.light='STUDIO'
    scene.display.shading.show_shadows=True
    scene.display.shading.show_cavity=True
    scene.render.resolution_x=800
    scene.render.resolution_y=600
    scene.render.resolution_percentage=100
    scene.render.filepath=str(art/(code+'.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(art/(code+'.blend')),compress=True)
    bpy.ops.render.render(write_still=True)

for preset in ['kite-w','kite-s']:
    build(preset)
