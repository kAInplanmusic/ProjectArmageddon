# Befehlsblatt: Abschaltprobe auf dem Knoten (Z246) und Rendermessung auf echter Hardware (Z579)

**Stand:** 2026-10-29 · **Status:** vorbereitet, **nichts ausgeführt**, nichts gemietet.

Beide Punkte kann ein Agent nicht erledigen: Z246 braucht einen gemieteten Knoten,
und nach `AGENTS.md` §5 und §7 mietet, erstellt oder startet ein Agent nie selbst
kostenpflichtige Ressourcen. Z579 braucht eine echte Grafikkarte. Dieses Blatt
macht beides zu einer Abfolge von Befehlen mit Erwartung und Nachweisfeld. Wer sie
ausführt, trägt die Ausgabe ein; erfunden wird nichts.

---

## A. Z246 — erste Probe der Abschaltsicherung auf dem Knoten

### A0. Vor der Miete (Auftraggeber, `AGENTS.md` §5 und §7)

Ohne diese Einträge in `docs/betrieb-INSTANZ.md` wird nicht gestartet:

| Pflicht | Wo | Stand |
|---|---|---|
| Name, Zweck, Instanztyp, Besitzer | Abschnitt 1 | **LÜCKE**, Auftraggeber |
| Preis pro Stunde (aus dem Angebot, nicht geschätzt) | Abschnitt 1 | **LÜCKE** |
| Höchstdauer und Worst Case = Preis/h × Höchstdauer | Abschnitt 2 | **LÜCKE** |
| Zweite, unabhängige Frist **außerhalb** des Knotens | Abschnitt 2 | **LÜCKE** (z. B. Termin beim Anbieter oder Erinnerung auf deinem Rechner) |
| Preis des Abbilds je GB und Monat (offener Punkt (e)) | Abschnitt 2 | **LÜCKE** |

Nur zur Orientierung, ohne Preise zu nennen: Ein Hetzner-Server wird auch
ausgeschaltet weiter abgerechnet, bis er **gelöscht** ist (`docs/betrieb.md` §8).
Die Probe darf deshalb nicht mit „herunterfahren" enden, sondern muss mit
„Abbild geprüft, Server gelöscht" enden — sonst läuft die Rechnung weiter.

### A1. Trockenlauf (kostet nichts, schreibt nichts)

Auf dem Knoten, im Repo-Ordner:

```bash
sudo scripts/betrieb/snapshot.sh --trocken --grund "Probe"
```

Erwartung: Ausgabe nennt Archivinhalt, Ablageordner und welche alten Archive
gelöscht würden. Danach darf **nichts** Neues im Ablageordner liegen.

### A2. Einrichtung ohne Abbild

```bash
sudo scripts/betrieb/snapshot-einrichten.sh --cloud
```

Erwartung: schreibt `betrieb.env` (Rechte 600), prüft das Token per Leseabfrage,
meldet am Ende „Fertig. Noch nichts erzeugt." Das Token liegt nur in `/run`
(`scripts/betrieb/token-setzen.sh`), nie auf der Platte.

### A3. Gesamtabnahme mit Belegen

```bash
sudo scripts/betrieb/abnahme-knoten.sh --ergebnis /var/tmp/pa-abnahme
```

Prüft in einem Lauf: Tests auf dem Knoten, Dienst unter systemd,
`/healthz`, Idle-Timer, ein Online-Match mit zwei Spielern, Snapshot-Aufbewahrung
(viermal ausgelöst, drei bleiben) und ein Snapshot beim **Stoppen** des Dienstes.
Ergebnis: `/var/tmp/pa-abnahme/zusammenfassung.json` und je Schritt ein `NN-name.log`.
Exit 0 nur, wenn alle bestehen. Mit `--ohne-tests` entfallen die rund fünf Minuten
für `npm test`.

### A4. Die zwei Belege, die `AGENTS.md` §5 verlangt

```bash
systemctl list-timers | grep projectarmageddon
sudo systemctl stop projectarmageddon
journalctl -u projectarmageddon -n 30 --no-pager | grep -i snapshot
```

