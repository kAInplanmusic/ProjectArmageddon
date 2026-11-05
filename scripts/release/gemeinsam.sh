# shellcheck shell=bash
# =============================================================================
#  Gemeinsame Teile von deploy.sh und rollback.sh (wird mit `source` geladen)
# =============================================================================
#  Verzeichnisaufbau auf dem Knoten (docs/deploy-plan.md, Abschnitt 4):
#
#    $PA_BASIS/                         Vorgabe /opt/projectarmageddon
#      releases/<kennung>/              ein entpacktes Release-Paket je Version
#      current -> releases/<kennung>    das laufende Release (Symlink, atomar umgehängt)
#      releases.log                     Zeit, Aktion, von, nach, Ergebnis (Tab-getrennt)
#
#  Alle Befehle mit Wirkung laufen über `tu`: Im Trockenlauf (`--trocken` oder
#  DRY_RUN=1) werden sie nur angezeigt. Werkzeuge sind über die Umgebung
#  austauschbar (PA_SYSTEMCTL, PA_NPM, PA_NODE, PA_SMOKE_BEFEHL) — so prüft
#  `tests/release-skripte.test.js` den Ablauf ohne systemd und ohne Netz.
# =============================================================================

# Betriebsparameter des Dienstes (PORT, PA_STATE_PATH, PA_SYSTEMD_UNIT, PA_SICHERUNG_*), damit
# deploy.sh/rollback.sh unter sudo dieselben Werte sehen wie die systemd-Einheit.
PA_BETRIEB_ENV="${PA_BETRIEB_ENV:-/etc/projectarmageddon/betrieb.env}"
if [ -r "$PA_BETRIEB_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$PA_BETRIEB_ENV"
  set +a
fi

PA_BASIS="${PA_BASIS:-/opt/projectarmageddon}"
PA_SYSTEMD_UNIT="${PA_SYSTEMD_UNIT:-projectarmageddon.service}"
PA_SMOKE_URL="${PA_SMOKE_URL:-http://127.0.0.1:${PORT:-3000}}"
PA_SMOKE_FRIST="${PA_SMOKE_FRIST:-60}"
PA_SMOKE_OHNE_LOBBY="${PA_SMOKE_OHNE_LOBBY:-no}"
PA_BEHALTEN="${PA_BEHALTEN:-5}"
PA_SYSTEMCTL="${PA_SYSTEMCTL:-systemctl}"
PA_NPM="${PA_NPM:-npm}"
PA_NODE="${PA_NODE:-node}"
PA_SMOKE_BEFEHL="${PA_SMOKE_BEFEHL:-}"
TROCKEN="${TROCKEN:-no}"
[ "${DRY_RUN:-0}" = "1" ] && TROCKEN=yes

RELEASES="$PA_BASIS/releases"
CURRENT="$PA_BASIS/current"
LOGDATEI="$PA_BASIS/releases.log"

protokoll() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${PROGRAMM:-release}" "$*" >&2; }

# Befehl mit Wirkung: im Trockenlauf nur anzeigen.
tu() {
  if [ "$TROCKEN" = "yes" ]; then
    printf '[trocken] %s\n' "$*" >&2
    return 0
  fi
  "$@"
}

# Kennung des laufenden Releases (leer, wenn es keins gibt).
aktuelle_kennung() {
  if [ -L "$CURRENT" ]; then
    basename "$(readlink "$CURRENT")"
  fi
}

pruefe_kennung() {
  case "$1" in
    ''|*/*|.*|*' '*) return 1 ;;
  esac
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]
}

# Hängt `current` atomar um (neuer Symlink daneben, dann rename über den alten).
schalte_um() {
  local kennung="$1"
  [ -d "$RELEASES/$kennung" ] || [ "$TROCKEN" = "yes" ] || { protokoll "FEHLER: $RELEASES/$kennung fehlt"; return 1; }
  tu ln -sfn "releases/$kennung" "$CURRENT.neu"
  tu mv -Tf "$CURRENT.neu" "$CURRENT"
  protokoll "current -> releases/$kennung"
}

neustart() {
  protokoll "Neustart: $PA_SYSTEMCTL restart $PA_SYSTEMD_UNIT"
  tu "$PA_SYSTEMCTL" restart "$PA_SYSTEMD_UNIT"
}

# Feld aus RELEASE.json eines Releases lesen (leer, wenn nicht vorhanden).
release_feld() {
  local kennung="$1" feld="$2" datei="$RELEASES/$1/RELEASE.json"
  [ -f "$datei" ] || return 0
  "$PA_NODE" -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const w=r[process.argv[2]]; if (w!==undefined&&w!==null) process.stdout.write(String(w));' "$datei" "$feld"
}

# Smoke-Test gegen das laufende Release. Rückgabe 0 = bestanden.
smoke() {
  local kennung="$1"
  if [ "$TROCKEN" = "yes" ]; then
    printf '[trocken] Smoke-Test %s gegen %s\n' "$kennung" "$PA_SMOKE_URL" >&2
    return 0
  fi
  if [ -n "$PA_SMOKE_BEFEHL" ]; then
    "$PA_SMOKE_BEFEHL" "$kennung"
    return $?
  fi
  local version sha argumente=()
  version=$(release_feld "$kennung" version)
  sha=$(release_feld "$kennung" gitSha)
  argumente=(--url "$PA_SMOKE_URL" --frist "$PA_SMOKE_FRIST")
  [ -n "$version" ] && argumente+=(--version "$version")
  [ -n "$sha" ] && [ "$sha" != "unbekannt" ] && argumente+=(--gitsha "$sha")
  [ "$PA_SMOKE_OHNE_LOBBY" = "yes" ] && argumente+=(--ohne-lobby)
  "$PA_NODE" "$RELEASES/$kennung/scripts/release/smoke.mjs" "${argumente[@]}"
}

# Eine Zeile ins Release-Protokoll: Aktion, von, nach, Ergebnis.
notiere() {
  local zeile
  zeile=$(printf '%s\t%s\t%s\t%s\t%s' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:--}" "${3:--}" "$4")
  if [ "$TROCKEN" = "yes" ]; then
    printf '[trocken] releases.log << %s\n' "$zeile" >&2
    return 0
  fi
  printf '%s\n' "$zeile" >> "$LOGDATEI"
}

# Vorgänger eines Releases laut Protokoll: das `von` der letzten erfolgreichen
# Einführung dieses Releases (deploy … ok). Rückfall: das jüngste andere Release.
vorgaenger() {
  local kennung="$1" treffer=""
  if [ -f "$LOGDATEI" ]; then
    treffer=$(awk -F'\t' -v k="$kennung" '$2=="deploy" && $4==k && $5=="ok" && $3!="-" {v=$3} END {print v}' "$LOGDATEI")
  fi
  if [ -n "$treffer" ] && [ -d "$RELEASES/$treffer" ]; then
    printf '%s\n' "$treffer"
    return 0
  fi
  # Jüngstes anderes Release nach Änderungszeit (deploy.sh setzt sie beim Entpacken).
  local d
  while IFS= read -r d; do
    [ "$d" = "$kennung" ] && continue
    printf '%s\n' "$d"
    return 0
  done < <(ls -1t "$RELEASES" 2>/dev/null | grep -v '^\.')
}

# Alte Releases löschen: die neuesten PA_BEHALTEN bleiben, `current` und das
# übergebene „geschützte" Release nie.
raeume_auf() {
  local schutz="$1" aktuell n=0 d
  aktuell=$(aktuelle_kennung)
  case "$PA_BEHALTEN" in ''|*[!0-9]*) protokoll "PA_BEHALTEN=$PA_BEHALTEN ist keine Zahl — räume nicht auf"; return 0 ;; esac
  [ "$PA_BEHALTEN" -lt 2 ] && PA_BEHALTEN=2
  while IFS= read -r d; do
    n=$((n + 1))
    [ "$n" -le "$PA_BEHALTEN" ] && continue
    [ "$d" = "$aktuell" ] && continue
    [ "$d" = "$schutz" ] && continue
    protokoll "räume auf: releases/$d"
    tu rm -rf -- "${RELEASES:?}/$d"
  done < <(ls -1t "$RELEASES" 2>/dev/null | grep -v '^\.')
}
