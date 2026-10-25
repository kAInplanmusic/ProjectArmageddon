#!/usr/bin/env python3
"""Entfernt liegengebliebene Gitterlinien aus fertigen Sprite-Sheets.

## Der Befund (SPR-5, 2026-10-25)

`schneide.py` entfernt die Gitterlinien der Bildvorlage mit einer morphologischen
Öffnung: `binary_opening(fg, structure=np.ones((6,3)))`. Ein senkrechter Strich
von 1-2 px Breite verschwindet dadurch — **solange er frei steht**. Läuft er
durch die Figur, ist die Maske an dieser Stelle breiter als das Strukturelement,
die Öffnung greift nicht, und der Strich bleibt als senkrechte schwarze Linie
über die ganze Zelle stehen. Bei `shinobi/11_rauch-meister-genzi__aktion` ist das
in **allen acht** Zellen passiert, bei `undead/10_archer-mortis__aktion` (Zelle 3)
und `xeno/12_plasma-maw-zorg__walk` (Zellen 5 und 7) vereinzelt.

Sichtbar ist das als dünne schwarze Linie, die auch im Liegen senkrecht steht —
die Figur hat keinen Stab. Es ist ein Rest der Vorlage, kein Inhalt.

## Was dieses Werkzeug tut

Es sucht je Zelle Spalten, die über mindestens 75 % der Zellhöhe fast schwarz
sind und höchstens 4 px breit — genau die Signatur des Strichs. Für jedes solche
Pixel:

- stehen links **und** rechts des Strichs nur durchsichtige Pixel, wird es
  durchsichtig (der Strich verschwindet aus dem leeren Raum),
- steht auf einer Seite die Figur, wird deren Farbe übernommen (der Strich
  verschwindet aus dem Körper, ohne ein Loch zu stanzen).

Nur fast schwarze Pixel werden angefasst; helle Farben der Figur bleiben
unberührt.

## Benutzung

    python3 scripts/sprites-erzeugen/streifen-entfernen.py --trocken   # nur zeigen
    python3 scripts/sprites-erzeugen/streifen-entfernen.py             # schreiben

Nach dem Schreiben prüft derselbe Lauf erneut und meldet, was übrig blieb.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.abspath(os.path.join(HIER, '..', '..'))
SHEETS = os.path.join(WURZEL, 'src', 'client', 'assets', 'sprite-sheets')

# Schwellen: ein Strich ist fast schwarz, sehr hoch und sehr schmal.
DUNKEL_MAX = 30
HOEHE_ANTEIL = 0.75
MAX_BREITE = 4


def finde_streifen(a, zelle, spalten, zeilen):
    """Gibt [(zelle, xa, xb)] für alle Strichgruppen im Blatt zurück."""
    opak = a[:, :, 3] > 8
    dunkel = opak & (a[:, :, :3].max(axis=2) < DUNKEL_MAX)
    treffer = []
    for i in range(spalten * zeilen):
        c, r = i % spalten, i // spalten
        x0, y0 = c * zelle, r * zelle
        je_spalte = dunkel[y0:y0 + zelle, x0:x0 + zelle].sum(axis=0)
        kandidaten = [x for x in range(zelle) if je_spalte[x] > HOEHE_ANTEIL * zelle]
        if not kandidaten:
            continue
        gruppen = []
        for x in kandidaten:
            if gruppen and x - gruppen[-1][-1] == 1:
                gruppen[-1].append(x)
            else:
                gruppen.append([x])
        for g in gruppen:
            if len(g) <= MAX_BREITE:
                treffer.append((i, g[0], g[-1]))
    return treffer


def entferne(blatt, zelle=256, spalten=4, zeilen=2):
    """Entfernt die Strichgruppen; gibt (neues Blatt, Anzahl gefundener Striche) zurück."""
    a = np.array(blatt.convert('RGBA'))
    streifen = finde_streifen(a, zelle, spalten, zeilen)
    if not streifen:
        return blatt, 0

    h, w = a.shape[:2]
    # Der Strich ist im fertigen Blatt breiter als die gefundene Gruppe: neben
    # dem Kern steht ein weicher Rand mittlerer Deckkraft. Ein Pixel DIREKT
    # neben der Gruppe ist deshalb oft selbst noch Strich — im ersten Anlauf hat
    # das Werkzeug genau diesen Rand zurueckkopiert, und die Linie blieb stehen
    # (sichtbar in shinobi/11_rauch-meister-genzi__aktion, Zelle 3).
    # Darum: ganze Zone (Gruppe +-1) ersetzen, Ersatzfarbe erst dort holen, wo
    # wirklich Figur steht (Deckkraft ueber 128, bis 8 px entfernt).
    RAND_MAX = 60
    SUCHWEITE = 8
    VOLL = 128

    for i, xa, xb in streifen:
        c, r = i % spalten, i // spalten
        x0, y0 = c * zelle, r * zelle
        for x in range(x0 + xa - 1, x0 + xb + 2):
            if x < x0 or x >= x0 + zelle or x >= w:
                continue
            for y in range(y0, y0 + zelle):
                if not (a[y, x, 3] > 8 and a[y, x, :3].max() < RAND_MAX):
                    continue
                links = rechts = None
                for d in range(2, SUCHWEITE + 1):
                    xl = x0 + xa - d
                    if xl >= x0 and a[y, xl, 3] > VOLL:
                        links = a[y, xl].copy()
                        break
                for d in range(2, SUCHWEITE + 1):
                    xr = x0 + xb + d
                    if xr < x0 + zelle and xr < w and a[y, xr, 3] > VOLL:
                        rechts = a[y, xr].copy()
                        break

                if links is not None and rechts is not None:
                    a[y, x, :3] = ((int(links[0]) + int(rechts[0])) // 2,
                                   (int(links[1]) + int(rechts[1])) // 2,
                                   (int(links[2]) + int(rechts[2])) // 2)
                    a[y, x, 3] = max(links[3], rechts[3])
                elif links is not None or rechts is not None:
                    a[y, x] = links if links is not None else rechts
                else:
                    a[y, x] = (0, 0, 0, 0)
    return Image.fromarray(a, 'RGBA'), len(streifen)


def main():
    trocken = '--trocken' in sys.argv
    man = json.load(open(os.path.join(SHEETS, 'manifest.json')))
    zelle, spalten, zeilen = man['zelle'], man['spalten'], man['zeilen']

    dateien = sorted(glob.glob(os.path.join(SHEETS, '*', '*.webp')))
    gesamt = 0
    geaendert = 0
    for pfad in dateien:
        blatt = Image.open(pfad)
        neu, anzahl = entferne(blatt, zelle, spalten, zeilen)
        if not anzahl:
            continue
        gesamt += anzahl
        rel = os.path.relpath(pfad, SHEETS)
        print(f"  {rel:52s} {anzahl} Strich(e)")
        if not trocken:
            neu.save(pfad, 'WEBP', lossless=True, quality=100)
            geaendert += 1

    print(f"\nGeprüft: {len(dateien)} Blätter · Striche gefunden: {gesamt}")
    if trocken:
        print("Trockenlauf — nichts geschrieben.")
        return
    print(f"Geschrieben: {geaendert} Blatt/Blätter")
    # Nachkontrolle mit demselben Maßstab
    rest = 0
    for pfad in dateien:
        blatt = Image.open(pfad)
        _, anzahl = entferne(blatt, zelle, spalten, zeilen)
        rest += anzahl
    print(f"Nachkontrolle: {rest} Strich(e) übrig")
    sys.exit(0 if rest == 0 else 1)


if __name__ == '__main__':
    main()
