# Befehlsblatt: Abschaltprobe auf dem Knoten (Z246) und Rendermessung auf echter Hardware (Z579)

**Stand:** 2026-11-11 · **Status:** Z246 vorbereitet, **nichts ausgeführt**, nichts gemietet.
Z579: Die Messseite ist gebaut und in Software-Rasterung durchgelaufen; **die Messung auf
dem iPhone und auf dem Asus-Laptop steht aus** (Abschnitt B).

Beide Punkte kann ein Agent nicht erledigen: Z246 braucht einen gemieteten Knoten,
und nach `AGENTS.md` §5 und §7 mietet, erstellt oder startet ein Agent nie selbst
kostenpflichtige Ressourcen. Z579 braucht eine echte Grafikkarte. Dieses Blatt
macht beides zu einer Abfolge von Schritten mit Erwartung und Nachweisfeld. Wer sie
ausführt, trägt die Ausgabe ein; erfunden wird nichts.

---

## A. Z246 — erste Probe der Abschaltsicherung auf dem Knoten

### A0. Vor der Miete (Auftraggeber, `AGENTS.md` §5 und §7)

Ohne diese Einträge in `docs/betrieb-INSTANZ.md` wird nicht gestartet:

| Pflicht | Wo | Stand |
|---|---|---|
| Name, Zweck, Instanztyp, Besitzer (`PFLICHT-01`–`05`) | Abschnitt 1 | **LÜCKE**, Auftraggeber |
| Preis pro Stunde (aus dem Angebot, nicht geschätzt, `PFLICHT-04`) | Abschnitt 1 | **LÜCKE** |
| Höchstdauer und Worst Case = Preis/h × Höchstdauer (`PFLICHT-06`) | Abschnitt 1 | **LÜCKE** |
| Zweite, unabhängige Frist **außerhalb** des Knotens (`PFLICHT-13`) | Abschnitt 1 | **LÜCKE** (z. B. Termin beim Anbieter oder Erinnerung auf deinem Rechner) |
| Preis des Abbilds je GB und Monat, offener Punkt (e) (`PFLICHT-15`) | Abschnitt 1 + 8 | **LÜCKE** |

Prüfbar: `node scripts/betrieb/pflichtfelder.mjs` (Rückgabe 3 = noch offen).

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

**Ausgangslage:** In der Sandbox rastert ein Frame in Software (50–83 ms bei 2560×1440, auf
den großen Karten über 100 ms; nur etwa 4 % davon JavaScript, 96 % native Rasterarbeit). Das
sagt über echte Geräte wenig. Auf einer Intel HD 3000 über ANGLE wurde früher 13,6 ms je
Million Pixel gemessen (`docs/testgrenzen.md`). Für eine belastbare Zahl braucht es
**Zielhardware**. Entscheidung des Auftraggebers (2026-11-11): zuerst das **iPhone**, danach der
**Asus-Laptop**. Eine Kommandozeile ist dafür nicht nötig.

### B1. Die Messseite

Eine eigenständige Seite, die ohne Server feste Szenen rendert und misst:

> **https://www.projectarmageddon.de/messung.html** (nach dem nächsten Deploy; lokal `npm run dev`, dann `/messung.html`)

Im Repo: `messung.html`, Module in `src/client/messung/`, Test `tests/e2e/messung.spec.mjs`.
Sie ist ein eigener Einstieg im Build (`vite.config.mjs`), liegt also **nicht** im Spiel-Bündel, und
sie braucht weder Anmeldung noch Spielserver.

**Was gemessen wird** (alles mit festem Seed 20260916, jede Szene in einem frischen Frame):

| Szene | Karte | Biom |
|---|---|---|
| 1, 2 | 16:9 mittel, 2560×1440 | klassisch; Tiefsee |
| 3 bis 6 | 24:9 groß, 4704×1764 | klassisch; Tiefsee; Fantasywald; Schlackeschmiede |
| 7 | 24:9 riesig, 6272×2352 | Tiefsee (steht zuletzt: die schwerste, sie kann auf dem iPhone den Speicher sprengen) |

