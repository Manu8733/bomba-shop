"""Build the hero products as 3D models in Blender and export them as GLB for the site's 3D set.

Run:  blender --background --factory-startup --python tools/blender/make_models.py

Each model is made from the product's own cut-out photo (assets/processed/<handle>/<n>.webp):
  lathe  a round product (fountain cone, smoke canister): revolved from its silhouette, row by row, around an axis
         found from the left edge (so a side ring or a fuse does not bulge the body)
  tubes  a bundle: N tubes per row, `rows` rows deep; each tube's height from the photo, paper caps and a fuse wick
The photo is projected onto the front, so from the front the model is the photo; a product is 1 unit tall, its
base on the floor (z = 0), facing -Y (glTF +Z, towards the site's camera). Output: web/public/models/<handle>.glb
"""
import json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "models"
PRODUCTS = [
    {"handle": "vulcan-etna", "img": 1, "kind": "lathe", "rough": .55},
    {"handle": "fumigena-portocalie-cu-inel", "img": 1, "kind": "lathe", "rough": .35, "ring": True},
    # back: a real photo of the other side (turned upright with rot90 k); without one the back repeats the front
    {"handle": "candele-romane-30-foc", "img": 2, "kind": "tubes", "n": 6, "rows": 2, "rough": .3, "fuse": True, "back": {"img": 3, "k": -1}},
    {"handle": "bengala-crackling-verde-f1-flacara-verde-intensa-set-6-buc", "img": 1, "kind": "tubes", "n": 6, "rows": 1, "rough": .3},
    {"handle": "artificii-tort-30cm-set-4-bucati-ardere-120-secunde", "img": 1, "kind": "tubes", "n": 4, "rows": 1, "rough": .45},
]


def load(handle, n):
    path = ROOT / "assets" / "processed" / handle / f"{n}.webp"
    img = bpy.data.images.load(str(path))
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1]  # top row first
    a = px[:, :, 3]
    ys, xs = np.where(a > .55)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return img, px, a, box


