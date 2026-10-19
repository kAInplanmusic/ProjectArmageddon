"""Rohbilder freistellen, normalisieren und als Seitensprites ablegen.

Aufruf:  python3 scripts/seitenansichten/freistellen.py ROHDIR [--entscheidungen datei.json] [--kontext KONTEXTDIR]

ROHDIR enthält je Figur `<fraktion>__<NN_name>.png__vN.png` (höchste Version,
die nicht in `verworfen` steht, gewinnt). Die Entscheidungsdatei (JSON) kann
je Schlüssel `fraktion/NN_name.png` setzen:
  "spiegeln": [Schlüssel, ...]   Rohbild blickt nach links -> horizontal spiegeln
  "verworfen": {Schlüssel: [Versionen]}   Versionen, die nicht genutzt werden
  "fallback": [Schlüssel, ...]   keine brauchbare Seite -> hasSide=false
  "kontext": {Schlüssel: Version}   Stufe 1: statt des Text-zu-Bild-Rohbilds das
                                    Bild-zu-Bild-Rohbild (FLUX.1-kontext-pro, kontext.py)
                                    dieser Version aus KONTEXTDIR verwenden
  "spiegeln_kontext": [Schlüssel, ...]  wie "spiegeln", aber für das Kontext-Rohbild
  "key_alle": true                  Chroma-Key-Freistellung (Stufe 2) für alle Rohbilder
  "freistellen_alt": [Schlüssel, ...]  Ausnahmen: ältere Freistellung (Stufe 0/1) beibehalten
  "portraet": [Schlüssel, ...]      Stufe 2, letzter Ausweg: das (bereits freigestellte)
                                    Porträt selbst als Seitensprite (source "porträt")
  "spiegeln_portraet": [Schlüssel, ...]  Porträt dabei horizontal spiegeln
  "portraet_loeschen": {Schlüssel: [[x0,y0,x1,y1], ...]}  Bildfehler im Porträt auslöschen
Ausgabe: src/client/assets/characters-side/, manifest.json,
src/client/assets/charactersheets/ und charactersheets/manifest.json, dazu
Kontaktbögen und Prüfbericht in ROHDIR/../pruefung.
"""
import json, sys, re
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

WURZEL = Path(__file__).resolve().parents[2]
PORTRAET = WURZEL / "src/client/assets/characters"
SEITE = WURZEL / "src/client/assets/characters-side"
BOGEN = WURZEL / "src/client/assets/charactersheets"
GROESSE = 256
GRUNDLINIE = 240
MAX_H, MAX_B = 224, 236


def hsv(rgb: np.ndarray):
    x = rgb.astype(np.float32) / 255
    mx, mn = x.max(2), x.min(2)
    d = mx - mn + 1e-6
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, d / (mx + 1e-6), mx


def glatt(rgb: np.ndarray) -> np.ndarray:
    """Flächen ohne Kante (Konturen und Schattierung trennen Hintergrund von Figurenteilen)."""
    x = rgb.astype(np.int16)
    kante = np.zeros(rgb.shape[:2], bool)
    kante[:, 1:] |= np.abs(np.diff(x, axis=1)).max(2) > 9
    kante[1:, :] |= np.abs(np.diff(x, axis=0)).max(2) > 9
    return ~kante