Je Szene sechs Phasen mit je höchstens 90 Bildern oder 2,2 s: ruhig (Spielkamera); Schüsse,
Explosionen und Partikel; Wasserfeld; Kamerafahrt in drei Zoomstufen (ganze Karte, 2,5×, 4×).
Dazu je Szene: Ladezeit, Match-Aufbau, Terrain-Neuaufbau, Grading-Aufbau (Neuaufbau mit minus ohne
Biom-Grading), JavaScript-Speicher (nur Chromium), Geräteinfo (Browser, Pixeldichte, Auflösung,
WebGL-Renderer, soweit der Browser ihn freigibt) und der **Bildtakt ohne Spiel** (60 Hz, 120 Hz oder
30 Hz im Stromsparmodus). Bildzeiten: Mittel, p50, p95, p99, max, fps. Die Gesamtdauer ist bei
175 s gedeckelt: Was dann noch nicht gelaufen ist, steht als „übersprungen“ im Ergebnis.

### B2. Schritt für Schritt: iPhone

1. iPhone **quer** halten (Querformat; im Hochformat erscheint nur der Dreh-Hinweis).
2. **Stromsparmodus aus** (Einstellungen → Batterie). Er halbiert die Bildrate und verfälscht alles.
3. Einstellungen → Anzeige & Helligkeit → Automatische Sperre → **Nie** (nach der Messung zurückstellen).
   Die Seite versucht zusätzlich selbst, den Bildschirm wachzuhalten; darauf nicht verlassen.
4. Andere Apps und Safari-Tabs schließen. Am besten am Ladekabel, Gerät nicht heiß.
5. In **Safari** die Adresse oben öffnen und **„Messung starten“** tippen. Danach **nichts mehr
   antippen**: Das Spiel läuft nacheinander sieben Szenen durch (bis zu 3 Minuten). Oben steht
   „Szene 3/7 …“.
6. Am Ende erscheint das Ergebnis als Tabelle. Tippe **„Teilen …“** und wähle die Nachrichten-App
   (sie schickt eine kleine Datei), oder **„Ergebnis kopieren“** und füge den Text in die Nachricht ein.
7. Wurde die Seite mitten in einer Szene beendet (iOS tut das bei Speichermangel), einfach
   `messung.html` **neu öffnen**: Die Seite zeigt die bis dahin fertigen Szenen und die Szene, bei
   der es endete. **Das ist selbst ein Messergebnis** und wird genauso geteilt.

### B3. Schritt für Schritt: Asus-Laptop

1. **Chrome** (oder Edge) nehmen, Seite im Vollbild (F11); Laptop **am Netzteil**, Energiesparmodus aus.
2. **Wichtig für die Aussagekraft:** Chrome → Einstellungen → System → „Grafikbeschleunigung verwenden,
   wenn verfügbar“ **an**. Vor der Messung die Adresse `chrome://gpu` öffnen: Steht bei „GL_RENDERER“
   SwiftShader (oder „Software only“), ist es **keine echte Grafikkarte**; das steht auch im
   Ergebnis unter „Software-Rasterung“.
3. `messung.html` öffnen, **„Messung starten“** klicken, Maus und Tastatur in Ruhe lassen.
4. Ergebnis mit **„Ergebnis kopieren“** oder **„Als Datei sichern“** (landet in „Downloads“) weitergeben.

### B4. Das Ergebnis lesen

Die Tabelle „Aufbau je Szene“ nennt Laden, Match-Aufbau, Terrain-Neuaufbau und Grading in Sekunden;
„Bildzeiten je Phase“ nennt Mittel, p95 und max in ms und die fps. Maßstab (aus
`tests/e2e/profiling.spec.mjs`): Bezugswert der echten GPU 12,7 ms je Million Pixel (Intel HD
3000), Software-Rasterung 48,2 ms. Der Messplan liefert die Fläche je Szene mit (`karte.pixelMio`).
Das Grading kann bei Rauschen leicht negativ ausfallen (Differenz zweier Messungen).

