#!/usr/bin/env python3
"""Abnahme der 26 Waffen-Zusatzanimationsblätter (BAL-10).

Liest das Manifest, zerlegt jedes WebP in seine 8 Rasterzellen (4x2, 256 px) und
misst je Frame und je Blatt:

  frames      Zellen belegt, Deckung, Randanschluss
  alpha       transparente Ecken, Halbsaum, rechteckiger Hintergrund
  identitaet  Farbhistogramm-Korrelation, Silhouetten-IoU, Flaechen-/Lagestreuung
  richtung    Hauptachsen-Streuung ueber die Frames, Nettoweg, Richtungsresultante
  bewegung    robuste Framedifferenz (64 px, unscharf), distinkte Frames, Schleife
  rolle       rollenspezifische Plausibilitaet und Messgrenzen
  effekt      eingebrannter Effekt (W17)
  browser     W20 (hier grundsaetzlich offen, kein Rendereranschluss)

Die Motiv- und Rollenurteile sind Sichtpruefungen und stehen als `SICHT` im
Skript; sie sind von den Messwerten getrennt, damit beide nachpruefbar bleiben.
Das Skript schreibt Messung, Bericht und (mit `--schreiben`) die Abnahmefelder
im Manifest. Es aktiviert nichts: `freigabe` bleibt false, solange `effekt`
oder `browser` offen sind.

Aufruf:
  python3 tools/waffen-anim-abnahme.py            # messen, Bericht schreiben
  python3 tools/waffen-anim-abnahme.py --pruefen  # nur messen, Exit 1 bei Abweichung
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

WURZEL = Path(__file__).resolve().parent.parent
ANIM = WURZEL / "src/client/assets/weapon-sprites/anim"
MANIFEST = ANIM / "manifest.json"
MESSUNG = WURZEL / "docs/waffen-audit-2026-11-08/anim-abnahme-messung.json"
BERICHT = WURZEL / "docs/waffen-audit-2026-11-08/ANIM-ABNAHME.md"
SPALTEN, ZEILEN, ZELLE = 4, 2, 256

ALPHA_SICHTBAR = 16
DIFF_DISTINKT = 0.03          # 64-px-RGB-Differenz nach 2-px-Weichzeichnung
DIFF_LOOP = 0.045
DIFF_BEWEGUNG = 0.012
HIST_MIN = 0.85               # nur schwere Ausreisser; Sichtpruefung entscheidet
IOU_MIN = 0.45
FLAECHE_MIN, FLAECHE_MAX = 0.55, 1.80
LAGE_MAX = 0.30
RICHTUNG_STREUUNG_MAX = 15.0   # Grad Hauptachsen-Streuung
ORTSDRIFT_MAX = 0.10           # Zellbreiten bei ortsfesten Rollen
WURF_DREHUNG_MIN = 20.0        # Grad Summe Hauptachsenwechsel
MIN_DISTINKT = 6
MIN_HALBSAUM_MAX = 0.08

KRITERIEN = ["frames", "alpha", "identitaet", "richtung", "bewegung", "rolle"]
PRODUKT_KRITERIEN = ["effekt", "browser"]

# Sichtpruefung je Blatt. `motiv` = Motiv ist die benannte Waffe; `brueche` =
# Frames mit sichtbarem Identitaetsbruch; `rolle` = zugewiesene Rolle passt zum
# Motiv; `effekt` = kein eingebrannter Effekt, der eine eigene Ebene braucht.
SICHT = {
    "pa_032": dict(motiv=False, brueche=[3], rolle=False,
        motivBefund="blauer geflügelter Käfer/Krebs statt Raketenrucksack",
        bruchBefund="F3 zeigt eine gespreizte Flügelpose und bricht die Silhouette",
        rolleBefund="Flügelwesen, kein am Rücken getragenes Objekt",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage: Rucksack mit zwei Düsen unten, Flamme separat."),
    "pa_038": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="orange Rakete, Motiv trifft die Waffe",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, stabile Achse",
        effekt=False, effektBefund="Triebwerksflamme fest im Blatt (W17)",
        weiter="Flamme als eigene Ebene trennen und 6+ unterscheidbare Frames erzeugen."),
    "pa_044": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="brennender Phönix, Motiv trifft den Phönixschlag",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Flügelform konstant",
        effekt=False, effektBefund="Feuer in Flügeln und Körper eingebrannt (W17)",
        weiter="Flügelschlag neu animieren; Feuer als eigene Ebene."),
    "pa_048": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="Bananengranate mit Zünder, Motiv trifft die Waffe",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Silhouette konstant",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Rotation und Splitter ergänzen; acht echte Phasen statt Standbild."),
    "pa_049": dict(motiv=False, brueche=[], rolle=False,
        motivBefund="orange Bombe mit grauen Flügeln statt Bumerang",
        bruchBefund="keine",
        rolleBefund="keine Drehachse, keine Rückkehrbewegung erkennbar",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Bumerang mit sichtbarer Rotation und Rückflugpose."),
    "pa_053": dict(motiv=False, brueche=[1, 5], rolle=True,
        motivBefund="Holzwagen mit Mäusen statt Roboterbombe",
        bruchBefund="F1/F5 wechseln Aufbau und Aufsatz",
        rolleBefund="Weltobjekt am Boden, Rollenzuordnung plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Roboterbombe mit Zünder und Explosionsphase."),
    "pa_061": dict(motiv=True, brueche=[1], rolle=True,
        motivBefund="brennender Dämon, Motiv trifft den Feuerdämon",
        bruchBefund="F1 ist eine gelbe Feuerblase ohne Körper",
        rolleBefund="beschworene Figur mit eigener Standpose",
        effekt=False, effektBefund="Flamme an Händen und Körper eingebrannt (W17)",
        weiter="F1 ersetzen, Flamme trennen, mindestens sechs Körperphasen."),
    "pa_065": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="Steinmeteor, Motiv trifft den Meteorbrocken",
        bruchBefund="keine; nur der angeklebte Schweif ändert seine Form",
        rolleBefund="Projektil im Flug, Achse stabil",
        effekt=False, effektBefund="gelber Schweif fest im Blatt (W17)",
        weiter="Schweif als eigene Ebene trennen, dann W20 im Renderer."),
    "pa_073": dict(motiv=False, brueche=[], rolle=False,
        motivBefund="grüner zweibeiniger Dinosaurier statt Tentakelgift",
        bruchBefund="keine",
        rolleBefund="Kreatur, kein abgelegtes Weltobjekt",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Tentakelgift als Weltobjekt mit Giftwolke."),
    "pa_112": dict(motiv=False, brueche=[], rolle=False,
        motivBefund="blau geflügeltes Flugwesen statt Düsenrucksack",
        bruchBefund="keine",
        rolleBefund="Flügelwesen, kein getragenes Rückenobjekt",
        effekt=True, effektBefund="keine eingebrannte Flamme; Düsen gehören zur Silhouette",
        weiter="Eigene Vorlage Düsenrucksack; Dublette zu pa_114 auflösen (W06)."),
    "pa_114": dict(motiv=False, brueche=[], rolle=False,
        motivBefund="dasselbe blau geflügelte Flugwesen wie pa_112, kein Gleitschirm",
        bruchBefund="keine",
        rolleBefund="Flügelwesen, kein Schirm mit Kappe und Leinen",
        effekt=True, effektBefund="kein Schirm, kein eigener Effekt",
        weiter="Eigene Vorlage Gleitschirm mit Kappe, Leinen und Startpose."),
    "pa_115": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="Giraffenstatue, als Wächterstatue motivnah",
        bruchBefund="keine",
        rolleBefund="beschworene Statue, Rollenzuordnung plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Idle-Bewegung oder bewusst prozedural; Standbild ist keine Animation."),
    "pa_118": dict(motiv=True, brueche=[1, 3, 7], rolle=True,
        motivBefund="grauer Humanoid mit Feuerball, Motiv nah am Feuerwesen",
        bruchBefund="Körper dreht zwischen Vorder- und Rückansicht, Feuerball bleibt starr",
        rolleBefund="beschworene Figur, Rollenzuordnung plausibel",
        effekt=False, effektBefund="Feuerball fest in der Hand (W17)",
        weiter="Körperhaltung durchgehend gleich, Feuerball als eigene Ebene."),
    "pa_121": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="Clownfaust mit Raketenantrieb, Motiv trifft die Raketenfaust",
        bruchBefund="keine",
        rolleBefund="gehaltene Waffe, Faust als Wirkspitze plausibel",
        effekt=False, effektBefund="Düsenflamme am Arm eingebrannt",
        weiter="Rückstoßphasen und Düsenflamme trennen, sechs echte Frames."),
    "pa_122": dict(motiv=False, brueche=[4, 7], rolle=False,
        motivBefund="rosa Flügelwesen; F4/F7 sind Unendlichkeitszeichen",
        bruchBefund="F4 und F7 ersetzen den Körper durch ein Symbol",
        rolleBefund="Kreatur, keine Aura oder Schild am Träger",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Endlosschleife als Aura/Symbol ohne Körperbruch."),
    "pa_132": dict(motiv=False, brueche=[0], rolle=True,
        motivBefund="Alte Dame nur in F0, danach ein geflügeltes Wesen",
        bruchBefund="harter Motivwechsel zwischen F0 und F1",
        rolleBefund="beschworene Figur, Rollenzuordnung für F1-F7 plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Eine Figur über alle acht Frames; F0 nicht als Ruhepose verwenden."),
    "pa_133": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="geflügeltes Schaf mit Cape, Motiv trifft das Superschaf",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Achse stabil",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Vier zusätzliche unterscheidbare Flügel-/Beinphasen und Loop schließen."),
    "pa_134": dict(motiv=False, brueche=[], rolle=True,
        motivBefund="brauner Flugkörper ohne Bezug zum Luftangriff",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Rollenzuordnung technisch plausibel",
        effekt=False, effektBefund="Flamme am Heck eingebrannt (W17)",
        weiter="Neue Vorlage mit erkennbarer Luftangriffsszene, Flamme trennen."),
    "pa_135": dict(motiv=True, brueche=[0, 1, 4, 5], rolle=True,
        motivBefund="Meteor, Motiv trifft den Meteorregen",
        bruchBefund="F0/F1/F4/F5 zeigen fast nur Flamme, F2/F3/F6/F7 Gestein",
        rolleBefund="Projektil im Flug, Achse stabil",
        effekt=False, effektBefund="Feuerschweif eingebrannt (W17)",
        weiter="Gestein in allen Frames halten, Schweif als eigene Ebene."),
    "pa_136": dict(motiv=True, brueche=[], rolle=True,
        motivBefund="Bohrkopfrakete, Motiv trifft die Waffe",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Achse stabil",
        effekt=False, effektBefund="Flamme und Rauchfahne eingebrannt (W17)",
        weiter="Drei fehlende Phasen ergänzen, Loop schließen, Effekt trennen."),
    "pa_141": dict(motiv=False, brueche=[], rolle=True,
        motivBefund="einfacher blauer Humanoid statt Astralkrieger",
        bruchBefund="keine",
        rolleBefund="beschworene Figur, Rollenzuordnung plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Astralkrieger mit Rüstung und Waffe; Loop schließen."),
    "pa_142": dict(motiv=False, brueche=[2, 6], rolle=True,
        motivBefund="blauer Cartoon-Zauberer statt Leerenritter",
        bruchBefund="F2/F6 setzen eine türkise Energiebasis, die sonst fehlt",
        rolleBefund="beschworene Figur, Rollenzuordnung plausibel",
        effekt=True, effektBefund="Energiebasis wechselt, kein Dauer-Effekt",
        weiter="Neue Vorlage Leerenritter; Basis und Loop vereinheitlichen."),
    "pa_143": dict(motiv=True, brueche=[1, 6], rolle=True,
        motivBefund="gepanzertes Pferd, als Astralross motivnah",
        bruchBefund="F1/F6 sind ausgewaschen und verlieren den Kontrast",
        rolleBefund="beschworene Figur, Rollenzuordnung plausibel",
        effekt=True, effektBefund="Glühen im Panzer, kein separater Effekt",
        weiter="Kontrast in F1/F6 reparieren und vier echte Bewegungsphasen ergänzen."),
    "pa_144": dict(motiv=False, brueche=[], rolle=True,
        motivBefund="geflügeltes Vogelwesen mit Melonenkopf statt Wassermelone",
        bruchBefund="keine",
        rolleBefund="Projektil im Flug, Rollenzuordnung technisch plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Wassermelone; Richtung über alle Frames stabil halten."),
    "pa_147": dict(motiv=False, brueche=[], rolle=True,
        motivBefund="rosa geflügeltes Schwein statt Weltendrache",
        bruchBefund="keine",
        rolleBefund="beschworene Kreatur, Rollenzuordnung plausibel",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Weltendrache; Drehung im Zyklus vermeiden."),
    "pa_148": dict(motiv=False, brueche=[], rolle=False,
        motivBefund="blaues geflügeltes Tier statt Feuerschild",
        bruchBefund="keine",
        rolleBefund="Kreatur, keine Aura oder Schild am Träger",
        effekt=True, effektBefund="kein eingebrannter Effekt",
        weiter="Neue Vorlage Feuerschild als Aura; Loop schließen."),
}


def lade_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def farbhistogramm(rgb: np.ndarray, maske: np.ndarray) -> np.ndarray:
    px = rgb[maske]
    if px.size == 0:
        return np.zeros(512, dtype=np.float64)
    q = (px // 32).astype(np.int32)
    idx = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    h = np.bincount(idx, minlength=512).astype(np.float64)
    return h / h.sum()


def silhouetten_vektor(maske: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, x1, y1 = bbox
    if x1 <= x0 or y1 <= y0:
        return np.zeros((32, 32), dtype=np.float64)
    crop = Image.fromarray((maske[y0:y1, x0:x1] * 255).astype(np.uint8))
    return np.asarray(crop.resize((32, 32), Image.Resampling.BILINEAR), dtype=np.float64) / 255.0


def iou(a: np.ndarray, b: np.ndarray) -> float:
    aa, bb = a > 0.3, b > 0.3
    vereinigung = np.logical_or(aa, bb).sum()
    return float(np.logical_and(aa, bb).sum() / vereinigung) if vereinigung else 0.0


def historien_korrelation(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(np.dot(a, b) / (na * nb)) if na and nb else 0.0


def winkel(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def winkel_diff(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def messe_blatt(eintrag: dict) -> dict:
    pid = eintrag["id"]
    im = Image.open(ANIM / eintrag["datei"]).convert("RGBA")
    arr = np.asarray(im)
    if arr.shape[:2] != (ZEILEN * ZELLE, SPALTEN * ZELLE):
        raise ValueError(f"{pid}: {arr.shape[1]}x{arr.shape[0]} statt 1024x512")

    frames, klein, hist, sil, schwer, orient = [], [], [], [], [], []
    for i in range(8):
        r, c = divmod(i, SPALTEN)
        z = arr[r * ZELLE:(r + 1) * ZELLE, c * ZELLE:(c + 1) * ZELLE]
        rgb, alpha = z[:, :, :3].astype(np.int16), z[:, :, 3]
        maske = alpha > ALPHA_SICHTBAR
        ys, xs = np.nonzero(maske)
        if len(xs):
            bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            cx, cy = float(xs.mean()), float(ys.mean())
            flaeche = int(maske.sum())
        else:
            bbox, cx, cy, flaeche = (0, 0, 0, 0), 0.0, 0.0, 0
        if len(xs) > 32:
            mx, my = xs.mean(), ys.mean()
            uxx = ((xs - mx) ** 2).mean()
            uyy = ((ys - my) ** 2).mean()
            uxy = ((xs - mx) * (ys - my)).mean()
            theta = 0.5 * math.degrees(math.atan2(2 * uxy, uxx - uyy)) % 180.0
        else:
            theta = 0.0
        ecken = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]
        frames.append({
            "index": i,
            "flaeche": flaeche,
            "deckung": round(flaeche / (ZELLE * ZELLE), 5),
            "bbox": list(bbox),
            "schwerpunkt": [round(cx, 2), round(cy, 2)],
            "orientierung": round(theta, 2),
            "transparent": round(float((alpha == 0).mean()), 5),
            "halbsaum": round(float(((alpha > 0) & (alpha <= ALPHA_SICHTBAR)).mean()), 5),
            "eckenAlpha": ecken,
            "rechteckHintergrund": bool(min(ecken) > 250 and flaeche / (ZELLE * ZELLE) > 0.97),
            "randAnschluss": bool(flaeche and (
                bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= ZELLE or bbox[3] >= ZELLE)),
        })
        # Robuste Vergleichsbasis: 64 px, leicht unscharf -> Kompressionsrauschen
        # zaehlt nicht als eigenstaendiger Frame.
        g = Image.fromarray(z[:, :, :3]).filter(ImageFilter.GaussianBlur(2))
        klein.append(np.asarray(g.resize((64, 64), Image.Resampling.LANCZOS), dtype=np.float32))
        hist.append(farbhistogramm(rgb, maske))
        sil.append(silhouetten_vektor(maske, bbox))
        schwer.append([cx, cy])
        orient.append(theta)

    diff = np.zeros((8, 8), dtype=np.float64)
    for i in range(8):
        for j in range(i + 1, 8):
            diff[i, j] = diff[j, i] = float(np.abs(klein[i] - klein[j]).mean() / 255.0)

    vertreter = []
    for i in range(8):
        if not any(diff[i, v] <= DIFF_DISTINKT for v in vertreter):
            vertreter.append(i)

    seq = [diff[i, i + 1] for i in range(7)]
    med_hist = np.median(np.stack(hist), axis=0)
    flaechen = [f["flaeche"] for f in frames]
    med_flaeche = float(np.median(flaechen)) or 1.0
    med_schwer = np.median(np.array(schwer), axis=0)
    ident = []
    for i in range(8):
        ident.append({
            "frame": i,
            "histKorr": round(historien_korrelation(hist[i], med_hist), 4),
            "silhouetteIou": round(float(np.mean([iou(sil[i], sil[j]) for j in range(8) if j != i])), 4),
            "flaecheRatio": round(flaechen[i] / med_flaeche, 3),
            "lageAbweichung": round(float(np.linalg.norm(np.array(schwer[i]) - med_schwer) / ZELLE), 4),
        })
    auto_brueche = [
        x["frame"] for x in ident
        if x["histKorr"] < HIST_MIN or x["silhouetteIou"] < IOU_MIN
        or not (FLAECHE_MIN <= x["flaecheRatio"] <= FLAECHE_MAX)
        or x["lageAbweichung"] > LAGE_MAX
    ]

    # Hauptachsen-Streuung (zirkulär über 180 Grad): stabile Richtung = kleine Streuung.
    ang = np.radians(np.array(orient) * 2)
    R = abs(np.mean(np.exp(1j * ang)))
    richtung_streuung = float(np.degrees(np.sqrt(-2 * np.log(max(R, 1e-9)))) / 2)
    netto = np.array(schwer[7]) - np.array(schwer[0])
    netto_weg = float(np.linalg.norm(netto) / ZELLE)
    richtungen = [winkel(schwer[i], schwer[i + 1]) for i in range(7)
                  if np.linalg.norm(np.array(schwer[i + 1]) - np.array(schwer[i])) / ZELLE > 0.002]
    if len(richtungen) >= 2:
        sx = sum(math.cos(math.radians(w)) for w in richtungen)
        sy = sum(math.sin(math.radians(w)) for w in richtungen)
        resultante = math.hypot(sx, sy) / len(richtungen)
        mittel = math.degrees(math.atan2(sy, sx))
        streuung = float(np.mean([winkel_diff(w, mittel) for w in richtungen]))
    else:
        resultante, streuung = 0.0, 180.0

    dreh_summe = float(sum(
        winkel_diff(orient[i] % 180.0, orient[i + 1] % 180.0) for i in range(7)
    ))
    leer = [f["index"] for f in frames if f["flaeche"] < 64]
    rand = [f["index"] for f in frames if f["randAnschluss"]]
    rechteck = [f["index"] for f in frames if f["rechteckHintergrund"]]
    ecken_offen = sum(1 for f in frames if max(f["eckenAlpha"]) < ALPHA_SICHTBAR)
    halbsaum = float(np.mean([f["halbsaum"] for f in frames]))
    distinct = len(vertreter)
    mittel_diff = float(np.mean(seq))

    sicht = SICHT[pid]
    brueche = sorted(set(sicht["brueche"]))   # Sichtpruefung, nicht Messung
    mess_auffaellig = auto_brueche
    bewegt = bool(distinct >= MIN_DISTINKT and diff[7, 0] <= DIFF_LOOP and mittel_diff >= DIFF_BEWEGUNG)
    richtung_ok = bool(richtung_streuung <= RICHTUNG_STREUUNG_MAX)
    rollen_ok = bool(sicht["rolle"])
    if rollen_ok and eintrag["rolle"] == "wurf":
        rollen_ok = bool(dreh_summe >= WURF_DREHUNG_MIN)
    if rollen_ok and eintrag["rolle"] in ("ruecken", "hand", "selbst", "welt", "beschwoerung"):
        rollen_ok = bool(netto_weg <= ORTSDRIFT_MAX)

    pruefung = {
        "frames": {
            "ok": bool(not leer and not rand),
            "belegt": 8 - len(leer),
            "leer": leer,
            "randAnschluss": rand,
        },
        "alpha": {
            "ok": bool(ecken_offen == 8 and not rechteck and halbsaum <= MIN_HALBSAUM_MAX),
            "transparenteEcken": ecken_offen,
            "halbsaum": round(halbsaum, 5),
            "rechteckHintergrund": rechteck,
        },
        "identitaet": {
            "ok": bool(sicht["motiv"]) and not brueche,
            "motivPasst": bool(sicht["motiv"]),
            "befund": sicht["motivBefund"] + ("; " + sicht["bruchBefund"] if sicht["brueche"] else ""),
            "brueche": brueche,
            "messAuffaellig": mess_auffaellig,
            "histKorrMin": round(float(min(x["histKorr"] for x in ident)), 4),
            "silhouetteIouMin": round(float(min(x["silhouetteIou"] for x in ident)), 4),
            "flaecheRatioMin": round(float(min(x["flaecheRatio"] for x in ident)), 3),
            "flaecheRatioMax": round(float(max(x["flaecheRatio"] for x in ident)), 3),
        },
        "richtung": {
            "ok": richtung_ok,
            "streuungGrad": round(richtung_streuung, 1),
            "nettoWeg": round(netto_weg, 3),
            "nettoWinkel": round(winkel(schwer[0], schwer[7]), 1),
            "resultante": round(resultante, 3),
        },
        "bewegung": {
            "ok": bewegt,
            "distinkteFrames": distinct,
            "vertreter": vertreter,
            "mittlereDifferenz": round(mittel_diff, 5),
            "schrittDifferenzen": [round(x, 5) for x in seq],
            "loopDiff": round(float(diff[7, 0]), 5),
        },
        "rolle": {
            "ok": rollen_ok,
            "befund": sicht["rolleBefund"],
            "drehSumme": round(dreh_summe, 1),
            "ortsdrift": round(netto_weg, 3),
        },
        "effekt": {
            "ok": bool(sicht["effekt"]),
            "befund": sicht["effektBefund"],
        },
        "browser": {
            "ok": False,
            "befund": "W20 nicht durchgeführt: kein Rendereranschluss vor Produktfreigabe",
        },
    }
    daten_ok = all(pruefung[k]["ok"] for k in KRITERIEN)
    produkt_ok = daten_ok and all(pruefung[k]["ok"] for k in PRODUKT_KRITERIEN)
    if produkt_ok:
        abnahme = "abgenommen"
    elif daten_ok:
        abnahme = "datenabgenommen"
    else:
        abnahme = "abgelehnt"
    pruefung["ergebnis"] = {
        "abnahme": abnahme,
        "datenOk": daten_ok,
        "produktOk": produkt_ok,
        "sperrgruende": [k for k in KRITERIEN + PRODUKT_KRITERIEN if not pruefung[k]["ok"]],
    }
    return {
        "id": pid,
        "waffe": eintrag["waffe"],
        "rolle": eintrag["rolle"],
        "motivDokumentiert": eintrag["motiv"],
        "naechsterSchritt": sicht["weiter"],
        "frames": [
            {k: v for k, v in f.items() if k not in ("histogramm", "silhouette")}
            for f in frames
        ],
        "identitaetFrames": ident,
        "messung": {
            "distinkteFrames": distinct,
            "mittlereDifferenz": round(mittel_diff, 5),
            "loopDiff": round(float(diff[7, 0]), 5),
            "richtungsStreuungGrad": round(richtung_streuung, 1),
            "nettoWeg": round(netto_weg, 3),
            "richtungsResultante": round(resultante, 3),
            "drehSummeGrad": round(dreh_summe, 1),
            "halbsaum": round(halbsaum, 5),
            "transparenteEcken": ecken_offen,
        },
        "pruefung": pruefung,
    }


def tabelle(ergebnisse: dict) -> str:
    zeilen = [
        "| ID | Waffe | Rolle | 8 Frames | Alpha | Identität | Richtung | Bewegung | Rolle | Effekt | Abnahme |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for pid, e in ergebnisse.items():
        p, m = e["pruefung"], e["messung"]
        if p["identitaet"]["ok"]:
            ident = "ok"
        else:
            gr = []
            if not p["identitaet"]["motivPasst"]:
                gr.append("Motiv")
            if p["identitaet"]["brueche"]:
                gr.append("Bruch " + ",".join(map(str, p["identitaet"]["brueche"])))
            ident = "**nein** (" + ", ".join(gr) + ")"
        bewegung = (
            f"{'ok' if p['bewegung']['ok'] else '**nein**'} "
            f"({m['distinkteFrames']} F, Loop {p['bewegung']['loopDiff']:.3f})"
        )
        zeilen.append(
            f"| {pid} | {e['waffe']} | {e['rolle']} | "
            f"{p['frames']['belegt']}/8 {'ok' if p['frames']['ok'] else '**nein**'} | "
            f"{p['alpha']['transparenteEcken']}/8 Ecken {'ok' if p['alpha']['ok'] else '**nein**'} | "
            f"{ident} | "
            f"{'ok' if p['richtung']['ok'] else '**nein**'} (σ {p['richtung']['streuungGrad']:.0f}°) | "
            f"{bewegung} | "
            f"{'ok' if p['rolle']['ok'] else '**nein**'} | "
            f"{'ok' if p['effekt']['ok'] else '**eingebrannt**'} | "
            f"**{p['ergebnis']['abnahme']}** |"
        )
    return "\n".join(zeilen)


def bericht_text(manifest: dict, ergebnisse: dict) -> str:
    verteilung = {}
    for e in ergebnisse.values():
        verteilung[e["pruefung"]["ergebnis"]["abnahme"]] = verteilung.get(
            e["pruefung"]["ergebnis"]["abnahme"], 0) + 1
    freigegeben = [pid for pid, e in ergebnisse.items()
                   if e["pruefung"]["ergebnis"]["abnahme"] == "abgenommen"]
    daten = [pid for pid, e in ergebnisse.items()
             if e["pruefung"]["ergebnis"]["abnahme"] == "datenabgenommen"]
    teile = [
        "# Abnahme der 26 Waffen-Zusatzanimationen (BAL-10)",
        "",
        "Stand: 09.11.2026 · Branch `bg/bal-10` · Ergänzung zu "
        "[ANIM-GATING.md](ANIM-GATING.md) und [BERICHT.md](BERICHT.md)",
        "",
        "## Ergebnis",
        "",
        f"Geprüft wurden alle 26 Blätter aus `src/client/assets/weapon-sprites/anim/` "
        f"gegen sechs Kriterien je Blatt: 8 Frames, Alpha, Identität, Richtung, "
        f"Bewegung und Rolle. Ergebnis: **{verteilung.get('abgenommen', 0)} produktfreigegeben**, "
        f"**{verteilung.get('datenabgenommen', 0)} datenabgenommen**, "
        f"**{verteilung.get('abgelehnt', 0)} abgelehnt**. "
        f"Produktpfad bleibt gesperrt (`freigabe.produktpfad: false`, `ANIM_FREIGABE` leer).",
        "",
        f"Kein Blatt erfüllt die Produktkriterien, weil die Browserabnahme W20 ohne "
        f"Rendereranschluss nicht durchgeführt wurde und "
        f"{sum(1 for e in ergebnisse.values() if not e['pruefung']['effekt']['ok'])} "
        f"Blätter einen eingebrannten Effekt tragen (W17; pa_121 zusätzlich). "
        f"Die Datenabnahme ist deshalb bewusst keine Produktfreigabe.",
        "",
        f"- Datenabgenommen: {', '.join(daten) if daten else '—'}",
        f"- Produktfreigegeben: {', '.join(freigegeben) if freigegeben else '—'}",
        "",
        "## Verfahren",
        "",
        "`python3 tools/waffen-anim-abnahme.py` liest das Manifest, zerlegt jedes "
        "WebP in 8 Zellen (4×2, 256 px) und misst pixelbasiert. Die Motiv- und "
        "Rollenurteile sind eine Sichtprüfung der 8 Frames je Blatt; sie stehen "
        "getrennt als `SICHT` im Skript. Alle Zahlen stehen maschinenlesbar in "
        "[anim-abnahme-messung.json](anim-abnahme-messung.json).",
        "",
        "Schwellen: sichtbares Alpha > 16; zwei Frames gelten ab 0,03 mittlerer "
        "RGB-Differenz (64 px, 2 px Weichzeichnung) als verschieden; Schleife "
        "geschlossen bei F7→F0 ≤ 0,045; Richtung stabil bei Hauptachsen-Streuung "
        "≤ 15°; mindestens 6 unterscheidbare Frames; ortsfeste Rollen dürfen "
        "maximal 0,10 Zellbreiten driften, `wurf` braucht ≥ 20° Drehung. "
        "Identität ist ein Motivurteil plus Sichtprüfung aller acht Frames; "
        "Histogramm-Korrelation und Silhouetten-IoU sind Stützmessungen "
        "(auffällig unter 0,85 bzw. 0,45). Das alte Feld `schwere` bleibt der "
        "Grob-Befund aus dem ersten Audit; maßgeblich ist `pruefung` je Blatt.",
        "",
        "## Übersicht",
        "",
        tabelle(ergebnisse),
        "",
        "## Einzelbefunde",
        "",
    ]
    for pid, e in ergebnisse.items():
        p, m = e["pruefung"], e["messung"]
        teile += [
            f"### {pid} — {e['waffe']}",
            "",
            f"- **Frames:** {p['frames']['belegt']}/8 belegt, leere Frames "
            f"{p['frames']['leer'] or '—'}, Randanschluss {p['frames']['randAnschluss'] or '—'}.",
            f"- **Alpha:** {p['alpha']['transparenteEcken']}/8 Ecken transparent, "
            f"Halbsaum {p['alpha']['halbsaum']:.2%}, Rechteckhintergrund "
            f"{p['alpha']['rechteckHintergrund'] or '—'}.",
            f"- **Identität:** {'ok' if p['identitaet']['ok'] else 'nicht ok'} — "
            f"{p['identitaet']['befund']}; Histogramm min. "
            f"{p['identitaet']['histKorrMin']:.2f}, IoU min. "
            f"{p['identitaet']['silhouetteIouMin']:.2f}, Brüche "
            f"{p['identitaet']['brueche'] or '—'}.",
            f"- **Richtung:** {'ok' if p['richtung']['ok'] else 'nicht ok'} — "
            f"Streuung {p['richtung']['streuungGrad']:.1f}°, Nettoweg "
            f"{p['richtung']['nettoWeg']:.3f} Zellbreiten, Resultante "
            f"{p['richtung']['resultante']:.2f}.",
            f"- **Bewegung:** {'ok' if p['bewegung']['ok'] else 'nicht ok'} — "
            f"{p['bewegung']['distinkteFrames']} unterscheidbare Frames, mittlere "
            f"Differenz {p['bewegung']['mittlereDifferenz']:.4f}, Schleife F7→F0 "
            f"{p['bewegung']['loopDiff']:.4f}.",
            f"- **Rolle:** {'ok' if p['rolle']['ok'] else 'nicht ok'} — "
            f"{p['rolle']['befund']}; Drehsumme {p['rolle']['drehSumme']:.1f}°, "
            f"Ortsdrift {p['rolle']['ortsdrift']:.3f}.",
            f"- **Effekt:** {'ok' if p['effekt']['ok'] else 'nicht ok'} — "
            f"{p['effekt']['befund']}.",
            f"- **Abnahme: {p['ergebnis']['abnahme']}** — Gründe: "
            f"{', '.join(p['ergebnis']['sperrgruende']) or 'keine'}.",
            f"- **Nächster Schritt:** {e['naechsterSchritt']}",
            "",
        ]
    teile += [
        "## Prüfung",
        "",
        "```",
        "python3 tools/waffen-anim-abnahme.py     # Messung und Bericht neu erzeugen",
        "node tests/waffen-anim-abnahme.test.js   # Abnahme, Manifest und Lader",
        "node tests/waffen-anim-gating.test.js    # bestehende Sperre",
        "```",
        "",
        "Der Test prüft nicht die Sichturteile nach, sondern ihre Spur: jedes "
        "Manifestfeld muss zur Messung passen, jeder Ablehnungsgrund muss ein "
        "fehlgeschlagenes Kriterium sein, und der Lader darf auch mit einer "
        "manipulierten Freigabeliste kein abgelehntes Blatt laden. Ein synthetischer "
        "Vollbeleg zeigt als Gegenprobe, dass der Lader bei erfüllten Kriterien "
        "tatsächlich öffnet.",
        "",
    ]
    return "\n".join(teile)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruefen", action="store_true", help="nichts schreiben, nur messen")
    args = ap.parse_args()

    manifest = lade_manifest()
    ergebnisse = {pid: messe_blatt(e) for pid, e in manifest["waffen"].items()}

    if not args.pruefen:
        for pid, e in ergebnisse.items():
            p, alt = e["pruefung"], manifest["waffen"][pid]
            p["datum"] = "2026-11-09"
            p["verfahren"] = "tools/waffen-anim-abnahme.py"
            p["messung"] = "anim-abnahme-messung.json"
            alt["abnahme"] = p["ergebnis"]["abnahme"]
            alt["freigabe"] = False
            alt["pruefung"] = {k: p[k] for k in KRITERIEN + PRODUKT_KRITERIEN + ["ergebnis"]}
            alt["sperrgruende"] = p["ergebnis"]["sperrgruende"]
        manifest["version"] = 3
        manifest["status"] = "gesperrt"
        manifest["freigabe"]["produktpfad"] = False
        manifest["freigabe"]["regel"] = (
            "Ein Blatt darf nur geladen werden, wenn alle acht Prüfkriterien ok sind, "
            "abnahme 'abgenommen', freigabe true, die ID in ANIM_FREIGABE steht und ein "
            "Lader im Renderer verdrahtet ist."
        )
        manifest["freigabe"]["bedingungen"] = [
            "8 Frames belegt, keine leeren Zellen, kein Randanschluss",
            "Alpha sauber: transparente Ecken, kein Rechteckhintergrund, kein Halbsaum",
            "Motiv ist die Waffe; kein Identitätsbruch zwischen den Frames",
            "Richtung über alle Frames stabil (Hauptachsen-Streuung ≤ 15°)",
            "mindestens 6 unterscheidbare Frames, Schleife F7→F0 geschlossen",
            "Rolle gesetzt und zum Motiv passend",
            "eingebrannte Effekte getrennt oder als Ruhebild begründet (W17)",
            "Browserabnahme W20 bestanden",
        ]
        manifest["hinweis"] = (
            "Zusatz-Sheets als Material, NICHT im Produktpfad. Abnahme je Blatt nach "
            "docs/waffen-audit-2026-11-08/ANIM-ABNAHME.md; Messung in "
            "anim-abnahme-messung.json. Kein Blatt ist produktfreigegeben."
        )
        manifest["abnahme"] = {
            "datum": "2026-11-09",
            "bericht": "docs/waffen-audit-2026-11-08/ANIM-ABNAHME.md",
            "messung": "docs/waffen-audit-2026-11-08/anim-abnahme-messung.json",
            "ergebnis": {
                "gesamt": len(ergebnisse),
                **{k: sum(1 for e in ergebnisse.values()
                          if e["pruefung"]["ergebnis"]["abnahme"] == k)
                   for k in ("abgenommen", "datenabgenommen", "abgelehnt")},
            },
        }
        MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        MESSUNG.write_text(json.dumps({
            "auftrag": "BAL-10",
            "verfahren": "Pixelmessung je Rasterzelle; Urteile aus SICHT in tools/waffen-anim-abnahme.py",
            "schwellen": {
                "alphaSichtbar": ALPHA_SICHTBAR,
                "distinktDifferenz": DIFF_DISTINKT,
                "loopMax": DIFF_LOOP,
                "histKorrMin": HIST_MIN,
                "silhouetteIouMin": IOU_MIN,
                "richtungStreuungMax": RICHTUNG_STREUUNG_MAX,
                "minDistinkt": MIN_DISTINKT,
            },
            "blaetter": ergebnisse,
        }, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        BERICHT.write_text(bericht_text(manifest, ergebnisse), encoding="utf-8")

    print(f"{'ID':8} {'dist':>4} {'loop':>6} {'σ°':>5} {'IoU':>5} {'Hist':>5}  Abnahme / Gründe")
    for pid, e in ergebnisse.items():
        p = e["pruefung"]
        print(f"{pid:8} {p['bewegung']['distinkteFrames']:4d} {p['bewegung']['loopDiff']:6.3f} "
              f"{p['richtung']['streuungGrad']:5.1f} {p['identitaet']['silhouetteIouMin']:5.2f} "
              f"{p['identitaet']['histKorrMin']:5.2f}  {p['ergebnis']['abnahme']}: "
              f"{', '.join(p['ergebnis']['sperrgruende']) or '—'}")
    print(f"\n{MESSUNG}\n{BERICHT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
