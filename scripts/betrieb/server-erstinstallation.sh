#!/usr/bin/env bash
# =============================================================================
#  server-erstinstallation.sh — richtet einen frisch erzeugten Hetzner-Server ein
# =============================================================================
#  Läuft AUF dem Server, einmal je Start, aufgerufen von cloud-init (runcmd) aus der
#  user_data, die scripts/betrieb/server-hochfahren.sh erzeugt. Das Skript selbst liegt
#  in der user_data (Server aus ubuntu-24.04) und im Repo (Release-Paket, Abbild).
#
#    --frisch       Ubuntu 24.04 ohne Spiel: Pakete, Node, Caddy, git clone, Bau, Paket,
#                   deploy.sh, systemd-Einheiten, Firewall, Idle-Timer (docs/deploy-plan.md §5).
#                   Ist schon ein Release da (Neustart), wirkt es wie --aus-abbild.
#    --aus-abbild   Server aus dem Snapshot: Spiel ist da; nur die Parameter dieses Starts
#                   übernehmen (betrieb.env, Domain), Leerlaufzustand zurücksetzen, starten.
#
#  Vorher hat cloud-init (write_files) geschrieben:
#    /run/projectarmageddon/hcloud-token   tmpfs, 0600 — das Token NIE auf die Platte
#    /etc/projectarmageddon/betrieb.env    Betriebsparameter (keine Geheimnisse)
#    /etc/projectarmageddon/boot.env       PA_GIT_URL, PA_GIT_REF, PA_NODE_MAJOR, PA_DOMAIN,
#                                          PA_ACME_EMAIL, PA_SSH (ja|nein)
#    /etc/systemd/system/caddy.service.d/pa.conf   PA_DOMAIN, PA_ACME_EMAIL für Caddy
#
#  BEOBACHTBARKEIT OHNE SSH: Jede Phase setzt das Server-Etikett projectarmageddon-phase
#  (Hetzner-API, mit dem Token aus dem Arbeitsspeicher); server-hochfahren.sh zeigt es an.
#  Bei Fehlern steht dort fehler-<phase>.
# =============================================================================
set -Eeuo pipefail

MODUS="${1:---frisch}"
BASIS=/opt/projectarmageddon
TOKEN_DATEI=/run/projectarmageddon/hcloud-token
API="${PA_HCLOUD_API:-https://api.hetzner.cloud/v1}"
export DEBIAN_FRONTEND=noninteractive

# shellcheck disable=SC1091
. /etc/projectarmageddon/boot.env
PA_GIT_URL="${PA_GIT_URL:-https://github.com/kAInplanmusic/projectarmageddon}"
PA_GIT_REF="${PA_GIT_REF:-main}"
PA_NODE_MAJOR="${PA_NODE_MAJOR:-22}"
PA_SSH="${PA_SSH:-nein}"
PA_ACME_EMAIL="${PA_ACME_EMAIL:-}"
PA_DOMAIN="${PA_DOMAIN:?PA_DOMAIN fehlt in boot.env}"

# Alles Ausgegebene auch in eine Datei; die letzte Zeile wird als Etikett gemeldet (Beobachtung ohne SSH).
LOGDATEI=/var/log/pa-install.log
exec > >(tee -a "$LOGDATEI") 2>&1

log() { printf '%s [erstinstallation] %s\n' "$(date -Is)" "$*"; }

