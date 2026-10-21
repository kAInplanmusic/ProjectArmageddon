#!/usr/bin/env python3
"""Klassifiziert die Zellen der Sprite-Sheets und schreibt abgeleitete Daten ins Manifest.

Aufruf:  python3 scripts/sprite-sheets-klassifizieren.py [--pruefen] [--kontakt DIR FRAKTION...]

Je Figur (Manifest `figuren`) entstehen:
  rollen: {idle:[i,j], hocke:i, luft:i, treffer:i, tod:i}  (fehlende Rolle = Schlüssel fehlt -> Fallback auf
          die prozedurale Animation) und `gehen`: 8 Zellindizes des Gehzyklus (ungültige Zellen durch den
          Nachbarn ersetzt; `gehenOk` = Anzahl unveränderter Zellen).
Heuristik aus Alpha-Bounding-Boxen (Zelle 256 px, Grundlinie y = 240). Reine Ableitung aus den Bildern,
deterministisch. Die Bilder selbst werden nie verändert.
"""
import json, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage

WURZEL = os.path.join(os.path.dirname(__file__), '..', 'src', 'client', 'assets', 'sprite-sheets')
ZELLE, SPALTEN, ZEILEN, GRUND = 256, 4, 2, 240
ALPHA = 40


def zellen(pfad):
    a = np.array(Image.open(pfad).convert('RGBA'))[:, :, 3] > ALPHA
    return [a[(i // SPALTEN) * ZELLE:(i // SPALTEN + 1) * ZELLE, (i % SPALTEN) * ZELLE:(i % SPALTEN + 1) * ZELLE]
            for i in range(SPALTEN * ZEILEN)]


def box(m):
    ys, xs = np.where(m)
    if len(xs) < 40:
        return None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    return {'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'b': x1 - x0 + 1, 'h': y1 - y0 + 1,
            'cx': (x0 + x1) / 2, 'flaeche': int(m.sum())}


def iou(ma, ba, mb, bb):
    """Überdeckung zweier Masken, am Fußpunkt (Unterkante, Mitte der Box) ausgerichtet."""
    dx = int(round(ba['cx'] - bb['cx']))
    dy = ba['y1'] - bb['y1']
    s = np.roll(np.roll(mb, dx, axis=1), dy, axis=0)
    u = np.logical_or(ma, s).sum()
    return float(np.logical_and(ma, s).sum() / u) if u else 0.0


def fuss(m, b):
    """Breite der untersten Achtelhöhe im Verhältnis zur Boxbreite (zusammengestellte Füße = klein)."""
    return float(m[b['y1'] - b['h'] // 8:b['y1'] + 1].any(axis=0).sum() / b['b'])


def ganz(m, b):
    """Zusammenhängende Figur (größtes Teilstück >= 85 % der Fläche); Bruchstücke gelten als unbrauchbar."""
    lab, n = ndimage.label(m)
    if n <= 1:
        return True
    return float(np.bincount(lab.ravel())[1:].max() / b['flaeche']) >= 0.85


# Die Reihenfolge der KI-Sheets ist nicht garantiert, folgt aber meist diesem Muster
# (Idle, Idle, Sprung, Hocke, Stand, Treffer, Taumeln, Niedergestreckt). Es dient als Vorgabe, die die
# Bounding-Box-Prüfung bestätigen muss; was nicht besteht, wird geometrisch gesucht oder entfällt.
VORGABE = {'idle': (0, 1), 'luft': (2,), 'hocke': (3,), 'treffer': (5, 6), 'tod': (7,)}


def klassifiziere(pfad):
    ms = zellen(pfad)
    bs = [box(m) for m in ms]
    rollen = {}
    brauchbar = [i for i, b in enumerate(bs) if b and ganz(ms[i], b)]
    if len(brauchbar) < 5:
        return rollen
    rest = list(brauchbar)
    # Niedergestreckt: breiter als hoch und tief liegend.
    def ist_tod(i):
        return bs[i]['b'] > bs[i]['h'] * 1.1 and bs[i]['y0'] > GRUND - 150 and bs[i]['y1'] >= GRUND - 20
    tod = [i for i in rest if ist_tod(i)]
    if tod:
        t = VORGABE['tod'][0] if VORGABE['tod'][0] in tod else max(tod, key=lambda i: bs[i]['b'] / bs[i]['h'])
        rollen['tod'] = t
        rest.remove(t)
    # Stehen: Vorgabe-Paar, sonst die zwei ähnlichsten hohen Zellen mit Füßen am Boden.
    hmax = max(bs[i]['h'] for i in rest)

    def steht(i):
        return bs[i]['h'] >= 0.85 * hmax and bs[i]['y1'] >= GRUND - 6 and not ist_tod(i)

    def abstand(i, j):
        return 1 - iou(ms[i], bs[i], ms[j], bs[j])
    i, j = VORGABE['idle']
    if not (i in rest and j in rest and steht(i) and steht(j) and abstand(i, j) <= 0.5):
        hoch = [k for k in rest if steht(k)]
        paare = [(abstand(a, c), a, c) for x, a in enumerate(hoch) for c in hoch[x + 1:]]
        if not paare or min(paare)[0] > 0.4:
            return rollen
        _, i, j = min(paare)
    rollen['idle'] = [i, j]
    rest = [k for k in rest if k not in (i, j)]
    hi = (bs[i]['h'] + bs[j]['h']) / 2
    yi = (bs[i]['y1'] + bs[j]['y1']) / 2
    fi = (fuss(ms[i], bs[i]) + fuss(ms[j], bs[j])) / 2

    def anders(k, schwelle=0.25):
        return abstand(i, k) >= schwelle

    # Luft: Vorgabe (sichtbar anders als Stehen, nicht niedergestreckt) oder Füße gelöst/zusammengezogen.
    luft = [k for k in rest if VORGABE['luft'][0] == k and anders(k)]
    if not luft:
        luft = [k for k in rest if bs[k]['y1'] <= yi - 8 or fuss(ms[k], bs[k]) <= 0.62 * fi]
    if luft:
        k = luft[0] if len(luft) == 1 else min(luft, key=lambda k: fuss(ms[k], bs[k]) - (yi - bs[k]['y1']) / 100)
        rollen['luft'] = k
        rest.remove(k)
    # Hocke/Landung: Vorgabe-Zelle, wenn sie am Boden steht, sichtbar anders und nicht höher als Stehen ist;
    # sonst nur eine deutlich niedrigere Zelle (<= 80 % der Standhöhe).
    h0 = VORGABE['hocke'][0]
    if h0 in rest and bs[h0]['h'] <= 0.98 * hi and bs[h0]['y1'] >= yi - 8 and anders(h0, 0.3):
        k = h0
    else:
        hock = [k for k in rest if bs[k]['h'] <= 0.8 * hi and bs[k]['y1'] >= yi - 8 and anders(k)]
        k = min(hock, key=lambda k: bs[k]['h']) if hock else None
    if k is not None:
        rollen['hocke'] = k
        rest.remove(k)
    # Treffer/Taumeln: Vorgabe-Zellen, sonst der Rest mit der größten Abweichung vom Stand.
    cand = [k for k in VORGABE['treffer'] if k in rest and anders(k, 0.2)]
    if not cand:
        cand = sorted((k for k in rest if anders(k, 0.2)), key=lambda k: -abstand(i, k))
    if cand:
        rollen['treffer'] = cand[0]
    return rollen


def walk_frames(pfad):
    ms = zellen(pfad)
    bs = [box(m) for m in ms]
    ok = [b is not None and ganz(m, b) for m, b in zip(ms, bs)]
    ref = [b for b, o in zip(bs, ok) if o]
    if len(ref) < 4:
        return None, 0
    mh = float(np.median([b['h'] for b in ref]))
    mb = float(np.median([b['b'] for b in ref]))
    ma = float(np.median([b['flaeche'] for b in ref]))
    for i, b in enumerate(bs):
        if not ok[i]:
            continue
        if b['h'] < 0.75 * mh or b['h'] > 1.3 * mh or b['b'] < 0.45 * mb or b['flaeche'] < 0.5 * ma or b['y1'] < GRUND - 40:
            ok[i] = False
    if sum(ok) < 6:
        return None, sum(ok)
    reihe = list(range(8))
    for i in range(8):
        if ok[i]:
            continue
        for d in range(1, 8):
            n = (i - d) % 8
            if ok[n]:
                reihe[i] = n
                break
            n = (i + d) % 8
            if ok[n]:
                reihe[i] = n
                break
    return reihe, sum(ok)


def main():
    pfad = os.path.join(WURZEL, 'manifest.json')
    m = json.load(open(pfad, encoding='utf-8'))
    stat = {}
    for key, e in m['figuren'].items():
        r = klassifiziere(os.path.join(WURZEL, e['aktion']))
        g, n = walk_frames(os.path.join(WURZEL, e['walk']))
        e.pop('rollen', None); e.pop('gehen', None); e.pop('gehenOk', None)
        e['rollen'] = {k: v for k, v in sorted(r.items())}
        if g:
            e['gehen'] = g
            e['gehenOk'] = n
        for k in ('idle', 'hocke', 'luft', 'treffer', 'tod'):
            stat[k] = stat.get(k, 0) + (1 if k in r else 0)
    m['klassifikation'] = ('abgeleitet von scripts/sprite-sheets-klassifizieren.py (Alpha-Bounding-Boxen); '
                           'fehlende Rolle = prozedurale Animation')
    if "--pruefen" not in sys.argv:
        text = json.dumps(m, ensure_ascii=False, indent=1)
        # Zahlenlisten in eine Zeile (kleineres Manifest, lesbarer Diff).
        text = re.sub(r'\[\s*([\d,\s]+?)\s*\]', lambda mm: '[' + re.sub(r'\s+', '', mm.group(1)).replace(',', ', ') + ']', text)
        open(pfad, 'w', encoding='utf-8').write(text + '\n')
    print(len(m['figuren']), 'Figuren', stat)


if __name__ == '__main__':
    main()
