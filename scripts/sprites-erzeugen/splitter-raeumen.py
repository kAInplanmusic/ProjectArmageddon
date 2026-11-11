#!/usr/bin/env python3
"""Raeumt Splitter in einzelnen Sheet-Zellen (BILDLUECKEN: "zerstueckelte Zellen"), `check-sprites` Hinweis "Splitter neben der Figur".

Ein Splitter ist eine zusammenhaengende Deckungsflaeche (Alpha >= 24, 4er-Nachbarschaft wie check-sprites) unter `--max` Pixeln. Geloescht wird er nur, wenn er
KEINE grosse Flaeche beruehrt oder nah an ihr liegt (`--abstand` px Dilatation, Standard 1): Details am Koerper (Funken,
Fell, Pixel eines Schwarms) bleiben, Freisteller-Staub im leeren Raum faellt weg. Wie bei `stil-pass.py`: erst `--trocken`.

Aufruf (Wurzel):
  python3 scripts/sprites-erzeugen/splitter-raeumen.py [--trocken] [--max 24] [--abstand 2] fraktion/figur:blatt:zelle[,zelle] ...
  z. B. beasts/01_shrew-quakes:aktion:4
Schreibt WebP verlustfrei (die Blaetter sind verlustfrei abgelegt). Vorher/Nachher je Zelle auf stdout.
"""
import argparse
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

A = 'src/client/assets/sprite-sheets/'


def komponenten(maske):
    lab, n = ndi.label(maske)  # 4er-Nachbarschaft wie scripts/check-sprites.mjs
    groessen = ndi.sum(maske, lab, range(1, n + 1)) if n else []
    return lab, n, groessen


def raeume(zelle, maximum, abstand):
    a = np.asarray(zelle).copy()
    maske = a[..., 3] >= 24
    lab, n, g = komponenten(maske)
    vorher = int(sum(1 for x in g if x < 24))
    if n == 0:
        return a, 0, 0
    gross = np.isin(lab, [i + 1 for i, x in enumerate(g) if x >= maximum])
    nah = ndi.binary_dilation(gross, iterations=abstand) if abstand else gross
    weg = np.zeros_like(maske)
    for i, x in enumerate(g):
        if x < maximum and not (nah & (lab == i + 1)).any():
            weg |= lab == i + 1
    weg = ndi.binary_dilation(weg, iterations=1) & (a[..., 3] > 0) & ~gross
    a[weg, 3] = 0
    nachher = int(sum(1 for x in komponenten(a[..., 3] >= 24)[2] if x < 24))
    return a, vorher, nachher


def main():
    p = argparse.ArgumentParser()
    p.add_argument('ziele', nargs='+')
    p.add_argument('--max', type=int, default=24)
    p.add_argument('--abstand', type=int, default=1)
    p.add_argument('--trocken', action='store_true')
    args = p.parse_args()
    for z in args.ziele:
        figur, blatt, zellen = z.split(':')
        pfad = f'{A}{figur}__{blatt}.webp'
        bild = Image.open(pfad).convert('RGBA')
        for i in [int(x) for x in zellen.split(',')]:
            box = ((i % 4) * 256, (i // 4) * 256, (i % 4) * 256 + 256, (i // 4) * 256 + 256)
            neu, v, n = raeume(bild.crop(box), args.max, args.abstand)
            print(f'{figur} {blatt} Zelle {i}: Splitter < 24 px  {v} -> {n}')
            bild.paste(Image.fromarray(neu, 'RGBA'), box[:2])
        if not args.trocken:
            bild.save(pfad, 'WEBP', lossless=True, method=6)
            print('  geschrieben', pfad)


if __name__ == '__main__':
    sys.exit(main())
