#!/usr/bin/env bash
# =============================================================================
#  selbst-abbild-loeschen.sh — Abbild des eigenen Servers, prüfen, Server löschen
# =============================================================================
#  Läuft AUF dem gemieteten Server. Aufgerufen von idle-watch.sh bei
#  PA_ACTION=abbild-loeschen (Freigabe des Auftraggebers 2026-11-10,
#  docs/betrieb-INSTANZ.md Abschnitt 10). Das Ziel: nach dem Spielen kostet nichts
#  mehr außer dem Abbild und der reservierten Primary IP.
#
#  ABLAUF (jeder Schritt ist eine Abbruchstelle, gelöscht wird erst ganz am Ende)
#    1. Voraussetzungen: Marker (Bremse scharf), Token aus der tmpfs-Datei,
#       Server-ID aus dem Metadatendienst, Server existiert und trägt das Etikett
#    2. Spielserver (und Caddy) sauber stoppen, Leerlaufzustand zurücksetzen
#    3. cloud-init-Reste (darin steckt das Token als user_data) entfernen, dann
#       die ganze Platte nach dem Token durchsuchen — gefunden = KEIN Abbild
#    4. sync, dann POST /servers/{id}/actions/create_image (snapshot, Etikett)
#    5. warten bis `available`, prüfen (Status, Typ, Größe > 0, richtiger Server)
#    6. NUR DANN ältere Abbilder mit demselben Etikett löschen (neuestes bleibt,
#       Anzahl PA_ABBILD_BEHALTEN, Vorgabe 1)
#    7. zuletzt DELETE /servers/{id}
#
#  FAIL-SAFE: Ist das Abbild nach PA_ABBILD_VERSUCHE Versuchen nicht verfügbar oder
#  ungeprüft, wird der Server NICHT gelöscht. Er wird ausgeschaltet (poweroff) und
#  das steht laut im Journal: AUSGESCHALTET HEISST BEI HETZNER WEITER ABGERECHNET.
#  Aufräumen dann per server-hochfahren.sh not-aus (Workflow „server-hochfahren").
#
#  Rückgabe: 0 gelöscht angefordert · 1 Voraussetzung fehlt (nichts geändert) ·
#            11 nicht scharf (Marker fehlt) · 20 Fail-safe (Server bleibt, ausgeschaltet)
#
#  Umgebung (Vorgaben): PA_HCLOUD_TOKEN_DATEI=/run/projectarmageddon/hcloud-token
#    PA_HCLOUD_LABEL=projectarmageddon-snapshot=auto  PA_SERVER_LABEL=projectarmageddon-server=ja
#    PA_ABBILD_BEHALTEN=1  PA_ABBILD_VERSUCHE=3  PA_ABBILD_WARTE_SEKUNDEN=1800
#    PA_ABBILD_POLL_SEKUNDEN=10  PA_ABBILD_PAUSE_SEKUNDEN=30  PA_SYSTEMD_UNIT  PA_ARMED_FILE
#    PA_DRY_RUN=1 (nur Plan)  --print-config
#  Für Tests austauschbar: PA_METADATA_URL, PA_SYSTEMCTL, PA_SYNC_BEFEHL,
#    PA_POWEROFF_BEFEHL, PA_SAEUBERN_BEFEHL, PA_ABBILD_TOKENSUCHE_WURZEL, PA_ABBILD_LOCK.
# =============================================================================
set -euo pipefail

PROGRAMM="${0##*/}"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/betrieb/hcloud-api.sh
source "$SKRIPT_DIR/hcloud-api.sh"

