"""Build comparison sheets (original | watermark-free | cut-out on the brand card) for visual review.

Usage: python tools/review_sheet.py OUT.jpg handle/file [handle/file ...]
       python tools/review_sheet.py --log assets/processed/log-files.jsonl OUT.jpg
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
H = 260


def card(cut):
    yy, xx = np.mgrid[0:H, 0:H]
    glow = np.clip(1 - np.hypot((xx - H / 2) / (H * .55), (yy - H) / (H * .5)), 0, 1)[..., None] * .35
    bg = (np.full((H, H, 3), (23, 20, 31), np.float32) * (1 - glow) + np.array([255, 182, 72]) * glow).astype(np.uint8)
    c = Image.fromarray(bg)
    cut = cut.copy()
    cut.thumbnail((int(H * .82), int(H * .82)))
    c.paste(cut, ((H - cut.width) // 2, (H - cut.height) // 2 + 6), cut)
    return c


def row(handle, fname, label=""):
    stem = pathlib.Path(fname).stem
    o = Image.open(ROOT / "assets/originals" / handle / fname).convert("RGB")
    cp = ROOT / "assets/processed" / handle / f"{stem}_clean.jpg"
    wp = ROOT / "assets/processed" / handle / f"{stem}.webp"
    tiles = [o]
    if cp.exists():
        tiles.append(Image.open(cp).convert("RGB"))
    tiles = [t.resize((max(1, int(t.width * H / t.height)), H)) for t in tiles]
    if wp.exists():
        tiles.append(card(Image.open(wp).convert("RGBA")))
    w = sum(t.width for t in tiles) + 10 * (len(tiles) - 1)
    r = Image.new("RGB", (w, H + 22), (38, 38, 42))
    x = 0
    for t in tiles:
        r.paste(t, (x, 22)); x += t.width + 10
    ImageDraw.Draw(r).text((6, 5), f"{handle}/{fname} {label}"[:150], fill=(235, 235, 235))
    return r


def main():
    a = sys.argv[1:]
    if a[0] == "--log":
        entries = [json.loads(l) for l in pathlib.Path(a[1]).read_text(encoding="utf-8").splitlines()]
        out, items = a[2], [(e["handle"], e["file"], f"[{e.get('status')}] logo={e.get('logo_score', '-')}") for e in entries]
    else:
        out, items = a[0], [(s.split("/")[0], s.split("/", 1)[1], "") for s in a[1:]]
    rows = [row(*it) for it in items]
    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height for r in rows)), (38, 38, 42))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y)); y += r.height
    sheet.save(out, quality=84)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
