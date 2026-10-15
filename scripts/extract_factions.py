#!/usr/bin/env python3
"""Schneidet die 81 Charaktere aus den neun Fraktionsbögen und stellt sie frei.

Aufbau der Bögen: 1024x1024, 3x3 Raster. Zeile = Klasse (Schwert/Bogen/Stab),
je Zeile drei Charaktere. Unter (beim Tierbogen auch über) jeder Figur steht der
Name, in einer Ecke ein Waffensymbol. Die Bögen sind RGB-PNG mit eingebranntem
SCHACHBRETT als "Transparenz" — echter Alphakanal fehlt.

Verfahren je Zelle (alles in numpy/scipy, kein Zufall, bitgleich wiederholbar):
  1. Schachbretttöne (hell/dunkel) aus dem Zellrand schätzen.
  2. Hintergrundverdächtig = unbunt UND Grauwert im Bereich der beiden Töne.
  3. Nur Hintergrund, der mit dem Rand zusammenhängt, wird entfernt (Flutfüllung
     über Zusammenhangskomponenten). Dunkle Konturen der Figuren halten ihr
     Inneres zusammen; helle/graue Teile IM Inneren bleiben dadurch erhalten.
  4. Eingeschlossene Schachbrettinseln (zwischen Arm und Körper usw.) werden über
     das geschätzte Raster (Periode und Phase je Zelle) erkannt und entfernt.
  5. Namen, Waffensymbol und Rahmen werden als Komponenten in den Randzonen
     verworfen; behalten wird die größte Figur plus nahe Teile (Glühen, Partikel,
     Schwärme).
  6. Kantenentmischung (Defringe): Randpixel sind Mischungen aus Figur- und
     Hintergrundfarbe; aus Nachbarfarben wird der Deckungsgrad geschätzt, die
     Hintergrundfarbe herausgerechnet und ein echter Alphakanal gesetzt.
  7. Ausgabe: HD-Porträt (quadratisch, höchstens in Quellgröße, nie hochskaliert)
     und das 256er-Sprite daraus.

Aufruf:
  python3 scripts/extract_factions.py [--quelle ORDNER] [--fraktion NAME]
                                      [--vorschau ORDNER]
Ergebnis: src/client/assets/characters/<fraktion>/<zeile><spalte>_<name>.png
          src/client/assets/characters-hd/<fraktion>/<dieselben Namen>.png
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
QUELLE = ROOT / "assets" / "fraktionen"
ZIEL = ROOT / "src" / "client" / "assets" / "characters"
ZIEL_HD = ROOT / "src" / "client" / "assets" / "characters-hd"

DEBUG = False
SPRITE_KANTE = 256
HD_MAX = 512
# Rand um die Figur im quadratischen Bild (Anteil der Kantenlänge je Seite).
RAND_ANTEIL = 0.03

# Je Bogen: Zellrand, der weggeschnitten wird (Rahmen/Vignette), und die Ecke des
# Waffensymbols ("links"/"rechts"/None).
BOGEN = {
    1: dict(inset=16, ikone="links"),
    2: dict(inset=7, ikone="rechts"),
    3: dict(inset=7, ikone="rechts"),
    4: dict(inset=7, ikone="rechts"),
    5: dict(inset=7, ikone="rechts"),
    6: dict(inset=7, ikone="rechts"),
    # Datenkult: Zeilen sitzen nicht auf Drittelgrenzen (Beschriftung ragt tiefer).
    7: dict(inset=7, ikone=None, zeilen=[(0, 403), (403, 718), (718, 1024)]),
    8: dict(inset=7, ikone="rechts"),
    9: dict(inset=7, ikone="rechts"),
}

# Unbuntheit: max(R,G,B)-min(R,G,B) darunter gilt als grau.
SAT_MAX = 14
# Toleranz der Grautöne um die Schachbretttöne.
TON_TOL_UNTEN = 16
TON_TOL_OBEN = 10


# Fraktion -> Nummer des Bogens (Reihenfolge der Quelldateien "team N.png").
BOGEN_NR = {"xeno": 1, "rodentia": 2, "pirates": 3, "machina": 4, "undead": 5,
            "shinobi": 6, "datacult": 7, "pixel": 8, "beasts": 9}


def zelle(bogen: np.ndarray, zeile: int, spalte: int,
          zeilen=None) -> tuple[np.ndarray, tuple[int, int]]:
    h, b = bogen.shape[:2]
    if zeilen:
        y0, y1 = zeilen[zeile]
    else:
        y0, y1 = round(zeile * h / 3), round((zeile + 1) * h / 3)
    x0, x1 = round(spalte * b / 3), round((spalte + 1) * b / 3)
    return bogen[y0:y1, x0:x1], (x0, y0)


def grau_und_bunt(k: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    a = k.astype(np.int16)
    return a.mean(axis=2), (a.max(axis=2) - a.min(axis=2))


def schachbretttoene(g: np.ndarray, bunt: np.ndarray) -> tuple[float, float]:
    """Heller und dunkler Ton aus dem Zellrand (2-Means auf unbunten Randpixeln)."""
    rand = np.zeros(g.shape, bool)
    rand[:10, :] = rand[-10:, :] = rand[:, :10] = rand[:, -10:] = True
    w = g[rand & (bunt <= SAT_MAX) & (g > 120)]
    if w.size < 200:
        w = g[(bunt <= SAT_MAX) & (g > 120)]
    dunkel, hell = np.percentile(w, 25), np.percentile(w, 90)
    for _ in range(12):
        mitte = (dunkel + hell) / 2
        unten, oben = w[w < mitte], w[w >= mitte]
        if unten.size == 0 or oben.size == 0:
            break
        dunkel, hell = np.median(unten), np.median(oben)
    return float(dunkel), float(hell)


def hintergrundverdacht(g: np.ndarray, bunt: np.ndarray, dunkel: float, hell: float) -> np.ndarray:
    return (bunt <= SAT_MAX) & (g >= dunkel - TON_TOL_UNTEN) & (g <= hell + TON_TOL_OBEN)


def randverbunden(maske: np.ndarray) -> np.ndarray:
    """Teil von `maske`, dessen Komponenten den Bildrand berühren."""
    lab, n = ndi.label(maske)  # 4er-Nachbarschaft: Konturen aus Diagonalen sperren
    if n == 0:
        return np.zeros_like(maske)
    rand = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    rand = rand[rand > 0]
    return np.isin(lab, rand)


def tonkarte(g: np.ndarray, maske: np.ndarray, sigma: float = 22.0) -> np.ndarray:
    """Glatte Karte eines Tons aus den Pixeln in `maske` (normierte Faltung)."""
    zaehler = ndi.gaussian_filter(np.where(maske, g, 0.0), sigma)
    nenner = ndi.gaussian_filter(maske.astype(float), sigma)
    gesamt = float(g[maske].mean()) if maske.any() else 230.0
    return np.where(nenner > 1e-3, zaehler / np.maximum(nenner, 1e-3), gesamt)


def deckung_min(rgb: np.ndarray, b: np.ndarray, rauschen: float = 3.0) -> np.ndarray:
    """Kleinster Deckungsgrad, der `rgb` über Hintergrund `b` (grau) erklärt.

    obs = a*C + (1-a)*b mit C in [0,255]. Je Kanal ergibt das eine Untergrenze für a;
    die größte gilt. Reiner Hintergrund liefert ~0, tiefes Schwarz ~1.
    """
    bb = b[..., None]
    # `rauschen` Stufen abziehen (Tonschwankung des gemalten Rasters); der Nenner nach oben bleibt >= 30, sonst wird
    # jedes Pixel über einem fast weißen Hintergrund zu "voll deckend".
    unten = np.maximum(bb - rgb - rauschen, 0.0) / np.maximum(bb, 1.0)
    oben = np.maximum(rgb - bb - rauschen, 0.0) / np.maximum(255.0 - bb, 30.0)
    return np.clip(np.maximum(unten.max(axis=2), oben.max(axis=2)), 0.0, 1.0)


# Ab dieser Mindestdeckung gilt ein Pixel als Figur (undurchsichtig).
TAU = 0.80
# Das Glühen wird nur durch Pixel unter dieser Mindestdeckung durchflutet; mittel
# gesättigte Konturen (0,5..0,8) halten Figurenteile zusammen.
TAU_FLUT = 0.40
# Ab dieser Mindestdeckung ist die Figur im Saum voll deckend (Alpha 1).
TAU_ALPHA = 0.60
# Kleinste Fläche (Pixel) einer eingeschlossenen Schachbrettinsel, die automatisch
# entfernt wird.
LOCH_MIN = 110
# Kleinste Fläche für die strenge Stufe (exakte Töne, flach).
LOCH_FEIN = 24
# Unterhalb davon ist ein Pixel reiner Hintergrund (Rauschgrenze).
RAUSCH = 0.10


def _scheibe(r: int) -> np.ndarray:
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


class Zelle:
    """Ergebnis der Freistellung einer Zelle: RGB (float), Alpha (0..1)."""

    def __init__(self, rgb, alpha, info):
        self.rgb = rgb
        self.alpha = alpha
        self.info = info


def hintergrund_modell(k: np.ndarray):
    """Schachbrettmodell der Zelle: erwarteter Grauwert je Pixel (zwei Varianten).

    Liefert (b_hell, b_dunkel, klasse, linienabstand, info). Die Töne werden aus
    sicherem Hintergrund (randverbunden, eng am Ton) als glatte Karten geschätzt,
    damit Vignette und Helligkeitsverlauf mitgehen.
    """
    g, bunt = grau_und_bunt(k)
    dunkel, hell = schachbretttoene(g, bunt)
    v = hintergrundverdacht(g, bunt, dunkel, hell)
    bg = randverbunden(v)
    sicher = bg & ndi.binary_erosion(bg, iterations=2)
    mitte = (dunkel + hell) / 2
    eng_hell = sicher & (np.abs(g - hell) <= 14) & (g >= mitte)
    eng_dunkel = sicher & (np.abs(g - dunkel) <= 14) & (g < mitte)
    b_hell = tonkarte(g, eng_hell)
    b_dunkel = tonkarte(g, eng_dunkel)
    info = dict(dunkel=round(dunkel, 1), hell=round(hell, 1))
    return g, b_hell, b_dunkel, info


def periode_schaetzen(klasse: np.ndarray) -> float:
    """Feldbreite des Schachbretts aus bekannten Hintergrundpixeln.

    `klasse` ist +1 (hell), -1 (dunkel) oder 0 (unbekannt). Die Autokorrelation
    einer Rechteckwelle ist eine Dreieckswelle mit dem Minimum bei einer
    Feldbreite Verschiebung.
    """
    beste, wert = 25.5, 1e9
    erg = {}
    for d in range(10, 41):
        punkte = []
        for achse in (0, 1):
            a = klasse if achse == 1 else klasse.T
            x, y = a[:, d:].astype(np.int32), a[:, :-d].astype(np.int32)
            prod = x * y
            n = np.count_nonzero(prod)
            if n > 400:
                punkte.append(prod.sum() / n)
        if punkte:
            erg[d] = float(np.mean(punkte))
    if not erg:
        return beste
    d0 = min(erg, key=erg.get)
    if d0 - 1 in erg and d0 + 1 in erg:
        em, e0, ep = erg[d0 - 1], erg[d0], erg[d0 + 1]
        nenner = em - 2 * e0 + ep
        if nenner > 1e-9:
            return float(np.clip(d0 + 0.5 * (em - ep) / nenner, d0 - 1, d0 + 1))
    return float(d0)


def stufe_passt(g: np.ndarray, b_hell: np.ndarray, b_dunkel: np.ndarray, maske: np.ndarray) -> bool:
    """Ersatztest für Flächen, deren Umgebung kein Raster erkennen lässt.

    Ein Schachbrett hat zwei flache Töne, die DIREKT aneinanderstoßen (Stufe von
    ~40 Graustufen). Metall oder Zähne haben Verläufe, keine zwei exakten Töne.
    """
    hell = maske & (np.abs(g - b_hell) <= 6)
    dunkel = maske & (np.abs(g - b_dunkel) <= 6)
    if hell.sum() < 40 or dunkel.sum() < 40:
        return False
    kontakt = ndi.binary_dilation(hell, structure=_scheibe(2)) & dunkel
    return int(kontakt.sum()) >= 15


def gitter_passt(klasse: np.ndarray, sicher: np.ndarray, maske: np.ndarray, sl, periode: float) -> bool:
    """Folgt die Fläche `maske` dem Schachbrettraster der Umgebung?

    Im Fenster um die Fläche werden Phase (x0, y0) und Vorzeichen des Rasters aus den
    sicheren Hintergrundpixeln gefittet (Periode fest). Die Fläche passt, wenn die
    erwartete Klasse für den größten Teil ihrer Pixel mit der gemessenen übereinstimmt.
    """
    h, b = klasse.shape
    rad = int(periode * 1.6)
    y0, y1 = max(0, sl[0].start - rad), min(h, sl[0].stop + rad)
    x0, x1 = max(0, sl[1].start - rad), min(b, sl[1].stop + rad)
    # Nur Felder in unmittelbarer Nähe: Das gemalte Raster hat Versetzungen (eine
    # Zeile ist stellenweise um ein Feld verschoben), über das ganze Fenster passt
    # keine einzelne Phase.
    nah = ndi.distance_transform_edt(~maske[y0:y1, x0:x1]) <= periode * 0.6
    ys, xs = np.nonzero(sicher[y0:y1, x0:x1] & ~maske[y0:y1, x0:x1] & nah)
    if ys.size < 150:
        return False
    sel = slice(None, None, max(1, ys.size // 3000))
    ys, xs = ys[sel] + y0, xs[sel] + x0
    v = klasse[ys, xs].astype(float)
    pys, pxs = np.nonzero(maske)
    pys, pxs = pys[:: max(1, pys.size // 800)], pxs[:: max(1, pxs.size // 800)]
    m = klasse[pys, pxs].astype(float)
    bester, rest = 0.0, None
    phasen = np.arange(0.0, periode, 1.0)
    for fy in phasen:
        sy = np.where(np.floor((ys - fy) / periode) % 2 == 0, 1.0, -1.0)
        for fx in phasen:
            sx = np.where(np.floor((xs - fx) / periode) % 2 == 0, 1.0, -1.0)
            roh = float(np.mean(v * sx * sy))
            if abs(roh) > bester:
                bester, rest = abs(roh), (fx, fy, 1.0 if roh > 0 else -1.0)
    if DEBUG:
        print('   fit', ys.size, round(bester, 2), rest)
    if bester < 0.6 or rest is None:
        return False
    fx, fy, vz = rest
    ex = np.where(np.floor((pxs - fx) / periode) % 2 == 0, 1.0, -1.0)
    ey = np.where(np.floor((pys - fy) / periode) % 2 == 0, 1.0, -1.0)
    erwartet = vz * ex * ey
    # Pixel nahe einer Feldkante (Weichzeichnung) zählen nicht.
    kx = ((pxs - fx) / periode) % 1.0
    ky = ((pys - fy) / periode) % 1.0
    kante = (np.minimum(kx, 1 - kx) * periode < 3) | (np.minimum(ky, 1 - ky) * periode < 3)
    zaehlt = ~kante
    if zaehlt.sum() < 20:
        return False
    anteil = float(np.mean(erwartet[zaehlt] == m[zaehlt]))
    if DEBUG:
        print('   anteil', round(anteil, 2), int(zaehlt.sum()))
    return anteil >= 0.85


def freistellen_zelle(k: np.ndarray) -> Zelle:
    rgb = k.astype(np.float32)
    g, b_hell, b_dunkel, info = hintergrund_modell(k)

    rauschen = max(5.0, 0.3 * float(np.mean(b_hell - b_dunkel)))
    a_hell = deckung_min(rgb, b_hell, rauschen)
    a_dunkel = deckung_min(rgb, b_dunkel, rauschen)
    # Welcher der beiden Töne unter dem Pixel liegt, ist nicht verlässlich zu
    # wissen (das gemalte Raster ist unregelmäßig, Felder sind verschoben). Die
    # Töne liegen nur ~40 Stufen auseinander; der günstigere Ton genügt.
    a_min = np.minimum(a_hell, a_dunkel)
    b = np.where(a_hell <= a_dunkel, b_hell, b_dunkel)

    # Stufe 1: sicherer Hintergrund (unbunt, am Ton, randverbunden).
    mitte = (b_hell + b_dunkel) / 2
    eng = (np.abs(g - np.where(g >= mitte, b_hell, b_dunkel)) <= 12) \
        & ((rgb.max(axis=2) - rgb.min(axis=2)) <= SAT_MAX)
    r1 = randverbunden(eng | (a_min < RAUSCH))
    # Stufe 3: breite, durchscheinende Bereiche (Glühen), mit dem sicheren
    # Hintergrund verbunden. Das Öffnen schneidet dünne Ausläufer ab, die sonst
    # durch Lücken in den Konturen ins Figureninnere laufen würden.
    weich = a_min < TAU
    sperre = a_min < TAU_FLUT
    breit = ndi.binary_opening(sperre | r1, structure=_scheibe(3))
    lab, n = ndi.label(breit)
    if n:
        ids = np.unique(lab[r1 & breit])
        ids = ids[ids > 0]
        r3 = np.isin(lab, ids)
    else:
        r3 = np.zeros_like(r1)
    # Stufe 2: Saum von 3 px um beides (Kantenpixel sind Mischfarben).
    saum = ndi.binary_dilation(r1 | r3, structure=_scheibe(3)) & weich
    region = r1 | r3 | saum

    # Eingeschlossene Schachbrettinseln (zwischen Arm und Körper usw.): flache,
    # unbunte Flächen am Ton. Ob so eine Fläche wirklich Schachbrett ist (und nicht
    # Metall, Zähne, Glanz), entscheidet ein Gittertest: Die Felder ringsum
    # bestimmen Periode und Phase, die Fläche muss dem Raster folgen.
    kern = (np.minimum(np.abs(g - b_hell), np.abs(g - b_dunkel)) <= 10) \
        & ((rgb.max(axis=2) - rgb.min(axis=2)) <= SAT_MAX) & ~region
    kern = ndi.binary_opening(kern, structure=_scheibe(2))
    lab2, n2 = ndi.label(kern, structure=np.ones((3, 3)))
    if n2:
        mitte2 = (b_hell + b_dunkel) / 2
        klasse = np.where(g >= mitte2, 1, -1).astype(np.int8)
        sicher = r1 & (np.minimum(np.abs(g - b_hell), np.abs(g - b_dunkel)) <= 8)
        periode = periode_schaetzen(np.where(sicher, klasse, 0))
        for i, sl in enumerate(ndi.find_objects(lab2), start=1):
            maske = lab2 == i
            if maske.sum() < LOCH_MIN:
                continue
            ok = gitter_passt(klasse, sicher, maske, sl, periode) \
                or stufe_passt(g, b_hell, b_dunkel, maske)
            if DEBUG:
                print('  loch', int(maske.sum()), (sl[1].start, sl[0].start), round(periode, 1), ok)
            if ok:
                region |= ndi.binary_dilation(maske, structure=_scheibe(3)) & weich

    # Kleine Lücken (Speichenräder, Seilschlaufen): nur, wenn sie wirklich EXAKT die
    # Schachbretttöne treffen und flach sind. Echte Figurenweiß (Zähne, Augen) hat
    # Verlauf oder Farbstich.
    fein = (np.minimum(np.abs(g - b_hell), np.abs(g - b_dunkel)) <= 5) \
        & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 8) & ~region
    fein = ndi.binary_opening(fein, structure=_scheibe(1))
    lab3, n3 = ndi.label(fein, structure=np.ones((3, 3)))
    if n3:
        ids3 = np.arange(1, n3 + 1)
        fl3 = ndi.sum(np.ones_like(lab3), lab3, index=ids3)
        sd3 = ndi.standard_deviation(g, lab3, index=ids3)
        gut3 = np.nonzero((fl3 >= LOCH_FEIN) & (sd3 < 3.0))[0] + 1
        region |= ndi.binary_dilation(np.isin(lab3, gut3), structure=_scheibe(3)) & weich

    alpha = np.ones(g.shape, np.float32)
    mapped = np.clip((a_min - RAUSCH) / (TAU_ALPHA - RAUSCH), 0.0, 1.0)
    alpha[region] = mapped[region]
    alpha[alpha < 0.12] = 0.0
    # Farbe: Hintergrund herausrechnen, wo teiltransparent.
    am = np.maximum(a_min, 0.05)[..., None]
    farbe = np.clip((rgb - (1 - am) * b[..., None]) / am, 0, 255)
    teil = region & (a_min < TAU)
    out = rgb.copy()
    out[teil] = farbe[teil]
    # Randpixel mit kleinem Deckungsgrad haben als Mischfarbe fast nur Hintergrund;
    # ihre entmischte Farbe rauscht und ergibt hellgraue Säume. Sie übernehmen
    # stattdessen die Farbe des nächsten festen Pixels (Kontur), solange eins
    # innerhalb von 3 px liegt. Weiter weg (Glühen) bleibt die entmischte Farbe.
    fest = alpha >= 0.95
    teilweise = (alpha > 0) & ~fest
    if fest.any() and teilweise.any():
        dist, (iy, ix) = ndi.distance_transform_edt(~fest, return_indices=True)
        nah = teilweise & (dist <= 3.5)
        out[nah] = out[iy[nah], ix[nah]]
    return Zelle(out, alpha, info)


# --------------------------------------------------------------------------
# Wasserzeichen
# --------------------------------------------------------------------------

# Mittelpunkt und Spitzenradius des halbtransparenten weißen Vierzackstern-Zeichens
# (Generator-Wasserzeichen) je Bogen, in Bogenpixeln. Auf Bogen 1 sitzt es unten
# rechts auf dem Schachbrett, auf allen anderen über der Figur der Zelle (2, 2).
STERN = {1: (973, 970, 32)}
STERN_STANDARD = (902, 904, 25)
STERN_DECKUNG = 0.24


def stern_entfernen(bogen: np.ndarray, nr: int) -> np.ndarray:
    """Rechnet die weiße Überlagerung des Sterns heraus (obs = c + t*(255-c))."""
    cx, cy, r = STERN.get(nr, STERN_STANDARD)
    h, b = bogen.shape[:2]
    ys, xs = np.mgrid[:h, :b]
    dx, dy = np.abs(xs - cx) / r, np.abs(ys - cy) / r
    # Astroide |dx|^(2/3) + |dy|^(2/3) <= 1: vierzackiger Stern mit eingezogenen Seiten.
    dn = (dx ** (2 / 3) + dy ** (2 / 3)) ** 1.5
    t = STERN_DECKUNG * np.clip((1 - dn) * 5, 0, 1)
    t = t[..., None]
    out = (bogen.astype(np.float32) - 255 * t) / (1 - t)
    return np.clip(out, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------
# Komponenten: Figur behalten, Namen/Symbol/Inseln verwerfen
# --------------------------------------------------------------------------

# Randzonen (Anteil der Zellhöhe), in denen eigenständige Komponenten als
# Beschriftung gelten. Der Tierbogen (9) hat den Namen zusätzlich OBEN.
ZONE_UNTEN = 0.86
ZONE_UNTEN_BOGEN = {7: 0.80}
ZONE_OBEN = {9: 0.18}
# Eckkasten (Pixel) des Waffensymbols.
IKONE_KASTEN = {1: (64, 64), 8: (84, 84)}
IKONE_STANDARD = (72, 72)
# Komponenten ab dieser Fläche (Anteil an der Figur) zählen als Teil (Schwarm).
TEIL_ANTEIL = 0.008
# Winzige Reste (Pixel) bleiben nur, wenn sie so nah an der Figur liegen (Funken).
INSEL_MIN = 25
INSEL_NAHE = 10


def komponenten_wahl(alpha: np.ndarray, bogen_nr: int, ikone: str | None) -> np.ndarray:
    """Maske der zu behaltenden Komponenten (bool)."""
    h, b = alpha.shape
    fest = alpha > 0.5
    lab, n = ndi.label(fest, structure=np.ones((3, 3)))
    if n == 0:
        return fest
    objekte = ndi.find_objects(lab)
    flaechen = ndi.sum(fest, lab, index=np.arange(1, n + 1))
    ik_b, ik_h = IKONE_KASTEN.get(bogen_nr, IKONE_STANDARD)
    oben = ZONE_OBEN.get(bogen_nr)

    kandidat = np.ones(n, bool)
    for i, sl in enumerate(objekte):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if y0 >= ZONE_UNTEN_BOGEN.get(bogen_nr, ZONE_UNTEN) * h:
            kandidat[i] = False
        elif oben is not None and y1 <= oben * h:
            kandidat[i] = False
        elif ikone == "rechts" and x0 >= b - ik_b and y1 <= ik_h:
            kandidat[i] = False
        elif ikone == "links" and x1 <= ik_b and y1 <= ik_h:
            kandidat[i] = False
    if not kandidat.any():
        return np.zeros_like(fest)
    haupt = int(np.argmax(np.where(kandidat, flaechen, -1))) + 1
    haupt_maske = lab == haupt
    nah = ndi.distance_transform_edt(~haupt_maske) <= INSEL_NAHE
    behalten = np.zeros(n + 1, bool)
    for i in range(n):
        if not kandidat[i]:
            continue
        f = flaechen[i]
        if (i + 1) == haupt or f >= TEIL_ANTEIL * flaechen[haupt - 1]:
            behalten[i + 1] = f >= INSEL_MIN
        elif f >= INSEL_MIN and nah[lab == (i + 1)].any():
            behalten[i + 1] = True
    return behalten[lab]


def zuschneiden(zelle_: Zelle, behalten: np.ndarray):
    """Alpha auf die behaltenen Komponenten (plus 4 px Saum) einschränken."""
    saum = ndi.binary_dilation(behalten, structure=_scheibe(4))
    alpha = np.where(saum, zelle_.alpha, 0.0).astype(np.float32)
    ys, xs = np.where(alpha > 0.04)
    if ys.size == 0:
        return None
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return box, alpha


# --------------------------------------------------------------------------
# Handkorrekturen je Figur
# --------------------------------------------------------------------------
#
# Koordinaten in Pixeln der Zelle (nach dem Rand-Inset, wie in den Prüfansichten).
#   loecher : (x, y) -> die flache, unbunte Hintergrundfläche an dieser Stelle
#             (Schachbrettrest, den die Automatik nicht erkennt) wird entfernt.
#   behalte : (x, y, r) -> Kreis, in dem die Automatik nichts entfernen darf
#             (Metallglanz, Zähne), Originalfarben, voll deckend.
#   loesche : (x0, y0, x1, y1) -> Rechteck, in dem alles entfernt wird
#             (Namensreste, die an der Figur kleben).
# Schlüssel: (fraktion, dateiname ohne .png).
KORREKTUREN: dict = {
    ("xeno", "10_drone-theta"): dict(loecher=[(140, 178)]),
    ("xeno", "20_harbinger-zeta"): dict(loecher=[(107, 148)]),
    ("rodentia", "02_vanguard-captain-rix"): dict(behalte=[(233, 137, 12)], loecher=[(187, 250), (233, 253)]),
    ("rodentia", "12_volley-captain-spark"): dict(loecher=[(115, 143)]),
    ("rodentia", "20_alchemage-nibble"): dict(loecher=[(41, 42), (81, 53)]),
    ("rodentia", "21_technomancer-squeak"): dict(loecher=[(267, 102)]),
    ("pirates", "00_captain-sven"): dict(loecher=[(107, 178)]),
    ("pirates", "20_voodoo-witch-morgana"): dict(loecher=[(142, 165), (97, 168)]),
    ("machina", "02_hydra-titan-mech"): dict(loecher=[(229, 145), (139, 163)]),
    ("machina", "21_proxy-glitch-hack"): dict(loecher=[(132, 165)]),
    ("machina", "20_grid-drifter-datastream"): dict(loecher=[(92, 110)]),
    ("machina", "11_heavy-battery-moerser-bot"): dict(loesche=[(286, 26, 327, 62)]),
    ("beasts", "22_sonic-blossom"): dict(loesche=[(120, 0, 200, 48)]),
    ("beasts", "02_storm-talon"): dict(loecher=[(192, 242)]),
    ("pixel", "20_phantomal-a"): dict(loecher=[(164, 216)]),
    ("pixel", "21_arcanus-a"): dict(loecher=[(232, 138)]),
    ("shinobi", "00_shred-katana-hanzmon"): dict(loecher=[(216, 137)]),
    ("undead", "10_archer-mortis"): dict(loecher=[(191, 54), (242, 131), (221, 194)]),
    ("undead", "12_vessel-plague-skull"): dict(loecher=[(199, 149), (209, 241)]),
}


def korrigiere(z: Zelle, k: np.ndarray, kor: dict) -> None:
    if not kor:
        return
    g, b_hell, b_dunkel, _ = hintergrund_modell(k)
    bunt = k.astype(int).max(axis=2) - k.astype(int).min(axis=2)
    nahe = (np.minimum(np.abs(g - b_hell), np.abs(g - b_dunkel)) <= 16) & (bunt <= 20)
    lab, _ = ndi.label(nahe)
    h, b = g.shape
    for (x, y) in kor.get("loecher", []):
        y0, y1, x0, x1 = max(0, y - 12), min(h, y + 13), max(0, x - 12), min(b, x + 13)
        fenster = lab[y0:y1, x0:x1]
        ys, xs = np.nonzero(fenster > 0)
        if ys.size == 0:
            continue
        i = int(np.argmin((ys + y0 - y) ** 2 + (xs + x0 - x) ** 2))
        kennung = fenster[ys[i], xs[i]]
        flaeche = lab == kennung
        flaeche = ndi.binary_dilation(flaeche, structure=_scheibe(1))
        z.alpha[flaeche] = 0.0
    for (x, y, r) in kor.get("behalte", []):
        yy, xx = np.ogrid[:h, :b]
        kreis = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
        z.alpha[kreis] = 1.0
        z.rgb[kreis] = k[kreis]
    for (x0, y0, x1, y1) in kor.get("loesche", []):
        z.alpha[y0:y1, x0:x1] = 0.0


# --------------------------------------------------------------------------
# Ausgabe
# --------------------------------------------------------------------------

def quadrat(rgb: np.ndarray, alpha: np.ndarray, box) -> tuple[np.ndarray, np.ndarray]:
    """Schneidet die Figur aus und setzt sie mittig in ein Quadrat mit kleinem Rand.

    Die Kantenlänge ergibt sich aus der Figur in QUELLGRÖSSE (kein Hochskalieren),
    höchstens HD_MAX.
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    kante = int(np.ceil(max(w, h) / (1 - 2 * RAND_ANTEIL)))
    kante = min(kante, HD_MAX)
    lein_rgb = np.zeros((kante, kante, 3), np.float32)
    lein_a = np.zeros((kante, kante), np.float32)
    ox, oy = (kante - w) // 2, (kante - h) // 2
    lein_rgb[oy:oy + h, ox:ox + w] = rgb[y0:y1, x0:x1]
    lein_a[oy:oy + h, ox:ox + w] = alpha[y0:y1, x0:x1]
    return lein_rgb, lein_a


