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
überhaupt. Das Startskript warnt in diesem Fall.

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
