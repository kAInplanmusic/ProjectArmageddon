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

## Was bewusst im Match blieb

- `WATER_SCALE` (wird vom Client aus `match.js` importiert) und der Geschützpfad
  (`#simulateTurretPath`, siehe `docs/zerlegung-turret.md`).
- `getWeapon` wird aus `match.js` in die Kistenquelle gereicht: `tests/no-dead-code.test.js`
  verlangt, dass `match.js` die Waffen aus dem generierten Katalog liest.

## Beleg

Alle bisherigen Tests unverändert grün, keine Goldwerte angefasst. Neu: `tests/match-zerlegung.test.js`
(kein `this` in den Modulen, Rümpfe nicht mehr im Match, Reihenfolge der Zufallszüge, Merker und
Wasserfunktionen über Literal-Quellen).
