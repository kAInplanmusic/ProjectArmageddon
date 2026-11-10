#!/usr/bin/env python3
"""Wiederholungs- und Nahtmessung der gebackenen Stoffoptik (`stoffOptik.tinteStoffe`), Kontaktbogen.

Backt je Stoff mit Textur einen Streifen (6272 x 256) und eine Säule (384 x 2352) über
`scripts/stoff-optik-bake.mjs` (Node) und misst auf der Helligkeit des FERTIGEN Bildes:

  wiederholung   Autokorrelation (Hochpass, Mittel über die Zeilen) bei Verschiebung 512, 1024, ... (Kachelperiode der
                 Textur) minus Median der Autokorrelation bei Verschiebungen dazwischen. Nahe 0 = die Kachel ist im
                 Bild nicht als Wiederholung erkennbar; ein Wert von 0,3 und mehr zeigt dieselbe Struktur im Abstand.
  wiederholung_makro   dasselbe auf dem Tiefpass (Fleckung über 64 px und mehr).
  naht           größter Spaltenmittelwert der Nachbarpixel-Differenz geteilt durch den Median (jeder Spalte; ebenso
                 Zeilen der Säule): eine durchgehende Nahtlinie fiele als Ausreißer auf.
  naht_kante     dieselbe Differenz an den Kachelkanten (x = 512 k) geteilt durch den Median.
  makro_streuung Standardabweichung der 128-px-Blockmittel der Helligkeit relativ zum Gesamtmittel.

Aufrufe:
    python3 scripts/stoff-optik-messung.py messen [--schreiben] [--ids=1,5]   Tabelle; --schreiben: Messwerte in die JSON
    python3 scripts/stoff-optik-messung.py bogen <aus-praefix> [--ids=...]    Kontaktbogen (24:9-Ausschnitte, JPEG)

Braucht Python 3 mit Pillow und NumPy und Node (das Spiel selbst); keine Netzdienste.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

WURZEL = Path(__file__).resolve().parent.parent
ASSETS = WURZEL / 'src' / 'client' / 'assets'
MESSWERTE = WURZEL / 'scripts' / 'stoff-naht-messwerte.json'
B, H, SAEULE_B, SAEULE_H = 6272, 256, 384, 2352
SEED = 7


def texturen_ablegen(ziel: Path) -> None:
    namen = subprocess.check_output(['node', '-e', "import('%s/src/client/stoffTexturen.js').then(m=>console.log(m.TEXTUR_NAMEN.join(' ')))" % WURZEL]).decode().split()
    for nm in namen:
        for ordner in ('stoff-texturen', 'stoff-texturen-neu'):
            p = ASSETS / ordner / f'{nm}.jpg'
            if not p.exists():
                p = ASSETS / ordner / f'{nm}.webp'
            if p.exists():
                im = Image.open(p).convert('RGBA')
                if im.size != (512, 512):
                    im = im.resize((512, 512))
                (ziel / f'{nm}.rgba').write_bytes(im.tobytes())
                break


def backen(tex: Path, aus: Path, breite: int, hoehe: int, ids) -> dict:
    aus.mkdir(parents=True, exist_ok=True)
    cmd = ['node', str(WURZEL / 'scripts' / 'stoff-optik-bake.mjs'), str(tex), str(aus), f'--breite={breite}', f'--hoehe={hoehe}', f'--seed={SEED}']
    if ids:
        cmd.append('--ids=' + ','.join(map(str, ids)))
    subprocess.check_call(cmd)
    return json.loads((aus / 'zeiten.json').read_text())


def lesen(datei: Path, breite: int, hoehe: int) -> np.ndarray:
    rgb = np.frombuffer(datei.read_bytes(), np.uint8).reshape(hoehe, breite, 3)
    return rgb


def hell(rgb) -> np.ndarray:
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def box(a: np.ndarray, r: int, achse: int) -> np.ndarray:
    """Gleitendes Mittel (Breite 2r+1) entlang einer Achse, Ränder gespiegelt."""
    k = np.pad(a, [(r, r) if i == achse else (0, 0) for i in range(a.ndim)], mode='reflect')
    c = np.cumsum(k, axis=achse, dtype=np.float64)
    c = np.concatenate([np.zeros_like(np.take(c, [0], axis=achse)), c], axis=achse)
    n = a.shape[achse]
    return (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=achse) - np.take(c, range(0, n), axis=achse)) / (2 * r + 1)


def autokorr(l: np.ndarray, achse: int) -> np.ndarray:
    """Normierte Autokorrelation entlang `achse` (Mittel über die andere Achse, ohne Umbruch)."""
    l = l - l.mean(axis=achse, keepdims=True)
    n = l.shape[achse]
    f = np.fft.rfft(l, n=2 * n, axis=achse)
    ac = np.fft.irfft((f * np.conj(f)).sum(axis=1 - achse), n=2 * n)[:n]
    # Zahl der Paare je Verschiebung (kein Umbruch) angleichen
    ac = ac / (n - np.arange(n))
    return ac / ac[0]


def wiederholung(l: np.ndarray, achse: int, tiefpass: bool) -> float:
    if tiefpass:
        l = box(box(l, 32, 0), 32, 1)[::8, ::8] if achse == 1 else box(box(l, 32, 0), 32, 1)[::8, ::8]
        schritt = 8
    else:
        l = l - box(box(l, 16, 0), 16, 1)
        schritt = 1
    ac = autokorr(l, achse)
    n = len(ac)
    spitzen = [ac[k * 512 // schritt] for k in range(1, 5) if k * 512 // schritt < n - 8]
    # Spitze = Maximum in ±2 Stützstellen um die Periode (Raster der Textur kann um ein Pixel abweichen)
    spitzen = [ac[max(0, k * 512 // schritt - 2):k * 512 // schritt + 3].max() for k in range(1, 5) if k * 512 // schritt + 3 < n]
    lo, hi = 320 // schritt, min(n, 3200 // schritt)
    luecke = [v for i, v in enumerate(ac[lo:hi], lo) if all(abs(i - k * 512 // schritt) > 6 for k in range(1, 7))]
    return float(max(spitzen) - np.median(luecke))


def nahtwerte(l: np.ndarray, achse: int) -> tuple[float, float]:
    d = np.abs(np.diff(l, axis=achse)).mean(axis=1 - achse)
    med = float(np.median(d)) + 1e-6
    d = d[8:-8]
    kanten = [d[i - 8 - 1] for i in range(512, len(d) + 8, 512) if 8 < i < len(d) + 7]
    return float(d.max() / med), float(np.mean(kanten) / med) if kanten else 1.0


def makro(l: np.ndarray) -> float:
    h, b = l.shape
    m = l[: h // 128 * 128, : b // 128 * 128].reshape(h // 128, 128, b // 128, 128).mean(axis=(1, 3))
    return float(m.std() / l.mean())


def messen(ids, tex: Path) -> tuple[dict, dict]:
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        z1 = backen(tex, t / 'a', B, H, ids)
        z2 = backen(tex, t / 'b', SAEULE_B, SAEULE_H, ids)
        stoffe = json.loads(subprocess.check_output(['node', '-e', "import('%s/src/shared/config/stoffe.js').then(m=>console.log(JSON.stringify(m.STOFFE.map(s=>s.key)))))" % WURZEL]).decode()) if False else None
        res = {}
        for sid in sorted(int(k) for k in z1['ms']):
            la = hell(lesen(t / 'a' / f'{sid}.rgb', B, H))
            lb = hell(lesen(t / 'b' / f'{sid}.rgb', SAEULE_B, SAEULE_H))
            nx, kx = nahtwerte(la, 1)
            ny, ky = nahtwerte(lb, 0)
            res[sid] = {
                'wiederholung': round(max(wiederholung(la, 1, False), wiederholung(lb, 0, False)), 3),
                'wiederholung_makro': round(max(wiederholung(la, 1, True), wiederholung(lb, 0, True)), 3),
                'naht': round(max(nx, ny), 2),
                'naht_kante': round(max(kx, ky), 2),
                'makro_streuung': round(makro(la), 4),
            }
        zeit = {'breite': B, 'ms_mittel': round(float(np.mean(list(z1['ms'].values()))), 1), 'ms_max': round(float(max(z1['ms'].values())), 1)}
        return res, zeit


def stoffnamen() -> list[str]:
    return json.loads(subprocess.check_output(['node', '-e', "import('%s/src/shared/config/stoffe.js').then(m=>console.log(JSON.stringify(m.STOFFE.map(s=>s.key))))" % WURZEL]).decode())


def bogen(praefix: str, ids) -> None:
    names = stoffnamen()
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        texturen_ablegen(t)
        backen(t, t / 'a', B, 360, ids)
        sel = [int(f.stem) for f in sorted((t / 'a').glob('*.rgb'), key=lambda f: int(f.stem))]
        # 24:9-Ausschnitt: 960 x 360, drei Ausschnitte (links, Mitte, rechts) je Stoff
        zellen = []
        for sid in sel:
            im = np.frombuffer((t / 'a' / f'{sid}.rgb').read_bytes(), np.uint8).reshape(360, B, 3)
            zellen.append((sid, [Image.fromarray(im[:, x0:x0 + 960]) for x0 in (0, 2800, B - 960)]))
        proBogen = 4
        for k in range(0, len(zellen), proBogen):
            teil = zellen[k:k + proBogen]
            blatt = Image.new('RGB', (960 * 3 + 20, (360 + 22) * len(teil)), (20, 20, 20))
            dr = ImageDraw.Draw(blatt)
            for r, (sid, ims) in enumerate(teil):
                dr.text((4, r * 382 + 4), f'{sid} {names[sid]}', fill=(255, 255, 0))
                for c, im in enumerate(ims):
                    blatt.paste(im, (c * 970, r * 382 + 22))
            blatt.save(f'{praefix}{k // proBogen:02d}.jpg', quality=88)
        print(len(zellen), 'Stoffe,', (len(zellen) + proBogen - 1) // proBogen, 'Bögen')


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    ids = None
    for a in sys.argv:
        if a.startswith('--ids='):
            ids = [int(x) for x in a[6:].split(',')]
    if sys.argv[1] == 'bogen':
        bogen(sys.argv[2], ids)
        return 0
    names = stoffnamen()
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        texturen_ablegen(t)
        res, zeit = messen(ids, t)
    print(f'{"id":>4} {"stoff":<22}{"wdh":>7}{"wdh_mk":>8}{"naht":>7}{"kante":>7}{"streu":>8}')
    for sid, m in sorted(res.items(), key=lambda kv: -kv[1]['wiederholung']):
        print(f'{sid:>4} {names[sid]:<22}{m["wiederholung"]:>7}{m["wiederholung_makro"]:>8}{m["naht"]:>7}{m["naht_kante"]:>7}{m["makro_streuung"]:>8}')
    print('Bake-Zeit je Stoff bei', zeit['breite'], 'px Breite (ms):', zeit)
    if '--schreiben' in sys.argv:
        daten = json.loads(MESSWERTE.read_text())
        daten['optik'] = {'seed': SEED, 'streifen': [B, H], 'saeule': [SAEULE_B, SAEULE_H], 'bake': zeit,
                          'stoffe': {names[s]: m for s, m in sorted(res.items())}}
        MESSWERTE.write_text(json.dumps(daten, indent=2, ensure_ascii=False) + '\n')
        print('geschrieben:', MESSWERTE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
