# shellcheck shell=bash
# =============================================================================
#  hcloud-api.sh — kleine Hetzner-Cloud-API-Bibliothek (wird mit `source` geladen)
# =============================================================================
#  Genutzt von selbst-abbild-loeschen.sh (auf dem Server) und server-hochfahren.sh
#  (beim Auftraggeber / in der CI). Reines bash + curl + python3, keine hcloud-CLI.
#
#  TOKEN-REGELN (AGENTS.md §4, docs/betrieb-INSTANZ.md Abschnitt 10)
#  -----------------------------------------------------------------
#  - Das Token steht NUR in der Shell-Variable HC_TOKEN (nicht exportiert) bzw. in
#    der Umgebungsvariable HCLOUD_TOKEN des Aufrufers, nie in einer Datei dieses Repos.
#  - curl bekommt den Kopf `Authorization` über eine Konfiguration von einem
#    Dateideskriptor (-K <(…)), nicht in der Befehlszeile: `ps`/`/proc/<pid>/cmdline`
#    zeigen das Token nicht. Anfragekörper laufen über stdin aus demselben Grund
#    (der Körper von „Server erstellen" enthält user_data mit dem Token).
#  - Nichts hier gibt das Token oder einen Körper mit Token aus.
#
#  ÜBERSCHREIBBAR (Tests, Mock-Hetzner): PA_HCLOUD_API (Basis-URL).
#
#  WIEDERHOLUNG: GET/PUT/DELETE werden bei Netzfehler, 429 und 5xx wiederholt.
#  POST wird NUR bei 429 wiederholt — ein wiederholtes „Server erstellen" nach einem
#  5xx könnte zwei Server erzeugen (AGENTS.md §5: Vorfall vom 2026-09-25).
# =============================================================================

PA_HCLOUD_API="${PA_HCLOUD_API:-https://api.hetzner.cloud/v1}"
PA_HCLOUD_TIMEOUT="${PA_HCLOUD_TIMEOUT:-60}"
PA_HCLOUD_VERSUCHE="${PA_HCLOUD_VERSUCHE:-4}"
HC_TOKEN="${HC_TOKEN:-}"
HC_STATUS=0
HC_BODY=""

# Etikett „schluessel=wert" → JSON-Objekt {"schluessel":"wert"}
hc_etikett_json() {
  python3 -c 'import sys,json; k,_,v=sys.argv[1].partition("="); print(json.dumps({k:v}))' "$1"
}

# URL-Kodierung eines Parameterwerts
hc_urlenc() {
  python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1], safe=""))' "$1"
}

# JSON aus $HC_BODY auswerten: `hc_py 'print(d["server"]["id"])'` (d = das Dokument).
# Rückgabe ungleich 0 bei kaputtem JSON oder fehlendem Schlüssel.
hc_py() {
  printf '%s' "$HC_BODY" | python3 -c 'import sys,json
d=json.load(sys.stdin)
'"$1" 2>/dev/null
}

# hc_anfrage METHODE PFAD [KÖRPER]  → setzt HC_STATUS und HC_BODY; Rückgabe 0 bei 2xx.
hc_anfrage() {
  local methode="$1" pfad="$2" koerper="${3-}" versuch=0 tmp code=000 pause
  [ -n "$HC_TOKEN" ] || { HC_STATUS=000; HC_BODY=""; return 1; }
  while :; do
    versuch=$((versuch + 1))
    tmp=$(mktemp)
    if [ -n "$koerper" ]; then
      code=$(printf '%s' "$koerper" | curl -sS -m "$PA_HCLOUD_TIMEOUT" -X "$methode" \
        -K <(printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$HC_TOKEN") \
        --data-binary @- -o "$tmp" -w '%{http_code}' "$PA_HCLOUD_API$pfad" 2>/dev/null) || code=000
    else
      code=$(curl -sS -m "$PA_HCLOUD_TIMEOUT" -X "$methode" \
        -K <(printf 'header = "Authorization: Bearer %s"\n' "$HC_TOKEN") \
        -o "$tmp" -w '%{http_code}' "$PA_HCLOUD_API$pfad" 2>/dev/null) || code=000
    fi
    HC_STATUS="$code"
    HC_BODY=$(cat "$tmp" 2>/dev/null || true)
    rm -f "$tmp"
    case "$code" in
      2??) return 0 ;;
      429) : ;;                                   # immer wiederholbar
      000|5??) [ "$methode" = "POST" ] && return 1 ;;   # POST nie blind wiederholen
      *) return 1 ;;
    esac
    [ "$versuch" -lt "$PA_HCLOUD_VERSUCHE" ] || return 1
    pause=$((versuch * 2))
    sleep "${PA_HCLOUD_PAUSE:-$pause}"
  done
}

