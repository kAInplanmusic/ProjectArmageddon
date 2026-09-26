#!/usr/bin/env bash
# =============================================================================
#  ProjectArmageddon — Startskript für eine gemietete Instanz
# =============================================================================
#
#  WAS DIESES SKRIPT TUT
#  ---------------------
#  1. Es prüft die Voraussetzungen (Node-Version, node_modules, Port, Bindeadresse).
#  2. Es startet den autoritativen Spielserver: `npm run server`.
#  3. Es startet DANACH die Idle-Bremse (`scripts/betrieb/idle-watch.sh`) als
#     Kindprozess. Die Bremse stoppt den Server, wenn er PA_IDLE_MINUTES lang
#     nicht benutzt wurde — oder wenn eine der beiden harten Fristen greift
#     (Serverlaufzeit, Maschinenlaufzeit). Ohne diese Klammer wäre ein
#     vergessener Knoten genau der Fall vom 2026-09-25 (AGENTS.md §5).
#
#  Kein gemieteter Knoten nötig, um das hier zu prüfen:
#      bash -n scripts/betrieb/server-start.sh
#      scripts/betrieb/server-start.sh --print-config
#
#  Auf dem Knoten / unter systemd:
#      systemctl start projectarmageddon.service
#  Dort wird dieses Skript von `deploy/systemd/projectarmageddon.service`
#  gestartet und die Bremse läuft mit. Zusätzlich läuft der systemd-Timer
#  `projectarmageddon-idle.timer` (siehe deploy/systemd/), der auch dann
#  prüft, wenn dieser Startprozess gar nicht mehr existiert — z. B. nachdem
#  eine SSH-Sitzung abgerissen ist.
#
#  SICHERHEIT (siehe docs/betrieb.md, Abschnitt 3)
#  -----------------------------------------------
#  Der Server hat KEINE Anmeldung und KEINE Verschlüsselung. Standard ist
#  deshalb HOST=127.0.0.1. Wer auf 0.0.0.0 binden will, muss das ausdrücklich
#  freischalten (PA_ERLAUBE_OEFFENTLICH=yes) — und dann gehört ein
#  Reverse-Proxy mit TLS davor.
#
#  RÜCKGABEWERTE
#  -------------
#    0  Server normal beendet (auch nach einer Idle-Bremse)
#    1  Aufruf-/Voraussetzungsfehler (z. B. Port belegt, node_modules fehlt)
#    N  Rückgabewert des Servers, wenn er von selbst gescheitert ist
# =============================================================================
set -euo pipefail

# Job-Kontrolle: der Server läuft in einer EIGENEN Prozessgruppe. Nur so kann
# `npm run server` samt Kindprozess (node) mit einem Signal beendet werden —
# sonst bleibt der node-Prozess nach dem Stoppen von npm zurück.
set -m

PROGRAMM="${0##*/}"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SKRIPT_DIR/../.." && pwd)
BREMSE="$SKRIPT_DIR/idle-watch.sh"

# ----------------------------------------------------------------- Parameter --
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
LOG_LEVEL="${LOG_LEVEL:-info}"
LOG_FORMAT="${LOG_FORMAT:-json}"
PA_STATE_PATH="${PA_STATE_PATH:-$ROOT/.pa-state/lobbies.json}"
PA_ERLAUBE_OEFFENTLICH="${PA_ERLAUBE_OEFFENTLICH:-no}"
PA_BUILD="${PA_BUILD:-auto}"

# Abschaltparameter — identisch zu idle-watch.sh, damit beide dasselbe meinen.
PA_IDLE_MINUTES="${PA_IDLE_MINUTES:-15}"
PA_MAX_RUNTIME_MINUTES="${PA_MAX_RUNTIME_MINUTES:-180}"
PA_MAX_MACHINE_MINUTES="${PA_MAX_MACHINE_MINUTES:-}"
PA_GRACE_MINUTES="${PA_GRACE_MINUTES:-5}"
PA_ACTION="${PA_ACTION:-stop}"
PA_POWEROFF_CONFIRM="${PA_POWEROFF_CONFIRM:-no}"
PA_POWEROFF_DELAY_SECONDS="${PA_POWEROFF_DELAY_SECONDS:-30}"
PA_SYSTEMD_UNIT="${PA_SYSTEMD_UNIT:-projectarmageddon.service}"
PA_STATE_DIR="${PA_STATE_DIR:-${TMPDIR:-/tmp}/projectarmageddon-idle}"
PA_ARMED_FILE="${PA_ARMED_FILE:-/etc/projectarmageddon/ist-gemietet}"
PA_INTERVAL_SECONDS="${PA_INTERVAL_SECONDS:-30}"
PA_BREMSE_DATEI="${PA_BREMSE_DATEI:-$PA_STATE_DIR/bremse}"
PA_HEALTH_URL="${PA_HEALTH_URL:-http://127.0.0.1:${PORT}/healthz}"

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }

