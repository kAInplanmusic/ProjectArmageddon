#!/usr/bin/env bash
#
# snapshot.sh — Sicherung des Gesamtstands vor dem Abschalten.
#
# Warum es das gibt
# -----------------
# Die Instanz läuft nur, wenn gespielt wird. Danach sind Spielstand, Replays,
# Protokolle und der genaue Programmstand nur noch auf diesem einen Knoten — und
# der kann wegfallen. Dieses Skript legt bei jedem Stopp einen Snapshot ab und
# behält nur die neuesten (Standard: 3). Ältere werden automatisch gelöscht.
#
# Zwei Ebenen
# -----------
#   1. ARCHIV (immer, ohne Cloud-Zugang): ein .tar.gz mit
#        - state/    Spielstände und Replays (PA_STATE_DIR, ohne die Snapshots selbst)
#        - logs/     Journal des Dienstes (letzte PA_SNAPSHOT_LOG_TAGE Tage)
#        - app/      Programmstand: git-Hash, nicht eingecheckte Änderungen, Quelltext
#                    (ohne Bilder/Videos; die sind über den Hash wiederherstellbar)
#        - config/   Betriebsparameter, Zugangsdaten GESCHWÄRZT
#        - manifest.json  Zeit, Grund, Rechner, Versionen, Prüfsummen
#   2. CLOUD-SNAPSHOT (optional, PA_SNAPSHOT_CLOUD=yes): ein Hetzner-Abbild des
#      ganzen Servers über die `hcloud`-CLI. Nur das überlebt, wenn der Server
#      GELÖSCHT wird. Hetzner rechnet einen ausgeschalteten Server weiter ab —
#      nur das Löschen beendet die Kosten (siehe docs/betrieb.md, Abschnitt 8).
#
# Sicherheitsregeln
# -----------------
#   - Es wird erst GELÖSCHT, wenn der neue Snapshot vollständig und geprüft da ist.
#     Schlägt die Erstellung fehl, bleiben ALLE alten Snapshots erhalten.
#   - Zugangsdaten (TOKEN, KEY, SECRET, PASSWORD, PASSWD) werden im Archiv
#     geschwärzt; HCLOUD_TOKEN wird nie protokolliert.
#   - Das Archiv wird unter einem Temporärnamen geschrieben und erst am Ende
#     umbenannt: ein abgebrochener Lauf hinterlässt kein halbes "gültiges" Archiv.
#   - Ein Sperrschloss (flock) verhindert zwei gleichzeitige Läufe.
#
# Aufruf
# ------
#   snapshot.sh                    Archiv erstellen, alte löschen
#   snapshot.sh --cloud            zusätzlich Hetzner-Abbild (auch wenn PA_SNAPSHOT_CLOUD=no)
#   snapshot.sh --nur-cloud        NUR das Hetzner-Abbild (das Archiv macht der Dienst selbst)
#   snapshot.sh --grund "Text"     Grund im Manifest (Standard: manuell)
#   snapshot.sh --trocken          nichts schreiben, nichts löschen, nur anzeigen
#   snapshot.sh --print-config     Parameter anzeigen
#
# Exit: 0 ok · 1 Fehler (alte Snapshots unberührt) · 2 falsche Bedienung

set -euo pipefail

PROGRAMM="${0##*/}"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT="${PA_ROOT:-$(cd "$SKRIPT_DIR/../.." && pwd)}"

