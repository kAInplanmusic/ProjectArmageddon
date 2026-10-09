#!/usr/bin/env bash
# =============================================================================
#  ProjectArmageddon — Idle-Bremse für eine GEMIETETE Instanz
# =============================================================================
#
#  WAS DIESE DATEI IST
#  -------------------
#  Die Abschaltung nach AGENTS.md §5 Punkt 2: eine Bremse, die OHNE Zutun
#  greift. Sie läuft AUF DEM KNOTEN (als systemd-Timer), nicht im Repo — denn
#  eine Datei im Repo ist kein laufender Dienst (siehe AGENTS.md §5, der Fall
#  der fünf Hetzner-Server vom 2026-09-25).
#
#  DIE DREI BREMSSCHWELLEN
#  -----------------------
#  1. LEERLAUF          — seit PA_IDLE_MINUTES kein Lebenszeichen mehr:
#                         0 Sitzungen, 0 Lobbys, keine gestiegenen Zähler,
#                         keine offene TCP-Verbindung am Spielport.
#  2. SERVERLAUFZEIT    — der Serverprozess läuft länger als
#                         PA_MAX_RUNTIME_MINUTES. Greift IMMER, auch bei
#                         offenen Verbindungen (das Ablaufdatum).
#  3. MASCHINENLAUFZEIT — der KNOTEN läuft länger als PA_MAX_MACHINE_MINUTES
#                         (aus /proc/uptime). Greift auch dann, wenn der
#                         Server nie gestartet wurde — sonst kostet ein
#                         vergessener, nie benutzter Knoten weiter Geld.
#
#  WAS ALS „BENUTZUNG" ZÄHLT (gemessen, nicht angenommen)
#  -----------------------------------------------------
#  Aus /healthz (siehe src/server/gameServer.js): `sessions`, `lobbies` und die
#  fortlaufenden Zähler `snapshotsSent`, `commandsAccepted`, `connections`.
#  Steigt einer dieser Zähler gegenüber der letzten Messung, gilt der Server
#  als benutzt und der Leerlauf beginnt von vorn. Zusätzlich wird die Zahl der
#  offenen TCP-Verbindungen am Spielport gezählt (`ss`), damit ein Client, der
#  nur im Menü sitzt, nicht abgeschaltet wird.
#
#  VERHALTEN BEI UNWISSENHEIT
#  --------------------------
#  Lässt sich der Zustand nicht messen (kein curl/wget, kaputtes JSON), wird
#  NICHT abgeschaltet und eine Warnung geschrieben: Ein falsches Abschalten
#  wäre schlimmer als ein paar Minuten später abzuschalten. Die beiden harten
#  Fristen (Serverlaufzeit, Maschinenlaufzeit) hängen nur an der Uhr und am
#  Prozess und greifen deshalb auch dann — die Kosten bleiben begrenzt.
#
#  WARUM DIE BREMSE AUF DEM KNOTEN „SCHARF GESCHALTET" WERDEN MUSS
#  ---------------------------------------------------------------
#  PA_ARMED_FILE (Vorgabe /etc/projectarmageddon/ist-gemietet) muss auf dem
#  Knoten liegen, sonst tut die Bremse NICHTS und sagt das laut. Damit kann
#  diese Datei nicht versehentlich den Arbeitsrechner des Entwicklers
#  abschalten. Der Marker ist Teil des NACHWEISES: fehlt er, ist die Bremse
#  nicht scharf — und das sieht man (`--print-config`, `systemctl list-timers`).
#
#  RÜCKGABEWERTE
#  -------------
#    0  geprüft, kein Handlungsbedarf
#   10  Bremse hat ausgelöst (im Trockenlauf: hätte ausgelöst)
#   11  Handlungsbedarf, aber NICHT SCHARF (Marker fehlt) — keine Aktion
#   12  Abschaltung des Knotens verlangt, aber nicht bestätigt — keine Aktion
#    1  Aufruf-/Parameterfehler
#
#  NACHWEIS (AGENTS.md §5 Punkt 3) — auf dem KNOTEN, nicht hier:
#    systemctl list-timers projectarmageddon-idle.timer
#    systemctl status projectarmageddon-idle.service --no-pager
#    ls -l /etc/projectarmageddon/ist-gemietet
#    scripts/betrieb/idle-watch.sh --print-config
#  Siehe docs/betrieb-INSTANZ.md, Abschnitt „Nachweis".
# =============================================================================
set -euo pipefail

PROGRAMM="${0##*/}"

