# ProjectArmageddon

Rundenbasiertes 2D-Artillerie-Taktikspiel für den Browser im Geiste von Worms und Frontschweine. Das Gameplay läuft strikt in 2D, während die Präsentation optional einen 2.5D-Look nutzen darf. Das Projekt setzt auf vollständig zerstörbares Terrain, harte Determinismus-Regeln für Multiplayer und ein datenorientiertes ECS für hohe Performance im Web.

## Schnellstart

```bash
npm install
npm run dev          # Spiel lokal im Browser: http://127.0.0.1:5173
```

Lokales Match: Teams und Karte im Menü wählen, "Match starten".

### Online-Multiplayer

```bash
npm run server       # Autoritativer Server auf http://127.0.0.1:3000
```

Danach im Menü unter **Server** `http://127.0.0.1:3000` eintragen und starten. Der erste Client erstellt die Lobby, weitere Spieler geben die angezeigte **Lobby-ID** ein und treten bei. Nicht besetzte Plätze übernimmt die Bot-KI.

### Produktion (Single-Origin)

```bash
npm run build        # baut dist/
npm run server       # liefert dist/ UND /ws unter derselben Herkunft
```

## Kulissen

Sechzig KI-erzeugte Hintergrundbilder aus zwölf Biomen mit je fünf Varianten.
Die Kulisse liegt hinter dem prozeduralen Gelände und bestimmt dessen Bodenfarbe.

| Biom | Varianten |
|---|---|
| Maritim & Meer | Ruhige See, Sturm bei Nacht, Polarmeer, Kriegshafen, asiatische Karstküste |
| Südsee & Karibik | Karibischer Tag, Sonnenuntergang, Vulkanausbruch, Taifun, polynesische Nacht |
| Gebirge & Alpin | Alpensommer, Hochwinter, Himalaya-Kloster, Kriegsruinen, Mondnacht |
| Wald & Wiese | Sommerwiese, Herbstwald, Winterwald, Nebelnacht, verzauberte Lichtung |
| Stadt & Industrie | Moderne Stadt, Neonnacht, Industrieruine, Kriegsstadt, Monsunstadt |
| Universum | Nebel, Ringplanet, Raumstation, Schwarzes Loch, fremde Welt |
| Abstrakt | Geometrisch, psychedelisch, Vaporwave, Fraktal, surreal |
| Höhlenwelten | Tropfstein, Kristall, Lavaröhre, Eishöhle, Unterwasserhöhle |
| Fantasy | Elfenstadt, Drachenberg, Belagerung, dunkler Sumpf, Kristallmagie |
| Hyperrealismus | Goldenes Tal, Wüste, Polstation, Dschungelfluss, Steilküste |
| Cowboy & Western | Wüstenstadt, Duell im Sonnenuntergang, Lagerfeuer, Wintergrenze, Prärie |
| Film Noir | Regennasse Straße, Hafenkai, verrauchte Bar, Verfolgung, Dachsilhouette |

**Auswahl:** Im Menü unter „Kulisse" (nach Biom gruppiert). „automatisch" überlässt
die Wahl dem Seed — damit bleibt ein Match reproduzierbar, und ein Replay zeigt
dieselbe Landschaft. Ohne Wahl bekommt jede Geländeform ihr Leitbiom (Inseln →
Maritim, Berge → Alpin, Hügel → Wald, Höhlen → Höhlenwelten).

**Bodenfarbe:** Jede Kulisse bringt ihre eigene Bodenfarbe mit. Vorher war der
Boden immer grün — über Packeis, Basalt und Sand gleichermaßen.

**Erzeugen:** Die Prompts stehen im Katalog (`src/shared/config/backdrops.js`) und
sind die einzige Quelle. Neue Bilder laufen über:
`python3 scripts/fetch-backdrops.py <manifest.json>` (Zuschnitt auf 1280×720,
JPEG, Ablage unter `src/client/assets/backdrops/`).

## Fraktionen und Charaktere

Neun Fraktionen zu je neun Charakteren — **81 insgesamt**. Die Inhalte stehen in
`src/shared/config/factions.js`, die Bilder in `src/client/assets/characters/`.

