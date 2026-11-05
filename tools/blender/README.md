# Hero product models

Generate review candidates with the installed Blender Python runtime:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --threads 4 --python-exit-code 1 --python tools/blender/make_models.py
```

The default output is `tools/shots/hero-models/` (ignored by Git). It contains
packed editable `.blend` files, `.glb` exports and a reference manifest. Inspect
the exported GLBs before copying them to `web/public/models/`. Only those web
exports belong in the storefront build.

The models use the existing product photography, with no automatic preference
for AI upscales. Etna uses the unchanged original JPEG and the native contour in
`etna-contour.json`; `build_etna_reference.py` creates its matching SVG fallback.
This contour excludes the old bokeh fragments and the white banner below the base.
Candele uses the complete first photo,
rather than the cropped second photo. Round products follow both silhouette
edges; the packages use continuous labels and shallow relief across the tubes.
The smoke pull ring and cake fixing spikes follow their additional originals.

Candele has a back photograph. Bengala's back is a partial close-up: its intact
label is placed in the corresponding band, with plain estimated paper outside
that band. The other products have no complete back reference. All depths and
unseen surfaces are estimates; these are photograph-referenced reconstructions,
not measured scans. `model-references.json` records the shipped references.

The hero displays Candele as a photograph, as selected by the owner. The other
four products load their 3D models after the intro and access gate. The source
photographs and review renders are local working assets. The site's existing
processed images remain unchanged.
