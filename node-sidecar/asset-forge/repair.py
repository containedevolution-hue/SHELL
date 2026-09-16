"""Headless, conservative GLB repair for Media Lab 3D Assets."""

import argparse
import json
import os
import sys

import bmesh
import bpy


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--normals", default="1")
    parser.add_argument("--smooth", default="1")
    parser.add_argument("--merge", default="0")
    parser.add_argument("--loose", default="0")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def repair_mesh(obj, options):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    before = (len(bm.verts), len(bm.edges), len(bm.faces))

    if options.merge == "1":
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)

    if options.loose == "1":
        loose = [vert for vert in bm.verts if not vert.link_edges and not vert.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")

    if options.normals == "1" and bm.faces:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    if options.smooth == "1":
        for polygon in mesh.polygons:
            polygon.use_smooth = True

    after = (len(mesh.vertices), len(mesh.edges), len(mesh.polygons))
    return {"object": obj.name, "before": before, "after": after}


def main():
    options = arguments()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(options.input))

    repaired = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            repaired.append(repair_mesh(obj, options))

    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(options.output),
        export_format="GLB",
        export_apply=False,
        export_animations=True,
    )
    with open(options.report, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "meshes": repaired,
                "normals": options.normals == "1",
                "smooth": options.smooth == "1",
                "merge": options.merge == "1",
                "loose": options.loose == "1",
            },
            handle,
            indent=2,
        )


if __name__ == "__main__":
    main()
