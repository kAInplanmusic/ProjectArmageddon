#!/usr/bin/env bash
# =============================================================================
#  wiederherstellen.sh — Spielstand aus einer Sicherung zurückspielen
# =============================================================================
#  Aufruf (Dienst muss GESTOPPT sein):
#    wiederherstellen.sh <sicherung.json> --ja [--trocken]
#    wiederherstellen.sh --neueste --ja [--trocken]
#    wiederherstellen.sh --liste
#
#  Ablauf:
#    1. Sicherung prüfen: .sha256 daneben (wenn vorhanden, muss sie stimmen),
#       gültiges JSON mit Feld `version`
#    2. Dienst muss gestoppt sein (`systemctl is-active` ≠ active) — ein
#       laufender Server würde die Datei beim nächsten Speichern (alle 10 s)
#       überschreiben
#    3. den JETZIGEN Stand nach <Ablage>/vor-wiederherstellung-<Zeit>.json
#       legen (fällt nicht unter die Aufbewahrung von sichern.sh)
#    4. Sicherung als temporäre Datei NEBEN PA_STATE_PATH ablegen, Rechte und
#       Eigentümer übernehmen, dann atomar umbenennen
#
#  Danach: systemctl start projectarmageddon.service — der Server baut die
#  Partien aus Seed + Eingaben neu auf (docs/betrieb.md, Abschnitt 2).
#
#  Umgebung: PA_STATE_PATH, PA_SICHERUNG_DIR (wie sichern.sh), PA_SYSTEMD_UNIT,
#  PA_SYSTEMCTL (austauschbar für Tests), DRY_RUN=1.
#  Rückgabewerte: 0 zurückgespielt · 1 Bedienfehler · 2 Sicherung ungültig ·
#                 3 Dienst läuft noch
# =============================================================================
set -euo pipefail
umask 077

PROGRAMM="wiederherstellen.sh"
PA_STATE_PATH="${PA_STATE_PATH:-/var/lib/projectarmageddon/lobbies.json}"
PA_SICHERUNG_DIR="${PA_SICHERUNG_DIR:-$(dirname "$PA_STATE_PATH")/sicherungen}"
PA_SYSTEMD_UNIT="${PA_SYSTEMD_UNIT:-projectarmageddon.service}"
PA_SYSTEMCTL="${PA_SYSTEMCTL:-systemctl}"
PA_NODE="${PA_NODE:-node}"
TROCKEN=no
[ "${DRY_RUN:-0}" = "1" ] && TROCKEN=yes
JA=no
QUELLE=""
NEUESTE=no

protokoll() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROGRAMM" "$*" >&2; }
abbruch() { protokoll "ABBRUCH: $2"; exit "$1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --ja) JA=yes ;;
    --neueste) NEUESTE=yes ;;
    --trocken|--dry-run) TROCKEN=yes ;;
    --liste)
      printf 'Sicherungen in %s (neueste zuerst):\n' "$PA_SICHERUNG_DIR"
      find "$PA_SICHERUNG_DIR" -maxdepth 1 -type f \( -name 'lobbies-*.json' -o -name 'vor-wiederherstellung-*.json' \) \
        -printf '  %f  %s Byte\n' 2>/dev/null | sort -r || true
      exit 0 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) abbruch 1 "unbekannte Option $1" ;;
    *) QUELLE="$1" ;;
  esac
  shift
done

if [ "$NEUESTE" = "yes" ]; then
  QUELLE=$(find "$PA_SICHERUNG_DIR" -maxdepth 1 -type f -name 'lobbies-*.json' -printf '%p\n' 2>/dev/null | sort -r | head -n1)
  [ -n "$QUELLE" ] || abbruch 1 "keine Sicherung in $PA_SICHERUNG_DIR"
fi
[ -n "$QUELLE" ] || abbruch 1 "keine Sicherung angegeben (Datei oder --neueste; --liste zeigt sie)"
[ -f "$QUELLE" ] || abbruch 1 "$QUELLE nicht gefunden"

# --- 1. Sicherung prüfen ------------------------------------------------------
if [ -f "$QUELLE.sha256" ]; then
  ( cd "$(dirname "$QUELLE")" && sha256sum --check --status "$(basename "$QUELLE").sha256" ) \
    || abbruch 2 "Prüfsumme stimmt nicht: $QUELLE.sha256"
else
  protokoll "Hinweis: keine Prüfsumme neben $QUELLE — nur der Inhalt wird geprüft"
fi
"$PA_NODE" -e '
  const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!d || typeof d !== "object" || d.version === undefined) process.exit(3);
' "$QUELLE" 2>/dev/null || abbruch 2 "$QUELLE ist kein gültiger Spielstand (JSON mit version)"

# --- 2. Dienst gestoppt? ----------------------------------------------------------
if command -v "$PA_SYSTEMCTL" >/dev/null 2>&1; then
  if "$PA_SYSTEMCTL" is-active --quiet "$PA_SYSTEMD_UNIT"; then
    abbruch 3 "$PA_SYSTEMD_UNIT läuft — erst: systemctl stop $PA_SYSTEMD_UNIT"
  fi
else
  protokoll "Hinweis: $PA_SYSTEMCTL nicht vorhanden — Zustand des Dienstes ungeprüft"
fi

if [ "$JA" != "yes" ] && [ "$TROCKEN" != "yes" ]; then
  abbruch 1 "würde $PA_STATE_PATH durch $QUELLE ersetzen — bestätigen mit --ja (oder --trocken)"
fi

zeit=$(date -u +%Y%m%dT%H%M%S.%NZ)
if [ "$TROCKEN" = "yes" ]; then
  [ -f "$PA_STATE_PATH" ] && printf '[trocken] lege jetzigen Stand nach %s/vor-wiederherstellung-%s.json\n' "$PA_SICHERUNG_DIR" "$zeit" >&2
  printf '[trocken] ersetze %s durch %s (atomar)\n' "$PA_STATE_PATH" "$QUELLE" >&2
  exit 0
fi

# --- 3. Jetzigen Stand beiseitelegen --------------------------------------------
mkdir -p "$PA_SICHERUNG_DIR"
if [ -f "$PA_STATE_PATH" ]; then
  cp -p -- "$PA_STATE_PATH" "$PA_SICHERUNG_DIR/vor-wiederherstellung-$zeit.json"
  protokoll "jetziger Stand beiseitegelegt: $PA_SICHERUNG_DIR/vor-wiederherstellung-$zeit.json"
fi

# --- 4. Atomar ersetzen -------------------------------------------------------
mkdir -p "$(dirname "$PA_STATE_PATH")"
tmp=$(mktemp "$(dirname "$PA_STATE_PATH")/.wiederherstellung-XXXXXX.tmp")
trap 'rm -f -- "$tmp"' EXIT
cp -- "$QUELLE" "$tmp"
# Eigentümer übernehmen (läuft das Skript als root, gehört die Datei sonst root
# und der Dienstbenutzer `pa` kann sie nicht lesen).
referenz="$PA_STATE_PATH"
[ -e "$referenz" ] || referenz=$(dirname "$PA_STATE_PATH")
if [ "$(id -u)" = "0" ]; then chown --reference="$referenz" -- "$tmp"; fi
chmod 600 -- "$tmp"
sync -- "$tmp" 2>/dev/null || sync
mv -f -- "$tmp" "$PA_STATE_PATH"
trap - EXIT
protokoll "zurückgespielt: $QUELLE -> $PA_STATE_PATH. Jetzt: systemctl start $PA_SYSTEMD_UNIT"
exit 0
