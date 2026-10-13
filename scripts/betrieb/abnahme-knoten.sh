#!/usr/bin/env bash
#
# abnahme-knoten.sh — Abnahme auf einem frisch gemieteten Knoten (als root).
#
# Beantwortet mit Belegen, was bisher nur als Datei im Repo lag (docs/betrieb.md,
# „Eine Datei im Repo ist kein laufender Dienst"):
#   - Tests laufen auf dem Knoten (Node >= 22, npm ci, npm test)
#   - der Dienst startet unter systemd als Benutzer `pa`, `/healthz` antwortet
#   - der Idle-Timer ist installiert (Ausgabe von `systemctl list-timers`)
#   - ein echtes Online-Match mit zwei Menschen läuft (probe-spiel.mjs)
#   - die Snapshot-Sicherung hält die neuesten 3 (viermal ausgelöst -> drei bleiben)
#   - beim STOPP des Dienstes entsteht ein Snapshot (ExecStopPost), mit Prüfsumme
#
# Jeder Schritt schreibt ein Protokoll nach $ERGEBNIS/NN-name.log; die Zusammenfassung
# steht in $ERGEBNIS/zusammenfassung.json. Ein fehlgeschlagener Schritt bricht den
# Lauf NICHT ab — es soll alles gemessen werden. Exit 0 nur, wenn alle bestehen.
#
# Aufruf: abnahme-knoten.sh [--repo /opt/projectarmageddon] [--ergebnis /var/tmp/pa-abnahme]
#                           [--ohne-tests]   (überspringt `npm test`, ~5 min)

set -uo pipefail

REPO=/opt/projectarmageddon
ERGEBNIS=/var/tmp/pa-abnahme
OHNE_TESTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) shift; REPO="$1" ;;
    --ergebnis) shift; ERGEBNIS="$1" ;;
    --ohne-tests) OHNE_TESTS=1 ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(id -u)" -ne 0 ]; then echo "als root ausführen" >&2; exit 1; fi
mkdir -p "$ERGEBNIS"
ZUSAMMENFASSUNG="$ERGEBNIS/schritte.tsv"
: > "$ZUSAMMENFASSUNG"
NR=0
ALLES_OK=1

# schritt NAME BEFEHL… — Ausgabe in eine Datei, Ergebnis in die Tabelle
schritt() {
  local name="$1"; shift
  NR=$((NR + 1))
  local datei; datei=$(printf '%s/%02d-%s.log' "$ERGEBNIS" "$NR" "$name")
  local start; start=$(date +%s)
  echo "[$(date -Is)] >>> $name" >&2
  "$@" > "$datei" 2>&1
  local rc=$?
  local dauer=$(( $(date +%s) - start ))
  [ "$rc" -eq 0 ] || ALLES_OK=0
  printf '%02d\t%s\t%s\t%ss\n' "$NR" "$name" "$([ $rc -eq 0 ] && echo OK || echo "FEHLER($rc)")" "$dauer" >> "$ZUSAMMENFASSUNG"
  echo "[$(date -Is)] <<< $name rc=$rc (${dauer}s)" >&2
  return 0
}

cd "$REPO" || exit 1

system_info() {
  uname -a; echo; nproc; free -m; df -h /; echo; node -v; npm -v; echo
  . /etc/os-release && echo "$PRETTY_NAME"
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]
}

installieren() {
  # Der Client wird VOR dem Start gebaut: Die systemd-Einheit ist schreibgeschützt
  # (ProtectSystem=strict, nur /var/lib/projectarmageddon beschreibbar), PA_BUILD=auto
  # könnte im Dienst kein dist/ anlegen.
  (cd "$REPO" && npm run build) || return 1
  id pa >/dev/null 2>&1 || useradd --system --home-dir /var/lib/projectarmageddon --shell /usr/sbin/nologin pa
  chown -R pa:pa "$REPO"
  mkdir -p /etc/projectarmageddon /var/lib/projectarmageddon
  chown pa:pa /var/lib/projectarmageddon
  cat > /etc/projectarmageddon/betrieb.env <<'ENV'
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
LOG_FORMAT=json
PA_STATE_PATH=/var/lib/projectarmageddon/lobbies.json
PA_STATE_DIR=/var/lib/projectarmageddon
PA_ERLAUBE_OEFFENTLICH=no
PA_BUILD=0
PA_IDLE_MINUTES=15
PA_GRACE_MINUTES=5
PA_MAX_RUNTIME_MINUTES=180
PA_MAX_MACHINE_MINUTES=240
PA_ACTION=stop
PA_SYSTEMD_UNIT=projectarmageddon.service
PA_ARMED_FILE=/etc/projectarmageddon/ist-gemietet
PA_HEALTH_URL=http://127.0.0.1:3000/healthz
PA_SNAPSHOT_DIR=/var/lib/projectarmageddon/snapshots
PA_SNAPSHOT_KEEP=3
PA_SNAPSHOT_CLOUD=no
ENV
  chmod 600 /etc/projectarmageddon/betrieb.env
  touch /etc/projectarmageddon/ist-gemietet
  cp deploy/systemd/projectarmageddon.service deploy/systemd/projectarmageddon-idle.service \
     deploy/systemd/projectarmageddon-idle.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now projectarmageddon-idle.timer
  systemctl start projectarmageddon.service
}

