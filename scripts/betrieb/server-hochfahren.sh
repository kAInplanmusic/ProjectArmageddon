#!/usr/bin/env bash
# =============================================================================
#  server-hochfahren.sh — Spielserver auf Abruf (Hetzner), von deinem Rechner oder der CI
# =============================================================================
#  Freigabe des Auftraggebers 2026-11-10 (docs/betrieb-INSTANZ.md Abschnitt 10):
#  Server auf Abruf hochfahren; sobald PA_IDLE_MINUTES lang niemand mehr verbunden ist,
#  macht der Server selbst ein Abbild, prüft es und löscht sich (selbst-abbild-loeschen.sh).
#  Beim nächsten Start entsteht der Server aus dem neuesten Abbild.
#
#  Aufruf (nur HCLOUD_TOKEN nötig, als Umgebungsvariable — nie in eine Datei):
#    server-hochfahren.sh [hochfahren] [--trocken]
#    server-hochfahren.sh status
#    server-hochfahren.sh not-aus [--aelter-als-stunden N] [--ausgeschaltete] [--erzwingen]
#    server-hochfahren.sh --print-config
#
#  hochfahren   1. verweigert, wenn im Hetzner-Projekt IRGENDEIN Server existiert (nie zwei)
#               2. reserviert EINMALIG eine IPv4-Primary-IP (auto_delete=false, Etikett) und
#                  nutzt sie immer wieder — die Adresse bleibt, die Domain auch
#               3. erzeugt den Server aus dem NEUESTEN Abbild (Etikett), sonst frisch aus
#                  ubuntu-24.04 per cloud-init (server-erstinstallation.sh)
#               4. schreibt das Token per user_data NUR nach /run (tmpfs), wartet auf https
#               5. gibt die Spiel-URL aus (und schreibt sie in $GITHUB_STEP_SUMMARY)
#  status       zeigt Server, Abbilder, Primary IP, Kosten je Stunde (nur lesen)
#  not-aus      jeden Server des Projekts herunterfahren, Abbild machen, PRÜFEN, erst dann
#               löschen. Ohne geprüftes Abbild wird nichts gelöscht (außer --erzwingen).
#               --aelter-als-stunden N / --ausgeschaltete: nur Server, die so lange laufen
#               bzw. aus sind (zweite Frist außerhalb des Servers, PFLICHT-13).
#
#  SERVERTYP: der billigste x86-Typ mit >= 2 vCPU und >= 4 GB, nicht dedizierte CPU,
#  <= PA_MAX_EUR_MONAT (Vorgabe 25, brutto) und im Standort VERFÜGBAR (laut API, nicht
#  geraten); eine Festlegung per PA_SERVER_TYP. Ein Abbild verlangt eine Platte mindestens
#  so groß wie die des Servers, von dem es stammt.
#
#  SSH: Vorgabe KEIN SSH. Die Spielumgebung braucht keinen Login (Betrieb per Workflow,
#  Beobachtung über Etiketten und https). Wer SSH will: PA_SSH_PUBKEY="ssh-ed25519 …".
#  Passwort-Login gibt es nie (cloud-init sperrt root-Passwort, sshd ohne Passwörter).
#
#  DOMAIN: Vorgabe https://<IP-mit-Bindestrichen>.sslip.io (Caddy holt das Zertifikat selbst).
#  Mit PA_DOMAIN=spiel.projectarmageddon.de (A-Record → Primary-IP) wird diese benutzt.
#
#  Umgebung: HCLOUD_TOKEN, PA_NAME=pa-spiel, PA_DOMAIN, PA_ACME_EMAIL, PA_SERVER_TYP, PA_ORT,
#    PA_IDLE_MINUTES=15, PA_GRACE_MINUTES=5, PA_MAX_RUNTIME_MINUTES=480,
#    PA_MAX_MACHINE_MINUTES=540, PA_ABBILD_BEHALTEN=1, PA_GIT_URL, PA_GIT_REF=main,
#    PA_WEITERE_ORIGINS, PA_SSH_PUBKEY, PA_EXTRA_ENV (weitere PA_*=Wert-Zeilen für betrieb.env, z. B. für Proben),
#    PA_WARTE_SEKUNDEN, PA_HCLOUD_API.
#  Rückgabe: 0 ok · 1 Fehler · 2 Bedienfehler
# =============================================================================
set -euo pipefail

PROGRAMM="${0##*/}"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SKRIPT_DIR/../.." && pwd)
# shellcheck source=scripts/betrieb/hcloud-api.sh
source "$SKRIPT_DIR/hcloud-api.sh"

