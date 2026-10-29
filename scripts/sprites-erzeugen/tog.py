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
MODELL = "black-forest-labs/FLUX.1-kontext-pro"


def tog_gen(prompt, src, out, breite=1024, hoehe=768, modell=MODELL, steps=28, seed=5):
    schluessel = os.environ.get("TOGETHER_API_KEY")
    if not schluessel:
        return "ERR TOGETHER_API_KEY nicht gesetzt"
    # Wie `rep.py`: Figur auf gruenem Grund (Chromakey), damit der Zuschnitt sie spaeter freistellt.
    im = Image.open(src).convert("RGBA")
    grund = Image.new("RGBA", im.size, (0, 255, 0, 255))
    grund.alpha_composite(im)
    puffer = io.BytesIO()
    grund.convert("RGB").resize((768, 768)).save(puffer, "PNG")
    body = {
        "model": modell, "prompt": prompt, "width": breite, "height": hoehe, "steps": steps, "seed": seed,
        "image_url": "data:image/png;base64," + base64.b64encode(puffer.getvalue()).decode(),
    }
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