| Datei | Zweck |
|---|---|
| `assets/fraktionen/team 1..9.png` | Quellbögen (3×3, Zeile = Klasse) |
| `scripts/extract_factions.py` | schneidet die 81 Figuren frei |
| `scripts/namen.py` | Positions- und Namensliste der Bögen |
| `src/shared/config/factions.js` | Katalog: Namen, Biografien, Waffen, Profile |
| `src/client/roster.js` | lädt die Bilder, ordnet sie dem Katalog zu |

```bash
python3 scripts/extract_factions.py      # 81 PNG neu erzeugen
```

Im Menü unter **„Kader ansehen"**: neun Reiter, je Fraktion die neun Charaktere
mit Bild, Kampfweise, Superwaffe, Biografie und Stärken/Schwächen.

**Aufbau der Bögen.** Die Zeile bestimmt die Kampfweise (Schwert = Nahkampf,
Bogen = Fernkampf, Stab = Magie), der Platz innerhalb der Zeile die Spielklasse
(0 = heavy, 1 = scout, 2 = artillery). Die Dateien heißen `<zeile><spalte>_<name>.png`.

**Freibstellung.** Der Hintergrund der Bögen ist ein *gemaltes* Schachbrett, kein
Alphakanal. Die Kanten zwischen den Feldern bilden ein ein bis zwei Pixel dünnes
Netz über die ganze Kachel; dadurch hingen Figur und Namenszeile als eine
Komponente zusammen. Verfahren: Hintergrund über **ganze Schachfelder** bestimmen
(so verschwindet das Netz mit), dann die größte Zusammenhangskomponente nehmen und
zusätzlich alles ab 4 % ihrer Fläche, was sich mit ihr überschneidet — das sind
schwebende Kugeln und Begleiter, nicht die Buchstaben des Namens. Ein dünner
Zellrahmen wird vorher weggeschnitten.

**Bekannter Inhaltsfehler.** Die Bögen 8 und 9 benennen je eine Figur
„Nullpointer Exception" (im Bild deutlich verschieden: vierbeiniges Plattenwesen
gegen schweren Rahmen mit Kanonenarm). Die Namen wurden unverändert übernommen —
ein Umbenennen wäre ein Eingriff in den Inhalt. Erfasst in `NAMING_CONFLICTS`,
geprüft durch einen Test.

## Günther

Ein frei laufender Kleinspitz. Er ist kein Gegner: Er gehört keinem Team, läuft
über die Karte, pinkelt Spieler an und hinterlässt Häufchen. Bei Berührung öffnet
sich ein Glücksrad.

| Was | Wirkung |
|---|---|
| **Anpinkeln** | Schaden, mit jedem weiteren Mal auf denselben Spieler geringer (9 → 0,72× je Treffer, Untergrenze 1) |
| **Häufchen** | Wer hineingerät: 3 Runden Schaden (4/Zug) und verlangsamte Bewegung (Faktor 0,55) |
| **Berührung** | Glücksrad mit fünf Ausgängen (siehe unten) |

Er erscheint im Mittel **zweimal pro Spiel** — die Zahl wird aber gewürfelt
(Poisson), nicht gesetzt: In etwa 15 % der Spiele kommt er gar nicht, in 18 %
dreimal. Je Auftritt bleibt er drei Runden und läuft auf den nächsten Spieler zu.

**Das Glücksrad** wird in der Simulation gedreht, nicht im Browser: Sonst könnten
zwei Clients verschiedene Ergebnisse zeigen. Die Anzeige dreht nur noch auf den
feststehenden Ausgang zu.

| Ausgang | Anteil | Wirkung |
|---|---|---|
| Du gehst mit Günther Gassi | 30 % | eine Runde aussetzen |
| Du fütterst Günther | 25 % | aussetzen + eine Waffe niederer Seltenheit |
| Du spielst mit Günther | 22 % | aussetzen, dafür +50 bis +100 Leben |
| Günther greift dich an | 18 % | 1–99 Schaden |
| **Günther wird Heimdall** | **5 %** | legendäre Waffe, Blitze, Gjallarhorn und Bifröst über dem Feld |

