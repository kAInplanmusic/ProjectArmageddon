#!/usr/bin/env bash
#
# snapshot-einrichten.sh — schaltet die Sicherung (und optional die Cloud-Ebene)
# auf dem Knoten ein. Läuft als root auf dem gemieteten Server, EINMAL.
#
# Was es tut
#   1. legt /etc/projectarmageddon/betrieb.env an (Rechte 600), falls sie fehlt
#   2. trägt die PA_SNAPSHOT_*-Zeilen ein bzw. aktualisiert sie (mehrfach aufrufbar,
#      keine doppelten Zeilen, fremde Zeilen bleiben)
#   3. Cloud-Ebene (nur mit --cloud): installiert `hcloud` (wenn möglich), liest das
#      Token (verdeckt, oder aus HCLOUD_TOKEN), PRÜFT es mit einer reinen Leseabfrage
#      und legt es NUR im Arbeitsspeicher ab (token-setzen.sh) — nie auf der Platte
#   4. zeigt die geltende Konfiguration und macht einen Trockenlauf
#   5. erst mit --erstes-abbild wird ein ECHTES Archiv bzw. Cloud-Abbild erzeugt
#
# Aufruf
#   sudo scripts/betrieb/snapshot-einrichten.sh                 nur Archiv-Ebene
#   sudo scripts/betrieb/snapshot-einrichten.sh --cloud         + Hetzner-Abbild
#   sudo scripts/betrieb/snapshot-einrichten.sh --cloud --erstes-abbild
#
# Umgebung (alles optional)
#   HCLOUD_TOKEN       Token, statt es einzutippen
#   PA_HCLOUD_SERVER   Servername bei Hetzner (Vorgabe: Hostname dieses Rechners)
#   PA_SNAPSHOT_KEEP   wie viele bleiben (Vorgabe 3)
#   PA_ETC             Konfigurationsordner (Vorgabe /etc/projectarmageddon; für Tests)
#
# Das Token wird nie ausgegeben, nie ins Repo und nie auf die Platte geschrieben.

set -euo pipefail

PROGRAMM="${0##*/}"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ETC="${PA_ETC:-/etc/projectarmageddon}"
ENV_DATEI="$ETC/betrieb.env"
KEEP="${PA_SNAPSHOT_KEEP:-3}"
SNAPSHOT_DIR="${PA_SNAPSHOT_DIR:-/var/lib/projectarmageddon/snapshots}"

CLOUD=0
ERSTES=0
for arg in "$@"; do
  case "$arg" in
    --cloud) CLOUD=1 ;;
    --erstes-abbild) ERSTES=1 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }

if [ -z "${PA_ETC:-}" ] && [ "$(id -u)" -ne 0 ]; then
  protokoll "FEHLER: bitte als root ausführen (sudo) — die Datei liegt unter $ETC."
  exit 1
fi

case "$KEEP" in ''|*[!0-9]*) protokoll "FEHLER: PA_SNAPSHOT_KEEP='$KEEP' ist keine Zahl"; exit 2 ;; esac
if [ "$KEEP" -lt 1 ] || [ "$KEEP" -gt 50 ]; then protokoll "FEHLER: PA_SNAPSHOT_KEEP muss 1 bis 50 sein"; exit 2; fi

# Schlüssel=Wert setzen: vorhandene Zeile ersetzen, sonst anhängen. Werte kommen über
# die Umgebung, nicht über die sed-Zeile — Sonderzeichen im Token bleiben unversehrt.
setze_schluessel() { # $1 Schlüssel, $2 Wert
  local schluessel="$1" wert="$2" temp
  temp=$(mktemp "$ETC/.env.XXXXXX")
  chmod 600 "$temp"
  SCHLUESSEL="$schluessel" WERT="$wert" awk '
    BEGIN { k = ENVIRON["SCHLUESSEL"]; w = ENVIRON["WERT"]; gesetzt = 0 }
    index($0, k "=") == 1 { if (!gesetzt) { print k "=" w; gesetzt = 1 } ; next }
    { print }
    END { if (!gesetzt) print k "=" w }
  ' "$ENV_DATEI" > "$temp"
  mv -- "$temp" "$ENV_DATEI"
  chmod 600 "$ENV_DATEI"
}

# Entfernt eine Zeile HCLOUD_TOKEN=… aus der betrieb.env. Die Datei wird neu
# geschrieben, die alte vorher überschrieben (best effort — auf Journaling-
# Dateisystemen ist Überschreiben keine Garantie: im Zweifel Token neu erzeugen).
entferne_token_aus_datei() {
  if ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?HCLOUD_TOKEN[[:space:]]*=' "$ENV_DATEI" 2>/dev/null; then return 0; fi
  local temp
  temp=$(mktemp "$ETC/.env.XXXXXX")
  chmod 600 "$temp"
  grep -Ev '^[[:space:]]*(export[[:space:]]+)?HCLOUD_TOKEN[[:space:]]*=' "$ENV_DATEI" > "$temp" || true
  command -v shred >/dev/null 2>&1 && shred -n 1 "$ENV_DATEI" 2>/dev/null || true
  mv -- "$temp" "$ENV_DATEI"
  chmod 600 "$ENV_DATEI"
  protokoll "ACHTUNG: In der betrieb.env stand ein HCLOUD_TOKEN — entfernt. Bereits erstellte Abbilder können es noch enthalten: das Token in der Hetzner-Console LÖSCHEN und ein neues erzeugen."
}

