#!/usr/bin/env python3
"""Bereitet Runware-512-Frames für den Sprite-Pack vor.

- skaliert 512 -> 1024 (Lanczos + dezente Unscharfmaskierung)
- stellt frei (rembg u2net) und normalisiert auf Grundlinie y=960
- entfernt Alpha-Splitter (größte Komponente; Schwarm behält alle)
- schreibt Kontaktbögen je Fraktion

Aufruf:
  ~/.venvs/rembg312/bin/python tools/design-rest/runware-nachbereiten.py \
      artifacts/design-rest/runware-rest-walk walk
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
ROOT = Path(__file__).resolve().parents[2]
CHARACTERS = json.loads((ROOT / "tools/design-rest/characters.json").read_text())
UPSCALED = ROOT / "artifacts/design-rest/runware-upscaled"
NORMALIZED = ROOT / "artifacts/design-rest/runware-normalisiert"
CONTACTS = ROOT / "artifacts/design-rest/runware-kontakt"


def frames_for(run_dir: Path, character_id: str, animation: str):
    paths = []
    for frame in range(8):
        path = run_dir / f"{character_id}-{animation}-{frame}.png"
        if not path.exists():
            raise SystemExit(f"Fehlt: {path}")
        paths.append(path)
    return paths


def upscale(paths, character_id, animation):
    out_dir = UPSCALED / character_id
    out_dir.mkdir(parents=True, exist_ok=True)
    result = []
    for frame, path in enumerate(paths):
        image = Image.open(path).convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=2))
        target = out_dir / f"{character_id}-{animation}-{frame}-s0.png"
        image.save(target)
        result.append(target)
    return result


def freistellen_chroma(image):
    """Entfernt den uniformen grauen Modellhintergrund per Farbabstand.

    Schneller und für diese Runware-Ausgaben sauberer als rembg: der Hintergrund
    ist eine flache graue Fläche, Figurenfarben liegen weit genug entfernt.
    """
    rgb = np.array(image.convert("RGB")).astype(np.int16)
    corners = np.concatenate([
        rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3),
        rgb[-8:, :8].reshape(-1, 3), rgb[-8:, -8:].reshape(-1, 3),
    ])
    hintergrund = np.median(corners, axis=0)
    abstand = np.sqrt(((rgb - hintergrund) ** 2).sum(axis=2))
    alpha = np.clip((abstand - 6) * 255 / 18, 0, 255).astype(np.uint8)
    # Innenliegende grau-nahe Flächen (Rüstung, Stoff) wieder schließen; nur
    # Hintergrund, der den Bildrand berührt, bleibt transparent.
    gefuellt = ndimage.binary_fill_holes(alpha > 16)
    alpha = np.where(gefuellt, np.maximum(alpha, 200), alpha).astype(np.uint8)
    return Image.fromarray(np.dstack([np.array(image.convert("RGB")), alpha]), "RGBA")


def keep_largest(cut, morphology):
    if morphology == "swarm":
        return cut
    alpha = np.array(cut.getchannel("A"))
    labels, count = ndimage.label(alpha > 8)
    if count <= 1:
        return cut
    sizes = ndimage.sum(alpha > 8, labels, range(1, count + 1))
    largest = int(np.argmax(sizes)) + 1
    keep = sizes[largest - 1]
    maske = np.isin(labels, [i + 1 for i, size in enumerate(sizes) if size >= keep * 0.05])
    data = np.array(cut)
    data[..., 3] = np.where(maske, data[..., 3], 0)
    return Image.fromarray(data, "RGBA")


def normalize(paths, character_id, animation, morphology):
    out_dir = NORMALIZED / character_id / animation
    out_dir.mkdir(parents=True, exist_ok=True)
    cutouts, boxes = [], []
    for path in paths:
        image = Image.open(path).convert("RGBA")
        cut = keep_largest(freistellen_chroma(image), CHARACTERS[character_id]["morphology"]).resize((1024, 1024), Image.Resampling.LANCZOS)
        box = cut.getchannel("A").getbbox()
        if not box:
            raise SystemExit(f"Leere Freistellung: {path}")
        cutouts.append(cut)
        boxes.append(box)
    max_height = max(b[3] - b[1] for b in boxes)
    max_width = max(b[2] - b[0] for b in boxes)
    scale = min(1.0, 860 / max_height, 860 / max_width)
    centers = sorted((b[0] + b[2]) / 2 for b in boxes)
    median_cx = centers[len(centers) // 2]
    dx = round(512 - scale * median_cx)
    # Kein Frame darf den Rand berühren; die gemeinsame Verschiebung wird geklemmt.
    min_links = min(scale * b[0] for b in boxes)
    max_rechts = max(scale * b[2] for b in boxes)
    dx = min(max(dx, 8 - round(min_links)), 1016 - round(max_rechts))
    for frame, (cut, box) in enumerate(zip(cutouts, boxes)):
        size = (round(1024 * scale), round(1024 * scale))
        scaled = cut.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        dy = round(960 - scale * box[3])
        canvas.alpha_composite(scaled, (dx, dy))
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
            raise SystemExit(f"{character_id} {animation} Frame {frame}: Randberührung {bbox}")
        canvas.save(out_dir / f"{animation}{frame}.png")


def contact(character_id, animation):
    frames = [Image.open(NORMALIZED / character_id / animation / f"{animation}{i}.png").convert("RGBA") for i in range(8)]
    sheet = Image.new("RGB", (8 * 160, 190), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    for i, frame in enumerate(frames):
        thumb = frame.copy()
        thumb.thumbnail((160, 160))
        sheet.paste(thumb, (i * 160 + (160 - thumb.width) // 2, 0), thumb)
        draw.text((i * 160 + 4, 170), f"{i}", fill=(20, 20, 20))
    return sheet


def faction_contacts(animation, ids):
    CONTACTS.mkdir(parents=True, exist_ok=True)
    by_faction = {}
    for cid in ids:
        by_faction.setdefault(CHARACTERS[cid]["faction"], []).append(cid)
    for faction, members in by_faction.items():
        rows = []
        for cid in sorted(members):
            rows.append((cid, contact(cid, animation)))
        width = 8 * 160
        sheet = Image.new("RGB", (width, len(rows) * 210), (245, 245, 245))
        draw = ImageDraw.Draw(sheet)
        for row, (cid, image) in enumerate(rows):
            sheet.paste(image, (0, row * 210))
            draw.text((4, row * 210 + 188), cid, fill=(20, 20, 20))
        sheet.save(CONTACTS / f"{faction}-{animation}.jpg", quality=88)


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit("Aufruf: runware-nachbereiten.py <run-verzeichnis> <walk|action> [figuren-ids]")
    run_dir = (ROOT / sys.argv[1]).resolve()
    animation = sys.argv[2]
    if animation not in ("walk", "action"):
        raise SystemExit("Animation muss walk|action sein")
    if len(sys.argv) == 4:
        ids = sys.argv[3].split(",")
    else:
        ids = [cid for cid in CHARACTERS if (run_dir / f"{cid}-{animation}-0.png").exists()]
    for index, cid in enumerate(ids, 1):
        paths = frames_for(run_dir, cid, animation)
        try:
            normalize(paths, cid, animation, CHARACTERS[cid]["morphology"])
            print(f"{index}/{len(ids)} {cid} {animation}", flush=True)
        except SystemExit as error:
            print(f"{index}/{len(ids)} {cid} {animation} FEHLER: {error}", flush=True)
    faction_contacts(animation, ids)


if __name__ == "__main__":
    main()