# Kurzer Fehlertext aus der API-Antwort (ohne Körper, ohne Token).
hc_fehlertext() {
  local t
  t=$(hc_py 'e=d.get("error",{}); print(str(e.get("code",""))+": "+str(e.get("message",""))[:200])' || true)
  printf 'HTTP %s %s' "$HC_STATUS" "${t:-(kein Fehlertext)}"
}

# Token aus einer Datei lesen (nur tmpfs-Datei des Servers, Rechte 600/400 und Besitzer root).
# Setzt HC_TOKEN, gibt es nirgends aus. Rückgabe 1 mit Meldung auf stderr bei Mangel.
hc_token_aus_datei() {
  local datei="$1" rechte besitzer
  [ -f "$datei" ] || { echo "Token-Datei fehlt: $datei" >&2; return 1; }
  rechte=$(stat -c %a "$datei" 2>/dev/null || echo unbekannt)
  besitzer=$(stat -c %u "$datei" 2>/dev/null || echo unbekannt)
  case "$rechte" in
    600|400) ;;
    *) echo "Token-Datei $datei hat Rechte $rechte (verlangt: 600 oder 400)" >&2; return 1 ;;
  esac
  if [ "$besitzer" != "$(id -u)" ]; then
    echo "Token-Datei $datei gehört nicht dem ausführenden Benutzer" >&2; return 1
  fi
  HC_TOKEN=$(tr -d '[:space:]' < "$datei")
  [ -n "$HC_TOKEN" ] || { echo "Token-Datei $datei ist leer" >&2; return 1; }
}

