"""Emotionsposen aus einem 3-D-Modell (Pilot N-03, 2026-11-03) für Figuren, bei denen die Bild-KI die Art verliert.

1. GLB aus dem Seitenbild mit einem kostenlosen Hugging-Face-Space erzeugen, z. B. per gradio_client:
   trellis-community/TRELLIS, /preprocess_image, dann /generate_and_extract_glb (Seed 0, 7.5/12, 3.0/12,
   'stochastic', mesh_simplify 0.95, Textur 1024). Hunyuan3D-2 und stable-fast-3d lieferten am 2026-11-03 nur Fehler.
2. Rendern (Software-Rasterung mit z-Puffer und UV-Textur, braucht `pip install trimesh`):
     NEIGUNG=20 python3 scripts/sprites-erzeugen/emotion-3d.py <modell.glb> <ausordner> <yaw_grad> <schwelle>
   shinobi/11_rauch-meister-genzi: yaw 30, Neigung 20, Schwelle 0.45 (Dreiviertelansicht wie das Seitenbild).
   Schreibt <zelle>_<pose>.png (256 px, Boden bei y=240) für alle acht EMOTIONEN.
3. Zellen ins Emotions-Sheet setzen, `emotion-pruefen.py` (SICHTPRUEFUNG) laufen lassen.
Pose: Gesamtkippen/-hub/-stauchen plus Verformung des oberen Teils (Kopf/Turm) oberhalb `schwelle` x Höhe."""
import math
import os
import sys

import numpy as np
import trimesh
from PIL import Image

G = 256          # Zelle
SS = 3           # Ueberabtastung


def lade(pfad):
    sc = trimesh.load(pfad)
    m = sc.to_geometry() if hasattr(sc, 'to_geometry') else (sc.dump(concatenate=True) if hasattr(sc, 'dump') else sc)
    global TEX, UV
    TEX = np.asarray(m.visual.material.baseColorTexture.convert('RGB'), float)
    UV = np.asarray(m.visual.uv, float)
    farben = np.zeros((len(m.vertices), 3))
    return np.asarray(m.vertices, float), np.asarray(m.faces), farben


def rastern(px, py, z, f, hell, n):
    """z-Puffer-Rasterung mit UV-Texturabtastung; n = Kantenlaenge des Bilds."""
    bild = np.zeros((n, n, 4))
    zb = np.full((n, n), -1e9)
    th, tw = TEX.shape[:2]
    for i in range(len(f)):
        a, b, c = f[i]
        xs, ys = np.array([px[a], px[b], px[c]]), np.array([py[a], py[b], py[c]])
        x0, x1 = max(int(xs.min()), 0), min(int(xs.max()) + 1, n - 1)
        y0, y1 = max(int(ys.min()), 0), min(int(ys.max()) + 1, n - 1)
        if x1 < x0 or y1 < y0:
            continue
        det = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(det) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / det
        l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / det
        l2 = 1 - l0 - l1
        inn = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not inn.any():
            continue
        zz = l0 * z[a] + l1 * z[b] + l2 * z[c]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        ok = inn & (zz > sub)
        if not ok.any():
            continue
        u = l0 * UV[a, 0] + l1 * UV[b, 0] + l2 * UV[c, 0]
        w = l0 * UV[a, 1] + l1 * UV[b, 1] + l2 * UV[c, 1]
        tx = np.clip((u % 1) * (tw - 1), 0, tw - 1).astype(int)
        ty = np.clip((1 - w % 1) * (th - 1), 0, th - 1).astype(int)
        farbe = TEX[ty, tx] * hell[i]
        sub[ok] = zz[ok]
        ziel = bild[y0:y1 + 1, x0:x1 + 1]
        ziel[ok, :3] = farbe[ok]
        ziel[ok, 3] = 255
    return Image.fromarray(np.clip(bild, 0, 255).astype(np.uint8), 'RGBA')


