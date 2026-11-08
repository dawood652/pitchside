# Blender (bpy) build step: Microsoft Rocketbox avatars (MIT) -> web-ready GLBs.
#   avatar <rocketbox avatar dir> <out.glb>       mesh + skeleton, textures relinked and shrunk to 1024 JPEG
#   anims  <avatar dir> <out.glb> <anim.fbx>...   skeleton only + one clip per FBX (in-place versions)
import bpy, sys, os

args = sys.argv[sys.argv.index('--') + 1:]
mode, src, out = args[0], args[1], args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
name = os.path.basename(src.rstrip('/'))
bpy.ops.import_scene.fbx(filepath=os.path.join(src, 'Export', name + '.fbx'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o)

if mode == 'avatar':
    tex = os.path.join(src, 'Textures')
    for img in bpy.data.images:
        base = os.path.basename(img.filepath)
        p = os.path.join(tex, base)
        if not os.path.exists(p):
            continue
        img.filepath = p
        img.reload()
        size = 512 if 'opacity' in base else 1024
        if img.size[0] > size:
            img.scale(size, size)
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nodes = m.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        # glTF has no specular-colour map: drop it, use a cloth/skin roughness instead
        for n in list(nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'specular' in n.image.name:
                nodes.remove(n)
        bsdf.inputs['Roughness'].default_value = 0.55 if 'head' in m.name else 0.8
        bsdf.inputs['Metallic'].default_value = 0.0
        if 'opacity' in m.name:
            m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_image_format='JPEG',
                              export_jpeg_quality=86, export_skins=True, export_yup=True, export_apply=False)
else:
    # Animation FBXs can carry their own bind pose (the crouch file's rest IS a crouch), so copy each
    # frame's pose in armature space onto our skeleton instead of reusing the raw F-curves.
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    arm.animation_data_create()
    depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
    levels = {}
    for b in arm.pose.bones:
        levels.setdefault(depth(b), []).append(b.name)
    for b in arm.pose.bones:
        b.rotation_mode = 'QUATERNION'
    scene = bpy.context.scene
    for spec in args[3:]:
        fbx, _, maxf = spec.partition('@')
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=fbx)
        src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE' and o.name.startswith('Bip01') and 'Footsteps' not in o.name)
        clip = os.path.basename(fbx).split('.')[0]
        act = bpy.data.actions.new(clip)
        arm.animation_data.action = act
        f0, f1 = (int(x) for x in src.animation_data.action.frame_range)
        if maxf:
            f1 = min(f1, f0 + int(maxf))
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            for lv in sorted(levels):
                for n in levels[lv]:
                    if n in src.pose.bones:
                        arm.pose.bones[n].matrix = src.pose.bones[n].matrix.copy()
                bpy.context.view_layer.update()
            for b in arm.pose.bones:
                b.keyframe_insert('rotation_quaternion', frame=f - f0 + 1)
            arm.pose.bones['Bip01 Pelvis'].keyframe_insert('location', frame=f - f0 + 1)
        tr = arm.animation_data.nla_tracks.new()
        tr.name = clip
        st = tr.strips.new(clip, 1, act)
        try:
            st.action_slot = act.slots[0]
        except Exception:
            pass
        arm.animation_data.action = None
        for o in set(bpy.data.objects) - before:
            bpy.data.objects.remove(o)
        print('clip', clip, f0, f1)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_skins=True, export_yup=True, export_force_sampling=True, export_frame_step=1)
print('wrote', out, os.path.getsize(out))
