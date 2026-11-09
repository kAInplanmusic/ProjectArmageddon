#!/usr/bin/env python3
"""Gezielte Freistellung der Waffenbilder (BAL-09).

Entfernt an genau den belegten Rollen (Icon 128, Hand 128, Silhouette 128,
Menue 64) Rahmenlinien, randstaendige Platten und Randreste. Bewusste
Illustrationskacheln bleiben unangetastet; die Entscheidung je Waffe und Rolle
steht in `tools/waffen-freistellung.json` und nennt den Grund.

Aufruf:
    python3 tools/waffen-freistellung.py            # anwenden
    python3 tools/waffen-freistellung.py --pruefen  # nur messen, nichts schreiben
    python3 tools/waffen-freistellung.py --blatt    # zusaetzlich Kontaktboegen neu

Schreibt den Bericht `docs/waffenbalance-2026-11-09/freistellung/bericht.json`
mit Vorher/Nachher je ID und Rolle (Hashes, Deckflaeche, Komponenten, Kanten)
sowie je geaenderter ID einen Kontaktbogen auf dunklem und hellem Grund in
24/64/128 px und 2x (HiDPI).

Der Lauf ist wiederholbar: auf bereits bereinigten Zellen findet die Erkennung
nichts mehr und aendert nichts. Nach einer Neuerzeugung der Atlanten
(`scripts/waffen-sprites.py`) muss dieser Schritt erneut laufen; der Test
`tests/waffen-freistellung.test.js` haelt das fest.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(WURZEL, 'src', 'client', 'assets', 'weapon-sprites')
ICONS64 = os.path.join(WURZEL, 'src', 'client', 'assets', 'icons')
TABELLE = os.path.join(WURZEL, 'tools', 'waffen-freistellung.json')
BERICHT = os.path.join(WURZEL, 'docs', 'waffenbalance-2026-11-09', 'freistellung')
MANIFEST = os.path.join(SPRITES, 'manifest.json')

DUNKEL = (26, 30, 32)
HELL = (216, 212, 200)
ACHT = np.ones((3, 3), bool)


def sha256(pfad: str) -> str:
    return hashlib.sha256(open(pfad, 'rb').read()).hexdigest()


def git_stand(pfad: str) -> bytes | None:
    """Dateiinhalt aus HEAD (fuer den Vorher-Vergleich)."""
    rel = os.path.relpath(pfad, WURZEL)
    try:
        return subprocess.run(['git', 'show', f'HEAD:{rel}'], cwd=WURZEL,
                              check=True, capture_output=True).stdout
    except subprocess.CalledProcessError:
        return None


def bbox(alpha: np.ndarray, minimum: int = 8) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > minimum)
    if not len(xs):
        return (0, 0, 0, 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def kanten_anteil(alpha: np.ndarray, box: tuple[int, int, int, int]) -> float:
    """Groesster Deckungsanteil auf den vier Kanten der Inhalts-Box (Rahmenmass)."""
    x0, y0, x1, y1 = box
    a = alpha > 150
    return round(max(
        float(a[y0, x0:x1 + 1].mean()), float(a[y1, x0:x1 + 1].mean()),
        float(a[y0:y1 + 1, x0].mean()), float(a[y0:y1 + 1, x1].mean()),
    ), 3)


def komponenten(rgba: np.ndarray, minimum: int = 40) -> list[dict]:
    lab, n = ndi.label(rgba[..., 3] > 150, structure=ACHT)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if sl is None:
            continue
        m = lab[sl] == i
        if int(m.sum()) < minimum:
            continue
        out.append({
            'px': int(m.sum()),
            'bbox': [int(sl[1].start), int(sl[0].start),
                     int(sl[1].stop - sl[1].start), int(sl[0].stop - sl[0].start)],
        })
    out.sort(key=lambda e: -e['px'])
    return out


def laeufe(maske: np.ndarray) -> list[tuple[int, int]]:
    """Zusammenhaengende Wahre-Laeufe in einem 1-D-Band."""
    out, start = [], None
    for i, v in enumerate(maske):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(maske) - 1))
    return out


def rahmen_maske(rgba: np.ndarray, band: int = 9, tol: float = 46,
                 nur_isoliert: bool = False) -> tuple[np.ndarray, list]:
    """Duenne, farbgleiche Linien am Rand der Inhalts-Box (Rundrechteck-Rahmen).

    Gibt Maske und die gemessenen Rahmenfarben zurueck; die Farben dienen dem
    Entfernen einzelner Punkte/Punktreihen des Zierrasters.
    """
    a = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.int16)
    x0, y0, x1, y1 = bbox(a)
    h, w = a.shape
    maske = np.zeros_like(a, bool)
    farben = []
    kandidaten = []

    def isoliert(fest: bool, index: int, s: int, e: int) -> bool:
        """Liegt die Linie in durchsichtiger Umgebung (Zierlinie) statt an einer Waffenkante?"""
        if fest:
            links = a[max(0, index - 5):max(0, index - 2), x0 + s:x0 + e + 1]
            rechts = a[index + 3:index + 6, x0 + s:x0 + e + 1]
        else:
            links = a[y0 + s:y0 + e + 1, max(0, index - 5):max(0, index - 2)]
            rechts = a[y0 + s:y0 + e + 1, index + 3:index + 6]
        rand = np.concatenate([links.ravel(), rechts.ravel()]) if links.size and rechts.size else np.array([0])
        return float((rand > 40).mean()) < 0.35

    def pruefe_linie(fest: bool, index: int, laengs: np.ndarray, farbe_daten: np.ndarray) -> None:
        for s, e in laeufe(laengs):
            if e - s + 1 < max(12, int(0.10 * len(laengs))):
                continue
            if nur_isoliert and not isoliert(fest, index, s, e):
                continue
            farbe = np.median(farbe_daten[s:e + 1], axis=0)
            kandidaten.append((fest, index, s, e, farbe))

    for y in range(y0, min(y0 + band, y1 + 1)):
        pruefe_linie(True, y, a[y, x0:x1 + 1] > 150, rgb[y, x0:x1 + 1])
    for y in range(max(y1 - band, y0), y1 + 1):
        pruefe_linie(True, y, a[y, x0:x1 + 1] > 150, rgb[y, x0:x1 + 1])
    for x in range(x0, min(x0 + band, x1 + 1)):
        pruefe_linie(False, x, a[y0:y1 + 1, x] > 150, rgb[y0:y1 + 1, x])
    for x in range(max(x1 - band, x0), x1 + 1):
        pruefe_linie(False, x, a[y0:y1 + 1, x] > 150, rgb[y0:y1 + 1, x])

    for fest, index, s, e, farbe in kandidaten:
        farben.append([int(v) for v in farbe])
        if fest:
            ys, ye = max(0, index - 1), min(h - 1, index + 1)
            xs, xe = max(0, x0 + s - 4), min(w - 1, x0 + e + 4)
        else:
            ys, ye = max(0, y0 + s - 4), min(h - 1, y0 + e + 4)
            xs, xe = max(0, index - 1), min(w - 1, index + 1)
        teil_a = a[ys:ye + 1, xs:xe + 1]
        teil_rgb = rgb[ys:ye + 1, xs:xe + 1]
        nah = np.abs(teil_rgb - farbe).max(axis=2) <= tol
        # Nur die Linie, nicht eine dahinter liegende geschlossene Waffenflaeche:
        # liegt 3..5 px innerhalb der Linie massives Material, gehoert der Punkt zur Waffe
        # (Rohrmuendung, Radkante). Sonst ist es die duenne Zierlinie.
        frei = np.ones_like(nah)
        for yy in range(ys, ye + 1):
            for xx in range(xs, xe + 1):
                if not (nah[yy - ys, xx - xs] and a[yy, xx] > 0):
                    continue
                if fest:
                    richtung = 1 if index <= (y0 + y1) / 2 else -1
                    innen = a[max(0, yy + richtung * 3):yy + richtung * 5 + (1 if richtung > 0 else 0), xx:xx + 1]
                else:
                    richtung = 1 if index <= (x0 + x1) / 2 else -1
                    innen = a[yy:yy + 1, max(0, xx + richtung * 3):xx + richtung * 5 + (1 if richtung > 0 else 0)]
                frei[yy - ys, xx - xs] = float((innen > 120).mean()) < 0.5 if innen.size else True
        maske[ys:ye + 1, xs:xe + 1] |= nah & (teil_a > 0) & frei
    return maske, farben


def rahmen_reste(rgba: np.ndarray, farben: list, band: int = 10, max_px: int = 14,
                 tol: float = 42) -> np.ndarray:
    """Einzelne Punkte/Punktreihen des Zierrasters, die nach der Linie uebrig bleiben."""
    a = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.int16)
    x0, y0, x1, y1 = bbox(a)
    lab, n = ndi.label(a > 150, structure=ACHT)
    haupt = int(np.argmax(np.bincount(lab.ravel(), minlength=n + 1)[1:]) + 1)
    maske = np.zeros_like(a, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if sl is None or i == haupt:
            continue
        m = lab[sl] == i
        if int(m.sum()) > max_px:
            continue
        randnah = (sl[1].start <= x0 + band or sl[1].stop >= x1 - band
                   or sl[0].start <= y0 + band or sl[0].stop >= y1 - band)
        if not randnah:
            continue
        farbe = np.median(rgb[sl][m], axis=0)
        if any(np.abs(farbe - np.array(f)).max() <= tol for f in farben):
            maske |= lab == i
    return maske


def rahmen_saum(rgba: np.ndarray, farben: list, band: int = 9, tol: float = 40) -> np.ndarray:
    """Farbgleiche Reste im Aussenband (Punktreihen des Zierrasters, Ecken)."""
    a = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.int16)
    x0, y0, x1, y1 = bbox(a)
    streifen = np.zeros_like(a, bool)
    streifen[y0:y1 + 1, x0:min(x1 + 1, x0 + band)] = True
    streifen[y0:y1 + 1, max(x0, x1 - band + 1):x1 + 1] = True
    streifen[y0:min(y1 + 1, y0 + band), x0:x1 + 1] = True
    streifen[max(y0, y1 - band + 1):y1 + 1, x0:x1 + 1] = True
    nah = np.zeros_like(a, bool)
    for farbe in farben:
        nah |= np.abs(rgb - np.array(farbe)).max(axis=2) <= tol
    return streifen & nah & (a > 0)


def randpunkte(rgba: np.ndarray, band: int = 12, max_px: int = 20) -> np.ndarray:
    """Einzelne Randpunkte (Zierraster, Staub) ohne Verbindung zum Hauptmotiv."""
    a = rgba[..., 3]
    x0, y0, x1, y1 = bbox(a)
    lab, n = ndi.label(a > 60, structure=ACHT)
    if n < 2:
        return np.zeros_like(a, bool)
    flaechen = np.bincount(lab.ravel(), minlength=n + 1)
    haupt = int(np.argmax(flaechen[1:]) + 1)
    maske = np.zeros_like(a, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if sl is None or i == haupt or flaechen[i] > max_px:
            continue
        randnah = (sl[1].start <= x0 + band or sl[1].stop >= x1 - band
                   or sl[0].start <= y0 + band or sl[0].stop >= y1 - band)
        if randnah:
            maske |= lab == i
    return maske


def randschleier(rgba: np.ndarray, band: int = 15, max_px: int = 6) -> np.ndarray:
    """Isolierte helle Randpunkte (Punktreihen des Zierrasters), ohne Waffenglanz zu treffen."""
    a = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.int16)
    x0, y0, x1, y1 = bbox(a)
    dicht = ndi.uniform_filter((a > 150).astype(np.float32), size=5) * 25
    hell = (rgb.min(axis=2) > 140) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 70)
    streifen = np.zeros_like(a, bool)
    streifen[y0:y1 + 1, x0:min(x1 + 1, x0 + band)] = True
    streifen[y0:y1 + 1, max(x0, x1 - band + 1):x1 + 1] = True
    streifen[y0:min(y1 + 1, y0 + band), x0:x1 + 1] = True
    streifen[max(y0, y1 - band + 1):y1 + 1, x0:x1 + 1] = True
    return streifen & (a > 0) & (dicht < max_px) & (hell | (a < 160))


def rahmen_bereinigen(rgba: np.ndarray, durchgaenge: int = 3) -> tuple[np.ndarray, int]:
    """Entfernt Rahmenlinien in mehreren Durchgaengen (aeussere und innere Linie)."""
    arbeit = rgba.copy()
    farben = []
    gesamt = 0
    for durchgang in range(durchgaenge):
        maske, gefunden = rahmen_maske(arbeit, nur_isoliert=durchgang > 0)
        farben.extend(gefunden)
        if not maske.any():
            break
        arbeit = entferne(arbeit, maske)
        gesamt += int(maske.sum())
    if farben:
        rest = rahmen_reste(arbeit, farben)
        if rest.any():
            arbeit = entferne(arbeit, rest)
            gesamt += int(rest.sum())
    if farben:
        saum = rahmen_saum(arbeit, farben)
        if saum.any():
            arbeit = entferne(arbeit, saum)
            gesamt += int(saum.sum())
    punkt = randpunkte(arbeit)
    if punkt.any():
        arbeit = entferne(arbeit, punkt)
        gesamt += int(punkt.sum())
    schleier = randschleier(arbeit)
    if schleier.any():
        arbeit = entferne(arbeit, schleier)
        gesamt += int(schleier.sum())
    return arbeit, gesamt


def platte_maske(rgba: np.ndarray) -> np.ndarray:
    """Randstaendige Plattenkomponente, die nicht das Hauptmotiv ist."""
    a = rgba[..., 3]
    x0, y0, x1, y1 = bbox(a)
    lab, n = ndi.label(a > 150, structure=ACHT)
    if n < 2:
        return np.zeros_like(a, bool)
    flaechen = np.bincount(lab.ravel(), minlength=n + 1)
    haupt = int(np.argmax(flaechen[1:]) + 1)
    maske = np.zeros_like(a, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        if sl is None or i == haupt:
            continue
        randnah = (sl[1].start <= x0 + 6 or sl[1].stop >= x1 - 6
                   or sl[0].start <= y0 + 6 or sl[0].stop >= y1 - 6)
        if randnah and flaechen[i] < 0.4 * flaechen[haupt]:
            maske |= lab == i
    return maske


def entferne(rgba: np.ndarray, maske: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    out[maske, 3] = 0
    return out


# ------------------------------------------------------------------ Atlas-Zugriff

class Atlas:
    """Liest/schreibt eine Atlasdatei und erhaelt ihr Format (Palette bzw. RGBA)."""

    def __init__(self, pfad: str):
        self.pfad = pfad
        self.bild = Image.open(pfad)
        self.modus = self.bild.mode
        self.rgba = np.array(self.bild.convert('RGBA'))
        if self.modus == 'P':
            self.index = np.array(self.bild)
            self.palette = self.bild.getpalette()
            self.transparenz = bytes(self.bild.info['transparency'])
            alpha = np.frombuffer(self.transparenz, np.uint8)
            self.transparent = int(np.argmin(alpha))
            assert alpha[self.transparent] == 0, 'kein transparenter Palettenplatz'
        self.geaendert = False

    def zelle(self, z: dict) -> np.ndarray:
        return self.rgba[z['y']:z['y'] + z['h'], z['x']:z['x'] + z['w']]

    def setze(self, z: dict, neu: np.ndarray) -> None:
        alt = self.zelle(z)
        if np.array_equal(alt, neu):
            return
        self.rgba[z['y']:z['y'] + z['h'], z['x']:z['x'] + z['w']] = neu
        if self.modus == 'P':
            weg = neu[..., 3] == 0
            idx = self.index[z['y']:z['y'] + z['h'], z['x']:z['x'] + z['w']]
            idx[weg] = self.transparent
        self.geaendert = True

    def speichern(self) -> None:
        if not self.geaendert:
            return
        if self.modus == 'P':
            bild = Image.fromarray(self.index, 'P')
            bild.putpalette(self.palette)
            bild.info['transparency'] = self.transparenz
            bild.save(self.pfad, optimize=True)
        else:
            Image.fromarray(self.rgba, 'RGBA').save(self.pfad, optimize=True, compress_level=9)


def lade_katalog() -> dict:
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    katalog = {}
    quelle = os.path.join(WURZEL, 'src', 'shared', 'config', 'weapons.js')
    text = open(quelle, encoding='utf-8').read()
    # iconPath je Waffe aus dem Katalog (nur fuer die 64-px-Datei noetig).
    import re
    for m in re.finditer(r'"id":\s*"(pa_\d{3})".*?"iconPath":\s*"[^"]*/([^"/]+)"', text, re.S):
        katalog[m.group(1)] = m.group(2)
    return manifest, katalog


def aus128(icon_zelle: np.ndarray) -> np.ndarray:
    return np.array(Image.fromarray(icon_zelle, 'RGBA').resize((64, 64), Image.LANCZOS))


def bearbeite(tabelle: dict, pruefen: bool) -> dict:
    manifest, icon_dateien = lade_katalog()
    atlanten: dict[str, Atlas] = {}
    bericht = {'version': 1, 'stand': 'BAL-09', 'waffen': {}}
    # Früheren Lauf als Zustand lesen: bereits bereinigte Zellen nicht erneut
    # beschneiden (der Rahmen-Detektor würde sonst nach und nach die Waffe kürzen).
    alt_bericht = {}
    try:
        alt_bericht = json.load(open(os.path.join(BERICHT, 'bericht.json'), encoding='utf-8'))
    except (OSError, ValueError):
        pass

    def atlas(name: str) -> Atlas:
        if name not in atlanten:
            atlanten[name] = Atlas(os.path.join(SPRITES, manifest['atlanten'][name]['datei']))
        return atlanten[name]

    for wid, eintrag in tabelle['waffen'].items():
        info = manifest['waffen'][wid]
        zeilen = []
        held_neu = None
        for rolle, regel in eintrag['rollen'].items():
            modus = regel['modus']
            alt_hash = (alt_bericht.get('waffen', {}).get(wid, {})
                        .get('rollen', {}).get(rolle, {}).get('hashNachher'))
            if rolle == 'menue64':
                name = icon_dateien[wid]
                datei = os.path.join(ICONS64, name if name.endswith('_icon.png')
                                     else os.path.splitext(name)[0] + '_icon.png')
                vorher_bild = Image.open(datei).convert('RGBA')
                vorher = np.array(vorher_bild)
                if alt_hash == hashlib.sha256(vorher.tobytes()).hexdigest():
                    modus = 'keine'
                if modus == 'aus128':
                    z = info['icon']
                    neu = aus128(atlas(z['atlas']).zelle(z).copy())
                else:
                    neu = vorher.copy()
                zelle = None
            else:
                z = info[rolle]
                a = atlas(z['atlas'])
                vorher = a.zelle(z).copy()
                if alt_hash == hashlib.sha256(vorher.tobytes()).hexdigest():
                    modus = 'keine'
                maske = np.zeros(vorher[..., 3].shape, bool)
                if modus == 'rahmen':
                    neu, _ = rahmen_bereinigen(vorher)
                elif modus == 'platte':
                    maske = platte_maske(vorher)
                elif modus == 'heldmaske':
                    zh = info['held']
                    held_jetzt = (held_neu if held_neu is not None
                                  else atlas(zh['atlas']).zelle(zh))
                    maske = (held_jetzt[..., 3] == 0) & (vorher[..., 3] > 0)
                    neu = entferne(vorher, maske)
                elif modus != 'keine':
                    raise SystemExit(f'{wid}/{rolle}: unbekannter Modus {modus}')
                if modus == 'platte':
                    neu = entferne(vorher, maske) if maske.any() else vorher.copy()
                elif modus in ('keine', 'heldmaske'):
                    if modus == 'keine':
                        neu = vorher.copy()
                if modus == 'rahmen' or modus == 'heldmaske':
                    held_neu = neu if rolle == 'held' else held_neu
                datei = a.pfad
                zelle = {k: z[k] for k in ('x', 'y', 'w', 'h')}
            box_v = bbox(vorher[..., 3])
            box_n = bbox(neu[..., 3])
            eintrag_rolle = {
                'modus': modus,
                'grund': regel['grund'],
                'datei': os.path.relpath(datei, WURZEL),
                'zelle': zelle,
                'entferntePixel': int(((vorher[..., 3] > 0) & (neu[..., 3] == 0)).sum()),
                'bboxVorher': list(box_v),
                'bboxNachher': list(box_n),
                'kantenVorher': kanten_anteil(vorher[..., 3], box_v),
                'kantenNachher': kanten_anteil(neu[..., 3], box_n),
                'komponentenVorher': komponenten(vorher),
                'komponentenNachher': komponenten(neu),
                'hashVorher': hashlib.sha256(vorher.tobytes()).hexdigest(),
                'hashNachher': hashlib.sha256(neu.tobytes()).hexdigest(),
                'geaendert': not np.array_equal(vorher, neu),
            }
            zeilen.append((rolle, eintrag_rolle))
            if not pruefen and rolle == 'menue64':
                if eintrag_rolle['geaendert']:
                    Image.fromarray(neu, 'RGBA').save(datei, optimize=True)
            elif not pruefen and zelle is not None and eintrag_rolle['geaendert']:
                atlas(info[rolle]['atlas']).setze(info[rolle], neu)
        bericht['waffen'][wid] = {
            'name': eintrag['name'],
            'rollen': {r: e for r, e in zeilen},
            'geaendert': any(e['geaendert'] for _, e in zeilen),
        }

    if not pruefen:
        for a in atlanten.values():
            a.speichern()
        # Nach dem Schreiben den tatsächlichen Zellinhalt neu lesen: Palettenatlanten
        # quantisieren beim Speichern, sonst würde der nächste Lauf dieselbe Zelle
        # erneut beschneiden.
        for wid, e in bericht['waffen'].items():
            for rolle, r in e['rollen'].items():
                if not r.get('zelle'):
                    continue
                z = manifest['waffen'][wid][rolle]
                a = Atlas(os.path.join(SPRITES, manifest['atlanten'][z['atlas']]['datei']))
                r['hashNachher'] = hashlib.sha256(a.zelle(z).tobytes()).hexdigest()
    # Hashes der geschriebenen Dateien nachtragen.
    for wid, e in bericht['waffen'].items():
        for rolle, r in e['rollen'].items():
            if os.path.exists(os.path.join(WURZEL, r['datei'])):
                r['dateiHashNachher'] = sha256(os.path.join(WURZEL, r['datei']))
    bericht['dauereffekt'] = tabelle['dauereffekt']
    bericht['regeln'] = tabelle['regeln']
    return bericht


def kontaktbogen(wid: str, eintrag: dict, bericht: dict) -> None:
    """Vorher/Nachher je ID: dunkel/hell, 24/64/128 px, 24x/64x auf 2x (HiDPI)."""
    # Die Rolle mit der größten Änderung zeigen, nicht das ganze Atlasblatt.
    rolle, info = max(eintrag['rollen'].items(),
                      key=lambda r: r[1].get('entferntePixel', 0))
    datei = os.path.join(WURZEL, info['datei'])
    rel = os.path.relpath(datei, WURZEL)

    def zuschneiden(bild: Image.Image) -> Image.Image:
        z = info.get('zelle')
        if z:
            return bild.crop((z['x'], z['y'], z['x'] + z['w'], z['y'] + z['h']))
        return bild

    vorher = zuschneiden(Image.open(datei).convert('RGBA'))
    # Vorher aus HEAD rekonstruieren, damit der Bogen auch nach dem Schreiben stimmt.
    alt = git_stand(datei)
    if alt:
        import io
        vorher = zuschneiden(Image.open(io.BytesIO(alt)).convert('RGBA'))
    nachher = vorher if not eintrag['geaendert'] else zuschneiden(Image.open(datei).convert('RGBA'))
    spalten = [('24', 24, 1), ('64', 64, 1), ('128', 128, 1), ('24 HiDPI', 24, 2), ('64 HiDPI', 64, 2)]
    breite, hoehe = 5 * 190 + 20, 2 * 2 * 190 + 70
    bogen = Image.new('RGB', (breite, hoehe), (32, 34, 38))
    d = ImageDraw.Draw(bogen)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    except OSError:
        font = ImageFont.load_default()
    d.text((10, 8), f"{wid} · {eintrag['name']} · Vorher/Nachher · dunkler und heller Grund", font=font, fill='white')
    for zeile, (grund_name, grund) in enumerate((('dunkel', DUNKEL), ('hell', HELL))):
        for spalte, (label, groesse, faktor) in enumerate(spalten):
            x = 10 + spalte * 190
            y = 38 + zeile * 190 * 2
            for k, (zustand, bild) in enumerate((('vorher', vorher), ('nachher', nachher))):
                yy = y + k * 190
                d.rectangle((x, yy, x + 180, yy + 172), fill=grund)
                px = groesse * faktor
                gezeigt = bild.resize((px, px), Image.LANCZOS)
                if faktor > 1:
                    gezeigt = gezeigt.resize((groesse, groesse), Image.LANCZOS)
                off = (180 - groesse) // 2
                bogen.paste(gezeigt, (x + off, yy + 20), gezeigt)
                d.text((x + 6, yy + 4), f'{zustand} · {label}', font=font,
                       fill='white' if grund_name == 'dunkel' else (20, 20, 20))
    bogen.save(os.path.join(BERICHT, f"{wid}.png"))


def main() -> int:
    pruefen = '--pruefen' in sys.argv
    tabelle = json.load(open(TABELLE, encoding='utf-8'))
    bericht = bearbeite(tabelle, pruefen)
    os.makedirs(BERICHT, exist_ok=True)
    if not pruefen:
        with open(os.path.join(BERICHT, 'bericht.json'), 'w', encoding='utf-8') as f:
            json.dump(bericht, f, ensure_ascii=False, indent=1)
            f.write('\n')
    geaendert = [w for w, e in bericht['waffen'].items() if e['geaendert']]
    for wid, e in bericht['waffen'].items():
        if e['geaendert'] and ('--blatt' in sys.argv or pruefen):
            kontaktbogen(wid, {'name': e['name'], 'rollen': e['rollen'], 'geaendert': e['geaendert']}, bericht)
    print(f"{len(bericht['waffen'])} Waffen geprueft, {len(geaendert)} geaendert: {', '.join(geaendert)}", file=sys.stderr)
    if pruefen:
        offen = {w: r for w, e in bericht['waffen'].items() for r, rw in e['rollen'].items()
                 if rw['modus'] in ('rahmen', 'platte') and rw['entferntePixel'] > 0}
        print(f'offene Reste: {len(offen)}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