def rot(achse, w):
    c, s = math.cos(w), math.sin(w)
    if achse == 'x':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if achse == 'y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def render(v, f, col, yaw, pose, skala=None, mitte=None):
    v = v - v.mean(0)
    v = v @ rot('y', math.radians(yaw)).T          # Modell so drehen, dass die Seitenansicht vorn liegt
    v = v @ rot('x', math.radians(float(os.environ.get('NEIGUNG', '0')))).T
    y0, y1 = v[:, 1].min(), v[:, 1].max()
    h = y1 - y0
    # oberer Teil (Kopf/Turm): Gewicht weich ab Schwelle
    oben = np.clip((v[:, 1] - (y0 + pose.get('schwelle', 0.55) * h)) / (0.1 * h), 0, 1)[:, None]
    if pose.get('kopfNicken'):                       # Drehung um z (Bildebene): positiv = Blick hoch (Gesicht nach rechts)
        piv = np.array([v[:, 0].mean(), y0 + pose.get('schwelle', 0.55) * h, 0])
        vr = (v - piv) @ rot('z', math.radians(pose['kopfNicken'])).T + piv
        v = v * (1 - oben) + vr * oben
    if pose.get('kopfDreh'):                         # oberer Teil um die Hochachse (Waffenwechsel: Turm schwenkt)
        piv = np.array([v[:, 0].mean(), 0, v[:, 2].mean()])
        vr = (v - piv) @ rot('y', math.radians(pose['kopfDreh'])).T + piv
        v = v * (1 - oben) + vr * oben
    if pose.get('kopfHub'):                          # oberer Teil angehoben (Schulterzucken)
        v = v + oben * np.array([0, pose['kopfHub'] * h, 0])
    if pose.get('stauchen'):
        v = v * np.array([1 + pose['stauchen'] * 0.5, 1 - pose['stauchen'], 1])
    if pose.get('kippen'):                           # ganze Figur um die Hinterkante kippen
        piv = np.array([v[:, 0].min(), v[:, 1].min(), 0])
        v = (v - piv) @ rot('z', math.radians(pose['kippen'])).T + piv
    v = v + np.array([pose.get('dx', 0), pose.get('hub', 0) * h, 0])
    # Projektion orthographisch: x nach rechts, y nach oben, z zur Kamera
    if skala is None:
        skala = 0.82 * G / max(np.ptp(v[:, 0]), np.ptp(v[:, 1]))
        mitte = v[:, 0].mean()
    px = (v[:, 0] - mitte) * skala * SS + G * SS / 2
    py = (G - 16) * SS - (v[:, 1] - y0 + 0.0) * skala * SS
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    licht = np.array([-0.3, 0.6, 0.75]); licht /= np.linalg.norm(licht)
    hell = 0.8 + 0.25 * np.abs(n @ licht)
    im = rastern(px, py, v[:, 2], f, hell, G * SS)
    return im.resize((G, G), Image.LANCZOS), skala, mitte


POSEN = {
    0: ('angst', {'kippen': 8, 'stauchen': 0.07, 'dx': -0.04}),
    1: ('blinzeln', {'stauchen': 0.02, 'lampeAus': True}),
    2: ('schulterzucken', {'kopfHub': 0.06}),
    3: ('jubel', {'kippen': 14, 'hub': 0.08}),
    4: ('zittern', {'stauchen': 0.09, 'kippen': -5}),
    5: ('blickHoch', {'kopfNicken': 22}),
    6: ('blickRunter', {'kopfNicken': -18}),
    7: ('waffenwechsel', {'kopfDreh': -12, 'kopfHub': 0.03}),
}


def lampe_aus(im):
    """Blinzeln: das helle gelbe Scheinwerfer-Auge abdunkeln."""
    a = np.asarray(im).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gelb = (r > 180) & (r - b > 35) & (a[..., 3] > 0)
    a[gelb, :3] *= 0.35
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

if __name__ == '__main__':
    v, f, col = lade(sys.argv[1])
    yaw = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    schwelle = float(sys.argv[4]) if len(sys.argv) > 4 else 0.55
    os.makedirs(sys.argv[2], exist_ok=True)
    _, sk, mi = render(v, f, col, yaw, {})
    for z, (name, p) in POSEN.items():
        p = dict(p, schwelle=schwelle)
        im, _, _ = render(v, f, col, yaw, p, sk, mi)
        if p.get('lampeAus'):
            im = lampe_aus(im)
        im.save(os.path.join(sys.argv[2], f'{z}_{name}.png'))
    print(len(f), 'Dreiecke')
