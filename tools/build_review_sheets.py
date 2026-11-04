"""Contact sheets of every original product photo, numbered, for visual watermark classification.

Usage: tools/.venv/Scripts/python tools/build_review_sheets.py
Writes assets/review/sheet-NN.jpg (30 photos each) and assets/review/index.json with, per photo,
its number, key (handle/file) and the third-party detector score as a second opinion.
"""
import json, pathlib, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIG, OUT = ROOT / "assets" / "originals", ROOT / "assets" / "review"
COLS, ROWS, T = 5, 6, 240


def score(path):
    from watermarks import ThirdPartyDetector
    global _det
    try:
        _det
    except NameError:
        _det = ThirdPartyDetector()
    return round(_det.find(np.array(Image.open(path).convert("RGB")))[0], 3)


def main():
    from clean_images import all_photos
    photos = list(all_photos())
    with ProcessPoolExecutor(max_workers=12) as ex:
        scores = list(ex.map(score, [f for _, f in photos], chunksize=8))
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.truetype("arialbd.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    index, per = [], COLS * ROWS
    for s in range(0, len(photos), per):
        sheet = Image.new("RGB", (COLS * T, ROWS * (T + 4)), (40, 40, 46))
        d = ImageDraw.Draw(sheet)
        items = []
        for j, (handle, f) in enumerate(photos[s:s + per]):
            n = s + j
            im = Image.open(f).convert("RGB")
            im.thumbnail((T - 6, T - 6))
            x, y = (j % COLS) * T, (j // COLS) * (T + 4)
            sheet.paste(im, (x + (T - im.width) // 2, y + (T - im.height) // 2))
            d.rectangle([x, y, x + 46, y + 28], fill=(255, 214, 0))
            d.text((x + 4, y + 2), str(n), fill=(0, 0, 0), font=font)
            items.append({"n": n, "key": f"{handle}/{f.name}", "third_score": scores[n]})
        name = f"sheet-{s // per:02d}.jpg"
        sheet.save(OUT / name, quality=85)
        index.append({"sheet": f"assets/review/{name}", "items": items})
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(photos), "poze,", len(index), "planșe")


if __name__ == "__main__":
    main()
