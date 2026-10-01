# Abnahme Deploy/Betrieb — ProjectArmageddon

**Datum:** 2026-10-01 · **Repository:** `/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon`
**Branch:** `main` · **HEAD:** `0cb14ae` · **Prüfer:** Subagent (Abnahme Deploy/Betrieb)
**Umfang:** Start-, Beende-, Startfehler- und Artefakt-Nachweis am echten Prozess; Konsolidierung der Betriebsdokumente zu einer Empfehlung.

**Regel dieses Berichts:** Jede Aussage ist mit einer echten Ausgabe belegt. Es gibt keine erfundenen Erfolge. Wo etwas nicht geprüft werden konnte, steht das ausdrücklich.

**Legende:** `[GEMESSEN]` = mit echter Ausgabe belegt · `[ENTSCHIEDEN]` = Empfehlung des Berichts · `[OFFEN]` = nur der Betreiber kann entscheiden/messen.

**Randbedingungen der Prüfung:** Eine E2E-Suite lief parallel und belegte Port 5173. Für die Proben wurden ausschließlich **3399**, **3401**, **3402** und vom Betriebssystem vergebene freie Ports (`listen(0)`) benutzt — **niemals 5173**. Kein Playwright wurde gestartet. Jeder gestartete Prozess wurde beendet; nach jeder Phase war die Zahl verbliebener `scripts/server.mjs`-Prozesse **0**.

Außer dieser neuen Datei wurde **keine bestehende Datei geändert**. `dist/` wurde durch den ausdrücklich geforderten Doppel-Build (Abschnitt 4) zweimal neu erzeugt — `dist/` ist ein Build-Ausgabeverzeichnis und laut `.gitignore` (Zeile 4) nicht getrackt.

---

## 1. Produktiver Start — nachgewiesen `[GEMESSEN]`

### 1.1 Trockenlauf des Startskripts

`bash -n` auf beiden Skripten ist fehlerfrei:

```
=== bash -n server-start ===   OK rc=0
=== bash -n idle-watch ===     OK rc=0
```

`scripts/betrieb/server-start.sh --print-config` (Exit-Code **0**), Auszug der echten Ausgabe:

```
server-start.sh — Startparameter (Trockenlauf: es wird NICHTS gestartet)
  Projektwurzel        : /home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon
  Gestartet wird       : npm run server   (Arbeitsverzeichnis …/ProjectArmageddon)
  Bindung              : http://127.0.0.1:3000
  Umgebung             : LOG_LEVEL=info LOG_FORMAT=json
                         PA_STATE_PATH=…/ProjectArmageddon/.pa-state/lobbies.json
  Build vor dem Start  : nur wenn dist/ fehlt
  Öffentlich erlaubt   : no (bei "no" bricht das Skript bei HOST != 127.0.0.1 ab)
  Bremse               : …/scripts/betrieb/idle-watch.sh (Kindprozess, Takt 30s)
  Signaldatei          : …/projectarmageddon-idle/bremse

idle-watch.sh — Abschaltparameter (Trockenlauf: es wird NICHTS gestartet und NICHTS gestoppt)
    Leerlauf                   : 15 min
    Anlaufschonfrist           : 5 min
    Serverlaufzeit             : 180 min
    Maschinenlaufzeit          : AUS (PA_MAX_MACHINE_MINUTES ist leer)
    Marker                     : /etc/projectarmageddon/ist-gemietet  → FEHLT — die Bremse ist auf diesem Knoten NICHT SCHARF
```

Der Trockenlauf startet nichts (so dokumentiert) und nennt die Sicherheitsvorgabe `PA_ERLAUBE_OEFFENTLICH=no`.

### 1.2 Echter Start — `npm run server` auf Port 3399

Kommando (echter Lauf):

```bash
PORT=3399 HOST=127.0.0.1 PA_STATE_PATH=/…/pa-abnahme/state-a/lobbies.json npm run server
```

Ausgabe (echt, gekürzt um die npm-Kopfzeilen):

```
{"ts":"2026-10-01T10:50:25.731Z","level":"info","event":"server_listening",
 "msg":"Server nimmt Verbindungen an","port":3399,"host":"127.0.0.1",
 "protocol":8,"persistence":true}
ProjectArmageddon-Server läuft auf http://127.0.0.1:3399
  Wiederhergestellt: Zustand geladen
  Persistenz: /…/state-a/lobbies.json
  Beenden mit Strg+C.
```

**Startzeile belegt** — `ProjectArmageddon-Server läuft auf http://127.0.0.1:3399`. Deaktivierte node-Prozesse: `npm=134037 node=134057`.

