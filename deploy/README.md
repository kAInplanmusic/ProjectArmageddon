# deploy/ — Betriebsvorbereitung, kein Betrieb

Hier liegt, was für eine **gemietete** Instanz vorbereitet ist. Es ist
**nicht installiert** und läuft **nirgends**: Dieses Verzeichnis ist eine
Dateiablage, kein Dienst (AGENTS.md §5 — „Eine Datei im Repo ist kein
laufender Dienst").

| Datei | Was es ist |
|---|---|
| `systemd/projectarmageddon.service` | Vorlage: startet `scripts/betrieb/server-start.sh` als systemd-Dienst |
| `systemd/projectarmageddon-idle.service` | Vorlage: ein Durchlauf der Idle-Bremse (systemd-Timer ruft sie) |
| `systemd/projectarmageddon-idle.timer` | Vorlage: ruft die Bremse jede Minute — auch ohne offene SSH-Sitzung |
| `betrieb.env.example` | Vorlage der Betriebsparameter; Werte, die eine Entscheidung sind, stehen als `LÜCKE` |
| `Caddyfile.beispiel` | Vorlage: Caddy mit TLS vor dem Server, `/ws` durchgereicht, Sicherheits-Header, Kompression, `/healthz` außen gesperrt |
| `compose.yaml` | Option Container (DEP-2): baut `../Dockerfile`, Port nur auf `127.0.0.1`, Spielstand im Volume |

**Der Weg vom Repo zum laufenden Dienst (Paket, Upload, Deploy, Proxy, Firewall,
Smoke-Test, Rollback, Sicherung, Kosten, Go/No-Go): `docs/deploy-plan.md`.**

Die Skripte dazu liegen in `scripts/betrieb/`:

| Datei | Was es tut |
|---|---|
| `scripts/betrieb/server-start.sh` | startet `npm run server` **und** die Idle-Bremse; `--print-config` zeigt alle Abschaltparameter, ohne zu starten |
| `scripts/betrieb/idle-watch.sh` | die Bremse selbst: Leerlauf, Serverlaufzeit, Maschinenlaufzeit |
| `scripts/betrieb/snapshot-einrichten.sh` | einmalige Einrichtung der Sicherung auf dem Knoten (prüft das Hetzner-Token, schreibt `betrieb.env`) |
| `scripts/betrieb/abbild-lokal.sh` | **auf deinem Rechner:** Server herunterfahren, Hetzner-Abbild, alte löschen, optional Server löschen — das Token verlässt deinen Rechner nie |
| `scripts/betrieb/server-aus-abbild.sh` | **auf deinem Rechner:** neuen Server aus dem neuesten Abbild erstellen |
| `scripts/betrieb/token-setzen.sh` | legt das Hetzner-Token nur im Arbeitsspeicher des Servers ab (nie auf der Platte) |
| `scripts/betrieb/snapshot.sh` | Sicherung bei jedem Stopp (Archiv, optional Hetzner-Abbild); behält die neuesten 3 — `docs/betrieb.md` Abschnitt 8 |
| `scripts/betrieb/sichern.sh` / `wiederherstellen.sh` | nur der Spielstand (`PA_STATE_PATH`): atomar sichern mit Aufbewahrung (Vorgabe 10) und zurückspielen — `docs/deploy-plan.md` Abschnitt 9 |

Release und Rückweg in `scripts/release/` (`docs/deploy-plan.md` Abschnitte 3–8):

| Datei | Was es tut |
|---|---|
| `paket.mjs` | baut `release/projectarmageddon-<version>-<git7>.tar.gz` + `.sha256` (reproduzierbar, Geheimnis-Sperre) |
| `deploy.sh` | auf dem Knoten: Prüfsumme, `releases/<kennung>`, `npm ci --omit=dev`, Sicherung, `current` umhängen, Neustart, Smoke-Test, automatischer Rückfall |
| `rollback.sh` | zurück auf den Vorgänger (oder `--auf <kennung>`, optional `--mit-zustand`) |
| `smoke.mjs` | `/healthz` + Version, `/`, WebSocket-Handshake, eine Lobby; `--aussen` hinter dem Proxy |
| `bauinfo.mjs` | Version, Git-Stand, Bauzeit — Quelle für Client-Fuß, `dist/version.json` und `/healthz` |

## Ohne gemieteten Knoten prüfbar

```bash
bash -n scripts/betrieb/server-start.sh       # Syntax
bash -n scripts/betrieb/idle-watch.sh
scripts/betrieb/server-start.sh --print-config
scripts/betrieb/idle-watch.sh --print-config
scripts/betrieb/snapshot.sh --print-config
bash -n scripts/betrieb/snapshot.sh
node scripts/release/paket.mjs --trocken          # was ins Release-Paket käme
scripts/release/deploy.sh --trocken <paket.tar.gz> # zeigt jeden Schritt, ändert nichts
node --test tests/release-skripte.test.js tests/release-paket.test.js tests/container-dateien.test.js tests/systemd-vorlagen.test.js
```

## Bevor irgendetwas gemietet wird

AGENTS.md §5 verlangt drei Dinge, **vor** der Miete:

1. Eintrag in `docs/betrieb-INSTANZ.md` (Name, Zweck, Preis pro Stunde, Besitzer)
2. eine Abschaltung, die ohne Zutun greift (die Idle-Bremse hier)
3. den **Nachweis**, dass sie läuft — die *Ausgabe* von `systemctl list-timers`
   auf dem Knoten, eingetragen in `docs/betrieb-INSTANZ.md`

Die Belegbefehle stehen in `docs/betrieb-INSTANZ.md`, Abschnitt „Nachweis".
