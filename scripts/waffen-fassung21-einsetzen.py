#!/usr/bin/env python3
"""Fassung 21/22: neue Waffenbilder freistellen und gezielt in Atlanten und Manifest einsetzen.

Eingabe (Rohbilder auf Magenta, erzeugt mit scripts/sprites-erzeugen/waffen-fassung21-bilder.py):
  <roh>/funkenkugel__v1.png   Icon der Funkenkugel (pa_079), 1024x1024
  <roh>/geschosse__v1.png     Raster 2x2: Mine, Bombe, Meteor, Hoellenkugel

Schritte
  1. Magenta-Freistellung (Abstand zu #FF00FF mit weichem Rand, Gegenfarbe zurueckgerechnet).
  2. Geschosszellen (64 px) nach assets/weapons/geschosse/{mine,bombe,meteor,hoellenkugel,funkenkugel}.png.
  3. Funkenkugel-Icon: Quelle assets/weapons/source/IMG_9134.PNG (1024, flacher Grund), 64-px-Icons
     (assets/weapons/icons/IMG_9134.PNG, src/client/assets/icons/IMG_9134_icon.png).
  4. Atlanten: held/silhouette/icon der Funkenkugel und die Geschosszellen von pa_079, pa_127, pa_134, pa_135,
     pa_139 werden GEZIELT in die bestehenden Atlanten gesetzt (alle uebrigen Zellen bleiben bitgleich; der
     Icon-Atlas ist eine 256-Farben-Palette, die neuen Icon-Farben werden auf die vorhandene Palette abgebildet).
     Das Manifest bekommt die neuen projectile-Eintraege. Danach `node scripts/waffen-rollen-eintragen.mjs`.

Aufruf (Wurzel des Repos): python3 scripts/waffen-fassung21-einsetzen.py [--roh /tmp/pa-f21] [--kontaktbogen PFAD.png]
Idempotent: ein zweiter Lauf mit denselben Rohbildern ergibt dieselben Dateien.
"""
import argparse
import importlib.util
import json
import os

import numpy as np
from PIL import Image

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
spec = importlib.util.spec_from_file_location("waffen_sprites", os.path.join(WURZEL, "scripts", "waffen-sprites.py"))
ws = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ws)

ZIEL = os.path.join(WURZEL, "src", "client", "assets", "weapon-sprites")
MANIFEST = os.path.join(ZIEL, "manifest.json")
GESCHOSSE = os.path.join(WURZEL, "assets", "weapons", "geschosse")
QUELLE = os.path.join(WURZEL, "assets", "weapons", "source")
ICONS64 = os.path.join(WURZEL, "assets", "weapons", "icons")
CLIENT_ICONS = os.path.join(WURZEL, "src", "client", "assets", "icons")
GRUND = (40, 44, 66)          # flacher Grund der Quelle (die uebrigen Quellen tragen einen Verlauf)
QUADRANTEN = {"mine": (0, 0), "bombe": (1, 0), "meteor": (0, 1), "hoellenkugel": (1, 1)}


def magenta_frei(bild):
    """RGBA: Abstand zu #FF00FF -> Alpha (70..150 weich), Farbe als Gegenfarbe zurueckgerechnet."""
    a = np.asarray(bild.convert("RGB")).astype(np.float32)
    d = np.abs(a[..., 0] - 255) + a[..., 1] + np.abs(a[..., 2] - 255)
    al = np.clip((d - 70) / 80.0, 0, 1)
    m = np.array([255, 0, 255], np.float32)
    f = np.where(al[..., None] > 0.02, (a - (1 - al[..., None]) * m) / np.maximum(al[..., None], 0.02), a).clip(0, 255)
    out = Image.fromarray(np.dstack([f, al * 255]).astype(np.uint8), "RGBA")
    # Streuinseln unter 12 px Flaeche entfernen (Magenta-Rauschen), Alpha-Rand 1 px glaetten
    from scipy import ndimage as ndi
    harte = np.asarray(out)[..., 3] > 40
    lab, n = ndi.label(harte, structure=np.ones((3, 3)))
    groesse = np.bincount(lab.ravel(), minlength=n + 1)
    klein = groesse[lab] < 12
    arr = np.asarray(out).copy()
    arr[klein & (lab > 0), 3] = 0
    return Image.fromarray(arr, "RGBA")