# Alle Seiten einer Liste: hc_liste PFAD_MIT_FRAGEZEICHEN_ODER_NICHT SCHLÜSSEL
# Ergebnis: JSON-Array in HC_BODY. Rückgabe 1 bei Fehler.
hc_liste() {
  local pfad="$1" schluessel="$2" seite=1 trenner="?" sammel="[]" weiter
  case "$pfad" in *\?*) trenner="&" ;; esac
  while :; do
    hc_anfrage GET "${pfad}${trenner}per_page=50&page=${seite}" || return 1
    sammel=$(printf '%s' "$HC_BODY" | SAMMEL="$sammel" python3 -c '
import sys,json,os
d=json.load(sys.stdin); s=json.loads(os.environ["SAMMEL"])
s.extend(d.get("'"$schluessel"'",[])); print(json.dumps(s))') || return 1
    weiter=$(printf '%s' "$HC_BODY" | python3 -c '
import sys,json
d=json.load(sys.stdin); n=((d.get("meta") or {}).get("pagination") or {}).get("next_page")
print(n if n else "")') || return 1
    [ -n "$weiter" ] || break
    seite="$weiter"
  done
  HC_BODY="$sammel"
  return 0
}

# Abbild prüfen. Erwartet in HC_BODY ein Dokument {"image":{…}}.
# hc_abbild_pruefen SERVER_ID ETIKETT(schluessel=wert); gibt Grund auf stdout, wenn ungültig.
# Rückgabe 0 = verfügbar, Snapshot, Größe > 0, vom richtigen Server, mit Etikett.
hc_abbild_pruefen() {
  printf '%s' "$HC_BODY" | SERVER_ID="$1" ETIKETT="$2" python3 -c '
import sys,json,os
d=json.load(sys.stdin).get("image") or {}
k,_,v=os.environ["ETIKETT"].partition("=")
sid=os.environ["SERVER_ID"]
fehler=[]
if d.get("status")!="available": fehler.append("Status "+str(d.get("status"))+" statt available")
if d.get("type")!="snapshot": fehler.append("Typ "+str(d.get("type")))
try:
    if not float(d.get("image_size") or 0)>0: fehler.append("image_size nicht > 0")
except Exception: fehler.append("image_size unlesbar")
try:
    if not float(d.get("disk_size") or 0)>0: fehler.append("disk_size nicht > 0")
except Exception: fehler.append("disk_size unlesbar")
cf=d.get("created_from") or {}
if sid and cf and str(cf.get("id"))!=sid: fehler.append("created_from.id "+str(cf.get("id"))+" ist nicht Server "+sid)
if (d.get("labels") or {}).get(k)!=v: fehler.append("Etikett "+k+"="+v+" fehlt")
if fehler:
    print("; ".join(fehler)); sys.exit(1)
print("id=%s status=%s image_size=%.3f GB disk_size=%s GB created=%s" % (d.get("id"),d.get("status"),float(d["image_size"]),d.get("disk_size"),d.get("created")))
'
}

# -----------------------------------------------------------------------------
# Abbild erstellen und prüfen (gemeinsam für selbst-abbild-loeschen.sh und not-aus).
# Erwartet eine Funktion `protokoll` des aufrufenden Skripts.
#   hc_abbild_anlegen SERVER_ID ETIKETT BESCHREIBUNG WARTE_SEKUNDEN POLL_SEKUNDEN
# Setzt NEUES_ABBILD bei Erfolg (0); bei Fehlschlag Rückgabe 1 (unfertiges/ungültiges
# Abbild wird dabei best effort wieder gelöscht, damit es nichts kostet).
# -----------------------------------------------------------------------------
NEUES_ABBILD=""
hc_ganzzahl() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

hc_abbild_anlegen() {
  local sid="$1" etikett="$2" beschreibung="$3" warte="$4" poll="$5" id="" ende status grund koerper
  NEUES_ABBILD=""
  koerper=$(BESCHR="$beschreibung" LABEL="$etikett" python3 -c '
import json,os
k,_,v=os.environ["LABEL"].partition("=")
print(json.dumps({"type":"snapshot","description":os.environ["BESCHR"],"labels":{k:v}}))')
  protokoll "create_image für Server $sid …"
  if ! hc_anfrage POST "/servers/$sid/actions/create_image" "$koerper"; then
    protokoll "  create_image fehlgeschlagen: $(hc_fehlertext)"; return 1
  fi
  id=$(hc_py 'print(d["image"]["id"])' || true)
  hc_ganzzahl "$id" || { protokoll "  keine Abbild-ID in der Antwort"; return 1; }
  protokoll "  Abbild $id wird erstellt, warte auf available (bis ${warte}s)"
  ende=$(( $(date +%s) + warte ))
  while :; do
    if hc_anfrage GET "/images/$id"; then
      status=$(hc_py 'print(d["image"]["status"])' || echo "?")
      [ "$status" = "available" ] && break
      protokoll "  Abbild $id: $status"
    else
      protokoll "  Abbild $id nicht lesbar: $(hc_fehlertext)"
    fi
    if [ "$(date +%s)" -ge "$ende" ]; then
      protokoll "  Zeitüberschreitung: Abbild $id nicht verfügbar"
      hc_anfrage DELETE "/images/$id" >/dev/null 2>&1 || true
      return 1
    fi
    sleep "$poll"
  done
  if grund=$(hc_abbild_pruefen "$sid" "$etikett"); then
    protokoll "  GEPRÜFT: $grund"
    NEUES_ABBILD="$id"
    return 0
  fi
  protokoll "  Abbild $id ist NICHT gültig: $grund"
  hc_anfrage DELETE "/images/$id" >/dev/null 2>&1 || true
  return 1
}

# Ältere Abbilder mit demselben Etikett löschen; die neuesten BEHALTEN bleiben, das neue
# immer. Nur mit unserem Etikett, nie andere Abbilder. Aufruf NUR nach geprüftem Abbild.
#   hc_abbilder_aufraeumen ETIKETT NEUES_ABBILD BEHALTEN
hc_abbilder_aufraeumen() {
  local etikett="$1" neu="$2" keep="$3" zu_loeschen alt
  if ! hc_liste "/images?type=snapshot&label_selector=$(hc_urlenc "$etikett")" images; then
    protokoll "Abbildliste nicht lesbar ($(hc_fehlertext)) — alte Abbilder bleiben."; return 0
  fi
  if ! zu_loeschen=$(printf '%s' "$HC_BODY" | NEU="$neu" KEEP="$keep" python3 -c '
import sys,json,os
imgs=json.load(sys.stdin); neu=os.environ["NEU"]; keep=int(os.environ["KEEP"])
ids=[str(i["id"]) for i in sorted(imgs,key=lambda i:(i.get("created") or "",i["id"]),reverse=True)]
if neu not in ids: sys.exit(3)
behalte=[neu]+[i for i in ids if i!=neu][:keep-1]
print("\n".join(i for i in ids if i not in behalte))'); then
    protokoll "Abbildliste enthält das neue Abbild nicht — es wird NICHTS gelöscht."; return 0
  fi
  while IFS= read -r alt; do
    [ -n "$alt" ] || continue
    protokoll "  altes Abbild wird gelöscht: $alt"
    hc_anfrage DELETE "/images/$alt" >/dev/null || protokoll "  ! Löschen von $alt schlug fehl ($(hc_fehlertext))"
  done <<<"$zu_loeschen"
  return 0
}
