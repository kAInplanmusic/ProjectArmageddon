#!/usr/bin/env python3
"""
B1 / SPR-4: Rohblätter (4x2, grüner Grund) der 8-Bit-pixel-Figuren in das Spielformat bringen.

Spielformat wie alle Figurenblätter: 1024x512 WebP, 4x2 Zellen à 256 px, Fuß auf y = 240
(`scripts/sprite-sheets-klassifizieren.py`). Anders als `schneide.py` (LANCZOS, weiche Kanten) bleibt
hier das Pixelraster hart:

  1. Zelle freistellen: Randflutung + enge Grünschwelle (`schneide.frei_sauber`, für grüne Figuren gebaut).
  2. Gemeinsamer Maßstab je Blatt: Median der Zellhöhen -> STEH_HOEHE logische Pixel.
  3. Jede Zelle per BOX auf das logische Raster, Alpha hart, Farben auf die gemeinsame 16er-Palette
     der Figur (aus allen drei Blättern), dann ohne Glättung x FAKTOR hochskaliert.
  4. Fuß auf y = 240, waagerecht mittig.

Aufruf:
    python3 scripts/sprites-erzeugen/b1-blaetter.py --roh /tmp/pa-b1-blaetter --ziel src/client/assets/sprite-sheets/pixel
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER))
from schneide import zellen, frei_sauber  # noqa: E402

ZELLE, BODEN = 256, 240
STEH_HOEHE = 44      # logische Pixel einer stehenden Figur (x FAKTOR = 220 px wie die bisherigen Blätter)
FAKTOR = 5
FARBEN = 16
BLAETTER = ("walk", "aktion", "zustand", "emotion")


def figuren_finden(pfad):
    """Acht Figuren eines Rohblatts als zusammenhängende Flächen statt starrer Zellen.

    Grund: Im Rohblatt ragen breite Figuren (Kopfkamm, Schweif) über die gedachte Zellgrenze; ein starres
    4x2-Raster schnitt Köpfe ab (Probe 00_nullpointer-exception, 2026-11-10). Hier: ganzes Blatt freistellen,
    Flächen mit kleiner Dehnung zusammenfassen (abstehende Teile bleiben bei ihrer Figur), die acht größten
    nehmen, nach Zeile und dann Spalte sortieren. Gelingt das nicht (weniger als 8 Flächen), Rückfall auf
    das starre Raster.
    """
    import numpy as np
    from scipy import ndimage as ndi
    ganz = Image.open(pfad).convert("RGB")
    frei = frei_sauber(ganz)
    if frei is None:
        return [frei_sauber(z) for z in zellen(pfad)]
    a = np.asarray(frei)
    maske = a[..., 3] >= 128
    # Dehnung schrittweise kleiner: dicht stehende Figuren (Gehzyklus) dürfen nicht verschmelzen.
    for dehnung in (6, 3, 1, 0):
        lab, k = ndi.label(ndi.binary_dilation(maske, iterations=dehnung) if dehnung else maske)
        if k < 8:
            continue
        groesse = ndi.sum(maske, lab, range(1, k + 1))
        beste = sorted(range(1, k + 1), key=lambda i: -groesse[i - 1])[:8]
        if groesse[beste[-1] - 1] >= 0.15 * groesse[beste[0] - 1]:
            break
    else:
        print(f"  Rückfall auf starres Raster: {Path(pfad).name}", flush=True)
        return [frei_sauber(z) for z in zellen(pfad)]
    lagen = []
    for i in beste:
        sl = ndi.find_objects((lab == i).astype(int))[0]
        lagen.append(((sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2, i, sl))
    mitte_y = sorted(l[0] for l in lagen)
    grenze = (mitte_y[3] + mitte_y[4]) / 2
    lagen.sort(key=lambda l: (l[0] > grenze, l[1]))
    teile = []
    for _, _, i, sl in lagen:
        teil = a.copy()
        teil[..., 3] = np.where((lab == i) & maske, teil[..., 3], 0)
        bild = Image.fromarray(teil[sl[0], sl[1]], "RGBA")
        teile.append(bild)
    return teile


def figurpalette(teile):
    pixel = []
    for t in teile:
        if t is None:
            continue
        pixel += [p[:3] for p in t.getdata() if p[3] >= 128]
    if not pixel:
        pixel = [(0, 0, 0)]
    streifen = Image.new("RGB", (len(pixel), 1))
    streifen.putdata(pixel)
    return streifen.quantize(colors=FARBEN, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def logisch(teil, massstab):
    kasten = teil.getbbox()
    t = teil.crop(kasten)
    w = max(1, round(t.width * massstab))
    h = max(1, round(t.height * massstab))
    # Nie breiter/höher als die Zelle erlaubt (liegende Posen sind breit).
    grenze = min(1.0, ((ZELLE - 16) // FAKTOR) / w, ((BODEN - 8) // FAKTOR) / h)
    w, h = max(1, int(w * grenze)), max(1, int(h * grenze))
    return t.resize((w, h), Image.BOX)


def figur(roh, name):
    """Alle drei Blätter einer Figur; gemeinsame Palette, je Blatt eigener Maßstab."""
    teile = {}
    for b in BLAETTER:
        pfad = roh / f"pixel__{name}__{b}__tog.png"
        teile[b] = figuren_finden(pfad) if pfad.exists() else None
    alle = [t for ts in teile.values() if ts for t in ts if t is not None]
    palette = figurpalette([t.resize((max(1, t.width // 4), max(1, t.height // 4)), Image.BOX) for t in alle])
    ergebnis = {}
    for b, ts in teile.items():
        if not ts:
            continue
        hoehen = sorted(t.getbbox()[3] - t.getbbox()[1] for t in ts if t is not None and t.getbbox())
        massstab = STEH_HOEHE / hoehen[len(hoehen) // 2]
        blatt = Image.new("RGBA", (ZELLE * 4, ZELLE * 2), (0, 0, 0, 0))
        for i, t in enumerate(ts):
            if t is None or not t.getbbox():
                continue
            k = logisch(t, massstab)
            alpha = k.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
            k = k.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
            k.putalpha(alpha)
            g = k.resize((k.width * FAKTOR, k.height * FAKTOR), Image.NEAREST)
            x = (i % 4) * ZELLE + (ZELLE - g.width) // 2
            y = (i // 4) * ZELLE + BODEN - g.height
            blatt.paste(g, (x, y), g)
        ergebnis[b] = blatt
    return ergebnis


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--roh", required=True)
    ap.add_argument("--ziel", required=True)
    ap.add_argument("--figur", action="append", help="nur diese Figur(en); Standard: alle mit Rohblatt")
    a = ap.parse_args()
    roh, ziel = Path(a.roh), Path(a.ziel)
    ziel.mkdir(parents=True, exist_ok=True)
    namen = a.figur or sorted({p.name.split("__")[1] for p in roh.glob("pixel__*__tog.png")})
    for name in namen:
        for b, blatt in figur(roh, name).items():
            blatt.save(ziel / f"{name}__{b}.webp", lossless=True)
            print(f"{name} {b}: ok", flush=True)


if __name__ == "__main__":
    main()
