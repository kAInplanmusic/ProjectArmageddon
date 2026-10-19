#!/usr/bin/env python3
"""
Waffen-Sprites: Waffen aus den 150 Katalog-Icons extrahieren und als Sprite-Sheets
(Atlanten) mit Manifest ablegen.  Stufe 1: kostenlos, lokal, deterministisch.

Eingabe : assets/weapons/source/IMG_xxxx.PNG (1024x1024, Waffe auf Verlaufshintergrund,
          teils in Kacheln/Rahmen) und src/shared/config/weapons.js (Katalog).
          IMG_9049 liegt nur als .heic vor -> braucht `pip install pillow-heif`;
          ohne das Paket faellt das Skript auf das 64-px-Icon zurueck (Warnung,
          schlechtere Qualitaet, im Manifest als quelle.datei vermerkt).
Ausgabe : src/client/assets/weapon-sprites/atlas_<kategorie>.png (held, silhouette,
          projectile), atlas_icons.png (icon) und manifest.json.

Schritte je Waffe
  1. Hintergrund (quadratischer Verlauf) per Randring-Fit + Flood-Fill entfernen,
     Rahmen/Plattenlinien (hohle Komponenten) entfernen, Kleinteile (Funkeln-Wasserzeichen,
     Sterne) verwerfen, 1 px Defringe, Farben nach aussen verlaengern.
  2. Form bestimmen: objekt (laenglich -> drehen) oder kachel/kompakt (nicht drehen).
  3. Hauptachse (PCA) -> waagerecht, Spitze/Muendung nach RECHTS.  Zeigt die Spitze klar
     nach links, wird gespiegelt statt um 180 Grad gedreht (oben bleibt oben).
  4. Varianten: held 128x128 (groesste Kante ~90 %), icon 128x128 (unrotiert),
     silhouette (weiss), projectile 32x32 (nur Waffen mit physischem Geschoss), flashColor.
  5. Anker grip/muzzle aus der Geometrie (Standardwerte bei kompakten Formen).

Handkorrekturen: scripts/waffen-sprites-korrekturen.json (je Waffen-ID).

Aufruf
  python3 scripts/waffen-sprites.py                      # alles erzeugen
  python3 scripts/waffen-sprites.py --kontaktbogen DIR   # zusaetzlich Kontaktboegen (hell+dunkel)
  python3 scripts/waffen-sprites.py --nur pa_001,pa_002  # nur Kontaktboegen/Debug fuer einige
Deterministisch: kein Zufall, feste Reihenfolge (Katalog), feste PNG-Parameter.
"""
import argparse
import colorsys
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
QUELLE = os.path.join(WURZEL, "assets", "weapons", "source")
ICONS64 = os.path.join(WURZEL, "assets", "weapons", "icons")
ZIEL = os.path.join(WURZEL, "src", "client", "assets", "weapon-sprites")
KORREKTUREN = os.path.join(WURZEL, "scripts", "waffen-sprites-korrekturen.json")

ZELLE = 128          # held / silhouette / icon
FUELLUNG = 0.90      # groesste Kante / Zelle
PZELLE = 32          # projectile
SPALTEN = 8          # Zellen je Zeile in den Kategorie-Atlanten
ICON_SPALTEN = 16
KATEGORIEN = ["melee", "ranged", "heavy_ranged", "elemental", "magic", "tech", "utility", "ultimate"]
SCHWELLE = 30        # Abstand zum Hintergrundmodell (max. Kanalabweichung)
STREckung_MIN = 1.5  # darunter: kompakt, nicht drehen


# --------------------------------------------------------------------------- Katalog

def lade_katalog():
    """Katalog (Felder, die das Skript braucht) ueber Node aus weapons.js lesen."""
    js = (
        "import(process.argv[1]).then(m=>console.log(JSON.stringify(m.WEAPONS.map(w=>({"
        "id:w.id,name:w.displayName,category:w.category,subcategory:w.subcategory,"
        "rarity:w.rarity,icon:w.icon,delivery:w.delivery,targeting:w.targeting,"
        "special:w.special,damageType:w.damageType})))))"
    )
    pfad = "file://" + os.path.join(WURZEL, "src", "shared", "config", "weapons.js")
    aus = subprocess.run(["node", "-e", js, pfad], check=True, capture_output=True, text=True).stdout
    return json.loads(aus)


def lade_korrekturen():
    if not os.path.exists(KORREKTUREN):
        return {}
    with open(KORREKTUREN, encoding="utf-8") as f:
        daten = json.load(f)
    return {k: v for k, v in daten.items() if not k.startswith("_")}


# --------------------------------------------------------------------------- Quelle laden

