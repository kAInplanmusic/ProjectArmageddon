#!/usr/bin/env python3
"""Lädt erzeugte Kulissen herunter und bereitet sie fürs Spiel auf.

Aufruf:  python3 scripts/fetch-backdrops.py <manifest.json>

Das Manifest ist eine Liste aus {"key": "biome/variante", "url": "https://..."}.

Aufbereitung:
  - Zuschnitt auf 16:9 und Skalierung auf die Spielgröße (Karte ist 1280x720).
  - Speichern als JPEG. PNG wäre für Fotos das Mehrfache an Bytes ohne
    sichtbaren Gewinn; die Kulissen sind reine Hintergrundbilder.
  - Ergebnis geht nach src/client/assets/backdrops/<biome>_<variante>.jpg

Die Dateinamen folgen dem Katalog in src/shared/config/backdrops.js. Ein
Abweichen wird gemeldet, damit Katalog und Ablage nicht auseinanderlaufen.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "client" / "assets" / "backdrops"
TARGET_W, TARGET_H = 1280, 720
JPEG_QUALITY = 78


def load_catalog_files() -> set[str]:
    """Sammelt die im Katalog hinterlegten Dateinamen.

    Gelesen wird die Menge aller `file:`-Werte. Ein früherer Ansatz versuchte,
    Biome- und Varianten-IDs zu unterscheiden — das ging schief, weil beide gleich
    aussehen (`id: 'maritime'` neben `id: 'calm_day'`). Die Dateinamen sind
    dagegen eindeutig, und mehr wird hier nicht gebraucht.
    """
    katalog = ROOT / "src" / "shared" / "config" / "backdrops.js"
    text = katalog.read_text(encoding="utf-8")
    return {
        zeile.strip().split("'")[1]
        for zeile in text.splitlines()
        if zeile.strip().startswith("file: '")
    }


def expected_filename(key: str) -> str:
    """Dateiname aus dem Kulissenschlüssel: „biome/variante" -> biome_variante.jpg."""
    return key.replace("/", "_") + ".jpg"


def cover_resize(image: Image.Image, width: int, height: int) -> Image.Image:
    """Skaliert auf die Zielgröße und schneidet den Überstand mittig ab.

    `cover` statt `contain`: Die Kulisse muss das Format füllen. Ein
    vollständiges Einpassen hinterließe Ränder, und die wären im Spiel als
    Streifen sichtbar.
    """
    ziel_verhaeltnis = width / height
    bild_verhaeltnis = image.width / image.height

    if bild_verhaeltnis > ziel_verhaeltnis:
        # Zu breit: links und rechts abschneiden.
        neue_hoehe = height
        neue_breite = int(round(height * bild_verhaeltnis))
    else:
        # Zu hoch: oben und unten abschneiden — dabei weniger oben abschneiden,
        # damit die Landmarken im oberen Bildteil erhalten bleiben.
        neue_breite = width
        neue_hoehe = int(round(width / bild_verhaeltnis))

    skaliert = image.resize((neue_breite, neue_hoehe), Image.LANCZOS)

    links = (neue_breite - width) // 2
    # Bei Überhöhe nur ein Viertel des Überstands oben abschneiden: der Himmel
    # und die fernen Landmarken sind der wichtigste Teil der Kulisse.
    oben = (neue_hoehe - height) // 4 if neue_hoehe > height else 0
    return skaliert.crop((links, oben, links + width, oben + height))


def fetch(url: str, timeout: int = 60) -> Image.Image:
    with urllib.request.urlopen(url, timeout=timeout) as antwort:
        daten = antwort.read()
    return Image.open(BytesIO(daten)).convert("RGB")


def main() -> int:
    if len(sys.argv) < 2:
        print("Aufruf: fetch-backdrops.py <manifest.json>", file=sys.stderr)
        return 2

    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    katalog_dateien = load_catalog_files()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fehler: list[str] = []
    gesamt_bytes = 0
    fertig = 0

    for eintrag in manifest:
        key = eintrag["key"]
        dateiname = expected_filename(key)
        # Gegenprobe: Der abgeleitete Name muss im Katalog stehen. Sonst laufen
        # Ablage und Katalog auseinander und die Kulisse wird nie gefunden.
        if dateiname not in katalog_dateien:
            fehler.append(f"{key}: {dateiname} steht nicht im Katalog")
            continue

        ziel = OUT_DIR / dateiname
        try:
            bild = fetch(eintrag["url"])
            vorher = bild.size
            bild = cover_resize(bild, TARGET_W, TARGET_H)
            bild.save(ziel, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            groesse = ziel.stat().st_size
            gesamt_bytes += groesse
            fertig += 1
            print(f"OK   {key:28s} {vorher[0]}x{vorher[1]} -> {TARGET_W}x{TARGET_H}  {groesse/1024:6.0f} KB")
        except Exception as ausnahme:  # noqa: BLE001 - Meldung genügt hier
            fehler.append(f"{key}: {ausnahme}")
            print(f"FEHL {key:28s} {ausnahme}")

    print()
    print(f"{fertig} Kulissen geschrieben, {gesamt_bytes/1024/1024:.1f} MB gesamt")
    if fehler:
        print(f"{len(fehler)} Fehler:")
        for eintrag in fehler:
            print("  " + eintrag)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