PA_HCLOUD_TOKEN_DATEI="${PA_HCLOUD_TOKEN_DATEI:-/run/projectarmageddon/hcloud-token}"
PA_HCLOUD_LABEL="${PA_HCLOUD_LABEL:-projectarmageddon-snapshot=auto}"
PA_SERVER_LABEL="${PA_SERVER_LABEL:-projectarmageddon-server=ja}"
PA_ABBILD_BEHALTEN="${PA_ABBILD_BEHALTEN:-1}"
PA_ABBILD_VERSUCHE="${PA_ABBILD_VERSUCHE:-3}"
PA_ABBILD_WARTE_SEKUNDEN="${PA_ABBILD_WARTE_SEKUNDEN:-1800}"
PA_ABBILD_POLL_SEKUNDEN="${PA_ABBILD_POLL_SEKUNDEN:-10}"
PA_ABBILD_PAUSE_SEKUNDEN="${PA_ABBILD_PAUSE_SEKUNDEN:-30}"
PA_ABBILD_TOKENSUCHE_SEKUNDEN="${PA_ABBILD_TOKENSUCHE_SEKUNDEN:-900}"
PA_ABBILD_TOKENSUCHE_WURZEL="${PA_ABBILD_TOKENSUCHE_WURZEL:-/}"
PA_ABBILD_LOCK="${PA_ABBILD_LOCK:-/run/projectarmageddon-abbild.lock}"
PA_ABBILD_FAILSAFE_POWEROFF="${PA_ABBILD_FAILSAFE_POWEROFF:-yes}"
PA_ABBILD_NACH_DELETE_SEKUNDEN="${PA_ABBILD_NACH_DELETE_SEKUNDEN:-120}"
PA_METADATA_URL="${PA_METADATA_URL:-http://169.254.169.254/hetzner/v1/metadata/instance-id}"
PA_SYSTEMD_UNIT="${PA_SYSTEMD_UNIT:-projectarmageddon.service}"
PA_SYSTEMCTL="${PA_SYSTEMCTL:-systemctl}"
PA_SYNC_BEFEHL="${PA_SYNC_BEFEHL:-sync}"
PA_POWEROFF_BEFEHL="${PA_POWEROFF_BEFEHL:-systemctl poweroff}"
PA_ARMED_FILE="${PA_ARMED_FILE:-/etc/projectarmageddon/ist-gemietet}"
PA_STATE_DIR="${PA_STATE_DIR:-/var/lib/projectarmageddon}"
PA_DRY_RUN="${PA_DRY_RUN:-0}"

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }

drucke_config() {
  cat <<TEXT
$PROGRAMM — Parameter (Trockenlauf: es wird NICHTS gestoppt, gesichert oder gelöscht)
  Token-Datei (tmpfs)      : $PA_HCLOUD_TOKEN_DATEI  ($( [ -f "$PA_HCLOUD_TOKEN_DATEI" ] && echo vorhanden || echo FEHLT ))
  Hetzner-API              : $PA_HCLOUD_API
  Metadatendienst          : $PA_METADATA_URL
  Etikett der Abbilder     : $PA_HCLOUD_LABEL   (nur diese werden je gelöscht)
  Etikett-Pflicht Server   : $PA_SERVER_LABEL   (nur ein so gekennzeichneter Server löscht sich selbst)
  Abbilder behalten        : $PA_ABBILD_BEHALTEN (erlaubt 1 bis 50; ältere erst NACH geprüftem neuen Abbild)
  Versuche / Pause         : $PA_ABBILD_VERSUCHE x, ${PA_ABBILD_PAUSE_SEKUNDEN}s
  Wartezeit bis available  : ${PA_ABBILD_WARTE_SEKUNDEN}s (Abfrage alle ${PA_ABBILD_POLL_SEKUNDEN}s)
  Spielserver-Einheit      : $PA_SYSTEMD_UNIT
  Scharf-Marker            : $PA_ARMED_FILE ($( [ -e "$PA_ARMED_FILE" ] && echo vorhanden || echo FEHLT ))
  Fail-safe                : Abbild ungeprüft -> Server bleibt, poweroff=$PA_ABBILD_FAILSAFE_POWEROFF (kostet dann WEITER)
  Ablauf                   : stoppen, cloud-init-Reste weg, Platte nach Token durchsuchen, sync,
                             create_image, warten, prüfen, alte Abbilder löschen, Server löschen
TEXT
}

case "${1:-}" in
  --print-config|--dry-run) drucke_config; exit 0 ;;
  --help|-h) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) printf '%s: unbekannter Aufruf „%s". Erlaubt: --print-config, --help\n' "$PROGRAMM" "$1" >&2; exit 1 ;;
esac

ganzzahl() { hc_ganzzahl "$1"; }
for v in PA_ABBILD_BEHALTEN PA_ABBILD_VERSUCHE PA_ABBILD_WARTE_SEKUNDEN PA_ABBILD_POLL_SEKUNDEN PA_ABBILD_PAUSE_SEKUNDEN; do
  ganzzahl "${!v}" || { protokoll "FEHLER: $v='${!v}' ist keine Zahl"; exit 1; }
done
if [ "$PA_ABBILD_BEHALTEN" -lt 1 ] || [ "$PA_ABBILD_BEHALTEN" -gt 50 ]; then
  protokoll "FEHLER: PA_ABBILD_BEHALTEN erlaubt 1 bis 50 (nie 0: sonst gäbe es kein Abbild)"; exit 1