Das JSON hat das Schema `pa-messung/1` (Prüfung: `pruefeErgebnis` in `src/client/messung/ergebnis.js`):
`geraet`, `leertakt`, `szenen[]` mit `karte`, `ladezeitMs`, `matchAufbauMs`, `terrainNeuaufbau`,
`gradingAufbauMs`, `speicher`, `phasen[]` (`bilder`, `mittel`, `p50`, `p95`, `p99`, `max`, `ueber16`,
`ueber33`, `fps`, `zoom`), `gesamt`.

### B5. Grenzen der Messung (ehrlich)

- Die **Explosionen** der Phase „Schüsse“ sind zum Teil gespielte Einschläge ohne Motorwirkung: ein
  echter Schuss fällt je Zug nur einmal, deshalb ruft die Seite zusätzlich den Anzeigeweg des
  Ereignisses `explosion` auf (Krater, Splitter, Blitz, Sheet). Die Kollisionsmaske des Matches bleibt
  unberührt. Gemessen wird die Zeichenkosten, nicht die Motorlast.
- Das **Wasserfeld** wird über `setWaterLevelAt` gesetzt (wie `water-hud.spec.mjs`), nicht gespielt.
- Auf **iPhone/Safari** gibt es keinen JavaScript-Speicherwert und meist nur einen allgemeinen
  WebGL-Namen („Apple GPU“); beides steht dann als leer bzw. „Browser nennt nur Allgemeines“ im Ergebnis.
- Die Grafikstufe (Lite/Ultra) bleibt auf „Automatisch“, wie ein Spieler sie hätte; sie steht je Szene
  im Ergebnis (`grafik`).
- Die Seite bettet das Spiel per `srcdoc` ein, weil die Auslieferung `X-Frame-Options: DENY` setzt
  (`netlify.toml`); dieser Schutz bleibt unverändert.
- Die Software-Rasterung in der Testumgebung (`?plan=test`: dieselben Szenen mit je 8 Bildern) belegt nur,
  dass die Seite durchläuft und das JSON dem Schema entspricht. **Sie sagt nichts über echte Geräte.**

### B6. Dasselbe per Kommandozeile (nur für Entwickler)

```bash
npm ci
npm run perf:browser -- --frames=600 --json > messung-gpu.json
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/profiling.spec.mjs --workers=1
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/messung.spec.mjs   # Messseite, Testplan
```

Der Profiling-Test startet Chrome mit `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist` und
**misst und berichtet**; er wird bei einer langsamen Maschine nicht rot. Geprüft wird der Aufwand je
Million Pixel (Grenze 30 ms), nicht ein fester fps-Wert. Beide Wege rechnen mit derselben
Statistik (`src/client/messung/statistik.js`).

### B7. Nachweisfelder

| Feld | Wert |
|---|---|
| Gerät (CPU, GPU, Anzeige) | |
| iPhone: Modell, iOS-Version, Querformat, Stromsparmodus aus | |
| Asus-Laptop: Modell, Grafik (`chrome://gpu`, `GL_RENDERER`) | |
| Bildtakt ohne Spiel (Hz) | |
| p50, p95, max der Bilddauer je Szene (ms) | |
| ms je Million Pixel (Mittel der Phase „ruhig“ geteilt durch `karte.pixelMio`) | |
| Terrain-Neuaufbau je Szene (ms), Grading (ms) | |
| Bei Abbruch: bei welcher Szene endete die Seite | |

Ergebnis bitte in `docs/testgrenzen.md` (Abschnitt 1) und beim Punkt Z579 in `docs/TODO.md`
(P5) eintragen. Liegt die Zahl über dem Budget, ist das ein Befund und kein Messfehler: dann erst
Ursache klären, dann optimieren (`MASTERDOTO.md`, „Performance-Messung 2026-10-26“).
