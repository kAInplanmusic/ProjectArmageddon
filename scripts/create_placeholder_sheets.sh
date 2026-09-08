#!/usr/bin/env bash
#===================================================================
# create_placeholder_sheets.sh
#   Generates placeholder sprite‑sheets for:
#   * weapon‑aim animation (3 frames per weapon)
#   * explosions (4 frames per explosion type)
#   * characters (3 frames per character – idle, walk, run)
#   The sheets are stored under src/client/assets/sprites/.
#   Accompanying JSON files with frame coordinates are also created.
#===================================================================

set -euo pipefail

# ------------------------------------------------------------------
# Helper: create a temporary working directory
# ------------------------------------------------------------------
TMP="src/client/assets/temp_sprites"
mkdir -p "$TMP"

# ------------------------------------------------------------------
# 1️⃣ Weapon‑aim sprite sheet
# ------------------------------------------------------------------
ICON_DIR="src/client/assets/icons"
OUT_DIR="src/client/assets/sprites"
mkdir -p "$OUT_DIR"

# create three frames for each weapon: original, blue‑tint (aim), red‑tint (shoot)
idx=0
for img in "$ICON_DIR"/*_icon.png; do
  id=$(basename "$img" _icon.png)
  # original
  cp "$img" "$TMP/${id}_0.png"
  # aim – blue tint
  magick convert "$img" -fill blue -colorize 30 "$TMP/${id}_1.png"
  # shoot – red tint
  magick convert "$img" -fill red -colorize 30 "$TMP/${id}_2.png"
  ((idx++))
done

# Determine tile layout (e.g., 30 columns)
# Total frames = weapons * 3. Use 30 columns to keep rows reasonable.
FRAME_COUNT=$((idx * 3))
COLUMNS=30
magick montage "$TMP"/*_0.png "$TMP"/*_1.png "$TMP"/*_2.png \
  -tile "${COLUMNS}x" -geometry 64x64+0+0 "$OUT_DIR/weapon_aim_spritesheet.png"

# ------------------------------------------------------------------
# 2️⃣ Explosion sprite sheets (placeholder types)
# ------------------------------------------------------------------
# Define placeholder explosion types – you can extend this list.
EXPLOSION_TYPES=("basic" "fire" "ice" "poison")
# each explosion will have 4 frames (different colours)
frame=0
for type in "${EXPLOSION_TYPES[@]}"; do
  for i in {1..4}; do
    # create a simple coloured circle on transparent background
    case "$type" in
      basic)  color="orange";;
      fire)   color="red";;
      ice)    color="cyan";;
      poison) color="purple";;
      *)      color="gray";;
    esac
    # radius grows with frame index to simulate expansion
    radius=$((20 + i*5))
    magick convert -size 64x64 xc:none \
      -fill "$color" -draw "circle 32,32 $((32+radius)),$((32+radius))" \
      "$TMP/${type}_$i.png"
  done
  # combine the 4 frames into a horizontal strip for this type
  magick montage "$TMP/${type}_1.png" "$TMP/${type}_2.png" "$TMP/${type}_3.png" "$TMP/${type}_4.png" \
    -tile 4x1 -geometry 64x64+0+0 "$OUT_DIR/explosion_${type}_spritesheet.png"
done
# also create a combined sheet of all explosion types (optional)
magick montage "$OUT_DIR"/explosion_*_spritesheet.png -tile 1x -geometry +0+0 "$OUT_DIR/explosion_combined_spritesheet.png"

# ------------------------------------------------------------------
# 3️⃣ Character sprite sheet (9x9 characters)
# ------------------------------------------------------------------
# For simplicity we generate 81 placeholders. Each character gets 3 frames.
CHAR_COUNT=81
for ((c=0; c<CHAR_COUNT; c++)); do
  char_id=$(printf "char%02d" $c)
  # idle – gray square
  magick convert -size 64x64 xc:gray -gravity Center -pointsize 12 -annotate 0 "$char_id" "$TMP/${char_id}_idle.png"
  # walk – green square
  magick convert -size 64x64 xc:green -gravity Center -pointsize 12 -annotate 0 "$char_id" "$TMP/${char_id}_walk.png"
  # run – blue square
  magick convert -size 64x64 xc:blue -gravity Center -pointsize 12 -annotate 0 "$char_id" "$TMP/${char_id}_run.png"
done
# montage all frames in order: idle, walk, run for each character
magick montage $(for ((c=0; c<CHAR_COUNT; c++)); do printf "%s_%s.png " "char$(printf "%02d" $c)" "idle"; printf "%s_%s.png " "char$(printf "%02d" $c)" "walk"; printf "%s_%s.png " "char$(printf "%02d" $c)" "run"; done) \
  -tile 27x -geometry 64x64+0+0 "$OUT_DIR/character_spritesheet.png"

# ------------------------------------------------------------------
# 4️⃣ Generate JSON mapping files for each sheet
# ------------------------------------------------------------------
# Simple Node script to create mapping (coordinates in pixels)
node <<'NODE'
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.resolve('src/client/assets/sprites');
const FRAME_SIZE = 64;

// Weapon aim mapping
const weaponAimPath = path.join(OUT_DIR, 'weapon_aim_spritesheet.png');
if (fs.existsSync(weaponAimPath)) {
  const icons = fs.readdirSync('src/client/assets/icons').filter(f=>f.endsWith('_icon.png'));
  const map = {};
  const cols = 30; // must match the montage setting above
  icons.forEach((file, wIdx) => {
    const id = file.replace('_icon.png','');
    for(let f=0; f<3; f++) {
      const frameIdx = wIdx*3 + f;
      const x = (frameIdx % cols) * FRAME_SIZE;
      const y = Math.floor(frameIdx / cols) * FRAME_SIZE;
      map[`${id}_frame${f}`] = {x, y, w: FRAME_SIZE, h: FRAME_SIZE};
    }
  });
  fs.writeFileSync(path.join(OUT_DIR, 'weapon_aim_spritesheet.json'), JSON.stringify(map, null, 2));
  console.log('Weapon aim mapping written');
}

// Explosion mapping (per type)
const explosionTypes = ['basic','fire','ice','poison'];
explosionTypes.forEach(type => {
  const sheet = path.join(OUT_DIR, `explosion_${type}_spritesheet.png`);
  if (!fs.existsSync(sheet)) return;
  const map = {};
  for(let i=0;i<4;i++) {
    map[`frame${i}`] = {x: i*FRAME_SIZE, y:0, w: FRAME_SIZE, h: FRAME_SIZE};
  }
  fs.writeFileSync(path.join(OUT_DIR, `explosion_${type}_spritesheet.json`), JSON.stringify(map, null, 2));
});

// Character mapping – each character has idle, walk, run (3 frames)
const charCount = 81;
const charMap = {};
for(let c=0;c<charCount;c++) {
  const id = `char${String(c).padStart(2,'0')}`;
  for(let f=0;f<3;f++) {
    const frameIdx = c*3 + f;
    const x = (frameIdx % 27) * FRAME_SIZE; // 27 cols set in montage
    const y = Math.floor(frameIdx / 27) * FRAME_SIZE;
    const frameName = f===0?'idle':f===1?'walk':'run';
    charMap[`${id}_${frameName}`] = {x, y, w: FRAME_SIZE, h: FRAME_SIZE};
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'character_spritesheet.json'), JSON.stringify(charMap, null, 2));
console.log('Character mapping written');
NODE

echo "All placeholder sprite sheets and JSON mappings have been generated in $OUT_DIR"
