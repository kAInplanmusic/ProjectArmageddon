#!/usr/bin/env python3
"""Vier Hintergrundarten (hell, dunkel, hoehle, ragnarok) je Panorama aus src/client/assets/panoramen-stil.

Aufruf:  TOGETHER_API_KEY=... python3 scripts/panoramen-4arten.py [--parallel 4] [--neu] [--liste] [NAME[:ART] ...]
Schreibt src/client/assets/panoramen-stil/<name>_<art>.webp (1920x1080). Referenz = raw-GitHub-URL des gemalten
Panoramas auf main (muss gepusht sein). Methode wie scripts/panoramen-stil.py (Together liefert 1024x1024; mittleres
16:9-Band schneiden, Lanczos auf 1920x1080). `hell` fuer Tagbilder und `dunkel` fuer Nachtbilder werden NICHT erzeugt,
sondern aus dem vorhandenen Bild uebernommen (Tabelle TAGESZEIT). Der Schluessel kommt nur aus der Umgebung.
"""
import argparse, base64, io, json, os, shutil, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageFilter

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = WURZEL / "src/client/assets/panoramen-stil"
ENDPUNKT = "https://api.together.ai/v1/images/generations"
MODELL = "openai/gpt-image-2"
RAW = "https://raw.githubusercontent.com/kAInplanmusic/ProjectArmageddon/main/src/client/assets/panoramen-stil/%s.webp"
ARTEN = ("hell", "dunkel", "hoehle", "ragnarok")

# Zeigt das vorhandene Bild schon klaren Tag ("tag") oder Nacht ("nacht"), wird diese Art uebernommen;
# alles andere (Daemmerung, Gewitter, Nebel, Abendrot) bekommt hell UND dunkel neu.
NACHT = {"nachtstadt_lichter", "nachtstadt_tal", "nachtstadt_tal_2", "nachtstrasse_sw"}
TAG = {"alpendorf_herbst", "baum_wegegabelung", "baum_weitblick", "bergsee", "fluss_goldhaus", "huegelweide",
       "klondike_schnee", "palmenstrand_fluss", "schaefchenwolken", "schnee_alpendorf", "schneegarten",
       "schotterweg_horizont", "sonnenstrahlen_felder", "strand_ebbe"}

BASIS = (
    "Repaint this painterly 2D game background as a variant of the SAME scene in the same painterly, semi-realistic "
    "fantasy concept-painting style (like backdrops of a high-end tactical artillery game). KEEP the composition: same "
    "horizon height, same main objects (trees, hills, mountains, houses, water, road, fence) in the same places and "
    "shapes. Change ONLY the lighting, sky, atmosphere and the extra framing described below. "
    "Do not invent new buildings, people, creatures or text. Keep the lower third calm, smooth and low-contrast (no "
    "bright spots, no clutter) because game characters walk there. The canvas is square but is cropped to the central "
    "16:9 horizontal band (middle 56 percent of the height): put the horizon, the main objects and the sun/moon inside "
    "that band and extend the sky above and calm ground below naturally. No text, no signature, no watermark, no UI, no border. "
)
ART_PROMPT = {
    "hell": "VARIANT: bright clear midday daylight. Clean blue sky with a few soft white clouds, high warm sun, crisp "
            "readable colors, gentle haze in the distance. No sunset colors, no fog, no night.",
    "dunkel": "VARIANT: the same scene at deep night. Dense field of stars and a pale moon in the sky, cold blue-violet "
              "moonlight, dark silhouettes, a few small warm window lights only where houses already exist. Still readable, "
              "not pitch black; ground stays calm and dark.",
    "hoehle": "VARIANT: the same landscape seen from INSIDE a dark cave mouth: heavy dark rock frames the view at the left, "
              "right and top (rough stone arch with stalactites, in the outer dark zone), while the landscape of the original "
              "glows in daylight through the opening in the center, same horizon and objects, slightly smaller. "
              "The cave rock is dark and subdued; the calm lower third is smooth dark cave floor.",
    "ragnarok": "VARIANT: the apocalyptic end of the world (Ragnarok) version of the same scene. Blood-red and orange burning "
                "sky, towering smoke and ash clouds, glowing embers and sparks falling, a huge dull red sun or fire glow on the "
                "horizon, dark scorched silhouettes of the same trees, hills and houses, ash-grey burnt ground in the lower third. Dramatic but readable.",
}


def uebernehmen(name, art):
    """hell/dunkel aus vorhandenem Bild kopieren, wenn es schon passt."""
    if art == "hell" and name in TAG or art == "dunkel" and name in NACHT:
        shutil.copyfile(ZIEL / (name + ".webp"), ZIEL / ("%s_%s.webp" % (name, art)))
        return True
    return False


def erzeuge(auftrag, versuche=3, ziel=None, nachschaerfen=""):
    name, art = auftrag
    ziel = ziel or ZIEL
    if not nachschaerfen and uebernehmen(name, art):
        return "uebernommen"
    schluessel = os.environ.get("TOGETHER_API_KEY")
    if not schluessel:
        return "ERR TOGETHER_API_KEY nicht gesetzt"
    prompt = BASIS + ART_PROMPT[art] + nachschaerfen
    body = {"model": MODELL, "prompt": prompt, "reference_images": [RAW % name], "size": "1024x1024", "n": 1}
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
            hb = round(bild.width * 9 / 16); o0 = (bild.height - hb) // 2
            bild = bild.crop((0, o0, bild.width, o0 + hb))
            bild = bild.resize((1920, 1080), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
            Path(ziel).mkdir(parents=True, exist_ok=True)
            bild.save(Path(ziel) / ("%s_%s.webp" % (name, art)), "WEBP", quality=90, method=6)
            return "ok"
        except urllib.error.HTTPError as e:
            letzte = "ERR HTTP %s %s" % (e.code, e.read()[:200].decode("utf8", "replace"))
        except Exception as e:
            letzte = "ERR %s" % type(e).__name__
        time.sleep(5 * (v + 1))
    return letzte


def alle_namen():
    return sorted(p.stem for p in ZIEL.glob("*.webp") if not any(p.stem.endswith("_" + a) for a in ARTEN))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("auswahl", nargs="*", help="NAME oder NAME:ART")
    ap.add_argument("--liste", action="store_true")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--neu", action="store_true")
    ap.add_argument("--ziel", help="anderes Zielverzeichnis (Probelauf)")
    a = ap.parse_args()
    auftraege = []
    for s in (a.auswahl or alle_namen()):
        n, _, art = s.partition(":")
        auftraege += [(n, art)] if art else [(n, x) for x in ARTEN]
    if a.liste:
        print(len(auftraege)); sys.exit()
    z = Path(a.ziel) if a.ziel else ZIEL
    if not a.neu:
        auftraege = [x for x in auftraege if not (z / ("%s_%s.webp" % x)).exists()]
    with ThreadPoolExecutor(a.parallel) as ex:
        for x, r in zip(auftraege, ex.map(lambda t: erzeuge(t, ziel=z), auftraege)):
            print(*x, r, flush=True)