Die Berührung zählt nur beim **eigenen Laufen** — wer stillsteht, berührt nichts.
Nach einem Rad bleibt Günther vier Sekunden unbeteiligt, sonst ginge es dauernd auf.

## Steuerung

| Eingabe | Wirkung |
|---|---|
| Maus bewegen | Winkel zielen |
| Klick oder Leertaste | Schuss (Aufladen für mehr Kraft) |
| `A` / `D` | Winkel feinjustieren |
| `W` / `S` | Kraft ändern |
| `1`–`9` | Waffe wählen |
| `R` | Zurück zum Menü |

## Steuerung

| Taste | Wirkung |
|---|---|
| `Maus` | Zielen (Winkel und Kraft am Zeiger) |
| `A` / `D` | Winkel feinjustieren |
| `W` / `S` | Kraft erhöhen / senken |
| `1`-`9` | Waffe wählen (Nummern wie in der Liste) |
| `Q` | Aktive Waffe abwerfen |
| `Leertaste` | Springen (mit `A`/`D` seitlich; in der Luft Doppelsprung) |
| `Enter` | Feuern |

**Sprung:** Je Zug sind zwei Sprünge möglich — einer vom Boden, einer in der
Luft. Der Sprung beendet den Zug nicht, damit der Doppelsprung auslösbar bleibt.
Ein Sturz aus großer Höhe richtet Fallschaden an.

**Abwurf:** Der Vorrat fasst sechs abwerfbare Waffen. Ist er voll, wird eine
Waffenkiste nicht aufgenommen; stattdessen muss zuerst abgeworfen werden. Die
abgeworfene Waffe wird **geschleudert** (0,75 s Flugzeit, windbeeinflusst) und
landet als aufhebbare Kiste — nie im Wasser. Die verbleibende Munition reist mit.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server mit Hot Reload |
| `npm run build` | Production-Build nach `dist/` |
| `npm run preview` | Gebauten Client vorschauen |
| `npm run server` | Autoritativer HTTP/WebSocket-Server |
| `npm test` | Unit- und Integrationstests (364 Tests) |
| `npm run test:unit` | Nur PRNG/Seed/Loot (36 Tests) |
| `npm run test:e2e` | Browser-E2E: Laufzeit, Multiplayer, Lobby, Tastatur, Effekte (35 Tests) |
| `npm run test:all` | Tests und E2E hintereinander |
| `npm run lint` | ESLint (CI-Gate, bricht bei Fehlern ab) |
| `npm run smoke` | Headless-Match bis Spielende |
| `npm run perf` | Performance-Profil mit 60-Hz-Budget-Gate |
| `npm run balance` | Balance-Bericht über alle 150 Waffen |
| `npm run replay` | Replay aufzeichnen/abspielen (`record`, `play`, `info`) |
| `npm run icons` | Waffen-Icons erzeugen (Pillow, ohne ImageMagick) |
| `npm run validate` | Modulimporte prüfen |
| `npm run weapons:build` | Waffenkatalog aus der Designdatei generieren |

E2E-Browserwahl ist portabel: lokal wird der System-Chrome genutzt, auf CI das
Playwright-Chromium. Erzwingen mit `PLAYWRIGHT_CHANNEL=chrome|bundled`.

### Replay verwenden

```bash
# Ein Match aufzeichnen
npm run replay -- record --seed=20260910 --rounds=8 --out=artifacts/lauf.json

# Abspielen und die exakte Reproduzierbarkeit bestätigen
npm run replay -- play artifacts/lauf.json --verify
```

`--verify` vergleicht Status, Runde, Tickzahl und den Zustandshash gegen die
Aufzeichnung. Weicht etwas ab, endet der Befehl mit Exit-Code 1 — der Befehl ist
damit als Determinismusprüfung in Skripten nutzbar.

### Zustandsabfrage

