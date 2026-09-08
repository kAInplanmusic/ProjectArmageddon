#!/usr/bin/env bash
# ---------------------------------------------------------------------
# create_weapon_icons.sh
#   Takes a directory with the original weapon logo PNGs (any case),
#   removes the background colour (detected per image) and writes
#   64×64 transparent icons to src/client/assets/icons/.
#
# Usage:
#   ./scripts/create_weapon_icons.sh <source-directory>
#   Example:
#       ./scripts/create_weapon_icons.sh assets/weapons/source
# ---------------------------------------------------------------------

set -euo pipefail

usage() {
  echo "Usage: $0 <source-directory>"
  echo "  <source-directory> – folder that contains the original PNG logos"
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

SRC_DIR="$1"
if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: directory '$SRC_DIR' does not exist."
  exit 1
fi

DEST_DIR="src/client/assets/icons"
mkdir -p "$DEST_DIR"

# Enable case‑insensitive globbing for PNG/PNG extensions
shopt -s nullglob nocaseglob

for IMG_PATH in "$SRC_DIR"/*.{png,PNG}; do
  # Skip if no files matched
  [ -e "$IMG_PATH" ] || continue
  BASENAME=$(basename "$IMG_PATH")
  NAME="${BASENAME%.*}"

  # Detect background colour (pixel 0,0)
  BG_COLOR=$(magick identify -format "%[pixel:p{0,0}]" "$IMG_PATH")

  ICON_PATH="$DEST_DIR/${NAME}_icon.png"

  magick convert "$IMG_PATH" \
    -fuzz 10% -transparent "$BG_COLOR" \
    -resize 64x64^ \
    -gravity center -extent 64x64 \
    "$ICON_PATH"

  echo "✅ Created icon → $ICON_PATH (bg=$BG_COLOR)"
done

echo "✅ All icons have been written to $DEST_DIR"
