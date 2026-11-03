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
    0: ('angst', 'frightened and scared: cowering, body crouched low and leaning backward away from danger, '
                 'arms or front paws raised defensively in front of the face, wide fearful eyes (a four-legged animal stays on all fours, '
                 'ducking low with ears back)'),
    1: ('blinzeln', 'standing relaxed in the same neutral stance as the reference, eyes closed in a blink'),
    2: ('schulterzucken', 'shrugging: shoulders pulled up high, both empty palms turned up at the sides, head tilted, '
                          'puzzled "I don\'t know" expression (a four-legged animal stays on all fours, shoulders raised and head tilted)'),
    3: ('jubel', 'cheering triumphantly: arms or forelegs raised high, mouth open, happy, a small hop'),
    4: ('zittern', 'trembling and exhausted: hunched forward, knees slightly bent, tired shaking pose, sweat drops'),
    5: ('blickHoch', 'keep the exact same body posture and number of legs as the reference (a four-legged animal stays on all fours), only the head tilted up, looking upward'),
    6: ('blickRunter', 'keep the exact same body posture and number of legs as the reference (a four-legged animal stays on all fours), only the head tilted down, looking downward'),
    7: ('waffenwechsel', 'switching gear: body slightly turned and leaning forward, one empty hand reaching back over the shoulder '
                         'as if grabbing something from the back, focused determined look over the shoulder (a four-legged animal stays on all fours, '
                         'looking back over its shoulder)'),
}
# Zusätze je Figur, wo FLUX die Gestalt verliert (2026-11-03)
ZUSATZ = {
    'datacult/02_chrome-code-shifter': 'It is a legless snake: no arms and no legs, it stays a coiled snake.',
    'datacult/21_hyper-link-hound': 'It is a four-legged robot dog with two heads: keep both heads and all four legs, stays on all fours.',
    'pixel/12_shieldmon': 'It is a four-legged porcupine with a big shield on its back: stays on all fours and keeps the shield.',
    'undead/12_vessel-plague-skull': 'It is a bare skeleton wrapped in green flames.',
}
PROMPT = ('The exact same character as in the reference image: same species, body shape, colors, costume and art style. '
          'It must stay the same creature and must never turn into a human or any other being. '
          'Keep the identical line art, shading, color palette, proportions, silhouette, number of limbs and head shape; '
          'only the pose changes. Do not add or remove any items, wings, armor or accessories. '
          'Keep exactly the same anatomy as the reference. '
          # 2026-11-03: Jede Erwähnung von "tail" (auch verneint) gab Menschen und Robotern Schwänze; das Wort bleibt draußen.
          'Side view facing right, full body visible, feet near the bottom, hands empty with no weapon, '
          'on a solid pure magenta (#FF00FF) background, no shadows, no text. Pose: {pose}.')


