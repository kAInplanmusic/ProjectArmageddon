"""Kontaktbögen (hell und dunkel nebeneinander) der Seitensprites je Fraktion.

Aufruf:  python3 scripts/seitenansichten/kontaktbogen.py AUSGABEDIR
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

WURZEL = Path(__file__).resolve().parents[2]
SEITE = WURZEL / "src/client/assets/characters-side"
PORTRAET = WURZEL / "src/client/assets/characters"


def main() -> int:
    aus = Path(sys.argv[1])
    aus.mkdir(parents=True, exist_ok=True)
    for fr in sorted(p.name for p in PORTRAET.iterdir() if p.is_dir()):
        namen = sorted(p.name for p in (PORTRAET / fr).glob("*.png"))
        sh = Image.new("RGB", (6 * 256, 3 * 256))
        d = ImageDraw.Draw(sh)
        for i, n in enumerate(namen):
            for k, hg in enumerate([(235, 235, 235), (30, 30, 36)]):
                x, y = k * 3 * 256 + (i % 3) * 256, (i // 3) * 256
                d.rectangle([x, y, x + 255, y + 255], fill=hg)
                f = SEITE / fr / n
                if f.exists():
                    im = Image.open(f).convert("RGBA")
                    sh.paste(im, (x, y), im)
                else:
                    d.text((x + 8, y + 120), "FALLBACK", fill=(200, 0, 0))
                d.text((x + 4, y + 4), n[:24], fill=(255, 0, 0) if k == 0 else (255, 255, 0))
        sh.save(aus / f"seite_{fr}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