def in_flaeche(bild, kante, rand=2):
    """Zuschneiden, proportional auf (kante - 2*rand) skalieren, mittig legen."""
    a = np.asarray(bild)[..., 3]
    ys, xs = np.nonzero(a > 40)
    b = bild.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = (kante - 2 * rand) / max(b.size)
    nb = max(1, round(b.width * s))
    nh = max(1, round(b.height * s))
    klein = b.resize((nb, nh), Image.LANCZOS)
    z = Image.new("RGBA", (kante, kante), (0, 0, 0, 0))
    z.paste(klein, ((kante - nb) // 2, (kante - nh) // 2))
    return z


def lade_waffe(wid):
    return next(w for w in ws.lade_katalog() if w["id"] == wid)


def auf_palette(zelle, palette_bild):
    """Zelle (RGBA) auf die vorhandene Palette des Icon-Atlas abbilden (naechste Farbe, ohne Dithering)."""
    pal = np.array(palette_bild.getpalette()[:768], np.float32).reshape(-1, 3)
    arr = np.asarray(zelle).copy()
    rgb = arr[..., :3].astype(np.float32).reshape(-1, 3)
    d = ((rgb[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
    neu = pal[d.argmin(1)].astype(np.uint8).reshape(arr.shape[:2] + (3,))
    arr[..., :3] = neu
    arr[..., 3] = np.where(arr[..., 3] > 127, 255, 0)
    return Image.fromarray(arr, "RGBA")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--roh", default="/tmp/pa-f21")
    ap.add_argument("--kontaktbogen", metavar="PNG", help="Kontaktbogen (hell+dunkel) der neuen Zellen schreiben")
    args = ap.parse_args()

    # ---- 1./2. Freistellen, Geschosszellen
    fk = magenta_frei(Image.open(os.path.join(args.roh, "funkenkugel__v1.png")))
    raster = magenta_frei(Image.open(os.path.join(args.roh, "geschosse__v1.png")))
    h = raster.width // 2
    os.makedirs(GESCHOSSE, exist_ok=True)
    for name, (qx, qy) in QUADRANTEN.items():
        in_flaeche(raster.crop((qx * h, qy * h, qx * h + h, qy * h + h)), 64).save(os.path.join(GESCHOSSE, f"{name}.png"), optimize=True)
    in_flaeche(fk, 64).save(os.path.join(GESCHOSSE, "funkenkugel.png"), optimize=True)

    # ---- 3. Icon-Quelle und 64-px-Icons der Funkenkugel
    grund = Image.new("RGBA", fk.size, GRUND + (255,))
    grund.alpha_composite(fk)
    grund.convert("RGB").save(os.path.join(QUELLE, "IMG_9134.PNG"), optimize=True)
    icon64 = in_flaeche(fk, 64, rand=1)
    icon64.save(os.path.join(CLIENT_ICONS, "IMG_9134_icon.png"), optimize=True)
    flach = Image.new("RGBA", (64, 64), GRUND + (255,))
    flach.alpha_composite(icon64)
    flach.save(os.path.join(ICONS64, "IMG_9134.PNG"), optimize=True)

    # ---- 4. Atlanten und Manifest
    m = json.load(open(MANIFEST, encoding="utf-8"))
    korr = ws.lade_korrekturen()
    atlanten = {}

    def atlas(name):
        datei = "atlas_icons.png" if name == "icons" else f"atlas_{name}.png"
        if name not in atlanten:
            atlanten[name] = (datei, Image.open(os.path.join(ZIEL, datei)))
        return atlanten[name]

    icon_atlas_roh = atlas("icons")[1]
    icon_palette = icon_atlas_roh
    for name in ("icons",):
        atlanten[name] = (atlanten[name][0], atlanten[name][1].convert("RGBA"))
    neu_zellen = []

    # Funkenkugel (pa_079): Hand-, Silhouetten- und Icon-Zelle ueber die Standard-Verarbeitung
    e = ws.verarbeite(lade_waffe("pa_079"), korr, None)
    alt = m["waffen"]["pa_079"]
    for rolle, bild in (("held", e["held"]), ("silhouette", e["sil"]), ("icon", auf_palette(e["icon"], icon_palette))):
        z = alt[rolle]
        a = atlas(z["atlas"])[1]
        a.paste(Image.new("RGBA", (z["w"], z["h"]), (0, 0, 0, 0)), (z["x"], z["y"]))
        a.paste(bild, (z["x"], z["y"]))
        neu_zellen.append((f"pa_079 {rolle}", bild))
    for k in ("form", "rotation", "gespiegelt", "streckung", "content", "anchor", "flashColor", "korrektur", "quelle"):
        alt[k] = e["meta"][k]
    alt.pop("kachel", None)
    if "kachel" in e["meta"]:
        alt["kachel"] = e["meta"]["kachel"]

    # Geschosszellen (32 px) der fuenf Waffen
    for wid in ("pa_079", "pa_127", "pa_134", "pa_135", "pa_139"):
        w = m["waffen"][wid]
        art = ws.FASSUNG21_GESCHOSSE[wid]
        bild = ws.geschoss_bild(art, w.get("flashColor", "#ffffff"), wid)
        kat = w["held"]["atlas"]
        a = atlas(kat)[1]
        if w.get("projectile"):
            p = w["projectile"]
        else:
            # naechster freier Platz in der Geschosszeile (letzte Zeile des Atlas)
            y = a.height - ws.PZELLE
            belegt = {(q["projectile"]["x"], q["projectile"]["y"]) for q in m["waffen"].values()
                      if q.get("projectile") and q["projectile"]["atlas"] == kat}
            x = next(x for x in range(0, a.width, ws.PZELLE) if (x, y) not in belegt)
            p = {"atlas": kat, "x": x, "y": y, "w": ws.PZELLE, "h": ws.PZELLE}
        a.paste(Image.new("RGBA", (p["w"], p["h"]), (0, 0, 0, 0)), (p["x"], p["y"]))
        a.paste(bild, (p["x"], p["y"]))
        al = np.asarray(bild)[..., 3] > 100
        ys, xs = np.nonzero(al)
        w["projectile"] = {
            "art": art, "size": {"w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}, "angle": 0,
            "spin": wid in ws.FASSUNG21_DREHEND, "generiert": True, "atlas": p["atlas"], "x": p["x"], "y": p["y"],
            "w": p["w"], "h": p["h"],
        }
        neu_zellen.append((f"{wid} geschoss", bild))

    for name, (datei, bild) in atlanten.items():
        pfad = os.path.join(ZIEL, datei)
        if name == "icons":
            # Palette beibehalten: Zellen der Funkenkugel liegen schon auf Palettenfarben -> verlustfrei zurueck
            pal = icon_palette
            flach = np.asarray(bild)
            tabelle = {tuple(c): i for i, c in enumerate(np.array(pal.getpalette()[:768]).reshape(-1, 3).tolist())}
            idx = np.zeros(flach.shape[:2], np.uint8)
            rgb = flach[..., :3].reshape(-1, 3).astype(np.int64)
            schl = rgb[:, 0] * 65536 + rgb[:, 1] * 256 + rgb[:, 2]
            lut = {r * 65536 + g * 256 + b: i for (r, g, b), i in tabelle.items()}
            idx = np.array([lut.get(int(s), 0) for s in schl], np.uint8).reshape(flach.shape[:2])
            tr = pal.info.get("transparency")
            transp_idx = [i for i in range(256) if tr is not None and (i < len(tr) and tr[i] == 0)] if not isinstance(tr, int) else [tr]
            if transp_idx:
                idx = np.where(flach[..., 3] == 0, transp_idx[0], idx).astype(np.uint8)
            neu = Image.fromarray(idx, "P")
            neu.putpalette(pal.getpalette())
            neu.info["transparency"] = pal.info.get("transparency")
            neu.save(pfad, optimize=True, transparency=pal.info.get("transparency"))
        else:
            ws.speichern(bild, pfad)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
        f.write("\n")

    if args.kontaktbogen:
        breite = 160 * len(neu_zellen)
        bogen = Image.new("RGBA", (breite, 340), (0, 0, 0, 255))
        helle = Image.new("RGBA", (breite, 170), (225, 225, 230, 255))
        bogen.paste(helle, (0, 170))
        for i, (n, z) in enumerate(neu_zellen):
            gross = z.resize((128, 128), Image.NEAREST)
            for oben in (0, 170):
                bogen.alpha_composite(gross, (i * 160 + 16, oben + 21))
        bogen.save(args.kontaktbogen)
    print(f"{len(neu_zellen)} Zellen eingesetzt; Atlanten: {', '.join(d for d, _ in atlanten.values())}")


if __name__ == "__main__":
    main()