def freistellen(rgb: np.ndarray):
    """Gibt (rgb, alpha[0..1]) zurück: Randflächen (auch Boden, Verlauf) plus gleichfarbige Löcher."""
    kand = glatt(rgb)
    lab, n = ndi.label(kand)
    rand_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    groesse = ndi.sum(kand, lab, range(1, n + 1)) if n else []
    haupt = [i for i in rand_ids if groesse[i - 1] >= 300]
    bg = np.isin(lab, haupt)
    if bg.any():
        oben = np.zeros_like(bg)
        oben[: int(0.72 * bg.shape[0])] = True
        probe = rgb[bg & oben][::37].astype(np.float32)
        baum = cKDTree(probe)
        q = (rgb.reshape(-1, 3) >> 2).astype(np.uint32)
        schl = (q[:, 0] << 16) | (q[:, 1] << 8) | q[:, 2]
        uni, inv = np.unique(schl, return_inverse=True)
        farben = np.stack([(uni >> 16) & 255, (uni >> 8) & 255, uni & 255], 1).astype(np.float32) * 4 + 2
        du, _ = baum.query(farben)
        d = du[inv].reshape(rgb.shape[:2])
        sat_bg = float(np.median(hsv(rgb)[1][bg]))
        tol = 30 if sat_bg > 0.5 else 14
        nah = d < tol
        # 1) gleichfarbige Pixel, die an den Hintergrund grenzen (Konturrand, Verlaufsreste)
        lab2, n2 = ndi.label(nah)
        ids = set(np.unique(lab2[bg])) - {0}
        bg = bg | np.isin(lab2, list(ids))
        # 2) eingeschlossene Löcher in Hintergrundfarbe (zwischen Arm und Körper, hinter Beinen)
        rest = nah & ~bg
        lab3, n3 = ndi.label(rest)
        if n3:
            idx = np.arange(1, n3 + 1)
            gr = ndi.sum(rest, lab3, idx)
            med = ndi.mean(d, lab3, idx)
            bg |= np.isin(lab3, idx[(gr >= 120) & (med < tol * 0.75)])
    fg = ~bg
    if bg.any() and fg.any():
        # Bodenschatten: dunklere, gleichfarbige Töne in der unteren Figurenzone
        h, sat, v = hsv(rgb)
        bh = np.degrees(np.arctan2(np.sin(np.radians(h[bg])).mean(), np.cos(np.radians(h[bg])).mean())) % 360
        dh = np.abs((h - bh + 180) % 360 - 180)
        ys = np.where(fg.any(1))[0]
        unten = np.zeros_like(fg)
        unten[int(ys.min() + 0.86 * (ys.max() - ys.min())):] = True
        fg &= ~(unten & (dh < 14) & (sat > 0.4) & (v < np.median(v[bg]) * 0.85))
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(fg)
    if n:
        flaechen = ndi.sum(fg, lab, range(1, n + 1))
        keep = [i + 1 for i, a in enumerate(flaechen) if a >= max(60, 0.004 * flaechen.sum())]
        fg = np.isin(lab, keep)
    luecken = ndi.binary_fill_holes(fg) & ~fg
    lab4, n4 = ndi.label(luecken)
    if n4:
        idx = np.arange(1, n4 + 1)
        klein = idx[ndi.sum(luecken, lab4, idx) < 150]
        fg = fg | np.isin(lab4, klein)
    # Randpixel entmischen: Farbe aus dem Inneren übernehmen, Kante weich
    innen = ndi.binary_erosion(fg, iterations=2)
    idx = ndi.distance_transform_edt(~innen, return_distances=False, return_indices=True)
    farbe = rgb[idx[0], idx[1]]
    band = fg & ~innen
    out = rgb.copy()
    out[band] = farbe[band]
    alpha = ndi.gaussian_filter(ndi.binary_erosion(fg, iterations=1).astype(np.float32), 0.8)
    return out, np.clip(alpha * 1.15 - 0.05, 0, 1)


def _abstand(rgb: np.ndarray, pal: np.ndarray) -> np.ndarray:
    """Farbabstand jedes Pixels zur nächsten Paletten-Farbe (über quantisierte Einzelfarben)."""
    baum = cKDTree(pal)
    q = (rgb.reshape(-1, 3) >> 2).astype(np.uint32)
    schl = (q[:, 0] << 16) | (q[:, 1] << 8) | q[:, 2]
    uni, inv = np.unique(schl, return_inverse=True)
    farben = np.stack([(uni >> 16) & 255, (uni >> 8) & 255, uni & 255], 1).astype(np.float32) * 4 + 2
    du, _ = baum.query(farben)
    return du[inv].reshape(rgb.shape[:2])


