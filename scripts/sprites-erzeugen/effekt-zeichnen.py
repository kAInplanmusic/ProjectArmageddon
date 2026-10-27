#!/usr/bin/env python3
"""Zeichnet Cartoon-Effekt-Sheets (Rauchring, Feuerball, Pilzwolke, blaue Flamme, Mündungsfeuer) prozedural.

Eigene Zeichnung im Stil der Vorlagen des Auftraggebers, kein Bild daraus kopiert. Zellen 256 px, transparenter Grund,
Seed-fest (random.Random). Aufruf: python3 scripts/sprites-erzeugen/effekt-zeichnen.py src/client/assets/effekt-sheets
Ausgabe: <ziel>/<name>.webp (rauchring 5×2, feuerball 5×2, pilzwolke 5×2, flamme 8×2, muendung 4×5).
"""
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

Z = 256
SS = 3  # Supersampling


def neu():
    return Image.new('RGBA', (Z * SS, Z * SS), (0, 0, 0, 0))



def lobenmaske(lobes, versatz=(0, 0)):
    m = Image.new('L', (Z * SS, Z * SS), 0)
    d = ImageDraw.Draw(m)
    for (x, y, r) in lobes:
        x += versatz[0]
        y += versatz[1]
        d.ellipse(((x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS), fill=255)
    return m


def faerbe(img, maske, farbe):
    img.paste(Image.new('RGBA', img.size, tuple(int(v) for v in farbe)), (0, 0), maske)


def wolke(img, lobes, farben, kontur=(30, 24, 40, 255), dicke=2.2):
    """Wolke aus Kreisen: Kontur, Grundton, aufgehellte Oberseite (Maske nach oben links verschoben und verschnitten)."""
    m = lobenmaske(lobes)
    rand = m.filter(ImageFilter.MaxFilter(int(dicke * SS) * 2 + 1))
    faerbe(img, rand, kontur)
    faerbe(img, m, farben[0])
    if len(farben) > 1:
        for i, f in enumerate(farben[1:], 1):
            s = i * 5
            innen = lobenmaske([(x, y, r * (1 - 0.1 * i)) for x, y, r in lobes], (-s * 0.7, -s))
            from PIL import ImageChops
            faerbe(img, ImageChops.multiply(innen, m), f)


def kranz(cx, cy, R, n, r, rng, jitter=0.18):
    return [(cx + math.cos(2 * math.pi * k / n + rng.uniform(-jitter, jitter)) * R * rng.uniform(0.92, 1.08),
             cy + math.sin(2 * math.pi * k / n + rng.uniform(-jitter, jitter)) * R * rng.uniform(0.92, 1.08),
             r * rng.uniform(0.75, 1.2)) for k in range(n)]


def haufen(cx, cy, R, n, r, rng):
    out = [(cx, cy, r * 1.3)]
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.3, 1.0)
        out.append((cx + math.cos(a) * d, cy + math.sin(a) * d * 0.9, r * rng.uniform(0.7, 1.2)))
    return out


RAUCH = [(222, 232, 245, 255), (245, 249, 255, 255), (255, 255, 255, 255)]
RAUCH_DUNKEL = [(70, 66, 80, 255), (96, 92, 108, 255)]


def rauchring(i, n=9):
    rng = random.Random(100 + i)
    img = neu()
    c = Z / 2 * SS / SS
    t = i / (n - 1)
    if i < 3:
        R = 30 + i * 22
        wolke(img, haufen(c, c, R * 0.6, 6 + i * 2, 24 + i * 14, rng), RAUCH)
    elif i < 6:
        R = 62 + (i - 3) * 14
        wolke(img, kranz(c, c, R, 11, 30 - (i - 3) * 2, rng) + haufen(c, c, 14, 2, 20 - (i - 3) * 6, rng)[: max(0, 3 - (i - 3))], RAUCH)
    else:
        R = 96 + (i - 6) * 8
        k = 7 - (i - 6) * 2
        lobes = [l for j, l in enumerate(kranz(c, c, R, 11, 22 - (i - 6) * 6, rng, 0.35)) if j % 2 == 0 or i == 6][: max(3, k + 3)]
        wolke(img, lobes, RAUCH)
    return img


FEUER = [(150, 40, 20, 255), (232, 96, 28, 255), (255, 170, 40, 255), (255, 226, 120, 255), (255, 250, 220, 255)]


def stern(img, cx, cy, r, spitzen, rng, farbe):
    d = ImageDraw.Draw(img)
    pts = []
    for k in range(spitzen * 2):
        a = math.pi * k / spitzen + rng.uniform(-0.08, 0.08)
        rr = r * (1.0 if k % 2 == 0 else 0.38) * rng.uniform(0.8, 1.15)
        pts.append(((cx + math.cos(a) * rr) * SS, (cy + math.sin(a) * rr) * SS))
    d.polygon(pts, fill=farbe)


