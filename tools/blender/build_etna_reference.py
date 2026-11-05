"""Clip the unchanged reference JPEG with the same native contour used by Blender.

This builds an SVG, without resampling, retouching or reconstructing label pixels.
Run from the repository: python tools/blender/build_etna_reference.py
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
contour = json.loads((ROOT / 'tools/blender/etna-contour.json').read_text(encoding='utf-8'))
x0, y0, x1, y1 = contour['box']
width, height = x1 - x0, y1 - y0
points = [(x, y) for y, x in contour['left']] + [(x, y) for y, x in reversed(contour['right'])]
path = 'M' + ' L'.join(f'{x} {y}' for x, y in points) + ' Z'
encoded = base64.b64encode((ROOT / contour['original']).read_bytes()).decode('ascii')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs><clipPath id="product"><path d="{path}"/></clipPath></defs>
<g clip-path="url(#product)"><image x="{-x0}" y="{-y0}" width="1200" height="900" href="data:image/jpeg;base64,{encoded}"/></g></svg>'''
out = ROOT / 'web/public/images/products/vulcan-etna/hero-traced.svg'
out.write_text(svg, encoding='utf-8')
print(f'{out.name}: {width}x{height}, original JPEG preserved')
