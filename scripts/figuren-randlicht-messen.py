#!/usr/bin/env python3
"""Misst je Figur (Seitenbild) den Kantenkontrast zu dunklem Gelaende, ohne und mit Randlicht (SPR-6).

Spiegelt die Formeln aus `src/client/figurRandlicht.js` (RAND_GRENZE 110, RAND_BREITE 70, RAND_ALPHA_MAX 0.62,
Saumfarbe #e4f2ff, Kante = deckende Pixel mit durchsichtigem Pixel im 5x5-Umfeld, auf 128 px gerechnet).
Gelaende: mittlere Helligkeit der dunkelsten Stofftexturen (Kohle 16, Fels 32, Teer 34, Obsidian 45) und 60.
Aufruf (Wurzel): python3 scripts/figuren-randlicht-messen.py
"""
import glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

GRENZE, BREITE, AMAX = 110.0, 70.0, 0.62
SAUM = 0.2126 * 0xe4 + 0.7152 * 0xf2 + 0.0722 * 0xff
GELAENDE = [16, 32, 45, 60]


def lin(v):
    c = v / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def kontrast(a, b):
    la, lb = lin(a), lin(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


zeilen = []
for p in sorted(glob.glob('src/client/assets/characters-side/*/*.png')):
    a = np.asarray(Image.open(p).convert('RGBA').resize((128, 128), Image.BILINEAR)).astype(float)
    deck = a[..., 3] > 128
    if not deck.any():
        continue
    rand = deck & ~ndi.binary_erosion(deck, structure=np.ones((5, 5)), border_value=0)
    rgb = a[..., :3][rand]
    L = float((0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]).mean())
    s = max(0.0, min(1.0, (GRENZE - L) / BREITE))
    vorher = min(kontrast(L, g) for g in GELAENDE)
    nachher = min(kontrast(max(L, AMAX * s * SAUM + (1 - AMAX * s) * g), g) for g in GELAENDE)
    zeilen.append((vorher, nachher, L, s, p.split('side/')[1][:-4]))
zeilen.sort()
print(f'Figuren: {len(zeilen)}, mit Randlicht (Kante < {GRENZE:.0f}): {sum(1 for z in zeilen if z[3] > 0)}')
print('schlechteste Kontraste (Kante gegen dunkelstes Gelaende, WCAG-Verhaeltnis), vorher -> nachher:')
for v, n, L, s, name in zeilen[:15]:
    print(f'  {name:42s} Kante {L:4.0f}  Staerke {s:.2f}  {v:.2f} -> {n:.2f}')
print(f'kleinstes Verhaeltnis vorher {zeilen[0][0]:.2f}, nachher {min(z[1] for z in zeilen):.2f}')
