"""Give an AI-upscaled product photo (assets/upscaled/<handle>.png, white background) the transparency of its
original cut-out, so the sharper photo can replace the cut-out as a model texture.

The upscale input was the cut-out cropped to its box, scaled so the long side is 900 px and centred on a 1024 px
white square; the same placement of the cut-out's alpha, scaled to the upscale's size, is its mask (slightly
eroded, so no white fringe survives). Writes assets/upscaled/<handle>-cut.png.
"""
import sys
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
for handle, n in [a.split(":") for a in sys.argv[1:]]:
    cut = Image.open(ROOT / "assets" / "processed" / handle / f"{n}.webp").convert("RGBA")
    cut = cut.crop(cut.getbbox())
    s = 900 / max(cut.size)
    cut = cut.resize((max(1, int(cut.width * s)), max(1, int(cut.height * s))), Image.LANCZOS)
    canvas = Image.new("L", (1024, 1024), 0)
    canvas.paste(cut.getchannel("A"), ((1024 - cut.width) // 2, (1024 - cut.height) // 2))
    up = Image.open(ROOT / "assets" / "upscaled" / f"{handle}.png").convert("RGB")
    mask = canvas.resize(up.size, Image.LANCZOS).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    out = up.copy(); out.putalpha(mask)
    out = out.crop(out.getbbox())
    out.save(ROOT / "assets" / "upscaled" / f"{handle}-cut.png")
    print(handle, out.size)