# ----------------------------------------------------------------- Parameter --
PA_HEALTH_URL="${PA_HEALTH_URL:-http://127.0.0.1:${PORT:-3000}/healthz}"
PA_PORT="${PA_PORT:-${PORT:-3000}}"
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
PA_BREMSE_DATEI="${PA_BREMSE_DATEI:-}"
PA_SERVER_PID="${PA_SERVER_PID:-}"
PA_INTERVAL_SECONDS="${PA_INTERVAL_SECONDS:-30}"
PA_DRY_RUN="${PA_DRY_RUN:-0}"
PA_SNAPSHOT_SKRIPT="${PA_SNAPSHOT_SKRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/snapshot.sh}"

# Ergebnis des Durchlaufs (überlebt als globale Größe, damit die Funktionen
# unter `set -e` nicht als „Fehler" hochblubbern).
ERGEBNIS_CODE=0

# ---------------------------------------------------------------- Ausgabe ----
protokoll() {
  printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2
}

# ------------------------------------------------------------- Rechenhilfen --
minuten_in_sekunden() { awk -v m="$1" 'BEGIN { printf "%d", (m + 0) * 60 }'; }

# Zahl-Vergleich über awk: bash kann keine Dezimalzahlen in [ ].
zahl_ge() { awk -v a="$1" -v b="$2" 'BEGIN { exit !((a + 0) >= (b + 0)) }'; }

# ------------------------------------------------------- Zustand des Servers --
# Erstes Vorkommen des Schlüssels; -1 heißt „nicht gefunden".
feld() {
  local schluessel="$1" json="$2" wert=""
  wert=$(printf '%s' "$json" | grep -o "\"$schluessel\":[0-9][0-9]*" | head -n 1 | cut -d: -f2 || true)
  printf '%s' "${wert:--1}"
}

# Rückgabe 0 = ok (JSON auf stdout), 1 = nicht erreichbar, 2 = kein Werkzeug.
hole_health() {
  local json="" rc=0
  if command -v curl >/dev/null 2>&1; then
    json=$(curl -fsS --max-time 5 "$PA_HEALTH_URL" 2>/dev/null) || rc=$?
  elif command -v wget >/dev/null 2>&1; then
    json=$(wget -q -O - --timeout=5 "$PA_HEALTH_URL" 2>/dev/null) || rc=$?
  else
    protokoll "WARNUNG: weder curl noch wget vorhanden — Zustand nicht messbar."
    return 2
  fi
  if [ "$rc" -ne 0 ] || [ -z "$json" ]; then
    return 1
  fi
  printf '%s' "$json"
}

# Offene TCP-Verbindungen am Spielport (-1 = nicht messbar).
zaehle_verbindungen() {
  local n=""
  if command -v ss >/dev/null 2>&1; then
    n=$(ss -Htn "sport = :$PA_PORT" 2>/dev/null | wc -l | tr -d ' ') || true
  elif command -v netstat >/dev/null 2>&1; then
    n=$(netstat -tn 2>/dev/null | grep -c ":$PA_PORT " || true)
  fi
  printf '%s' "${n:--1}"
}

# Läuft die systemd-Einheit? (0 = ja)
dienst_laeuft() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl is-active --quiet "$PA_SYSTEMD_UNIT" 2>/dev/null
}

# ------------------------------------------------------------- Zustandsdatei --
zustand_lese() { # $1 Datei, $2 Vorgabe
  local pfad="$PA_STATE_DIR/$1"
  if [ -f "$pfad" ]; then
    cat "$pfad"
  else
    printf '%s' "${2:-}"
  fi
}

zustand_schreiben() { # $1 Datei, $2 Inhalt
  mkdir -p "$PA_STATE_DIR"
  printf '%s\n' "$2" > "$PA_STATE_DIR/$1"
}

# Ist die Bremse auf diesem Knoten scharf geschaltet?
scharf() {
  if [ -z "$PA_ARMED_FILE" ]; then
    return 0          # ausdrücklich abgeschaltet (nur für Prüfläufe gedacht)
  fi
  if [ -e "$PA_ARMED_FILE" ]; then
    return 0
  fi
  return 1
}

# -------------------------------------------------------------- Abschaltung --
stoppe_server() {
  if dienst_laeuft; then
    protokoll "  → systemctl stop $PA_SYSTEMD_UNIT"
    systemctl stop "$PA_SYSTEMD_UNIT" || protokoll "  ! stop meldete einen Fehler"
    return 0
  fi
  if [ -n "$PA_BREMSE_DATEI" ]; then
    protokoll "  → Signaldatei an den Startprozess: $PA_BREMSE_DATEI"
    mkdir -p "$(dirname "$PA_BREMSE_DATEI")"
    printf '%s\n' "$(date -Is)" > "$PA_BREMSE_DATEI"
    return 0
  fi
  if [ -n "$PA_SERVER_PID" ] && kill -0 "$PA_SERVER_PID" 2>/dev/null; then
    protokoll "  → SIGTERM an PID $PA_SERVER_PID"
    kill -TERM "$PA_SERVER_PID" || true
    return 0
  fi
  protokoll "  ! Kein Weg zum Server gefunden: Einheit nicht aktiv, keine Signaldatei, keine PID."
  return 1
}

