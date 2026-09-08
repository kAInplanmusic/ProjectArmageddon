#!/usr/bin/env bash
# ------------------------------------------------------------
# create_weapon_aim_sheet.sh
#   Generates a sprite sheet for weapon‑aim animation.
#   For each weapon icon (64×64) it creates three frames:
#     0 – original
#     1 – blue‑tinted (aim)
#     2 – red‑tinted (shoot)
#   The result is stored as src/client/assets/sprites/weapon_aim_spritesheet.png
#   plus a JSON mapping (weapon_aim_spritesheet.json) with the coordinates
#   of each frame for easy lookup.
# ------------------------------------------------------------

set -euo pipefail

ICON_DIR="src/client/assets/icons"
OUT_DIR="src/client/assets/sprites"
TMP_DIR="src/client/assets/temp_sprites"
mkdir -p "$OUT_DIR" "$TMP_DIR"

# ----------------------------------------------------------------
# 1️⃣ Create three frames for each weapon
# ----------------------------------------------------------------
idx=0
for img in "$ICON_DIR"/*_icon.png; do
  id=$(basename "$img" _icon.png)
  cp "$img" "$TMP_DIR/${id}_0.png"
  magick convert "$img" -fill blue -colorize 30 "$TMP_DIR/${id}_1.png"
  magick convert "$img" -fill red -colorize 30 "$TMP_DIR/${id}_2.png"
  ((idx++))
done

# ----------------------------------------------------------------
# 2️⃣ Assemble the sheet (30 columns → reasonable rows)
# ----------------------------------------------------------------
COLUMNS=30
magick montage "$TMP_DIR"/*_0.png "$TMP_DIR"/*_1.png "$TMP_DIR"/*_2.png \
  -tile "${COLUMNS}x" -geometry 64x64+0+0 "$OUT_DIR/weapon_aim_spritesheet.png"

# ----------------------------------------------------------------
# 3️⃣ Generate JSON mapping (frame coordinates)
# ----------------------------------------------------------------
node <<'NODE'
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.resolve('src/client/assets/sprites');
const FRAME_SIZE = 64;
const icons = fs.readdirSync('src/client/assets/icons').filter(f=>f.endsWith('_icon.png'));
const cols = 30; // must match montage columns above
const map = {};
icons.forEach((file, wIdx) => {
  const id = file.replace('_icon.png','');
  for(let f = 0; f < 3; f++) {
    const frameIdx = wIdx*3 + f;
    const x = (frameIdx % cols) * FRAME_SIZE;
    const y = Math.floor(frameIdx / cols) * FRAME_SIZE;
    map[`${id}_frame${f}`] = {x, y, w: FRAME_SIZE, h: FRAME_SIZE};
  }
});
fs.writeFileSync(path.join(OUT_DIR, 'weapon_aim_spritesheet.json'), JSON.stringify(map, null, 2));
console.log('Weapon aim sprite sheet and mapping generated');
NODE

# Cleanup temporary files
rm -rf "$TMP_DIR"
