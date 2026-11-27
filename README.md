# ProjectArmageddon

Ein rundenbasiertes Artillerie-Spiel für den Browser. Zwei oder mehr Teams stehen auf einer zerstörbaren Karte und
schießen abwechselnd aufeinander. Jeder Schuss reißt Gelände weg, und was weg ist, bleibt weg. Wind, Wasser,
Kisten, Minen und Fässer sorgen dafür, dass keine Runde wie die andere läuft. Gespielt wird am Handy, am Tablet oder
am Rechner, allein am Gerät oder online gegeneinander.

## Auf einen Blick

| | |
|---|---|
| **Spielart** | Rundenbasiert, 2D, ein Zug je Team, Zugzeit begrenzt |
| **Geräte** | Handy und iPad zuerst (Touch-Bedienung), Tastatur und Maus ebenso; nur Querformat |
| **Mehrspieler** | Am selben Gerät oder online über einen Server (Lobby-ID teilen, beitreten). Es gibt keine Computergegner: jedes Team spielt ein Mensch |
| **Welten** | 20 Biome, darunter Vulkan, Kristallhöhlen, Dschungel, Eiswüste, Korallenriff, Asteroidenfeld, Planet und Tiefsee. Manche ändern die Regeln: Strömung, geringe Schwerkraft, fließendes oder giftiges Wasser |
| **Karten** | Jede Karte entsteht aus einer Zahl (Seed): Inseln, Höhlen, Schluchten, Ruinen, runde Planeten. Fünf Größen, mehrere Formate |
| **Fraktionen** | 9 Fraktionen mit je 9 Figuren (81 Figuren) |
| **Waffen** | 150 Waffen. Jede Figur startet mit 5 festen Waffen ohne Munitionsgrenze, Seil und Gleitschirm und einer eigenen Spezialwaffe. 11 Waffen sind legendär, jede Fraktion hat eine. Weitere Waffen kommen aus Kisten |
| **Besonderes** | Elemente wirken aufeinander (Feuer, Eis, Gift, Lava, Wasser), aufstellbare Geschütze, ein Kartenportal, Günther und Cookie als Störenfriede, Mahlstrom zum Partieende |

## Spielen

```bash
npm install
npm run dev        # öffnet das Spiel unter http://127.0.0.1:5173
```

Auf dem Startbildschirm startet **Spielen** sofort eine Partie mit zufälliger Welt. **Anpassen** öffnet das Menü
(Teams, Karte, Biom, Fraktionen).

Online spielen: `npm run server` starten, im Menü unter **Server** `http://127.0.0.1:3000` eintragen. Der erste
Spieler erstellt die Lobby, die anderen treten mit der angezeigten Lobby-ID bei.

## Welche Datei enthält was

| Datei | Inhalt |
|---|---|
| `README.md` | Diese Übersicht |
| [`docs/TODO.md`](docs/TODO.md) | **Die einzige Aufgabenliste.** Alles Offene, jede Entscheidung des Auftraggebers, offene Branches, was als Nächstes wo zu bauen ist |
| [`docs/SSOT.md`](docs/SSOT.md) | **SSOT = „Single Source of Truth“, die eine maßgebliche Quelle.** Sagt für jedes Thema, welche Datei verbindlich ist, wenn zwei Stellen sich widersprechen |
| [`AGENTS.md`](AGENTS.md) | Arbeitsregeln für alle, die am Projekt arbeiten (auch KI-Agenten): Prüfen, Mergen, nichts mieten |
| [`docs/entwicklung.md`](docs/entwicklung.md) | Handbuch für Entwickler: alle Befehle, Steuerung im Detail, Architektur, Protokoll, Spielregeln, Waffenkatalog |
| [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) | Aufbau des Codes und Ablauf für Beiträge |
| [`CREDITS.md`](CREDITS.md) | Herkunft von Musik und anderem fremdem Material |
| `project_armageddon_weapon_index.csv` | Liste aller 150 Waffen |
| [`docs/biome-ssot.md`](docs/biome-ssot.md), `docs/biome/` | Beschreibung jedes Bioms (Materialien, Objekte, Gefahren) |
| [`docs/werbung/reddit-post.md`](docs/werbung/reddit-post.md) | Vorstellungstext für Reddit (englisch) |
| `docs/betrieb*.md`, `deploy/` | Betrieb eines Servers (wird nur auf Anweisung des Auftraggebers gemietet) |
| `docs/archiv/`, `ARCHIVED.md`, `MASTERDOTO.md` | Altbestand, nur zum Nachlesen; `MASTERDOTO.md` ist keine Liste mehr |
| `uploaded/` | Vom Auftraggeber hochgeladenes Material (Hintergründe, frühe Entwürfe) |

## Wichtig zu wissen

- **Es ist ein Entwicklungsstand**, kein fertiges Spiel. Die Balance ist gemessen, aber noch nicht mit Menschen
  getestet (siehe `docs/TODO.md`, Abschnitt 8).
- **Fortschritt liegt im Browser.** Profil, Erfolge und Statistik werden lokal gespeichert; im Profil gibt es
  „Fortschritt sichern“ und „Sicherung laden“.
- **Alte Aufzeichnungen bleiben abspielbar.** Jede Regeländerung bekommt eine Fassungsnummer; eine Partie spielt immer
  mit den Regeln, mit denen sie begonnen wurde.
- Eine Übersicht über die Wirkung jeder der 150 Waffen auf jedes Gelände steht in
  `docs/matrix-terrain-waffen-wirkung.md`.

## Stand der Prüfungen

<!-- testzahlen:start (erzeugt von scripts/check-docs.mjs --schreiben, nicht von Hand ändern) -->
- Unit/Integration (`npm test`): **2961 Tests**, 2958 grün, 1 übersprungen, **2 rot**; 319 Testdateien beim Lauf (2026-11-12, Stand `f85e81c`).
- Browser-E2E (`npx playwright test --list`): **397 Tests in 78 Spezifikationen** (Zählung 2026-11-12, Stand `f85e81c`; das ist eine Zählung, kein Lauf).
- Aktuelle Dateizahlen: `npm run check:docs` (zählt die getrackten Dateien). Erfassen: `npm run testlauf:erfassen`. Verlauf: `git log -p -- docs/testlauf.json`.
<!-- testzahlen:ende -->