PA_STATE_DIR="${PA_STATE_DIR:-$ROOT/.pa-state}"
PA_SNAPSHOT_DIR="${PA_SNAPSHOT_DIR:-$PA_STATE_DIR/snapshots}"
PA_SNAPSHOT_KEEP="${PA_SNAPSHOT_KEEP:-3}"
PA_SNAPSHOT_LOG_TAGE="${PA_SNAPSHOT_LOG_TAGE:-14}"
PA_SNAPSHOT_MIN_FREI_MB="${PA_SNAPSHOT_MIN_FREI_MB:-200}"
PA_SNAPSHOT_MIT_ASSETS="${PA_SNAPSHOT_MIT_ASSETS:-no}"
PA_SNAPSHOT_ENV_DATEI="${PA_SNAPSHOT_ENV_DATEI:-/etc/projectarmageddon/betrieb.env}"
PA_SYSTEMD_UNIT="${PA_SYSTEMD_UNIT:-projectarmageddon.service}"
PA_SNAPSHOT_CLOUD="${PA_SNAPSHOT_CLOUD:-no}"
PA_HCLOUD_SERVER="${PA_HCLOUD_SERVER:-}"
PA_HCLOUD_KEEP="${PA_HCLOUD_KEEP:-$PA_SNAPSHOT_KEEP}"
PA_HCLOUD_LABEL="${PA_HCLOUD_LABEL:-projectarmageddon-snapshot=auto}"
# Das Token liegt NICHT auf der Platte (sonst steckt es in jedem Abbild), sondern
# im Arbeitsspeicher: scripts/betrieb/token-setzen.sh
PA_HCLOUD_TOKEN_DATEI="${PA_HCLOUD_TOKEN_DATEI:-/run/projectarmageddon/hcloud-token}"

MODUS_ARCHIV=1
MODUS_CLOUD=0
TROCKEN=0
GRUND="manuell"
DRUCKE_CONFIG=0

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }
fehler() { protokoll "FEHLER: $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --cloud) MODUS_CLOUD=1 ;;
    --nur-cloud) MODUS_CLOUD=1; MODUS_ARCHIV=0 ;;
    --trocken) TROCKEN=1 ;;
    --print-config) DRUCKE_CONFIG=1 ;;
    --grund)
      shift
      if [ $# -eq 0 ]; then fehler "--grund braucht einen Text"; exit 2; fi
      GRUND="$1"
      ;;
    -h|--help) sed -n '2,50p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) fehler "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

if [ "$PA_SNAPSHOT_CLOUD" = "yes" ]; then MODUS_CLOUD=1; fi

ganzzahl() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# Eine falsche Aufbewahrungszahl darf NIE zum Löschen aller Snapshots führen.
if ! ganzzahl "$PA_SNAPSHOT_KEEP" || [ "$PA_SNAPSHOT_KEEP" -lt 1 ] || [ "$PA_SNAPSHOT_KEEP" -gt 50 ]; then
  fehler "PA_SNAPSHOT_KEEP='$PA_SNAPSHOT_KEEP' ist ungültig (erlaubt: 1 bis 50)"
  exit 2
fi
if ! ganzzahl "$PA_HCLOUD_KEEP" || [ "$PA_HCLOUD_KEEP" -lt 1 ] || [ "$PA_HCLOUD_KEEP" -gt 50 ]; then
  fehler "PA_HCLOUD_KEEP='$PA_HCLOUD_KEEP' ist ungültig (erlaubt: 1 bis 50)"
  exit 2
fi
if ! ganzzahl "$PA_SNAPSHOT_LOG_TAGE"; then
  fehler "PA_SNAPSHOT_LOG_TAGE='$PA_SNAPSHOT_LOG_TAGE' ist ungültig"
  exit 2
fi

drucke_config() {
  cat <<TEXT
$PROGRAMM — Parameter (Trockenlauf: es wird NICHTS geschrieben)
  Projektwurzel        : $ROOT
  Zustandsverzeichnis  : $PA_STATE_DIR
  Ablage der Snapshots : $PA_SNAPSHOT_DIR
  Aufbewahren          : die neuesten $PA_SNAPSHOT_KEEP (ältere werden gelöscht, erst NACH Erfolg)
  Journal              : $PA_SYSTEMD_UNIT, letzte $PA_SNAPSHOT_LOG_TAGE Tage
  Bilder/Videos        : $PA_SNAPSHOT_MIT_ASSETS (bei "no" nur über den git-Hash wiederherstellbar)
  Betriebsdatei        : $PA_SNAPSHOT_ENV_DATEI (Zugangsdaten werden geschwärzt)
  Mindestens frei      : ${PA_SNAPSHOT_MIN_FREI_MB} MB
  Cloud-Abbild         : $PA_SNAPSHOT_CLOUD (Server: ${PA_HCLOUD_SERVER:-LÜCKE}, Label: $PA_HCLOUD_LABEL, behalten: $PA_HCLOUD_KEEP)
  HCLOUD_TOKEN         : $( if [ -n "${HCLOUD_TOKEN:-}" ] || [ -f "$PA_HCLOUD_TOKEN_DATEI" ]; then echo "vorhanden (Arbeitsspeicher: $PA_HCLOUD_TOKEN_DATEI)"; else echo "NICHT gesetzt"; fi )
TEXT
}

