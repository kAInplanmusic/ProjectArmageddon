# Zerlegung: match.js in Module über eine Quelle

Stand: 2026-10-29 · Auftrag: `src/engine/match.js` künftig leichter änderbar machen,
**rein strukturell, Verhalten bitgleich** (Goldwerte, Zustandshash, Replays unverändert).

Muster wie bei `turret.js` (`docs/zerlegung-turret.md`) und `shooting.js`: Das Match baut eine
**Quelle** (schlichtes Objekt mit genau den gelesenen Werten und Rückfragen) und reicht sie an
Funktionen des neuen Moduls. Keine privaten Felder werden öffentlich; die öffentlichen Methoden des
Matches bleiben als Einzeiler bestehen.

## Zahlen

| Schritt | Modul | `match.js` vorher | nachher |
|---|---|---|---|
| 1 Kisten und Abwerfen | `src/engine/kistenWurf.js` | 3152 | 2937 |
| 2 Zielwirkungen, Bodenmaterial | `src/engine/zieleffekte.js` | 2937 | 2713 |
| 3 Oberfläche und Wasser | `src/engine/wasserOberflaeche.js` | 2713 | 2638 |
| 4 Kartenmaße (2026-11-05) | `src/engine/karte.js` | 2821 | 2718 |

Zeilenbudget (`tests/match-zeilenbudget.test.js`, `tests/shooting.test.js`,
`tests/zeilenbudget.test.js`, `AGENTS.md`): von 3200 auf **2790** gesenkt (2638 + rund 150 Luft).

## Schnittstellen

- `kistenWurf.js`: `wirfWaffe(q, playerId, weaponId)`, `rolleWurf(q)`, `schrittKiste(q, id)`,
  `schrittFliegendeKisten(q)`. Quelle `#kistenQuelle()`: `status`, `activePlayerId`, `isPlayerAlive`,
  `width`, `world`, `inventory`, `getWeapon`, `rng`, `events`, `cooldownLoeschen`, `surfaceYAt`,
  `waterLevelAt`. Die Reihenfolge der Zufallszüge (Richtung, Zieldistanz, Höhe) steht im
  Modulkopf und in `tests/match-zerlegung.test.js`. `match.dropWeapon(...)` bleibt Delegator.
- `zieleffekte.js`: `wendeZielwirkungAn(q, effect, targetId, attackerId, weapon)`, `zieheZu`,
  `stosseWeg`, `verschiebe`, `wendeBodenmaterialAn(q)`. Quelle `#wirkungsQuelle()`: `players`,
  `isPlayerAlive`, `mali`, `statuses`, `events`, `world`, `width`, `surfaceYAt`, `isSolid`,
  `waterLevelAt`, `floodArea`, `bewegung`, `materialAt`, `isGrounded`. `#applyTargetEffect` bleibt
  als Einzeiler (vier Aufrufer im Match, eine Stelle in der Schussquelle).
- `wasserOberflaeche.js`: Klasse `OberflaechenCache` (Spalten-Merker, hält seinen Zustand selbst),
  `wasserstandAn`, `setzeWasserstandAn`, `flutBereich`. Quelle `#wasserQuelle()` (einmal gebaut,
  Werte per Getter): `water`, `width`, `height`, `skala`, `waterLevelAt`, `setWaterLevelAt`.
  `surfaceYAt`, `waterLevelAt`, `setWaterLevelAt`, `floodArea` bleiben öffentlich im Match.

## ZERLEG-1: `#buildTerrain()` und `#spawnPlayers()` (geprüft 2026-11-02)

Beide sind bereits Delegatoren nach demselben Muster und waren es vor dieser Zerlegung (W1-4c/4d, belegt
in `tests/zerlegung-aufbau.test.js`: kein `this`, reine Delegatoren, ein Rückgabepfad):

- `#buildTerrain()` ruft `baueTerrain(quelle)` aus `src/engine/terrainBuilder.js` (reine Funktion,
  liest nur ihr Argument; drei Generatoren, ein Rückgabepfad). Im Match bleibt nur, was private Felder
  setzt: Kollisionsmaske aus der Bitmap (Produktivpfad der Kollision), `MaliRegeln`, `Zerstoerung`,
  Feuer. Diese Verdrahtung auszulagern hieße, die Felder über eine Rückgabe zurückzuschreiben;
  gemessen spart das rund 20 Zeilen bei einer Quelle von ähnlicher Länge, deshalb nicht gemacht.
- `#spawnPlayers()` ruft `erzeugeSpieler(#spawnQuelle())` aus `src/engine/spawnManager.js` und hängt
  die Einträge an Spielerliste und Zugfolge (drei Zeilen).

`match.js` hat am 2026-11-02 **2689** Zeilen (2638 nach Schritt 3, seitdem Minen, Fässer und
Abwurf hinzu, −11 durch N-19). Das Zeilenbudget bleibt **2790**: Zeilenzahl + 5 % wären 2823, also
eine Lockerung; das Budget wird nur verschärft.

## Schritt 4: Kartenmaße in `karte.js` (2026-11-05)

Reine Verschiebung, keine Formel, kein Faktor und kein Maß geändert. Ausgezogen sind
`FORMATE`, `MAP_SIZES`, `MAP_FORMATS`, `MAP_FORMAT_VORGABE`, `MAP_GROESSE_VORGABE`,
`MAP_GROESSEN`, `MAP_GROESSEN_ALLE`, `MAP_FORMAT_ALIASE`, `ORIENTATIONS`, `MAP_WIDTH`,
`MAP_HEIGHT`, `mapSizeFor`, `mapGroesseFuerSpieler`, `ausrichtungFuerFormat`,
`normalisiereFormat`, `normalisiereGroesse` — samt der Kommentare zu Seitenverhältnissen,
Flächenrechnung und Drahtformat-Grenze. `match.js` importiert, was es selbst braucht
(`mapSizeFor`, `normalisiereFormat`, `normalisiereGroesse`, `ausrichtungFuerFormat`,
`MAP_GROESSE_VORGABE`), und re-exportiert ALLE Namen aus `karte.js`, damit
`client/terrainPreview.js`, `server/lobby.js`, Tests und Werkzeuge unverändert importieren.
`karte.js` importiert `match.js` nicht (kein Zyklus). Beleg: `tests/map-sizes.test.js`,
`tests/replay-hochformat.test.js`, `tests/state-hash.test.js`, `tests/zerstoerung.test.js`
und die Replay-Kopf-Tests laufen unverändert grün.

## Was bewusst im Match blieb

- `WATER_SCALE` (wird vom Client aus `match.js` importiert) und der Geschützpfad
  (`#simulateTurretPath`, siehe `docs/zerlegung-turret.md`).
- `getWeapon` wird aus `match.js` in die Kistenquelle gereicht: `tests/no-dead-code.test.js`
  verlangt, dass `match.js` die Waffen aus dem generierten Katalog liest.

## Beleg

Alle bisherigen Tests unverändert grün, keine Goldwerte angefasst. Neu: `tests/match-zerlegung.test.js`
(kein `this` in den Modulen, Rümpfe nicht mehr im Match, Reihenfolge der Zufallszüge, Merker und
Wasserfunktionen über Literal-Quellen).
