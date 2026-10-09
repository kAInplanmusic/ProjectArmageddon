# Betrieb

Wie der Server läuft, was er braucht, und was für einen echten Betrieb fehlt.

**Stand:** Der Server ist **startbar** (`npm run server`) und betriebsreif
gebaut. Was fehlt, ist die **Entscheidung**, wo er laufen soll — und die
Absicherung nach außen.

---

## 1. Starten

```bash
npm run server                 # Port 3000, nur lokal erreichbar
PORT=8080 npm run server       # anderer Port
npm run build && npm run server  # mit gebautem Client (empfohlen)
```

Der Server liefert zwei Dinge aus **einem** Prozess:

- die **WebSocket-Verbindung** unter `/ws` (Spielverkehr), und
- die **statischen Dateien** aus `dist/` (die Oberfläche).

### Umgebungsvariablen

| Variable | Wirkung | Standard |
|---|---|---|
| `PORT` | TCP-Port | `3000` |
| `HOST` | Bindeadresse | `127.0.0.1` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FORMAT` | `json` (Betrieb) oder `pretty` (Entwicklung) | `json` |
| `PA_PERSISTENCE` | `off` schaltet das Speichern ab | an |
| `PA_STATE_PATH` | Ablage der Lobby-Daten | `.pa-state/lobbies.json` |

`LOG_FORMAT=json` gibt je Ereignis **eine Zeile** aus — das ist die Form, die
Log-Sammler (journald, Loki, CloudWatch) ohne Parser lesen können.

---

## 2. Was der Server tut

Er ist **autoritativ**: Die Simulation läuft auf dem Server, der Client sendet
nur Winkel und Kraft. Damit ist eine Manipulation am Client wirkungslos — er
kann nur seine eigenen Eingaben verfälschen.

Der Kern ist **deterministisch**: Ein Seed erzeugt dieselbe Karte und denselben
Verlauf. Das ist nicht nur eine Spielzusicherung, sondern die Grundlage der
Persistenz (siehe unten).

### Persistenz

Der Server sichert laufende Lobbys alle 10 Sekunden und beim Beenden. Ein
Neustart baut die Matches aus **Seed und aufgezeichneten Eingaben** neu auf —
gespeichert werden also nicht die Spielzustände, sondern die Eingaben und der
Seed. Das ist um Größenordnungen kleiner und funktioniert nur, weil die
Simulation deterministisch ist.

Entschiedene Lobbys werden **nicht** gespeichert. Ein früherer Fehler hatte
jede Lobby mitgesichert; in der Entwicklungsdatei standen 258 abgeschlossene
Lobbys, die bei jedem Start neu aufgebaut wurden, nur um sofort wieder zu enden.

### Geordnetes Beenden

`SIGINT` (Strg+C) und `SIGTERM` werden abgefangen: Der Server sichert den
Zustand und schließt die Verbindungen. **Ohne das verlöre ein Neustart alle
laufenden Partien.**

```bash
kill -TERM <pid>     # geordnet
```

---

## 3. Sicherheit — was fehlt

> **Der Server hat keine Anmeldung und keine Verschlüsselung.**

`HOST` steht deshalb standardmäßig auf `127.0.0.1`. Wer ihn auf `0.0.0.0`
bindet, macht ihn für jeden im Netz erreichbar — im offenen Netz für jeden
überhaupt. Das Startskript (`scripts/betrieb/server-start.sh`) bricht in diesem
Fall ab; freigeschaltet wird das nur ausdrücklich über
`PA_ERLAUBE_OEFFENTLICH=yes`.

Für einen echten Betrieb fehlen drei Dinge, in dieser Reihenfolge:

1. **TLS** — ein Reverse-Proxy (Caddy, nginx) davor. Caddy ist die kürzeste
   Lösung: Es holt Zertifikate selbst und leitet WebSockets durch.
2. **Anmeldung** — ohne sie kann jeder eine Lobby öffnen und belegen. Das ist
   der Punkt „Konten und Anmeldung" in der TODO.
3. **Ratenbegrenzung** — ein Verbindungslimit je IP, damit ein einzelner
   Client den Server nicht mit Lobbys flutet.

Der Server **ist** gegen die üblichen Angriffe von innen gehärtet: Eingaben
werden validiert, es gibt eine Obergrenze für Nachrichten (`maxPayloadBytes`),
und die Client-Autorität ist auf Winkel und Kraft begrenzt (durch Tests
festgehalten).

---

## 4. Die Entscheidung: wo soll er laufen

Drei Wege, mit den Zahlen, die das Projekt liefert.

### A — Nur lokal (heute)

Der Server läuft auf dem Rechner des Spielers, mehrere Tabs spielen
gegeneinander.

- **Kosten:** keine.
- **Grenze:** Nur im selben Netz. Kein Profil über Geräte hinweg.
- **Aufwand:** null — er läuft bereits so.

### B — Kleiner Server (empfohlen für den nächsten Schritt)

Eine Maschine irgendwo dauerhaft, Reverse-Proxy davor.

- **Was gemessen ist:** Ein Match rechnet eine 1D-Terrain-Simulation mit
  4 Figuren bei 60 Hz. Der Aufwand ist **klein**: Die Browser-E2E-Messung
  nennt für die Terrain-Berechnung 18,4 ms für 1280×720 — und die läuft
  **einmal je Karte**, nicht je Bild. Der Server hält mehrere Matches
  parallel in einem Prozess.
- **Kosten:** Ein Hetzner CX22 (2 vCPU, 4 GB) liegt bei rund 4 €/Monat; das
  reicht für eine Handvoll gleichzeitiger Matches.
- **Voraussetzung:** TLS + Konten (siehe Abschnitt 3).
- **Aufwand:** Reverse-Proxy einrichten (Minuten), systemd-Unit für den
  Neustart, `PA_STATE_PATH` auf ein dauerhaftes Verzeichnis.

### C — RunPod (nur bei GPU-Bedarf)

Sinnvoll **erst dann**, wenn die geplante KI-Auswertung (Kulissen vorab,
Bot-Gegner) wirklich GPU braucht.

- **Was heute dagegen spricht:** Der Server braucht **keine GPU**. Die
  Kulissen sind fertige Bilder, die Simulation ist CPU-Arbeit.
- **Kosten:** Eine GPU-Instanz kostet ein Vielfaches (Größenordnung zehnfach
  und mehr) — für eine Last, die eine CPU-Maschine trägt.

**Empfehlung:** Weg **B**, und zwar erst nach den Konten. Ein Server ohne
Anmeldung ist offen; ihn dann öffentlich zu betreiben wäre schlechter als ihn
lokal zu lassen.

---

## 5. Wenn er läuft: was zu beobachten ist

Der Server protokolliert strukturiert. Drei Dinge lohnen einen Blick:

| Ereignis | Bedeutung |
|---|---|
| `websocket_error` | ein Verbindungsproblem — bei `EADDRINUSE` sofort sichtbar |
| `server_listening` | Start bestätigt, nennt Port und Persistenz-Zustand |
| Lobbys im Zustand `playing` | je mehr, desto mehr Rechenlast |

Die **Kennzahlen** (`/metrics`-Zähler im Server) sind im Speicher und gehen bei
einem Neustart verloren — für einen echten Betrieb gehörten sie in ein
Zeitreihensystem.

---

## 6. Was dieses Dokument nicht beantwortet

- **Wie viele Spieler eine Maschine trägt.** Gemessen ist der Aufwand je
  Match, nicht die Grenze. Eine Lastmessung (viele Lobbys parallel) steht aus.
- **Ob Profile zentral oder je Gerät gehören.** Das ist eine Produkt- und
  Datenschutzfrage, keine technische.
- **Ob der Server Kulissen ausliefern soll.** Heute liegen sie als Dateien im
  Client. Sie zentral auszuliefern wäre derselbe Prozess — aber es wäre eine
  Änderung an der Auslieferung, nicht am Betrieb.

---

## 7. Vorbereitet: die startbare Betriebsform (ohne Miete)

Der Weg in einen echten Betrieb liegt vollständig vor — als **Vorbereitung**,
nicht als laufender Dienst:

| Was | Wo |
|---|---|
| Startskript (startet `npm run server`) | `scripts/betrieb/server-start.sh` |
| Idle-Bremse (Leerlauf, Serverlaufzeit, Maschinenlaufzeit) | `scripts/betrieb/idle-watch.sh` |
| systemd-Vorlagen (Dienst, Bremse, Timer) | `deploy/systemd/` |
| Betriebsparameter (Vorlage, mit `LÜCKE`-Feldern) | `deploy/betrieb.env.example` |
| Eintragsgerüst + Nachweisplatz | `docs/betrieb-INSTANZ.md` |

**Ohne gemieteten Knoten prüfbar** — und das ist die Form, in der es heute
vorliegt:

```bash
bash -n scripts/betrieb/server-start.sh          # Syntax
scripts/betrieb/server-start.sh --print-config   # Trockenlauf: zeigt die Abschaltparameter
```

Das Startskript startet `npm run server` **und** die Idle-Bremse als
Kindprozess. Ein Server ohne Abschaltung wird nicht gestartet: Der Fall vom
2026-09-25 (fünf Hetzner-Server liefen tagelang weiter, weil ein
Abschaltautomatismus im Repo für einen laufenden Dienst gehalten wurde) ist der
Grund, warum beides zusammengehört.

Die Bremse stoppt den Server nach `PA_IDLE_MINUTES` ohne Aktivität — und in
jedem Fall nach `PA_MAX_RUNTIME_MINUTES` (Prozess) bzw.
`PA_MAX_MACHINE_MINUTES` (Knoten). Was als „Aktivität" gilt, ist gemessen:
`/healthz` liefert Sitzungen, Lobbys und fortlaufende Zähler; zusätzlich zählt
die Bremse die offenen TCP-Verbindungen am Spielport.

**Bevor etwas gemietet wird**, sind die drei Punkte aus AGENTS.md §5 zu
erfüllen. Der Nachweis mit der Ausgabe von `systemctl list-timers` **vom Knoten**
gehört in `docs/betrieb-INSTANZ.md`, Abschnitt 3. Eine Datei im Repo ist kein
laufender Dienst.

## 8. Sicherung vor dem Abschalten (Snapshots)

Die Instanz läuft nur, wenn gespielt wird. Damit Spielstand, Replays, Protokolle
und der genaue Programmstand nicht am einen Knoten hängen, legt
`scripts/betrieb/snapshot.sh` bei **jedem Stopp des Dienstes** einen Snapshot ab
und behält nur die **neuesten 3** (`PA_SNAPSHOT_KEEP`, 1 bis 50). Ältere werden
automatisch gelöscht — **erst nachdem** der neue vollständig und lesbar da ist.

| Ebene | Was | Wann | Überlebt das Löschen des Servers? |
|---|---|---|---|
| **Archiv** (immer) | `.tar.gz` mit `state/` (Spielstände, Replays), `logs/` (Journal, Dienststatus), `app/` (git-Hash, nicht eingecheckte Änderungen, Quelltext), `config/` (Betriebsparameter, Zugangsdaten **geschwärzt**), `manifest.json` mit Prüfsummen; daneben `.sha256` | `ExecStopPost` des Dienstes: Idle-Bremse, manuelles Stoppen, Absturz, Herunterfahren | **Nein** — liegt auf dem Server (`/var/lib/projectarmageddon/snapshots`) |
| **Cloud-Abbild** (optional, `PA_SNAPSHOT_CLOUD=yes`) | Hetzner-Abbild des ganzen Servers über die `hcloud`-CLI, Label `projectarmageddon-snapshot=auto`, die neuesten `PA_HCLOUD_KEEP` bleiben | Idle-Bremse, **vor** `poweroff` | **Ja** |

Bilder und Videos kommen nicht ins Archiv (`PA_SNAPSHOT_MIT_ASSETS=no`): Es wird
dadurch rund 1 MB statt vieler hundert MB groß; der Stand ist über den `gitHash`
im Manifest wiederherstellbar.

### Wichtig: „ausgeschaltet" ist bei Hetzner nicht „kostenlos"

Hetzner Cloud rechnet einen Server ab, **solange er existiert** — auch
ausgeschaltet. Die Kosten enden erst mit dem **Löschen**. (Quelle: Hetzner-FAQ,
über Websuche bestätigt am 2026-10-09; der Preis eines Abbilds je GB und Monat
steht auf der Hetzner-Preisseite und ist vor dem Einsatz dort nachzulesen.)
Wer sparen will, arbeitet so: **Abbild → Server löschen → beim nächsten Spiel
einen neuen Server aus dem neuesten Abbild erstellen.** Dafür ist die Cloud-Ebene
da; das Archiv allein reicht dafür nicht. Das automatische **Löschen des Servers
macht dieses Skript bewusst nicht** — das ist eine unumkehrbare Handlung und
bleibt bei dir (oder einer eigenen, ausdrücklich eingerichteten Automation).

### Einrichten (auf dem Knoten, einmalig) — Schritt für Schritt

Alles läuft auf dem gemieteten Server, per SSH, als root. Das Skript
`scripts/betrieb/snapshot-einrichten.sh` erledigt die Handarbeit und ist beliebig oft
wiederholbar.

**Nur Archiv (Standard, kein Hetzner-Zugang nötig):**

```bash
sudo /opt/projectarmageddon/scripts/betrieb/snapshot-einrichten.sh
```

Das trägt die Einstellungen in `/etc/projectarmageddon/betrieb.env` ein (Rechte 600),
zeigt die geltende Konfiguration und macht einen Trockenlauf. Es erzeugt noch nichts.

**Cloud-Abbild — zwei Wege. Das Token liegt in keinem Fall auf der Platte des Servers.**

Hintergrund: Ein Hetzner-Abbild ist eine Kopie der ganzen Platte. Stünde das Token in
`betrieb.env`, steckte es in jedem Abbild und in jedem daraus erstellten Server. Deshalb
gilt: **kein Token auf der Platte.** `snapshot.sh` verweigert das Cloud-Abbild sogar,
solange in `betrieb.env` ein `HCLOUD_TOKEN` steht.

| | Weg A — von deinem Rechner (empfohlen) | Weg B — vom Server aus |
|---|---|---|
| Token liegt | nur auf deinem Rechner (`hcloud context`) | im Arbeitsspeicher des Servers (`/run`, tmpfs) |
| Vorher nötig | nichts auf dem Server | nach jedem Start einmal `token-setzen.sh` (30 s per SSH) |
| Wann das Abbild entsteht | du startest es nach dem Spiel | automatisch vor dem Abschalten (Idle-Bremse) |
| Vergisst du den Schritt | kein Abbild — Server einfach nicht löschen | kein Abbild, die Bremse schaltet trotzdem ab (Kosten); im Journal steht der Grund |

**Weg A (empfohlen) — auf deinem Rechner:**

1. `hcloud` installieren und einmal anmelden: Hetzner-Console → Projekt → *Security* →
   *API tokens* → Token mit **Read & Write** erzeugen, dann `hcloud context create projectarmageddon`
   (das Token wird nur lokal gespeichert).
2. Nach dem Spiel — der Server soll danach weg:

   ```bash
   scripts/betrieb/abbild-lokal.sh --server <Servername> --ausschalten --loeschen --ja-wirklich
   ```

   Es fährt den Server sauber herunter, erstellt das Abbild des **ausgeschalteten**
   Servers (dateisystemkonsistent), prüft, dass es `available` ist, löscht ältere
   Abbilder (die neuesten 3 bleiben) und löscht erst **dann** den Server. Ohne
   `--loeschen` bleibt der Server stehen. Mit `--trocken` zeigt es nur, was es täte.
3. Zum nächsten Spiel:

   ```bash
   scripts/betrieb/server-aus-abbild.sh --name <Servername> --typ <Typ> --ort <Ort> --ssh-key <Key>
   ```

   Es nimmt das **neueste** Abbild und verweigert, wenn der Name schon vergeben ist.

**Weg B — auf dem Server, Token nur im Arbeitsspeicher:**

```bash
sudo PA_HCLOUD_SERVER=<Servername> /opt/projectarmageddon/scripts/betrieb/snapshot-einrichten.sh --cloud
```

Das Skript prüft das Token (reine Leseabfrage) und den Servernamen, legt das Token
**nur in `/run`** ab (`token-setzen.sh`) und entfernt ein früher gespeichertes
`HCLOUD_TOKEN` aus `betrieb.env`. Nach **jedem Neustart** des Servers ist das Token
weg und muss mit `sudo scripts/betrieb/token-setzen.sh` neu gesetzt werden.
`token-setzen.sh` weigert sich, auf eine Platte zu schreiben.

**Kontrolle (beide Wege):** In der Console unter *Servers → Snapshots* trägt das
Abbild das Label `projectarmageddon-snapshot=auto`. Dass der Dienst beim Stoppen
das Archiv anlegt:

```bash
sudo systemctl stop projectarmageddon
sudo journalctl -u projectarmageddon -n 30 | grep -i snapshot
ls -l /var/lib/projectarmageddon/snapshots
```

### Falls ein Token je auf der Platte lag (Altlast)

Abbilder, die damals entstanden, können es enthalten (auch gelöschte Dateien lassen
sich aus einem Plattenabbild unter Umständen wiederherstellen). Dann: Token in der
Hetzner-Console **löschen**, ein neues erzeugen, und die alten Abbilder löschen. Das
Einrichtungsskript meldet diesen Fall, wenn es ein Token in `betrieb.env` findet.

### Zurückspielen

- **Archiv:** `tar -tzf pa-snapshot-<Zeit>.tar.gz` zeigt den Inhalt;
  `sha256sum -c pa-snapshot-<Zeit>.tar.gz.sha256` prüft ihn. Spielstände:
  `tar -xzf … ./state/lobbies.json` und nach `PA_STATE_PATH` kopieren. Programmstand:
  `manifest.json` → `gitHash`, plus `app/nicht-eingecheckt.patch`.
- **Cloud-Abbild:** neuen Server aus dem Abbild erstellen (`hcloud server create
  --image <ID> …`).

### Grenzen (ehrlich)

- Ein Archiv auf demselben Server schützt **nicht** vor dem Löschen des Servers.
  Dafür braucht es das Cloud-Abbild oder eine Kopie nach außen (nicht gebaut).
- Das Cloud-Abbild ist bei laufendem Betriebssystem „absturzkonsistent": Der Dienst
  ist beim Aufruf bereits gestoppt, das System selbst läuft noch.
- Die Cloud-Ebene ist **nicht gegen Hetzner getestet** (kein Zugang in dieser
  Umgebung) — nur gegen einen Platzhalter für `hcloud`. Erste echte Probe auf dem
  Knoten, mit `--trocken` und danach einem ersten Lauf unter Aufsicht.
- Die Sicherung läuft beim Stopp. Bricht der Strom ohne Stopp weg (Server von
  außen gelöscht), gibt es keinen Lauf.
