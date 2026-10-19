#!/usr/bin/env python3
"""Stufe 2 (Pilot): KI-Seitenansichten von Waffen per Bild-zu-Bild (Together AI).

Aufruf:  python3 scripts/waffen-sprites-ki.py pa_001 pa_040 ... [--versuch N]

Modell black-forest-labs/FLUX.1-kontext-pro (ca. 0,04 USD je Bild).  Referenz ist
ausschliesslich das eigene Client-Icon `src/client/assets/icons/IMG_xxxx_icon.png`
(64 px, auf 512 px hochskaliert, auf Magenta gelegt); sonst wird nichts hochgeladen.
Rohbilder: $PA_WAFFEN_ARBEIT/roh/<id>__vN.png, Kostenlog: $PA_WAFFEN_ARBEIT/kosten.jsonl.
HARTE Obergrenze 0,60 USD (OBERGRENZE_USD).  Schluessel nur aus der Umgebung
(TOGETHER_API_KEY, optional aus Datei PA_TOGETHER_ENV), wird nie ausgegeben.
Genau ein Versuch je Aufruf; Fehler/Timeouts zaehlen konservativ als abgerechnet.
"""
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

if "TOGETHER_API_KEY" not in os.environ and os.environ.get("PA_TOGETHER_ENV"):
    for zeile in Path(os.environ["PA_TOGETHER_ENV"]).read_text().splitlines():
        if zeile.startswith("TOGETHER_API_KEY="):
            os.environ["TOGETHER_API_KEY"] = zeile.split("=", 1)[1].strip().strip("\"'")

WURZEL = Path(__file__).resolve().parents[1]
ARBEIT = Path(os.environ.get("PA_WAFFEN_ARBEIT", "arbeit-waffen"))
MODELL = "black-forest-labs/FLUX.1-kontext-pro"
PREIS = 0.04
OBERGRENZE_USD = 0.60
PROMPT = ("same weapon, same colors and details, clean side view pointing right, "
          "the weapon alone centered, solid flat magenta (#ff00ff) background, "
          "game sprite style, same illustration style, no text, no shadow, no hand")


def katalog_icon(waffe_id: str) -> Path:
    js = ("import(process.argv[1]).then(m=>console.log(m.WEAPONS.find(w=>w.id===process.argv[2]).icon))")
    import subprocess
    pfad = "file://" + str(WURZEL / "src/shared/config/weapons.js")
    name = subprocess.run(["node", "-e", js, pfad, waffe_id], check=True, capture_output=True, text=True).stdout.strip()
    return WURZEL / "src/client/assets/icons" / (Path(name).stem + "_icon.png")


def referenz(pfad: Path) -> str:
    p = Image.open(pfad).convert("RGBA").resize((512, 512), Image.LANCZOS)
    flaeche = Image.new("RGB", p.size, (255, 0, 255))
    flaeche.paste(p, (0, 0), p)
    puffer = io.BytesIO()
    flaeche.save(puffer, "PNG")
    return "data:image/png;base64," + base64.b64encode(puffer.getvalue()).decode()


def summe() -> float:
    log = ARBEIT / "kosten.jsonl"
    return sum(json.loads(z)["usd"] for z in log.read_text().splitlines() if z.strip()) if log.exists() else 0.0


def buchen(waffe_id: str, v: int, extra: dict) -> None:
    with open(ARBEIT / "kosten.jsonl", "a") as f:
        f.write(json.dumps({"modell": MODELL, "k": waffe_id, "v": v, "usd": PREIS, "t": time.time(), **extra}) + "\n")


def aufruf(waffe_id: str, v: int) -> Path | None:
    ziel = ARBEIT / "roh" / f"{waffe_id}__v{v}.png"
    if ziel.exists():
        return ziel
    if summe() + PREIS > OBERGRENZE_USD:
        print("Kostenobergrenze erreicht, Abbruch", file=sys.stderr)
        return None
    ziel.parent.mkdir(parents=True, exist_ok=True)
    body = {"model": MODELL, "prompt": PROMPT, "image_url": referenz(katalog_icon(waffe_id)),
            "seed": 20261019 + v, "n": 1, "response_format": "base64"}
    anfrage = urllib.request.Request(
        "https://api.together.xyz/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"],
                 "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 curl/8",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(anfrage, timeout=240) as r:
            d = json.loads(r.read())
        buchen(waffe_id, v, {})
        roh = d["data"][0]
        daten = base64.b64decode(roh["b64_json"]) if roh.get("b64_json") else urllib.request.urlopen(roh["url"]).read()
        ziel.write_bytes(daten)
        return ziel
    except urllib.error.HTTPError as e:
        print(f"{waffe_id}: HTTP {e.code} {e.read().decode()[:200]}", file=sys.stderr)
        return None
    except Exception as e:  # noqa: BLE001
        buchen(waffe_id, v, {"fehler": type(e).__name__})
        print(f"{waffe_id}: {type(e).__name__}", file=sys.stderr)
        return None


def main() -> int:
    args = sys.argv[1:]
    v = 1
    if "--versuch" in args:
        i = args.index("--versuch")
        v = int(args[i + 1])
        del args[i:i + 2]
    ARBEIT.mkdir(parents=True, exist_ok=True)
    for wid in args:
        p = aufruf(wid, v)
        print(wid, "ok" if p else "fehlgeschlagen", f"Summe {summe():.2f} USD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