def feuerball(i, n=10):
    rng = random.Random(200 + i)
    img = neu()
    c = Z / 2
    if i == 0:
        stern(img, c, c, 40, 9, rng, (255, 150, 40, 255))
        stern(img, c, c, 22, 8, rng, (255, 235, 150, 255))
        return img
    t = min(1.0, i / 6)
    R = 50 + 70 * t
    if i <= 5:
        lobes = haufen(c, c, R * 0.7, 11 + i, 34 + 20 * t, rng)
        for (cx2, cy2, r2), f in zip([(c, c, 0), ], [0]):
            pass
        m = lobenmaske(lobes)
        faerbe(img, m.filter(ImageFilter.MaxFilter(2 * SS * 2 + 1)), (60, 20, 14, 255))
        faerbe(img, m, FEUER[1])
        for j, f in enumerate(FEUER[2:], 1):
            innen = lobenmaske([(x, y, r * (1 - 0.2 * j)) for x, y, r in lobes], (-3 * j, -4 * j))
            from PIL import ImageChops
            faerbe(img, ImageChops.multiply(innen, m), f)
        if i < 4:
            stern(img, c, c, 100 + 6 * i, 9, rng, (255, 200, 80, 255))
    else:
        f = (i - 5) / (n - 6)
        R2 = 90 + 22 * f
        lobes = [l for k, l in enumerate(kranz(c, c, R2, 12, 34 * (1 - 0.45 * f), rng, 0.3)) if k % 3 != 2 or f < 0.4]
        m = lobenmaske(lobes)
        a = int(255 * (1 - f * 0.8))
        faerbe(img, m.filter(ImageFilter.MaxFilter(5 * SS // 2 * 2 + 1)), (40, 14, 12, a))
        faerbe(img, m, (150 - 40 * f, 52 - 14 * f, 24, a))
        for _ in range(int(14 * (1 - f))):
            ax = rng.uniform(0, 2 * math.pi)
            dd = R2 * rng.uniform(0.6, 1.2)
            ImageDraw.Draw(img).ellipse(((c + math.cos(ax) * dd - 3) * SS, (c + math.sin(ax) * dd - 3) * SS, (c + math.cos(ax) * dd + 3) * SS, (c + math.sin(ax) * dd + 3) * SS), fill=(255, 170, 60, a))
    return img


def pilz(i, n=9):
    rng = random.Random(300 + i)
    img = neu()
    c = Z / 2
    boden = 226
    d = ImageDraw.Draw(img)
    t = i / (n - 1)
    if i == 0:
        stern(img, c, boden - 20, 24, 8, rng, (255, 170, 50, 255))
        return img
    hoehe = min(150, 28 + i * 24) if i < 5 else 150
    kappe_y = boden - hoehe
    kr = min(80, 24 + i * 14)
    if i >= 2:
        # Stiel
        sb = 14 + 6 * min(1, i / 4)
        m = Image.new('L', img.size, 0)
        ImageDraw.Draw(m).polygon([((c - sb) * SS, boden * SS), ((c - 5) * SS, (kappe_y + 20) * SS), ((c + 5) * SS, (kappe_y + 20) * SS), ((c + sb) * SS, boden * SS)], fill=255)
        farbe = FEUER[2] if i < 6 else (214, 196, 160, 255)
        faerbe(img, m.filter(ImageFilter.MaxFilter(2 * SS * 2 + 1)), (60, 36, 20, 255))
        faerbe(img, m, farbe)
    # Kappe
    if i < 6:
        lobes = [(c + math.cos(a) * kr * 0.9, kappe_y + math.sin(a) * kr * 0.45, kr * 0.36) for a in [k * 2 * math.pi / 8 for k in range(8)]] + [(c, kappe_y - 6, kr * 0.62)]
        wolke(img, lobes, [FEUER[1], FEUER[2], FEUER[3], FEUER[4]], kontur=(70, 30, 16, 255))
    else:
        lobes = [(c + math.cos(a) * 52, kappe_y + 30 + math.sin(a) * 14, 14) for a in [k * 2 * math.pi / 8 for k in range(8)]]
        wolke(img, lobes, [(190, 170, 140, 255), (220, 204, 172, 255)], kontur=(70, 56, 40, 255))
    # Ringe
    if 4 <= i <= 7:
        d.ellipse(((c - 62) * SS, (kappe_y + 46) * SS, (c + 62) * SS, (kappe_y + 62) * SS), outline=(255, 190, 70, 255) if i < 6 else (200, 180, 140, 255), width=3 * SS)
    # Sockelrauch
    if i >= 2:
        sock = [(c + (k - 3) * 26 + rng.uniform(-6, 6), boden + rng.uniform(-4, 6), 20 + rng.uniform(-4, 8) + (4 if i > 5 else 0)) for k in range(7)]
        wolke(img, sock, [(206, 190, 154, 255), (232, 220, 190, 255)], kontur=(80, 64, 46, 255))
    return img


def flamme(i, n=16, farbe='blau'):
    rng = random.Random(400 + i)
    img = neu()
    c = Z / 2
    t = i / (n - 1)
    breit = 40 + 22 * math.sin(t * math.pi) + 8 * math.sin(i * 1.7)
    hoch = 120 + 70 * min(1, t * 2.0) + rng.uniform(-8, 8)
    farben = {'blau': [(20, 90, 170, 255), (40, 170, 235, 255), (150, 235, 255, 255), (235, 255, 255, 255)],
              'rot': [(170, 30, 20, 255), (240, 90, 30, 255), (255, 180, 50, 255), (255, 240, 170, 255)]}[farbe]
    for s, f in zip([1.0, 0.74, 0.46, 0.24], farben):
        m = Image.new('L', img.size, 0)
        dm = ImageDraw.Draw(m)
        pts = []
        steps = 28
        sway = math.sin(i * 0.9 + t * 3) * 14
        for k in range(steps + 1):
            u = k / steps
            y = 232 - hoch * s * u
            w = breit * s * math.sin(math.pi * min(1, u ** 0.6 * 0.95 + 0.04)) ** 0.9 * (1 - u * 0.35)
            x = c + sway * u ** 2 * s
            pts.append((x - w / 2, y))
        for k in range(steps, -1, -1):
            u = k / steps
            y = 232 - hoch * s * u
            w = breit * s * math.sin(math.pi * min(1, u ** 0.6 * 0.95 + 0.04)) ** 0.9 * (1 - u * 0.35)
            x = c + sway * u ** 2 * s
            pts.append((x + w / 2, y))
        dm.polygon([(x * SS, y * SS) for x, y in pts], fill=255)
        if s == 1.0:
            glow = m.filter(ImageFilter.GaussianBlur(14 * SS))
            faerbe(img, glow, (farben[1][0], farben[1][1], farben[1][2], 110))
        faerbe(img, m, f)
    return img


def muendung(zeile, spalte):
    rng = random.Random(500 + zeile * 10 + spalte)
    img = neu()
    x0 = 30
    cy = Z / 2
    t = spalte / 3
    d = ImageDraw.Draw(img)
    if spalte == 0:
        l = rng.uniform(90, 130)
        spitzen = 5 + zeile
        pts = [(x0, cy)]
        for k in range(spitzen):
            a = (k / (spitzen - 1) - 0.5) * 1.3
            rr = l * rng.uniform(0.55, 1.0) * (1 - abs(a) * 0.5)
            pts.append((x0 + math.cos(a) * rr, cy + math.sin(a) * rr))
            if k < spitzen - 1:
                a2 = ((k + 0.5) / (spitzen - 1) - 0.5) * 1.3
                pts.append((x0 + math.cos(a2) * rr * 0.4, cy + math.sin(a2) * rr * 0.4))
        pts.append((x0, cy))
        d.polygon([(x * SS, y * SS) for x, y in pts], fill=(255, 140, 40, 255))
        d.polygon([(x0 * SS, cy * SS), ((x0 + l * 0.7) * SS, (cy - 8) * SS), ((x0 + l * 0.7) * SS, (cy + 8) * SS)], fill=(255, 230, 130, 255))
    else:
        if spalte <= 2:
            l = 70 + 30 * spalte
            d.polygon([((x0 + 6 * spalte) * SS, cy * SS), ((x0 + l) * SS, (cy - 7 + spalte * 2) * SS), ((x0 + l) * SS, (cy + 7 - spalte * 2) * SS)], fill=(255, 150, 50, 255))
        n = 4 + (3 - spalte) + (2 if spalte == 1 else 0)
        lobes = haufen(x0 + 100 + spalte * 20, cy, 34 + 12 * spalte, n, 20 + 8 * spalte - (spalte == 3) * 8, rng)
        wolke(img, lobes, [(176, 104, 36, 255), (200, 130, 52, 255)], kontur=(96, 54, 20, 255))
        if spalte == 3:
            pass
    return img


def sheet(name, spalten, zeilen, frame):
    out = Image.new('RGBA', (Z * spalten, Z * zeilen), (0, 0, 0, 0))
    for r in range(zeilen):
        for s in range(spalten):
            im = frame(r, s)
            if im is None:
                continue
            out.alpha_composite(im.resize((Z, Z), Image.LANCZOS), (s * Z, r * Z))
    return out


if __name__ == '__main__':
    ziel = sys.argv[1]
    sheets = {
        'rauchring': (5, 2, lambda r, s: rauchring(r * 5 + s) if r * 5 + s < 9 else None),
        'feuerball': (5, 2, lambda r, s: feuerball(r * 5 + s)),
        'pilzwolke': (5, 2, lambda r, s: pilz(r * 5 + s) if r * 5 + s < 9 else None),
        'flamme': (8, 2, lambda r, s: flamme(r * 8 + s)),
        'muendung': (4, 5, muendung),
    }
    for name, (sp, ze, fn) in sheets.items():
        bild = sheet(name, sp, ze, fn)
        bild.save(f'{ziel}/{name}.webp', 'WEBP', quality=88, method=6)
        print(name, bild.size)
