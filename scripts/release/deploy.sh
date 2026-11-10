#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — ein Release-Paket auf dem Knoten einführen (REL-1, DEP-1)
# =============================================================================
#  Aufruf (auf dem KNOTEN, als root; das Paket baut scripts/release/paket.mjs):
#
#    deploy.sh <projectarmageddon-<kennung>.tar.gz> [--trocken] [--erzwingen] [--ohne-sicherung]
#
#  Ablauf (docs/deploy-plan.md, Abschnitt 5):
#    1. Prüfsumme gegen <archiv>.sha256 (Pflicht), Archivinhalt auf Pfadausbruch prüfen
#    2. entpacken nach $PA_BASIS/releases/<kennung> (erst daneben, dann umbenennen)
#    3. `npm ci --omit=dev --ignore-scripts` im Release (Laufzeitabhängigkeit `ws`)
#    4. Zustand sichern (scripts/betrieb/sichern.sh), außer --ohne-sicherung
#    5. `current` atomar umhängen, Dienst neu starten
#    6. Smoke-Test (scripts/release/smoke.mjs: /healthz + Version, /, /ws, Lobby)
#    7. Smoke-Test rot → AUTOMATISCHER RÜCKFALL auf das vorige Release
#       (umhängen, neu starten, Smoke-Test), Exit 1
#    8. alte Releases aufräumen (die neuesten PA_BEHALTEN bleiben)
#
#  Rückgabewerte: 0 eingeführt · 1 Smoke-Test rot, Rückfall bestanden ·
#                 2 Vorbedingung verletzt (nichts geändert) · 3 Rückfall ebenfalls rot
#
#  Umgebung (Vorgaben in gemeinsam.sh): PA_BASIS, PA_SYSTEMD_UNIT, PA_SMOKE_URL,
#  PA_SMOKE_FRIST, PA_SMOKE_OHNE_LOBBY, PA_BEHALTEN, DRY_RUN=1 (= --trocken).
#
#  Dieses Skript MIETET und STARTET keinen Knoten (AGENTS.md §5): Es läuft auf
#  einem Knoten, den der Auftraggeber bereitgestellt hat.
# =============================================================================
set -euo pipefail

PROGRAMM="deploy.sh"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ARCHIV=""
ERZWINGEN=no
OHNE_SICHERUNG=no

while [ $# -gt 0 ]; do
  case "$1" in
    --trocken|--dry-run) TROCKEN=yes ;;
    --erzwingen) ERZWINGEN=yes ;;
    --ohne-sicherung) OHNE_SICHERUNG=yes ;;
    -h|--help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) printf '%s: unbekannte Option %s\n' "$PROGRAMM" "$1" >&2; exit 2 ;;
    *) ARCHIV="$1" ;;
  esac
  shift
done

# shellcheck source=scripts/release/gemeinsam.sh
source "$SKRIPT_DIR/gemeinsam.sh"

abbruch() { protokoll "ABBRUCH: $*"; exit 2; }

[ -n "$ARCHIV" ] || abbruch "kein Archiv angegeben (deploy.sh <archiv.tar.gz>)"
[ -f "$ARCHIV" ] || abbruch "Archiv $ARCHIV nicht gefunden"
[ -f "$ARCHIV.sha256" ] || abbruch "Prüfsumme $ARCHIV.sha256 fehlt — ohne Prüfsumme wird nichts eingeführt"

# --- 1. Prüfsumme und Inhalt --------------------------------------------------
( cd "$(dirname "$ARCHIV")" && sha256sum --check --status "$(basename "$ARCHIV").sha256" ) \
  || abbruch "Prüfsumme stimmt nicht ($ARCHIV.sha256)"
protokoll "Prüfsumme ok: $(cut -d' ' -f1 "$ARCHIV.sha256")"

INHALT=$(tar -tzf "$ARCHIV") || abbruch "Archiv nicht lesbar"
OBERSTER=$(head -n1 <<<"$INHALT" | cut -d/ -f1)   # Here-String statt printf|head: bei langer Liste SIGPIPE (rc 141) unter pipefail
[[ "$OBERSTER" == projectarmageddon-* ]] || abbruch "Archiv beginnt nicht mit projectarmageddon-<kennung>/ ($OBERSTER)"
KENNUNG="${OBERSTER#projectarmageddon-}"
pruefe_kennung "$KENNUNG" || abbruch "ungültige Kennung „$KENNUNG“"
if printf '%s\n' "$INHALT" | grep -qvE "^$OBERSTER(/|$)"; then abbruch "Archiv enthält Einträge außerhalb von $OBERSTER/"; fi
if printf '%s\n' "$INHALT" | grep -qE '(^/|(^|/)\.\.(/|$))'; then abbruch "Archiv enthält absolute Pfade oder ..-Einträge"; fi

