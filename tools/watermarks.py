"""Watermark detectors for the bomba-shop.ro product photos.

Three styles appear in the catalog:
  logo    the pink "Bomba-Shop.ro" logo (bomb + hand) laid over the product        -> erase with inpainting
  banner  a light "Bomba-Shop.ro" label strip near the bottom of a staged photo     -> usually goes with the background
  thirdparty  another shop's mark ("ArtificiiDeVanzare.ro Fireworks")               -> never removed, flagged for the owner
"""
import pathlib
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
WM_LOGO = ROOT / "assets" / "watermark" / "logo_bomba-shop-ro.png"
WM_THIRD = ROOT / "assets" / "watermark" / "thirdparty_artificiidevanzare.png"


def _maps(rgb, alpha=None):
    """Colour-class maps that make up the Bomba logo: hot pink text, black bomb, orange hand."""
    r, g, b = [rgb[..., i].astype(np.int16) for i in range(3)]
    pink = (r > 160) & (g < 110) & (b > 40) & (b < 200) & (r - g > 100) & (r - b > 30)
    black = (r < 60) & (g < 60) & (b < 60)
    orange = (r > 200) & (g > 70) & (g < 170) & (b < 90)
    maps = np.stack([pink, black, orange], -1).astype(np.float32)
    if alpha is not None:
        maps *= (alpha > 128)[..., None]
    return maps


def _down(rgb, side=900):
    h, w = rgb.shape[:2]
    k = min(1.0, side / max(h, w))
    return (cv2.resize(rgb, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else rgb), k


class LogoDetector:
    """Multi-scale match of the pink/black/orange logo maps. Score ~0.75+ means a real logo."""

    def __init__(self):
        wm = np.array(Image.open(WM_LOGO).convert("RGBA"))
        ys, xs = np.where(wm[..., 3] > 20)
        wm = wm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        self.alpha = (wm[..., 3] > 20).astype(np.uint8) * 255
        self.maps = _maps(wm[..., :3], wm[..., 3])
        self.aspect = wm.shape[0] / wm.shape[1]

    def find(self, rgb):
        small, k = _down(rgb)
        M = cv2.GaussianBlur(_maps(small), (5, 5), 0)
        if M[..., 0].sum() < 40:
            return 0.0, None
        best = (0.0, None)
        W = small.shape[1]
        for frac in np.linspace(0.12, 0.95, 46):
            tw, th = int(W * frac), int(W * frac * self.aspect)
            if tw < 30 or th >= small.shape[0] or tw >= small.shape[1]:
                continue
            T = cv2.GaussianBlur(cv2.resize(self.maps, (tw, th), interpolation=cv2.INTER_AREA), (5, 5), 0)
            # pink carries the shape; black and orange confirm it is our logo and not pink packaging
            pink = cv2.matchTemplate(M[..., 0].copy(), T[..., 0].copy(), cv2.TM_CCORR_NORMED)
            res = pink * .6 + sum(cv2.matchTemplate(M[..., c].copy(), T[..., c].copy(), cv2.TM_CCORR_NORMED) * wgt
                                  for c, wgt in ((1, .25), (2, .15)))
            # on dark packaging the black bomb disappears, so a very clean pink-text match also counts
            res = np.maximum(res, np.where(pink > .8, pink * .92, 0))
            _, mx, _, loc = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (float(mx), (loc[0] / k, loc[1] / k, tw / k, th / k))
        return best

    def mask(self, shape, box, grow=0.022):
        x, y, w, h = box
        m = np.zeros(shape[:2], np.uint8)
        a = cv2.resize(self.alpha, (max(1, int(round(w))), max(1, int(round(h)))), interpolation=cv2.INTER_LINEAR)
        x0, y0 = int(round(x)), int(round(y))
        x1, y1 = min(shape[1], x0 + a.shape[1]), min(shape[0], y0 + a.shape[0])
        m[max(0, y0):y1, max(0, x0):x1] = a[max(0, -y0):y1 - y0, max(0, -x0):x1 - x0]
        d = max(3, int(w * grow))
        return cv2.dilate((m > 40).astype(np.uint8) * 255, np.ones((d * 2 + 1, d * 2 + 1), np.uint8))


class ThirdPartyDetector:
    """Grey-level match of the ArtificiiDeVanzare.ro mark (dark serif text + burst + rocket)."""

    def __init__(self):
        t = np.array(Image.open(WM_THIRD).convert("L"))
        self.t = (t < 110).astype(np.float32)
        self.aspect = t.shape[0] / t.shape[1]

    def find(self, rgb):
        small, k = _down(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)[..., None].repeat(3, -1))
        D = cv2.GaussianBlur((small[..., 0] < 110).astype(np.float32), (5, 5), 0)
        best = (0.0, None)
        W = small.shape[1]
        for frac in np.linspace(0.3, 0.95, 27):
            tw, th = int(W * frac), int(W * frac * self.aspect)
            if th >= small.shape[0] or tw >= small.shape[1]:
                continue
            T = cv2.GaussianBlur(cv2.resize(self.t, (tw, th), interpolation=cv2.INTER_AREA), (5, 5), 0)
            res = cv2.matchTemplate(D, T, cv2.TM_CCOEFF_NORMED)
            _, mx, _, loc = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (float(mx), (loc[0] / k, loc[1] / k, tw / k, th / k))
        return best


def find_banner(rgb):
    """A light, low-saturation horizontal strip with text in the lower 40% of a staged photo.
    Returns (x, y, w, h) or None."""
    small, k = _down(rgb, 700)
    hsv = cv2.cvtColor(small, cv2.COLOR_RGB2HSV)
    light = ((hsv[..., 2] > 190) & (hsv[..., 1] < 70)).astype(np.uint8)
    H, W = light.shape
    if light.mean() > 0.5:  # white-background studio shot: no separate banner possible
        return None
    lo = int(H * 0.6)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(light[lo:], cv2.MORPH_CLOSE, np.ones((5, 9), np.uint8)))
    best = None
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if not (0.28 * W < w < 0.95 * W and 0.04 * H < h < 0.16 * H):
            continue
        if not (2.8 < w / h < 12 and area / (w * h) > 0.55 and abs((x + w / 2) - W / 2) < 0.22 * W):
            continue
        if best is None or area > best[4]:
            best = (x, y + lo, w, h, area)
    if best is None:
        return None
    x, y, w, h, _ = best
    return (x / k, y / k, w / k, h / k)