Erwartung: Timer `projectarmageddon-idle.timer` ist aufgeführt; beim Stoppen steht
eine Journalzeile, dass ein Snapshot entstanden ist, samt Prüfsumme.

### A5. Abschluss (erst nach geprüftem Abbild)

Vom **eigenen Rechner** aus, nicht vom Server (das Token soll nie auf den Server):

```bash
scripts/betrieb/abbild-lokal.sh --server NAME --trocken                    # nur anzeigen
scripts/betrieb/abbild-lokal.sh --server NAME --ausschalten                # Abbild, alte löschen (3 bleiben)
scripts/betrieb/abbild-lokal.sh --server NAME --ausschalten --loeschen --ja-wirklich   # löscht den Server erst NACH geprüftem Abbild
```

Rückweg: `scripts/betrieb/server-aus-abbild.sh`.

### A6. Nachweisfelder (ausfüllen, nicht schätzen)

| Beleg | Ausgabe / Datum | Von wem |
|---|---|---|
| `systemctl list-timers` | | |
| Journalzeile beim Stoppen | | |
| `zusammenfassung.json` (Anzahl bestanden) | | |
| Abbild geprüft, Server gelöscht (Zeitpunkt) | | |
| Tatsächliche Laufzeit und Kosten | | |

Der Eintrag in `docs/betrieb-INSTANZ.md` Abschnitt 3 bekommt die Ausgabe von
`systemctl list-timers` wörtlich.

### A7. Was die Probe nicht belegt (ehrlich)

- Das Archiv auf demselben Server überlebt dessen Löschen nicht; eine Kopie nach
  außen ist nicht gebaut (Punkt (d)). Das Hetzner-Abbild ist die eigentliche
  Sicherung.
- Auf dem Server ist das Token im Arbeitsspeicher für root auslesbar, im
  Plattenabbild aber nicht.

---

## B. Z579 — Rendern auf echter Hardware messen

**Ausgangslage:** In der Sandbox rastert ein Frame in Software (50–83 ms; nur etwa
4 % davon JavaScript, 96 % native Rasterarbeit). Das sagt über echte Geräte wenig.
Auf einer Intel HD 3000 über ANGLE wurde früher 13,6 ms je Million Pixel gemessen
(`docs/testgrenzen.md`). Für eine belastbare Zahl braucht es **Zielhardware**:
welche, ist nicht festgelegt (Zielplattformen sind offen) und wird hier nicht
erfunden.

### B1. Das Gerät festhalten

```bash
node -e "console.log(process.version, process.platform, process.arch)"
```

Im Browser `chrome://gpu` öffnen und die Zeilen „GL_RENDERER" und
„Graphics Feature Status" notieren. **Steht dort SwiftShader, ist es keine
echte Grafikkarte** und die Zahl gilt nicht.

### B2. Messung am echten Bildtakt

```bash
npm ci
npm run perf:browser -- --frames=600 --json > messung-gpu.json
```

### B3. Dasselbe als Playwright-Test mit Bericht

```bash
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/profiling.spec.mjs --workers=1
```

Der Test startet Chrome mit `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist`
und **misst und berichtet**; er wird bei einer langsamen Maschine nicht rot.
Geprüft wird der Aufwand je Million Pixel (Grenze 30 ms), nicht ein fester
fps-Wert, weil die Karte 2560×1440 groß ist.

### B4. Nachweisfelder

| Feld | Wert |
|---|---|
| Gerät (CPU, GPU, Anzeige) | |
| `GL_RENDERER` aus `chrome://gpu` | |
| p50, p95, p99 der Bilddauer (ms) | |
| ms je Million Pixel | |
| Terrain-Backen beim Kartenaufbau (ms) | |
| Auflösung und Skalierung | |

Ergebnis bitte in `docs/testgrenzen.md` (Abschnitt 1) und beim Punkt Z579 in
`docs/offene-punkte.md` §6 eintragen. Liegt die Zahl über dem Budget, ist das
ein Befund und kein Messfehler: dann erst Ursache klären, dann optimieren
(`MASTERDOTO.md`, „Performance-Messung 2026-10-26").
