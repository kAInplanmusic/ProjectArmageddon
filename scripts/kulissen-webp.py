#!/usr/bin/env python3
"""
Kulissen-JPG -> WebP, mit Qualitätsbeleg (BLD-1 / BUILD-1).

Wandelt jede Kulisse unter `src/client/assets/backdrops/` (Basis und `stimmung/`) in
WebP um und misst dabei für jedes Bild die strukturelle Ähnlichkeit (SSIM, Gauß-Fenster
11x11, sigma 1,5, auf der Helligkeit Y nach BT.601) und den PSNR gegen das dekodierte
JPG. Bezugsbild ist das JPG, wie es bis dahin ausgeliefert wurde: Gemessen wird also
nur, was der Formatwechsel zusätzlich verändert.

Aufruf:
  python3 scripts/kulissen-webp.py --messen  [--q 82]   nur messen, nichts schreiben
  python3 scripts/kulissen-webp.py --schreiben [--q 82] WebP schreiben, JPG löschen
  python3 scripts/kulissen-webp.py --sweep              Qualitätsstufen vergleichen

  Mit `--ordner` gilt derselbe Messweg für andere JPG-Bestände, z. B. den Rest der
  Stofftexturen: `--ordner src/client/assets/stoff-texturen-neu`.

Das Ergebnis der Messung steht in `docs/ladezeit.md` (Abschnitt Kulissen).
`--schreiben` braucht die JPG-Originale; nach dem Lauf liegen nur noch WebP im Baum.
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

WURZEL = Path(__file__).resolve().parent.parent
ORDNER = WURZEL / "src/client/assets/backdrops"
# method 6 = langsamste, beste Kompression von libwebp; nur beim Umwandeln teuer.
WEBP_METHODE = 6
# Gewählt nach dem Vergleich q70..q90 (docs/ladezeit.md): q82 spart ~30 % bei SSIM-Mittel >= 0,97.
WEBP_QUALITAET = 82


def helligkeit(bild: Image.Image) -> np.ndarray:
    a = np.asarray(bild.convert("RGB"), dtype=np.float64)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def ssim(x: np.ndarray, y: np.ndarray) -> float:
    """SSIM nach Wang et al. 2004 (Gauß 11x11, sigma 1,5, K1 0,01, K2 0,03, L 255)."""
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    f = {"sigma": 1.5, "truncate": 3.5}
    mx, my = gaussian_filter(x, **f), gaussian_filter(y, **f)
    sxx = gaussian_filter(x * x, **f) - mx * mx
    syy = gaussian_filter(y * y, **f) - my * my
    sxy = gaussian_filter(x * y, **f) - mx * my
    karte = ((2 * mx * my + c1) * (2 * sxy + c2)) / ((mx * mx + my * my + c1) * (sxx + syy + c2))
    return float(karte[5:-5, 5:-5].mean())


def psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGB"), dtype=np.float64)
    y = np.asarray(b.convert("RGB"), dtype=np.float64)
    mse = float(((x - y) ** 2).mean())
    return 99.0 if mse == 0 else 10 * np.log10(255 * 255 / mse)


def webp_bytes(bild: Image.Image, q: int) -> bytes:
    puffer = io.BytesIO()
    bild.save(puffer, "WEBP", quality=q, method=WEBP_METHODE)
    return puffer.getvalue()


def dateien() -> list[Path]:
    liste = sorted(ORDNER.glob("*.jpg"))
    unterordner = ORDNER / "stimmung"
    if unterordner.is_dir():
        liste += sorted(unterordner.glob("*.jpg"))
    return liste


def messe(q: int, schreiben: bool) -> int:
    liste = dateien()
    if not liste:
        print("keine JPG unter", ORDNER, file=sys.stderr)
        return 1
    gruppen: dict[str, dict] = {}
    for pfad in liste:
        gruppe = "stimmung" if pfad.parent.name == "stimmung" else "basis"
        g = gruppen.setdefault(gruppe, {"n": 0, "jpg": 0, "webp": 0, "ssim": [], "psnr": []})
        roh = pfad.read_bytes()
        original = Image.open(io.BytesIO(roh))
        original.load()
        daten = webp_bytes(original, q)
        neu = Image.open(io.BytesIO(daten))
        neu.load()
        s = ssim(helligkeit(original), helligkeit(neu))
        g["n"] += 1
        g["jpg"] += len(roh)
        g["webp"] += len(daten)
        g["ssim"].append((s, pfad.name))
        g["psnr"].append(psnr(original, neu))
        if schreiben:
            pfad.with_suffix(".webp").write_bytes(daten)
            pfad.unlink()
    for name, g in gruppen.items():
        werte = [w for w, _ in g["ssim"]]
        schlecht = min(g["ssim"])
        print(
            f"{name:9s} n={g['n']:3d}  JPG {g['jpg'] / 1e6:6.2f} MB  WebP q{q} {g['webp'] / 1e6:6.2f} MB "
            f"({(g['webp'] / g['jpg'] - 1) * 100:+.1f} %)  SSIM mittel {np.mean(werte):.4f} "
            f"min {schlecht[0]:.4f} ({schlecht[1]})  PSNR mittel {np.mean(g['psnr']):.1f} dB "
            f"min {min(g['psnr']):.1f} dB"
        )
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--q", type=int, default=WEBP_QUALITAET)
    p.add_argument("--ordner", default=None,
                   help="JPG-Ordner relativ zum Repo (Standard: src/client/assets/backdrops)")
    modus = p.add_mutually_exclusive_group(required=True)
    modus.add_argument("--messen", action="store_true")
    modus.add_argument("--schreiben", action="store_true")
    modus.add_argument("--sweep", action="store_true")
    a = p.parse_args()
    if a.ordner:
        global ORDNER
        ORDNER = WURZEL / a.ordner
    if a.sweep:
        for q in (70, 75, 80, 85, 90):
            messe(q, False)
        return 0
    return messe(a.q, a.schreiben)


if __name__ == "__main__":
    sys.exit(main())
