#!/usr/bin/env python3
"""Fassung 21/22: neue Waffenbilder per Runware (openai:gpt-image@2), Magenta-Grund-Verfahren.

Erzeugt NUR Rohbilder (Schluessel aus der Umgebung RUNWARE_API_KEY, wird nie ausgegeben oder gespeichert):
  funkenkugel  1 Bild  Icon der Funkenkugel (pa_079), 1024x1024
  geschosse    1 Bild  Raster 2x2 mit Mine, Luftangriffsbombe, Meteor, Hoellenkugel (Geschosszellen)
Ausgabe: --ziel (Standard /tmp/pa-f21), Kostenlog kosten.jsonl dort. Harte Obergrenze --max-usd (Standard 0,60).
Aufruf:  RUNWARE_API_KEY=... python3 scripts/sprites-erzeugen/waffen-fassung21-bilder.py funkenkugel geschosse
Weiter mit scripts/waffen-fassung21-einsetzen.py (Freistellen, Zellen, Atlanten, Manifest).
"""
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image

WURZEL = Path(__file__).resolve().parents[2]
MODELL = "openai:gpt-image@2"
STIL = ("Cartoon pixel-art-flavoured fantasy game artwork, bold dark outlines, saturated colours, soft cel shading, "
        "same illustration style as the reference images")
AUFTRAEGE = {
    "funkenkugel": {
        "prompt": ("A single crackling ball of electricity for a game weapon icon: a glowing white-blue sphere core with "
                   "jagged yellow-white lightning bolts arcing outward in all directions and a few small sparks. "
                   "Centered, filling about 80 percent of the image, no frame, no tile, no text. "
                   f"{STIL}. Plain solid flat magenta (#FF00FF) background, no gradient, no shadow."),
        "refs": ["assets/weapons/source/IMG_9033.PNG"], "w": 1024, "h": 1024,
    },
    "geschosse": {
        "prompt": ("A 2x2 grid of four separate small game projectile sprites, each centered in its own equal quarter of the "
                   "image with generous empty margin, all pointing and flying to the RIGHT, side view, each with a short "
                   "motion trail on its left. Top-left: a thrown land mine, a round dark-grey metal disc with a red blinking "
                   "light and a few short spikes, with a small grey dust trail. Top-right: an aerial bomb, a finned olive-green "
                   "air-dropped bomb with a yellow stripe, nose to the right, with a smoke trail. Bottom-left: a flaming meteor, "
                   "a rough brown-black rock wrapped in orange fire with a long flame tail. Bottom-right: a hellish cannonball, "
                   "a black iron ball with glowing red-orange cracks and purple-red hellfire trail. No text, no grid lines, "
                   f"{STIL}. Plain solid flat magenta (#FF00FF) background everywhere, no gradient, no shadow."),
        "refs": ["/tmp/wa/geschosse-ref.png"], "w": 1024, "h": 1024,
    },
}


def datei_uri(pfad):
    p = Path(pfad)
    p = p if p.is_absolute() else WURZEL / p
    im = Image.open(p).convert("RGB")
    im.thumbnail((1024, 1024))
    b = io.BytesIO()
    im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def lauf(name, ziel, max_usd, nr):
    a = AUFTRAEGE[name]
    log = ziel / "kosten.jsonl"
    summe = sum(json.loads(z)["usd"] for z in log.read_text().splitlines() if z.strip()) if log.exists() else 0.0
    if summe >= max_usd:
        print("Obergrenze erreicht", file=sys.stderr)
        return None
    task = {"taskType": "imageInference", "taskUUID": str(uuid.uuid4()), "model": MODELL, "positivePrompt": a["prompt"],
            "width": a["w"], "height": a["h"], "numberResults": 1, "outputFormat": "PNG", "includeCost": True,
            "inputs": {"referenceImages": [datei_uri(r) for r in a["refs"]]}}
    req = urllib.request.Request("https://api.runware.ai/v1", json.dumps([task]).encode(),
                                 {"Authorization": "Bearer " + os.environ["RUNWARE_API_KEY"],
                                  "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    try:
        antwort = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        print(f"{name}: HTTP {e.code} {e.read()[:400].decode('utf8', 'replace')}", file=sys.stderr)
        return None
    if antwort.get("errors"):
        print(f"{name}: {json.dumps(antwort['errors'])[:400]}", file=sys.stderr)
        return None
    d = antwort["data"][0]
    kosten = float(d.get("cost") or 0)
    with open(log, "a") as f:
        f.write(json.dumps({"name": name, "versuch": nr, "usd": kosten, "t": time.time(), "modell": MODELL}) + "\n")
    daten = urllib.request.urlopen(urllib.request.Request(d["imageURL"], headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read()
    out = ziel / f"{name}__v{nr}.png"
    out.write_bytes(daten)
    print(f"{name}: ok {out} Kosten {kosten:.4f} USD (Summe {summe + kosten:.4f})")
    return out


def main():
    args = sys.argv[1:]
    nr, max_usd, ziel = 1, 0.60, Path("/tmp/pa-f21")
    if "--versuch" in args:
        i = args.index("--versuch"); nr = int(args[i + 1]); del args[i:i + 2]
    if "--ziel" in args:
        i = args.index("--ziel"); ziel = Path(args[i + 1]); del args[i:i + 2]
    ziel.mkdir(parents=True, exist_ok=True)
    for n in args:
        lauf(n, ziel, max_usd, nr)


if __name__ == "__main__":
    main()
