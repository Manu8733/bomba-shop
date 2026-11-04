"""Download every product photo listed in data/products.json into assets/originals/<handle>/<position>.<ext>.

Usage: python tools/download_images.py
Resumable: files already on disk are skipped. Originals are never modified; processing writes elsewhere.
"""
import json, pathlib, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / "assets" / "originals"
products = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))["products"]
ok = skipped = failed = 0
for p in products:
    for img in p["images"]:
        url = img["src_original"]
        ext = url.rsplit(".", 1)[-1].lower()
        f = DEST / p["handle"] / f"{img['position']}.{ext}"
        if f.exists() and f.stat().st_size > 0:
            skipped += 1
            continue
        f.parent.mkdir(parents=True, exist_ok=True)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (bomba-shop redesign)"})
            with urllib.request.urlopen(req, timeout=40) as r:
                f.write_bytes(r.read())
            ok += 1
        except Exception as e:
            failed += 1
            print("ERR", p["handle"], url, e)
        time.sleep(0.25)
    if (ok + skipped) % 100 < 4:
        print(ok + skipped, "imagini", flush=True)
print(f"DONE descărcate {ok}, existente {skipped}, eșuate {failed}")
