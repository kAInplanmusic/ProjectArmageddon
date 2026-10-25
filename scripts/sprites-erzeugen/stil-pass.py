#!/usr/bin/env python3
"""
Stil-Pass fuer Figurenblätter (SPR-1/3/4/6, Entscheidungen 2026-10-25).

Drei getrennte Schritte, jeder einzeln aufrufbar und einzeln pruefbar:

  1. `--raeumen`  Splitter und Nadelstiche entfernen (SPR-1, SPR-3)
                  - Inseln unter `--splitter-max` Pixeln, die die Figur NICHT
                    beruehren, werden geloescht (Staub ausserhalb).
                  - Eingeschlossene Loecher unter `--loch-max` Pixeln werden
                    geschlossen (1-px-Nadelstiche im Inneren).
                  Beides ist messbar: Komponenten und Lochpixel sinken, die
                  groesste Komponente bleibt unveraendert.

  2. `--neon`     Neon-Linie fuer die Fraktion „pixel" (SPR-4)
                  Gemalte Ausreisser bekommen einen Farbzug in die
                  Fraktionsfarbe (`--neon-hue`, Standard 140 Grad = Gruen wie
                  `22_ethereo`), Saettigung angehoben — die Zeichnung bleibt.
                  Pixelierung und Paletten-Reduktion wurden gebaut, gesichtet
                  und VERWORFEN (2026-10-25): Sie zerstoerten Fell und Stacheln.
                  Bereits passende Figuren werden NICHT umgefaerbt — sie
                  bekommen nur `--raeumen`.

  3. `--randlicht` Randlicht fuer dunkle Figuren auf dunklem Gelaende (SPR-6)
                  Die Aussenkante der Silhouette wird um `--rand-breite` px
                  aufgehellt und leicht in die Fraktionsfarbe gezogen. Innen
                  bleibt die Figur unveraendert (kein Neocolor, nur Kante).

Aufruf (immer erst `--trocken`, das schreibt nichts):

    python3 scripts/sprites-erzeugen/stil-pass.py --raeumen --trocken \
        src/client/assets/characters/pixel/11_pyrowand-a.png

    python3 scripts/sprites-erzeugen/stil-pass.py --neon --randlicht \
        src/client/assets/characters/pixel/01_pyrofox-a.png

Regeln dieses Hauses, die hier gelten:
  - Nichts ohne Messung „verbessern": Jeder Lauf gibt VORHER/NACHHER aus.
  - Nur PNG unter `src/client/assets/characters/` anfassen (Schutz unten).
  - Die Quelldatei wird ueberschrieben; der Stand davor steht in git.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ERLAUBT = (Path("src/client/assets/characters"), Path("src/client/assets/characters-hd"))
ALPHA_SCHWELLE = 32
NEON_HUE_STANDARD = 140.0


def lies(pfad):
    return np.array(Image.open(pfad).convert("RGBA")).astype(np.int16)


def schreibe(pfad, a):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").save(pfad)


def vordergrund(a):
    return a[:, :, 3] > ALPHA_SCHWELLE


def komponenten(maske, verbindung=4):
    """Zerlegt eine Binaermaske in Zusammenhangskomponenten (BFS, ohne scipy)."""
    h, w = maske.shape
    seen = np.zeros_like(maske, dtype=bool)
    nachbarn = ((1, 0), (-1, 0), (0, 1), (0, -1))
    if verbindung == 8:
        nachbarn = nachbarn + ((1, 1), (1, -1), (-1, 1), (-1, -1))
    for y0, x0 in zip(*np.nonzero(maske)):
        if seen[y0, x0]:
            continue
        teil = []
        stapel = [(int(y0), int(x0))]
        seen[y0, x0] = True
        while stapel:
            y, x = stapel.pop()
            teil.append((y, x))
            for dy, dx in nachbarn:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and maske[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stapel.append((yy, xx))
        yield teil


def kennzahlen(a):
    """(Vordergrundpixel, Komponenten, groesste-Komponente-Anteil, Loecher, Lochpixel)."""
    fg = vordergrund(a)
    n = int(fg.sum())
    groessen = sorted((len(t) for t in komponenten(fg)), reverse=True)
    h, w = fg.shape
    leer = ~fg
    von_aussen = np.zeros_like(leer, dtype=bool)
    stapel = []
    for x in range(w):
        for y in (0, h - 1):
            if leer[y, x] and not von_aussen[y, x]:
                von_aussen[y, x] = True
                stapel.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if leer[y, x] and not von_aussen[y, x]:
                von_aussen[y, x] = True
                stapel.append((y, x))
    while stapel:
        y, x = stapel.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and leer[yy, xx] and not von_aussen[yy, xx]:
                von_aussen[yy, xx] = True
                stapel.append((yy, xx))
    loecher_maske = leer & ~von_aussen
    n_loecher = sum(1 for _ in komponenten(loecher_maske))
    return {
        "px": n,
        "teile": len(groessen),
        "groesster": (groessen[0] / n) if n else 0.0,
        "loecher": n_loecher,
        "lochpx": int(loecher_maske.sum()),
    }


def raeumen(a, splitter_max=12, loch_max=2):
    """Loescht freistehende Splitter und schliesst Nadelstiche (SPR-1/3)."""
    fg = vordergrund(a)
    h, w = fg.shape
    neu = a.copy()
    entfernt = 0
    # (a) Splitter: kleine Inseln, die nicht die groesste Komponente sind
    groessen = sorted(((len(t), t) for t in komponenten(fg)), reverse=True)
    for groesse, teil in groessen[1:]:
        if groesse > splitter_max:
            continue
        ys = [p[0] for p in teil]
        xs = [p[1] for p in teil]
        neu[ys, xs, 3] = 0
        entfernt += groesse
    # (b) Nadelstiche: eingeschlossene Loecher bis `loch_max` px fuellen
    fg2 = vordergrund(neu)
    leer = ~fg2
    von_aussen = np.zeros_like(leer, dtype=bool)
    stapel = []
    for x in range(w):
        for y in (0, h - 1):
            if leer[y, x] and not von_aussen[y, x]:
                von_aussen[y, x] = True
                stapel.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if leer[y, x] and not von_aussen[y, x]:
                von_aussen[y, x] = True
                stapel.append((y, x))
    while stapel:
        y, x = stapel.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and leer[yy, xx] and not von_aussen[yy, xx]:
                von_aussen[yy, xx] = True
                stapel.append((yy, xx))
    loecher = leer & ~von_aussen
    gefuellt = 0
    for teil in komponenten(loecher):
        if len(teil) > loch_max:
            continue
        # Farbe der Nachbarschaft mitteln (kein erfundenes Leuchten)
        ys = [p[0] for p in teil]
        xs = [p[1] for p in teil]
        summe = np.zeros(4)
        anzahl = 0
        for y, x in teil:
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and fg2[yy, xx]:
                    summe += a[yy, xx]
                    anzahl += 1
        if anzahl == 0:
            continue
        mitte = summe / anzahl
        neu[ys, xs] = mitte
        neu[ys, xs, 3] = 255
        gefuellt += len(teil)
    return neu, entfernt, gefuellt


def neon(a, hue_ziel=NEON_HUE_STANDARD, zug=0.70, saettigung=1.35):
    """Zieht die Farben einer Figur in die Fraktionslinie (SPR-4, Neon-Linie).

    NUR Farbgrading — kein Pixelieren, keine Paletten-Reduktion. Beides wurde
    am 2026-10-25 gebaut, angewendet und VERWORFEN: Bei Faktor 4 und 10 Stufen
    zerfiel besonders der Igel (`12_shieldmon`) zu einem gruenen Blockmuster,
    und der Fuchs verlor jede Fellzeichnung (Vorschau vorher/nachher gesichtet).
    Die Fraktion wird ueber den Farbton zusammengehalten, nicht ueber Aufloesung.
    """
    import colorsys

    b = a.astype(np.float64).copy()
    hgt, breite = b.shape[:2]
    flach = b[:, :, :3].reshape(-1, 3) / 255.0
    hue_soll = hue_ziel / 360.0
    for i, (r, g, bl) in enumerate(flach):
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, bl)
        if vv <= 0.02:
            continue
        # Ein Teil der Distanz zum Ziel-Hue: volle Umdrehung macht aus Fell
        # eine Flaeche; so bleibt die Zeichnung lesbar.
        delta = (hue_soll - hh + 0.5) % 1.0 - 0.5
        hh = (hh + zug * delta) % 1.0
        ss = min(1.0, ss * saettigung)
        flach[i] = colorsys.hsv_to_rgb(hh, ss, vv)
    b[:, :, :3] = flach.reshape(hgt, breite, 3) * 255
    b[:, :, 3] = a[:, :, 3]
    return np.clip(b, 0, 255)


def randlicht(a, breite=1, helligkeit=70, hue=140.0):
    """Hellt die Aussenkante der Silhouette auf (SPR-6, dunkle Figuren)."""
    fg = vordergrund(a)
    h, w = fg.shape
    kante = np.zeros_like(fg)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        verschoben = np.zeros_like(fg)
        y0, y1 = max(0, dy), h + min(0, dy)
        x0, x1 = max(0, dx), w + min(0, dx)
        verschoben[y0:y1, x0:x1] = fg[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
        kante |= fg & ~verschoben
    for _ in range(max(0, breite - 1)):
        wachstum = kante.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            y0, y1 = max(0, dy), h + min(0, dy)
            x0, x1 = max(0, dx), w + min(0, dx)
            wachstum[y0:y1, x0:x1] |= kante[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
        kante = wachstum & fg
    neu = a.astype(np.float64)
    # Ziel: das Fraktionsgruen der Pixel-Linie (derselbe Ton wie `22_ethereo`).
    ziel = np.array([60, 200, 120])
    neu[kante, :3] = np.clip(neu[kante, :3] * (1 - helligkeit / 255) + ziel * (helligkeit / 255), 0, 255)
    return neu


def main():
    p = argparse.ArgumentParser(description="Stil-Pass fuer Figurenblaetter")
    p.add_argument("dateien", nargs="+")
    p.add_argument("--raeumen", action="store_true")
    p.add_argument("--neon", action="store_true")
    p.add_argument("--randlicht", action="store_true")
    p.add_argument("--splitter-max", type=int, default=12)
    p.add_argument("--loch-max", type=int, default=2)
    p.add_argument("--neon-hue", type=float, default=NEON_HUE_STANDARD)
    p.add_argument("--neon-zug", type=float, default=0.70)
    p.add_argument("--neon-saettigung", type=float, default=1.35)
    p.add_argument("--rand-breite", type=int, default=1)
    p.add_argument("--rand-helligkeit", type=int, default=70)
    p.add_argument("--trocken", action="store_true", help="nur messen, nichts schreiben")
    args = p.parse_args()

    if not (args.raeumen or args.neon or args.randlicht):
        sys.exit("Mindestens einen Schritt waehlen: --raeumen, --neon, --randlicht")

    for datei in args.dateien:
        pfad = Path(datei)
        if not any(p in pfad.parents for p in ERLAUBT):
            sys.exit(f"Abgelehnt (nicht unter {[str(p) for p in ERLAUBT]}): {pfad}")
        if pfad.suffix.lower() != ".png":
            sys.exit(f"Abgelehnt (nur PNG): {pfad}")

        a = lies(pfad)
        vorher = kennzahlen(a)
        b = a
        notiz = []
        if args.raeumen:
            b, entfernt, gefuellt = raeumen(b, args.splitter_max, args.loch_max)
            notiz.append(f"Splitter entfernt: {entfernt}px, Loecher gefuellt: {gefuellt}px")
        if args.neon:
            b = neon(b, args.neon_hue, args.neon_zug, args.neon_saettigung)
            notiz.append(f"Neon-Pass: Hue {args.neon_hue:.0f} Grad, Zug {args.neon_zug:.2f}, "
                         f"Saettigung {args.neon_saettigung:.2f}")
        if args.randlicht:
            b = randlicht(b, args.rand_breite, args.rand_helligkeit)
            notiz.append(f"Randlicht: {args.rand_breite}px, Helligkeit {args.rand_helligkeit}")
        nachher = kennzahlen(b)

        print(f"{pfad}")
        print(f"   VORHER : px={vorher['px']} Teile={vorher['teile']} groesster={vorher['groesster']:.2f} "
              f"Loecher={vorher['loecher']} Lochpx={vorher['lochpx']}")
        for n in notiz:
            print(f"   SCHRITT: {n}")
        print(f"   NACHHER: px={nachher['px']} Teile={nachher['teile']} groesster={nachher['groesster']:.2f} "
              f"Loecher={nachher['loecher']} Lochpx={nachher['lochpx']}")
        if not args.trocken:
            schreibe(pfad, b)
            print("   geschrieben.")
        else:
            print("   (trocken — nichts geschrieben)")


if __name__ == "__main__":
    main()