def load_back(handle, spec):
    """the other side, from a photo shot lying down: rotated upright and cropped to the product"""
    path = ROOT / "assets" / "processed" / handle / f"{spec['img']}.webp"
    src = bpy.data.images.load(str(path)); W, H = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(H, W, 4)          # bottom row first (Blender order)
    px = np.rot90(px, k=-spec["k"])                                           # rot90 on bottom-first rows turns the other way
    h, w = px.shape[:2]
    img = bpy.data.images.new(f"{handle}-back", w, h, alpha=True)
    img.pixels = px.ravel().tolist(); img.pack()
    a = px[::-1, :, 3]; ys, xs = np.where(a > .55)
    return img, (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def material(name, img, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.extension = "EXTEND"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    return m


def flat(name, rgb, rough=.8, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m


def project_uv(bm, W, H, box, cx, hb, dx=0.0):
    """front projection: the vertex at (x, z) shows the photo pixel straight in front of it"""
    uv = bm.loops.layers.uv.verify()
    x0, y0, x1, y1 = box
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            u = (cx + (co.x + dx) * hb) / W
            v = 1 - (y0 + (1 - co.z) * hb) / H
            l[uv].uv = (min(1, max(0, u)), min(1, max(0, v)))


def lathe(p, img, a, box):
    W, H = img.size; x0, y0, x1, y1 = box; hb = y1 - y0
    rows = 120
    left = []
    for k in range(rows + 1):
        y = min(y1 - 1, int(round(y0 + (y1 - y0) * k / rows)))
        xs = np.where(a[y, x0:x1] > .55)[0]
        left.append(x0 + xs[0] if len(xs) else None)
    # the axis: the middle of the body, from the widest stable rows (centre of left..right of the lower half)
    mids = []
    for k in range(rows // 2, rows):
        y = int(round(y0 + (y1 - y0) * k / rows)); xs = np.where(a[y, x0:x1] > .55)[0]
        if len(xs): mids.append(x0 + (xs[0] + xs[-1]) / 2)
    cx = float(np.median(mids))
    rad = np.array([max(.002, (cx - l) / hb) if l is not None else .002 for l in left])
    rad = np.convolve(np.pad(rad, 2, mode="edge"), np.ones(5) / 5, mode="valid") * .99
    seg = 96
    bm = bmesh.new()
    ringv = []
    for k in range(rows + 1):
        z = 1 - k / rows; r = rad[k]
        ringv.append([bm.verts.new((r * math.sin(2 * math.pi * s / seg), -r * math.cos(2 * math.pi * s / seg), z)) for s in range(seg)])
    for k in range(rows):
        for s in range(seg):
            a1, b1 = ringv[k][s], ringv[k][(s + 1) % seg]; a2, b2 = ringv[k + 1][s], ringv[k + 1][(s + 1) % seg]
            bm.faces.new((a1, b1, b2, a2))
    bm.faces.new(list(reversed(ringv[0]))); bm.faces.new(ringv[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    project_uv(bm, W, H, box, cx, hb)
    me = bpy.data.meshes.new(p["handle"]); bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(p["handle"], me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material(p["handle"] + "-skin", img, p["rough"]))
    parts = [ob]
    if p.get("ring"):  # the pull ring of a smoke grenade: find it in the photo, right of the body near the top
        right = []
        for k in range(rows // 3):
            y = int(round(y0 + (y1 - y0) * k / rows)); xs = np.where(a[y, x0:x1] > .55)[0]
            if len(xs): right.append((k, (x0 + xs[-1] - cx) / hb - rad[k]))
        k, out = max(right, key=lambda t: t[1])
        if out > .015:
            bpy.ops.mesh.primitive_torus_add(major_radius=out * .55, minor_radius=.006, major_segments=48, minor_segments=10,
                location=(rad[k] + out * .5, 0, 1 - k / rows), rotation=(math.pi / 2, 0, 0))
            ring = bpy.context.active_object; ring.data.materials.append(flat("ring", (.75, .76, .78), .25, 1)); parts.append(ring)
    return parts


def tubes(p, img, a, box):
    W, H = img.size; x0, y0, x1, y1 = box; hb = y1 - y0
    n, rows = p["n"], p["rows"]; pw = (x1 - x0) / n; cx = (x0 + x1) / 2; r = pw / 2 / hb * .97
    skin = material(p["handle"] + "-skin", img, p["rough"])
    back = None
    if p.get("back"):
        bimg, bbox = load_back(p["handle"], p["back"])
        back = (material(p["handle"] + "-back", bimg, p["rough"]), bimg, bbox)
    parts = []
    # the sticks of one pack are the same length: measure each top in the photo, then use the tallest common one
    # (a wrapper or a shadow in the photo makes single tubes look shorter, which read as a staircase)
    tops = []
    for k in range(n):
        tx0 = x0 + pw * k
        band = a[:, int(tx0 + pw * .3):int(tx0 + pw * .7)]
        filled = np.where((band > .55).mean(axis=1) > .6)[0]
        tops.append(int(filled[0]) if len(filled) else y0)
    h = (y1 - float(np.percentile(tops, 25))) / hb
    for row in range(rows):
        for k in range(n):
            tx0 = x0 + pw * k
            xc = (tx0 + pw / 2 - cx) / hb + (r if row % 2 else 0)
            yc = row * r * 1.75
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=40, radius1=r, radius2=r, depth=h)
            bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
            project_uv(bm, W, H, box, cx, hb, dx=xc)
            if back:  # faces turned away from the camera show the real back, seen mirrored as from behind
                _, bimg, (bx0, by0, bx1, by1) = back; BW, BH = bimg.size; bhb = (by1 - by0) / h; bcx = (bx0 + bx1) / 2
                uvl = bm.loops.layers.uv.verify()
                for f in bm.faces:
                    if f.normal.y > .05 and abs(f.normal.z) < .5:
                        f.material_index = 1
                        for l in f.loops:
                            co = l.vert.co
                            l[uvl].uv = (min(1, max(0, (bcx - (co.x + xc) * bhb) / BW)), min(1, max(0, 1 - (by1 - co.z * bhb) / BH)))
            me = bpy.data.meshes.new(f"{p['handle']}-{row}-{k}"); bm.to_mesh(me); bm.free()
            for poly in me.polygons: poly.use_smooth = abs(poly.normal.z) < .5
            ob = bpy.data.objects.new(me.name, me); ob.location = (xc, yc, 0); bpy.context.collection.objects.link(ob)
            ob.data.materials.append(skin)
            if back: ob.data.materials.append(back[0])
            parts.append(ob)
            if p.get("fuse") and row == 0:  # a short green fuse wick sticking out of the top
                bpy.ops.mesh.primitive_cylinder_add(radius=r * .12, depth=.035, location=(xc, yc, h + .016), vertices=8)
                f = bpy.context.active_object; f.rotation_euler = (0.25 * (k % 2 * 2 - 1), 0, 0)
                f.data.materials.append(flat("fuse", (.12, .45, .2), .7)); parts.append(f)
    return parts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    for p in PRODUCTS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        img, px, a, box = load(p["handle"], p["img"])
        parts = lathe(p, img, a, box) if p["kind"] == "lathe" else tubes(p, img, a, box)
        bpy.ops.object.select_all(action="DESELECT")
        for o in parts: o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        out = OUT / f"{p['handle']}.glb"
        bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_image_format="WEBP",
            export_apply=True, export_yup=True, export_materials="EXPORT")
        report[p["handle"]] = {"bytes": out.stat().st_size, "parts": len(parts), "box": box}
    print("MODELS " + json.dumps(report))


main()
