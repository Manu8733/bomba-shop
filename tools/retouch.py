"""Manual retouch for the last stubborn watermarks: regions marked by hand on a 10% grid (visual review).

Usage: tools/.venv/Scripts/python tools/retouch.py
Each entry: handle/file -> (mode, (x0, y0, x1, y1) as fractions of the photo, output)
  mode "logo"  erase only the logo's own pixels (hot pink text, black bomb, orange hand) inside the box
  mode "rect"  erase the whole box (white label strip)
  output "cut" cut out the background afterwards; "photo" keep the retouched photo with its background
"""
import json, pathlib, sys
import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from clean_images import Lama, finish, OUT, ORIG  # noqa: E402
from watermarks import _maps  # noqa: E402

R = {
    "baterie-artificii-de-zi-albastru-efecte-spectaculoase/1.png": ("rect", (.10, .03, .92, .23), "cut"),
    "baterie-artificii-de-zi-rosu-spectacol-colorat-pentru-evenimente/1.png": ("rect", (.10, .03, .92, .23), "cut"),
    "confetti-albastru-gender-reveal-anunt-spectaculos-baietel/1.png": ("logo", (.20, .04, .80, .19), "cut"),
    "confetti-roz-gender-reveal-efect-wow-la-anuntul-bebelusului/1.png": ("logo", (.20, .04, .80, .19), "cut"),
    "emitator-super-troll/1.png": ("rect", (.32, .54, .80, .68), "cut"),
    "violent/1.webp": ("logo", (.30, .38, .72, .56), "cut"),
    "titireze-vampire-2/1.png": ("logo", (.50, .30, .88, .75), "cut"),
    "torta-stadion/1.png": ("rect", (.24, .69, .75, .81), "cut"),
    "fumigena-portocaliu/1.png": ("rect", (.15, .85, .85, .985), "photo"),
    "blink-attack-fireshow/1.png": ("rect", (.20, .835, .80, .975), "photo"),
    "crackling-ball/1.png": ("rect", (.27, .845, .73, .97), "photo"),
    "grenada-de-antrenament-cu-pulbere-de-metal-2/1.png": ("rect", (.20, .0, .80, .13), "photo"),
    "confetti-alb-streamer-pentru-un-eveniment-reusit/1.png": ("logo", (.30, .68, .99, 1.0), "photo"),
    "dinosaur-egg/1.jpg": ("rect", (.18, .875, .76, 1.0), "photo"),
    "fumigena-alba-2/1.jpg": ("logo", (.55, .05, .82, .99), "photo"),
    "fumigena-verde-2/1.jpg": ("logo", (.55, .05, .82, .99), "photo"),
    "fumigena-portocalie/1.jpg": ("logo", (.55, .05, .82, .99), "photo"),
    "fumigena-rosie-2/1.jpg": ("logo", (.55, .05, .82, .99), "photo"),
}


def main():
    from rembg import remove, new_session
    lama, session = Lama(), new_session("isnet-general-use")
    with (OUT / "log-retouch.jsonl").open("w", encoding="utf-8") as fh:
        for key, (mode, (x0, y0, x1, y1), output) in R.items():
            handle, fname = key.split("/")
            f = ORIG / handle / fname
            rgb = np.array(Image.open(f).convert("RGB"))
            H, W = rgb.shape[:2]
            bx0, by0, bx1, by1 = int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)
            m = np.zeros((H, W), np.uint8)
            if mode == "rect":
                m[by0:by1, bx0:bx1] = 255
            else:
                maps = _maps(rgb[by0:by1, bx0:bx1]).max(axis=-1)
                d = max(5, W // 140)
                m[by0:by1, bx0:bx1] = cv2.dilate((maps > 0).astype(np.uint8) * 255, np.ones((d * 2 + 1, d * 2 + 1), np.uint8))
            clean = lama(rgb, m)
            if mode == "logo":  # a second, tighter pass for anti-aliased leftovers
                maps = _maps(clean[by0:by1, bx0:bx1]).max(axis=-1)
                if maps.mean() > 0.002:
                    m2 = np.zeros((H, W), np.uint8)
                    m2[by0:by1, bx0:bx1] = cv2.dilate((maps > 0).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
                    clean = lama(clean, m2)
            entry = {"handle": handle, "file": fname, "action": f"retouch-{mode}"}
            if output == "photo":
                cut = np.dstack([clean, np.full((H, W), 255, np.uint8)])
                entry["kind"] = "photo"
            else:
                cut = np.array(remove(Image.fromarray(clean), session=session, post_process_mask=True))
            finish(handle, f, clean, cut, entry)
            entry["status"] = "ok"
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            print(key, mode, output, flush=True)


if __name__ == "__main__":
    main()
