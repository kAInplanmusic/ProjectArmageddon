#!/usr/bin/env bash
# =============================================================================
#  rollback.sh — zurück auf das vorige Release (REL-1, DEP-1)
# =============================================================================
#  Aufruf (auf dem KNOTEN, als root):
#
#    rollback.sh [--auf <kennung>] [--mit-zustand <sicherung>|neueste] [--trocken] [--liste]
#
#  Ziel ohne --auf: der Vorgänger des laufenden Releases laut releases.log (das
#  Release, von dem aus das laufende eingeführt wurde); fehlt der Eintrag, das
#  jüngste andere Release unter $PA_BASIS/releases.
#
#  Ablauf: `current` atomar umhängen → Dienst neu starten → Smoke-Test.
#  Mit --mit-zustand wird VORHER der Dienst gestoppt und der Spielstand aus der
#  Sicherung zurückgespielt (scripts/betrieb/wiederherstellen.sh). Das ist nur
#  nötig, wenn das neue Release den Zustand in einer Form geschrieben hat, die
#  das alte nicht lesen kann (Persistenz-Version in src/server/persistence.js).
#
#  Rückgabewerte: 0 zurückgerollt und Smoke-Test grün · 1 Smoke-Test rot ·
#                 2 Vorbedingung verletzt (nichts geändert)
#
#  `--liste` zeigt Releases und Protokoll, ändert nichts.
# =============================================================================
set -euo pipefail

PROGRAMM="rollback.sh"
SKRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ZIEL_KENNUNG=""
ZUSTAND=""
LISTE=no

while [ $# -gt 0 ]; do
  case "$1" in
    --auf) ZIEL_KENNUNG="${2:-}"; shift ;;
    --mit-zustand) ZUSTAND="${2:-}"; shift ;;
    --trocken|--dry-run) TROCKEN=yes ;;
    --liste) LISTE=yes ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf '%s: unbekannte Option %s\n' "$PROGRAMM" "$1" >&2; exit 2 ;;
  esac
  shift
done

# shellcheck source=scripts/release/gemeinsam.sh
source "$SKRIPT_DIR/gemeinsam.sh"

abbruch() { protokoll "ABBRUCH: $*"; exit 2; }

AKTUELL=$(aktuelle_kennung)

if [ "$LISTE" = "yes" ]; then
  printf 'Laufend: %s\n\nReleases (neueste zuerst):\n' "${AKTUELL:-keins}"
  ls -1t "$RELEASES" 2>/dev/null | grep -v '^\.' | sed 's/^/  /' || true
  printf '\nProtokoll (letzte 15):\n'
  tail -n 15 "$LOGDATEI" 2>/dev/null | sed 's/^/  /' || true
  exit 0
fi

[ -n "$AKTUELL" ] || abbruch "kein laufendes Release ($CURRENT fehlt)"
[ -n "$ZIEL_KENNUNG" ] || ZIEL_KENNUNG=$(vorgaenger "$AKTUELL")
[ -n "$ZIEL_KENNUNG" ] || abbruch "kein anderes Release vorhanden, auf das zurückgerollt werden kann"
pruefe_kennung "$ZIEL_KENNUNG" || abbruch "ungültige Kennung „$ZIEL_KENNUNG“"
[ "$ZIEL_KENNUNG" != "$AKTUELL" ] || abbruch "$ZIEL_KENNUNG läuft bereits"
[ -d "$RELEASES/$ZIEL_KENNUNG" ] || abbruch "$RELEASES/$ZIEL_KENNUNG fehlt (rollback.sh --liste)"

protokoll "Rollback: $AKTUELL → $ZIEL_KENNUNG"

if [ -n "$ZUSTAND" ]; then
  protokoll "Spielstand wird zurückgespielt ($ZUSTAND) — dafür wird der Dienst gestoppt."
  tu "$PA_SYSTEMCTL" stop "$PA_SYSTEMD_UNIT"
  WIEDER_ARGS=(--ja)
  [ "$ZUSTAND" = "neueste" ] && WIEDER_ARGS+=(--neueste) || WIEDER_ARGS+=("$ZUSTAND")
  [ "$TROCKEN" = "yes" ] && WIEDER_ARGS+=(--trocken)
  "$SKRIPT_DIR/../betrieb/wiederherstellen.sh" "${WIEDER_ARGS[@]}" || abbruch "Wiederherstellung des Spielstands fehlgeschlagen — nichts umgeschaltet; Dienst ist GESTOPPT: systemctl start $PA_SYSTEMD_UNIT"
fi

schalte_um "$ZIEL_KENNUNG"
neustart || true
if smoke "$ZIEL_KENNUNG"; then
  notiere rollback "$AKTUELL" "$ZIEL_KENNUNG" ok
  protokoll "FERTIG: $ZIEL_KENNUNG läuft. Vorwärts wieder: rollback.sh --auf $AKTUELL"
  exit 0
fi
notiere rollback "$AKTUELL" "$ZIEL_KENNUNG" smoke-rot
protokoll "Smoke-Test ROT nach dem Rollback. Zurück: rollback.sh --auf $AKTUELL; Journal: journalctl -u $PA_SYSTEMD_UNIT -n 200"
exit 1