# Alle Abschaltparameter an die Bremse weiterreichen — auch dann, wenn sie hier
# nur als Vorgabe gesetzt wurden und nicht aus der Umgebung kamen.
export PA_IDLE_MINUTES PA_MAX_RUNTIME_MINUTES PA_MAX_MACHINE_MINUTES PA_GRACE_MINUTES
export PA_ACTION PA_POWEROFF_CONFIRM PA_POWEROFF_DELAY_SECONDS PA_SYSTEMD_UNIT
export PA_STATE_DIR PA_ARMED_FILE PA_INTERVAL_SECONDS PA_BREMSE_DATEI
export PA_HEALTH_URL PORT HOST

# ------------------------------------------------------------ Trockenlauf ----
drucke_config() {
  local bau="nur wenn dist/ fehlt"
  if [ "$PA_BUILD" = "1" ]; then bau="immer (npm run build)"; fi
  if [ "$PA_BUILD" = "0" ]; then bau="nein"; fi

  cat <<TEXT
$PROGRAMM — Startparameter (Trockenlauf: es wird NICHTS gestartet)
  Projektwurzel        : $ROOT
  Gestartet wird       : npm run server   (Arbeitsverzeichnis $ROOT)
  Bindung              : http://$HOST:$PORT
  Umgebung             : LOG_LEVEL=$LOG_LEVEL LOG_FORMAT=$LOG_FORMAT
                         PA_STATE_PATH=$PA_STATE_PATH
  Build vor dem Start  : $bau
  Öffentlich erlaubt   : $PA_ERLAUBE_OEFFENTLICH (bei "no" bricht das Skript bei HOST != 127.0.0.1 ab)
  Bremse               : $BREMSE (Kindprozess, Takt ${PA_INTERVAL_SECONDS}s)
  Signaldatei          : $PA_BREMSE_DATEI

$(bash "$BREMSE" --print-config)

  Erwarteter Ablauf auf dem Knoten
    1. npm run server        — der autoritative Server hört auf $HOST:$PORT
    2. idle-watch.sh         — prüft im Takt ${PA_INTERVAL_SECONDS}s gegen ${PA_HEALTH_URL}
    3. Nach ${PA_IDLE_MINUTES} min ohne Aktivität (oder bei der harten
       Serverlaufzeit von ${PA_MAX_RUNTIME_MINUTES} min) stoppt die Bremse den
       Server; bei PA_ACTION=poweroff zusätzlich den ganzen Knoten.
TEXT
}

# ------------------------------------------------------------- Prüfungen -----
pruefe_voraussetzungen() {
  local fehler=0

  if ! command -v node >/dev/null 2>&1; then
    protokoll "FEHLER: node fehlt."
    fehler=1
  else
    local major
    major=$(node -p 'process.versions.node.split(".")[0]')
    if [ "$major" -lt 22 ]; then
      protokoll "FEHLER: Node $major gefunden, package.json verlangt >= 22."
      fehler=1
    fi
  fi

  if ! command -v npm >/dev/null 2>&1; then
    protokoll "FEHLER: npm fehlt."
    fehler=1
  fi

  if [ ! -d "$ROOT/node_modules" ]; then
    protokoll "FEHLER: $ROOT/node_modules fehlt — vorher 'npm install' ausführen."
    fehler=1
  fi

  case "$PORT" in
    ''|*[!0-9]*)
      protokoll "FEHLER: PORT=\"$PORT\" ist keine Zahl."
      fehler=1
      ;;
  esac

  case "$HOST" in
    127.0.0.1|localhost|::1) : ;;
    *)
      if [ "$PA_ERLAUBE_OEFFENTLICH" != "yes" ]; then
        protokoll "ABBRUCH: HOST=$HOST bindet nach außen."
        protokoll "  Der Server hat KEINE Anmeldung und KEINE Verschlüsselung"
        protokoll "  (siehe docs/betrieb.md, Abschnitt 3). Wer das trotzdem will:"
        protokoll "  PA_ERLAUBE_OEFFENTLICH=yes — und einen Reverse-Proxy mit TLS davor."
        fehler=1
      else
        protokoll "WARNUNG: HOST=$HOST — der Server ist ohne Anmeldung erreichbar."
      fi
      ;;
  esac

  if [ ! -x "$BREMSE" ] && [ ! -f "$BREMSE" ]; then
    protokoll "FEHLER: Idle-Bremse nicht gefunden ($BREMSE)."
    protokoll "  Ohne Bremse wird nicht gestartet: ein laufender Server ohne"
    protokoll "  Abschaltung ist genau der Fall aus AGENTS.md §5."
    fehler=1
  fi

  if [ "$fehler" -ne 0 ]; then
    return 1
  fi
  return 0
}