### 1.3 HTTP- und WebSocket-Antworten (derselbe Lauf)

| Prüfung | Kommando | Echte Antwort | Ergebnis |
|---|---|---|---|
| Wurzel `/` | `curl -sS -o body.html -w '%{http_code} %{content_type} %{size_download}' http://127.0.0.1:3399/` | `HTTP 200 \| content-type=text/html; charset=utf-8 \| bytes=33116` | ✅ 200 |
| Health | `curl -sS http://127.0.0.1:3399/healthz` | `{"status":"ok","lobbies":0,"sessions":0,"protocol":8,"uptimeMs":937,…,"healthy":true,"orphanedSessions":0}` | ✅ 200 |
| `/ws` | `new WebSocket("ws://127.0.0.1:3399/ws")` | `WS: open — Handshake /ws OK (readyState=1)` | ✅ offen |

Der Body-Anfang von `/` ist die echte `index.html` (`<!DOCTYPE html> … <meta charset="UTF-8" />`). Der Server liefert also **statische Dateien aus `dist/` und den WebSocket-Pfad `/ws` aus einem Prozess** — wie in `docs/betrieb.md` Abschnitt 1 beschrieben.

> **Befund 1 (gemessen):** Der produktive Start ist für sich genommen nachgewiesen — Startzeile, HTTP 200 auf `/`, `/healthz` 200, `/ws`-Handshake. Kein Punkt dieses Nachweises beruht auf einer Annahme.

---

## 2. Geordnetes Beenden — 3× wiederholt `[GEMESSEN]`

Ablauf je Lauf: `npm run server` starten, auf die Startzeile warten, **SIGTERM an den echten node-Prozess** (nicht an npm) senden, auf das Prozessende warten, dann **auf die Zustandsdatei WARTEN** (sie entsteht im Signal-Handler, nicht davor).

```
Lauf | Exit-Code              | Zustandsdatei | Wartezeit(ms) | Startzeile
1    | rc=0 (node_haengt=0)   | VORHANDEN     | 4             | 1
2    | rc=0 (node_haengt=0)   | VORHANDEN     | 3             | 1
3    | rc=0 (node_haengt=0)   | VORHANDEN     | 3             | 1
```

Inhalt der Datei in allen drei Läufen (gültige, leere Lobby-Liste):

```json
{"version":1,"savedAt":1790851838346,"lobbies":[]}
```

Log-Ende jedes Laufs — der Handler greift sichtbar:

```
SIGTERM empfangen — speichere Zustand und schließe Verbindungen …
Beendet.
```

**Ergebnis: 3 von 3 Läufen Exit-Code 0, Zustandsdatei in 3–4 ms nach dem Signal vorhanden, kein Prozess hing.** Der in `tests/server-start.test.js` beschriebene „nur manchmal"-Fehler (Zustandsverlust bei frühem Signal) trat in keiner der drei Proben auf; die Handler-Registrierung vor dem Start (`scripts/server.mjs`) wirkt.

> **Befund 2 (gemessen):** Geordnetes Beenden ist über drei Wiederholungen stabil — Exit 0 **und** geschriebene Zustandsdatei.

---

## 3. Startfehler im Klartext — belegter Port `[GEMESSEN]`

Zwei eigene Server auf demselben Port **3402**: A belegt den Port, B versucht denselben Port.

```
--- Server B (gleicher Port) via npm run server ---
B Exit-Code (npm): 1
{"ts":"…","level":"error","event":"websocket_error","msg":"WebSocket-Server meldet einen Fehler",
 "code":"EADDRINUSE","message":"listen EADDRINUSE: address already in use 127.0.0.1:3402"}
Port 3402 ist bereits belegt.
  Entweder den belegenden Prozess beenden oder einen anderen Port wählen:
  PORT=8080 npm run server
```

Auswertung der B-Ausgabe:

| Frage | Zählwert |
|---|---|
| enthält `bereits belegt` | 1 |
| enthält `Unhandled 'error' event` (roher Stapelauszug) | **0** |
| enthält Ausweg `PORT=8080` | 1 |

Zusätzlich derselbe Fehler direkt über `node scripts/server.mjs` (exakter Exit-Code, ohne npm):

```
B (node direkt) Exit-Code: 1
… {"event":"websocket_error","code":"EADDRINUSE",…}
Port 3402 ist bereits belegt.
  Entweder den belegenden Prozess beenden oder einen anderen Port wählen:
  PORT=8080 npm run server
```

