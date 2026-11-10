#!/usr/bin/env python3
"""Fotos des Auftraggebers (2026-11-10) als Panorama-Kulissen übernehmen.

Die Fotos werden 1:1 übernommen (kein Stilwechsel, kein Hochskalieren). Nur gezielte Zuschnitte:
Personen und der Hund werden herausgeschnitten, der verzerrte Fischaugenrand entfällt, Hochformate
werden auf einen Querstreifen um den Horizont gebracht. Metadaten (EXIF, GPS) werden nicht übernommen.
Der Renderer zeichnet Fotokulissen bildfüllend und schwenkt mit der Kamera; breite Panoramen bleiben deshalb breit.

Ausgabe je Kennung in src/client/assets/panoramen/:
  <id>.webp       Quelle in voller Auflösung (nicht im Build)
  <id>-1280.webp  kleine Stufe (Höhe höchstens 720 px)
  <id>-sdr.avif   große Stufe (volle Auflösung)
und Einträge in manifest.json (SHA-256, Bytes, Maße).

Aufruf (Repo-Wurzel): python3 scripts/panoramen-fotos.py QUELLORDNER
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ZIEL = Path('src/client/assets/panoramen')
# Kennung: (Datei im Quellordner, Zuschnitt (l, o, r, u) oder None)
FOTOS = {
    'western_regenbogen': ('5365de15-image.png', None),
    'maisfeld_sw': ('01510d12-image.jpg', (0, 0, 1716, 1180)),
    'huegelweide': ('b931b3ad-image.jpg', (0, 0, 2576, 1600)),
    'feldweg_morgen': ('b3d38bd9-image.jpg', None),
    'schaefchenwolken': ('dd9d7f6a-image.jpg', (0, 0, 1980, 942)),
    'abendrot_silhouette': ('967f41cd-image.jpg', None),
    'sonnenuntergang_feld': ('1ed0f7dd-image.jpg', None),
    'baum_wegegabelung': ('6d409830-image.jpg', None),
    'schneegarten': ('d0ca5d2c-image.jpg', None),
    'palmenstrand_fluss': ('2abb52cb-image.jpg', (0, 0, 1880, 598)),
    'stadt_morgenrot': ('0c3f0a87-image.jpg', None),
    'nebelmorgen_scheune': ('9107302a-image.jpg', None),
    'nachtstadt_lichter': ('033d5911-image.jpg', None),
    'strand_ebbe': ('faeec5d9-image.jpg', None),
    'fluss_goldhaus': ('1647ea33-image.jpg', (0, 860, 916, 1420)),
    'rosa_abend': ('9b27ae7f-image.jpg', None),
    'herbstwiese': ('7e6cda99-image.jpg', None),
    'nachtstrasse_boden': ('9685004d-image.jpg', None),
    'nachtstrasse_sw': ('5cf4063f-image.jpg', None),
    # Zweite Lieferung (2026-11-10, 16:19). Nicht übernommen: Red-Rocks-Amphitheater (Personen, Herkunft
    # ungeklärt), Bildschirmfoto einer Bildergalerie (fremdes Bild mit Bedienelementen), Schwarzlicht-Wandbild
    # (fremdes Kunstwerk mit Webadresse) — bis der Auftraggeber die Rechte bestätigt.
    'schotterweg_horizont': ('f6e5f038-image.jpg', (0, 250, 1512, 1300)),
    'rosa_glut_feld': ('456da4b1-image.jpg', (0, 500, 2576, 2000)),
    'gewitter_abendrot': ('e7bca755-image.jpg', (0, 350, 1542, 1950)),
    'birke_gemaelde': ('3dfc8700-image.png', None),
    'sonne_ueber_wald': ('3e61fa15-image.jpg', (0, 700, 1190, 2000)),
    'sonnenstrahlen_felder': ('d45aca8d-image.jpg', None),
    'klondike_schnee': ('6e6079ea-image.png', None),
    'sonnenaufgang_zaun': ('ea315efc-image.jpg', None),
    'alpendorf_herbst': ('896a06c8-image.jpg', (0, 250, 1500, 1280)),
    'baum_weitblick': ('55767613-image.jpg', None),
    'bergsee': ('e57cf0b5-image.jpg', None),
    'schnee_alpendorf': ('008117fb-image.jpg', None),
    'herbstbaeume_dunst': ('80d3fa2d-image.png', (0, 694, 828, 1094)),
    'nachtstadt_tal': ('9697ce0f-image.jpg', None),
    'halbmond_huegel': ('9500d923-image.jpg', (0, 450, 1350, 1550)),
    'moosboden_wald': ('56fc4bb9-image.jpg', (0, 200, 1512, 1400)),
    'nachtstadt_tal_2': ('bf4dc55f-image.jpg', None),
}


def eintrag(pfad, laufzeit):
    b = pfad.read_bytes()
    with Image.open(pfad) as im:
        w, h = im.size
    return {'file': pfad.name, 'width': w, 'height': h, 'bytes': len(b),
            'sha256': hashlib.sha256(b).hexdigest(), 'runtime': laufzeit}


def main():
    quelle = Path(sys.argv[1])
    man_pfad = ZIEL / 'manifest.json'
    manifest = json.loads(man_pfad.read_text())
    namen = {f'{i}{e}' for i in FOTOS for e in ('.webp', '-1280.webp', '-sdr.avif')}
    manifest = [m for m in manifest if m['file'] not in namen]
    for kennung, (datei, schnitt) in FOTOS.items():
        with Image.open(quelle / datei) as roh:
            bild = ImageOps.exif_transpose(roh).convert('RGB')   # neues Bild ohne Metadaten
        if schnitt:
            bild = bild.crop(schnitt)
        bild.save(ZIEL / f'{kennung}.webp', quality=90, method=6)
        bild.save(ZIEL / f'{kennung}-sdr.avif', format='AVIF', quality=50, speed=6)
        klein = bild if bild.height <= 720 else bild.resize((round(bild.width * 720 / bild.height), 720), Image.LANCZOS)
        klein.save(ZIEL / f'{kennung}-1280.webp', quality=78, method=6)
        manifest += [eintrag(ZIEL / f'{kennung}{e}', e != '.webp') for e in ('-1280.webp', '-sdr.avif', '.webp')]
        print(kennung, bild.size)
    manifest.sort(key=lambda m: m['file'])
    man_pfad.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