fi
[ "$PA_ABBILD_VERSUCHE" -ge 1 ] || { protokoll "FEHLER: PA_ABBILD_VERSUCHE muss >= 1 sein"; exit 1; }

if [ "$PA_DRY_RUN" = "1" ]; then
  protokoll "TROCKENLAUF: würde Server stoppen, Platte prüfen, Abbild erstellen ($PA_HCLOUD_LABEL), prüfen, alle bis auf die neuesten $PA_ABBILD_BEHALTEN löschen und den Server löschen. Nichts getan."
  exit 0
fi

if [ -n "$PA_ARMED_FILE" ] && [ ! -e "$PA_ARMED_FILE" ]; then
  protokoll "NICHT SCHARF: $PA_ARMED_FILE fehlt — es passiert NICHTS (kein Löschen auf einem Rechner, der nicht als gemietet gekennzeichnet ist)."
  exit 11
fi

{ exec 8>"$PA_ABBILD_LOCK"; } 2>/dev/null || { protokoll "FEHLER: Sperrdatei $PA_ABBILD_LOCK nicht anlegbar"; exit 1; }
if ! flock -n 8; then protokoll "ein anderer Lauf ist aktiv — übersprungen"; exit 1; fi

hc_token_aus_datei "$PA_HCLOUD_TOKEN_DATEI" || true
if [ -z "$HC_TOKEN" ]; then
  protokoll "FEHLER: kein Token ($PA_HCLOUD_TOKEN_DATEI, Rechte 600) — nichts geändert. Der Server bleibt; die Idle-Bremse versucht es erneut."
  exit 1
fi

# --- Server-ID aus dem Metadatendienst -------------------------------------------
SERVER_ID=""
for versuch in 1 2 3 4 5; do
  SERVER_ID=$(curl -fsS -m 5 "$PA_METADATA_URL" 2>/dev/null | tr -d '[:space:]' || true)
  ganzzahl "$SERVER_ID" && break
  SERVER_ID=""; sleep 2
done
[ -n "$SERVER_ID" ] || { protokoll "FEHLER: keine Server-ID aus $PA_METADATA_URL — kein Löschen auf Verdacht."; exit 1; }

if ! hc_anfrage GET "/servers/$SERVER_ID"; then
  protokoll "FEHLER: Server $SERVER_ID nicht lesbar ($(hc_fehlertext)) — nichts geändert."; exit 1
fi
SERVER_NAME=$(hc_py 'print(d["server"]["name"])' || echo "?")
sk="${PA_SERVER_LABEL%%=*}"; sv="${PA_SERVER_LABEL#*=}"
if [ "$(hc_py 'print((d["server"].get("labels") or {}).get("'"$sk"'",""))' || true)" != "$sv" ]; then
  protokoll "ABBRUCH: Server $SERVER_NAME ($SERVER_ID) trägt das Etikett $PA_SERVER_LABEL nicht — er wurde nicht von server-hochfahren.sh erzeugt und löscht sich nicht selbst."
  exit 1
fi
protokoll "Server $SERVER_NAME ($SERVER_ID): Abbild, Prüfung, dann Selbstlöschung. Behalten: $PA_ABBILD_BEHALTEN Abbild(er)."

# --- Fail-safe -----------------------------------------------------------------------
failsafe() {
  protokoll "FAIL-SAFE: $1"
  protokoll "FAIL-SAFE: Der Server $SERVER_NAME ($SERVER_ID) wird NICHT gelöscht, weil kein geprüftes Abbild vorliegt."
  if [ "$PA_ABBILD_FAILSAFE_POWEROFF" = "yes" ]; then
    protokoll "FAIL-SAFE: Server wird ausgeschaltet. ACHTUNG: HETZNER RECHNET EINEN AUSGESCHALTETEN SERVER WEITER AB, bis er gelöscht wird."
    protokoll "FAIL-SAFE: Aufräumen: Workflow „server-hochfahren“ mit aktion=not-aus (macht erst ein geprüftes Abbild, dann löscht es)."
    # shellcheck disable=SC2086
    $PA_POWEROFF_BEFEHL || protokoll "FAIL-SAFE: poweroff fehlgeschlagen — der Server läuft weiter"
  fi
  exit 20
}

