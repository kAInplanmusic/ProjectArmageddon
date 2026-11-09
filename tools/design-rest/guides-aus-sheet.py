#!/usr/bin/env python3
"""Schneidet die acht Zellen eines bestehenden Sprite-Sheets als Posenvorlagen aus.

Aufruf aus dem Repository-Hauptverzeichnis:
  python3 tools/design-rest/guides-aus-sheet.py captain-sven walk
Ergebnis: artifacts/design-rest/guides/<id>/<animation>-<0..7>-sheet.png
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CHARACTERS = json.loads((ROOT / "tools/design-rest/characters.json").read_text())


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Aufruf: guides-aus-sheet.py <figuren-id> <walk|aktion|zustand|emotion>")
    character_id, animation = sys.argv[1], sys.argv[2]
    character = CHARACTERS[character_id]
    datei_animation = "aktion" if animation == "action" else animation
    sheet_path = ROOT / "src/client/assets/sprite-sheets" / character["faction"] / (
        character["sprite"].replace(".png", "") + f"__{datei_animation}.webp"
    )
    sheet = Image.open(sheet_path).convert("RGBA")
    if sheet.size != (1024, 512):
        raise SystemExit(f"Unerwartetes Sheet-Maß: {sheet.size}")
    out_dir = ROOT / "artifacts/design-rest/guides" / character_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for frame in range(8):
        column, row = frame % 4, frame // 4
        cell = sheet.crop((column * 256, row * 256, (column + 1) * 256, (row + 1) * 256))
        canvas = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
        canvas.alpha_composite(cell.resize((1024, 1024), Image.Resampling.LANCZOS))
        target = out_dir / f"{animation}-{frame}-sheet.png"
        canvas.convert("RGB").save(target)
        print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()
