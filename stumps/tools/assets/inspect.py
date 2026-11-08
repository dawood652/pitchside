import bpy, sys
fbx = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
for o in bpy.data.objects:
    print(o.type, o.name, [round(x, 3) for x in o.dimensions], o.scale[:])
    if o.type == 'ARMATURE':
        print(' bones', len(o.data.bones), [b.name for b in o.data.bones][:80])
    if o.type == 'MESH':
        print(' verts', len(o.data.vertices), 'polys', len(o.data.polygons), 'mats', [m.name for m in o.data.materials], 'vgroups', len(o.vertex_groups))
for m in bpy.data.materials:
    imgs = [n.image.filepath for n in (m.node_tree.nodes if m.node_tree else []) if n.type == 'TEX_IMAGE' and n.image]
    print('mat', m.name, imgs)
print('actions', [(a.name, a.frame_range[:]) for a in bpy.data.actions])