# --- 2. stoppen, Leerlaufzustand zurücksetzen ---------------------------------------
protokoll "stoppe $PA_SYSTEMD_UNIT und caddy"
$PA_SYSTEMCTL stop "$PA_SYSTEMD_UNIT" >&2 || protokoll "  ! stop meldete einen Fehler (weiter)"
$PA_SYSTEMCTL stop caddy >&2 2>/dev/null || true
rm -f "$PA_STATE_DIR"/first-seen "$PA_STATE_DIR"/last-active "$PA_STATE_DIR"/last-sample-* 2>/dev/null || true
printf 'server=%s zeit=%s\n' "$SERVER_ID" "$(date -u +%Y%m%dT%H%M%SZ)" > "$PA_STATE_DIR/abbild-marke" 2>/dev/null || true

# --- 3. cloud-init-Reste weg, Platte nach dem Token durchsuchen ---------------------
saeubern() {
  if [ -n "${PA_SAEUBERN_BEFEHL:-}" ]; then $PA_SAEUBERN_BEFEHL; return; fi
  if command -v cloud-init >/dev/null 2>&1; then cloud-init clean --logs >&2 || true; fi
  rm -rf /var/lib/cloud/instances /var/lib/cloud/instance /var/lib/cloud/data /var/lib/cloud/scripts 2>/dev/null || true
  rm -f /var/log/cloud-init.log /var/log/cloud-init-output.log 2>/dev/null || true
}
saeubern
if command -v journalctl >/dev/null 2>&1; then journalctl --rotate >/dev/null 2>&1 || true; fi
$PA_SYNC_BEFEHL

protokoll "durchsuche die Platte ($PA_ABBILD_TOKENSUCHE_WURZEL) nach dem Token — ein Treffer verhindert das Abbild"
treffer=$(timeout "$PA_ABBILD_TOKENSUCHE_SEKUNDEN" grep -rlaF --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev --exclude-dir=run \
  -f <(printf '%s\n' "$HC_TOKEN") "$PA_ABBILD_TOKENSUCHE_WURZEL" 2>/dev/null | head -5 || true)
if [ -n "$treffer" ]; then
  protokoll "Token auf der Platte gefunden in: $(printf '%s' "$treffer" | tr '\n' ' ')"
  failsafe "das Token steckt auf der Platte — ein Abbild würde es enthalten, deshalb KEIN Abbild"
fi
protokoll "Platte ist frei vom Token."

# --- 4./5. Abbild erstellen, warten, prüfen ------------------------------------------
ok=0
for ((n = 1; n <= PA_ABBILD_VERSUCHE; n++)); do
  protokoll "Versuch $n von $PA_ABBILD_VERSUCHE"
  if hc_abbild_anlegen "$SERVER_ID" "$PA_HCLOUD_LABEL" "projectarmageddon $(date -u +%Y%m%dT%H%M%SZ) (selbst, Idle-Bremse)" "$PA_ABBILD_WARTE_SEKUNDEN" "$PA_ABBILD_POLL_SEKUNDEN"; then ok=1; break; fi
  [ "$n" -lt "$PA_ABBILD_VERSUCHE" ] && sleep "$PA_ABBILD_PAUSE_SEKUNDEN"
done
[ "$ok" = "1" ] || failsafe "nach $PA_ABBILD_VERSUCHE Versuchen kein verfügbares, geprüftes Abbild"

# --- 6. alte Abbilder (nur mit unserem Etikett, erst nach geprüftem neuen) -------------
hc_abbilder_aufraeumen "$PA_HCLOUD_LABEL" "$NEUES_ABBILD" "$PA_ABBILD_BEHALTEN"

# --- 7. sich selbst löschen ---------------------------------------------------------
protokoll "Abbild $NEUES_ABBILD ist geprüft. Server $SERVER_NAME ($SERVER_ID) wird gelöscht."
geloescht=0
for n in 1 2 3; do
  if hc_anfrage DELETE "/servers/$SERVER_ID"; then geloescht=1; break; fi
  protokoll "  DELETE fehlgeschlagen ($(hc_fehlertext)) — Versuch $n"; sleep 5
done
[ "$geloescht" = "1" ] || failsafe "das Abbild ist geprüft, aber DELETE /servers/$SERVER_ID schlug fehl"
protokoll "Löschung angefordert. Der Server verschwindet in Sekunden; Abbild $NEUES_ABBILD bleibt."
sleep "$PA_ABBILD_NACH_DELETE_SEKUNDEN"
# Ist der Server nach dem DELETE nicht mehr abfragbar (404), ist alles getan.
if ! hc_anfrage GET "/servers/$SERVER_ID" && [ "$HC_STATUS" = "404" ]; then
  protokoll "Server $SERVER_ID existiert nicht mehr (404). Fertig."; exit 0
fi
failsafe "der Server lebt $PA_ABBILD_NACH_DELETE_SEKUNDEN s nach DELETE noch"
