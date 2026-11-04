"""Second pass for photos whose "Bomba-Shop.ro" banner survived: erase it on the original with LaMa (edge-matched
location), erase the pink logo too when the photo has one, then cut out the background again.

Usage: tools/.venv/Scripts/python tools/reclean_banners.py --worker 0 --workers 3
Writes over assets/processed/<handle>/<n>.webp (previous version backed up) and logs to log-banner-<w>.jsonl.
"""
import argparse, json, pathlib, shutil, sys
import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from banner_detect import BannerDetector  # noqa: E402
from clean_images import Lama, erase_logo, finish, all_photos, OUT  # noqa: E402
from watermarks import LogoDetector  # noqa: E402

KNOWN_MIN, ANY_MIN = 0.45, 0.66


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--worker", type=int, default=0); ap.add_argument("--workers", type=int, default=1)
    a = ap.parse_args()
    from rembg import remove, new_session
    det, logo, lama, session = BannerDetector(), LogoDetector(), Lama(), new_session("isnet-general-use")
    cls = json.loads((OUT / "classification.json").read_text(encoding="utf-8"))
    log = OUT / f"log-banner-{a.worker}.jsonl"
    done = {json.loads(l)["key"] for l in log.read_text(encoding="utf-8").splitlines()} if log.exists() else set()
    backup = OUT / "_before_banner_fix"
    with log.open("a", encoding="utf-8") as fh:
        for i, (handle, f) in enumerate(all_photos()):
            if i % a.workers != a.worker:
                continue
            key = f"{handle}/{f.name}"
            c = cls.get(key)
            if c == "thirdparty" or key in done:
                continue
            rgb = np.array(Image.open(f).convert("RGB"))
            score, box = det.find(rgb)
            if box is None or score < (KNOWN_MIN if c == "banner" else ANY_MIN):
                continue
            entry = {"key": key, "handle": handle, "file": f.name, "class": c, "banner_score": round(score, 3)}
            x, y, w, h = box
            gy, gx = int(h * .12), int(w * .03)
            m = np.zeros(rgb.shape[:2], np.uint8)
            m[max(0, int(y) - gy):int(y + h) + gy, max(0, int(x) - gx):int(x + w) + gx] = 255
            clean = lama(rgb, m)
            if c == "logo":
                clean, _ = erase_logo(logo, lama, clean, entry, confirmed=True)
            cut = np.array(remove(Image.fromarray(clean), session=session, post_process_mask=True))
            old = OUT / handle / f"{f.stem}.webp"
            if old.exists():
                (backup / handle).mkdir(parents=True, exist_ok=True)
                shutil.copy(old, backup / handle / f"{f.stem}.webp")
            finish(handle, f, clean, cut, entry)
            entry["status"] = "ok"
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n"); fh.flush()
            print(key, entry["banner_score"], flush=True)
    print("DONE worker", a.worker)


if __name__ == "__main__":
    main()
