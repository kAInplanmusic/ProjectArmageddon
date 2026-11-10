#!/usr/bin/env python3
"""Stilangleichung der Auftraggeber-Fotos (src/client/assets/panoramen) an die Biom-Kulissen (backdrops-neu).

Aufruf:  TOGETHER_API_KEY=... python3 scripts/panoramen-stil.py [--liste] [--parallel 4] [NAME ...]
Schreibt NEUE Dateien nach src/client/assets/panoramen-stil/<name>.webp; Originale bleiben unberuehrt.
Der Schluessel kommt nur aus der Umgebung und wird nie gespeichert oder ausgegeben.
Referenzbild = oeffentliche raw-GitHub-URL der Foto-Datei auf main (Datei muss gepusht sein).
Together liefert mit reference_images immer 1024x1024 (size wird ignoriert, geprueft 2026-11-10). Der Prompt verlangt
deshalb, alles Wichtige in das mittlere 16:9-Band zu legen; daraus wird 1024x576 geschnitten und mit Lanczos
(plus leichtem Schaerfen) auf 1920x1080 skaliert. Es wird nie gestreckt.
"""
import argparse, base64, io, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageFilter

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / "src/client/assets/panoramen"
ZIEL = WURZEL / "src/client/assets/panoramen-stil"
ENDPUNKT = "https://api.together.ai/v1/images/generations"
MODELL = "openai/gpt-image-2"
RAW = "https://raw.githubusercontent.com/kAInplanmusic/ProjectArmageddon/main/src/client/assets/panoramen/%s.webp"
AUSGENOMMEN = {"factory_yard", "small_cave", "snow_field"}  # PolyHaven, nicht bearbeiten

PROMPT = (
    "Repaint this photograph as a polished 2D game background in the style of a painterly, semi-realistic fantasy "
    "digital concept painting (like the backdrops of a high-end tactical artillery game). KEEP the exact composition "
    "of the photo: same horizon height, same main objects (trees, mountains, houses, water, road, sun/moon) in the same "
    "places, same time of day and weather, same overall mood. Only change the rendering: visible soft brush strokes, "
    "simplified textures, clean readable silhouettes, strong but not oversaturated colors, gentle cinematic lighting "
    "with a glowing atmospheric sky and rim light, subtle depth haze between layers. The sky and the horizon line must "
    "read clearly. Keep the lower third calm and low-contrast (smooth ground, no clutter, no bright spots) because "
    "game characters walk there. The output canvas is square but will be cropped to the central 16:9 horizontal band "
    "(middle 56 percent of the height): put the horizon, the main objects and the sun/moon inside that band and extend "
    "the sky above and the calm ground below it naturally. Do NOT add new subjects, creatures, people, buildings or fantasy elements; do NOT "
    "change the scene into something else. No text, no signature, no watermark, no frame, no border, no UI."
)


def pruefe_namen():
    return sorted(p.stem for p in QUELLE.glob("*.webp")
                  if not p.stem.endswith("-1280") and not p.stem.endswith("-sdr") and p.stem not in AUSGENOMMEN)


def erzeuge(name, versuche=3):
    schluessel = os.environ.get("TOGETHER_API_KEY")
    if not schluessel:
        return "ERR TOGETHER_API_KEY nicht gesetzt"
    zb, zh = 1920, 1080
    body = {"model": MODELL, "prompt": PROMPT, "reference_images": [RAW % name], "size": "1024x1024", "n": 1}
    letzte = ""
    for v in range(versuche):
        req = urllib.request.Request(ENDPUNKT, json.dumps(body).encode(), {
            "Authorization": "Bearer " + schluessel, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
        try:
            antwort = json.load(urllib.request.urlopen(req, timeout=400))
            d = (antwort.get("data") or [{}])[0]
            if d.get("b64_json"):
                roh = base64.b64decode(d["b64_json"])
            elif d.get("url"):
                roh = urllib.request.urlopen(urllib.request.Request(d["url"], headers={"User-Agent": "Mozilla/5.0"}), timeout=120).read()
            else:
                letzte = "ERR keine Bilddaten"; continue
            bild = Image.open(io.BytesIO(roh)).convert("RGB")
            # erst mittiges 16:9-Band schneiden, dann proportional skalieren (nie strecken)
            hb = round(bild.width * 9 / 16); o0 = (bild.height - hb) // 2
            bild = bild.crop((0, o0, bild.width, o0 + hb))
            s = max(zb / bild.width, zh / bild.height)
            bild = bild.resize((round(bild.width * s), round(bild.height * s)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
            l, o = (bild.width - zb) // 2, (bild.height - zh) // 2
            bild = bild.crop((l, o, l + zb, o + zh))
            ZIEL.mkdir(parents=True, exist_ok=True)
            bild.save(ZIEL / (name + ".webp"), "WEBP", quality=90, method=6)
            return "ok %dx%d (roh %s)" % (zb, zh, "%dx%d" % Image.open(io.BytesIO(roh)).size)
        except urllib.error.HTTPError as e:
            letzte = "ERR HTTP %s %s" % (e.code, e.read()[:200].decode("utf8", "replace"))
        except Exception as e:  # Netzfehler/Timeout: erneut versuchen
            letzte = "ERR %s" % type(e).__name__
        time.sleep(5 * (v + 1))
    return letzte


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("namen", nargs="*")
    ap.add_argument("--liste", action="store_true")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--neu", action="store_true", help="vorhandene Ergebnisse ueberschreiben")
    a = ap.parse_args()
    namen = a.namen or pruefe_namen()
    if a.liste:
        print("\n".join(namen)); sys.exit()
    if not a.neu:
        namen = [n for n in namen if not (ZIEL / (n + ".webp")).exists()]
    with ThreadPoolExecutor(a.parallel) as ex:
        for n, r in zip(namen, ex.map(erzeuge, namen)):
            print(n, r, flush=True)