VORIGE=$(aktuelle_kennung)
ZIEL="$RELEASES/$KENNUNG"
protokoll "Release $KENNUNG (läuft gerade: ${VORIGE:-keins}) → $ZIEL"
[ "$KENNUNG" != "$VORIGE" ] || abbruch "$KENNUNG läuft bereits — für einen Neustart: systemctl restart $PA_SYSTEMD_UNIT"
if [ -e "$ZIEL" ] && [ "$ERZWINGEN" != "yes" ]; then
  abbruch "$ZIEL gibt es schon (früher eingeführt). Zurück dorthin: rollback.sh --auf $KENNUNG; neu entpacken: --erzwingen"
fi

# --- 2. Entpacken -------------------------------------------------------------
tu mkdir -p "$RELEASES"
NEU="$RELEASES/.neu-$KENNUNG"
tu rm -rf -- "$NEU"
tu mkdir -p "$NEU"
tu tar -xzf "$ARCHIV" -C "$NEU" --no-same-owner --strip-components=1
if [ "$TROCKEN" != "yes" ]; then
  for pflicht in RELEASE.json dist/index.html dist/version.json scripts/server.mjs scripts/betrieb/server-start.sh scripts/release/smoke.mjs package-lock.json; do
    [ -f "$NEU/$pflicht" ] || { rm -rf -- "$NEU"; abbruch "Paket unvollständig: $pflicht fehlt"; }
  done
  GEMELDET=$("$PA_NODE" -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).kennung))' "$NEU/RELEASE.json")
  [ "$GEMELDET" = "$KENNUNG" ] || { rm -rf -- "$NEU"; abbruch "RELEASE.json nennt $GEMELDET, Archiv $KENNUNG"; }
fi

# --- 3. Abhängigkeiten --------------------------------------------------------
protokoll "Installiere Laufzeitabhängigkeiten (npm ci --omit=dev)"
if [ "$TROCKEN" = "yes" ]; then
  tu "$PA_NPM" ci --omit=dev --ignore-scripts --no-audit --no-fund
else
  ( cd "$NEU" && "$PA_NPM" ci --omit=dev --ignore-scripts --no-audit --no-fund ) || { rm -rf -- "$NEU"; abbruch "npm ci fehlgeschlagen"; }
fi
tu rm -rf -- "$ZIEL"
tu mv -T "$NEU" "$ZIEL"
tu touch "$ZIEL"   # Änderungszeit = Einführungszeit (Reihenfolge fürs Aufräumen)

# --- 4. Zustand sichern -------------------------------------------------------
if [ "$OHNE_SICHERUNG" != "yes" ]; then
  SICHERN_ARGS=(--grund "vor deploy $KENNUNG")
  [ "$TROCKEN" = "yes" ] && SICHERN_ARGS+=(--trocken)
  "$SKRIPT_DIR/../betrieb/sichern.sh" "${SICHERN_ARGS[@]}" || abbruch "Sicherung des Zustands fehlgeschlagen (Release liegt in $ZIEL, nichts umgeschaltet)"
fi

# --- 5./6. Umschalten, Neustart, Smoke-Test ------------------------------------
schalte_um "$KENNUNG"
# Bequeme Wege für die Betriebsdokumente ($PA_BASIS/scripts/betrieb/… in docs/betrieb*.md):
# einmalig als Symlink auf current/…; ein echtes Verzeichnis (alte git-Ablage) bleibt unberührt.
for weg in scripts docs deploy; do
  if [ ! -e "$PA_BASIS/$weg" ] && [ ! -L "$PA_BASIS/$weg" ]; then tu ln -s "current/$weg" "$PA_BASIS/$weg"; fi
done
neustart || true
if smoke "$KENNUNG"; then
  notiere deploy "$VORIGE" "$KENNUNG" ok
  raeume_auf "$VORIGE"
  protokoll "FERTIG: $KENNUNG läuft."
  exit 0
fi

# --- 7. Rückfall ---------------------------------------------------------------
notiere deploy "$VORIGE" "$KENNUNG" smoke-rot
if [ -z "$VORIGE" ]; then
  protokoll "Smoke-Test ROT und kein voriges Release — der Dienst bleibt auf $KENNUNG. Journal: journalctl -u $PA_SYSTEMD_UNIT -n 100"
  exit 3
fi
protokoll "Smoke-Test ROT — automatischer Rückfall auf $VORIGE"
schalte_um "$VORIGE"
neustart || true
if smoke "$VORIGE"; then
  notiere rueckfall "$KENNUNG" "$VORIGE" ok
  protokoll "Rückfall bestanden: $VORIGE läuft wieder. $KENNUNG bleibt zur Analyse in $ZIEL."
  exit 1
fi
notiere rueckfall "$KENNUNG" "$VORIGE" smoke-rot
protokoll "Rückfall ebenfalls ROT. Handarbeit: journalctl -u $PA_SYSTEMD_UNIT -n 200; Zustand: wiederherstellen.sh"
exit 3
