"""Prüfbögen Porträt | Seitenansicht (Stufe 2).

Aufruf:  python3 scripts/seitenansichten/paarbogen.py AUSGABEDIR [Fraktion ...] [--je N]

Je Zeile zwei Paare (links Porträt auf Weiß, rechts die aktuelle Seitenansicht
auf Mittelgrau mit Grundlinie y=240); Dateien `paar_<fraktion>_<n>.png`.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

WURZEL = Path(__file__).resolve().parents[2]
SEITE = WURZEL / "src/client/assets/characters-side"
PORTRAET = WURZEL / "src/client/assets/characters"


def paar(fr: str, n: str) -> Image.Image:
    z = Image.new("RGB", (512, 256), (255, 255, 255))
    p = Image.open(PORTRAET / fr / n).convert("RGBA")
    z.paste(p, (0, 0), p)
    d = ImageDraw.Draw(z)
    d.rectangle([256, 0, 511, 255], fill=(190, 190, 196))
    d.line([256, 240, 511, 240], fill=(255, 0, 255))
    f = SEITE / fr / n
    if f.exists():
        s = Image.open(f).convert("RGBA")
        z.paste(s, (256, 0), s)
    else:
        d.text((300, 120), "KEIN SPRITE", fill=(200, 0, 0))
    d.text((4, 4), f"{fr}/{n[:-4]}", fill=(255, 0, 0))
    return z


def main() -> int:
    a = sys.argv[1:]
    je = 8
    if "--je" in a:
        i = a.index("--je"); je = int(a[i + 1]); del a[i:i + 2]
    aus = Path(a[0]); aus.mkdir(parents=True, exist_ok=True)
    frs = a[1:] or sorted(p.name for p in PORTRAET.iterdir() if p.is_dir())
    for fr in frs:
        namen = sorted(p.name for p in (PORTRAET / fr).glob("*.png"))
        for k in range(0, len(namen), je):
            grp = namen[k:k + je]
            sh = Image.new("RGB", (1024, 256 * ((len(grp) + 1) // 2)), (255, 255, 255))
            for i, n in enumerate(grp):
                sh.paste(paar(fr, n), ((i % 2) * 512, (i // 2) * 256))
            sh.save(aus / f"paar_{fr}_{k // je}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