PA_NAME="${PA_NAME:-pa-spiel}"
PA_DOMAIN="${PA_DOMAIN:-}"
PA_ACME_EMAIL="${PA_ACME_EMAIL:-}"
PA_SERVER_TYP="${PA_SERVER_TYP:-}"
PA_ORT="${PA_ORT:-}"
PA_MAX_EUR_MONAT="${PA_MAX_EUR_MONAT:-25}"
PA_IDLE_MINUTES="${PA_IDLE_MINUTES:-15}"
PA_GRACE_MINUTES="${PA_GRACE_MINUTES:-5}"
PA_MAX_RUNTIME_MINUTES="${PA_MAX_RUNTIME_MINUTES:-480}"
PA_MAX_MACHINE_MINUTES="${PA_MAX_MACHINE_MINUTES:-540}"
PA_ABBILD_BEHALTEN="${PA_ABBILD_BEHALTEN:-1}"
PA_GIT_URL="${PA_GIT_URL:-https://github.com/kAInplanmusic/projectarmageddon}"
PA_GIT_REF="${PA_GIT_REF:-main}"
PA_SSH_PUBKEY="${PA_SSH_PUBKEY:-}"
PA_EXTRA_ENV="${PA_EXTRA_ENV:-}"
# Weitere erlaubte Herkünfte (kommagetrennt, https://…), z. B. eine Frontseite auf www (docs/zugang-www.md)
PA_WEITERE_ORIGINS="${PA_WEITERE_ORIGINS:-}"
PA_WARTE_SEKUNDEN="${PA_WARTE_SEKUNDEN:-}"
PA_POLL_SEKUNDEN="${PA_POLL_SEKUNDEN:-15}"
PA_ABBILD_WARTE_SEKUNDEN="${PA_ABBILD_WARTE_SEKUNDEN:-1800}"
ORTE_REIHENFOLGE="${PA_ORTE:-fsn1 nbg1}"
L_SERVER="projectarmageddon-server=ja"
L_IP="projectarmageddon-ip=ja"
L_ABBILD="${PA_HCLOUD_LABEL:-projectarmageddon-snapshot=auto}"
IMAGE_FRISCH="${PA_IMAGE_FRISCH:-ubuntu-24.04}"

protokoll() { printf '%s [%s] %s\n' "$(date -Is)" "$PROGRAMM" "$*" >&2; }
fehler() { protokoll "FEHLER: $*"; exit 1; }

MODUS=hochfahren
TROCKEN=0
ALTER_H=""
NUR_AUS=0
ERZWINGEN=0
DRUCKE=0
while [ $# -gt 0 ]; do
  case "$1" in
    hochfahren|status|not-aus) MODUS="$1" ;;
    --trocken) TROCKEN=1 ;;
    --print-config) DRUCKE=1 ;;
    --aelter-als-stunden) shift; ALTER_H="${1:-}" ;;
    --ausgeschaltete) NUR_AUS=1 ;;
    --erzwingen) ERZWINGEN=1 ;;
    -h|--help) sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) protokoll "unbekannter Aufruf: $1"; exit 2 ;;
  esac
  shift
done

node_major() {
  python3 -c '
import json,re,sys
try:
    e=json.load(open(sys.argv[1]))["engines"]["node"]
    print(re.search(r"(\d+)",e).group(1))
except Exception:
    print(22)' "$ROOT/package.json"
}