def freistellen_key(rgb: np.ndarray, tol: float = 44.0):
    """Stufe 2: Chroma-Key (die Kontext-Rohbilder haben einen einfarbigen Hintergrund).

    Palette = Randring des Bilds (leicht quantisiert); Hintergrund = mit dem Rand
    verbundene Pixel nahe der Palette, dazu eingeschlossene Löcher in Hintergrundfarbe;
    Bodenschatten (dunkler gleicher Farbton) entfällt. Die Palette wächst bewusst nicht
    mit: dunkle Figurenteile würden sonst als Hintergrund gelten.
    """
    ring = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3),
                           rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    pal = np.unique((ring // 8).astype(np.int32) * 8 + 4, axis=0).astype(np.float32)
    bg = np.zeros(rgb.shape[:2], bool)
    for t in (tol,):
        d = _abstand(rgb, pal)
        nah = d < t
        lab, _ = ndi.label(nah)
        ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(ids))
    d = _abstand(rgb, pal)
    # eingeschlossene Löcher in Hintergrundfarbe (zwischen Beinen, Armen, in Schwüngen)
    rest = (d < tol * 1.4) & ~bg
    lab3, n3 = ndi.label(rest)
    if n3:
        idx = np.arange(1, n3 + 1)
        gr = ndi.sum(rest, lab3, idx)
        med = ndi.mean(d, lab3, idx)
        bg |= np.isin(lab3, idx[(gr >= 60) & (med < tol * 1.1)])
    # Mischpixel am Rand (Leuchtringe, Wirbel): Hintergrundnahe Pixel am Hintergrund abschälen
    bgc0 = np.median(ring, axis=0).astype(np.float32)
    dbg = np.linalg.norm(rgb.astype(np.float32) - bgc0, axis=2)
    hh0 = hsv(rgb)[0]
    hb0 = hh0[bg]
    if hb0.size:
        bhm = np.degrees(np.arctan2(np.sin(np.radians(hb0)).mean(), np.cos(np.radians(hb0)).mean())) % 360
        nahton = np.abs((hh0 - bhm + 180) % 360 - 180) < 30
        for it in range(3):
            rand = ndi.binary_dilation(bg, iterations=1) & ~bg
            bg |= rand & (((dbg < 95)) | (nahton & (dbg < 125) & (hsv(rgb)[1] > 0.3)))
    fg = ~bg
    if bg.any() and fg.any():  # Hintergrund-Farbton (auch abgedunkelt) in eingeschlossenen Lücken
        h, sat, v = hsv(rgb)
        bh0 = np.degrees(np.arctan2(np.sin(np.radians(h[bg])).mean(), np.cos(np.radians(h[bg])).mean())) % 360
        aehnlich = fg & (np.abs((h - bh0 + 180) % 360 - 180) < 14) & (sat > 0.5) & (v < np.median(v[bg]) * 1.02)
        aehnlich = ndi.binary_opening(aehnlich, iterations=2)
        lab5, n5 = ndi.label(aehnlich)
        if n5:
            idx = np.arange(1, n5 + 1)
            bg |= np.isin(lab5, idx[ndi.sum(aehnlich, lab5, idx) >= 60])
            fg = ~bg
    if bg.any() and fg.any():  # Bodenschatten: dunkler gleicher Farbton im unteren Figurenbereich
        h, sat, v = hsv(rgb)
        bh = np.degrees(np.arctan2(np.sin(np.radians(h[bg])).mean(), np.cos(np.radians(h[bg])).mean())) % 360
        dh = np.abs((h - bh + 180) % 360 - 180)
        ys = np.where(fg.any(1))[0]
        unten = np.zeros_like(fg)
        unten[int(ys.min() + 0.80 * (ys.max() - ys.min())):] = True
        fg &= ~(unten & (dh < 16) & (sat > 0.4) & (v < np.median(v[bg]) * 0.92))
        # flache, dunkle Schattenellipsen mit leicht verschobenem Farbton (Bodenschatten)
        cand = fg & unten & (dh < 35) & (sat > 0.4) & (v < np.median(v[bg]) * 0.6)
        lab6, n6 = ndi.label(cand)
        for i, sl in enumerate(ndi.find_objects(lab6)):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if (lab6[sl] == i + 1).sum() >= 300 and ww >= 2.2 * hh:
                fg[sl] &= ~(lab6[sl] == i + 1)
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(fg)
    if n:
        flaechen = ndi.sum(fg, lab, range(1, n + 1))
        keep = [i + 1 for i, a in enumerate(flaechen) if a >= max(40, 0.0015 * flaechen.sum())]
        fg = np.isin(lab, keep)
    luecken = ndi.binary_fill_holes(fg) & ~fg
    lab4, n4 = ndi.label(luecken)
    if n4:
        idx = np.arange(1, n4 + 1)
        klein = idx[ndi.sum(luecken, lab4, idx) < 150]
        fg = fg | np.isin(lab4, klein)
    innen = ndi.binary_erosion(fg, iterations=2)
    idx = ndi.distance_transform_edt(~innen, return_distances=False, return_indices=True)
    farbe = rgb[idx[0], idx[1]]
    band = fg & ~innen
    out = rgb.copy()
    out[band] = farbe[band]
    alpha = ndi.gaussian_filter(ndi.binary_erosion(fg, iterations=1).astype(np.float32), 0.8)
    alpha = np.clip(alpha * 1.15 - 0.05, 0, 1)
    # Leuchtränder und Flammen: mit dem Hintergrund gemischte Pixel entmischen (kein Grün-/Magentasaum)
    bgc = np.median(ring, axis=0).astype(np.float32)
    dd = np.linalg.norm(rgb.astype(np.float32) - bgc, axis=2)
    weit = fg & ~ndi.binary_erosion(fg, iterations=24) & (dd < 130)
    a = np.clip(dd / 130.0, 0.2, 1.0)
    farb = np.clip((rgb.astype(np.float32) - (1 - a)[..., None] * bgc) / a[..., None], 0, 255).astype(np.uint8)
    out[weit] = farb[weit]
    h, sat, v = hsv(out)
    hb = hsv(rgb)[0][~fg]
    bh1 = np.degrees(np.arctan2(np.sin(np.radians(hb)).mean(), np.cos(np.radians(hb)).mean())) % 360
    saum = weit & (np.abs((h - bh1 + 180) % 360 - 180) < 38) & (sat > 0.25)  # Restsaum im Hintergrundton
    out[saum] = farbe[saum]
    alpha[weit] *= a[weit]
    return out, alpha


def pruefen(alpha: np.ndarray) -> dict:
    a = alpha > 0.5
    lab, n = ndi.label(a)
    flaechen = ndi.sum(a, lab, range(1, n + 1)) if n else [0]
    anteil = a.mean()
    ecken = all(alpha[y, x] == 0 for y, x in [(0, 0), (0, -1), (-1, 0), (-1, -1)])
    return {"anteil": round(float(anteil), 3), "ecken": bool(ecken), "komponenten": int(n),
            "haupt": round(float(max(flaechen) / max(1, sum(flaechen))), 3)}


def normalisieren(rgb: np.ndarray, alpha: np.ndarray):
    ys, xs = np.where(alpha > 0.08)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    bild = Image.fromarray(np.dstack([rgb, (alpha * 255).astype(np.uint8)]), "RGBA").crop((x0, y0, x1, y1))
    s = min(MAX_H / bild.height, MAX_B / bild.width)
    bild = bild.resize((max(1, round(bild.width * s)), max(1, round(bild.height * s))), Image.LANCZOS)
    leinwand = Image.new("RGBA", (GROESSE, GROESSE), (0, 0, 0, 0))
    ox = (GROESSE - bild.width) // 2
    oy = GRUNDLINIE - bild.height
    leinwand.paste(bild, (ox, oy), bild)
    a = np.asarray(leinwand)[..., 3]
    unten = np.where(a > 40)[0].max()
    fuss = np.where(a[max(0, unten - 12):unten + 1] > 40)[1]
    return leinwand, int(round(fuss.mean())) if len(fuss) else GROESSE // 2


def neueste(roh: Path, entsch: dict):
    d = {}
    for f in sorted(roh.glob("*.png")):
        m = re.match(r"(.+?)__(.+\.png)__v(\d+)\.png$", f.name)
        if not m:
            continue
        schl = f"{m[1]}/{m[2]}"
        if int(m[3]) in entsch.get("verworfen", {}).get(schl, []):
            continue
        d[schl] = f
    return d


def _blatt(schl, bild, fx, bogen_manifest):
    """Einzel-Charactersheet: Front (Porträt) und Seite nebeneinander."""
    p = Image.open(PORTRAET / schl).convert("RGBA")
    pa = np.asarray(p)
    front, ffx = normalisieren(pa[..., :3].copy(), pa[..., 3] / 255.0)
    blatt = Image.new("RGBA", (2 * GROESSE, GROESSE), (0, 0, 0, 0))
    blatt.paste(front, (0, 0))
    blatt.paste(bild, (GROESSE, 0))
    bz = BOGEN / schl
    bz.parent.mkdir(parents=True, exist_ok=True)
    blatt.save(bz, optimize=True)
    bogen_manifest[schl] = {"file": schl, "groundY": GRUNDLINIE,
                            "front": {"x": 0, "y": 0, "w": GROESSE, "h": GROESSE, "anchor": {"x": ffx, "y": GRUNDLINIE}},
                            "side": {"x": GROESSE, "y": 0, "w": GROESSE, "h": GROESSE, "anchor": {"x": fx, "y": GRUNDLINIE}}}


def main() -> int:
    roh = Path(sys.argv[1])
    entsch = {}
    if "--entscheidungen" in sys.argv:
        entsch = json.loads(Path(sys.argv[sys.argv.index("--entscheidungen") + 1]).read_text())
    kdir = Path(sys.argv[sys.argv.index("--kontext") + 1]) if "--kontext" in sys.argv else None
    prf = roh.parent / "pruefung"
    prf.mkdir(exist_ok=True)
    dateien = neueste(roh, entsch)
    modell = entsch.get("modell", "black-forest-labs/FLUX.1.1-pro")
    manifest, bogen_manifest, bericht = {}, {}, {}
    alle = sorted(f"{p.parent.name}/{p.name}" for p in PORTRAET.glob("*/*.png"))
    for schl in alle:
        eintrag = {"file": schl, "hasSide": False, "anchor": None, "facing": "right",
                   "source": "together", "model": modell}
        kv = entsch.get("kontext", {}).get(schl)
        if kv is not None:
            quelle = kdir / (schl.replace("/", "__") + f"__v{kv}.png")
            dateien[schl] = quelle
        if schl in entsch.get("portraet", []):
            pa = np.asarray(Image.open(PORTRAET / schl).convert("RGBA"))
            if schl in entsch.get("spiegeln_portraet", []):
                pa = pa[:, ::-1]
            pa = np.array(pa)
            for x0, y0, x1, y1 in entsch.get("portraet_loeschen", {}).get(schl, []):
                pa[y0:y1, x0:x1, 3] = 0  # Bildfehler im Porträt (Zeichen im Strahl)
            bericht[schl] = pruefen(pa[..., 3] / 255.0)
            bild, fx = normalisieren(pa[..., :3].copy(), pa[..., 3] / 255.0)
            ziel = SEITE / schl
            ziel.parent.mkdir(parents=True, exist_ok=True)
            bild.save(ziel, optimize=True)
            eintrag.update(hasSide=True, anchor={"x": fx, "y": GRUNDLINIE}, source="porträt", model=None)
            _blatt(schl, bild, fx, bogen_manifest)
        elif schl in dateien and schl not in entsch.get("fallback", []):
            rgb = np.asarray(Image.open(dateien[schl]).convert("RGB"))
            if schl in entsch.get("spiegeln_kontext" if kv is not None else "spiegeln", []):
                rgb = rgb[:, ::-1]
            if ((kv is not None and kv >= 4) or entsch.get("key_alle")) and schl not in entsch.get("freistellen_alt", []):  # Stufe 2: Chroma-Key mit wachsender Palette
                rgb, alpha = freistellen_key(np.ascontiguousarray(rgb))
            else:
                rgb, alpha = freistellen(np.ascontiguousarray(rgb))
            bericht[schl] = pruefen(alpha)
            bild, fx = normalisieren(rgb, alpha)
            ziel = SEITE / schl
            ziel.parent.mkdir(parents=True, exist_ok=True)
            bild.save(ziel, optimize=True)
            eintrag.update(hasSide=True, anchor={"x": fx, "y": GRUNDLINIE})
            if kv is not None:
                eintrag.update(source="together-kontext", model=entsch.get("modell_kontext", "black-forest-labs/FLUX.1-kontext-pro"))
            _blatt(schl, bild, fx, bogen_manifest)
        manifest[schl] = eintrag
    kopf = {"version": 1, "size": GROESSE, "groundY": GRUNDLINIE, "facing": "right",
            "source": "together", "model": modell}
    SEITE.mkdir(parents=True, exist_ok=True)
    BOGEN.mkdir(parents=True, exist_ok=True)
    (SEITE / "manifest.json").write_text(json.dumps({**kopf, "figures": manifest}, indent=1, ensure_ascii=False) + "\n")
    (BOGEN / "manifest.json").write_text(json.dumps({"version": 1, "cell": GROESSE, "groundY": GRUNDLINIE,
                                                     "sheets": bogen_manifest}, indent=1, ensure_ascii=False) + "\n")
    (prf / "bericht.json").write_text(json.dumps(bericht, indent=1))
    print("Seiten:", sum(e["hasSide"] for e in manifest.values()), "von", len(manifest))
    for k, v in bericht.items():
        if not (0.08 < v["anteil"] < 0.7 and v["ecken"] and v["haupt"] > 0.6):
            print("AUFFAELLIG", k, v)
    return 0


if __name__ == "__main__":
    sys.exit(main())
