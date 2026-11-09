#!/usr/bin/env python3
"""Semantische Waffenanker (BAL-08): Tabelle lesen, Anker aus Zelle und Tabelle setzen.

Die Tabelle `scripts/waffen-anker-tabelle.json` ist die einzige Quelle der Anker.
Je Waffe steht dort `halt`:

  heft    - die Waffe hat ein nutzbares Heft; `heft: [x, y]` nennt den Punkt, an dem
            die Hand greift (Zellpixel der held-Zelle). Kein Schaetzwert: der Punkt
            ist gesetzt und wird hier nur geprueft (im Umriss, auf deckendem Pixel).
  koerper - kein gefuehrtes Heft (Granate, Karte, Wesen, Geraet); Griff = Schwerpunkt
            der Deckflaeche, dokumentiert als "am Koerper gehalten".

Die Muendung (Wirkspitze) liegt in beiden Faellen am tatsaechlichen Ende der Waffe:
rechte Kante der Deckflaeche, auf der Achsenhoehe des Griffs. Damit gibt es weder
eine Schaetzung des Griffs aus dem Randabstand noch eine Muendung mitten im Lauf.
"""

import json
import math
import os

import numpy as np

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
TABELLE = os.path.join(WURZEL, "scripts", "waffen-anker-tabelle.json")
HALT_ARTEN = ("heft", "koerper")
WIRK_ARTEN = ("spitze", "kopf", "muendung", "vorn")


def lade_tabelle(pfad=TABELLE):
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    return {k: v for k, v in daten["waffen"].items() if not k.startswith("_")}


def pruefe_tabelle(tabelle, ids):
    """Vollstaendigkeit und Form der Tabelle; wirft mit klarer Meldung."""
    fehlend = [i for i in ids if i not in tabelle]
    fremd = [i for i in tabelle if i not in ids]
    if fehlend:
        raise SystemExit(f"Ankertabelle: {len(fehlend)} Waffen ohne Eintrag: {fehlend[:8]}")
    if fremd:
        raise SystemExit(f"Ankertabelle: Eintraege ohne Katalogwaffe: {fremd[:8]}")
    for wid, e in tabelle.items():
        if e.get("halt") not in HALT_ARTEN:
            raise SystemExit(f"{wid}: halt {e.get('halt')!r} ist keine von {HALT_ARTEN}")
        if e.get("wirkt") not in WIRK_ARTEN:
            raise SystemExit(f"{wid}: wirkt {e.get('wirkt')!r} ist keine von {WIRK_ARTEN}")
        if e["halt"] == "heft":
            h = e.get("heft")
            if not (isinstance(h, list) and len(h) == 2 and all(isinstance(v, int) for v in h)):
                raise SystemExit(f"{wid}: halt=heft braucht heft=[x,y] in Zellpixeln")
        elif "heft" in e:
            raise SystemExit(f"{wid}: halt=koerper darf keinen Heftpunkt tragen")
        if not isinstance(e.get("grund", ""), str):
            raise SystemExit(f"{wid}: grund muss Text sein")


def _achse(alpha, x):
    """Mitte der Deckflaeche in Spalte x (naechster Maskenpunkt, wenn sie leer ist)."""
    spalte = np.nonzero(alpha[:, x])[0]
    if len(spalte):
        return int(round((spalte.min() + spalte.max()) / 2.0))
    ys, xs = np.nonzero(alpha)
    naechste = xs[np.abs(xs - x).argmin()]
    spalte = np.nonzero(alpha[:, naechste])[0]
    return int(round((spalte.min() + spalte.max()) / 2.0))


def _heftspanne(alpha, gx, gy):
    """Zusammenhaengender Bereich um den Griff, in dem die Waffe heftbreit ist.

    Breite = Zeilenausdehnung der Deckflaeche in der Spalte. Die Spanne endet, wo die
    Waffe deutlich dicker wird (Kopf, Klinge, Lauf) oder die Deckflaeche aufhoert; sie
    ist auf +-12 Zellenpixel begrenzt, weil sie das Heft um den Griff bezeichnet und
    nicht den halben Schaft.
    """
    dicke = alpha.sum(axis=0).astype(int)
    grenze = max(4, int(round(dicke[gx] * 1.4)))
    links = gx
    while links - 1 >= 0 and 0 < dicke[links - 1] <= grenze:
        links -= 1
    rechts = gx
    while rechts + 1 < alpha.shape[1] and 0 < dicke[rechts + 1] <= grenze:
        rechts += 1
    return [int(max(links, gx - 12)), int(min(rechts, gx + 12))]