bremse() { # $1 Grund, $2 Beleg
  local grund="$1" beleg="$2"
  protokoll "BREMSE: $grund — $beleg"

  if ! scharf; then
    protokoll "  NICHT SCHARF: $PA_ARMED_FILE fehlt — es passiert NICHTS."
    protokoll "  Nachweis nach dem Mieten: ls -l $PA_ARMED_FILE"
    ERGEBNIS_CODE=11
    return 0
  fi

  if [ "$PA_DRY_RUN" = "1" ]; then
    protokoll "  TROCKENLAUF: hier würde jetzt gestoppt (PA_ACTION=$PA_ACTION) — nichts getan."
    ERGEBNIS_CODE=10
    return 0
  fi

  zustand_schreiben last-brake "$(date -Is) | $grund | $beleg"
  stoppe_server || protokoll "  ! stoppe_server meldete einen Fehler"

  # Cloud-Abbild VOR dem Abschalten (nur bei PA_SNAPSHOT_CLOUD=yes). Das lokale
  # Archiv hat schon der Dienst selbst beim Stoppen angelegt (ExecStopPost). Ein
  # Fehlschlag verhindert das Abschalten NICHT — die Kosten laufen weiter, und die
  # alten Abbilder bleiben ohnehin unberührt.
  if [ "$PA_ACTION" = "poweroff" ] && [ "${PA_SNAPSHOT_CLOUD:-no}" = "yes" ]; then
    protokoll "  → Cloud-Abbild vor dem Abschalten ($PA_SNAPSHOT_SKRIPT --nur-cloud)"
    "$PA_SNAPSHOT_SKRIPT" --nur-cloud --grund "Idle-Bremse: $grund" \
      || protokoll "  ! Cloud-Abbild fehlgeschlagen — Abschalten läuft trotzdem weiter"
  fi

  if [ "$PA_ACTION" = "poweroff" ]; then
    if [ "$PA_POWEROFF_CONFIRM" != "yes" ]; then
      protokoll "  PA_ACTION=poweroff ohne PA_POWEROFF_CONFIRM=yes — Knoten bleibt AN."
      ERGEBNIS_CODE=12
      return 0
    fi
    if [ "$PA_DRY_RUN" = "1" ]; then
      protokoll "  TROCKENLAUF: Knoten würde abgeschaltet."
      ERGEBNIS_CODE=10
      return 0
    fi
    protokoll "  → Knoten abschalten in ${PA_POWEROFF_DELAY_SECONDS}s (systemctl poweroff)"
    sleep "$PA_POWEROFF_DELAY_SECONDS"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl poweroff
    else
      shutdown -h now
    fi
  fi

  ERGEBNIS_CODE=10
  return 0
}

