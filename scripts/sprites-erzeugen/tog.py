"""Together AI: Bild-zu-Bild mit FLUX.1 Kontext [pro] (Gegenstueck zu `rep.py` und `kie.py`).

Der Schluessel kommt NUR aus der Umgebung (TOGETHER_API_KEY); das Modul liest, druckt und speichert ihn nicht.
Endpunkt und Felder nach der Together-Dokumentation (docs.together.ai/docs/quickstart-flux-kontext):
POST https://api.together.ai/v1/images/generations mit model, prompt, image_url, width, height, steps.

NICHT ERPROBT: In der Entwicklungssitzung gab es weder Schluessel noch Netzzugang zu api.together.ai. Ob
`image_url` eine Data-URI akzeptiert (wie hier gesendet) oder eine oeffentliche URL verlangt, ist offen; die
Antwort des Anbieters steht dann in der Fehlermeldung (`ERR ...`). Der Pilotlauf (`--pilot`) klaert es mit
einem Bild.
"""
import base64
import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image

ENDPUNKT = "https://api.together.ai/v1/images/generations"
# Pilot 2026-10-30: Kontext ignorierte die Vorlage bzw. lieferte keine Animation; flash-image-3.1 machte aus der Spinne
# einen Humanoiden; gpt-image-2 (Referenz per `reference_images`) lieferte treue Figur, 4x2 Felder, verschiedene Posen.
MODELL = "openai/gpt-image-2"


def tog_gen(prompt, src, out, breite=1024, hoehe=768, modell=MODELL, steps=28, seed=5):
    schluessel = os.environ.get("TOGETHER_API_KEY")
    if not schluessel:
        return "ERR TOGETHER_API_KEY nicht gesetzt"
    # Kontext verlangt eine OEFFENTLICHE Bild-URL (Data-URIs werden stillschweigend ignoriert: Pilot 2026-10-30
    # machte aus einer Spinne einen Soldaten). Das Repo ist oeffentlich; Quellbilder im Repo gehen per raw-URL.
    from pathlib import Path
    pfad = Path(src).resolve()
    wurzel = Path(__file__).resolve().parent.parent.parent
    try:
        rel = pfad.relative_to(wurzel).as_posix()
    except ValueError:
        return "ERR Quellbild liegt nicht im Repo; fuer Kontext ist eine oeffentliche URL noetig"
    bild_url = "https://raw.githubusercontent.com/kAInplanmusic/ProjectArmageddon/main/" + rel
    if "kontext" in modell:
        body = {
            "model": modell, "prompt": prompt, "width": breite, "height": hoehe, "steps": steps, "seed": seed,
            "image_url": bild_url,
        }
    else:
        body = {"model": modell, "prompt": prompt, "reference_images": [bild_url], "size": "1024x1024", "n": 1}
    req = urllib.request.Request(
        ENDPUNKT, json.dumps(body).encode(),
        {"Authorization": "Bearer " + schluessel, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        antwort = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as fehler:
        return "ERR HTTP %s %s" % (fehler.code, fehler.read()[:200].decode("utf8", "replace"))
    daten = (antwort.get("data") or [{}])[0]
    if daten.get("b64_json"):
        with open(out, "wb") as f:
            f.write(base64.b64decode(daten["b64_json"]))
        return "ok"
    if daten.get("url"):
        anfrage = urllib.request.Request(daten["url"], headers={"User-Agent": "Mozilla/5.0"})
        with open(out, "wb") as f:
            f.write(urllib.request.urlopen(anfrage, timeout=120).read())
        return "ok"
    return "ERR keine Bilddaten in der Antwort: " + json.dumps(antwort)[:200]