`GET /healthz` liefert neben Status und Protokollversion auch Betriebszähler
(Verbindungen, Trennungen, gesendete Snapshots, angenommene und abgelehnte
Kommandos, Fehler, Lobby-Erstellungen, Uptime) sowie einen `healthy`-Schalter,
der verwaiste Sitzungen meldet:

```bash
curl -s http://127.0.0.1:3000/healthz | python3 -m json.tool
```

### Lobby-Browser

Im Menü unter „Offene Lobbys anzeigen“ lassen sich laufende Lobbys vom Server
auflisten. Voraussetzung ist eine eingetragene Server-URL — ohne sie wird lokal
gespielt. Die Liste wird beim Aufklappen und über den Knopf „Lobbys laden“
aktualisiert; ein Klick auf „Beitreten“ übernimmt nur die Lobby-ID ins Formular,
gestartet wird weiterhin über „Match starten“. Wiederbeitritts-Token werden
dabei nicht angezeigt.

### Balance messen

```bash
npm run balance                      # alle Waffen
npm run balance -- --tier=legendary  # nur eine Stufe
npm run balance -- --json            # maschinenlesbar
```

Gemessen wird ein Einzelschuss pro frischem Match auf gleicher Höhe. Waffen ohne
Wirkung sind überwiegend Utility- und Spezialwaffen, deren Effekt noch nicht
implementiert ist — die Ausgabe dient damit zugleich als TODO-Liste.

## Architektur

```text
index.html                  Browser-Shell mit HUD, Menü, Endscreen
vite.config.mjs             Build-/Dev-Konfiguration
playwright.config.mjs       E2E-Konfiguration
src/
  client/
    main.js                 Einstieg: lokaler + Online-Modus, Game-Loop, Debug-API
    renderer.js             Canvas-Rendering (Terrain, Wasser, Figuren, Vorschau)
    input.js                Maus-/Tastatureingabe
    hud.js                  DOM-HUD (Runde, Wind, Zugzeit, Listen, Protokoll)
    networkClient.js        WebSocket-Client, Interpolation, Reconnect
    terrainPreview.js       Terrain-Rekonstruktion aus dem Server-Seed
  engine/
    match.js                MatchController: verbindet alle Systeme
    headless.js             Rendering-freie Runtime
    events.js               gepufferter Event-Bus
    waterField.js           zelluläres Wasser
    inventory.js            Waffen und Munition
    ecs/                    World, ComponentStore (TypedArrays), EntityManager
    systems/                Turn, Damage, Projektile, Figuren, Maelstrom, Loot
    physics/                analytische Ballistik, CCD-Raycast
    terrain/                CollisionMask (Bitmasken), Loader, Canvas-Sync
  server/
    gameServer.js           autoritativer HTTP/WebSocket-Server
    lobby.js                Lobby- und Platzverwaltung
    lagCompensation.js      200-ms-Snapshot-Verlauf
    bot.js                  deterministische Bot-KI
  shared/
    config/                 Regel-Configs, Waffenkatalog (generiert)
    prng.js, seed.js        deterministischer Zufall
    protocol.js             portables Binärprotokoll (DataView)
    validation.js           serverseitige Input-Validierung
    terrainGen.js           seed-deterministische Kartengenerierung
tests/
  *.test.js                 Unit- und Integrationstests (node:test)
  e2e/                      Playwright-Tests (Browser + Multiplayer)
scripts/
  server.mjs                Serverstart
  smoke-match.mjs           Headless-Match
  verify-render.mjs         Pixel-Verifikation der Darstellung
```

## Determinismus

Alle Simulationszufälle stammen aus einem Match-Seed:

- **PRNG:** Mulberry32, 32-Bit-Integer-Arithmetik, in Node und Browser identisch.
- **Seed-Verteilung:** `MatchSeedManager` gibt jedem Subsystem (Loot, Terrain,
  Waffen, Effekte) einen eigenen Offset-Stream, damit Systeme nicht korrelieren.
- **Keine Wanduhrzeit im Simulationspfad:** Killfeed und Effekte nutzen
  Simulationsticks, kein `Date.now()`.