drucke_config() {
  cat <<TEXT
$PROGRAMM — Parameter (Trockenlauf: es wird NICHTS angefragt oder erzeugt)
  Modus                : $MODUS
  Servername           : $PA_NAME   (Etikett $L_SERVER)
  Primary-IP-Etikett   : $L_IP (auto_delete=false, wird wiederverwendet)
  Abbild-Etikett       : $L_ABBILD
  Servertyp            : ${PA_SERVER_TYP:-automatisch: billigster x86-Typ >= 2 vCPU / 4 GB, <= ${PA_MAX_EUR_MONAT} EUR/Monat brutto, verfügbar}
  Standort(e)          : ${PA_ORT:-$ORTE_REIHENFOLGE}
  Domain               : ${PA_DOMAIN:-https://<IP-mit-Bindestrichen>.sslip.io}
  Leerlauf / Schonfrist: ${PA_IDLE_MINUTES} min / ${PA_GRACE_MINUTES} min
  Serverlaufzeit max.  : ${PA_MAX_RUNTIME_MINUTES} min (Prozess), ${PA_MAX_MACHINE_MINUTES} min (Maschine)
  Aktion               : abbild-loeschen (Abbilder behalten: ${PA_ABBILD_BEHALTEN})
  SSH                  : $( [ -n "$PA_SSH_PUBKEY" ] && echo "mit Schlüssel (nie Passwort)" || echo "aus (kein Schlüssel hinterlegt)" )
  Quelle (frisch)      : $PA_GIT_URL @ $PA_GIT_REF, Node $(node_major)
  Hetzner-API          : $PA_HCLOUD_API
  Token                : $( [ -n "${HCLOUD_TOKEN:-}" ] && echo "in HCLOUD_TOKEN vorhanden" || echo "NICHT gesetzt (HCLOUD_TOKEN)" )
TEXT
}
if [ "$DRUCKE" = "1" ]; then drucke_config; exit 0; fi

[ -n "${HCLOUD_TOKEN:-}" ] || fehler "HCLOUD_TOKEN ist nicht gesetzt (Umgebungsvariable, nie in eine Datei)"
HC_TOKEN="$HCLOUD_TOKEN"
unset HCLOUD_TOKEN
for v in PA_IDLE_MINUTES PA_GRACE_MINUTES PA_MAX_RUNTIME_MINUTES PA_MAX_MACHINE_MINUTES PA_ABBILD_BEHALTEN; do
  hc_ganzzahl "${!v}" || fehler "$v='${!v}' ist keine ganze Zahl"
done
if [ "$PA_ABBILD_BEHALTEN" -lt 1 ] || [ "$PA_ABBILD_BEHALTEN" -gt 50 ]; then fehler "PA_ABBILD_BEHALTEN: erlaubt 1 bis 50"; fi
case "$PA_NAME" in ''|*[!A-Za-z0-9-]*) fehler "PA_NAME nur Buchstaben, Ziffern, Bindestrich" ;; esac

api() { hc_anfrage "$@" || fehler "API $1 $2: $(hc_fehlertext)"; }

zusammenfassung() { # $1 Markdown-Zeile(n)
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY" || true; fi
}

# ------------------------------------------------------------------- status -----
liste_server() { hc_liste "/servers" servers || fehler "Serverliste: $(hc_fehlertext)"; }

zeige_status() {
  liste_server
  printf '%s' "$HC_BODY" | python3 -c '
import sys,json
s=json.load(sys.stdin)
print("Server: %d" % len(s))
for x in s:
    pr=(x.get("server_type") or {}).get("prices") or []
    loc=(x.get("location") or {}).get("name")
    h=[p["price_hourly"]["gross"] for p in pr if p.get("location")==loc]
    print("  %s id=%s status=%s typ=%s ort=%s ip=%s erstellt=%s phase=%s EUR/h=%s" % (x["name"],x["id"],x["status"],x["server_type"]["name"],loc,((x.get("public_net") or {}).get("ipv4") or {}).get("ip"),x["created"],(x.get("labels") or {}).get("projectarmageddon-phase","-"),(("%.4f" % float(h[0])) if h else "?")))'
  hc_liste "/images?type=snapshot" images || fehler "Abbilder: $(hc_fehlertext)"
  printf '%s' "$HC_BODY" | python3 -c '
import sys,json
s=json.load(sys.stdin)
print("Abbilder (Snapshots): %d" % len(s))
for x in s: print("  id=%s status=%s %.2f GB, Platte %s GB, erstellt %s, Etiketten %s" % (x["id"],x["status"],float(x.get("image_size") or 0),x.get("disk_size"),x["created"],x.get("labels")))'
  hc_liste "/primary_ips" primary_ips || fehler "Primary IPs: $(hc_fehlertext)"
  printf '%s' "$HC_BODY" | python3 -c '
import sys,json
s=json.load(sys.stdin)
print("Primary IPs: %d" % len(s))
for x in s: print("  id=%s %s %s ort=%s zugewiesen=%s auto_delete=%s" % (x["id"],x["type"],x["ip"],(x.get("location") or {}).get("name"),x.get("assignee_id"),x.get("auto_delete")))'
  hc_liste "/volumes" volumes || fehler "Volumes: $(hc_fehlertext)"
  printf 'Volumes: %s\n' "$(printf '%s' "$HC_BODY" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
}

# ------------------------------------------------------------------ not-aus -----
warte_server_status() { # $1 id, $2 Zielstatus, $3 Sekunden
  local ende=$(( $(date +%s) + $3 )) st=""
  while [ "$(date +%s)" -lt "$ende" ]; do
    hc_anfrage GET "/servers/$1" && st=$(hc_py 'print(d["server"]["status"])' || true)
    [ "$st" = "$2" ] && return 0
    sleep 5
  done
  return 1
}