> **Befund 3 (gemessen):** Ein belegter Port erzeugt eine **lesbare deutsche Meldung mit Ausweg** und **Exit-Code 1** — sowohl über `npm run server` als auch direkt über `node`. Die Zeichenkette `EADDRINUSE` erscheint nur in einer strukturierten Logzeile (`websocket_error`), **nicht** als Stacktrace. Der in `tests/server-start.test.js` beschriebene frühere rohe `Unhandled 'error' event` kehrt nicht zurück.

---

## 4. Build-Artefakt und Rollback

### 4.1 Reproduzierbarkeit von `dist/` `[GEMESSEN]`

`npm run build` **zweimal** hintereinander ausgeführt (Exit-Code beide Male **0**). Vergleich über Manifest aus Pfad + Größe + SHA-256 je Datei.

| | Build 1 | Build 2 |
|---|---|---|
| Dateien in `dist/` | 165 | 165 |
| `index.html` SHA-256 | `542475b9f5aa…4345392` | `542475b9f5aa…4345392` (identisch) |
| `index.html` Größe | 33116 B | 33116 B |
| `dist/assets/index-K3qc0gqe.js` | 505,61 kB (gzip 138,38 kB) | 505,61 kB (gzip 138,38 kB) |
| Gesamtgröße `dist/` | 22 MB | 22 MB |

**Vergleich der Manifeste:**

```
Zeilen Manifest1: 165  Zeilen Manifest2: 165
UNTERSCHIEDE:
123c123
< a1406ce341e947c3cb37e281ae91bff0673ede29ccfbfaebe9103bcafd55ed7c  2048349  assets/index-K3qc0gqe.js.map
---
> 6d845e43c77139409f7d488b8c92686e08de320bbbc03083498291d172a13313  2048349  assets/index-K3qc0gqe.js.map
```

> **Befund 4a (gemessen):** **Alle 165 Dateinamen und -größen sind in beiden Builds identisch.** 164 von 165 Dateien sind **byte-identisch** (gleicher SHA-256). Einzige Ausnahme: **`assets/index-K3qc0gqe.js.map`** — dieselbe Größe (2 048 349 B), aber **unterschiedlicher Inhalt** (die Sourcemap ist nicht byte-reproduzierbar). Der ausgelieferte JS-Hash ist stabil: `index-K3qc0gqe.js` hat in beiden Läufen denselben Namen (die Referenz im `index.html` bleibt also gültig).

Zusätzlich warnt der Build (kein Fehler):

```
(!) Some chunks are larger than 500 kB after minification. … index-K3qc0gqe.js 505.61 kB
```

### 4.2 Rollback — was fehlt `[GEMESSEN] ⚪ [OFFEN]`

Eine **Deploy-/Rollback-Strategie ist nicht dokumentiert.** Die Suche über das Repository findet „Rollback" nur als **Code-Eigenschaft** (Client-Prädiktion mit Server-Rollback: `src/client/shotPrediction.js`, `src/server/lagCompensation.js`), nicht als Betriebsverfahren. Das Repo hat **keine Release-Tags** (`git tag -l` → nur `archive/copilot-explore-and-extract-files`). Das eigene `docs/release-readiness-audit-2026-10-01.md` führt „Deployment / Rollback" als **⏳ offen**:

```
| Deployment / Rollback | ⏳ | docs/betrieb.md, docs/betrieb-INSTANZ.md, deploy/ vorhanden; Nachweis delegiert |
```

**Was VOR einem echten Deploy fehlt (konkret):**

1. **Versionskennung des Artefakts** — es gibt keinen Release-Tag/Commit-Marker, der zu einem gebauten `dist/` gehört. Ohne ihn ist „zurückrollen" nicht adressierbar.
2. **Aufbewahrung des letzten guten Builds** — beim Deploy überschreibt `npm run build` (mit `emptyOutDir: true`) `dist/` vollständig. Es gibt kein `dist.bak`/Release-Verzeichnis.
3. **Rollback-Schritte** — kein dokumentiertes Verfahren „vorheriges `dist/` zurückspielen + Dienst neu starten + Health prüfen".
4. **Zustands-Rollback** — `PA_STATE_PATH` (Lobby-Daten) hat kein Backup-/Wiederherstellungsverfahren; `close()` schreibt die Datei, die Strategie bei einem defekten Zustand fehlt.
5. **Container** — es gibt **kein `Dockerfile` und kein Compose-/Container-Manifest** im Repo. Der in `docs/betrieb.md` nur als „lokale Spielweise" und in `docs/skalierung.md` als Hetzner-CPU beschriebene Betrieb ist **nicht** container-vorbereitet; ein Container-Rollback (Image-Tag) ist damit ebenfalls nicht vorhanden.

