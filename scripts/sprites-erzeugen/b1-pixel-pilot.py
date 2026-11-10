#!/usr/bin/env python3
"""
B1 / SPR-4 Pilot: eine Figur der Fraktion „pixel" als echte 8-Bit-Figur NEU erzeugen.

Auftrag: `docs/auftraege/bildagenten-2026-11-09.md`, Paket B1 (Entscheidung des Auftraggebers:
neu erzeugte 8-Bit-Figuren, kein Filter auf die alten Bilder).

Ablauf je Ansicht (Porträt `characters/`, Seite `characters-side/`):
  1. Bildmodell erzeugt die Figur neu, mit dem vorhandenen Bild als Referenz für Identität
     (Name, Rolle, Silhouette) und einem Prompt für 8-Bit-Pixelkunst auf grünem Grund.
  2. Pixel-Raster: Grün freistellen, auf das Figurenrechteck zuschneiden, auf ein logisches
     Raster von höchstens 32 px Höhe verkleinern, auf höchstens 16 Farben reduzieren, ohne
     Glättung auf 256 px hochskalieren, Fuß unten mittig (wie die alten Bilder).
  3. Kontaktbogen: alt neben neu, dazu 24-px-Probe für das HUD.

Geschrieben wird NUR in `--ziel` (Standard `/tmp/pa-b1`). Die ausgelieferten Bilder unter
`src/client/assets/` bleiben unberührt, bis der Auftraggeber den Kontaktbogen freigibt (B1, Schritt 2).

Schlüssel nur aus der Umgebung: TOGETHER_API_KEY (Anbieter `tog`) oder RUNWARE_API_KEY (`run`).
Das Skript liest, druckt und speichert keinen Schlüssel.

Aufruf:
    python3 scripts/sprites-erzeugen/b1-pixel-pilot.py                 # nur Plan, nichts wird geholt
    TOGETHER_API_KEY=... python3 scripts/sprites-erzeugen/b1-pixel-pilot.py --ausfuehren
    python3 scripts/sprites-erzeugen/b1-pixel-pilot.py --nur-raster ROH.png --ansicht seite   # Schritt 2 offline
"""
import argparse
import os
import sys
from pathlib import Path

from PIL import Image

HIER = Path(__file__).resolve().parent
PROJEKT = HIER.parent.parent
sys.path.insert(0, str(HIER))

FIGUR = "00_nullpointer-exception"
ASSETS = PROJEKT / "src" / "client" / "assets"
ANSICHTEN = {
    "portrait": ASSETS / "characters" / "pixel" / f"{FIGUR}.png",
    "seite": ASSETS / "characters-side" / "pixel" / f"{FIGUR}.png",
}
RASTER_HOEHE = 48      # logische Pixel der Figurhöhe (Pilot: 32 war gröber als das Modellraster, Figur zerfiel)
FARBEN = 16            # höchstens je Figur (Abnahme B1)
ZIEL_GROESSE = 256     # wie die alten Bilder
GRUEN = (0, 255, 0)

PROMPT = {
    "portrait": (
        "Redraw this exact character as authentic 8-bit NES-era pixel art sprite. Same character, same "
        "colors theme, same silhouette and costume details, front three-quarter view, full body, standing. "
        "Very coarse pixels: the whole figure is about 32 pixels tall, flat colors, at most 16 colors, "
        "hard 1-pixel black outline, no gradients, no anti-aliasing, no dithering noise, no text. "
        "Solid pure green background (#00FF00), figure centered, feet at the bottom."
    ),
    "seite": (
        "Redraw this exact character as authentic 8-bit NES-era pixel art sprite in strict side view facing "
        "RIGHT. Same character, same colors, same silhouette and costume details, full body, standing. "
        "Very coarse pixels: the whole figure is about 32 pixels tall, flat colors, at most 16 colors, "
        "hard 1-pixel black outline, no gradients, no anti-aliasing, no text. Solid pure green background "
        "(#00FF00), figure centered, feet at the bottom."
    ),
}