not_aus() {
  liste_server
  local server_json="$HC_BODY" zeilen sid name status
  zeilen=$(printf '%s' "$server_json" | ALTER="$ALTER_H" NURAUS="$NUR_AUS" python3 -c '
import sys,json,os,datetime
s=json.load(sys.stdin); alter=os.environ["ALTER"]; nuraus=os.environ["NURAUS"]=="1"
jetzt=datetime.datetime.now(datetime.timezone.utc)
for x in s:
    ok=True
    if alter or nuraus:
        ok=False
        if alter:
            t=datetime.datetime.fromisoformat(x["created"].replace("Z","+00:00"))
            if (jetzt-t).total_seconds()>=float(alter)*3600: ok=True
        if nuraus and x["status"]=="off": ok=True
    if ok: print("%s\t%s\t%s" % (x["id"],x["name"],x["status"]))')
  if [ -z "$zeilen" ]; then protokoll "Kein Server entspricht (nichts zu tun)."; return 0; fi
  local rc=0
  while IFS=$'\t' read -r sid name status; do
    protokoll "NOT-AUS für $name ($sid, Status $status)"
    if [ "$TROCKEN" = "1" ]; then protokoll "  TROCKENLAUF: Herunterfahren, Abbild, Prüfung, Löschen"; continue; fi
    if [ "$status" != "off" ]; then
      protokoll "  fahre sauber herunter (ACPI), danach ggf. hart aus"
      hc_anfrage POST "/servers/$sid/actions/shutdown" '{}' || protokoll "  shutdown: $(hc_fehlertext)"
      if ! warte_server_status "$sid" off 180; then
        protokoll "  nicht aus nach 180 s — poweroff"
        hc_anfrage POST "/servers/$sid/actions/poweroff" '{}' || protokoll "  poweroff: $(hc_fehlertext)"
        warte_server_status "$sid" off 120 || protokoll "  Server ist nicht 'off' — Abbild trotzdem versucht"
      fi
    fi
    if hc_abbild_anlegen "$sid" "$L_ABBILD" "projectarmageddon $(date -u +%Y%m%dT%H%M%SZ) (not-aus)" "$PA_ABBILD_WARTE_SEKUNDEN" 10; then
      hc_abbilder_aufraeumen "$L_ABBILD" "$NEUES_ABBILD" "$PA_ABBILD_BEHALTEN"
      protokoll "  Abbild $NEUES_ABBILD geprüft — Server $name wird gelöscht"
      api DELETE "/servers/$sid" >/dev/null
    elif [ "$ERZWINGEN" = "1" ]; then
      protokoll "  KEIN geprüftes Abbild, aber --erzwingen: Server $name wird trotzdem gelöscht"
      api DELETE "/servers/$sid" >/dev/null
    else
      protokoll "  KEIN geprüftes Abbild — Server $name bleibt (kostet weiter!). Mit --erzwingen löschen, wenn der Zustand wertlos ist."
      rc=1
    fi
  done <<<"$zeilen"
  return "$rc"
}

if [ "$MODUS" = "status" ]; then zeige_status; exit 0; fi
if [ "$MODUS" = "not-aus" ]; then not_aus; exit $?; fi

# ---------------------------------------------------------------- hochfahren ----
liste_server
if [ "$(printf '%s' "$HC_BODY" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" != "0" ]; then
  namen=$(printf '%s' "$HC_BODY" | python3 -c 'import sys,json;print(", ".join(x["name"]+"("+x["status"]+")" for x in json.load(sys.stdin)))')
  fehler "Im Projekt existiert schon ein Server: $namen. Es läuft nie mehr als einer (AGENTS.md §5) — nichts erzeugt. Status: server-hochfahren.sh status"
fi

# --- neuestes Abbild ----------------------------------------------------------------
hc_liste "/images?type=snapshot&label_selector=$(hc_urlenc "$L_ABBILD")" images || fehler "Abbilder: $(hc_fehlertext)"
ABBILD=$(printf '%s' "$HC_BODY" | python3 -c '
import sys,json
a=[x for x in json.load(sys.stdin) if x.get("status")=="available"]
a.sort(key=lambda x:(x.get("created") or "",x["id"]),reverse=True)
print(("%s %s %s" % (a[0]["id"],int(a[0].get("disk_size") or 0),a[0].get("architecture") or "x86")) if a else "")')
ABBILD_ID=""; MIN_DISK=0
if [ -n "$ABBILD" ]; then read -r ABBILD_ID MIN_DISK _ <<<"$ABBILD"; protokoll "Neuestes Abbild: $ABBILD_ID (Platte $MIN_DISK GB) — der Server entsteht daraus."
else protokoll "Kein Abbild vorhanden — der Server wird frisch aus $IMAGE_FRISCH eingerichtet (dauert länger)."; fi

# --- Primary IP --------------------------------------------------------------------
hc_liste "/primary_ips?label_selector=$(hc_urlenc "$L_IP")" primary_ips || fehler "Primary IPs: $(hc_fehlertext)"
IP_INFO=$(printf '%s' "$HC_BODY" | python3 -c '
import sys,json
a=json.load(sys.stdin)
if a:
    x=a[0]
    print("%s %s %s %s" % (x["id"],x["ip"],(x.get("location") or {}).get("name"),x.get("assignee_id") or "-"))')
IP_ID=""; IP_ADR=""; IP_ORT=""; IP_BELEGT=""
if [ -n "$IP_INFO" ]; then
  read -r IP_ID IP_ADR IP_ORT IP_BELEGT <<<"$IP_INFO"
  [ "$IP_BELEGT" = "-" ] || fehler "Primary IP $IP_ADR ist schon einem Server zugewiesen ($IP_BELEGT)"
  protokoll "Primary IP wiederverwendet: $IP_ADR ($IP_ORT, id $IP_ID)"
fi

# --- Typ und Standort ------------------------------------------------------------
hc_liste "/server_types" server_types || fehler "Servertypen: $(hc_fehlertext)"
WAHL=$(printf '%s' "$HC_BODY" | TYP="$PA_SERVER_TYP" ORT="${PA_ORT:-$IP_ORT}" ORTE="$ORTE_REIHENFOLGE" MAXEUR="$PA_MAX_EUR_MONAT" MINDISK="$MIN_DISK" python3 -c '
import sys,json,os
ts=json.load(sys.stdin)
typ=os.environ["TYP"]; ort=os.environ["ORT"]; orte=[ort] if ort else os.environ["ORTE"].split()
mx=float(os.environ["MAXEUR"]); mind=int(os.environ["MINDISK"])
best=None
for t in ts:
    if typ and t["name"]!=typ: continue
    if not typ:
        if t.get("architecture")!="x86" or t.get("cpu_type")!="shared": continue
        if t["cores"]<2 or t["memory"]<4: continue
    if t["disk"]<mind: continue
    for i,l in enumerate(orte):
        for loc in t.get("locations") or []:
            if loc["name"]!=l or not loc.get("available") or loc.get("deprecation"): continue
            pr=[p for p in t["prices"] if p["location"]==l]
            if not pr: continue
            m=float(pr[0]["price_monthly"]["gross"]); h=float(pr[0]["price_hourly"]["gross"])
            if not typ and m>mx: continue
            k=(m,i)
            if best is None or k<best[0]: best=(k,t["name"],l,t["cores"],t["memory"],t["disk"],h,m)
if best: print("%s %s %s %s %s %.6f %.4f" % best[1:])')
[ -n "$WAHL" ] || fehler "Kein verfügbarer Servertyp (>= 2 vCPU/4 GB, <= ${PA_MAX_EUR_MONAT} EUR/Monat, Platte >= ${MIN_DISK} GB) in ${PA_ORT:-${IP_ORT:-$ORTE_REIHENFOLGE}}. Später erneut versuchen (Hetzner-Kontingent) oder PA_SERVER_TYP/PA_ORT setzen."
read -r TYP ORT KERNE RAM PLATTE EUR_H EUR_M <<<"$WAHL"
protokoll "Servertyp $TYP in $ORT: $KERNE vCPU, $RAM GB RAM, $PLATTE GB Platte, $EUR_H EUR/h, $EUR_M EUR/Monat (brutto, Hetzner-API)"

if [ "$TROCKEN" = "1" ]; then
  protokoll "TROCKENLAUF: würde $( [ -z "$IP_ID" ] && echo "eine Primary IP in $ORT reservieren und " )Server '$PA_NAME' ($TYP, $ORT) aus $( [ -n "$ABBILD_ID" ] && echo "Abbild $ABBILD_ID" || echo "$IMAGE_FRISCH (frisch)" ) erzeugen. Nichts angelegt."
  exit 0
fi

if [ -z "$IP_ID" ]; then
  koerper=$(NAME="${PA_NAME}-ipv4" ORT="$ORT" LABEL="$L_IP" python3 -c '
import json,os
k,_,v=os.environ["LABEL"].partition("=")
print(json.dumps({"name":os.environ["NAME"],"type":"ipv4","location":os.environ["ORT"],"auto_delete":False,"labels":{k:v}}))')
  api POST /primary_ips "$koerper"
  IP_ID=$(hc_py 'print(d["primary_ip"]["id"])') || fehler "Primary-IP-Antwort ohne id"
  IP_ADR=$(hc_py 'print(d["primary_ip"]["ip"])') || fehler "Primary-IP-Antwort ohne ip"
  protokoll "Primary IP reserviert: $IP_ADR (id $IP_ID, $ORT) — bleibt dauerhaft (0.595 EUR/Monat brutto laut Hetzner-Preisliste)"
fi

if [ -z "$PA_DOMAIN" ]; then PA_DOMAIN="$(printf '%s' "$IP_ADR" | tr '.' '-').sslip.io"; fi
PA_DOMAIN="${PA_DOMAIN#https://}"; PA_DOMAIN="${PA_DOMAIN%/}"
case "$PA_DOMAIN" in ''|*[!A-Za-z0-9.-]*) fehler "PA_DOMAIN '$PA_DOMAIN' ist kein Hostname" ;; esac
URL="https://$PA_DOMAIN"

# --- SSH-Schlüssel (optional) ---------------------------------------------------------
SSH_ID=""
if [ -n "$PA_SSH_PUBKEY" ]; then
  hc_liste "/ssh_keys" ssh_keys || fehler "SSH-Schlüssel: $(hc_fehlertext)"
  SSH_ID=$(printf '%s' "$HC_BODY" | KEY="$PA_SSH_PUBKEY" python3 -c '
import sys,json,os
k=" ".join(os.environ["KEY"].split()[:2])
for x in json.load(sys.stdin):
    if " ".join(x["public_key"].split()[:2])==k: print(x["id"]); break')
  if [ -z "$SSH_ID" ]; then
    koerper=$(KEY="$PA_SSH_PUBKEY" NAME="${PA_NAME}-key" python3 -c '
import json,os
print(json.dumps({"name":os.environ["NAME"],"public_key":os.environ["KEY"],"labels":{"projectarmageddon-key":"ja"}}))')
    api POST /ssh_keys "$koerper"; SSH_ID=$(hc_py 'print(d["ssh_key"]["id"])')
  fi
fi

# --- user_data (cloud-config; JSON ist gültiges YAML) -----------------------------------
INSTALLER="$SKRIPT_DIR/server-erstinstallation.sh"
[ -f "$INSTALLER" ] || fehler "$INSTALLER fehlt"
MODUS_BOOT="--frisch"; [ -n "$ABBILD_ID" ] && MODUS_BOOT="--aus-abbild"
for z in $PA_EXTRA_ENV; do case "$z" in PA_[A-Z0-9_]*=[A-Za-z0-9_./:,@+-]*) ;; *) fehler "PA_EXTRA_ENV: '$z' ist kein PA_NAME=wert ohne Sonderzeichen" ;; esac; done
USER_DATA=$(TOKEN="$HC_TOKEN" INSTALLER="$INSTALLER" MODUS_BOOT="$MODUS_BOOT" DOMAIN="$PA_DOMAIN" ACME="$PA_ACME_EMAIL" \
  IDLE="$PA_IDLE_MINUTES" GRACE="$PA_GRACE_MINUTES" MAXRT="$PA_MAX_RUNTIME_MINUTES" MAXM="$PA_MAX_MACHINE_MINUTES" \
  KEEP="$PA_ABBILD_BEHALTEN" GITURL="$PA_GIT_URL" GITREF="$PA_GIT_REF" NODEMAJOR="$(node_major)" SSH="$( [ -n "$PA_SSH_PUBKEY" ] && echo ja || echo nein )" \
  BELEG="${PA_BELEG:-nein}" EXTRA="$PA_EXTRA_ENV" WEITERE="$PA_WEITERE_ORIGINS" API="$PA_HCLOUD_API" python3 -c '
import json,os
e=os.environ
d=e["DOMAIN"]
env=["HOST=127.0.0.1","PORT=3000","LOG_LEVEL=info","LOG_FORMAT=json",
 "PA_STATE_PATH=/var/lib/projectarmageddon/lobbies.json","PA_KONTEN_PFAD=/var/lib/projectarmageddon/konten.db",
 "PA_ERLAUBE_OEFFENTLICH=no","PA_BUILD=0",
 "PA_ERLAUBTE_ORIGINS=https://"+d+(","+e["WEITERE"] if e["WEITERE"] else ""),"PA_EIGENER_ORIGIN=https://"+d,"PA_VERTRAUTE_PROXYS=127.0.0.1,::1",
 "PA_SICHERUNG_DIR=/var/lib/projectarmageddon/sicherungen","PA_SICHERUNG_BEHALTEN=10",
 "PA_IDLE_MINUTES="+e["IDLE"],"PA_GRACE_MINUTES="+e["GRACE"],
 "PA_MAX_RUNTIME_MINUTES="+e["MAXRT"],"PA_MAX_MACHINE_MINUTES="+e["MAXM"],
 "PA_ACTION=abbild-loeschen","PA_ABBILD_BEHALTEN="+e["KEEP"],
 "PA_SYSTEMD_UNIT=projectarmageddon.service","PA_STATE_DIR=/var/lib/projectarmageddon",
 "PA_ARMED_FILE=/etc/projectarmageddon/ist-gemietet","PA_HEALTH_URL=http://127.0.0.1:3000/healthz",
 "PA_SNAPSHOT_DIR=/var/lib/projectarmageddon/snapshots","PA_SNAPSHOT_KEEP=3","PA_SNAPSHOT_CLOUD=no",
 "PA_INTERVAL_SECONDS=30"]
if e["API"]!="https://api.hetzner.cloud/v1": env.append("PA_HCLOUD_API="+e["API"])
env+=e["EXTRA"].split()
boot=["PA_BELEG="+e["BELEG"],"PA_GIT_URL="+e["GITURL"],"PA_GIT_REF="+e["GITREF"],"PA_NODE_MAJOR="+e["NODEMAJOR"],"PA_DOMAIN="+d,"PA_ACME_EMAIL="+e["ACME"],"PA_SSH="+e["SSH"]]
caddy="[Service]\nEnvironment=PA_DOMAIN="+d+"\nEnvironment=PA_ACME_EMAIL="+e["ACME"]+"\n"
cfg={"ssh_pwauth":False,"disable_root":True,
 "write_files":[
  {"path":"/run/projectarmageddon/hcloud-token","owner":"root:root","permissions":"0600","content":e["TOKEN"]+"\n"},
  {"path":"/etc/projectarmageddon/betrieb.env","owner":"root:root","permissions":"0600","content":"\n".join(env)+"\n"},
  {"path":"/etc/projectarmageddon/boot.env","owner":"root:root","permissions":"0600","content":"\n".join(boot)+"\n"},
  {"path":"/etc/systemd/system/caddy.service.d/pa.conf","owner":"root:root","permissions":"0644","content":caddy},
  {"path":"/usr/local/sbin/pa-erstinstallation.sh","owner":"root:root","permissions":"0700","content":open(e["INSTALLER"]).read()}],
 "runcmd":[["/usr/local/sbin/pa-erstinstallation.sh",e["MODUS_BOOT"]]]}
print("#cloud-config\n"+json.dumps(cfg))')
[ "${#USER_DATA}" -lt 32000 ] || fehler "user_data ist ${#USER_DATA} Bytes (Grenze 32 KiB)"

BODY=$(UD="$USER_DATA" NAME="$PA_NAME" TYP="$TYP" ORT="$ORT" IMG="${ABBILD_ID:-$IMAGE_FRISCH}" IPID="$IP_ID" SSHID="$SSH_ID" python3 -c '
import json,os
e=os.environ
img=int(e["IMG"]) if e["IMG"].isdigit() else e["IMG"]
b={"name":e["NAME"],"server_type":e["TYP"],"location":e["ORT"],"image":img,"user_data":e["UD"],
   "labels":{"projectarmageddon-server":"ja"},
   "public_net":{"enable_ipv4":True,"enable_ipv6":True,"ipv4":int(e["IPID"])},"start_after_create":True}
if e["SSHID"]: b["ssh_keys"]=[int(e["SSHID"])]
print(json.dumps(b))')

protokoll "Erzeuge Server '$PA_NAME' …"
api POST /servers "$BODY"
SERVER_ID=$(hc_py 'print(d["server"]["id"])') || fehler "Serverantwort ohne id — im Zweifel: server-hochfahren.sh status"
protokoll "Server $SERVER_ID erzeugt ($TYP, $ORT, $IP_ADR)."

# --- warten ---------------------------------------------------------------------------
if [ -z "$PA_WARTE_SEKUNDEN" ]; then if [ -n "$ABBILD_ID" ]; then PA_WARTE_SEKUNDEN=900; else PA_WARTE_SEKUNDEN=1800; fi; fi
ENDE=$(( $(date +%s) + PA_WARTE_SEKUNDEN ))
LETZTE=""
bereit=0
while [ "$(date +%s)" -lt "$ENDE" ]; do
  phase="-"
  if hc_anfrage GET "/servers/$SERVER_ID"; then
    phase=$(hc_py 'print((d["server"].get("labels") or {}).get("projectarmageddon-phase","-"))' || echo "-")
  fi
  if [ "$phase" != "$LETZTE" ]; then protokoll "Phase: $phase"; LETZTE="$phase"; fi
  zeile=$(hc_py 'print((d["server"].get("labels") or {}).get("projectarmageddon-zeile",""))' || true)
  if [ -n "${zeile:-}" ] && [ "$zeile" != "${LETZTE_ZEILE:-}" ]; then protokoll "  server: $zeile"; LETZTE_ZEILE="$zeile"; fi
  case "$phase" in fehler-*)
    protokoll "Einrichtung ist an Phase '${phase#fehler-}' gescheitert. Die letzten Meldungen des Servers folgen."
    for _ in $(seq 1 30); do
      sleep "${PA_FEHLER_POLL_SEKUNDEN:-3}"
      hc_anfrage GET "/servers/$SERVER_ID" || continue
      zeile=$(hc_py 'print((d["server"].get("labels") or {}).get("projectarmageddon-zeile",""))' || true)
      if [ -n "${zeile:-}" ] && [ "$zeile" != "${LETZTE_ZEILE:-}" ]; then protokoll "  server: $zeile"; LETZTE_ZEILE="$zeile"; fi
    done
    if [ -z "$ABBILD_ID" ] && [ "${PA_BEHALTE_BEI_FEHLER:-0}" != "1" ]; then
      protokoll "Der frisch eingerichtete Server ist wertlos — wird gelöscht (PA_BEHALTE_BEI_FEHLER=1 behält ihn zur Analyse)."
      hc_anfrage DELETE "/servers/$SERVER_ID" >/dev/null || protokoll "  Löschen fehlgeschlagen: $(hc_fehlertext) — server-hochfahren.sh not-aus --erzwingen"
    else
      protokoll "Server $SERVER_ID bleibt stehen (kostet weiter). Aufräumen: not-aus."
    fi
    exit 1 ;;
  esac
  if [ "$phase" = "bereit" ]; then
    code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$URL/version.json" 2>/dev/null || echo 000)
    if [ "$code" = "200" ]; then bereit=1; break; fi
    protokoll "  $URL/version.json: HTTP $code (Zertifikat wird geholt?)"
  fi
  sleep "$PA_POLL_SEKUNDEN"
done
if [ "$bereit" != "1" ]; then
  protokoll "Server nicht bereit nach ${PA_WARTE_SEKUNDEN}s (letzte Phase: $LETZTE). Server $SERVER_ID läuft weiter; Idle-Bremse/Zeitplan räumen auf, oder: not-aus."
  exit 1
fi
if [ "${PA_BELEG:-nein}" = "ja" ]; then
  protokoll "Beleg-Ausgabe des Servers (50-Zeichen-Stücke, 4 s Takt):"
  ende_beleg=$(( $(date +%s) + 150 )); letzte=""
  while [ "$(date +%s)" -lt "$ende_beleg" ]; do
    hc_anfrage GET "/servers/$SERVER_ID" && z=$(hc_py 'print((d["server"].get("labels") or {}).get("projectarmageddon-zeile",""))' || true)
    if [ -n "${z:-}" ] && [ "$z" != "$letzte" ]; then printf 'BELEG| %s\n' "$z" >&2; letzte="$z"; fi
    sleep 1
  done
fi
VERSION=$(curl -sS -m 15 "$URL/version.json" 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("version","?"), d.get("gitSha") or d.get("git") or "")' 2>/dev/null || echo "?")
protokoll "BEREIT: $URL  (Version $VERSION)"
printf 'SPIEL-URL: %s\nPRIMARY-IP: %s\nSERVER: %s (%s, %s, %s EUR/h)\nLEERLAUF-ABSCHALTUNG: %s min ohne Verbindung, dann Abbild + Selbstlöschung\n' "$URL" "$IP_ADR" "$PA_NAME" "$TYP" "$ORT" "$EUR_H" "$PA_IDLE_MINUTES"
zusammenfassung "## Spielserver läuft
- **Spiel:** $URL
- Primary-IP: \`$IP_ADR\` · Typ \`$TYP\` ($ORT) · $EUR_H EUR/h brutto
- Version: $VERSION
- Der Server macht nach ${PA_IDLE_MINUTES} min ohne Verbindung selbst ein Abbild, prüft es und löscht sich."
