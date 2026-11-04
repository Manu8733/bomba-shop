"""Add the owner's new product photos (replacing the hidden third-party ones).

Usage: put photos in assets/inlocuiri/<handle>/ (any file names), then
  tools/.venv/Scripts/python tools/ingest_photos.py
  tools/.venv/Scripts/python tools/sync_web_assets.py
Each photo is cut out (white/plain backdrops via edge flood fill, anything else via rembg) and saved as
assets/processed/<handle>/r<k>.webp. sync_web_assets.py appends them to that product's gallery, first if the
product had no publishable photo. Photos are processed again only when they change.
"""
import json, pathlib, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from manual_fixes import flood_cut  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "inlocuiri"
OUT = ROOT / "assets" / "processed"


def plain_backdrop(rgb):
    """True when the photo border is a light, even backdrop (studio shot)."""
    b = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    return b.mean() > 205 and b.std() < 18


def main():
    if not SRC.exists():
        SRC.mkdir(parents=True)
        print(f"Am creat {SRC}. Pune pozele în {SRC}/<cod-produs>/ și rulează din nou.")
        return
    products = {p["handle"] for p in json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))["products"]}
    session = None
    done = 0
    for d in sorted(p for p in SRC.iterdir() if p.is_dir()):
        if d.name not in products:
            print(f"! {d.name}: nu există un produs cu acest cod (vezi POZE-DE-INLOCUIT.md)")
            continue
        files = sorted(f for f in d.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
        for k, f in enumerate(files, 1):
            dest = OUT / d.name / f"r{k}.webp"
            if dest.exists() and dest.stat().st_mtime >= f.stat().st_mtime:
                continue
            rgb = np.array(Image.open(f).convert("RGB"))
            if plain_backdrop(rgb):
                cut = flood_cut(rgb)
            else:
                if session is None:
                    from rembg import new_session
                    session = new_session("isnet-general-use")
                from rembg import remove
                cut = np.array(remove(Image.fromarray(rgb), session=session, post_process_mask=True))
            img = Image.fromarray(cut)
            if img.getbbox():
                img = img.crop(img.getbbox())
            img.thumbnail((1600, 1600))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, "WEBP", quality=88, method=5)
            done += 1
            print(f"{d.name}/{f.name} -> {dest.name}")
    print(f"Gata: {done} poze noi procesate.")


if __name__ == "__main__":
    main()