def log(ziel, usd):
    """Kostenlog (Umgebung `KOSTEN_LOG`, jsonl); Fehlversuche zählen als bezahlt."""
    pfad = os.environ.get('KOSTEN_LOG')
    if pfad:
        with open(pfad, 'a') as f:
            f.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), 'aus': os.path.basename(ziel), 'usd': round(usd, 4)}) + '\n')


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
    body = {'model': MODELL, 'prompt': PROMPT.format(pose=pose) + (' ' + ZUSATZ[schluessel] if schluessel in ZUSATZ else ''),
            'image_url': referenz(schluessel), 'seed': 20261027 + zelle + int(os.environ.get('SEED_PLUS', '0')),
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
            preis = PREIS_MPIX * w * h / 1e6
            log(ziel, preis)
            return preis
        except urllib.error.HTTPError as e:
            if e.code == 402:
                raise SystemExit('KREDIT')
            print(schluessel, name, 'HTTP', e.code, e.read()[:120], file=sys.stderr)
            log(ziel + ' (Fehler HTTP %d)' % e.code, PREIS_MPIX * GROESSE * GROESSE / 1e6)
            if e.code in (429, 500, 502, 503):
                time.sleep(10 * (versuch + 1))
                continue
            return 0.0
        except Exception as e:  # noqa: BLE001
            print(schluessel, name, 'Fehler', str(e)[:100], file=sys.stderr)
            log(ziel + ' (Fehler)', PREIS_MPIX * GROESSE * GROESSE / 1e6)
            time.sleep(5)
    return 0.0


def fehlende(k):
    """Zellen der Posen, die im Manifest noch nicht als gültig stehen (Umgebung `POSEN_NUR`, z. B. `3,5,6`, schränkt ein)."""
    m = json.load(open(EMO + 'manifest.json'))['figuren'].get(k, {})
    nur = {int(x) for x in os.environ.get('POSEN_NUR', '').split(',') if x.strip()}
    return [z for z in POSEN if z not in m.get('gueltig', []) and (not nur or z in nur)]


def erzeugen(arbeit, grenze, schluessel):
    summe = 0.0
    for k in schluessel:
        for zelle in fehlende(k):
            if summe >= grenze:
                print('Obergrenze erreicht', round(summe, 3))
                return
            summe += aufruf(k, zelle, arbeit, None)
            print(k, POSEN[zelle][0], round(summe, 3), flush=True)


def saeubern(bild):
    """Entfernt Magenta-Reste: Bodenschatten (magentastichige Flecken im unteren Fünftel der Figur) und Farbsäume am Rand."""
    from scipy import ndimage as ndi  # noqa: PLC0415
    a = np.asarray(bild.convert('RGBA')).astype(float)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = al > 40
    if not m.any():
        return bild
    stich = (g < 0.45 * np.minimum(r, b)) & (np.abs(r - b) < 0.4 * np.maximum(r, b)) & (np.minimum(r, b) > 50)
    ys = np.where(m.any(1))[0]
    unten = np.zeros_like(m)
    unten[int(ys[-1] - 0.2 * (ys[-1] - ys[0])):] = True
    schatten = stich & unten & m
    lab, k = ndi.label(schatten)
    if k:
        sz = ndi.sum(schatten, lab, range(1, k + 1))
        for i, v in enumerate(sz):
            if v >= 30:  # zusammenhängende Fläche, kein einzelnes Detail
                a[ndi.binary_dilation(lab == i + 1, iterations=1) & (al > 0), 3] = 0
    # Saum: zwei Pixel Rand, Magenta-Überschuss abziehen
    m = a[..., 3] > 40
    rand = m & ~ndi.binary_erosion(m, iterations=2)
    ueber = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * rand
    a[..., 0] -= ueber
    a[..., 2] -= ueber
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def zusammenbauen(arbeit, schluessel):
    """Schlüssel `fraktion/figur[:zellen]`, z. B. `beasts/10_flame-jaws:0,2,7s` (nur diese Zellen; `s` = gespiegelt,
    für Bilder, in denen die Figur nach links schaut)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import schneide  # noqa: PLC0415
    for k in schluessel:
        k, _, auswahl = k.partition(':')
        wahl = {int(x.rstrip('s')): x.endswith('s') for x in auswahl.split(',') if x}
        fak, name = k.split('/')
        pfad = f'{EMO}{fak}/{name}__emotion.webp'
        sheet = Image.open(pfad).convert('RGBA')
        w, h = sheet.size
        geaendert = 0
        for zelle, (pose, _) in POSEN.items():
            roh = os.path.join(arbeit, 'roh', f"{fak}__{name}__{pose}.png")
            if not os.path.exists(roh) or (wahl and zelle not in wahl):
                continue
            frei = schneide.frei_magenta(Image.open(roh).convert('RGB').resize((256, 256), Image.LANCZOS), mehr=True)
            if frei is None:
                continue
            frei = saeubern(frei)
            if wahl.get(zelle):
                frei = frei.transpose(Image.FLIP_LEFT_RIGHT)
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
