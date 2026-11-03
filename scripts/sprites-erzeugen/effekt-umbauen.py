#!/usr/bin/env python3
"""Baut die bisher ungenutzten Effekt-Vorlagen zu Bildfolgen für `src/client/effektSheets.js` um (N-08, ASSETS-1).

Quellen (Vorlagen des Auftraggebers, unverändert im Repo):
  src/client/assets/material-texturen/effekte/sheet-ringe-blasen-farben.png  (RGB auf Schwarz, unregelmäßig)
  src/client/assets/material-texturen/effekte/sheet-wirbel-gruen-pink.png    (8×8 Zellen à 100 px, 61 Frames)
  src/client/assets/material-texturen/partikel-sheet-funken-blaetter.png     (7×7 Zellen à 100 px, 45 Frames)

Ausgabe (WebP mit Alpha, regelmäßiges Raster, kein Frame berührt den Zellrand):
  ringe.webp   7 Spalten × 6 Zeilen à 72 px: gelb, violett, rot, orange, blau, rosa (je 7 Frames: Scheibe → Ring → weg)
  wirbel.webp  8 × 8 à 80 px (61 Frames, grün-pinker Wirbel)
  funken.webp  8 × 6 à 64 px (45 Frames, Funkenkranz gelb → violett)

Aufruf: python3 scripts/sprites-erzeugen/effekt-umbauen.py src/client/assets/effekt-sheets
Kein Zufall, keine Netzwerkanfrage; das Ergebnis hängt nur von den Vorlagen ab.
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

VORLAGEN = 'src/client/assets/material-texturen'

# Ringe: je Farbreihe die erste (größte) Zeile eines Blocks. (Blockanfang x, erste Frame-Kante, Zeile y0..y1)
# Gemessen über Spalten- und Zeilenprojektionen (Helligkeit > 25): 7 Frames im Abstand 34 px.
RINGE_REIHEN = [
    ('gelb', 85 + 7, 10, 41),
    ('violett', 85 + 6, 151, 182),
    ('rot', 85 + 6, 298, 329),
    ('orange', 370 + 5, 10, 40),
    ('blau', 370 + 6, 151, 181),
    ('rosa', 370 + 6, 298, 328),
]
RINGE_SCHRITT = 34
RINGE_QUELLE = 34   # Quellausschnitt je Frame (Frames sind 30-32 px groß)
RINGE_ZELLE = 72


def schwarz_zu_alpha(rgb):
    """RGB auf Schwarz → RGBA: Alpha = hellster Kanal, Farbe entmultipliziert (für `lighter` und `source-over`)."""
    a = rgb.max(axis=2).astype(np.float32)
    farbe = np.where(a[..., None] > 0, rgb.astype(np.float32) * 255.0 / np.maximum(a[..., None], 1), 0)
    out = np.dstack([np.clip(farbe, 0, 255), a]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def zelle_mit_rand(bild, kante, rand=3):
    """Bild in eine Zelle `kante` einpassen (Seitenverhältnis bleibt), mit `rand` Pixeln Abstand zum Rand."""
    innen = kante - 2 * rand
    k = innen / max(bild.width, bild.height)
    klein = bild.resize((max(1, round(bild.width * k)), max(1, round(bild.height * k))), Image.LANCZOS)
    z = Image.new('RGBA', (kante, kante), (0, 0, 0, 0))
    z.alpha_composite(klein, ((kante - klein.width) // 2, (kante - klein.height) // 2))
    return z


def ringe():
    quelle = np.asarray(Image.open(f'{VORLAGEN}/effekte/sheet-ringe-blasen-farben.png').convert('RGB'))
    out = Image.new('RGBA', (RINGE_ZELLE * 7, RINGE_ZELLE * len(RINGE_REIHEN)), (0, 0, 0, 0))
    for r, (_, x0, y0, y1) in enumerate(RINGE_REIHEN):
        cy = (y0 + y1) // 2
        for i in range(7):
            cx = x0 + 15 + RINGE_SCHRITT * i
            h = RINGE_QUELLE // 2
            stueck = quelle[cy - h:cy + h, cx - h:cx + h]
            # Die Vorlage ist Pixelgrafik; leicht weichgezeichnet passt sie zur Comic-Zeichnung der übrigen Sheets.
            z = zelle_mit_rand(schwarz_zu_alpha(stueck), RINGE_ZELLE).filter(ImageFilter.GaussianBlur(1.1))
            out.alpha_composite(z, (i * RINGE_ZELLE, r * RINGE_ZELLE))
    return out


def raster(datei, n, quelle_zelle, ausschnitt, ziel_zelle, spalten):
    """Schneidet aus einem n×n-Raster den Ausschnitt jeder nicht leeren Zelle und packt ihn neu."""
    q = Image.open(datei).convert('RGBA')
    a0, a1 = ausschnitt
    frames = []
    for r in range(n):
        for s in range(n):
            z = q.crop((s * quelle_zelle + a0, r * quelle_zelle + a0, s * quelle_zelle + a1, r * quelle_zelle + a1))
            if np.asarray(z)[..., 3].max() > 10:
                frames.append(z)
    zeilen = (len(frames) + spalten - 1) // spalten
    out = Image.new('RGBA', (ziel_zelle * spalten, ziel_zelle * zeilen), (0, 0, 0, 0))
    for i, z in enumerate(frames):
        out.alpha_composite(zelle_mit_rand(z, ziel_zelle), ((i % spalten) * ziel_zelle, (i // spalten) * ziel_zelle))
    return out, len(frames)


if __name__ == '__main__':
    ziel = sys.argv[1]
    bild = ringe()
    bild.save(f'{ziel}/ringe.webp', 'WEBP', quality=90, method=6)
    print('ringe', bild.size)
    # Wirbel: Inhalt liegt in x/y 34..67 jeder 100er-Zelle; Ausschnitt 30..70.
    bild, n = raster(f'{VORLAGEN}/effekte/sheet-wirbel-gruen-pink.png', 8, 100, (30, 70), 80, 8)
    bild.save(f'{ziel}/wirbel.webp', 'WEBP', quality=90, method=6)
    print('wirbel', bild.size, n, 'Frames')
    # Funken: Inhalt in 28..76; Ausschnitt 24..80.
    bild, n = raster(f'{VORLAGEN}/partikel-sheet-funken-blaetter.png', 7, 100, (24, 80), 64, 8)
    bild.save(f'{ziel}/funken.webp', 'WEBP', quality=90, method=6)
    print('funken', bild.size, n, 'Frames')
