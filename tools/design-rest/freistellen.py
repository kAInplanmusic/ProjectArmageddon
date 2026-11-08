#!/usr/bin/env python3
"""Freistellen und gemeinsame Normalisierung von acht Walk-Frames.

Optionaler Schritt; benötigt rembg + Pillow in einer eigenen Umgebung:
  PYTHONPATH= ~/.venvs/rembg312/bin/python tools/design-rest/freistellen.py <figuren-id> <run-verzeichnis> <zielverzeichnis>
"""
import json
import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
CHARACTERS = json.loads((ROOT / "tools/design-rest/characters.json").read_text())


def frame_paths(run_dir: Path, character_id: str):
    paths = []
    for frame in range(8):
        matches = sorted(run_dir.glob(f"{character_id}-walk-{frame}-*.png"))
        if len(matches) != 1:
            raise SystemExit(f"Frame {frame}: erwartet 1 Datei, gefunden {len(matches)}")
        paths.append(matches[0])
    return paths


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Aufruf: freistellen.py <figuren-id> <run-verzeichnis> <zielverzeichnis>")
    character_id, run_dir, out_dir = sys.argv[1], Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    session = new_session("u2net")
    cutouts, boxes = [], []
    for path in frame_paths(run_dir, character_id):
        image = Image.open(path).convert("RGBA")
        cut = remove(image, session=session)
        box = cut.getchannel("A").getbbox()
        if not box:
            raise SystemExit(f"Leere Freistellung: {path}")
        cutouts.append(cut)
        boxes.append(box)
    max_height = max(b[3] - b[1] for b in boxes)
    max_width = max(b[2] - b[0] for b in boxes)
    scale = min(1.0, 900 / max_height, 900 / max_width)
    centers = sorted((b[0] + b[2]) / 2 for b in boxes)
    median_cx = centers[len(centers) // 2]
    dx = round(512 - scale * median_cx)
    for frame, (cut, box) in enumerate(zip(cutouts, boxes)):
        size = (round(1024 * scale), round(1024 * scale))
        scaled = cut.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        dy = round(960 - scale * box[3])
        canvas.alpha_composite(scaled, (dx, dy))
        # Breite dunkle Bodenbänder (Schlagschatten) entfernen, Fußsilhouetten bleiben.
        data = canvas.load()
        alpha = canvas.getchannel("A").load()
        for y in range(900, 1024):
            x = 0
            while x < 1024:
                if alpha[x, y] == 0:
                    x += 1
                    continue
                start = x
                while x < 1024 and alpha[x, y] > 0:
                    x += 1
                if x - start > 250:
                    for column in range(start, x):
                        data[column, y] = (0, 0, 0, 0)
        # Bodenlinie/Restschatten am unteren Rand entfernen und erneut auf y=960 setzen.
        for y in range(956, 1024):
            for column in range(1024):
                data[column, y] = (0, 0, 0, 0)
        bbox = canvas.getchannel("A").getbbox()
        if bbox and bbox[3] != 960:
            shifted = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
            shifted.alpha_composite(canvas, (0, 960 - bbox[3]))
            canvas = shifted
        bbox = canvas.getchannel("A").getbbox()
        if not bbox or min(bbox[0], bbox[1]) < 8 or max(bbox[2], bbox[3]) > 1016:
            raise SystemExit(f"Frame {frame} berührt den Rand nach Normalisierung: {bbox}")
        target = out_dir / f"walk{frame}.png"
        canvas.save(target)
        print(target.name, bbox)


if __name__ == "__main__":
    main()
