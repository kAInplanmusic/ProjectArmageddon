#!/usr/bin/env bash
#
# token-setzen.sh — legt das Hetzner-Token NUR im Arbeitsspeicher ab.
#
# Warum es das gibt
# -----------------
# Das Hetzner-Abbild ist eine Kopie der ganzen Festplatte. Lag das Token in
# /etc/projectarmageddon/betrieb.env, steckte es in JEDEM Abbild (und damit in
# jedem später daraus erstellten Server). Dieses Skript legt es stattdessen in
# /run (tmpfs = Arbeitsspeicher): Es wird nie auf die Platte geschrieben, kommt in
# kein Abbild und ist nach einem Neustart weg.
#
# Preis dafür: Nach jedem Start des Servers muss das Token einmal neu gesetzt werden
# (30 Sekunden per SSH) — ODER du lässt das Cloud-Abbild von DEINEM Rechner machen
# (scripts/betrieb/abbild-lokal.sh), dann liegt das Token nie auf dem Server.
#
# Aufruf
#   sudo scripts/betrieb/token-setzen.sh           Token verdeckt eingeben
#   echo "$TOKEN" | sudo scripts/betrieb/token-setzen.sh --stdin
#   sudo scripts/betrieb/token-setzen.sh --loeschen   Token sofort aus dem Speicher entfernen
#
# Umgebung (für Tests): PA_TOKEN_DATEI, PA_TOKEN_PLATTE_OK=yes (erlaubt eine Datei
# außerhalb von tmpfs — NUR für Tests).

set -euo pipefail

PROGRAMM="${0##*/}"
TOKEN_DATEI="${PA_TOKEN_DATEI:-/run/projectarmageddon/hcloud-token}"
protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }

MODUS=eingabe
for arg in "$@"; do
  case "$arg" in
    --stdin) MODUS=stdin ;;
    --loeschen) MODUS=loeschen ;;
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) protokoll "unbekannte Option: $arg"; exit 2 ;;
  esac
done

if [ "$MODUS" = "loeschen" ]; then
  rm -f -- "$TOKEN_DATEI"
  protokoll "Token aus dem Speicher entfernt."
  exit 0
fi

verzeichnis=$(dirname "$TOKEN_DATEI")
mkdir -p "$verzeichnis"

# Nur auf tmpfs/ramfs: sonst wäre die ganze Idee dahin.
dateisystem=$(stat -f -c %T "$verzeichnis" 2>/dev/null || echo unbekannt)
case "$dateisystem" in
  tmpfs|ramfs) ;;
  *)
    if [ "${PA_TOKEN_PLATTE_OK:-no}" != "yes" ]; then
      protokoll "FEHLER: $verzeichnis liegt auf '$dateisystem', nicht im Arbeitsspeicher (tmpfs) — das Token käme in jedes Abbild. Abbruch."
      exit 1
    fi
    protokoll "WARNUNG: PA_TOKEN_PLATTE_OK=yes — Token landet auf der Platte (nur für Tests gedacht)."
    ;;
esac

if [ "$MODUS" = "stdin" ]; then
  IFS= read -r token || true
else
  if [ ! -t 0 ]; then protokoll "FEHLER: keine Eingabe möglich (--stdin verwenden)"; exit 1; fi
  printf 'Hetzner-Token (Eingabe bleibt unsichtbar): ' >&2
  read -rs token
  printf '\n' >&2
fi
token=$(printf '%s' "$token" | tr -d '[:space:]')
if [ -z "$token" ]; then protokoll "FEHLER: leeres Token"; exit 1; fi

if command -v hcloud >/dev/null 2>&1; then
  protokoll "Token wird geprüft (nur Lesen: hcloud server list) …"
  if ! HCLOUD_TOKEN="$token" hcloud server list -o noheader -o columns=name >/dev/null 2>&1; then
    protokoll "FEHLER: Hetzner akzeptiert das Token nicht. Nichts gespeichert."
    exit 1
  fi
fi

umask 077
temp=$(mktemp "$verzeichnis/.token.XXXXXX")
printf '%s\n' "$token" > "$temp"
chmod 600 "$temp"
mv -- "$temp" "$TOKEN_DATEI"
protokoll "Token liegt im Arbeitsspeicher: $TOKEN_DATEI (weg nach Neustart oder mit --loeschen)."