def lade_quelle(icon):
    """Gibt (RGB-Array float32, Beschreibung) zurueck."""
    stamm = os.path.splitext(icon)[0]
    png = os.path.join(QUELLE, stamm + ".PNG")
    if os.path.exists(png):
        return np.asarray(Image.open(png).convert("RGB"), dtype=np.float32), stamm + ".PNG"
    heic = os.path.join(QUELLE, stamm + ".heic")
    if os.path.exists(heic):
        try:
            import pillow_heif  # noqa: PLC0415
            pillow_heif.register_heif_opener()
            return np.asarray(Image.open(heic).convert("RGB"), dtype=np.float32), stamm + ".heic"
        except Exception as e:  # noqa: BLE001
            print(f"WARNUNG {stamm}: HEIC nicht lesbar ({e}); nutze 64-px-Icon", file=sys.stderr)
    klein = Image.open(os.path.join(ICONS64, stamm + ".PNG")).convert("RGBA")
    flach = Image.new("RGBA", klein.size, (128, 128, 128, 255))
    flach.alpha_composite(klein)
    gross = flach.convert("RGB").resize((1024, 1024), Image.LANCZOS)
    return np.asarray(gross, dtype=np.float32), stamm + ".icon64"


# --------------------------------------------------------------------------- Freistellen

def hintergrundmodell(img, ring=3, abstand=0):
    """Quadratischer Flaechenfit je Kanal an den Randring (robust gegen Ausreisser)."""
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x = xx / (w - 1) * 2 - 1
    y = yy / (h - 1) * 2 - 1
    basis = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], axis=-1)
    rand = np.zeros((h, w), bool)
    rand[abstand:abstand + ring] = rand[h - abstand - ring:h - abstand] = True
    rand[:, abstand:abstand + ring] = rand[:, w - abstand - ring:w - abstand] = True
    rand[:abstand] = rand[h - abstand:] = False
    rand[:, :abstand] = rand[:, w - abstand:] = False
    a = basis[rand]
    modell = np.zeros_like(img)
    for c in range(3):
        werte = img[..., c][rand]
        nutz = np.ones(len(werte), bool)
        koef = None
        for _ in range(4):
            koef, *_ = np.linalg.lstsq(a[nutz], werte[nutz], rcond=None)
            res = np.abs(a @ koef - werte)
            nutz = res < max(6.0, float(np.percentile(res, 80)))
        modell[..., c] = basis @ koef
    return modell


def rand_fluten(kand):
    lab, _ = ndi.label(kand)
    rand = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    rand = rand[rand > 0]
    return np.isin(lab, rand)


ACHT = np.ones((3, 3), int)


