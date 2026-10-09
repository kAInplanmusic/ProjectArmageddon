#!/usr/bin/env bash
#
# server-aus-abbild.sh — neuen Server aus dem NEUESTEN Abbild erstellen (auf deinem Rechner).
#
# Aufruf
#   server-aus-abbild.sh --name NAME --typ TYP --ort ORT --ssh-key KEY [--trocken]
# oder die Werte über PA_HCLOUD_SERVER / PA_HCLOUD_TYP / PA_HCLOUD_ORT / PA_HCLOUD_SSH_KEY.
# Das Abbild enthält Spiel, Spielstände und Konfiguration, aber KEIN Token.
# Die IP-Adresse ist neu (außer du hängst eine eigene Primary IP an).

set -euo pipefail

PROGRAMM="${0##*/}"
NAME="${PA_HCLOUD_SERVER:-}"; TYP="${PA_HCLOUD_TYP:-}"; ORT="${PA_HCLOUD_ORT:-}"; KEY="${PA_HCLOUD_SSH_KEY:-}"
LABEL="${PA_HCLOUD_LABEL:-projectarmageddon-snapshot=auto}"
TROCKEN=0
protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }
fehler() { protokoll "FEHLER: $*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --name) shift; NAME="${1:-}" ;;
    --typ) shift; TYP="${1:-}" ;;
    --ort) shift; ORT="${1:-}" ;;
    --ssh-key) shift; KEY="${1:-}" ;;
    --trocken) TROCKEN=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) protokoll "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done
for v in NAME TYP ORT KEY; do [ -n "${!v}" ] || fehler "$v fehlt (siehe --help)"; done
command -v hcloud >/dev/null 2>&1 || fehler "hcloud fehlt"

if hcloud server describe "$NAME" >/dev/null 2>&1; then
  fehler "Es gibt schon einen Server '$NAME' — nichts erstellt."
fi
liste=$(hcloud image list --type snapshot --selector "$LABEL" -o noheader -o columns=id) || fehler "Abbildliste nicht lesbar"
neueste=$(printf '%s\n' "$liste" | tr -d ' \t' | grep -E '^[0-9]+$' | sort -rn | head -n 1 || true)
[ -n "$neueste" ] || fehler "kein Abbild mit Label $LABEL gefunden"
protokoll "Neuestes Abbild: $neueste"
if [ "$TROCKEN" = "1" ]; then
  protokoll "TROCKENLAUF: hcloud server create --name $NAME --type $TYP --location $ORT --image $neueste --ssh-key $KEY"
  exit 0
fi
hcloud server create --name "$NAME" --type "$TYP" --location "$ORT" --image "$neueste" --ssh-key "$KEY" >&2
protokoll "Server '$NAME' erstellt. Danach: Cloud-Abbild nach dem Spiel von deinem Rechner (abbild-lokal.sh)."
