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
- Prüfung der Pflichtfelder: `node scripts/betrieb/pflichtfelder.mjs`
- Trockenlauf ohne gemietete Instanz:
  `scripts/betrieb/server-start.sh --print-config`

---

## 1. Eintrag (AGENTS.md §5 Punkt 1)

### Pflichtfelder

Die Tabelle ist die **prüfbare Vorlage**. Die IDs `PFLICHT-01` bis `PFLICHT-15`
sind fest; `node scripts/betrieb/pflichtfelder.mjs` liest sie aus dieser Datei
und verweigert die Freigabe, solange in der Spalte „Wert" noch `LÜCKE` steht
(Rückgabewert 3). Der Test `tests/betrieb-vorlage.test.js` hält Anzahl,
Reihenfolge und Bedeutung der Felder fest.

**Regel: Kein Start, solange eine Zeile `LÜCKE` enthält.** Ein eingetragener
Wert ohne Beleg (Abschnitt 3) gilt als nicht eingetragen.

| ID | Pflichtfeld | Wert | Beleg / Prüfung |
|---|---|---|---|
| PFLICHT-01 | **Name** der Instanz | **`pa-spiel`** (Server), **`pa-spiel-ipv4`** (Primary IP) — Hetzner-Projekt des Auftraggebers | `hcloud server list` bzw. Konsole; Name auch in Abschnitt 3 |
| PFLICHT-02 | **Zweck** | **Spielserver auf Abruf** (Weg B aus `docs/betrieb.md` Abschnitt 4): Mehrspieler-Partien mit TLS; Lebenszyklus laut Abschnitt 10 (hochfahren → spielen → 15 min Leerlauf → Abbild → Selbstlöschung). Keine GPU. | Zweck muss den Lauf begrenzen (Abschnitt 2) |
| PFLICHT-03 | **Instanztyp** | **Hetzner `cpx22`**: 2 vCPU (AMD, geteilt), 4 GB RAM, 80 GB Platte, x86, Standort `fsn1` (Falkenstein). Gewählt automatisch als billigster **verfügbarer** Typ ≥ 2 vCPU/4 GB ≤ 25 €/Monat; `cx23` (40 GB, 6,53 €/Monat) und `cx33` waren am 2026-11-10 laut API in `fsn1`/`nbg1`/`hel1` nicht verfügbar (Begründung Abschnitt 10). | Angebot/Konsole; Typ im Beleg 5 |
| PFLICHT-04 | **Preis pro Stunde** | **0,037128 €/h brutto** (23,1931 €/Monat Dauerbetrieb-Äquivalent), Hetzner-API `/server_types` am 2026-11-10; Primary IPv4 0,000952 €/h | Rechnung/Preisliste; muss zu PFLICHT-06 passen |
| PFLICHT-05 | **Besitzer** | Auftraggeber (Inhaber des Hetzner-Projekts und des GitHub-Kontos `kAInplanmusic`); **Klarname vom Auftraggeber einzutragen** | benannter Mensch, keine Rolle |
| PFLICHT-06 | **Höchstdauer und Worst Case** | Höchstdauer je Lauf **9 h** (= `PA_MAX_MACHINE_MINUTES` 540); Worst Case **9 h × 0,037128 €/h = 0,33 €** je Lauf. Dazu dauerhaft: Primary IP 0,595 €/Monat + Abbild (Größe × 0,017017 €/GB/Monat). Zweite Frist außerhalb: 12 h (Zeitplan, PFLICHT-13) = 0,45 €. | Rechnung hier eintragen; Grundlage für den zweiten Alarm |
| PFLICHT-07 | **`PA_MAX_MACHINE_MINUTES`** | **540** (9 h) | `idle-watch.sh --print-config` zeigt „Maschinenlaufzeit"; Wert in `betrieb.env` |
| PFLICHT-08 | **`PA_MAX_RUNTIME_MINUTES`** | **480** (8 h) | `--print-config`; `last-brake` nennt den Grund |
| PFLICHT-09 | **`PA_IDLE_MINUTES`** | **15** (Auftraggeber 2026-11-10) | `--print-config`; Abschnitt 2 begründet die Zahl |
| PFLICHT-10 | **`PA_ACTION`** | **`abbild-loeschen`** (neu, Abschnitt 10): Abbild des eigenen Servers, Prüfung, dann Server löschen; Fail-safe `poweroff` ohne Löschen. `poweroff` allein bleibt wirkungslos für die Kosten. | `--print-config`; Abschnitt 6 |
| PFLICHT-11 | **`PA_SNAPSHOT_KEEP`** | `PA_SNAPSHOT_KEEP=3` (lokale Archive beim Stopp); Cloud-Abbild: **ja, durch den Server selbst** (`PA_ABBILD_BEHALTEN=1`, neuestes geprüftes bleibt); Token nur im Arbeitsspeicher (Weg C, Abschnitt 10), nie in `betrieb.env` | `snapshot.sh --print-config`; Beleg 5 und 6 |
| PFLICHT-12 | **Hostname / Benutzer auf dem Knoten** | Pfade wie in `deploy/systemd/`: **`/opt/projectarmageddon`**, Benutzer **`pa`**; Hostname = Servername `pa-spiel` | `systemctl cat projectarmageddon`; `id pa` |
| PFLICHT-13 | **Zweiter Alarm außerhalb des Knotens** | GitHub-Zeitplan `server-hochfahren` alle 3 h: Server, die **ausgeschaltet oder älter als 12 h** sind, werden nach geprüftem Abbild gelöscht (`not-aus --aelter-als-stunden 12 --ausgeschaltete`). Läuft außerhalb des Servers; braucht das Secret `HCLOUD_TOKEN`. | Nachweis des Alarms (z. B. Testnachricht) im Beleg 5 |
| PFLICHT-14 | **TLS + Anmeldung** | TLS: **ja** (Caddy, Let's Encrypt, `<IP>.sslip.io` oder `PA_DOMAIN`). Anmeldung: **Start nur nach Login** auf https://www.projectarmageddon.de (Option D, `docs/zugang-www.md`: Passwort als PBKDF2-Hash, signiertes 12-h-Cookie, Sperre nach 5 Fehlversuchen); der Spielserver selbst ist öffentlich, Spieler schützt das Konto des Spiels | `curl -I https://<domain>`; Anmeldung erzwungen; Caddyfile nach `deploy/Caddyfile.beispiel` |
| PFLICHT-15 | **Bildpreis je GB und Monat** | **0,017017 €/GB/Monat brutto** (Hetzner-API `/pricing`, 2026-11-10) | Preisliste + Abbildgröße im Beleg 5; Rechnung PFLICHT-06 ergänzen |

### Kosten (AGENTS.md §7)

| Angabe | Wert |
|---|---|
| Preis pro Stunde | **LÜCKE** (muss zu PFLICHT-04 passen) |
| Höchstdauer des Laufs | **LÜCKE** — geplante Dauer (PFLICHT-06) |
| Worst Case (Kosten) | **LÜCKE** = Preis/h × Höchstdauer. Ohne diese Rechnung wird nicht gestartet. |
| Bildkosten je Monat | **LÜCKE** = Abbildgröße in GB × PFLICHT-15; nur wenn Abbilder aufbewahrt werden |
| Zweite, unabhängige Frist | **LÜCKE** — PFLICHT-13 (Alarm außerhalb des Knotens) |

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

Die Belegbefehle, in dieser Reihenfolge, **auf dem Knoten** ausgeführt:

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

### Beleg 5 — Löschen und Neuerstellen aus dem Abbild (Z246 c)

Dokumentiert den **einen** Löschvorgang: wann, durch wen, welches Abbild,
welche Größe, welcher Preis je GB/Monat (PFLICHT-15), welcher Alarm außerhalb
des Knotens (PFLICHT-13) vorher ausgelöst hat.

```bash
hcloud image list -o columns=id,description,disk_size,created     # Abbild vorhanden?
hcloud server describe <Name>                                     # vor dem Löschen
# Betreiber-Protokoll auf dem eigenen Rechner (kein Skript schreibt es):
# Zeitpunkt | Name | Abbild-ID | Abbildgröße | Preis je GB/Monat | wer gelöscht hat
```

Ausgabe (leer):

```

```

### Beleg 6 — Archiv-Kopie außerhalb des Servers (Z246 d)

Auf dem **eigenen Rechner** nach dem Herunterladen (Abschnitt 7):

```bash
ls -l ~/pa-archive/<instanz>/
sha256sum -c pa-snapshot-<Zeit>.tar.gz.sha256
```

Ausgabe (leer):

```

```

**Erst wenn Beleg 1–6 hier stehen, ist die Abschaltung und die Sicherung
nachgewiesen.**

### 3a. Sicherheitsnachweis (REL-2 / DEP-3)

Diese Belege gehören **nach** dem Aufsetzen hierher, bevor 443 für Spieler
offen bleibt. Reihenfolge und Begründung: `docs/sicherheit-vor-oeffentlich.md`.

**Beleg S1 — Firewall: nur 22/80/443 offen, 3000 zu**

```bash
sudo nft list ruleset          # oder: sudo ufw status verbose
# von AUSSEN: nc -zv <knoten-ip> 3000   → refused / timeout
```

Ausgabe (leer):

```

```

**Beleg S2 — TLS und Proxy**

```bash
curl -sSI https://<DOMAIN>/ | grep -iE 'HTTP/|strict-transport|x-content-type|x-frame'
curl -sS -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/healthz    # 404
node /opt/projectarmageddon/current/scripts/release/smoke.mjs --url https://<DOMAIN> --aussen --version <v> --gitsha <sha>
```

Ausgabe (leer):

```

```

**Beleg S3 — Anmeldeentscheidung**

Gewählter Weg (offen / Basic-Auth / Kontenpflicht) und Begründung:

```

```

---

## 4. Offene Punkte (LÜCKEN, die nur der Auftraggeber füllen kann)

Je Zeile eine Entscheidung; die ID entspricht der Tabelle in Abschnitt 1.
`node scripts/betrieb/pflichtfelder.mjs` meldet genau die noch offenen IDs.

- [ ] **PFLICHT-01** Name der Instanz
- [ ] **PFLICHT-02** Zweck (welcher Weg aus `docs/betrieb.md` Abschnitt 4)
- [ ] **PFLICHT-03** Instanztyp (Anbieter, Größe, Region)
- [ ] **PFLICHT-04** Preis pro Stunde (aus dem Angebot, nicht geschätzt)
- [ ] **PFLICHT-05** Besitzer
- [ ] **PFLICHT-06** Höchstdauer und Worst Case (AGENTS.md §7)
- [ ] **PFLICHT-07** `PA_MAX_MACHINE_MINUTES` setzen (sonst ist die Schicht, die
      auch bei nie gestartetem Server greift, aus)
- [ ] **PFLICHT-08** `PA_MAX_RUNTIME_MINUTES` bestätigen oder ändern
- [ ] **PFLICHT-09** `PA_IDLE_MINUTES` bestätigen oder ändern
- [ ] **PFLICHT-10** `PA_ACTION`: `stop` oder `poweroff`; bei `poweroff`
      zusätzlich `PA_POWEROFF_CONFIRM=yes`
- [ ] **PFLICHT-11** `PA_SNAPSHOT_KEEP` bestätigen (Standard 3); Cloud-Abbild
      ja/nein; Weg A (`abbild-lokal.sh`, empfohlen) oder Weg B
      (`token-setzen.sh`) — das Token liegt NIE in `betrieb.env`
- [ ] **PFLICHT-12** Hostname/Benutzer auf dem Knoten (die Platzhalter
      `/opt/projectarmageddon` und `pa` in `deploy/systemd/` ersetzen)
- [ ] **PFLICHT-13** Zweiter Alarm außerhalb des Knotens (Abschnitt 1 „Kosten")
- [ ] **PFLICHT-14** TLS + Anmeldung: ohne sie bleibt `HOST=127.0.0.1` und
      `PA_ERLAUBE_OEFFENTLICH=no` (siehe `docs/betrieb.md`, Abschnitt 3)
- [ ] **PFLICHT-15** Bildpreis je GB und Monat (Abschnitt 8)

Zusätzlich, nicht in der 15er-Liste, aber vor einem Lauf zu entscheiden:
Abschnitt 6 (Lösch-Ablauf) und Abschnitt 7 (Archiv-Kopie außerhalb) sind
Betreiber-Schritte, keine Repo-Automaten. Wer sie ausführt, steht in
PFLICHT-05.

## 5. Was dieses Dokument NICHT belegt

- **Es ist kein Betrieb.** Kein Timer läuft, kein Server läuft, kein Knoten
  existiert. Alles hier ist Vorbereitung.
- **Der Nachweis ist leer.** Abschnitt 3 ist vollständig mit Platzhaltern
  gefüllt und mit keiner echten Ausgabe.
- **Die systemd-Vorlagen sind nicht geprüft, was ihren Anschluss betrifft**
  (Pfade, Benutzer, Rechte auf dem Zielknoten) — nur Syntax und Härtung
  (`systemd-analyze verify`, `systemd-analyze security`; siehe
  `tests/systemd-vorlagen.test.js`). Was nicht geprüft werden konnte, steht im
  Bericht zu diesem Auftrag (`TODO(verify)`).
- **Die Pflichtfeld-Prüfung prüft Anwesenheit, nicht Wahrheit.** Sie erkennt
  fehlende oder noch offene Felder; sie kann nicht erkennen, ob ein Preis
  erfunden oder ein Besitzer falsch benannt ist. Dafür ist die Unterschrift des
  Besitzers und der Beleg in Abschnitt 3 da.
- **Die Tests der Kostenbremse laufen ohne Knoten.** Sie belegen das Verhalten
  der Skripte (Marker, Schwellen, Rückgabewerte), nicht den Anschluss an
  systemd auf einem echten Server.

---

## 6. Z246 (c) — Löschen und Neuerstellen aus dem Abbild (Betreiber-Ablauf)

**Bewusst nicht automatisiert.** Das Löschen eines Servers ist unumkehrbar, und
bei Hetzner laufen die Kosten bis zur Löschung weiter — auch bei
`poweroff`. Eine Automation, die im falschen Moment löscht, vernichtet den
einzigen Knoten samt lokalem Archiv. Deshalb bleibt der Ablauf ein
**Betreiber-Schritt**: ein benannter Mensch (PFLICHT-05) führt ihn aus und
protokolliert ihn. AGENTS.md §5: Ein Agent mietet, erstellt, startet oder
löscht **nie** selbst Server.

Ablauf, in dieser Reihenfolge. Jeder Schritt ist eine Abbruchstelle: fehlt der
Beleg, wird nicht gelöscht.

1. **Spiel beenden und Dienst stoppen.** `ExecStopPost` legt das Archiv an
   (`pa-snapshot-<Zeit>.tar.gz` + `.sha256`).
   ```bash
   sudo systemctl stop projectarmageddon
   sudo journalctl -u projectarmageddon -n 30 | grep -i snapshot
   ls -l /var/lib/projectarmageddon/snapshots
   ```
2. **Archiv nach außen kopieren** — Abschnitt 7, inklusive
   `sha256sum -c` auf dem eigenen Rechner. Ohne diese Kopie ist das Archiv mit
   dem Server weg.
3. **Abbild erstellen, nicht löschen.** Vom eigenen Rechner (Token bleibt dort)
   oder in der Konsole:
   ```bash
   scripts/betrieb/abbild-lokal.sh --server <Name> --ausschalten
   # ohne --loeschen: der Server bleibt stehen
   ```
   Warten, bis das Abbild `available` ist, Label
   `projectarmageddon-snapshot=auto` prüfen, ID und Größe notieren.
4. **Löschung freigeben.** Vor dem Löschen müssen vorliegen: (a) geprüftes
   Abbild, (b) Archiv-Kopie außerhalb mit gültiger Prüfsumme, (c) Bestätigung
   des Besitzers. Erst dann:
   ```bash
   hcloud server delete <Name>
   ```
   Oder `abbild-lokal.sh --loeschen --ja-wirklich` — es löscht nur, wenn das
   neue Abbild vorher geprüft wurde. Zeitpunkt, Name, Abbild-ID und
   Archivpfad in Beleg 5 eintragen.
5. **Neuerstellen beim nächsten Spiel** aus dem neuesten Abbild:
   ```bash
   scripts/betrieb/server-aus-abbild.sh --name <Name> --typ <Typ> --ort <Ort> --ssh-key <Key>
   ```
   Danach: Marker `/etc/projectarmageddon/ist-gemietet` muss vorhanden sein
   (er lag auf der Platte des Abbilds), Idle-Timer aktiv, `--print-config`
   zeigt die Fristen. Beleg 1 und 2 erneut ausfüllen.

**Kostenfenster:** Ab dem Erstellen bis zum Löschen wird abgerechnet;
`poweroff` beendet die Abrechnung nicht. Ein vergessener Knoten kostet weiter,
auch wenn niemand spielt — genau dagegen greifen `PA_MAX_MACHINE_MINUTES` und
der Alarm außerhalb des Knotens (PFLICHT-13).

---

## 7. Z246 (d) — Archiv-Kopie außerhalb des Servers (Betreiber-Schritt)

Das Archiv liegt auf **demselben** Server
(`/var/lib/projectarmageddon/snapshots`). Wird der Server gelöscht, ist es weg.
Das Cloud-Abbild (Abschnitt 6) ist eine zweite Ebene, aber kein lesbares
Archiv. Eine automatische Kopie nach außen ist **nicht gebaut** — sie braucht
Zugangsdaten zu einem fremden Speicher, und die gehören dem Betreiber, nicht
diesem Repo. Der Schritt ist deshalb ausdrücklich manuell und wird
protokolliert.

**Vor dem Löschen, auf dem eigenen Rechner** (nicht auf dem Server):

```bash
mkdir -p ~/pa-archive/<instanz>
rsync -av --partial --progress \
  pa@<host>:/var/lib/projectarmageddon/snapshots/ ~/pa-archive/<instanz>/
# oder ohne rsync:
# scp -p 'pa@<host>:/var/lib/projectarmageddon/snapshots/*' ~/pa-archive/<instanz>/
```

**Prüfen, nicht hoffen:**

```bash
cd ~/pa-archive/<instanz>
sha256sum -c pa-snapshot-<Zeit>.tar.gz.sha256
tar -tzf pa-snapshot-<Zeit>.tar.gz | head
```

**Ablage-Regeln:**

- Mindestens das Archiv der letzten Sitzung **und** das davor aufbewahren
  (ein beschädigtes Archiv ist sonst der Totalverlust).
- Das Archiv enthält Sitzplatz-Tokens (Reconnect) und geschwärzte
  Zugangsdaten. Rechte `600`, verschlüsselte Platte oder verschlüsselter
  Container; **nie** ins Repo, nie in einen geteilten Ordner.
- Ein Objektspeicher ist eine zulässige zweite Kopie (z. B. `rclone copy`), aber
  ebenfalls Betreiber-Entscheidung: Ziel, Anbieter, Preis und Aufbewahrung
  stehen nicht in diesem Repo. Wird das gebaut, bekommt es einen eigenen
  Auftrag; bis dahin gilt dieser Abschnitt.
- Nachweis: die `ls -l`- und `sha256sum -c`-Ausgabe in Beleg 6. Ohne diesen
  Beleg wird nicht gelöscht (Abschnitt 6, Schritt 4).

---

## 8. Z246 (e) — Preis des Abbilds je GB und Monat

Ein Hetzner-Abbild kostet **Speicherplatz**, solange es existiert — zusätzlich
zum Serverpreis. Der Preis je GB und Monat steht auf der Preisseite des
Anbieters und wird **vor** dem ersten Abbild eingetragen; er ist
**PFLICHT-15**. Kein Wert in diesem Repo ist ein Preis: Zahlen werden nicht
geschätzt und nicht erfunden (AGENTS.md §7).

Rechnung, die in PFLICHT-06 gehört, sobald Abbilder aufbewahrt werden:

```
Bildkosten je Monat = Abbildgröße in GB × Preis je GB und Monat
Worst Case          = (Preis/h × Höchstdauer) + Bildkosten für die Aufbewahrungsdauer
```

Die Abbildgröße steht nach Schritt 3 in Abschnitt 6 in der Konsole (bzw.
`hcloud image list -o columns=disk_size`). Sie hängt von der Platte ab, nicht
von diesem Repo. Beispiel für die Rechnung (Zahlen sind Platzhalter, **nicht**
gültig): `40 GB × LÜCKE €/GB/Monat = LÜCKE €/Monat`.

Wird kein Abbild aufbewahrt (`PA_SNAPSHOT_CLOUD=no` und Weg A nicht genutzt),
entfällt die Position — dann muss das ausdrücklich so entschieden und in
PFLICHT-11 vermerkt werden. Das Archiv allein kostet keinen zusätzlichen
Speicher beim Anbieter, überlebt aber das Löschen nicht (Abschnitt 7).

---

## 9. PERSIST-1 — Persistenz: eine JSON-Datei, keine Sperre

**Befund (bewusst offen, Stand 2026-11-09).** Der Server speichert Lobbys und
laufende Partien in **einer** Datei `PA_STATE_PATH`
(Vorgabe `/var/lib/projectarmageddon/lobbies.json`, Code:
`src/server/persistence.js`). Geschrieben wird atomar (temporäre Datei +
`rename`), damit ein Absturz keine halbe Datei hinterlässt. Es gibt **keine
Sperre** und keine Instanz-Erkennung: Zwei Serverprozesse auf derselben Datei
überschreiben sich still — der letzte Schreiber gewinnt, ohne Fehlermeldung.

**Folge.** Genau **ein** Serverprozess darf auf ein `PA_STATE_PATH` zeigen. Ein
zweiter Knoten oder ein zweiter Prozess auf demselben Zustand verliert Lobbys
und laufende Partien. Das ist keine Fehlfunktion, sondern eine bekannte Grenze;
sie wird erst mit einer zweiten Instanz zum Problem (deshalb steht PERSIST-1
als „offen, bewusst" im Register).

**Betreiber-Regeln:**

- Vor dem Start prüfen, dass Port und Dienst nicht schon belegt sind:
  ```bash
  systemctl is-active projectarmageddon.service   # muss inactive sein
  ss -ltnp | grep ':3000'                         # darf nichts zeigen
  ```
- Zwei Knoten bekommen **verschiedene** `PA_STATE_PATH`-Dateien. Ein geteiltes
  Verzeichnis (NFS o. Ä.) ist unzulässig, solange es keine Sperre gibt.
- Vor einem Neustart den Dienst geordnet stoppen (SIGTERM sichert), nicht zwei
  Prozesse überlappen lassen.
- Der Test `tests/betrieb-vorlage.test.js` hält das Verhalten fest: zwei
  `PersistenceStore` auf derselben Datei überschreiben sich ohne Fehler. Wird
  je eine Sperre eingebaut, wird dieser Test rot — dann muss auch dieser
  Abschnitt geändert werden.

**Nicht Teil dieses Auftrags:** Sperre, Datenbank, geteilter Zustand. Das wäre
ein eigener Auftrag mit eigener Abnahme (Mehr-Instanz-Betrieb).

## 10. On-Demand-Betrieb auf Hetzner (Freigabe 2026-11-10)

Freigabe des Auftraggebers vom 2026-11-10: Der Spielserver wird bei Bedarf gemietet, nach 15 Minuten ohne Verbindung legt er ein Abbild (Snapshot) von sich an, prüft es und löscht sich selbst. Die Schutzvorkehrungen aus §5 bleiben unverändert: ohne geprüftes Abbild wird nie gelöscht (Fail-Safe: poweroff plus laute Meldung, da Hetzner auch ausgeschaltete Server berechnet); das Token liegt nur unter /run/projectarmageddon/hcloud-token (tmpfs), nie in Dateien, Logs, Abbildern oder Commits.

Ablauf: `scripts/betrieb/server-hochfahren.sh hochfahren|status|not-aus` (oder Workflow `server-hochfahren.yml`), Selbstabbau durch `selbst-abbild-loeschen.sh` (idle-watch, PA_ACTION=abbild-loeschen). Dauerhaft bleiben nur das neueste Abbild und eine reservierte Primary IP (auto_delete=false).

Typ: cx23/cx33 waren am 2026-11-10 nicht verfügbar, gewählt wurde cpx22 in fsn1 (0,037128 EUR/h laut API). Ein Abbild bindet die Plattengröße (80-GB-Abbild passt nicht auf 40-GB-Typen).

Belege (echter Lauf gegen Hetzner, 2026-11-10, Mock-Tests getrennt in tests/betrieb-abruf.test.js):
- Frischinstallation, https, Leerlauf, geprüftes Abbild, Selbstlöschung: bestätigt.
- Wiederherstellung aus Abbild: BEREIT nach ca. 4 min, smoke --aussen bestanden (Version 0.9.0), Konto e2e-abruf aus dem Vorlauf meldete sich an (Zustand überlebt).
- Zweite Leerlauf-Abschaltung: Endstand per API: Server 0, Volumes 0, Abbilder 1 (454628717, 2,11 GB, neuestes, Vorgänger gelöscht), Primary IP 1 (49.13.138.200, auto_delete=false).

iPhone-Klickfolge: GitHub-App/Browser, Repo, Settings, Secrets and variables, Actions, New repository secret `HCLOUD_TOKEN` (Wert selbst eintragen), optional Variable `PA_DOMAIN`; dann Actions, "server-hochfahren", Run workflow, Modus `hochfahren`.

Offene Punkte: Web-Zugang www (Option D, docs/zugang-www.md) ist gebaut und Mock-getestet, aber nicht auf Netlify ausgeführt; Token liegt während der Laufzeit im Server-RAM; Abbild-Dauer wächst mit Datenmenge.
