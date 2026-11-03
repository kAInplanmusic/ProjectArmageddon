#!/usr/bin/env python3
"""Leitet Emotionsposen ohne Bildmodell aus einer gültigen Zelle derselben Figur (oder dem Seitenbild) ab.

Letzte Rückfallebene (2026-11-03), wenn FLUX die Art verwandelt oder Teile dazuerfindet: Die Quelle wird nur verformt
(neigen, stauchen, strecken, scheren, anheben); Stil und Art bleiben dadurch exakt gleich, es kostet nichts.
Drehpunkt ist der Fußpunkt (Mitte der Unterkante des Umrisses). Die Figuren schauen nach rechts, also heißt
„nach hinten“ nach links.

Operationen (durch Kommas getrennt, in dieser Reihenfolge angewandt):
  n<grad>   neigen um den Fußpunkt; positiv = nach hinten (Angst), negativ = nach vorn (Waffenwechsel)
  s<f>      senkrecht skalieren über der Unterkante (<1 geduckt, >1 hochgezogen)
  x<f>      waagerecht skalieren um den Fußpunkt
  q<f>      scheren: Oberkante um f x Höhe nach hinten (positiv) bzw. vorn (negativ) versetzen
  h<px>     senkrecht verschieben (negativ = nach oben, z. B. Hüpfer)
  sp        spiegeln

Aufruf (Wurzel des Repos):
  python3 scripts/sprites-erzeugen/emotion-ableiten.py <fraktion/figur> <ziel>=<quelle>:<ops> [...]
  <quelle> ist eine Zellennummer 0–7 des Emotions-Sheets oder `seite` (Seitenbild, 256 px).
  Beispiel: datacult/12_arcology-agent 0=5:n9,s0.9 7=6:n-7
Danach `emotion-pruefen.py` laufen lassen (abgeleitete Zellen stehen in SICHTPRUEFUNG als frei).
"""
import sys

import numpy as np
from PIL import Image

SEITE = 'src/client/assets/characters-side/'
EMO = 'src/client/assets/sprite-sheets-emotion/'
Z = 256


def zelle(sheet, c):
    return sheet.crop(((c % 4) * Z, (c // 4) * Z, (c % 4 + 1) * Z, (c // 4 + 1) * Z))


def fusspunkt(bild):
    a = np.asarray(bild)[..., 3] > 40
    ys, xs = np.where(a)
    unten = ys.max()
    zeile = xs[ys >= unten - 6]
    return float(zeile.mean()), float(unten), float(ys.max() - ys.min())


def affin(bild, m):
    """m: 2x3-Matrix Ziel = m * Quelle (homogen); PIL braucht die Umkehrung."""
    voll = np.vstack([m, [0, 0, 1]])
    inv = np.linalg.inv(voll)
    return bild.transform(bild.size, Image.AFFINE, tuple(inv[:2].ravel()), resample=Image.BICUBIC)


def ableiten(quelle, ops):
    bild = quelle.convert('RGBA')
    # Rand, damit Neigen und Strecken nichts abschneiden; am Ende wieder auf die Zelle
    pad = Image.new('RGBA', (Z * 2, Z * 2), (0, 0, 0, 0))
    pad.alpha_composite(bild, (Z // 2, Z // 2))
    bild = pad
    for op in [o for o in ops.split(',') if o]:
        fx, fy, h = fusspunkt(bild)
        if op == 'sp':
            bild = bild.transpose(Image.FLIP_LEFT_RIGHT)
            continue
        art, w = op[0], float(op[1:])
        if art == 'n':
            r = np.radians(w)  # positiv: oben nach links (gegen den Uhrzeigersinn auf dem Bildschirm)
            c, s = np.cos(r), np.sin(r)
            m = np.array([[c, s, fx - c * fx - s * fy], [-s, c, fy + s * fx - c * fy]])
        elif art == 's':
            m = np.array([[1, 0, 0], [0, w, fy - w * fy]])
        elif art == 'x':
            m = np.array([[w, 0, fx - w * fx], [0, 1, 0]])
        elif art == 'q':
            k = w  # Versatz pro Pixel Höhe
            m = np.array([[1, k, -k * fy], [0, 1, 0]])
        elif art == 'h':
            m = np.array([[1, 0, 0], [0, 1, w]])
        else:
            raise SystemExit(f'unbekannte Operation {op}')
        bild = affin(bild, m)
    aus = bild.crop((Z // 2, Z // 2, Z // 2 + Z, Z // 2 + Z))
    a = np.asarray(aus).copy()
    a[a[..., 3] < 8] = 0
    return Image.fromarray(a, 'RGBA')


def main(schluessel, auftraege):
    fak, name = schluessel.split('/')
    pfad = f'{EMO}{fak}/{name}__emotion.webp'
    sheet = Image.open(pfad).convert('RGBA')
    alt = sheet.copy()
    for auftrag in auftraege:
        ziel, _, rest = auftrag.partition('=')
        quelle, _, ops = rest.partition(':')
        q = Image.open(f'{SEITE}{fak}/{name}.png').convert('RGBA').resize((Z, Z), Image.LANCZOS) if quelle == 'seite' \
            else zelle(alt, int(quelle))
        neu = ableiten(q, ops)
        c = int(ziel)
        x0, y0 = (c % 4) * Z, (c // 4) * Z
        sheet.paste((0, 0, 0, 0), (x0, y0, x0 + Z, y0 + Z))
        sheet.alpha_composite(neu, (x0, y0))
    sheet.save(pfad, 'WEBP', quality=88, method=4)
    print(schluessel, len(auftraege), 'Zellen abgeleitet')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2:])