SERVER_ID=$(curl -fsS -m 5 http://169.254.169.254/hetzner/v1/metadata/instance-id 2>/dev/null | tr -d '[:space:]' || true)

# Etikett projectarmageddon-phase setzen (best effort, nie fatal, nie mit Token in der Befehlszeile)
etikett() { # $1 Schlüssel, $2 Wert
  [ -n "$SERVER_ID" ] && [ -f "$TOKEN_DATEI" ] || return 0
  local tok akt neu
  tok=$(tr -d '[:space:]' < "$TOKEN_DATEI")
  akt=$(curl -fsS -m 20 -K <(printf 'header = "Authorization: Bearer %s"\n' "$tok") "$API/servers/$SERVER_ID" 2>/dev/null) || return 0
  neu=$(printf '%s' "$akt" | K="$1" V="$2" python3 -c '
import sys,json,os,re
l=json.load(sys.stdin)["server"].get("labels") or {}
v=re.sub(r"[^A-Za-z0-9_.-]","-",os.environ["V"])[:60].strip("-_.") or "x"
l[os.environ["K"]]=v
print(json.dumps({"labels":l}))') || return 0
  printf '%s' "$neu" | curl -fsS -m 20 -X PUT -o /dev/null \
    -K <(printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$tok") \
    --data-binary @- "$API/servers/$SERVER_ID" 2>/dev/null || true
}
ZEILE_PID=""
zeilen_melder() {
  ( while sleep 6; do z=$(tail -n1 "$LOGDATEI" 2>/dev/null || true); etikett projectarmageddon-zeile "${z: -55}"; done ) &
  ZEILE_PID=$!
}
PHASE=start
phase() { PHASE="$1"; log "Phase: $1"; etikett projectarmageddon-phase "$1"; }
bei_fehler() {
  local rc=$?
  [ -z "$ZEILE_PID" ] || kill "$ZEILE_PID" 2>/dev/null || true
  log "FEHLER in Phase $PHASE (rc=$rc)"
  etikett projectarmageddon-phase "fehler-$PHASE"
  # Die letzten Zeilen nacheinander als Etikett melden (server-hochfahren.sh liest mit).
  { journalctl -u projectarmageddon -n 8 --no-pager -o cat 2>/dev/null; tail -n 8 "$LOGDATEI" 2>/dev/null; } | tail -n 16 \
    | while IFS= read -r l; do etikett projectarmageddon-zeile "${l: -55}"; sleep 3; done
  exit "$rc"
}
trap bei_fehler ERR

apt_() { apt-get -o DPkg::Lock::Timeout=900 -y -q "$@"; }

# ---------------------------------------------------------------- gemeinsam -----
# Caddyfile aus der Vorlage; ohne ACME-Kontakt entfällt die email-Zeile (leer wäre ein Syntaxfehler).
caddyfile_schreiben() {
  local quelle="$BASIS/current/deploy/Caddyfile.beispiel"
  install -d /etc/caddy /var/log/caddy
  chown caddy:caddy /var/log/caddy 2>/dev/null || true
  if [ -n "$PA_ACME_EMAIL" ]; then
    install -m 644 "$quelle" /etc/caddy/Caddyfile
  else
    grep -v '^[[:space:]]*email {\$PA_ACME_EMAIL}' "$quelle" > /etc/caddy/Caddyfile
    chmod 644 /etc/caddy/Caddyfile
  fi
  PA_DOMAIN="$PA_DOMAIN" PA_ACME_EMAIL="$PA_ACME_EMAIL" caddy validate --config /etc/caddy/Caddyfile >/dev/null
  # `caddy validate` (als root) legt die Logdatei an; Caddy läuft als Benutzer caddy und braucht sie lesbar/schreibbar.
  chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
}

ssh_einstellen() {
  install -d /etc/ssh/sshd_config.d
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-pa.conf
  passwd -l root >/dev/null 2>&1 || true
  if [ "$PA_SSH" = "ja" ]; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  else
    # Ohne hinterlegten Schlüssel ist SSH nutzlos: gar nicht erst lauschen.
    systemctl disable --now ssh.socket ssh 2>/dev/null || true
  fi
}

# „bereit“ muss stimmen: Dienste aktiv, Spielserver antwortet, Caddy nimmt auf Port 80 an.
# Bei Mangel: Phase fehler-selbsttest und die Journalzeilen als Etikett (bei_fehler).
selbsttest() {
  phase selbsttest
  local i code
  for i in $(seq 1 30); do
    systemctl is-active --quiet projectarmageddon.service && curl -fsS -m 3 -o /dev/null http://127.0.0.1:3000/healthz && break
    sleep 3
  done
  curl -fsS -m 3 -o /dev/null http://127.0.0.1:3000/healthz || { log "Spielserver antwortet nicht"; journalctl -u projectarmageddon -n 12 --no-pager -o cat; return 1; }
  for i in $(seq 1 20); do
    code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || echo 000)
    case "$code" in 200|30?) log "Caddy antwortet auf Port 80 ($code)"; return 0 ;; esac
    sleep 3
  done
  log "Caddy antwortet nicht auf Port 80 (letzter Code $code)"
  systemctl is-active caddy || true
  journalctl -u caddy -n 12 --no-pager -o cat
  return 1
}

# cloud-init legt die user_data (darin das Token) auf der Platte ab. Diese Reste entfernen, dann die
# ganze Platte nach dem Token durchsuchen und das Ergebnis als Etikett melden. So ist jedes Abbild
# (auch das von „not-aus“) frei vom Token, sobald die Phase „bereit“ erreicht ist.
token_saeubern() {
  phase token-pruefen
  find /var/lib/cloud -type f \( -name 'user-data*' -o -name 'cloud-config.txt' -o -name 'obj.pkl' -o -name 'runcmd' -o -name 'part-*' -o -name 'vendor-data*' \) -delete 2>/dev/null || true
  rm -f /var/log/cloud-init.log /var/log/cloud-init-output.log 2>/dev/null || true
  [ -f "$TOKEN_DATEI" ] || return 0
  local treffer
  treffer=$(timeout 900 grep -rlaF --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev --exclude-dir=run \
    -f <(tr -d '[:space:]' < "$TOKEN_DATEI"; echo) / 2>/dev/null | head -5 || true)
  if [ -n "$treffer" ]; then
    log "TOKEN AUF DER PLATTE in: $(printf '%s' "$treffer" | tr '\n' ' ')"
    etikett projectarmageddon-tokensuche gefunden
  else
    log "Platte ist frei vom Token."
    etikett projectarmageddon-tokensuche sauber
  fi
}

starten() {
  phase start
  # Zustand des Leerlauf-Zählers aus dem Abbild verwerfen: sonst gilt der neue Server sofort als lange unbenutzt.
  rm -f /var/lib/projectarmageddon/first-seen /var/lib/projectarmageddon/last-active /var/lib/projectarmageddon/last-sample-* 2>/dev/null || true
  if [ -f /var/lib/projectarmageddon/abbild-marke ]; then
    etikett projectarmageddon-vorgaenger "$(tr ' =' '--' < /var/lib/projectarmageddon/abbild-marke | tr -d '\n')"
  fi
  install -d -m 700 /etc/projectarmageddon
  touch /etc/projectarmageddon/ist-gemietet
  systemctl daemon-reload
  caddyfile_schreiben
  systemctl enable nftables >/dev/null 2>&1 || true
  nft -c -f "$BASIS/current/deploy/firewall.nft"
  install -m 600 "$BASIS/current/deploy/firewall.nft" /etc/nftables.conf
  # Der Spielserver (User pa) darf den Metadatendienst nicht lesen: dort steht die user_data mit dem Token.
  cat >> /etc/nftables.conf <<'NFT'

table inet pa_metadaten {
	chain ausgang {
		type filter hook output priority filter - 1; policy accept;
		meta skuid "pa" ip daddr 169.254.169.254 drop comment "Spielserver: kein Metadatendienst"
	}
}
NFT
  nft -c -f /etc/nftables.conf
  systemctl restart nftables
  systemctl enable projectarmageddon.service >/dev/null 2>&1
  systemctl restart projectarmageddon.service
  systemctl enable caddy >/dev/null 2>&1
  systemctl restart caddy
  systemctl enable --now projectarmageddon-idle.timer
  ssh_einstellen
  selbsttest
  token_saeubern
  phase bereit
}

# ------------------------------------------------------------------- frisch -----
frisch() {
  phase apt
  apt_ update
  apt_ install curl ca-certificates git xz-utils nftables gnupg apt-transport-https debian-archive-keyring python3
  phase caddy
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt_ update
  apt_ install caddy
  phase node
  local liste datei
  liste=$(curl -fsSL "https://nodejs.org/dist/latest-v${PA_NODE_MAJOR}.x/SHASUMS256.txt")
  datei=$(printf '%s\n' "$liste" | awk '{print $2}' | grep -E "^node-v${PA_NODE_MAJOR}\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$" | head -n1)
  [ -n "$datei" ] || { log "kein Node-$PA_NODE_MAJOR-Archiv gefunden"; false; }
  curl -fsSL -o "/var/tmp/$datei" "https://nodejs.org/dist/latest-v${PA_NODE_MAJOR}.x/$datei"
  ( cd /var/tmp && printf '%s\n' "$liste" | grep " $datei\$" | sha256sum -c - )
  tar -xJf "/var/tmp/$datei" -C /usr/local --strip-components=1 --no-same-owner
  rm -f "/var/tmp/$datei"
  node -v; npm -v
  phase klonen
  rm -rf /var/tmp/pa-quelle
  git clone --depth 1 --branch "$PA_GIT_REF" "$PA_GIT_URL" /var/tmp/pa-quelle
  cd /var/tmp/pa-quelle
  phase npm-ci
  npm ci --ignore-scripts --no-audit --no-fund
  phase bauen
  npm run build
  phase paket
  node scripts/release/paket.mjs
  local paket
  paket=$(ls release/projectarmageddon-*.tar.gz | head -n1)
  phase deploy
  id pa >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin pa
  install -d -m 755 "$BASIS"
  install -d -m 700 /etc/projectarmageddon
  cp deploy/systemd/projectarmageddon.service deploy/systemd/projectarmageddon-idle.service deploy/systemd/projectarmageddon-idle.timer /etc/systemd/system/
  systemctl daemon-reload
  timeout 900 scripts/release/deploy.sh --ohne-sicherung "$paket"
  phase aufraeumen
  cd /
  rm -rf /var/tmp/pa-quelle /root/.npm
  apt-get clean; rm -rf /var/lib/apt/lists/*
}

zeilen_melder
trap '[ -z "$ZEILE_PID" ] || kill "$ZEILE_PID" 2>/dev/null || true' EXIT
case "$MODUS" in
  --frisch)
    if [ -e "$BASIS/current/scripts/server.mjs" ]; then log "Release vorhanden: wie --aus-abbild"; else frisch; fi
    starten ;;
  --aus-abbild) starten ;;
  *) echo "Aufruf: $0 --frisch | --aus-abbild" >&2; exit 1 ;;
esac
log "fertig"