def als_bild(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    a8 = np.clip(np.rint(alpha * 255), 0, 255).astype(np.uint8)
    c8 = np.clip(np.rint(rgb), 0, 255).astype(np.uint8)
    c8[a8 == 0] = 0
    return Image.fromarray(np.dstack([c8, a8]), "RGBA")


def skalieren(rgb: np.ndarray, alpha: np.ndarray, kante: int) -> Image.Image:
    """Lanczos mit vormultiplizierter Farbe (keine dunklen/hellen Säume)."""
    kanaele = []
    for c in range(3):
        kanaele.append(Image.fromarray((rgb[..., c] * alpha).astype(np.float32), "F")
                       .resize((kante, kante), Image.LANCZOS))
    a = Image.fromarray(alpha.astype(np.float32), "F").resize((kante, kante), Image.LANCZOS)
    a = np.clip(np.asarray(a), 0, 1)
    pm = np.stack([np.asarray(k) for k in kanaele], axis=2)
    farbe = np.where(a[..., None] > 1e-4, pm / np.maximum(a[..., None], 1e-4), 0)
    return als_bild(np.clip(farbe, 0, 255), a)


def verarbeite(bogen: np.ndarray, bogen_nr: int, zeile: int, spalte: int, kor=None):
    cfg = BOGEN[bogen_nr]
    ins = cfg["inset"]
    k, _ = zelle(bogen, zeile, spalte, cfg.get("zeilen"))
    k = k[ins:-ins, ins:-ins]
    z = freistellen_zelle(k)
    korrigiere(z, k, kor)
    behalten = komponenten_wahl(z.alpha, bogen_nr, cfg["ikone"])
    ergebnis = zuschneiden(z, behalten)
    if ergebnis is None:
        return None
    box, alpha = ergebnis
    rgb, a = quadrat(z.rgb, alpha, box)
    hd = als_bild(rgb, a)
    sprite = skalieren(rgb, a, SPRITE_KANTE)
    return hd, sprite


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from namen import FRAKTIONEN  # type: ignore[import-not-found]

    ap = argparse.ArgumentParser()
    ap.add_argument("--quelle", default=str(QUELLE))
    ap.add_argument("--fraktion", default=None)
    ap.add_argument("--ziel", default=None, help="Ausgabewurzel (Standard: src/client/assets)")
    args = ap.parse_args()
    quelle = Path(args.quelle)
    wurzel = Path(args.ziel) if args.ziel else ZIEL.parent
    ziel, ziel_hd = wurzel / "characters", wurzel / "characters-hd"

    gesamt, fehler = 0, []
    for fraktion, eintraege in FRAKTIONEN.items():
        nr = BOGEN_NR[fraktion]
        if args.fraktion and args.fraktion != fraktion:
            continue
        datei = quelle / f"team {nr}.png"
        if not datei.exists():
            fehler.append(f"{datei.name} fehlt")
            continue
        bogen = np.asarray(Image.open(datei).convert("RGB"))
        bogen = stern_entfernen(bogen, nr)
        for d in (ziel / fraktion, ziel_hd / fraktion):
            d.mkdir(parents=True, exist_ok=True)
        for (zeile, spalte, name) in eintraege:
            res = verarbeite(bogen, nr, zeile, spalte, KORREKTUREN.get((fraktion, name)))
            if res is None:
                fehler.append(f"{fraktion}/{name}: keine Figur gefunden")
                continue
            hd, sprite = res
            hd.save(ziel_hd / fraktion / f"{name}.png", optimize=True)
            sprite.save(ziel / fraktion / f"{name}.png", optimize=True)
            gesamt += 1
        print(f"{fraktion}: fertig")
    print(f"{gesamt} Charaktere geschrieben")
    for f in fehler:
        print("FEHLER " + f)
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
