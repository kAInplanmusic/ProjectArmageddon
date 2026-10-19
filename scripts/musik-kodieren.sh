#!/bin/bash
# Kodiert ein gelieferte Musikstück für das Spiel (siehe MASTERDOTO, „Musik-System").
#
#   scripts/musik-kodieren.sh <quelle.mp3> <id> "<Titel>"
#
# Schreibt src/client/assets/music/<id>.mp3:
#   - Lautheit nach EBU R128 auf -16 LUFS, True-Peak <= -1,5 dBTP (zweistufig:
#     erst messen, dann mit den Messwerten linear anwenden — das verändert die
#     Dynamik nicht, es verschiebt nur den Pegel),
#   - 0,4 s Einblendung und 1,5 s Ausblendung (kein Knacken am Anfang/Ende),
#   - MP3, VBR (LAME -V 6, rund 115-125 kbit/s), 48 kHz Stereo,
#   - Titel als Metadatum; fremde Kommentar-Tags der Quelle werden entfernt.
# Die Dauer in manifest.json bleibt Handarbeit (ffprobe zeigt sie).
set -euo pipefail

quelle="${1:?Quelle fehlt}"
id="${2:?id fehlt}"
titel="${3:?Titel fehlt}"
ziel="$(cd "$(dirname "$0")/.." && pwd)/src/client/assets/music/${id}.mp3"
mkdir -p "$(dirname "$ziel")"

ziel_lufs=-16
ziel_tp=-1.5

messung="$(ffmpeg -nostats -hide_banner -i "$quelle" \
  -af "loudnorm=I=${ziel_lufs}:TP=${ziel_tp}:LRA=11:print_format=json" -f null - 2>&1 \
  | sed -n '/^{/,/^}/p')"
wert() { printf '%s' "$messung" | grep "\"$1\"" | sed 's/[^0-9.-]*\(-\?[0-9.]\+\).*/\1/'; }

dauer="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$quelle")"
aus_start="$(awk -v d="$dauer" 'BEGIN { printf "%.3f", d - 1.5 }')"

ffmpeg -y -nostats -hide_banner -loglevel error -i "$quelle" \
  -af "loudnorm=I=${ziel_lufs}:TP=${ziel_tp}:LRA=11:measured_I=$(wert input_i):measured_TP=$(wert input_tp):measured_LRA=$(wert input_lra):measured_thresh=$(wert input_thresh):offset=$(wert target_offset):linear=true,afade=t=in:d=0.4,afade=t=out:st=${aus_start}:d=1.5,aresample=48000" \
  -map 0:a -map_metadata -1 -ac 2 \
  -c:a libmp3lame -q:a 6 \
  -metadata "title=${titel}" \
  "$ziel"

ls -l "$ziel"