def freistellen(bild, toleranz=70):
    """Hintergrund zu Alpha 0: nur Pixel, die vom Bildrand aus ZUSAMMENHÄNGEND in der Hintergrundfarbe liegen.

    Pilot 2026-11-10: Ein globaler Grünschlüssel schnitt grüne Figuren (Fraktion pixel ist grün) in Stücke.
    Jetzt wird die Hintergrundfarbe an den Ecken gemessen und von allen Rändern aus geflutet; Grün INNERHALB
    der Figur (vom Umriss umschlossen) bleibt erhalten.
    """
    rgba = bild.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    ecken = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    grund = tuple(sorted(e[k] for e in ecken)[1] for k in range(3))  # robust gegen eine abweichende Ecke

    def ist_grund(p):
        return p[3] < 128 or sum((p[k] - grund[k]) ** 2 for k in range(3)) <= toleranz * toleranz

    gesehen = bytearray(w * h)
    stapel = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stapel:
        x, y = stapel.pop()
        i = y * w + x
        if gesehen[i]:
            continue
        gesehen[i] = 1
        if not ist_grund(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: stapel.append((x - 1, y))
        if x < w - 1: stapel.append((x + 1, y))
        if y > 0: stapel.append((x, y - 1))
        if y < h - 1: stapel.append((x, y + 1))
    return rgba


def raster(roh, ansicht):
    """Schritt 2: freistellen, zuschneiden, aufs 32-px-Raster, ≤16 Farben, ohne Glättung auf 256 px."""
    figur = freistellen(roh)
    kasten = figur.getbbox()
    if not kasten:
        raise SystemExit("Keine Figur im Bild (alles Grün oder leer)")
    figur = figur.crop(kasten)
    hoehe = RASTER_HOEHE
    breite = max(1, round(figur.width * hoehe / figur.height))
    klein = figur.resize((breite, hoehe), Image.BOX)
    alpha = klein.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    # Palette nur aus Figurpixeln bilden (transparente Fläche würde sonst eine Farbe belegen).
    figurpixel = [p[:3] for p in klein.convert("RGBA").getdata() if p[3] >= 128] or [(0, 0, 0)]
    palette_bild = Image.new("RGB", (len(figurpixel), 1)); palette_bild.putdata(figurpixel)
    palette = palette_bild.quantize(colors=FARBEN, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    farbe = klein.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
    klein = farbe.convert("RGBA")
    klein.putalpha(alpha)
    faktor = max(1, (ZIEL_GROESSE * 7 // 8) // hoehe)  # Figur füllt wie bisher rund 7/8 der Höhe
    gross = klein.resize((klein.width * faktor, klein.height * faktor), Image.NEAREST)
    leinwand = Image.new("RGBA", (ZIEL_GROESSE, ZIEL_GROESSE), (0, 0, 0, 0))
    leinwand.paste(gross, ((ZIEL_GROESSE - gross.width) // 2, ZIEL_GROESSE - gross.height - 4), gross)
    return leinwand, klein


def farbzahl(bild):
    farben = bild.convert("RGBA").getcolors(maxcolors=1 << 20) or []
    return len({rgba[:3] for _, rgba in farben if rgba[3] > 0})


def kontaktbogen(paare, ziel):
    """alt | neu | neu bei 24 px (HUD-Probe), je Ansicht eine Zeile."""
    zeile_h = ZIEL_GROESSE + 20
    bogen = Image.new("RGBA", (ZIEL_GROESSE * 2 + 120, zeile_h * len(paare)), (30, 30, 34, 255))
    for i, (alt, neu) in enumerate(paare):
        y = i * zeile_h
        bogen.paste(alt.resize((ZIEL_GROESSE, ZIEL_GROESSE)), (0, y), alt.resize((ZIEL_GROESSE, ZIEL_GROESSE)))
        bogen.paste(neu, (ZIEL_GROESSE + 10, y), neu)
        hud = neu.resize((24, 24), Image.NEAREST)
        bogen.paste(hud, (ZIEL_GROESSE * 2 + 40, y + ZIEL_GROESSE // 2), hud)
    bogen.save(ziel)


def erzeuge(anbieter, ansicht, ausgabe):
    if anbieter == "tog":
        from tog import tog_gen
        return tog_gen(PROMPT[ansicht], str(ANSICHTEN[ansicht]), str(ausgabe))
    raise SystemExit(f"Anbieter {anbieter} hier nicht verdrahtet; Runware siehe tools/design-rest/runware.mjs")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ziel", default="/tmp/pa-b1")
    ap.add_argument("--anbieter", default="tog", choices=["tog"])
    ap.add_argument("--ausfuehren", action="store_true", help="Bilder wirklich beim Anbieter erzeugen (kostet Guthaben)")
    ap.add_argument("--nur-raster", help="vorhandenes Rohbild nur rastern (offline)")
    ap.add_argument("--ansicht", choices=list(ANSICHTEN), default="seite")
    a = ap.parse_args()
    ziel = Path(a.ziel)
    ziel.mkdir(parents=True, exist_ok=True)

    if a.nur_raster:
        neu, klein = raster(Image.open(a.nur_raster), a.ansicht)
        neu.save(ziel / f"{FIGUR}__{a.ansicht}__8bit.png")
        print(f"{a.ansicht}: {farbzahl(klein)} Farben, Raster {klein.width}x{klein.height}")
        return

    if not a.ausfuehren:
        print("PLAN (nichts wird geholt; --ausfuehren startet die Erzeugung):")
        for ansicht, quelle in ANSICHTEN.items():
            print(f"  {ansicht}: Referenz {quelle.relative_to(PROJEKT)} -> {ziel}/{FIGUR}__{ansicht}__roh.png -> __8bit.png")
        print(f"  Raster {RASTER_HOEHE} px hoch, <= {FARBEN} Farben, Ausgabe {ZIEL_GROESSE} px, Kontaktbogen {ziel}/kontaktbogen.png")
        print(f"  Schlüssel gesetzt: {'ja' if os.environ.get('TOGETHER_API_KEY') else 'nein'} (TOGETHER_API_KEY)")
        return

    paare = []
    for ansicht in ANSICHTEN:
        roh = ziel / f"{FIGUR}__{ansicht}__roh.png"
        antwort = erzeuge(a.anbieter, ansicht, roh)
        print(f"{ansicht}: {antwort}")
        if antwort != "ok":
            continue
        neu, klein = raster(Image.open(roh), ansicht)
        neu.save(ziel / f"{FIGUR}__{ansicht}__8bit.png")
        print(f"  {farbzahl(klein)} Farben, Raster {klein.width}x{klein.height}")
        paare.append((Image.open(ANSICHTEN[ansicht]).convert("RGBA"), neu))
    if paare:
        kontaktbogen(paare, ziel / "kontaktbogen.png")
        print(f"Kontaktbogen: {ziel / 'kontaktbogen.png'} — Sichtfreigabe durch den Auftraggeber abwarten (B1).")


if __name__ == "__main__":
    main()
