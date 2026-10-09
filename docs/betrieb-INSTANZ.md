# Betriebs-INSTANZ — Eintragsgerüst (noch nichts gemietet)

**Status: GERÜST.** Es ist **keine** Instanz gemietet, es läuft **keine**
Instanz, es sind **keine** Kosten entstanden. Dieses Dokument wird **vor** der
Miete ausgefüllt (AGENTS.md §5: „Ohne diese drei Punkte wird nichts gemietet"),
und der Nachweis wird **nach** der Miete mit der echten Ausgabe des Knotens
gefüllt.

Felder mit **`LÜCKE`** sind Entscheidungen des Auftraggebers. Sie sind
absichtlich leer: Dieses Repo kennt weder den Preis noch den Besitzer noch die
Instanz — und erfindet sie nicht.

Vorbereitet ist die technische Seite:

- Startskript: `scripts/betrieb/server-start.sh` (startet `npm run server`)
- Idle-Bremse: `scripts/betrieb/idle-watch.sh`
- systemd-Vorlagen: `deploy/systemd/projectarmageddon.service`,
  `deploy/systemd/projectarmageddon-idle.service`,
  `deploy/systemd/projectarmageddon-idle.timer`
- Parameter: `deploy/betrieb.env.example`
- Trockenlauf ohne gemietete Instanz:
  `scripts/betrieb/server-start.sh --print-config`

---

## 1. Eintrag (AGENTS.md §5 Punkt 1)

### Pflichtfelder

| Feld | Wert |
|---|---|
| **Name** der Instanz | **LÜCKE** — z. B. `pa-prod-01` (Vergabe: Auftraggeber) |
| **Zweck** | **LÜCKE** — konkreter Zweck, nicht „Betrieb". Kandidaten laut `docs/betrieb.md` Abschnitt 4: Mehrspieler-Partien mit TLS + Konten (`B`), GPU nur bei Bedarf (`C`). |
| **Instanztyp** | **LÜCKE** — Anbieter, Modell, vCPU/RAM/GPU, Region |
| **Preis pro Stunde** | **LÜCKE** — Zahl aus dem Angebot des Anbieters, nicht geschätzt |
| **Besitzer** | **LÜCKE** — wer die Rechnung bekommt und die Abschaltung verantwortet |
| **Abschaltungsart** | Idle-Timer **auf dem Knoten**: `projectarmageddon-idle.timer` ruft jede Minute `scripts/betrieb/idle-watch.sh --once`. Drei Schwellen: Leerlauf, Serverlaufzeit (Ablaufdatum des Prozesses), Maschinenlaufzeit (Ablaufdatum des Knotens, `PA_MAX_MACHINE_MINUTES`). |
| **Idle-Frist** | **LÜCKE** — zu bestätigen. Vorgabe im Skript: `PA_IDLE_MINUTES=15`; die harte Frist `PA_MAX_RUNTIME_MINUTES=180`. Die Frist, die auch ohne gestarteten Server greift (`PA_MAX_MACHINE_MINUTES`), ist im Beispiel **aus** und muss vom Auftraggeber gesetzt werden. |
| **Nachweisplatz** | siehe Abschnitt 3 — **leer**, bis der Knoten antwortet |

### Kosten (AGENTS.md §7)

| Angabe | Wert |
|---|---|
| Preis pro Stunde | **LÜCKE** (muss zu Abschnitt 1 passen) |
| Höchstdauer des Laufs | **LÜCKE** — geplante Dauer |
| Worst Case (Kosten) | **LÜCKE** = Preis/h × Höchstdauer. Ohne diese Rechnung wird nicht gestartet. |
| Zweite, unabhängige Frist | **LÜCKE** — Vorschlag, der nicht aus diesem Repo kommen darf, weil er den Knoten betrifft: ein zweiter Alarm *außerhalb* des Knotens (z. B. eine Nachricht an den Besitzer, wenn der Knoten nach der Höchstdauer noch lebt). Begründung: Fällt der Knoten selbst aus oder schlägt der Timer fehl, ist die Bremse im Knoten mit ihm weg. |

### Abschaltung — wie sie funktioniert

Drei Schwellen, in dieser Reihenfolge geprüft (`scripts/betrieb/idle-watch.sh`):

1. **Maschinenlaufzeit** — `/proc/uptime` ≥ `PA_MAX_MACHINE_MINUTES`.
   Hängt an nichts außer der Uhr. Greift auch bei never-started Server.
2. **Serverlaufzeit** — `uptimeMs` aus `/healthz` ≥ `PA_MAX_RUNTIME_MINUTES`.
   Das Ablaufdatum. Greift **immer**, auch bei offenen Verbindungen.
3. **Leerlauf** — seit `PA_IDLE_MINUTES` kein Lebenszeichen:
   0 Sitzungen, 0 Lobbys, keine gestiegenen Zähler
   (`snapshotsSent`, `commandsAccepted`, `connections`) und keine offene
   TCP-Verbindung am Spielport (`ss`).

Bei Unwissenheit (Server nicht messbar) wird **nicht** abgeschaltet — außer die
harten Fristen greifen. Ein falsches Abschalten mitten in einer Partie wäre
schlimmer als ein paar Minuten später abzuschalten.

### Scharfschaltung (der Marker)

Die Bremse ist **nur scharf**, wenn auf dem Knoten
`/etc/projectarmageddon/ist-gemietet` existiert. Fehlt der Marker, tut sie
nichts und schreibt das laut ins Journal (Rückgabewert 11). Damit kann sie nicht
versehentlich den Arbeitsrechner des Entwicklers abschalten. Der Marker wird
beim Aufsetzen erzeugt und ist **Teil des Nachweises** (Abschnitt 3, Beleg 2).

Ein Ein-/Ausschalter zum Übergehen gibt es **bewusst nicht**: Genau so ein
stiller Schalter war der Fehler vom 2026-09-25. Wer die Bremse anhalten will,
stoppt sichtbar `projectarmageddon-idle.timer` — dann fehlt sie aber auch in
`systemctl list-timers`, und der Nachweis ist sofort ungültig.

---

## 2. Mindest-Idle-Frist — die Entscheidung hinter der Zahl

Die Frist ist keine Technikfrage, sondern eine Kostenfrage: Sie bestimmt, wie
lange ein unbenutzter Knoten noch Geld kostet. Sie ist deshalb eine **LÜCKE**
und keine Vorgabe.

Was die Zahl leisten muss:

- **Kurz genug**, dass ein vergessener Knoten nicht tagelang weiterläuft
  (Vorfall: fünf Server, tagelang, 1,26 €/Tag).
- **Lang genug**, dass eine Partie mit einer Pause nicht abgeschaltet wird
  (Standardpartie: die Dauer steht in `docs/betrieb.md`, Abschnitt 5; die
  Zählerprüfung erkennt auch eine laufende Partie ohne Sitzung).

---

## 3. Nachweis (AGENTS.md §5 Punkt 3)

**Dieser Abschnitt ist leer. Er wird auf dem KNOTEN gefüllt, nach dem Mieten.**
Ohne diese Ausgaben gilt die Instanz als unbewiesen — dann wird sie wieder
abgeschaltet.

Die drei Belegbefehle, in dieser Reihenfolge, **auf dem Knoten** ausgeführt:

### Beleg 1 — der Idle-Timer ist aktiv

```bash
systemctl list-timers projectarmageddon-idle.timer
```

Ausgabe (leer):

```

```

Zusätzlich der Zustand des Durchlaufs:

```bash
systemctl status projectarmageddon-idle.service --no-pager
```

Ausgabe (leer):

```

```

### Beleg 2 — die Bremse ist scharf

```bash
ls -l /etc/projectarmageddon/ist-gemietet
```

Ausgabe (leer):

```

```

Und was die Bremse selbst über sich sagt (liest keine Netzverbindung, startet
nichts, stoppt nichts):

```bash
/opt/projectarmageddon/scripts/betrieb/idle-watch.sh --print-config
```

Ausgabe (leer):

```

```

### Beleg 3 — der Server lebt und der Idle-Timer greift

```bash
curl -fsS http://127.0.0.1:3000/healthz
```

Ausgabe (leer):

```

```

Dann der eigentliche Beweis, dass die Frist **greift** (nicht nur: „sie ist
konfiguriert"):

```bash
cat /var/lib/projectarmageddon/last-brake      # Zeitpunkt und Grund des letzten Auslösers
systemctl is-active projectarmageddon.service  # nach der Frist: inactive
```

Ausgabe (leer):

```

```

### Beleg 4 — die Frist greift ohne Zutun (Probelauf)

Ein Probelauf **vor** dem Bezahlen von Stunden: Frist kurz setzen, Server
starten, nichts tun, warten. Erwartet: der Server endet von selbst, und in
`/var/lib/projectarmageddon/last-brake` steht der Grund.

```bash
# auf dem Knoten, Frist bewusst sehr kurz
PA_IDLE_MINUTES=2 PA_GRACE_MINUTES=0 PA_ARMED_FILE= \
  /opt/projectarmageddon/scripts/betrieb/server-start.sh
```

Ausgabe (leer):

```

```

**Erst wenn Beleg 1–4 hier stehen, ist die Abschaltung nachgewiesen.**

---

## 4. Offene Punkte (LÜCKEN, die nur der Auftraggeber füllen kann)

- [ ] **LÜCKE** Name der Instanz
- [ ] **LÜCKE** Zweck (welcher Weg aus `docs/betrieb.md` Abschnitt 4)
- [ ] **LÜCKE** Instanztyp (Anbieter, Größe, Region)
- [ ] **LÜCKE** Preis pro Stunde (aus dem Angebot, nicht geschätzt)
- [ ] **LÜCKE** Besitzer
- [ ] **LÜCKE** Höchstdauer und Worst Case (AGENTS.md §7)
- [ ] **LÜCKE** `PA_MAX_MACHINE_MINUTES` setzen (sonst ist die Schicht, die
      auch bei nie gestartetem Server greift, aus)
- [ ] **LÜCKE** `PA_MAX_RUNTIME_MINUTES` bestätigen oder ändern
- [ ] **LÜCKE** `PA_IDLE_MINUTES` bestätigen oder ändern
- [ ] **LÜCKE** `PA_ACTION`: `stop` oder `poweroff`. `poweroff` schaltet den
      Knoten ab, **beendet bei Hetzner aber die Kosten nicht** (abgerechnet wird, bis
      der Server GELÖSCHT ist, siehe `docs/betrieb.md` Abschnitt 8). Bei `poweroff`
      zusätzlich `PA_POWEROFF_CONFIRM=yes`.
- [ ] **LÜCKE** Sicherung: `PA_SNAPSHOT_KEEP` bestätigen (Standard 3);
      Cloud-Abbild ja/nein (`PA_SNAPSHOT_CLOUD`), `PA_HCLOUD_SERVER`, `HCLOUD_TOKEN`
      in `betrieb.env` (Rechte 600); Preis je GB und Monat eintragen; Nachweis
      „Snapshot erstellt" aus dem Journal (Abschnitt 8, Schritt 5).
- [ ] **LÜCKE** Hostname/Benutzer auf dem Knoten (die Platzhalter
      `/opt/projectarmageddon` und `pa` in `deploy/systemd/` ersetzen)
- [ ] **LÜCKE** Zweiter Alarm außerhalb des Knotens (Abschnitt 1 „Kosten")
- [ ] **LÜCKE** TLS + Anmeldung: ohne sie bleibt `HOST=127.0.0.1` und
      `PA_ERLAUBE_OEFFENTLICH=no` (siehe `docs/betrieb.md`, Abschnitt 3)

## 5. Was dieses Dokument NICHT belegt

- **Es ist kein Betrieb.** Kein Timer läuft, kein Server läuft, kein Knoten
  existiert. Alles hier ist Vorbereitung.
- **Der Nachweis ist leer.** Abschnitt 3 ist vollständig mit Platzhaltern
  gefüllt und mit keiner echten Ausgabe.
- **Die systemd-Vorlagen sind nicht geprüft, was ihren Anschluss betrifft**
  (Pfade, Benutzer, Rechte auf dem Zielknoten) — nur ihre Syntax. Was nicht
  geprüft werden konnte, steht im Bericht zu diesem Auftrag (`TODO(verify)`).
