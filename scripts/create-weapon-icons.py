#!/usr/bin/env python3
"""
Erzeugt 64x64-Icons mit transparentem Hintergrund aus den Waffen-Logos.

Portabler Ersatz für scripts/create_weapon_icons.sh (ImageMagick). Nutzt
Pillow, das auf diesem System verfügbar ist, während `magick`/`convert` fehlt.

Aufruf:
  python3 scripts/create-weapon-icons.py [--source=DIR] [--dest=DIR]
                                         [--force] [--fuzz=N] [--size=N]

Ohne --force werden nur fehlende Icons erzeugt; bestehende bleiben unangetastet,
damit ein Lauf nicht versehentlich alle vorhandenen Dateien überschreibt.
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("Fehler: Pillow ist nicht installiert (pip install Pillow)", file=sys.stderr)
    sys.exit(2)


def background_color(image):
    """Hintergrundfarbe aus dem Pixel oben links ableiten."""
    return image.convert("RGBA").getpixel((0, 0))


def make_transparent(image, background, fuzz):
    """
    Macht Pixel transparent, die dem Hintergrund ähneln.

    `fuzz` ist ein Anteil (0..1] der maximalen Distanz im RGB-Raum — analog zur
    -fuzz-Option von ImageMagick.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    bg_r, bg_g, bg_b = background[0], background[1], background[2]
    limit = fuzz * 255 * 3

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Alpha bereits transparent lassen.
            if a == 0:
                continue
            distance = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
            if distance <= limit:
                pixels[x, y] = (r, g, b, 0)
    return image


def cover_resize(image, size):
    """Skaliert auf `size`x`size` und schneidet mittig zu (wie -resize ^ -extent)."""
    width, height = image.size
    if width == 0 or height == 0:
        raise ValueError("Bild hat keine Fläche")

    # "cover": der kleinere Faktor bestimmt die Skalierung.
    factor = max(size / width, size / height)
    new_size = (max(1, int(round(width * factor))), max(1, int(round(height * factor))))
    resized = image.resize(new_size, Image.LANCZOS)

    # Mittig auf das Zielformat zuschneiden.
    left = (resized.width - size) // 2
    top = (resized.height - size) // 2
    return resized.crop((left, top, left + size, top + size))


def main():
    parser = argparse.ArgumentParser(description="Waffen-Icons erzeugen")
    parser.add_argument("--source", default="assets/weapons/icons",
                        help="Verzeichnis mit den Original-Logos")
    parser.add_argument("--dest", default="src/client/assets/icons",
                        help="Zielverzeichnis für die Icons")
    parser.add_argument("--force", action="store_true",
                        help="Bestehende Icons überschreiben")
    parser.add_argument("--fuzz", type=float, default=0.10,
                        help="Toleranz für die Hintergrundentfernung (Standard 0.10)")
    parser.add_argument("--size", type=int, default=64, help="Kantenlänge in Pixeln")
    args = parser.parse_args()

    if not os.path.isdir(args.source):
        print(f"Fehler: Quellverzeichnis '{args.source}' existiert nicht.", file=sys.stderr)
        return 2

    os.makedirs(args.dest, exist_ok=True)

    sources = sorted(
        name for name in os.listdir(args.source)
        if os.path.splitext(name)[1].lower() == ".png"
    )
    if not sources:
        print(f"Fehler: keine PNG-Dateien in '{args.source}'.", file=sys.stderr)
        return 2

    created = 0
    skipped = 0
    failed = 0

    for name in sources:
        stem = os.path.splitext(name)[0]
        target = os.path.join(args.dest, f"{stem}_icon.png")

        if os.path.exists(target) and not args.force:
            skipped += 1
            continue

        try:
            with Image.open(os.path.join(args.source, name)) as image:
                background = background_color(image)
                transparent = make_transparent(image, background, args.fuzz)
                icon = cover_resize(transparent, args.size)
                icon.save(target, "PNG")
            created += 1
            print(f"  erzeugt → {target} (Hintergrund {background[:3]})")
        except Exception as error:  # noqa: BLE001 - Einzelfehler soll den Lauf nicht stoppen
            failed += 1
            print(f"  FEHLER bei {name}: {error}", file=sys.stderr)

    print(f"Fertig: {created} erzeugt, {skipped} übersprungen, {failed} fehlgeschlagen.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
