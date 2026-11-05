#!/usr/bin/env bash
# =============================================================================
#  sichern.sh — Spielstand (PA_STATE_PATH) sichern, atomar, mit Aufbewahrung
# =============================================================================
#  Aufruf:
#    sichern.sh [--grund TEXT] [--trocken] [--print-config]
#
#  Was gesichert wird: die Lobby-Datei des Servers (`PA_STATE_PATH`, Seed +
#  Eingaben laufender Partien, siehe docs/betrieb.md Abschnitt 2). Sie enthält
#  Sitzplatz-Tokens der Spieler — die Sicherungen sind deshalb nur für den
#  Eigentümer lesbar (umask 077).
#
#  Wie (atomar):
#    1. Kopie in eine temporäre Datei IM Sicherungsordner
#    2. Prüfung: gültiges JSON mit Feld `version` (sonst Abbruch, Exit 2 —
#       ältere Sicherungen bleiben unangetastet)
#    3. auf die Platte schreiben (sync), dann umbenennen nach
#       lobbies-<UTC-Zeit>.json, daneben .sha256 (Format von `sha256sum -c`)
#    4. Aufbewahrung: die neuesten PA_SICHERUNG_BEHALTEN bleiben, ältere gehen
#       (erst NACH dem erfolgreichen Umbenennen)
#
#  Umgebung:
#    PA_STATE_PATH            Vorgabe /var/lib/projectarmageddon/lobbies.json
#    PA_SICHERUNG_DIR         Vorgabe <Ordner von PA_STATE_PATH>/sicherungen
#    PA_SICHERUNG_BEHALTEN    Vorgabe 10 (1 bis 1000)
#    DRY_RUN=1                wie --trocken
#
#  Rückgabewerte: 0 gesichert (oder nichts zu sichern) · 1 Bedienfehler ·
#                 2 Zustandsdatei unlesbar/kein gültiges JSON
#
#  Abgrenzung: scripts/betrieb/snapshot.sh sichert beim STOPP des Dienstes
#  den ganzen Knotenstand (Journal, Programmstand, Konfiguration). sichern.sh
#  ist der leichte Weg für den Spielstand allein: vor jedem Deploy
#  (scripts/release/deploy.sh ruft es) und z. B. stündlich per Timer.
# =============================================================================
set -euo pipefail
umask 077

PROGRAMM="sichern.sh"
PA_STATE_PATH="${PA_STATE_PATH:-/var/lib/projectarmageddon/lobbies.json}"
PA_SICHERUNG_DIR="${PA_SICHERUNG_DIR:-$(dirname "$PA_STATE_PATH")/sicherungen}"
PA_SICHERUNG_BEHALTEN="${PA_SICHERUNG_BEHALTEN:-10}"
PA_NODE="${PA_NODE:-node}"
TROCKEN=no
[ "${DRY_RUN:-0}" = "1" ] && TROCKEN=yes
GRUND="manuell"

protokoll() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROGRAMM" "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --grund) GRUND="${2:-}"; shift ;;
    --trocken|--dry-run) TROCKEN=yes ;;
    --print-config)
      printf 'sichern.sh — Parameter (es wird nichts geschrieben)\n'
      printf '  Zustandsdatei : %s\n  Ablage        : %s\n  Behalten      : %s\n' \
        "$PA_STATE_PATH" "$PA_SICHERUNG_DIR" "$PA_SICHERUNG_BEHALTEN"
      exit 0 ;;
    -h|--help) sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf '%s: unbekannte Option %s\n' "$PROGRAMM" "$1" >&2; exit 1 ;;
  esac
  shift
done

case "$PA_SICHERUNG_BEHALTEN" in
  ''|*[!0-9]*) protokoll "PA_SICHERUNG_BEHALTEN=$PA_SICHERUNG_BEHALTEN ist keine Zahl"; exit 1 ;;
esac
if [ "$PA_SICHERUNG_BEHALTEN" -lt 1 ] || [ "$PA_SICHERUNG_BEHALTEN" -gt 1000 ]; then
  protokoll "PA_SICHERUNG_BEHALTEN muss zwischen 1 und 1000 liegen"; exit 1
fi

if [ ! -f "$PA_STATE_PATH" ]; then
  protokoll "nichts zu sichern: $PA_STATE_PATH fehlt (Server noch nie gelaufen oder PA_PERSISTENCE=off)"
  exit 0
fi

# Prüft eine Zustandsdatei: JSON-Objekt mit Feld `version` (src/server/persistence.js).
pruefe_json() {
  "$PA_NODE" -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (!d || typeof d !== "object" || d.version === undefined) process.exit(3);
  ' "$1" 2>/dev/null
}

zeit=$(date -u +%Y%m%dT%H%M%S.%NZ)   # Nanosekunden: Namensreihenfolge = Altersreihenfolge
name="lobbies-$zeit.json"
n=1
while [ -e "$PA_SICHERUNG_DIR/$name" ]; do
  n=$((n + 1)); name="lobbies-$zeit-$n.json"
done
ziel="$PA_SICHERUNG_DIR/$name"

if [ "$TROCKEN" = "yes" ]; then
  printf '[trocken] sichere %s -> %s (Grund: %s), behalte die neuesten %s\n' \
    "$PA_STATE_PATH" "$ziel" "$GRUND" "$PA_SICHERUNG_BEHALTEN" >&2
  exit 0
fi

mkdir -p "$PA_SICHERUNG_DIR"
tmp=$(mktemp "$PA_SICHERUNG_DIR/.sicherung-XXXXXX.tmp")
trap 'rm -f -- "$tmp" "$tmp.sha"' EXIT

cp -- "$PA_STATE_PATH" "$tmp"
if ! pruefe_json "$tmp"; then
  protokoll "FEHLER: $PA_STATE_PATH ist kein gültiger Spielstand (JSON mit version) — keine Sicherung, ältere bleiben"
  exit 2
fi
sync -- "$tmp" 2>/dev/null || sync
mv -f -- "$tmp" "$ziel"
( cd "$PA_SICHERUNG_DIR" && sha256sum -- "$name" > "$tmp.sha" && mv -f -- "$tmp.sha" "$name.sha256" )
# Als root aufgerufen (deploy.sh unter sudo): Ablage und Dateien gehören wie der Zustand dem
# Dienstbenutzer — sonst kann ein späterer Lauf als `pa` (Timer) sie nicht aufräumen.
if [ "$(id -u)" = "0" ]; then
  chown --reference="$(dirname "$PA_STATE_PATH")" -- "$PA_SICHERUNG_DIR" "$ziel" "$ziel.sha256" 2>/dev/null || true
fi
protokoll "gesichert: $ziel ($(wc -c < "$ziel") Byte, Grund: $GRUND)"

# Aufbewahrung: Namen sind Zeitstempel, also sortiert die Namensreihenfolge nach Alter.
mapfile -t alle < <(find "$PA_SICHERUNG_DIR" -maxdepth 1 -type f -name 'lobbies-*.json' -printf '%f\n' | sort -r)
i=0
for datei in "${alle[@]}"; do
  i=$((i + 1))
  [ "$i" -le "$PA_SICHERUNG_BEHALTEN" ] && continue
  rm -f -- "$PA_SICHERUNG_DIR/$datei" "$PA_SICHERUNG_DIR/$datei.sha256"
  protokoll "aufgeräumt: $datei"
done
exit 0
