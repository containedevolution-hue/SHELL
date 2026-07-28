"""Open a Media Lab GLB as a named, non-destructive Blender working copy."""

import argparse
import json
import os
import sys

import bpy


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--manifest", required=True)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def mesh_by_name(name):
    direct = bpy.data.objects.get(name or "")
    if direct and direct.type == "MESH":
        return direct
    lowered = str(name or "").lower()
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name.lower() == lowered),
        None,
    )


def connected_polygon_indexes(mesh, seed):
    if seed is None or seed < 0 or seed >= len(mesh.polygons):
        return []
    by_vertex = {}
    for polygon in mesh.polygons:
        for vertex in polygon.vertices:
            by_vertex.setdefault(vertex, []).append(polygon.index)
    selected = {seed}
    stack = [seed]
    while stack:
        current = stack.pop()
        for vertex in mesh.polygons[current].vertices:
            for neighbor in by_vertex.get(vertex, []):
                if neighbor not in selected:
                    selected.add(neighbor)
                    stack.append(neighbor)
    return selected


def apply_selection(manifest):
    selection = manifest.get("selection") or {}
    obj = mesh_by_name(selection.get("objectName"))
    if not obj:
        obj = next((item for item in bpy.context.scene.objects if item.type == "MESH"), None)
    if not obj:
        return

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mode = selection.get("mode")
    if mode == "object" or not mode:
        return

    for polygon in obj.data.polygons:
        polygon.select = False

    indexes = set()
    if mode == "material":
        material_index = int(selection.get("materialIndex") or 0)
        indexes = {polygon.index for polygon in obj.data.polygons if polygon.material_index == material_index}
    elif mode == "surface":
        indexes = connected_polygon_indexes(obj.data, selection.get("seedFace"))
    elif mode == "faces":
        indexes = {
            int(index)
            for index in (selection.get("faceIndexes") or [])
            if isinstance(index, int) and 0 <= index < len(obj.data.polygons)
        }

    for index in indexes:
        obj.data.polygons[index].select = True
    if indexes:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="FACE")


def main():
    options = arguments()
    with open(options.manifest, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(options.input))

    text = bpy.data.texts.get("CE_SELECTION.json") or bpy.data.texts.new("CE_SELECTION.json")
    text.clear()
    text.write(json.dumps(manifest, indent=2))

    scene = bpy.context.scene
    scene["ce_asset_source"] = os.path.abspath(options.input)
    scene["ce_asset_manifest"] = os.path.abspath(options.manifest)
    scene["ce_workflow"] = "Media Lab Power Edit"
    apply_selection(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(options.blend))


if __name__ == "__main__":
    main()