> **Befund 4b:** Reproduzierbarkeit ist **weitgehend** gegeben (siehe 4a). Eine **dokumentierte Rollback-Strategie gibt es nicht** — die fünf oben genannten Punkte fehlen vollständig.

---

## 5. Konsolidierte Empfehlung (eine Reihenfolge, keine Auswahlliste)

Die drei Betriebsdokumente (`docs/betrieb.md`, `docs/skalierung.md`, `docs/betrieb-INSTANZ.md`) kommen zusammen zu **einem** Weg. Diese Empfehlung fasst sie zusammen und ordnet sie.

### 5.1 Wo soll der Server laufen? `[ENTSCHIEDEN]`

**Auf einer gemieteten CPU-Instanz (Hetzner), für Einzelentwicklung weiter lokal. Kein GPU-Anbieter, kein Container als erster Schritt.**

Begründung mit den **gemessenen** Zahlen aus `docs/skalierung.md`:

- Rechenlast je Match (gemessen, `npm run measure:load`): 2 Spieler **2,40 ms/Tick**, 4 Spieler **1,11 ms**, 6 Spieler **0,88 ms**, 8 Spieler **0,79 ms**. Bei 4 Spielern sind das **6,7 % eines Kerns** — die Simulation ist der billigste Teil des Systems.
- Hochrechnung (offengelegtes Modell): ein 8-Spieler-Match auf 4K kostet **6,15 ms/Tick = 36,9 % eines Kerns**. Ein **CX32 (4 vCPU, 8 GB, ~7 €/Monat)** trägt damit rechnerisch **~68 gleichzeitige 8-Spieler-Matches**.
- Netz ist kein Engpass: **38 KB/s** je 8-Spieler-Match (gemessen, `npm run measure:network`); 68 Matches × 38 KB/s = **2,6 MB/s** — ein Zehntel eines 100-Mbit-Anschlusses.
- **Keine GPU:** Die Simulation ist CPU-Arbeit; Kulissen liegen als fertige Bilder vor (`docs/skalierung.md` §4, `docs/ki-im-betrieb.md`). Eine A100 (~1,50 €/h) wäre für den Betrieb um Größenordnungen teurer und unnötig.
- **Kosten/Verfügbarkeit:** Hetzner rechnet stundengenau, monatlich gedeckelt — ein **CX22 (~4 €/Monat)** ist der Einstieg für eine Handvoll Matches, **CX32 (~7 €/Monat)** der eigentliche Betrieb. „Instanz bei Bedarf starten" (RunPod, sekundengenau) wäre für ein Spiel die **teurere und langsamere** Variante: Ein Spieler, der 40 s auf eine Instanz wartet, spielt nicht.
- **Container:** heute **nicht** vorbereitet (kein Dockerfile, kein Compose). Er ist kein notwendiger erster Schritt; systemd ist im Repo bereits vollständig vorbereitet (`deploy/systemd/`).

**Empfehlung in einem Satz:** Entwicklung lokal (`npm run server`, `127.0.0.1`); Betrieb auf einem **Hetzner CX32** mit systemd und Reverse-Proxy — aber **erst nach Anmeldung** (Abschnitt 5.2).

### 5.2 Was fehlt VOR öffentlicher Erreichbarkeit — in dieser Reihenfolge `[ENTSCHIEDEN]`

Alle vier Punkte sind in `docs/betrieb.md` §3 benannt; hier die **Reihenfolge**, in der sie sich gegenseitig bedingen:

1. **Firewall (zuerst, billig und voraussetzungslos).** Nur `443` (und ggf. `22`) nach außen; der Spielport `3000` bleibt **immer** auf `127.0.0.1`/Loopback. Das ist die Voraussetzung dafür, dass `PA_ERLAUBE_OEFFENTLICH=no` überhaupt greifen kann — sonst steht der Server ungeschützt im Netz.
2. **TLS über Reverse-Proxy (Caddy/nginx).** Nicht optional: Anmeldung über Klartext wäre sinnlos. Caddy holt Zertifikate selbst und leitet WebSockets (`/ws`) durch. `HOST` bleibt `127.0.0.1`; nur der Proxy ist öffentlich.
3. **Anmeldung/Konten.** Ohne sie kann jeder eine Lobby öffnen und belegen (`docs/skalierung.md` §7, Punkt 3). Das ist die eigentliche Voraussetzung für echten Betrieb.
4. **Ratenbegrenzung (je IP).** Ein Verbindungs-/Lobby-Limit, damit ein einzelner Client den Prozess nicht mit Lobbys flutet.