if [ "$DRUCKE_CONFIG" = "1" ]; then drucke_config; exit 0; fi

# --------------------------------------------------------------- Hilfsfunktionen

schwaerze() { # stdin -> stdout: Werte von Zugangsdaten-Schlüsseln ersetzen
  sed -E 's/^([[:space:]]*(export[[:space:]]+)?[A-Za-z0-9_]*(TOKEN|KEY|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*[[:space:]]*=).*/\1***GESCHWÄRZT***/I'
}

pruefsumme() { sha256sum "$1" | cut -d' ' -f1; }

freier_platz_mb() {
  df -Pm "$1" 2>/dev/null | awk 'NR==2 { print $4 }'
}

# Neueste behalten, ältere löschen. Namen enthalten die UTC-Zeit und sortieren
# deshalb wie die Zeit. Gelöscht wird nur, was dem Muster EXAKT entspricht.
alte_archive_loeschen() {
  local anzahl=0 datei
  while IFS= read -r datei; do
    anzahl=$((anzahl + 1))
    if [ "$anzahl" -gt "$PA_SNAPSHOT_KEEP" ]; then
      protokoll "  alt, wird gelöscht: ${datei##*/}"
      if [ "$TROCKEN" = "1" ]; then continue; fi
      rm -f -- "$datei" "$datei.sha256"
    fi
  done < <(find "$PA_SNAPSHOT_DIR" -maxdepth 1 -type f -name 'pa-snapshot-[0-9]*T[0-9]*Z.tar.gz' | sort -r)
}

# ----------------------------------------------------------------------- Archiv

