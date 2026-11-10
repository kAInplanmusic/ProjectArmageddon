#!/usr/bin/env python3
"""Laufzeitfassung der Panorama-Kulissen: 1280x720 WebP aus src/client/assets/panoramen-stil (1920x1080).

Aufruf:  python3 scripts/panoramen-kulissen.py [--qualitaet 74]
Liest <name>_{hell,dunkel,hoehle,ragnarok}.webp, schreibt src/client/assets/panoramen-kulissen/<name>_<art>.webp.
Nur diese kleine Fassung kommt in den Build (`client/panoramenUrls.js`); die 1920er bleiben Quelle. Die gemalten
Bilder haben nur rund 1024 px echte Schaerfe (docs/panoramen-stil.md), 1280 Breite verliert also nichts Sichtbares.
Die Basisbilder ohne Artsuffix werden nicht verwendet (klondike_schnee.webp traegt einen Textrest).
"""
import argparse, sys
from pathlib import Path
from PIL import Image

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / "src/client/assets/panoramen-stil"
ZIEL = WURZEL / "src/client/assets/panoramen-kulissen"
ARTEN = ("hell", "dunkel", "hoehle", "ragnarok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qualitaet", type=int, default=74)
    q = ap.parse_args().qualitaet
    ZIEL.mkdir(exist_ok=True)
    namen = sorted({p.stem.rsplit("_", 1)[0] for a in ARTEN for p in QUELLE.glob(f"*_{a}.webp")})
    n = summe = 0
    for name in namen:
        for art in ARTEN:
            quelle = QUELLE / f"{name}_{art}.webp"
            if not quelle.exists():
                sys.exit(f"fehlt: {quelle}")
            bild = Image.open(quelle).convert("RGB")
            if bild.size != (1920, 1080):
                sys.exit(f"{quelle.name}: {bild.size}, erwartet 1920x1080")
            ziel = ZIEL / quelle.name
            bild.resize((1280, 720), Image.LANCZOS).save(ziel, "WEBP", quality=q, method=6)
            n += 1
            summe += ziel.stat().st_size
    print(f"{n} Dateien, {summe / 1e6:.2f} MB")


main()