# ------------------------------------------------------------------- Ablauf ---
fall=""
if [ "${1:-}" = "--print-config" ] || [ "${1:-}" = "--dry-run" ]; then
  fall="trockenlauf"
elif [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
elif [ -n "${1:-}" ]; then
  printf '%s: unbekannter Aufruf „%s". Erlaubt: --print-config, --help\n' "$PROGRAMM" "$1" >&2
  exit 1
fi

if [ "$fall" = "trockenlauf" ]; then
  if [ ! -f "$BREMSE" ]; then
    protokoll "FEHLER: Idle-Bremse nicht gefunden ($BREMSE)."
    exit 1
  fi
  drucke_config
  exit 0
fi

pruefe_voraussetzungen || exit 1

if [ "$PA_BUILD" = "1" ] || { [ "$PA_BUILD" = "auto" ] && [ ! -d "$ROOT/dist" ]; }; then
  protokoll "Baue den Client (npm run build) …"
  ( cd "$ROOT" && npm run build )
fi

# Reste einer früheren Bremse entfernen: eine alte Signaldatei würde den
# Server sonst sofort wieder stoppen.
rm -f "$PA_BREMSE_DATEI"
mkdir -p "$PA_STATE_DIR"
mkdir -p "$(dirname "$PA_STATE_PATH")"

protokoll "Starte: npm run server  (HOST=$HOST PORT=$PORT)"
(
  cd "$ROOT"
  exec npm run server
) &
SERVER_PID=$!

protokoll "Bremse läuft mit: Leerlauf ${PA_IDLE_MINUTES} min, Serverlaufzeit ${PA_MAX_RUNTIME_MINUTES} min, Takt ${PA_INTERVAL_SECONDS}s, Aktion ${PA_ACTION}"
PA_PORT="$PORT" \
PA_HEALTH_URL="$PA_HEALTH_URL" \
PA_SERVER_PID="$SERVER_PID" \
  "$BREMSE" &
BREMSE_PID=$!

beende() {
  protokoll "Signal empfangen — beende Server und Bremse."
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
  kill -TERM "$BREMSE_PID" 2>/dev/null || true
}

trap beende INT TERM

# Warteschleife: endet, wenn der Server von selbst endet ODER die Bremse
# ausgelöst hat. Die Signaldatei ist der Weg, den die Bremse ohne systemd hat.
while kill -0 "$SERVER_PID" 2>/dev/null; do
  if [ -f "$PA_BREMSE_DATEI" ]; then
    protokoll "IDLE-BREMSE HAT AUSGELÖST ($(cat "$PA_BREMSE_DATEI")) — stoppe den Server."
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    break
  fi
  sleep 1
done

rc=0
wait "$SERVER_PID" 2>/dev/null || rc=$?
kill -TERM "$BREMSE_PID" 2>/dev/null || true

if [ -f "$PA_BREMSE_DATEI" ]; then
  protokoll "Ende: der Server wurde von der Idle-Bremse gestoppt (rc=$rc)."
  protokoll "Nachweis: cat $PA_BREMSE_DATEI"
  exit 0
fi

protokoll "Ende: der Server ist selbst beendet (rc=$rc)."
exit "$rc"
