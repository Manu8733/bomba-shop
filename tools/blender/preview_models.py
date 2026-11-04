"""Render each exported GLB from the front and from 35 degrees, to check the models before they go on the site.

Run:  blender --background --factory-startup --python tools/blender/preview_models.py -- <outDir>
"""
import math, sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
for glb in sorted((ROOT / "web" / "public" / "models").glob("*.glb")):
    for angle in (0, 35):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(glb))
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.device = "CPU"
        sc.render.resolution_x, sc.render.resolution_y = 360, 480
        sc.world = bpy.data.worlds.new("w"); sc.world.color = (.02, .02, .025)
        bpy.ops.mesh.primitive_plane_add(size=8)  # floor
        bpy.ops.object.light_add(type="AREA", location=(-1.2, -2, 2.2)); k = bpy.context.active_object; k.data.energy = 220; k.data.size = 2
        k.rotation_euler = (math.radians(50), 0, math.radians(-30))
        bpy.ops.object.light_add(type="AREA", location=(1.5, 1.5, 1.5)); r = bpy.context.active_object; r.data.energy = 120
        r.rotation_euler = (math.radians(-60), 0, math.radians(140))
        a = math.radians(angle); d = 3.4
        bpy.ops.object.camera_add(location=(d * math.sin(a), -d * math.cos(a), .75), rotation=(math.radians(84), 0, a))
        sc.camera = bpy.context.active_object; sc.camera.data.lens = 50
        sc.render.filepath = str(out / f"{glb.stem}-{angle}.png")
        bpy.ops.render.render(write_still=True)
print("PREVIEW_DONE")