def _muendung(a, x1, gy):
    """Aeusserster Materialpunkt am rechten Ende, Zeile naechst der Griffhoehe."""
    for x in range(x1, max(x1 - 4, -1), -1):
        zeilen = np.nonzero(a[:, x])[0]
        if len(zeilen):
            return x, int(zeilen[np.abs(zeilen - gy).argmin()])
    return x1, gy


def anker_aus_tabelle(held, wid, eintrag):
    """Anker (grip, muzzle) und Heftspanne einer held-Zelle aus Tabelleneintrag.

    @param held: PIL-Bild der 128er-Zelle (RGBA)
    @returns dict wie im Manifest: {grip, muzzle, source: 'semantik', halt, heft}
    """
    a = np.asarray(held)[..., 3] > 100
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        raise SystemExit(f"{wid}: Zelle ist leer")
    x0, x1 = int(xs.min()), int(xs.max())
    if eintrag["halt"] == "heft":
        gx, gy = eintrag["heft"]
        if not (0 <= gx < a.shape[1] and 0 <= gy < a.shape[0]):
            raise SystemExit(f"{wid}: Heftpunkt ({gx},{gy}) liegt ausserhalb der Zelle")
        if not a[gy, gx]:
            raise SystemExit(f"{wid}: Heftpunkt ({gx},{gy}) liegt nicht auf der Waffe")
        # Der Griff muss am Heft liegen, nicht hinter dem Waffenende.
        if gx < x0 or gx > x1:
            raise SystemExit(f"{wid}: Heftpunkt x={gx} liegt ausserhalb der Waffe ({x0}..{x1})")
        spanne = _heftspanne(a, gx, gy)
        if eintrag.get("muzzle"):
            # Gesetzte Muendung fuer Rohre, die nicht bis an den Zellrand reichen (Moerser,
            # Haubitze): der aeusserste Rand der Zelle waere dort die Lafette bzw. ein Rahmen.
            mx, my = eintrag["muzzle"]
            if not (0 <= mx < a.shape[1] and 0 <= my < a.shape[0] and a[my, mx]):
                raise SystemExit(f"{wid}: gesetzte Muendung ({mx},{my}) liegt nicht auf der Waffe")
            if mx <= gx:
                raise SystemExit(f"{wid}: gesetzte Muendung ({mx},{my}) liegt nicht vor dem Griff")
        else:
            # Muendung: aeusserste Spalte mit Material, dort die Zeile naechst der Achsenhoehe
            # des Griffs. So liegt der Punkt auf der Waffe und am tatsaechlichen Ende; bei
            # schraeg stehendem Kopf (Axt, Sense) ergibt sich daraus die Achse der Waffe.
            mx, my = _muendung(a, x1, gy)
        return {
            "grip": {"x": int(gx), "y": int(gy)},
            "muzzle": {"x": int(mx), "y": int(my)},
            "source": "semantik",
            "halt": eintrag["halt"],
            "heft": spanne,
            # Gespiegelt, damit das Wirkende nach rechts zeigt (Zelle kam mit Wirkende links).
            "spiegeln": bool(eintrag.get("spiegeln")),
            # Muendung aus der Tabelle gesetzt (Rohr erreicht den Zellrand nicht).
            "fest": bool(eintrag.get("muzzle")),
        }
    else:
        # Kein gefuehrtes Heft: Griff = Schwerpunkt, Wirkung waagerecht nach vorn.
        gx = int(round(xs.mean()))
        gy = _achse(a, gx)
        if not a[gy, gx]:
            # Schwerpunkt faellt in eine Luecke (z. B. Faust mit Oeffnung): naechster Pixel.
            d = (xs - gx) ** 2 + (ys - gy) ** 2
            j = int(d.argmin())
            gx, gy = int(xs[j]), int(ys[j])
        spanne = [gx, gx]
        return {
            "grip": {"x": int(gx), "y": int(gy)},
            "muzzle": {"x": int(x1), "y": int(gy)},
            "source": "semantik",
            "halt": eintrag["halt"],
            "heft": spanne,
            # Gespiegelt, damit das Wirkende nach rechts zeigt (Zelle kam mit Wirkende links).
            "spiegeln": bool(eintrag.get("spiegeln")),
            "fest": False,
        }


def achsenneigung(anker):
    """Neigung der Achse Griff -> Muendung in Radiant (fuer die Ausrichtung im Renderer)."""
    dx = anker["muzzle"]["x"] - anker["grip"]["x"]
    dy = anker["muzzle"]["y"] - anker["grip"]["y"]
    if dx == 0 and dy == 0:
        return 0.0, 0.0
    return math.atan2(dy, dx), math.hypot(dx, dy)