def freistellen(img, rect=None, schwelle=SCHWELLE, abstand=0):
    """Gibt (maske bool, diff) zurueck. rect = [x0,y0,x1,y1,radius] erzwingt eine Rundrechteck-Kachel."""
    h, w, _ = img.shape
    if rect is not None:
        x0, y0, x1, y1, r = rect
        yy, xx = np.mgrid[0:h, 0:w]
        m = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
        for cx, cy, sx, sy in ((x0 + r, y0 + r, -1, -1), (x1 - r, y0 + r, 1, -1),
                               (x0 + r, y1 - r, -1, 1), (x1 - r, y1 - r, 1, 1)):
            ecke = ((xx - cx) * sx > 0) & ((yy - cy) * sy > 0)
            m &= ~(ecke & (((xx - cx) ** 2 + (yy - cy) ** 2) > r * r))
        return m, None
    modell = hintergrundmodell(img, 3, abstand)
    diff = np.abs(img - modell).max(axis=2)
    kand = diff < schwelle
    # hohle Komponenten (Rahmen, Plattenlinien) erkennen und als Hintergrund werten
    for _ in range(2):
        lab, n = ndi.label(~kand, structure=ACHT)
        if n == 0:
            break
        flaechen = np.bincount(lab.ravel(), minlength=n + 1)
        geaendert = False
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            randnah = (sl[0].start <= 0.06 * h and sl[1].start <= 0.06 * w
                       and sl[0].stop >= 0.94 * h and sl[1].stop >= 0.94 * w)
            if randnah and bh >= 0.80 * h and bw >= 0.80 * w and flaechen[i] < 0.30 * bh * bw:
                kand |= lab == i
                geaendert = True
        if not geaendert:
            break
    bg = rand_fluten(kand)
    fg = ~bg
    # Kleinteile (Wasserzeichen, Sterne) verwerfen
    lab, n = ndi.label(fg, structure=ACHT)
    if n == 0:
        return fg, diff
    flaechen = np.bincount(lab.ravel(), minlength=n + 1)
    flaechen[0] = 0
    gross = flaechen.max()
    behalten = np.zeros(n + 1, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        in_ecke = sl[0].start > 860 and sl[1].start > 860
        if flaechen[i] >= max(2500, 0.012 * gross) and not in_ecke:
            behalten[i] = True
    fg = behalten[lab]
    # eingeschlossene Hintergrundinseln (Seilschlaufe usw.) entfernen
    insel = fg & (diff < 10)
    lab, n = ndi.label(insel)
    if n:
        flaechen = np.bincount(lab.ravel(), minlength=n + 1)
        for i in range(1, n + 1):
            if flaechen[i] >= 1500:
                fg[lab == i] = False
    # Rauschen glaetten
    fg = ndi.binary_opening(fg, iterations=1)
    fg = ndi.binary_fill_holes(fg) | fg if False else fg
    return fg, diff


def rgba_aus(img, maske):
    """Defringe (1 px erodieren), Farben nach aussen verlaengern, RGBA-Bild (1024) bauen."""
    kern = ndi.binary_erosion(maske, iterations=1)
    if not kern.any():
        kern = maske
    idx = ndi.distance_transform_edt(~kern, return_distances=False, return_indices=True)
    rgb = img[idx[0], idx[1]]
    alpha = ndi.gaussian_filter(kern.astype(np.float32), 0.6)
    alpha = np.where(kern, 1.0, np.clip(alpha * 1.6, 0, 1) * (ndi.binary_dilation(kern, iterations=2)))
    out = np.dstack([rgb, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# --------------------------------------------------------------------------- Ausrichtung

def hauptachse(maske):
    """Winkel der Hauptachse (Grad, Bild-Koordinaten, -90..90], Streckung, Punkte-Projektion."""
    ys, xs = np.nonzero(maske)
    pts = np.stack([xs, ys], 1).astype(np.float64)
    mitte = pts.mean(0)
    c = np.cov((pts - mitte).T)
    ew, ev = np.linalg.eigh(c)
    streckung = math.sqrt(max(ew[1], 1e-9) / max(ew[0], 1e-9))
    v = ev[:, 1]
    phi = math.degrees(math.atan2(v[1], v[0]))
    while phi > 90:
        phi -= 180
    while phi <= -90:
        phi += 180
    return phi, streckung, pts, mitte


def spitze_plus(pts, mitte, phi):
    """True, wenn das + Ende der Achse die Spitze ist (= das duennere Ende)."""
    u = np.array([math.cos(math.radians(phi)), math.sin(math.radians(phi))])
    s = (pts - mitte) @ u
    lo, hi = s.min(), s.max()
    laenge = hi - lo
    if laenge <= 0:
        return True
    breite = np.histogram(s, bins=40, range=(lo, hi))[0].astype(float)
    ende_minus = breite[:10].mean()
    ende_plus = breite[-10:].mean()
    return ende_plus <= ende_minus


def ausrichten(bild, korr):
    """Dreht/spiegelt das RGBA-Bild (1024) so, dass die Spitze nach rechts zeigt.
    Gibt (bild, info) zurueck."""
    alpha = np.asarray(bild)[..., 3] > 127
    phi, streckung, pts, mitte = hauptachse(alpha)
    info = {"streckung": round(streckung, 2), "achse": round(phi, 1)}
    kompakt = streckung < STREckung_MIN
    if korr.get("keineDrehung") or korr.get("form") == "kachel":
        kompakt = True
    if korr.get("form") == "objekt" and not korr.get("keineDrehung"):
        kompakt = False
    if kompakt:
        # trotzdem manuelle Spiegelung erlauben
        flip = bool(korr.get("spiegeln") or korr.get("umkehren"))
        if flip:
            bild = bild.transpose(Image.FLIP_LEFT_RIGHT)
        info.update(drehung=0.0, gespiegelt=flip, kompakt=True)
        return bild, info
    if abs(phi) < 8:
        phi = 0.0
    plus = spitze_plus(pts, mitte, phi)
    if korr.get("spitzeWechseln"):
        plus = not plus
    theta = phi if plus else phi + 180.0          # Richtung der Spitze (Bild-Koordinaten)
    theta = (theta + 180) % 360 - 180
    gespiegelt = False
    if "winkel" in korr:                           # absoluter Winkel der Spitze (Bild-Koord.)
        theta = float(korr["winkel"])
    if korr.get("spiegeln"):
        bild = bild.transpose(Image.FLIP_LEFT_RIGHT)
        theta = (180 - theta + 180) % 360 - 180
        gespiegelt = True
    if math.cos(math.radians(theta)) < -0.5 and not korr.get("nichtSpiegeln"):
        bild = bild.transpose(Image.FLIP_LEFT_RIGHT)
        theta = (180 - theta + 180) % 360 - 180
        gespiegelt = not gespiegelt if korr.get("spiegeln") else True
    dreh = theta                                   # PIL dreht gegen den Uhrzeigersinn
    if abs(dreh) > 0.5:
        bild = bild.rotate(dreh, resample=Image.BICUBIC, expand=True)
    if korr.get("umkehren"):
        bild = bild.transpose(Image.FLIP_LEFT_RIGHT)
        gespiegelt = not gespiegelt
    info.update(drehung=round(dreh, 1), gespiegelt=gespiegelt, kompakt=False)
    return bild, info


# --------------------------------------------------------------------------- Zellen

def zuschneiden(bild):
    a = np.asarray(bild)[..., 3]
    ys, xs = np.nonzero(a > 8)
    return bild.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def in_zelle(bild, groesse, fuellung=FUELLUNG):
    """Zugeschnittenes Bild proportional skalieren und mittig in groesse x groesse legen.
    Gibt (zelle, skala, offset) zurueck."""
    b = zuschneiden(bild)
    ziel = groesse * fuellung
    skala = ziel / max(b.size)
    nb = max(1, round(b.width * skala))
    nh = max(1, round(b.height * skala))
    klein = b.resize((nb, nh), Image.LANCZOS)
    zelle = Image.new("RGBA", (groesse, groesse), (0, 0, 0, 0))
    ox, oy = (groesse - nb) // 2, (groesse - nh) // 2
    zelle.paste(klein, (ox, oy))
    return zelle, skala, (ox, oy)


def anker(zelle, kat, kompakt):
    a = np.asarray(zelle)[..., 3] > 100
    ys, xs = np.nonzero(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    laenge = x1 - x0 + 1
    if kompakt:
        return ({"x": int(round(x0 + 0.40 * laenge)), "y": int(round((y0 + y1) / 2))},
                {"x": int(x1), "y": int(round((y0 + y1) / 2))}, "standard")
    spalte = a[:, max(x1 - 3, 0):x1 + 1]
    my = np.nonzero(spalte.any(axis=1))[0]
    muendung = {"x": int(x1), "y": int(round(my.mean()))}
    gx = int(round(x0 + 0.30 * laenge))
    band = a[:, max(gx - 3, 0):gx + 4]
    gy_s = np.nonzero(band.any(axis=1))[0]
    if len(gy_s) == 0:
        return ({"x": gx, "y": int(round((y0 + y1) / 2))}, muendung, "standard")
    if kat in ("ranged", "heavy_ranged", "tech"):
        gy = gy_s.max() - 0.30 * (gy_s.max() - gy_s.min())      # Griff haengt unten
    else:
        gy = (gy_s.max() + gy_s.min()) / 2
    return {"x": gx, "y": int(round(gy))}, muendung, "geometrie"


def flash_farbe(zelle):
    arr = np.asarray(zelle).astype(np.float32)
    m = arr[..., 3] > 200
    rgb = arr[..., :3][m] / 255.0
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb[::2]])
    if len(hsv) == 0:
        return "#ffd24a"
    gew = hsv[:, 1] * hsv[:, 2] * (hsv[:, 1] > 0.35) * (hsv[:, 2] > 0.35)
    if gew.sum() < 1e-6:
        mittel = rgb.mean(0)
        h, s, v = colorsys.rgb_to_hsv(*mittel)
    else:
        bins = np.minimum((hsv[:, 0] * 18).astype(int), 17)
        hist = np.bincount(bins, weights=gew, minlength=18)
        hist = hist + np.roll(hist, 1) * 0.5 + np.roll(hist, -1) * 0.5      # Nachbarn mitzaehlen
        b = int(hist.argmax())
        sel = (bins == b) & (gew > 0)
        h = float(np.average(hsv[sel, 0], weights=gew[sel]))
        s = float(np.average(hsv[sel, 1], weights=gew[sel]))
        v = float(np.average(hsv[sel, 2], weights=gew[sel]))
    r, g, bl = colorsys.hsv_to_rgb(h, min(1.0, max(s, 0.55)), max(v, 0.92))
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(bl * 255))


def silhouette(zelle):
    arr = np.asarray(zelle).copy()
    arr[..., :3] = 255
    return Image.fromarray(arr, "RGBA")


# --------------------------------------------------------------------------- Projektile

# Welche Waffen ein physisches Geschoss haben und welches. "ding" = die Waffe selbst fliegt.
# Alle uebrigen Waffen (Hitscan, Selbstwirkung/Platzierung) erhalten projectile:null.
GESCHOSS_ART = {
    **{f"pa_{i:03d}": "ding" for i in range(1, 22)},      # Nahkampf: Wurf der Waffe selbst
    **{f"pa_{i:03d}": "ding" for i in range(23, 32)},     # Handschuhe, Bomben, Fackel usw.
    "pa_022": "plasma", "pa_033": "zauber", "pa_034": "zauber", "pa_035": "plasma",
    "pa_036": "rakete", "pa_037": "rakete", "pa_038": "ding", "pa_039": "granate",
    "pa_040": "kugel", "pa_041": "rakete", "pa_042": "rakete", "pa_043": "granate",
    "pa_044": "feuer", "pa_045": "rakete", "pa_046": "ding", "pa_047": "ding",
    "pa_048": "ding", "pa_049": "ding", "pa_050": "ding", "pa_051": "ding",
    "pa_052": "ding", "pa_053": "ding", "pa_054": "kugel", "pa_055": "kugel",
    "pa_056": "kugel", "pa_057": "kugel", "pa_058": "pfeil", "pa_059": "pfeil",
    "pa_060": "kugel", "pa_061": "feuer", "pa_062": "feuer", "pa_063": "wasser",
    "pa_064": "stein", "pa_065": "ding", "pa_066": "granate", "pa_067": "gift",
    "pa_068": "plasma", "pa_069": "rakete", "pa_070": "gift", "pa_071": "eis",
    "pa_072": "feuer", "pa_073": "gift", "pa_074": "zauber", "pa_075": "zauber",
    "pa_077": "zauber", "pa_078": "zauber", "pa_080": "zauber", "pa_082": "zauber",
    "pa_104": "plasma", "pa_133": "ding", "pa_140": "plasma", "pa_142": "zauber",
    "pa_144": "ding", "pa_145": "stein", "pa_146": "ding", "pa_147": "feuer",
    "pa_150": "zauber",
}
DREHEND = {"pa_049", "pa_050", "pa_051"}      # Wurfwaffen, die im Flug rotieren (Melee kommt hinzu)

SS = 4   # Uebersampling fuer generierte Geschosse


def _hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def geschoss_generiert(art, farbe):
    """Zeichnet ein 32x32-Geschoss (zeigt nach rechts) mit 4-fachem Uebersampling."""
    n = PZELLE * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = _hex(farbe)
    m = n // 2
    s = SS

    def ell(x0, y0, x1, y1, fill):
        d.ellipse((x0 * s, y0 * s, x1 * s, y1 * s), fill=fill)

    if art == "kugel":
        d.rounded_rectangle((7 * s, 13 * s, 26 * s, 19 * s), radius=3 * s, fill=(214, 168, 64, 255))
        d.polygon([(26 * s, 13 * s), (31 * s, 16 * s), (26 * s, 19 * s)], fill=(250, 240, 200, 255))
        d.line((2 * s, 16 * s, 7 * s, 16 * s), fill=(255, 220, 120, 140), width=2 * s)
    elif art == "pfeil":
        d.line((3 * s, 16 * s, 27 * s, 16 * s), fill=(150, 100, 60, 255), width=2 * s)
        d.polygon([(26 * s, 12 * s), (31 * s, 16 * s), (26 * s, 20 * s)], fill=(190, 195, 205, 255))
        d.polygon([(2 * s, 16 * s), (7 * s, 11 * s), (8 * s, 16 * s), (7 * s, 21 * s)], fill=(210, 60, 50, 255))
    elif art == "rakete":
        d.polygon([(2 * s, 16 * s), (8 * s, 11 * s), (10 * s, 16 * s), (8 * s, 21 * s)], fill=(255, 150, 40, 230))
        d.rounded_rectangle((8 * s, 12 * s, 24 * s, 20 * s), radius=2 * s, fill=(190, 195, 205, 255))
        d.polygon([(24 * s, 12 * s), (31 * s, 16 * s), (24 * s, 20 * s)], fill=(215, 60, 50, 255))
        d.polygon([(8 * s, 12 * s), (5 * s, 7 * s), (13 * s, 12 * s)], fill=(215, 60, 50, 255))
        d.polygon([(8 * s, 20 * s), (5 * s, 25 * s), (13 * s, 20 * s)], fill=(215, 60, 50, 255))
    elif art == "granate":
        ell(8, 9, 26, 23, (70, 74, 82, 255))
        d.rectangle((14 * s, 9 * s, 17 * s, 23 * s), fill=(200, 160, 60, 255))
        ell(21, 12, 24, 15, (150, 156, 168, 255))
    elif art in ("plasma", "zauber"):
        for r, a in ((15, 60), (12, 110), (9, 190)):
            ell(m / s - r, m / s - r, m / s + r, m / s + r, c + (a,))
        ell(m / s - 5, m / s - 5, m / s + 5, m / s + 5, (255, 255, 255, 255))
    elif art == "feuer":
        d.polygon([(2 * s, 16 * s), (11 * s, 9 * s), (22 * s, 8 * s), (30 * s, 16 * s),
                   (22 * s, 24 * s), (11 * s, 23 * s)], fill=(255, 120, 20, 230))
        d.polygon([(9 * s, 16 * s), (16 * s, 12 * s), (25 * s, 16 * s), (16 * s, 20 * s)], fill=(255, 220, 80, 255))
    elif art == "gift":
        ell(6, 8, 26, 24, (110, 200, 50, 235))
        ell(10, 10, 16, 15, (200, 255, 140, 255))
        ell(20, 16, 24, 20, (60, 140, 30, 255))
    elif art == "eis":
        d.polygon([(2 * s, 16 * s), (11 * s, 9 * s), (31 * s, 16 * s), (11 * s, 23 * s)], fill=(150, 220, 255, 255))
        d.polygon([(8 * s, 16 * s), (14 * s, 12 * s), (26 * s, 16 * s), (14 * s, 20 * s)], fill=(235, 250, 255, 255))
    elif art == "wasser":
        d.polygon([(2 * s, 16 * s), (14 * s, 9 * s), (24 * s, 11 * s), (30 * s, 16 * s),
                   (24 * s, 21 * s), (14 * s, 23 * s)], fill=(60, 150, 240, 235))
        ell(14, 11, 21, 15, (200, 235, 255, 255))
    elif art == "stein":
        d.polygon([(6 * s, 14 * s), (12 * s, 7 * s), (22 * s, 8 * s), (28 * s, 15 * s),
                   (25 * s, 24 * s), (14 * s, 25 * s), (7 * s, 21 * s)], fill=(120, 110, 100, 255))
        d.polygon([(12 * s, 10 * s), (21 * s, 11 * s), (17 * s, 16 * s)], fill=(160, 150, 138, 255))
    return im.resize((PZELLE, PZELLE), Image.LANCZOS)


def projektil(w, held_zelle, flash, kat, korr):
    """Gibt (Bild 32x32, meta) oder (None, None) zurueck."""
    art = korr.get("geschoss", GESCHOSS_ART.get(w["id"]) if w["delivery"] == "projectile" else None)
    if w["delivery"] != "projectile" and "geschoss" not in korr:
        return None, None
    if art in (None, "keins"):
        return None, None
    if art == "ding" and korr.get("form_ist_kachel"):
        art = "zauber"
    if kat == "melee" and art == "ding":
        pass
    if art == "ding":
        bild, _, _ = in_zelle(zuschneiden(held_zelle), PZELLE, 0.92)
        a = np.asarray(bild)[..., 3] > 100
        ys, xs = np.nonzero(a)
        groesse = {"w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}
    else:
        bild = geschoss_generiert(art, flash)
        a = np.asarray(bild)[..., 3] > 100
        ys, xs = np.nonzero(a)
        groesse = {"w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}
    dreht = (kat == "melee" and art == "ding") or w["id"] in DREHEND
    return bild, {"art": art, "size": groesse, "angle": 0, "spin": bool(dreht), "generiert": art != "ding"}


# --------------------------------------------------------------------------- Atlas speichern

def speichern(bild, pfad, palette=False):
    """RGBA-PNG, optimiert.  Verlustfrei als Palette, wenn <= 256 Farben; sonst RGBA."""
    arr = np.asarray(bild)
    flach = arr.reshape(-1, 4)
    farben = np.unique(flach.view(np.uint32))
    if palette or len(farben) <= 256:
        pal = bild.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
        if pal.palette.mode == "RGBA":      # Quantisierung liefert Alpha 254 statt 255 und 1..8 statt 0
            roh = bytearray(pal.palette.palette)
            for k in range(3, len(roh), 4):
                if roh[k] >= 248:
                    roh[k] = 255
                elif roh[k] <= 8:
                    roh[k] = 0
            pal.putpalette(bytes(roh), "RGBA")
        pal.save(pfad, optimize=True)
    else:
        bild.save(pfad, optimize=True, compress_level=9)


def baue_atlas(zellen, spalten, groesse):
    zeilen = max(1, math.ceil(len(zellen) / spalten))
    atlas = Image.new("RGBA", (spalten * groesse, zeilen * groesse), (0, 0, 0, 0))
    pos = []
    for i, z in enumerate(zellen):
        x, y = (i % spalten) * groesse, (i // spalten) * groesse
        if z is not None:
            atlas.paste(z, (x, y))
        pos.append((x, y))
    return atlas, pos, zeilen


# --------------------------------------------------------------------------- Kontaktboegen

def kontaktboegen(daten, ziel, praefix, groesse=128, spalten=6):
    """Hell+dunkel in Gruppen zu 30 (6 Spalten x 5 Zeilen)."""
    os.makedirs(ziel, exist_ok=True)
    try:
        font = ImageFont.load_default(size=11)
    except TypeError:
        font = ImageFont.load_default()
    pro = 30
    for g in range(0, len(daten), pro):
        teil = daten[g:g + pro]
        for name, bg in (("hell", (236, 236, 236)), ("dunkel", (34, 36, 44))):
            zeilen = math.ceil(len(teil) / spalten)
            sheet = Image.new("RGB", (spalten * groesse, zeilen * (groesse + 14)), bg)
            dr = ImageDraw.Draw(sheet)
            for i, (wid, bild) in enumerate(teil):
                x, y = (i % spalten) * groesse, (i // spalten) * (groesse + 14)
                dr.rectangle((x, y, x + groesse - 1, y + groesse - 1), outline=(150, 150, 150))
                sheet.paste(bild.resize((groesse, groesse), Image.LANCZOS) if bild.size[0] != groesse else bild,
                            (x, y), bild.resize((groesse, groesse)) if bild.size[0] != groesse else bild)
                dr.text((x + 2, y + groesse), wid, fill=(0, 0, 0) if name == "hell" else (230, 230, 230), font=font)
            sheet.save(os.path.join(ziel, f"{praefix}_{g // pro + 1:02d}_{name}.png"))


# --------------------------------------------------------------------------- Hauptlauf

def verarbeite(w, korr, ctx):
    wid = w["id"]
    k = korr.get(wid, {})
    img, quelle = lade_quelle(w["icon"])
    maske, _ = freistellen(img, k.get("rect"), k.get("schwelle", SCHWELLE), k.get("ringAbstand", 0))
    bild = rgba_aus(img, maske)
    ausricht, info = ausrichten(bild, k)
    held, skala, off = in_zelle(ausricht, ZELLE)
    icon, _, _ = in_zelle(bild, ZELLE)
    gr, mu, ank_quelle = anker(held, w["category"], info["kompakt"])
    if "grip" in k:
        gr, ank_quelle = {"x": k["grip"][0], "y": k["grip"][1]}, "korrektur"
    if "muzzle" in k:
        mu, ank_quelle = {"x": k["muzzle"][0], "y": k["muzzle"][1]}, "korrektur"
    a = np.asarray(held)[..., 3] > 100
    ys, xs = np.nonzero(a)
    inhalt = {"x": int(xs.min()), "y": int(ys.min()), "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}
    flash = flash_farbe(held)
    form = "kachel" if (info["kompakt"] and (k.get("form") == "kachel" or ist_kachel(maske))) else (
        "kompakt" if info["kompakt"] else "objekt")
    k2 = dict(k)
    k2["form_ist_kachel"] = form == "kachel"
    proj, pmeta = projektil(w, held, flash, w["category"], k2)
    return {
        "w": w, "held": held, "icon": icon, "sil": silhouette(held), "proj": proj,
        "meta": {
            "id": wid, "name": w["name"], "category": w["category"], "subcategory": w["subcategory"],
            "rarity": w["rarity"], "delivery": w["delivery"], "form": form,
            "quelle": {"datei": quelle, "aufloesung": int(img.shape[0])},
            "rotation": info["drehung"], "gespiegelt": info["gespiegelt"],
            "streckung": info["streckung"], "content": inhalt,
            "anchor": {"grip": gr, "muzzle": mu, "source": ank_quelle},
            "projectile": pmeta, "flashColor": flash, "korrektur": bool(k),
        },
    }


def ist_kachel(maske):
    """Kachel/Platte: Maske fuellt ihre Bounding-Box weitgehend und ist ~quadratisch/gross."""
    ys, xs = np.nonzero(maske)
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    fuell = maske.sum() / float(bw * bh)
    return bool(fuell > 0.82 and 0.8 < bw / bh < 1.25 and max(bw, bh) > 0.5 * maske.shape[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kontaktbogen", metavar="DIR", help="Kontaktboegen (hell+dunkel) hierhin schreiben")
    ap.add_argument("--nur", help="Komma-Liste Waffen-IDs (nur Debug/Kontaktbogen, schreibt keine Atlanten)")
    ap.add_argument("--ziel", default=ZIEL, help="Zielordner der Atlanten")
    args = ap.parse_args()

    katalog = lade_katalog()
    korr = lade_korrekturen()
    nur = set(args.nur.split(",")) if args.nur else None
    erg = []
    for w in katalog:
        if nur and w["id"] not in nur:
            continue
        erg.append(verarbeite(w, korr, None))
        m = erg[-1]["meta"]
        print(f"{m['id']} {m['name'][:22]:22} {m['form']:8} rot={m['rotation']:7} streck={m['streckung']:5} "
              f"spiegel={int(m['gespiegelt'])} proj={(m['projectile'] or {}).get('art')}", file=sys.stderr)

    if args.kontaktbogen:
        kontaktboegen([(e["meta"]["id"], e["held"]) for e in erg], args.kontaktbogen, "held")
        kontaktboegen([(e["meta"]["id"], e["icon"]) for e in erg], args.kontaktbogen, "icon")
    if nur:
        return

    os.makedirs(args.ziel, exist_ok=True)
    manifest = {
        "version": 1,
        "generator": "scripts/waffen-sprites.py",
        "facing": "right",
        "hinweis": "Zellen {x,y,w,h} in Atlas-Pixeln; Anker in Zellen-Pixeln der held-Zelle (0,0 = links oben). "
                   "rotation = Grad gegen den Uhrzeigersinn, mit der das Original gedreht wurde (nach optionaler "
                   "Spiegelung, gespiegelt:true). projectile.angle = Drehung (Grad) der Zelle gegenueber der "
                   "Flugrichtung (0 = Spitze rechts).",
        "zellen": {"held": ZELLE, "silhouette": ZELLE, "icon": ZELLE, "projectile": PZELLE},
        "atlanten": {},
        "waffen": {},
    }
    for kat in KATEGORIEN:
        teil = [e for e in erg if e["meta"]["category"] == kat]
        if not teil:
            continue
        held_a, pos, zeilen = baue_atlas([e["held"] for e in teil], SPALTEN, ZELLE)
        sil_a, _, _ = baue_atlas([e["sil"] for e in teil], SPALTEN, ZELLE)
        mitProj = [e for e in teil if e["proj"] is not None]
        pz = max(1, math.ceil(len(mitProj) / (SPALTEN * ZELLE // PZELLE)))
        proj_a, ppos, _ = baue_atlas([e["proj"] for e in mitProj], SPALTEN * ZELLE // PZELLE, PZELLE)
        gesamt = Image.new("RGBA", (SPALTEN * ZELLE, zeilen * ZELLE * 2 + pz * PZELLE), (0, 0, 0, 0))
        gesamt.paste(held_a, (0, 0))
        gesamt.paste(sil_a, (0, zeilen * ZELLE))
        if mitProj:
            gesamt.paste(proj_a, (0, zeilen * ZELLE * 2))
        datei = f"atlas_{kat}.png"
        speichern(gesamt, os.path.join(args.ziel, datei))
        manifest["atlanten"][kat] = {"datei": datei, "w": gesamt.width, "h": gesamt.height, "waffen": len(teil)}
        for i, e in enumerate(teil):
            x, y = pos[i]
            m = e["meta"]
            m["held"] = {"atlas": kat, "x": x, "y": y, "w": ZELLE, "h": ZELLE}
            m["silhouette"] = {"atlas": kat, "x": x, "y": y + zeilen * ZELLE, "w": ZELLE, "h": ZELLE}
            if e["proj"] is not None:
                j = mitProj.index(e)
                px, py = ppos[j]
                m["projectile"].update({"atlas": kat, "x": px, "y": py + zeilen * ZELLE * 2, "w": PZELLE, "h": PZELLE})
        for e in teil:
            e["_fertig"] = True
    # Icon-Atlas (alle Waffen, Katalogreihenfolge)
    ia, ipos, _ = baue_atlas([e["icon"] for e in erg], ICON_SPALTEN, ZELLE)
    speichern(ia, os.path.join(args.ziel, "atlas_icons.png"), palette=True)
    manifest["atlanten"]["icons"] = {"datei": "atlas_icons.png", "w": ia.width, "h": ia.height, "waffen": len(erg)}
    for i, e in enumerate(erg):
        x, y = ipos[i]
        e["meta"]["icon"] = {"atlas": "icons", "x": x, "y": y, "w": ZELLE, "h": ZELLE}
        manifest["waffen"][e["meta"]["id"]] = e["meta"]
    with open(os.path.join(args.ziel, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"fertig: {len(erg)} Waffen -> {args.ziel}", file=sys.stderr)


if __name__ == "__main__":
    main()
