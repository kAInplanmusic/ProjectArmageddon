#!/usr/bin/env bash
#
# abbild-lokal.sh — Cloud-Abbild von DEINEM Rechner aus (das Token verlässt ihn nie).
#
# Läuft auf deinem eigenen Rechner, nicht auf dem Server. Voraussetzung: die
# hcloud-CLI mit deinem Token (`hcloud context create projectarmageddon` oder die
# Umgebungsvariable HCLOUD_TOKEN). Auf dem Server liegt dann kein Token — es kann
# in keinem Abbild stecken.
#
# Ablauf
#   1. Server finden; läuft er noch, wird er nur mit --ausschalten (sauberes
#      Herunterfahren, danach hartes Ausschalten nach 120 s) gestoppt
#   2. Abbild des AUSGESCHALTETEN Servers (dateisystemkonsistent) mit dem Label
#      projectarmageddon-snapshot=auto
#   3. nur wenn das neue Abbild "available" ist: ältere Abbilder mit diesem Label
#      löschen, die neuesten --keep (Vorgabe 3) bleiben
#   4. nur mit --loeschen --ja-wirklich UND geprüftem Abbild: Server löschen
#
# Aufruf
#   abbild-lokal.sh --server NAME [--keep 3] [--ausschalten] [--loeschen --ja-wirklich] [--trocken]
#
# Sicherheit: Es wird nie gelöscht, solange das neue Abbild nicht geprüft ist.

set -euo pipefail

PROGRAMM="${0##*/}"
SERVER="${PA_HCLOUD_SERVER:-}"
KEEP="${PA_HCLOUD_KEEP:-3}"
LABEL="${PA_HCLOUD_LABEL:-projectarmageddon-snapshot=auto}"
AUSSCHALTEN=0; LOESCHEN=0; JA=0; TROCKEN=0
WARTE_SEKUNDEN="${PA_WARTE_SEKUNDEN:-120}"

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }
fehler() { protokoll "FEHLER: $*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --server) shift; SERVER="${1:-}" ;;
    --keep) shift; KEEP="${1:-}" ;;
    --ausschalten) AUSSCHALTEN=1 ;;
    --loeschen) LOESCHEN=1 ;;
    --ja-wirklich) JA=1 ;;
    --trocken) TROCKEN=1 ;;
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) protokoll "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

case "$KEEP" in ''|*[!0-9]*) fehler "--keep muss eine Zahl sein" ;; esac
if [ "$KEEP" -lt 1 ] || [ "$KEEP" -gt 50 ]; then fehler "--keep: erlaubt ist 1 bis 50"; fi
[ -n "$SERVER" ] || fehler "--server NAME fehlt (oder PA_HCLOUD_SERVER setzen)"
command -v hcloud >/dev/null 2>&1 || fehler "hcloud fehlt: https://github.com/hetznercloud/cli/releases"
if [ "$LOESCHEN" = "1" ] && [ "$JA" != "1" ]; then
  fehler "--loeschen löscht den Server unwiderruflich. Zur Bestätigung zusätzlich --ja-wirklich angeben."
fi

status=$(hcloud server describe "$SERVER" -o format='{{.Status}}' 2>/dev/null) \
  || fehler "Server '$SERVER' nicht gefunden (oder Token ungültig / falscher Kontext)"
protokoll "Server '$SERVER' ist: $status"

if [ "$TROCKEN" = "1" ]; then
  protokoll "TROCKENLAUF: würde $( [ "$AUSSCHALTEN" = "1" ] && echo "ggf. herunterfahren, " )Abbild erstellen (Label $LABEL), alle bis auf die neuesten $KEEP löschen$( [ "$LOESCHEN" = "1" ] && echo ', danach den Server LÖSCHEN' )."
  exit 0
fi

if [ "$status" != "off" ]; then
  if [ "$AUSSCHALTEN" != "1" ]; then
    fehler "Der Server läuft ($status). Ein Abbild im laufenden Betrieb ist nicht gewollt. Erst stoppen — oder mit --ausschalten sauber herunterfahren lassen."
  fi
  protokoll "Server wird sauber heruntergefahren …"
  hcloud server shutdown "$SERVER" >&2 || protokoll "shutdown meldete einen Fehler — es wird auf 'off' gewartet"
  warte=0
  while [ "$warte" -lt "$WARTE_SEKUNDEN" ]; do
    status=$(hcloud server describe "$SERVER" -o format='{{.Status}}' 2>/dev/null || echo unbekannt)
    [ "$status" = "off" ] && break
    sleep 3; warte=$((warte + 3))
  done
  if [ "$status" != "off" ]; then
    protokoll "nach ${WARTE_SEKUNDEN}s noch nicht aus — hartes Ausschalten"
    hcloud server poweroff "$SERVER" >&2 || fehler "Ausschalten fehlgeschlagen — nichts gelöscht"
  fi
fi

zeit=$(date -u +%Y%m%dT%H%M%SZ)
protokoll "Abbild wird erstellt (kann Minuten dauern) …"
hcloud server create-image --type snapshot --description "projectarmageddon $zeit (lokal)" \
  --label "$LABEL" "$SERVER" >&2 || fehler "Abbild fehlgeschlagen — alte Abbilder und der Server bleiben UNBERÜHRT"

liste=$(hcloud image list --type snapshot --selector "$LABEL" -o noheader -o columns=id) \
  || fehler "Abbildliste nicht lesbar — es wird NICHTS gelöscht"
neueste=$(printf '%s\n' "$liste" | tr -d ' \t' | grep -E '^[0-9]+$' | sort -rn | head -n 1 || true)
[ -n "$neueste" ] || fehler "kein Abbild mit Label $LABEL gefunden — es wird NICHTS gelöscht"
abbild_status=$(hcloud image describe "$neueste" -o format='{{.Status}}' 2>/dev/null || echo unbekannt)
[ "$abbild_status" = "available" ] || fehler "neuestes Abbild $neueste hat Status '$abbild_status' (verlangt: available) — es wird NICHTS gelöscht"
protokoll "Neues Abbild $neueste ist verfügbar."

anzahl=0
while IFS= read -r id; do
  id=$(printf '%s' "$id" | tr -d '[:space:]'); [ -n "$id" ] || continue
  anzahl=$((anzahl + 1))
  if [ "$anzahl" -gt "$KEEP" ]; then
    protokoll "  altes Abbild wird gelöscht: $id"
    hcloud image delete "$id" >&2 || protokoll "  ! Löschen von $id schlug fehl"
  fi
done < <(printf '%s\n' "$liste" | grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' | sort -rn)

if [ "$LOESCHEN" = "1" ]; then
  protokoll "Server '$SERVER' wird gelöscht (Abbild $neueste ist geprüft) …"
  hcloud server delete "$SERVER" >&2 || fehler "Löschen des Servers fehlgeschlagen"
  protokoll "Gelöscht. Neu starten mit: scripts/betrieb/server-aus-abbild.sh --name $SERVER"
else
  protokoll "Fertig. Der Server '$SERVER' wurde NICHT gelöscht."
fi
