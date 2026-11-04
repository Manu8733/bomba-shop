"""Targeted fixes for photos the automatic pipeline got wrong (list chosen by visual review of every main image).

Usage: tools/.venv/Scripts/python tools/manual_fixes.py
assets/processed/manual-fixes.json maps "handle/file" to one action:
  logo    force-erase the pink Bomba logo at the detector's best position (even at a low score), then cut out
  banner  look for the label strip over the whole photo (not only the lower part), erase it, then cut out
  flood   white studio backdrop: remove it by flood-filling from the edges instead of the AI matting
  photo   the cut-out is unusable: publish the watermark-free photo with its own background instead
Results overwrite assets/processed/<handle>/<n>.webp (and _clean.jpg); log in log-manual.jsonl.
"""
import json, pathlib, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from clean_images import Lama, finish, OUT, ORIG  # noqa: E402
from watermarks import LogoDetector  # noqa: E402
from banner_detect import BannerDetector, edges  # noqa: E402


def banner_anywhere(det, rgb):
    """Same edge template as BannerDetector, but over the whole height."""
    H0, W0 = rgb.shape[:2]
    k = min(1.0, 900 / max(H0, W0))
    small = cv2.resize(rgb, (int(W0 * k), int(H0 * k)), interpolation=cv2.INTER_AREA) if k < 1 else rgb
    E = edges(cv2.cvtColor(small, cv2.COLOR_RGB2GRAY))
    best = (0.0, None)
    for frac in np.linspace(0.25, 0.95, 40):
        tw = int(small.shape[1] * frac); th = max(8, int(tw * det.aspect))
        if th >= E.shape[0] or tw >= E.shape[1]:
            continue
        T = edges(cv2.resize(det.t, (tw, th), interpolation=cv2.INTER_AREA))
        res = cv2.matchTemplate(E, T, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(res)
        if mx > best[0]:
            best = (float(mx), (loc[0] / k, loc[1] / k, tw / k, th / k))
    return best


def flood_cut(rgb):
    im = Image.fromarray(rgb).copy()
    w, h = im.size
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        ImageDraw.floodfill(im, c, (255, 0, 255), thresh=40)
    bg = np.all(np.array(im) == (255, 0, 255), axis=-1)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
    return np.dstack([rgb, np.array(alpha)])


def main():
    from rembg import remove, new_session
    fixes = json.loads((OUT / "manual-fixes.json").read_text(encoding="utf-8"))
    lama, logo, ban, session = Lama(), LogoDetector(), BannerDetector(), new_session("isnet-general-use")
    with (OUT / "log-manual.jsonl").open("w", encoding="utf-8") as fh:
        for key, action in fixes.items():
            handle, fname = key.split("/")
            f = ORIG / handle / fname
            rgb = np.array(Image.open(f).convert("RGB"))
            entry = {"handle": handle, "file": fname, "action": action}
            clean = rgb
            if action == "logo":
                score, box = logo.find(rgb)
                entry["logo_score"] = round(score, 3)
                if box is not None:
                    clean = lama(rgb, logo.mask(rgb.shape, box, grow=0.03))
            elif action == "banner":
                score, box = banner_anywhere(ban, rgb)
                entry["banner_score"] = round(score, 3)
                if box is not None:
                    x, y, w, h = box
                    m = np.zeros(rgb.shape[:2], np.uint8)
                    m[max(0, int(y - h * .14)):int(y + h * 1.14), max(0, int(x - w * .03)):int(x + w * 1.03)] = 255
                    clean = lama(rgb, m)
            if action == "flood":
                cut = flood_cut(clean)
            elif action == "photo":
                # keep the photo: fully opaque, so the site shows it as a framed image
                cut = np.dstack([clean, np.full(clean.shape[:2], 255, np.uint8)])
                entry["kind"] = "photo"
            else:
                cut = np.array(remove(Image.fromarray(clean), session=session, post_process_mask=True))
            finish(handle, f, clean, cut, entry)
            entry["status"] = "ok"
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            print(key, action, entry.get("logo_score", entry.get("banner_score", "")), flush=True)


if __name__ == "__main__":
    main()