# ------------------------------------------------------------- Ein Durchlauf --
einmal_pruefen() {
  local jetzt first_seen maschinen_sekunden json=""
  local sessions=-1 lobbies=-1 uptime_sekunden=0
  local v_snap=-1 v_cmd=-1 v_conn=-1
  local alt_snap alt_cmd alt_conn last_active idle_sekunden verbindungen=-1
  local aktiv=0 messbar=0 grund="" beleg=""
  local idle_schwelle max_laufzeit max_maschine

  jetzt=$(date +%s)
  mkdir -p "$PA_STATE_DIR"
  if [ ! -f "$PA_STATE_DIR/first-seen" ]; then
    zustand_schreiben first-seen "$jetzt"
  fi
  first_seen=$(zustand_lese first-seen "$jetzt")
  idle_schwelle=$(minuten_in_sekunden "$PA_IDLE_MINUTES")
  max_laufzeit=$(minuten_in_sekunden "$PA_MAX_RUNTIME_MINUTES")

  # --- Schwelle 3: Maschinenlaufzeit (hängt an nichts außer der Uhr) ---------
  maschinen_sekunden=$(cut -d' ' -f1 /proc/uptime 2>/dev/null | cut -d. -f1 || true)
  maschinen_sekunden=${maschinen_sekunden:-0}
  if [ -n "$PA_MAX_MACHINE_MINUTES" ]; then
    max_maschine=$(minuten_in_sekunden "$PA_MAX_MACHINE_MINUTES")
    if zahl_ge "$maschinen_sekunden" "$max_maschine"; then
      bremse "Maschinenlaufzeit" "${maschinen_sekunden}s >= ${max_maschine}s (PA_MAX_MACHINE_MINUTES)"
      return 0
    fi
  fi

  verbindungen=$(zaehle_verbindungen)

  # --- Zustand des Servers lesen --------------------------------------------
  if json=$(hole_health); then
    sessions=$(feld sessions "$json")
    lobbies=$(feld lobbies "$json")
    v_snap=$(feld snapshotsSent "$json")
    v_cmd=$(feld commandsAccepted "$json")
    v_conn=$(feld connections "$json")
    uptime_sekunden=$(( $(feld uptimeMs "$json") / 1000 ))
    if [ "$sessions" -ge 0 ] && [ "$lobbies" -ge 0 ] && [ "$uptime_sekunden" -ge 0 ]; then
      messbar=1
    fi
  fi

  # --- Aktivität feststellen -------------------------------------------------
  if [ "$messbar" = "1" ]; then
    alt_snap=$(zustand_lese last-sample-snap "")
    alt_cmd=$(zustand_lese last-sample-cmd "")
    alt_conn=$(zustand_lese last-sample-conn "")
    zustand_schreiben last-sample-snap "$v_snap"
    zustand_schreiben last-sample-cmd "$v_cmd"
    zustand_schreiben last-sample-conn "$v_conn"

    if [ "$sessions" -gt 0 ]; then aktiv=1; fi
    if [ "$lobbies" -gt 0 ]; then aktiv=1; fi
    if [ -n "$alt_snap" ] && [ "$v_snap" -gt "$alt_snap" ]; then aktiv=1; fi
    if [ -n "$alt_cmd" ] && [ "$v_cmd" -gt "$alt_cmd" ]; then aktiv=1; fi
    if [ -n "$alt_conn" ] && [ "$v_conn" -gt "$alt_conn" ]; then aktiv=1; fi
  fi
  if [ "$verbindungen" -gt 0 ]; then aktiv=1; fi

  # --- Leerlauf bzw. Laufzeit bewerten --------------------------------------
  if [ "$messbar" = "1" ]; then
    if [ "$aktiv" = "1" ]; then
      zustand_schreiben last-active "$jetzt"
      last_active=$jetzt
    else
      last_active=$(zustand_lese last-active "")
      if [ -z "$last_active" ]; then
        # Kein Eintrag: die Serverlaufzeit ist der beste verfügbare Anker.
        # Ein Server, der seit einer Stunde ohne Sitzung läuft, war eine
        # Stunde lang unbenutzt.
        last_active=$(( jetzt - uptime_sekunden ))
        zustand_schreiben last-active "$last_active"
      fi
    fi

    idle_sekunden=$(( jetzt - last_active ))
    if [ "$idle_sekunden" -lt 0 ]; then idle_sekunden=0; fi

    if zahl_ge "$uptime_sekunden" "$max_laufzeit"; then
      grund="Serverlaufzeit"
      beleg="${uptime_sekunden}s >= ${max_laufzeit}s (PA_MAX_RUNTIME_MINUTES)"
    elif zahl_ge "$idle_sekunden" "$idle_schwelle" && zahl_ge "$uptime_sekunden" "$(minuten_in_sekunden "$PA_GRACE_MINUTES")"; then
      grund="Leerlauf"
      beleg="${idle_sekunden}s ohne Aktivität >= ${idle_schwelle}s; sessions=${sessions} lobbies=${lobbies} verbindungen=${verbindungen}"
    fi
  else
    # Nicht messbar: nur der Sonderfall „Knoten an, Dienst aus, nichts los"
    # rechtfertigt eine Abschaltung. Offene Verbindungen sperren sie.
    if dienst_laeuft; then
      protokoll "WARNUNG: $PA_HEALTH_URL nicht erreichbar, Dienst läuft aber — keine Aktion."
    elif [ "$verbindungen" -gt 0 ]; then
      protokoll "WARNUNG: Dienst aus, aber ${verbindungen} offene Verbindung(en) am Port — keine Aktion."
    elif zahl_ge "$(( jetzt - first_seen ))" "$idle_schwelle"; then
      grund="Server-nicht-erreichbar"
      beleg="Dienst inaktiv, $PA_HEALTH_URL nicht erreichbar, ${verbindungen} Verbindungen, $(( jetzt - first_seen ))s >= ${idle_schwelle}s"
    fi
  fi

  if [ -n "$grund" ]; then
    bremse "$grund" "$beleg"
  else
    protokoll "ok: kein Handlungsbedarf (sessions=${sessions} lobbies=${lobbies} verbindungen=${verbindungen} laufzeit=${uptime_sekunden}s)"
  fi
  return 0
}