warte_auf_health() {
  for i in $(seq 1 90); do
    if curl -fsS --max-time 3 http://127.0.0.1:3000/healthz; then echo; return 0; fi
    sleep 2
  done
  systemctl status projectarmageddon.service --no-pager -l || true
  journalctl -u projectarmageddon.service --no-pager -n 60 || true
  return 1
}

timer_nachweis() {
  systemctl list-timers --all --no-pager
  echo; systemctl is-enabled projectarmageddon-idle.timer
  systemctl is-active projectarmageddon-idle.timer
  systemctl list-timers --no-pager | grep -q projectarmageddon-idle
}

dienst_nachweis() {
  systemctl show projectarmageddon.service -p User -p ActiveState -p ExecStopPost -p TimeoutStopUSec --no-pager
  [ "$(systemctl show projectarmageddon.service -p User --value)" = "pa" ]
  systemctl is-active projectarmageddon.service
}

snapshot_viermal() {
  local dir=/var/lib/projectarmageddon/snapshots
  for i in 1 2 3 4; do
    runuser -u pa -- env $(grep -v '^#' /etc/projectarmageddon/betrieb.env | xargs) \
      "$REPO/scripts/betrieb/snapshot.sh" --grund "Abnahme Lauf $i" || return 1
    sleep 1.2
  done
  ls -l "$dir"
  local n; n=$(find "$dir" -maxdepth 1 -name 'pa-snapshot-*.tar.gz' | wc -l)
  echo "Archive vorhanden: $n (erwartet: 3)"
  [ "$n" -eq 3 ]
}

stopp_sichert() {
  local dir=/var/lib/projectarmageddon/snapshots
  local vorher; vorher=$(find "$dir" -maxdepth 1 -name 'pa-snapshot-*.tar.gz' | sort | tail -n 1)
  sleep 1.2
  systemctl stop projectarmageddon.service
  local rc=$?
  echo "systemctl stop rc=$rc"
  local neu; neu=$(find "$dir" -maxdepth 1 -name 'pa-snapshot-*.tar.gz' | sort | tail -n 1)
  echo "neuestes vorher: ${vorher##*/}"; echo "neuestes nachher: ${neu##*/}"
  [ "$neu" != "$vorher" ] || { echo "KEIN neuer Snapshot beim Stopp"; journalctl -u projectarmageddon.service --no-pager -n 40; return 1; }
  (cd "$dir" && sha256sum -c "${neu##*/}.sha256")
  tar -tzf "$neu" | head -30
  tar -xzOf "$neu" ./manifest.json | head -12
  tar -tzf "$neu" > /tmp/pa-inhalt.txt
  grep -q 'state/lobbies.json' /tmp/pa-inhalt.txt && echo "Spielstand im Archiv: ja" || { echo "Spielstand im Archiv: NEIN"; return 1; }
  journalctl -u projectarmageddon.service --no-pager -n 40 | grep -i "snapshot"
  [ "$(find "$dir" -maxdepth 1 -name 'pa-snapshot-*.tar.gz' | wc -l)" -le 3 ]
}

# ----------------------------------------------------------------- Ablauf
schritt system system_info
schritt npm-ci bash -c "cd '$REPO' && npm ci --no-audit --no-fund"
if [ "$OHNE_TESTS" = "1" ]; then
  schritt npm-test bash -c "echo 'übersprungen (--ohne-tests)'"
else
  schritt npm-test bash -c "cd '$REPO' && npm test 2>&1 | grep -E '^# (tests|pass|fail|skipped)|^not ok' ; exit \${PIPESTATUS[0]}"
fi
schritt installieren installieren
schritt health warte_auf_health
schritt timer timer_nachweis
schritt dienst dienst_nachweis
schritt spiel-hills bash -c "cd '$REPO' && node scripts/betrieb/probe-spiel.mjs --url http://127.0.0.1:3000 --seed 4711 --preset hills --schuesse 6"
schritt spiel-mountains bash -c "cd '$REPO' && node scripts/betrieb/probe-spiel.mjs --url http://127.0.0.1:3000 --seed 2026 --preset mountains --schuesse 4"
schritt snapshot-viermal snapshot_viermal
schritt stopp-sichert stopp_sichert
schritt neustart bash -c "systemctl start projectarmageddon.service && sleep 4 && curl -fsS --max-time 5 http://127.0.0.1:3000/healthz && echo && systemctl stop projectarmageddon.service && echo gestoppt"

{
  printf '{\n  "ok": %s,\n  "ende": "%s",\n  "rechner": "%s",\n  "schritte": [\n' "$([ $ALLES_OK -eq 1 ] && echo true || echo false)" "$(date -Is)" "$(hostname)"
  awk -F'\t' 'BEGIN{e=1} {if(!e)printf(",\n"); e=0; printf("    {\"nr\":\"%s\",\"name\":\"%s\",\"ergebnis\":\"%s\",\"dauer\":\"%s\"}",$1,$2,$3,$4)} END{printf("\n")}' "$ZUSAMMENFASSUNG"
  printf '  ]\n}\n'
} > "$ERGEBNIS/zusammenfassung.json"
cat "$ZUSAMMENFASSUNG" >&2
[ "$ALLES_OK" -eq 1 ]
