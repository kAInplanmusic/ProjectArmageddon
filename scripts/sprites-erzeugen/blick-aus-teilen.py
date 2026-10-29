#!/usr/bin/env python3
"""Blick hoch / Blick runter für Figuren, bei denen die KI-Neuerzeugung die Art verwandelt hat (Schlange, Spinne, Panzer ...).

Kein Bildmodell: Ein Teil des Seitenbilds (Kopf, Rohr, Waffenarm, Körper) wird weich um einen Drehpunkt gedreht. Der Stil bleibt
dadurch exakt gleich, es kostet kein Guthaben, und die Art kann sich nicht verwandeln. Zwei Verfahren:
  - `kreis`: Gewicht 1 innerhalb `r_in` um (cx, cy), 0 außerhalb `r_out`, Drehung um (px, py);
  - `starr`: Polygon wird starr gedreht (für Teile mit harter Kante, z. B. das Panzerrohr).
Die Zellen 5 (Blick hoch) und 6 (Blick runter) des Emotions-Sheets werden ersetzt; danach `emotion-pruefen.py` laufen lassen
(die Zellen stehen in `SICHTPRUEFUNG` als freigegeben).

Aufruf (Wurzel des Repos): python3 scripts/sprites-erzeugen/blick-aus-teilen.py [--trocken <ausgabeordner>]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates

SEITE = 'src/client/assets/characters-side/'
EMO = 'src/client/assets/sprite-sheets-emotion/'


def sm(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def kreis(bild, winkel, cx, cy, r_in, r_out, px, py):
    """Weiches Drehen um (px, py); positiver Winkel dreht im Bild im Uhrzeigersinn (y zeigt nach unten)."""
    im = np.asarray(bild.convert('RGBA')).astype(float)
    h, w = im.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    gew = sm((r_out - np.hypot(xx - cx, yy - cy)) / (r_out - r_in))
    a = np.deg2rad(winkel) * gew
    dx, dy = xx - px, yy - py
    sx = px + np.cos(-a) * dx - np.sin(-a) * dy
    sy = py + np.sin(-a) * dx + np.cos(-a) * dy
    out = np.stack([map_coordinates(im[..., c], [sy, sx], order=1, mode='constant', cval=0) for c in range(4)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def starr(bild, winkel, poly, pivot, loesch_ab=0):
    """Starres Drehen eines Polygons (PIL: positiv = gegen den Uhrzeigersinn); links von `loesch_ab` bleibt der Grund stehen."""
    im = bild.convert('RGBA')
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    teil = Image.new('RGBA', im.size, (0, 0, 0, 0))
    teil.paste(im, (0, 0), m)
    ml = m.copy()
    ImageDraw.Draw(ml).rectangle((0, 0, loesch_ab, im.size[1]), fill=0)
    rest = im.copy()
    rest.paste((0, 0, 0, 0), (0, 0), ml)
    rest.alpha_composite(teil.rotate(winkel, resample=Image.BICUBIC, center=pivot))
    return rest


# Schlüssel -> (zellen, Funktion hoch, Funktion runter); Zellen: welche der Zellen 5/6 ersetzt werden
FIGUREN = {
    'datacult/02_chrome-code-shifter': ((5, 6),
        lambda b: _schlange(b, -20), lambda b: _schlange(b, 16)),
    'machina/11_heavy-battery-moerser-bot': ((5, 6),
        lambda b: starr(b, 14, [(96, 130), (96, 104), (150, 66), (256, 0), (256, 104), (214, 124), (150, 134)], (112, 122), 138),
        lambda b: starr(b, -10, [(96, 130), (96, 104), (150, 66), (256, 0), (256, 104), (214, 124), (150, 134)], (112, 122), 138)),
    'machina/12_ordnance-rail-viper': ((5,),
        lambda b: kreis(b, -12, 150, 62, 70, 100, 115, 110), lambda b: kreis(b, 12, 150, 62, 70, 100, 115, 110)),
    'shinobi/12_blowpipe-koga': ((5, 6),
        lambda b: kreis(b, -12, 140, 60, 55, 80, 110, 110), lambda b: kreis(b, 12, 140, 60, 55, 80, 110, 110)),
    'xeno/10_drone-theta': ((5,),
        lambda b: kreis(b, -8, 150, 100, 70, 110, 150, 130), lambda b: kreis(b, 8, 150, 100, 70, 110, 150, 130)),
    'datacult/11_synapse-streamer': ((5, 6),
        lambda b: kreis(b, -6, 135, 110, 90, 140, 135, 200), lambda b: kreis(b, 6, 135, 110, 90, 140, 135, 200)),
}


def _schlange(b, winkel):
    """Kopf links: weiches Drehen des Kopfbereichs (Gewicht nach rechts und unten ausklingend), Drehpunkt am Hals."""
    im = np.asarray(b.convert('RGBA')).astype(float)
    h, w = im.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    gew = sm((135 - xx) / 75) * sm((150 - yy) / 45)
    a = np.deg2rad(winkel) * gew
    dx, dy = xx - 118, yy - 100
    sx = 118 + np.cos(-a) * dx - np.sin(-a) * dy
    sy = 100 + np.sin(-a) * dx + np.cos(-a) * dy
    out = np.stack([map_coordinates(im[..., c], [sy, sx], order=1, mode='constant', cval=0) for c in range(4)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')


def zelle_einsetzen(sheet, c, bild):
    w, h = sheet.size
    x0, y0 = (c % 4) * w // 4, (c // 4) * h // 2
    zw, zh = w // 4, h // 2
    sheet.paste((0, 0, 0, 0), (x0, y0, x0 + zw, y0 + zh))
    sheet.alpha_composite(bild.convert('RGBA').resize((zw, zh), Image.LANCZOS), (x0, y0))


def main():
    trocken = len(sys.argv) > 2 and sys.argv[1] == '--trocken'
    for k, (zellen, hoch, runter) in FIGUREN.items():
        fak, name = k.split('/')
        basis = Image.open(f'{SEITE}{fak}/{name}.png').convert('RGBA')
        bilder = {5: hoch(basis), 6: runter(basis)}
        pfad = f'{EMO}{fak}/{name}__emotion.webp'
        sheet = Image.open(pfad).convert('RGBA')
        for c in zellen:
            if trocken:
                bilder[c].save(os.path.join(sys.argv[2], f'{fak}__{name}__{c}.png'))
            else:
                zelle_einsetzen(sheet, c, bilder[c])
        if not trocken:
            sheet.save(pfad, 'WEBP', quality=88, method=4)
        print(k, 'Zellen', list(zellen), 'trocken' if trocken else 'eingesetzt')


if __name__ == '__main__':
    main()