# ------------------------------------------------------------ Trockenlauf ----
drucke_config() {
  local marker="FEHLT — die Bremse ist auf diesem Knoten NICHT SCHARF"
  local maschinen="AUS (PA_MAX_MACHINE_MINUTES ist leer)"
  if [ -e "${PA_ARMED_FILE:-}" ] && [ -n "${PA_ARMED_FILE:-}" ]; then
    marker="vorhanden — die Bremse ist scharf"
  fi
  if [ -z "$PA_ARMED_FILE" ]; then
    marker="abgeschaltet (PA_ARMED_FILE ist leer) — nur für Prüfläufe"
  fi
  if [ -n "$PA_MAX_MACHINE_MINUTES" ]; then
    maschinen="${PA_MAX_MACHINE_MINUTES} min (aus /proc/uptime, greift auch ohne Server)"
  fi

  cat <<TEXT
$PROGRAMM — Abschaltparameter (Trockenlauf: es wird NICHTS gestartet und NICHTS gestoppt)
  Messpunkt für „wird benutzt" : $PA_HEALTH_URL
  Spielport (Verbindungszähler): $PA_PORT
  Zustandsordner               : $PA_STATE_DIR

  Bremsschwellen
    Leerlauf                   : ${PA_IDLE_MINUTES} min  (ohne Sitzung, ohne Lobby,
                                 ohne Zählerfortschritt, ohne offene Verbindung)
    Anlaufschonfrist           : ${PA_GRACE_MINUTES} min  (so lange greift der Leerlauf nicht)
    Serverlaufzeit             : ${PA_MAX_RUNTIME_MINUTES} min  (Ablaufdatum des Prozesses, greift immer)
    Maschinenlaufzeit          : ${maschinen}
    Takt                       : ${PA_INTERVAL_SECONDS} s (--once: genau ein Durchlauf für den systemd-Timer)

  Abschaltung
    PA_ACTION                  : ${PA_ACTION}   (stop | poweroff)
    systemd-Einheit            : ${PA_SYSTEMD_UNIT}
    Signaldatei (ohne systemd) : ${PA_BREMSE_DATEI:-keine}
    Server-PID (ohne systemd)  : ${PA_SERVER_PID:-keine}
    Knoten-Stromaus            : $([ "$PA_ACTION" = "poweroff" ] && echo "ja, nach ${PA_POWEROFF_DELAY_SECONDS}s Bestätigung=${PA_POWEROFF_CONFIRM}" || echo "nein (PA_ACTION=stop)")
    Trockenlauf                : ${PA_DRY_RUN}

  Scharfschaltung
    Marker                     : ${PA_ARMED_FILE:-keiner}  → ${marker}

  NACHWEIS NACH DEM MIETEN (auf dem Knoten, nicht im Repo — AGENTS.md §5)
    1) Läuft der Timer?        systemctl list-timers projectarmageddon-idle.timer
    2) Ist er scharf?          ls -l ${PA_ARMED_FILE:-/etc/projectarmageddon/ist-gemietet}
    3) Was hat er zuletzt getan?
                               cat ${PA_STATE_DIR}/last-brake 2>/dev/null || echo "noch kein Auslöser"
    4) Ist der Server gesund?  curl -fsS ${PA_HEALTH_URL}
TEXT
}

# ------------------------------------------------------------------ Aufruf ----
case "${1:-}" in
  --print-config|--dry-run)
    drucke_config
    exit 0
    ;;
  --once)
    einmal_pruefen
    exit "$ERGEBNIS_CODE"
    ;;
  --help|-h)
    sed -n '2,60p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "")
    protokoll "Start: Leerlauf ${PA_IDLE_MINUTES} min, Serverlaufzeit ${PA_MAX_RUNTIME_MINUTES} min, Aktion ${PA_ACTION}"
    while :; do
      einmal_pruefen
      if [ "$ERGEBNIS_CODE" -ne 0 ]; then
        exit "$ERGEBNIS_CODE"
      fi
      sleep "$PA_INTERVAL_SECONDS"
    done
    ;;
  *)
    printf '%s: unbekannter Aufruf „%s". Erlaubt: --print-config, --once, --help\n' "$PROGRAMM" "$1" >&2
    exit 1
    ;;
esac