archiv_erstellen() {
  local zeit name ziel temp stage freie_mb rev="unbekannt" dirty="unbekannt" version="unbekannt"
  local liste_datei
  zeit=$(date -u +%Y%m%dT%H%M%SZ)
  name="pa-snapshot-$zeit.tar.gz"
  ziel="$PA_SNAPSHOT_DIR/$name"

  if [ "$TROCKEN" = "1" ]; then
    protokoll "TROCKENLAUF: würde $ziel erstellen und danach alle bis auf die neuesten $PA_SNAPSHOT_KEEP löschen."
    alte_archive_loeschen
    return 0
  fi

  mkdir -p "$PA_SNAPSHOT_DIR"
  freie_mb=$(freier_platz_mb "$PA_SNAPSHOT_DIR" || true)
  if [ -n "${freie_mb:-}" ] && [ "$freie_mb" -lt "$PA_SNAPSHOT_MIN_FREI_MB" ]; then
    fehler "nur ${freie_mb} MB frei in $PA_SNAPSHOT_DIR (verlangt: ${PA_SNAPSHOT_MIN_FREI_MB} MB) — nichts gelöscht"
    return 1
  fi

  stage=$(mktemp -d "$PA_SNAPSHOT_DIR/.stage.XXXXXX")
  temp="$PA_SNAPSHOT_DIR/.pa-snapshot-$zeit.tar.gz.tmp"
  AUFRAEUMEN=("$stage" "$temp")

  mkdir -p "$stage/state" "$stage/logs" "$stage/app" "$stage/config"

  # --- Zustand: alles unter PA_STATE_DIR, aber nicht die Snapshots selbst
  if [ -d "$PA_STATE_DIR" ]; then
    local zustand_abs snap_abs ausnahmen=(--exclude='./snapshots' --exclude='./.stage.*' --exclude='./.lock')
    zustand_abs=$(cd "$PA_STATE_DIR" && pwd)
    snap_abs=$(cd "$PA_SNAPSHOT_DIR" && pwd)
    case "$snap_abs" in
      "$zustand_abs"/*) ausnahmen+=(--exclude="./${snap_abs#"$zustand_abs"/}") ;;
    esac
    tar -C "$zustand_abs" "${ausnahmen[@]}" -cf - . 2>/dev/null | tar -C "$stage/state" -xf - 2>/dev/null || true
  fi
  # Persistenzdatei, falls sie außerhalb von PA_STATE_DIR liegt
  if [ -n "${PA_STATE_PATH:-}" ] && [ -f "$PA_STATE_PATH" ] && [ ! -e "$stage/state/$(basename "$PA_STATE_PATH")" ]; then
    cp -p -- "$PA_STATE_PATH" "$stage/state/"
  fi

  # --- Protokolle: Journal des Dienstes + lose .log-Dateien im Zustandsverzeichnis
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -u "$PA_SYSTEMD_UNIT" --no-pager -o short-iso \
      --since "${PA_SNAPSHOT_LOG_TAGE} days ago" > "$stage/logs/journal-dienst.log" 2>"$stage/logs/journal-fehler.txt" || true
    journalctl -k --no-pager -n 500 -o short-iso > "$stage/logs/kernel-letzte-500.log" 2>/dev/null || true
  else
    echo "journalctl nicht vorhanden" > "$stage/logs/HINWEIS.txt"
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl status "$PA_SYSTEMD_UNIT" --no-pager -l > "$stage/logs/dienst-status.txt" 2>&1 || true
  fi

  # --- Programmstand
  if command -v git >/dev/null 2>&1 && git -c "safe.directory=$ROOT" -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    rev=$(git -c "safe.directory=$ROOT" -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unbekannt)
    if [ -n "$(git -c "safe.directory=$ROOT" -C "$ROOT" status --porcelain 2>/dev/null)" ]; then dirty="ja"; else dirty="nein"; fi
    git -c "safe.directory=$ROOT" -C "$ROOT" log -n 20 --format='%H %ad %s' --date=iso > "$stage/app/git-log-20.txt" 2>/dev/null || true
    git -c "safe.directory=$ROOT" -C "$ROOT" diff HEAD > "$stage/app/nicht-eingecheckt.patch" 2>/dev/null || true
    local ausschluss=(':(exclude)*.png' ':(exclude)*.PNG' ':(exclude)*.jpg' ':(exclude)*.jpeg' ':(exclude)*.mov' ':(exclude)*.heic')
    if [ "$PA_SNAPSHOT_MIT_ASSETS" = "yes" ]; then ausschluss=(); fi
    git -c "safe.directory=$ROOT" -C "$ROOT" archive HEAD -- src scripts package.json package-lock.json index.html \
        vite.config.mjs public deploy "${ausschluss[@]}" 2>/dev/null | gzip > "$stage/app/quelltext.tar.gz" || true
  else
    echo "kein git-Arbeitsverzeichnis unter $ROOT — Programmstand nicht erfasst" > "$stage/app/HINWEIS.txt"
  fi
  if [ -f "$ROOT/package.json" ]; then
    version=$(grep -m1 '"version"' "$ROOT/package.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' || true)
  fi

  # --- Betriebsparameter, geschwärzt
  if [ -f "$PA_SNAPSHOT_ENV_DATEI" ]; then
    schwaerze < "$PA_SNAPSHOT_ENV_DATEI" > "$stage/config/betrieb.env.geschwaerzt"
  fi
  if [ -d "$ROOT/deploy/systemd" ]; then cp -r "$ROOT/deploy/systemd" "$stage/config/systemd" 2>/dev/null || true; fi

  # --- Manifest mit Prüfsummen
  {
    printf '{\n'
    printf '  "format": 1,\n'
    printf '  "erstelltUtc": "%s",\n' "$zeit"
    printf '  "grund": %s,\n' "$(printf '%s' "$GRUND" | jq -Rs . 2>/dev/null || printf '"%s"' "${GRUND//\"/}")"
    printf '  "rechner": "%s",\n' "$(hostname 2>/dev/null || echo unbekannt)"
    printf '  "paketVersion": "%s",\n' "$version"
    printf '  "gitHash": "%s",\n' "$rev"
    printf '  "nichtEingecheckteAenderungen": "%s",\n' "$dirty"
    printf '  "node": "%s",\n' "$(node -v 2>/dev/null || echo unbekannt)"
    printf '  "behaltenWerden": %s,\n' "$PA_SNAPSHOT_KEEP"
    printf '  "dateien": {\n'
    local erste=1 f
    while IFS= read -r f; do
      [ "$erste" = "1" ] || printf ',\n'
      erste=0
      printf '    "%s": "%s"' "${f#"$stage"/}" "$(pruefsumme "$f")"
    done < <(find "$stage" -type f ! -name manifest.json | sort)
    printf '\n  }\n}\n'
  } > "$stage/manifest.json"

  # --- Packen, prüfen, erst dann sichtbar machen
  tar -C "$stage" -czf "$temp" .
  if ! tar -tzf "$temp" >/dev/null 2>&1; then
    fehler "das Archiv ist nicht lesbar — verworfen, alte Snapshots bleiben"
    return 1
  fi
  liste_datei="$stage/.inhalt"
  tar -tzf "$temp" > "$liste_datei"
  if ! grep -q 'manifest.json' "$liste_datei"; then
    fehler "das Archiv enthält kein Manifest — verworfen, alte Snapshots bleiben"
    return 1
  fi
  mv -- "$temp" "$ziel"
  printf '%s  %s\n' "$(pruefsumme "$ziel")" "$name" > "$ziel.sha256"
  protokoll "Snapshot erstellt: $ziel ($(du -h "$ziel" | cut -f1), Grund: $GRUND)"

  alte_archive_loeschen
  protokoll "vorhanden: $(find "$PA_SNAPSHOT_DIR" -maxdepth 1 -type f -name 'pa-snapshot-*.tar.gz' | wc -l | tr -d ' ') Snapshot(s)"
}

# ------------------------------------------------------------------------ Cloud

cloud_snapshot() {
  if ! command -v hcloud >/dev/null 2>&1; then
    fehler "Cloud-Abbild gewünscht, aber die hcloud-CLI fehlt — nichts gelöscht"
    return 1
  fi
  # Token: Umgebung, sonst die Datei im Arbeitsspeicher.
  if [ -z "${HCLOUD_TOKEN:-}" ] && [ -f "$PA_HCLOUD_TOKEN_DATEI" ]; then
    local rechte
    rechte=$(stat -c %a "$PA_HCLOUD_TOKEN_DATEI" 2>/dev/null || echo unbekannt)
    if [ "$rechte" != "600" ] && [ "$rechte" != "400" ]; then
      fehler "$PA_HCLOUD_TOKEN_DATEI hat Rechte $rechte (verlangt: 600) — Token wird nicht gelesen"
      return 1
    fi
    HCLOUD_TOKEN=$(tr -d '[:space:]' < "$PA_HCLOUD_TOKEN_DATEI")
    export HCLOUD_TOKEN
  fi
  if [ -z "${HCLOUD_TOKEN:-}" ]; then
    fehler "kein Hetzner-Token im Arbeitsspeicher ($PA_HCLOUD_TOKEN_DATEI fehlt). Einmal nach dem Start: sudo scripts/betrieb/token-setzen.sh — oder das Abbild von deinem Rechner aus machen: scripts/betrieb/abbild-lokal.sh. Nichts gelöscht."
    return 1
  fi
  # SCHUTZ: Ein Token auf der Platte würde mit ins Abbild kopiert. Dann gibt es kein
  # Abbild — lieber keins als eins, das den Schlüssel zum Hetzner-Projekt enthält.
  if [ "${PA_SNAPSHOT_TOKEN_AUF_PLATTE_OK:-no}" != "yes" ] && [ -f "$PA_SNAPSHOT_ENV_DATEI" ] \
     && grep -Eq '^[[:space:]]*(export[[:space:]]+)?HCLOUD_TOKEN[[:space:]]*=[[:space:]]*[^[:space:]]' "$PA_SNAPSHOT_ENV_DATEI"; then
    fehler "In $PA_SNAPSHOT_ENV_DATEI steht ein HCLOUD_TOKEN — es käme in das Abbild. Abbruch. Zeile entfernen und das Token neu erzeugen (siehe docs/betrieb.md Abschnitt 8), nichts gelöscht."
    return 1
  fi
  if [ -z "$PA_HCLOUD_SERVER" ]; then
    fehler "PA_HCLOUD_SERVER (Name oder ID des Servers) ist nicht gesetzt — nichts gelöscht"
    return 1
  fi

  local zeit beschreibung
  zeit=$(date -u +%Y%m%dT%H%M%SZ)
  beschreibung="projectarmageddon $zeit ($GRUND)"

  if [ "$TROCKEN" = "1" ]; then
    protokoll "TROCKENLAUF: würde 'hcloud server create-image --type snapshot' für $PA_HCLOUD_SERVER ausführen und alle bis auf die neuesten $PA_HCLOUD_KEEP (Label $PA_HCLOUD_LABEL) löschen."
    return 0
  fi

  protokoll "Cloud-Abbild von $PA_HCLOUD_SERVER wird erstellt (das kann Minuten dauern) …"
  if ! hcloud server create-image --type snapshot --description "$beschreibung" \
        --label "$PA_HCLOUD_LABEL" "$PA_HCLOUD_SERVER" >&2; then
    fehler "hcloud meldete einen Fehler — alte Cloud-Abbilder bleiben UNBERÜHRT"
    return 1
  fi
  protokoll "Cloud-Abbild erstellt."

  # Nur Abbilder mit UNSEREM Label — andere Snapshots des Kontos werden nie angefasst.
  # Neuere Abbilder haben größere IDs.
  local liste id anzahl=0
  if ! liste=$(hcloud image list --type snapshot --selector "$PA_HCLOUD_LABEL" -o noheader -o columns=id 2>/dev/null); then
    fehler "Abbild-Liste nicht lesbar — es wird NICHTS gelöscht"
    return 1
  fi
  while IFS= read -r id; do
    id=$(printf '%s' "$id" | tr -d '[:space:]')
    [ -n "$id" ] || continue
    ganzzahl "$id" || { fehler "unerwartete Abbild-ID '$id' — es wird NICHTS gelöscht"; return 1; }
    anzahl=$((anzahl + 1))
    if [ "$anzahl" -gt "$PA_HCLOUD_KEEP" ]; then
      protokoll "  altes Cloud-Abbild wird gelöscht: $id"
      hcloud image delete "$id" >&2 || fehler "Löschen von $id schlug fehl"
    fi
  done < <(printf '%s\n' "$liste" | sort -rn)
}

# ------------------------------------------------------------------------- Ablauf

mkdir -p "$PA_SNAPSHOT_DIR" 2>/dev/null || true
# Achtung: `exec ... 2>/dev/null` würde stderr DAUERHAFT umlenken — deshalb in Klammern.
{ exec 9>"$PA_SNAPSHOT_DIR/.lock"; } 2>/dev/null || exec 9>/dev/null
if ! flock -n 9; then
  fehler "ein anderer Snapshot-Lauf ist aktiv — dieser wird übersprungen"
  exit 1
fi

AUFRAEUMEN=()
aufraeumen() { [ "${#AUFRAEUMEN[@]}" -eq 0 ] || rm -rf -- "${AUFRAEUMEN[@]}"; }
trap aufraeumen EXIT

ERGEBNIS=0
if [ "$MODUS_ARCHIV" = "1" ]; then archiv_erstellen || ERGEBNIS=1; fi
if [ "$MODUS_CLOUD" = "1" ]; then cloud_snapshot || ERGEBNIS=1; fi
exit "$ERGEBNIS"