- **Snapshots:** `World.serialize()` enthält Entities, Komponenten, Signaturen
  und Turn-State und lässt sich vollständig wiederherstellen.

Damit ist ein Match aus `(seed, Eingabefolge)` reproduzierbar — im Browser-E2E
wird geprüft, dass gleiche Seeds identische Zustandshashes erzeugen.

## Waffenkatalog

150 Waffen, aufgebaut aus `project_armageddon_weapons_v1.json`. Der Katalog ist
**generiert** (`npm run weapons:build` → `src/shared/config/weapons.js`) und wird
nicht von Hand gepflegt.

| Eigenschaft | Stand |
|---|---|
| Anzeigename, interner Name, ID, Index | eindeutig, keine Platzhalter |
| Schussart | 76 Hitscan, 74 Projektil |
| Schaden | alle 150; die Herkunft ist je Waffe vermerkt (`damageSource`) |
| Flächenwirkung | 54 Waffen, 22 verschiedene Radien |
| Seltenheit | fünf Stufen (`powerTier`), nach Stärke abgeleitet |
| Schadensherkunft | 94 echte Designwerte, 48 aus der Kategorie abgeleitet, 4 ohne Schaden |
| Zünder | 18 Waffen mit 1-5 s, sichtbar als Countdown über dem Geschoss |
| Anflugart | Luftangriffe von oben, Artillerie von der Seite |
| Erreichbarkeit über Kisten | alle 150 |
| Icons | 150/150 verknüpft und im Browser geladen |

**Vier Gruppen in der Waffenauswahl** (`WEAPON_SUBCATEGORIES`): Nahkampf (21),
Schusswaffen (39), Elementar & Magie (50), Technik & Nutzen (40). Die Liste zeigt
nur die Waffen des Spielers, der am Zug ist, jeweils mit Munition. Die
angezeigten Nummern entsprechen den Zifferntasten.

**Wichtige Unterscheidung:** Die Quelldatei führt zwei Feldfamilien. Die
snake_case-Felder (`base_damage`, `blast_radius`, …) tragen die echten
Designdaten, die camelCase-Felder sind überwiegend 0-Platzhalter. Der Generator
bevorzugt je Feld den ersten positiven Wert und kennzeichnet einen
Ersatz-Schadenswert als `damageSource: "placeholder"`.

**Nicht differenziert** (bewusst so dokumentiert, nicht versteckt): `maxRange`
ist bei allen Waffen 600, `cooldown` bei allen 0. Spritesheets gibt es nicht, die
Darstellung ist prozedural; Bilder existieren nur als Waffen-Icons.

## Spezialeffekte

Neben Schaden und Flächenwirkung kennen die Waffen Wirkungen, die in
`src/engine/specials.js` beschrieben sind:

| Wirkung | Beispielwaffen | Verhalten |
|---|---|---|
| Heilung | Heil-Injektion, Engelssegen | Stellt Gesundheit wieder her, nie über das Maximum |
| Schild | Engelssegen, Wächterstatue | Fängt Schaden ab, bevor Gesundheit sinkt |
| Schadensbonus | Astraltrank, Reliktsplitter | Erhöht den eigenen Schaden für zwei Züge |
| Rüstung | Bunker, Tarnnetz | Reduziert eingehenden Schaden |
| Einfrieren | Frostwaffe, Schlafzauber | Das Ziel setzt einen Zug aus |
| Schaden über Zeit | Flammenwerfer, Giftwolke | Wirkt bei jedem Zugbeginn, für drei Züge |
| Munitionsnachschub | Munitionskiste, Versorgungscontainer | Füllt Ladungen auf, bis zur Kapazität |
| Bewegung | Jetpack, Teleport, Portalring | Versetzt die Figur auf festes Gelände |
| Heranziehen | Enterhaken | Zieht einen Gegner zum Schützen |

Selbstwirkende Waffen verschießen bewusst kein Geschoss: Sie lösen ihren Effekt
aus und beenden den Zug. Wirkungsdauern zählen in **Zügen**, nicht in Sekunden —
dadurch bleiben Replays unabhängig von der Zugzeit reproduzierbar. Der Zufall
für die Zufallswaffe stammt aus dem Match-Seed, nicht aus `Math.random()`.

