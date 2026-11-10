#!/usr/bin/env python3
"""B6: setzt die gemalten Geschosszellen (assets/weapons/geschosse) in die BESTEHENDEN Atlanten ein.

Ein Neubau mit scripts/waffen-sprites.py ist auf anderen Rechnern nicht pixelgleich (Icons, Ultimate-Atlas),
deshalb tauscht dieses Skript nur die Geschosszellen mit `generiert: true`, deren Art eine gemalte Zelle hat.
Position und Atlas bleiben; `size` im Manifest wird aus dem neuen Bild gemessen. Idempotent.

Aufruf (Wurzel des Repos): python3 scripts/geschosszellen-einsetzen.py
"""
import importlib.util
import json
import os

import numpy as np
from PIL import Image

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
spec = importlib.util.spec_from_file_location("waffen_sprites", os.path.join(WURZEL, "scripts", "waffen-sprites.py"))
ws = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ws)

ZIEL = os.path.join(WURZEL, "src", "client", "assets", "weapon-sprites")
MANIFEST = os.path.join(ZIEL, "manifest.json")


def main():
    m = json.load(open(MANIFEST))
    atlanten = {}
    getauscht = []
    for wid, w in m["waffen"].items():
        p = w.get("projectile")
        if not p or not p.get("generiert"):
            continue
        bild = ws.geschoss_bild(p["art"], w.get("flashColor", "#ffffff"), wid)
        if bild is None:
            continue
        datei = f"atlas_{p['atlas']}.png"
        if datei not in atlanten:
            atlanten[datei] = Image.open(os.path.join(ZIEL, datei)).convert("RGBA")
        atlas = atlanten[datei]
        atlas.paste(Image.new("RGBA", (p["w"], p["h"]), (0, 0, 0, 0)), (p["x"], p["y"]))
        atlas.paste(bild, (p["x"], p["y"]))
        a = np.asarray(bild)[..., 3] > 100
        ys, xs = np.nonzero(a)
        p["size"] = {"w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}
        getauscht.append(wid)
    for datei, atlas in atlanten.items():
        ws.speichern(atlas, os.path.join(ZIEL, datei))
    with open(MANIFEST, "w") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(getauscht)} Geschosszellen getauscht in {len(atlanten)} Atlanten")


if __name__ == "__main__":
    main()