Ergänzend und aus dem Repo bereits vorbereitet, aber **auf dem Knoten zu aktivieren** `[OFFEN]`: `projectarmageddon.service` + `projectarmageddon-idle.timer` installieren, Marker `/etc/projectarmageddon/ist-gemietet` setzen (sonst ist die Bremse **nicht scharf** — siehe `--print-config`-Ausgabe in Abschnitt 1.1), `PA_MAX_MACHINE_MINUTES` setzen (heute **AUS**), `PA_STATE_PATH` auf ein persistentes Verzeichnis legen.

> **Befund 5:** Die Dokumente sind sich einig, dass **Weg B (kleiner Hetzner-CPU-Server)** richtig ist und **GPU (RunPod) für den Betrieb unnötig**. Offen ist allein die **Absicherung**: TLS, Anmeldung, Ratenbegrenzung, Firewall — in der oben genannten Reihenfolge.

---

## 6. Was NUR der Betreiber entscheiden oder messen kann `[OFFEN]`

**Entscheiden (kann dieses Repo nicht und soll es nicht):**

- **Instanzmiete:** Anbieter, Modell, Region, Preis/h, Besitzer — `docs/betrieb-INSTANZ.md` führt diese als `LÜCKE`. Ohne diese Werte wird nach AGENTS.md §5 **nichts** gemietet.
- **Kostenrahmen:** Höchstdauer, Worst Case (= Preis/h × Dauer), **zweiter Alarm außerhalb des Knotens** (fällt der Timer aus, ist die Bremse mit ihm weg).
- **Abschaltfristen:** `PA_IDLE_MINUTES` (Vorgabe 15), `PA_GRACE_MINUTES` (5), `PA_MAX_RUNTIME_MINUTES` (180) bestätigen; **`PA_MAX_MACHINE_MINUTES` setzen** — die einzige Frist, die auch bei nie gestartetem Server greift, ist heute leer.
- **`PA_ACTION`:** `stop` (nur Dienst aus) oder `poweroff` (Kosten aus). Nur `poweroff` beendet die Kosten; bei `poweroff` zusätzlich `PA_POWEROFF_CONFIRM=yes`.

**Messen (nicht lokal prüfbar):**

- **Echte Instanz** und **echter systemd-Anschluss:** Die systemd-Vorlagen wurden laut `docs/betrieb-INSTANZ.md` §5 nur auf Syntax geprüft, **nicht auf Anschluss** (Pfade `/opt/projectarmageddon`, Benutzer `pa`, Rechte). Der Nachweis (`systemctl list-timers`, `ls -l …/ist-gemietet`, `curl …/healthz`) gehört **vom Knoten** in `docs/betrieb-INSTANZ.md` §3.
- **DNS und Zertifikat:** Domainname, DNS-Eintrag, Zertifikatsausstellung und TLS-Abnahme sind Betreibervorgänge.
- **Mehrspieler-Session mit echten Menschen:** Ob eine Partie mit 8 Figuren spielbar/übersichtlich bleibt, ist nicht lokal messbar (`docs/skalierung.md` §8).
- **Lastgrenze:** Gemessen ist der Aufwand **je** Match, nicht die Grenze. Eine Lastmessung „viele Lobbys parallel" **steht aus** (`docs/betrieb.md` §6). Die 68-Matches-Zahl ist eine **Hochrechnung**, kein Messwert.

---

## 7. Was dieser Bericht NICHT belegt

- **Kein öffentlicher Betrieb.** Es wurde nur lokal auf `127.0.0.1` geprüft. „Start klappt" ist ausschließlich mit den Ausgaben in Abschnitt 1 belegt — nicht als öffentliche Erreichbarkeit.
- **Kein Rollback nachgewiesen** — es gibt keins (Abschnitt 4.2).
- **Keine Lastgrenze gemessen.**
- **Kein Container-Betrieb** — es gibt kein Container-Manifest.
- **Die systemd-Vorlagen wurden nicht auf einem echten Knoten angeschlossen.**

## Anhang — verwendete Belegkommandos (alle lokal, Hülle in `/home/patrick/.hermes/cache/scratch/pa-abnahme/`)

```bash
bash -n scripts/betrieb/server-start.sh
scripts/betrieb/server-start.sh --print-config
PORT=3399 HOST=127.0.0.1 PA_STATE_PATH=/tmp/… npm run server      # Start + HTTP + /ws
kill -TERM <node-PID>                                             # 3× wiederholt
# Port-Konflikt: zwei Läufe auf 3402, Erwartung Exit 1 + lesbare Meldung
npm run build                                                     # 2×, Manifestvergleich
```
