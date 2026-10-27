#!/usr/bin/env python3
"""Erzeugt einzelne Emotions-Posen je Figur neu (Together FLUX.1-kontext-pro, Seitenbild als Referenz).

Die ersten Emotions-Sheets (ein Raster je Figur) verwandelten Tiere in Menschen. Hier entsteht jede Pose
als eigenes Bild mit der Figur als Referenz und der ausdrücklichen Vorgabe, die Art beizubehalten.

Schritt 1 (dieses Skript, `erzeugen`): Rohbilder nach `ARBEIT/roh/<fraktion>__<figur>__<pose>.png`.
Schritt 2 (`zusammenbauen`): Freistellen (Magenta-Flutfüllung), auf 256 px, in das Emotions-Sheet der Figur
einsetzen (die Zelle der Pose wird ersetzt), danach `emotion-pruefen.py` laufen lassen.

Aufruf (Wurzel des Repos, Schlüssel in der Umgebung, nie ausgeben):
  python3 scripts/sprites-erzeugen/emotion-neu.py erzeugen <ARBEIT> <obergrenze_usd> <fraktion/figur> [...]
  python3 scripts/sprites-erzeugen/emotion-neu.py zusammenbauen <ARBEIT> <fraktion/figur> [...]
"""
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

SEITE = 'src/client/assets/characters-side/'
EMO = 'src/client/assets/sprite-sheets-emotion/'
MODELL = 'black-forest-labs/FLUX.1-kontext-pro'
PREIS_MPIX = 0.04
GROESSE = 512
# Zellennummer im Emotions-Sheet -> Pose (Reihenfolge wie `EMOTIONEN` in figurSheets.js)
POSEN = {
    1: ('blinzeln', 'standing relaxed in the same neutral stance as the reference, eyes closed in a blink'),
    3: ('jubel', 'cheering triumphantly: arms or forelegs raised high, mouth open, happy, a small hop'),
    4: ('zittern', 'trembling and exhausted: hunched forward, knees slightly bent, tired shaking pose, sweat drops'),
    5: ('blickHoch', 'standing in the same stance, only the head tilted up, looking upward'),
    6: ('blickRunter', 'standing in the same stance, only the head tilted down, looking downward'),
}
PROMPT = ('The exact same character as in the reference image: same species, body shape, colors, costume and art style. '
          'It must stay the same creature and must never turn into a human or any other being. '
          'Side view facing right, full body visible, feet near the bottom, hands empty with no weapon, '
          'on a solid pure magenta (#FF00FF) background, no shadows, no text. Pose: {pose}.')


def referenz(schluessel):
    fak, name = schluessel.split('/')
    im = Image.open(f'{SEITE}{fak}/{name}.png').convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    b = io.BytesIO()
    bg.convert('RGB').resize((GROESSE, GROESSE), Image.LANCZOS).save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


def aufruf(schluessel, zelle, arbeit, ausgabe):
    name, pose = POSEN[zelle]
    ziel = os.path.join(arbeit, 'roh', f"{schluessel.replace('/', '__')}__{name}.png")
    if os.path.exists(ziel):
        return 0.0
    os.makedirs(os.path.dirname(ziel), exist_ok=True)
    body = {'model': MODELL, 'prompt': PROMPT.format(pose=pose), 'image_url': referenz(schluessel), 'seed': 20261027 + zelle,
            'n': 1, 'response_format': 'base64', 'width': GROESSE, 'height': GROESSE}
    daten = json.dumps(body).encode()
    for versuch in range(4):
        anfrage = urllib.request.Request(
            'https://api.together.xyz/v1/images/generations', data=daten,
            headers={'Authorization': 'Bearer ' + os.environ['TOGETHER_API_KEY'], 'Content-Type': 'application/json',
                     'User-Agent': 'Mozilla/5.0 curl/8', 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(anfrage, timeout=300) as r:
                d = json.loads(r.read())
            roh = d['data'][0]
            if roh.get('b64_json'):
                open(ziel, 'wb').write(base64.b64decode(roh['b64_json']))
            else:
                open(ziel, 'wb').write(urllib.request.urlopen(urllib.request.Request(roh['url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=120).read())
            w, h = Image.open(ziel).size
            return PREIS_MPIX * w * h / 1e6
        except urllib.error.HTTPError as e:
            if e.code == 402:
                raise SystemExit('KREDIT')
            print(schluessel, name, 'HTTP', e.code, e.read()[:120], file=sys.stderr)
            if e.code in (429, 500, 502, 503):
                time.sleep(10 * (versuch + 1))
                continue
            return 0.0
        except Exception as e:  # noqa: BLE001
            print(schluessel, name, 'Fehler', str(e)[:100], file=sys.stderr)
            time.sleep(5)
    return 0.0


def erzeugen(arbeit, grenze, schluessel):
    summe = 0.0
    for k in schluessel:
        for zelle in POSEN:
            if summe >= grenze:
                print('Obergrenze erreicht', round(summe, 3))
                return
            summe += aufruf(k, zelle, arbeit, None)
            print(k, POSEN[zelle][0], round(summe, 3), flush=True)


def zusammenbauen(arbeit, schluessel):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import schneide  # noqa: PLC0415
    for k in schluessel:
        fak, name = k.split('/')
        pfad = f'{EMO}{fak}/{name}__emotion.webp'
        sheet = Image.open(pfad).convert('RGBA')
        w, h = sheet.size
        geaendert = 0
        for zelle, (pose, _) in POSEN.items():
            roh = os.path.join(arbeit, 'roh', f"{fak}__{name}__{pose}.png")
            if not os.path.exists(roh):
                continue
            frei = schneide.frei_magenta(Image.open(roh).convert('RGB').resize((256, 256), Image.LANCZOS), mehr=True)
            if frei is None:
                continue
            x0, y0 = (zelle % 4) * w // 4, (zelle // 4) * h // 2
            sheet.paste((0, 0, 0, 0), (x0, y0, x0 + w // 4, y0 + h // 2))
            sheet.alpha_composite(frei.convert('RGBA'), (x0, y0))
            geaendert += 1
        if geaendert:
            sheet.save(pfad, 'WEBP', quality=88, method=4)
            print(k, geaendert, 'Zellen ersetzt')


if __name__ == '__main__':
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    if sys.argv[1] == 'erzeugen':
        erzeugen(sys.argv[2], float(sys.argv[3]), sys.argv[4:])
    elif sys.argv[1] == 'zusammenbauen':
        zusammenbauen(sys.argv[2], sys.argv[3:])
