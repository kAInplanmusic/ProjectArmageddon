#!/usr/bin/env python3
"""
Waffen-Ankerbogen: je Kategorie ein Pruefbogen der held-Zellen mit Griff- (gruen) und
Muendungsanker (rot), Waffen-ID, Form und Ankerquelle.  Liest nur Manifest und Atlanten.

Aufruf
  python3 scripts/waffen-anker-bogen.py [--ziel DIR] [--atlas DIR] [--mass 2] [--icons]
Ausgabe: DIR/anker_<kategorie>.jpg (dunkel) sowie mit --icons zusaetzlich icons_<kategorie>.jpg
(unrotierte Icon-Zellen, fuer den Vergleich mit dem Original).
Deterministisch, kein Zufall.
"""
import argparse
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ATLAS = os.path.join(WURZEL, "src", "client", "assets", "weapon-sprites")
SPALTEN = 8


def zelle(atlas_bilder, eintrag, mass):
    a = atlas_bilder[eintrag["atlas"]]
    return a.crop((eintrag["x"], eintrag["y"], eintrag["x"] + eintrag["w"], eintrag["y"] + eintrag["h"])).resize(
        (eintrag["w"] * mass // 1, eintrag["h"] * mass // 1), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ziel", default=os.path.join(WURZEL, "artifacts", "waffen-anker"))
    ap.add_argument("--atlas", default=ATLAS)
    ap.add_argument("--mass", type=float, default=1.0)
    ap.add_argument("--icons", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.ziel, exist_ok=True)
    with open(os.path.join(args.atlas, "manifest.json"), encoding="utf-8") as f:
        man = json.load(f)
    bilder = {}
    for name, a in man["atlanten"].items():
        bilder[name] = Image.open(os.path.join(args.atlas, a["datei"])).convert("RGBA")
    try:
        font = ImageFont.load_default(size=11)
    except TypeError:
        font = ImageFont.load_default()
    kats = []
    for w in man["waffen"].values():
        if w["category"] not in kats:
            kats.append(w["category"])
    z = int(128 * args.mass)
    for kat in kats:
        teil = [w for w in man["waffen"].values() if w["category"] == kat]
        for art in (("anker", "held"),) + ((("icons", "icon"),) if args.icons else ()):
            zeilen = math.ceil(len(teil) / SPALTEN)
            sheet = Image.new("RGB", (SPALTEN * z, zeilen * (z + 28)), (40, 44, 54))
            dr = ImageDraw.Draw(sheet)
            for i, w in enumerate(teil):
                x, y = (i % SPALTEN) * z, (i // SPALTEN) * (z + 28)
                dr.rectangle((x, y, x + z - 1, y + z - 1), outline=(90, 96, 110))
                bild = zelle(bilder, w[art[1]], 1) .resize((z, z), Image.LANCZOS)
                sheet.paste(bild, (x, y), bild)
                if art[0] == "anker":
                    for schluessel, farbe in (("grip", (60, 255, 90)), ("muzzle", (255, 70, 70))):
                        p = w["anchor"][schluessel]
                        px, py = x + p["x"] * args.mass, y + p["y"] * args.mass
                        dr.ellipse((px - 4, py - 4, px + 4, py + 4), outline=farbe, width=2)
                    gx, gy = x + w["anchor"]["grip"]["x"] * args.mass, y + w["anchor"]["grip"]["y"] * args.mass
                    mx, my = x + w["anchor"]["muzzle"]["x"] * args.mass, y + w["anchor"]["muzzle"]["y"] * args.mass
                    dr.line((gx, gy, mx, my), fill=(255, 220, 60), width=1)
                dr.text((x + 3, y + z + 1), f"{w['id'][3:]} {w['name'][:18]}", fill=(235, 235, 235), font=font)
                dr.text((x + 3, y + z + 13), f"{w['form']} {w['anchor']['source']}", fill=(160, 170, 190), font=font)
            sheet.save(os.path.join(args.ziel, f"{art[0]}_{kat}.jpg"), quality=72, optimize=True)
    print("fertig:", args.ziel)


if __name__ == "__main__":
    main()
