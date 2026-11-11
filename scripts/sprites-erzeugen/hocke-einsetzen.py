#!/usr/bin/env python3
"""Setzt die Hocke aus dem Zustand-Blatt (Zelle 0) in eine freie Zelle des Aktionsblatts (BILDLUECKEN, FIGUREN-B B1).

Warum so und nicht ueber den Client: Die `__zustand.webp` sind von keinem Glob erfasst (TODO OPT-2) und mit ihren
vollflaechigen Figuren groesser gezeichnet als das Aktionsblatt; ein blindes Laden liesse die Figur beim Hocken springen.
Hier wird die Zelle auf die Standhoehe der Figur im Aktionsblatt gebracht und eingesetzt; der Client liest sie wie jede
andere Rolle (`rollen.hocke`). Gemessen wird: Skala = Hoehe der Stehpose im Aktionsblatt (idle[0]) / Hoehe der Stehpose
im Zustand-Blatt (Zelle 7, `Posieren`); der waagerechte Versatz richtet beide Stehposen aus. Die Zelle geht nur durch,
wenn nichts den Zellenrand beruehrt. Kein Frame ersetzt eine belegte Rolle (idle, luft, treffer, tod).

Aufruf (Wurzel; Sichtfreigabe der Figur vorher am Kontaktbogen /tmp/figuren-luecke*.jpg):
  python3 scripts/sprites-erzeugen/hocke-einsetzen.py [--trocken] fraktion/figur [...]
  Neu erzeugte Hocke statt Zustand-Zelle (Rohbild mit Magenta-Grund, z. B. von `emotion-neu.py` mit eigener Pose):
  python3 scripts/sprites-erzeugen/hocke-einsetzen.py fraktion/figur=roh.png
  (Hoehe = 72 % der Stehpose im Aktionsblatt; Fuss auf y = 239, Mitte an der Stehpose.)
"""
import argparse
import json

import numpy as np
from PIL import Image

A = 'src/client/assets/sprite-sheets/'
MANIFEST = A + 'manifest.json'
# Hoehe einer neu erzeugten Hocke im Verhaeltnis zur Stehpose (Modelle zeichnen die Figur unabhaengig vom Seitenbild gross).
HOCKE_ANTEIL = 0.72


def zelle(bild, i):
    return bild.crop(((i % 4) * 256, (i // 4) * 256, (i % 4) * 256 + 256, (i // 4) * 256 + 256))


def bbox(z):
    m = np.asarray(z.convert('RGBA'))[..., 3] >= 24
    ys, xs = np.where(m)
    return int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())


def main():
    p = argparse.ArgumentParser()
    p.add_argument('figuren', nargs='+')
    p.add_argument('--trocken', action='store_true')
    args = p.parse_args()
    m = json.load(open(MANIFEST))
    for k in args.figuren:
        k, _, roh = k.partition('=')
        e = m['figuren'][k]
        r = e['rollen']
        if 'hocke' in r:
            print(k, 'hat schon eine Hocke, uebersprungen')
            continue
        akt = Image.open(A + e['aktion']).convert('RGBA')
        zus = Image.open(A + e['zustand']).convert('RGBA') if not roh else None
        idle = zelle(akt, r['idle'][0])
        belegt = set(r['idle']) | {r[x] for x in ('luft', 'tod', 'treffer') if x in r}
        frei = [i for i in range(7, -1, -1) if i not in belegt]
        t0, b0, l0, r0 = bbox(idle)
        if roh:
            import sys  # noqa: PLC0415
            sys.path.insert(0, 'scripts/sprites-erzeugen')
            import schneide  # noqa: PLC0415
            h = schneide.frei_magenta(Image.open(roh).convert('RGB').resize((256, 256), Image.LANCZOS), mehr=True)
            th, bh, lh, rh = bbox(h)
            s = HOCKE_ANTEIL * (b0 - t0) / (bh - th)
            groesse = round(256 * s)
            kl = h.resize((groesse, groesse), Image.LANCZOS)
            neu = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
            tk, bk, lk, rk = bbox(kl)
            ox = round((l0 + r0) / 2 - (lk + rk) / 2)
            oy = 239 - bk
            neu.paste(kl, (ox, oy), kl)
            dx = ox
        else:
            t7, b7, l7, r7 = bbox(zelle(zus, 7))
            s = (b0 - t0) / (b7 - t7)
            cx_soll = (l0 + r0) / 2
            cx7 = 128 + ((l7 + r7) / 2 - 128) * s
            dx = cx_soll - cx7
            h = zelle(zus, 0)
            neu = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
            groesse = round(256 * s)
            kl = h.resize((groesse, groesse), Image.LANCZOS)
            ox = round(128 - groesse / 2 + dx)
            oy = round(239 - 239 * s)  # Fuss bleibt auf y = 239/240
            neu.paste(kl, (ox, oy), kl)
        tt, bb, ll, rr = bbox(neu)
        ok = ll > 0 and rr < 255 and tt > 0
        print(f'{k}: Skala {s:.2f}, Versatz {dx:+.0f}, Zelle {frei[0]}, bbox x {ll}-{rr} y {tt}-{bb}, Rand frei: {ok}')
        if not ok:
            print('   uebersprungen (Rand beruehrt)')
            continue
        if args.trocken:
            continue
        akt.paste(Image.new('RGBA', (256, 256), (0, 0, 0, 0)), ((frei[0] % 4) * 256, (frei[0] // 4) * 256))
        akt.paste(neu, ((frei[0] % 4) * 256, (frei[0] // 4) * 256), neu)
        akt.save(A + e['aktion'], 'WEBP', lossless=True, method=6)
        r['hocke'] = frei[0]
        e['rollen'] = dict(sorted(r.items()))
        e['hockeHerkunft'] = (f'neu erzeugt (Together FLUX.1 Kontext aus dem Seitenbild), Skala {s:.2f}' if roh else f'zustand:0, Skala {s:.2f}') + ' (Sicht vom Agenten freigegeben 2026-11-11, Abnahme Auftraggeber offen)'
    if not args.trocken:
        json.dump(m, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
        open(MANIFEST, 'a').write('\n')


if __name__ == '__main__':
    main()
