"""Copy catalog data and product photos into the Astro project, with responsive WebP sizes.

Usage: tools/.venv/Scripts/python tools/sync_web_assets.py
Image source per photo, best first:
  1. assets/processed/<handle>/<n>.webp  (watermark removed, background cut out) -> "cutout"
  2. assets/originals/<handle>/<n>.*     (still watermarked, shown until processed) -> "original"
Photos classified "thirdparty" (another shop's watermark) are never published.
Writes web/src/data/{products,collections,images}.json and web/public/images/products/<handle>/<n>-<w>.webp
"""
import json, pathlib, shutil
from PIL import Image
from ground_shadow import ground

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DATA_OUT = WEB / "src" / "data"
IMG_OUT = WEB / "public" / "images" / "products"
WIDTHS = (360, 720, 1200)


def load_status():
    """Latest processing status per photo, from the worker logs."""
    st = {}
    for log in sorted((ROOT / "assets" / "processed").glob("log-*.jsonl")):
        for line in log.read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            k = f"{e['handle']}/{e['file']}"
            if k not in st or e.get("status") != "error":  # the latest successful run wins (manual fixes run last)
                st[k] = e
    return st


def save_webp(img, out):
    """Write next to the target, then swap in: a watcher or antivirus holding the old file only delays the swap."""
    import os, time
    tmp = out.with_suffix(".tmp.webp")
    img.save(tmp, "WEBP", quality=82, method=4)
    for k in range(8):
        try:
            os.replace(tmp, out)
            return
        except OSError:
            time.sleep(.2 * (k + 1))
    PENDING.append((tmp, out))  # still held: swapped in at the end of the run


PENDING = []


def flush_pending():
    import os, time
    for _ in range(40):
        left = []
        for tmp, out in PENDING:
            try:
                os.replace(tmp, out)
            except OSError:
                try:  # a reader that does not share delete access still lets us rewrite the bytes in place
                    out.write_bytes(tmp.read_bytes()); tmp.unlink()
                except OSError:
                    left.append((tmp, out))
        PENDING[:] = left
        if not left:
            return
        time.sleep(1.5)
    raise OSError(f"{len(PENDING)} files stayed locked, e.g. {PENDING[0][1]}")


def main():
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    for name in ("products.json", "collections.json"):
        shutil.copy(ROOT / "data" / name, DATA_OUT / name)
    cls_file = ROOT / "assets" / "processed" / "classification.json"
    classes = json.loads(cls_file.read_text(encoding="utf-8")) if cls_file.exists() else {}
    status = load_status()
    products = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))["products"]
    manifest, counts = {}, {"cutout": 0, "original": 0, "hidden_thirdparty": 0, "missing": 0}
    for p in products:
        h = p["handle"]
        entries = []
        for img in p["images"]:
            n = img["position"]
            origs = list((ROOT / "assets" / "originals" / h).glob(f"{n}.*"))
            key = f"{h}/{origs[0].name}" if origs else None
            if key and (classes.get(key) == "thirdparty" or status.get(key, {}).get("status") == "skipped_thirdparty"):
                counts["hidden_thirdparty"] += 1
                continue
            processed = ROOT / "assets" / "processed" / h / f"{n}.webp"
            if processed.exists() and status.get(key, {}).get("status") == "ok":
                src, kind = processed, "original" if status[key].get("kind") == "photo" else "cutout"
            elif origs:
                src, kind = origs[0], "original"
            else:
                counts["missing"] += 1
                continue
            counts[kind] += 1
            im = Image.open(src)
            im = im.convert("RGBA") if kind == "cutout" else im.convert("RGB")
            obj = None
            if kind == "cutout":
                im, obj = ground(im)  # stands on the floor: trimmed, with a contact shadow under its base
            dest = IMG_OUT / h
            dest.mkdir(parents=True, exist_ok=True)
            files = []
            for w in WIDTHS:
                if w > im.width and files:
                    break
                r = im.copy()
                r.thumbnail((w, w * 4))
                out = dest / f"{n}-{r.width}.webp"
                save_webp(r, out)
                files.append({"w": r.width, "h": r.height, "src": f"/images/products/{h}/{out.name}"})
            entries.append({"n": n, "kind": kind, "alt": img["alt"], "w": files[-1]["w"], "h": files[-1]["h"], "files": files, **({"obj": obj} if obj else {})})
        # the owner's replacement photos (tools/ingest_photos.py): r1.webp, r2.webp…
        for k, rp in enumerate(sorted((ROOT / "assets" / "processed" / h).glob("r[0-9]*.webp")), 1):
            im, obj = ground(Image.open(rp))
            dest = IMG_OUT / h
            dest.mkdir(parents=True, exist_ok=True)
            files = []
            for w in WIDTHS:
                if w > im.width and files:
                    break
                r = im.copy(); r.thumbnail((w, w * 4))
                out = dest / f"{rp.stem}-{r.width}.webp"
                save_webp(r, out)
                files.append({"w": r.width, "h": r.height, "src": f"/images/products/{h}/{out.name}"})
            alt = p["title"] if not entries else f"{p['title']}, imaginea {len(entries) + 1}"
            entries.append({"n": 100 + k, "kind": "cutout", "alt": alt, "w": files[-1]["w"], "h": files[-1]["h"], "files": files, "obj": obj})
            counts["cutout"] += 1
        manifest[h] = entries
    flush_pending()
    (DATA_OUT / "images.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    brand = WEB / "public" / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    for f in (ROOT / "brand" / "logo").glob("*.svg"):
        shutil.copy(f, brand / f.name)
    for f in (ROOT / "brand" / "logo" / "png").glob("*.png"):
        shutil.copy(f, brand / f.name)
    shutil.copy(ROOT / "brand" / "logo" / "favicon.svg", WEB / "public" / "favicon.svg")
    print(counts)


if __name__ == "__main__":
    main()