Im HUD erscheinen laufende Zustände als Marken in der Spielerliste
(🛡 Schild, ❄ eingefroren, ☠ Schaden über Zeit, ↑ erhöhter Schaden).

## Multiplayer-Protokoll

- Steuernachrichten: JSON (selten, lesbar, versioniert).
- Snapshots: Binär, festes Layout, ~20 Hz (Simulation läuft mit 60 Hz).
- `DataView` statt Node-Buffer → dasselbe Modul läuft im Browser und auf dem Server.
- Server ist autoritativ: Clients senden Wünsche, der Server validiert
  Spielerberechtigung, Winkel, Kraft, Tick-Fenster und Waffen-Whitelist.
- Lag-Kompensation über einen 200-ms-Snapshot-Verlauf.
- Reconnect per Sitzungs-Token innerhalb eines Fensters von 30 s.

## Spielregeln

### Klassen

| Klasse | Drag | Masse | Kraft | Tempo | Leben |
|---|---|---|---|---|---|
| Scout | 0.9 | 0.8 | 0.7 | 1.2 | 0.8 |
| Heavy | 1.1 | 1.2 | 1.0 | 0.8 | 1.3 |
| Artillery | 0.8 | 0.9 | 1.3 | 0.7 | 0.9 |

Dazu drei Archetypen (Brawler, Artillerist, Okkultist) mit eigenen Prozent-Modifikatoren.

### Mahlstrom / Sudden Death

Ab Runde 15 zieht sich die sichere Zone zusammen: Terrain wird pro Runde um
32 px von außen abgetragen, außerhalb der Zone wirkt toxischer Regen
(15 % Max-HP pro Zug) und der Knockback aller Waffen steigt um 100 %.

### Schadensreihenfolge

Verbindlich: **erst Flat-, dann Prozent-Modifikatoren.**

### Loot

Kisten werden pro Rundenstart per Drohne abgeworfen (10 % keine, 85 % eine,
5 % zwei). Inhalte: 55 % Waffen, 30 % Heilung, 10 % leer, 5 % Sprengfalle.
Die Verteilung nutzt PRD, damit Fehlschläge die Chance auf bessere Folgedrops
erhöhen. Jeder Spieler führt zusätzlich eine Reservewaffe mit unbegrenzter
Munition, damit kein Match durch leere Magazine stehenbleibt.

## Terrain

- Zeichenbasiert: `#` oder `1` = solide, alles andere = Luft.
- Physik liegt in `Uint32Array`-Bitmasken (32 Pixel pro Wort).
- Krater werden über `punchCrater` in Bitmaske **und** Canvas-Ebene gestrichen —
  beide werden aus demselben Ereignisstrom geändert und können nicht divergieren.
- Vier Presets: Hügel, Berge, Inseln, Höhlen.

## Qualitätsregeln

- Gameplay und Physik bleiben 2D.
- Kein `Math.random()` im Simulationspfad.
- Keine Client-Autorität bei physikrelevanten Aktionen.
- Keine rotierte/skalierte Runtime-Maskenkollision ohne Prebakes.
- Keine unsynchronisierte Divergenz zwischen Canvas-Terrain und CollisionMask.
- Keine Number-Bloat-Progression im Match.

## Status

Spielbarer Kern mit lokalem und Online-Multiplayer, Bot-KI, Loot, Wasser,
Mahlstrom und zerstörbarem Terrain. Verifiziert durch 70 Unit-/Integrationstests,
12 Browser-E2E-Tests (inkl. zwei echte Clients in einer Lobby) und den
Production-Build.

Offene Arbeit und bewusst dokumentierte Grenzen stehen in
[`MASTERDOTO.md`](./MASTERDOTO.md) — dort ist vermerkt, was noch fehlt
(kein Audio, keine Client-Prädiktion, Zugzeit noch nicht serverseitig erzwungen,
Waffenwerte unbalanciert, keine Persistenz).
