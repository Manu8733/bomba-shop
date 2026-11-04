"""Find the "Bomba-Shop.ro" banner (white strip + text, any text colour) in original photos by edge matching.

Usage: tools/.venv/Scripts/python tools/banner_detect.py calibrate   # score distribution per visual class
       (imported by reclean_banners.py)
"""
import json, pathlib, sys
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = ROOT / "assets" / "originals" / "artificii-de-brad-16cm-set-10-bucati" / "1.png"
REF_BOX = (122, 696, 506, 78)  # x, y, w, h of the banner in REF


def edges(gray):
    e = cv2.Canny(gray, 60, 160)
    return cv2.GaussianBlur(cv2.dilate(e, np.ones((2, 2), np.uint8)).astype(np.float32), (3, 3), 0)


class BannerDetector:
    def __init__(self):
        g = np.array(Image.open(REF).convert("L"))
        x, y, w, h = REF_BOX
        self.t = g[y:y + h, x:x + w]
        self.aspect = h / w

    def find(self, rgb):
        """Return (score, (x, y, w, h)) in full-resolution pixels; searches the lower 60% of the photo."""
        H0, W0 = rgb.shape[:2]
        k = min(1.0, 900 / max(H0, W0))
        small = cv2.resize(rgb, (int(W0 * k), int(H0 * k)), interpolation=cv2.INTER_AREA) if k < 1 else rgb
        gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
        H, W = gray.shape
        top = int(H * 0.4)
        E = edges(gray[top:])
        best = (0.0, None)
        for frac in np.linspace(0.3, 0.95, 40):
            tw = int(W * frac); th = max(8, int(tw * self.aspect))
            if th >= E.shape[0] or tw >= W:
                continue
            T = edges(cv2.resize(self.t, (tw, th), interpolation=cv2.INTER_AREA))
            res = cv2.matchTemplate(E, T, cv2.TM_CCOEFF_NORMED)
            _, mx, _, loc = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (float(mx), (loc[0] / k, (loc[1] + top) / k, tw / k, th / k))
        return best


if __name__ == "__main__" and sys.argv[1:] == ["calibrate"]:
    det = BannerDetector()
    cls = json.loads((ROOT / "assets/processed/classification.json").read_text(encoding="utf-8"))
    import random
    random.seed(3)
    groups = {}
    for k, v in cls.items():
        groups.setdefault(v, []).append(k)
    for g, keys in groups.items():
        sample = random.sample(keys, min(25, len(keys)))
        sc = sorted(round(det.find(np.array(Image.open(ROOT / "assets/originals" / s).convert("RGB")))[0], 2) for s in sample)
        print(g, sc)