mkdir -p "$ETC"
if [ ! -f "$ENV_DATEI" ]; then
  : > "$ENV_DATEI"
  chmod 600 "$ENV_DATEI"
  protokoll "angelegt: $ENV_DATEI (Rechte 600)"
fi

setze_schluessel PA_SNAPSHOT_DIR "$SNAPSHOT_DIR"
setze_schluessel PA_SNAPSHOT_KEEP "$KEEP"
setze_schluessel PA_SNAPSHOT_LOG_TAGE "${PA_SNAPSHOT_LOG_TAGE:-14}"
setze_schluessel PA_SNAPSHOT_MIT_ASSETS "${PA_SNAPSHOT_MIT_ASSETS:-no}"

if [ "$CLOUD" = "1" ]; then
  if ! command -v hcloud >/dev/null 2>&1; then
    protokoll "hcloud fehlt — Installation per apt wird versucht …"
    if command -v apt-get >/dev/null 2>&1 && apt-get install -y hcloud-cli >&2; then
      protokoll "hcloud installiert."
    else
      protokoll "FEHLER: hcloud konnte nicht installiert werden. Von Hand: https://github.com/hetznercloud/cli/releases"
      exit 1
    fi
  fi

  token="${HCLOUD_TOKEN:-}"
  if [ -z "$token" ]; then
    if [ ! -t 0 ]; then
      protokoll "FEHLER: kein HCLOUD_TOKEN und keine Eingabe möglich."
      exit 1
    fi
    printf 'Hetzner-Token (Eingabe bleibt unsichtbar): ' >&2
    read -rs token
    printf '\n' >&2
  fi
  if [ -z "$token" ]; then protokoll "FEHLER: leeres Token"; exit 1; fi

  server="${PA_HCLOUD_SERVER:-$(hostname)}"

  # Reine Leseabfrage: ändert nichts bei Hetzner.
  protokoll "Token wird geprüft (nur Lesen: hcloud server list) …"
  if ! HCLOUD_TOKEN="$token" hcloud server list -o noheader -o columns=name > "$ETC/.serverliste" 2>/dev/null; then
    rm -f "$ETC/.serverliste"
    protokoll "FEHLER: Das Token wurde von Hetzner nicht akzeptiert (oder keine Verbindung). Nichts gespeichert."
    exit 1
  fi
  if ! grep -qx "$server" "$ETC/.serverliste"; then
    protokoll "FEHLER: Es gibt keinen Server namens '$server' in diesem Hetzner-Projekt. Vorhanden:"
    sed 's/^/    /' "$ETC/.serverliste" >&2
    rm -f "$ETC/.serverliste"
    protokoll "Nichts gespeichert. Mit PA_HCLOUD_SERVER=<Name> erneut aufrufen."
    exit 1
  fi
  rm -f "$ETC/.serverliste"

  setze_schluessel PA_SNAPSHOT_CLOUD yes
  setze_schluessel PA_HCLOUD_SERVER "$server"
  # Das Token kommt NICHT in die betrieb.env (die steckt in jedem Abbild), sondern
  # in den Arbeitsspeicher. Ein früher dort eingetragenes Token wird entfernt.
  entferne_token_aus_datei
  printf '%s\n' "$token" | "$SKRIPT_DIR/token-setzen.sh" --stdin
  protokoll "Cloud-Ebene eingeschaltet für Server '$server' (Token nur im Arbeitsspeicher)."
else
  setze_schluessel PA_SNAPSHOT_CLOUD no
  entferne_token_aus_datei
fi

# Die Datei wird NICHT mit `source` gelesen (ein Wert mit Sonderzeichen wäre sonst
# ein Shell-Befehl). Das Snapshot-Skript bekommt genau die Werte, die eben gesetzt wurden.
export PA_SNAPSHOT_DIR="$SNAPSHOT_DIR" PA_SNAPSHOT_KEEP="$KEEP"
export PA_SNAPSHOT_LOG_TAGE="${PA_SNAPSHOT_LOG_TAGE:-14}" PA_SNAPSHOT_MIT_ASSETS="${PA_SNAPSHOT_MIT_ASSETS:-no}"
export PA_SNAPSHOT_ENV_DATEI="$ENV_DATEI"
if [ "$CLOUD" = "1" ]; then
  export PA_SNAPSHOT_CLOUD=yes PA_HCLOUD_SERVER="$server" HCLOUD_TOKEN="$token"  # nur für diesen Prozess
  CLOUD_OPTION="--cloud "
else
  export PA_SNAPSHOT_CLOUD=no
  CLOUD_OPTION=""
fi

protokoll "Konfiguration:"
"$SKRIPT_DIR/snapshot.sh" --print-config >&2

protokoll "Trockenlauf (schreibt und löscht nichts) …"
"$SKRIPT_DIR/snapshot.sh" --trocken --grund "Einrichtung" >&2

if [ "$ERSTES" = "1" ]; then
  protokoll "Erstes ECHTES Abbild …"
  "$SKRIPT_DIR/snapshot.sh" ${CLOUD_OPTION}--grund "Einrichtung: erstes Abbild" >&2
else
  protokoll "Fertig. Noch nichts erzeugt. Erstes echtes Abbild: $0 ${CLOUD_OPTION}--erstes-abbild"
fi
