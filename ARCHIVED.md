# Archiv: eingebrachter Stand vom 6. September 2026

Dieser Text beschreibt Bestandteile, die mit dem Merge des Tags
`archive/copilot-explore-and-extract-files` (Commit `50efbae`, „Integrate uploaded
terrain and weapon engines") in `main` übernommen wurden.

**Kurzfassung: nichts hier ist im laufenden Betrieb aktiv.** Die Inhalte wurden
übernommen, damit sie nicht verloren gehen, und um die Herkunft nachvollziehbar zu
halten. `main` hat für dieselben Aufgaben eigene Systeme, die weiter sind.

## Was übernommen wurde

### `uploaded/` — die ursprünglichen Pakete

| Pfad | Inhalt |
|---|---|
| `uploaded/weapon_engine_v1_0/weapon_engine_v1_0/` | Waffen-Engine als TypeScript, dazu `dist/` und Tests |
| `uploaded/terrain_engine_v1_0/terrain_build/weapon_engine_v1_0/` | Terrain-Engine als TypeScript, dazu `dist/`, Tests und `terrain_materials_v1.json` |

Das sind die Originaldateien, wie sie hochgeladen wurden. Die verschachtelten
Ordnernamen sind so belassen — sie stammen aus dem Upload und zeigen dessen Herkunft.

### `src/engine/terrain/terrainEngine.js`, `src/engine/weapons/`

Portierte Fassungen derselben Engines in JavaScript, zusammen rund 1 150 Zeilen,
samt `projectArmageddonWorldAdapter.js` als Anbindung an die Spielwelt.

### `src/shared/data/`

Ein Lader plus zwei JSON-Dateien. Dazu zwei Hinweise:

- **`projectArmageddonWeaponsV1.json` ist ein inhaltsgleiches Duplikat** von
  `project_armageddon_weapons_v1.json` im Wurzelverzeichnis (150 Waffen, gleiche
  Kennungen, gleiche Werte — geprüft; nur die Formatierung unterscheidet sich). Die
  Wurzeldatei ist die maßgebliche Quelle: Aus ihr erzeugt
  `scripts/build-weapon-catalog.mjs` den Katalog `src/shared/config/weapons.js`.
- **`terrainMaterialsV1.json` gibt es nur hier.** Es ist damit der einzige Inhalt
  dieses Ordners, den `main` sonst nirgends hat.

## Warum nichts davon verdrahtet ist

`src/shared/data/index.js` liest seine JSON-Dateien beim Laden über `node:fs`. Im
Browser gibt es dieses Modul nicht, und `src/shared/` wird von Client und Server
gemeinsam genutzt. Der Balken `src/shared/index.js` re-exportiert den Ordner
deshalb **bewusst nicht**; wer die Daten serverseitig braucht, importiert direkt
aus `./data/index.js`.

Ein Test (`tests/source-boundaries.test.js`) wacht darüber, dass in `src/shared/`
keine weiteren Node-Builtins auftauchen.

## Was `main` stattdessen nutzt

| Aufgabe | Zuständig in `main` |
|---|---|
| Geländeerzeugung | `src/shared/terrainGen.js`, `src/engine/terrain/` |
| Waffenkatalog | `src/shared/config/weapons.js` (generiert) |
| Ballistik | `src/engine/physics/ballistics.js` |

Die Platzhalter unter `src/engine/terrainEngine/index.js` und
`src/engine/weaponEngine/index.js` benennen dieselben Engines, sind aber
eigenständige Hüllen ohne Verbindung zu diesem Ordner.

## Die beiden ZIP-Dateien fehlen hier mit Absicht

`Project_Armageddon_TerrainEngine_v1.0.zip` und
`Project_Armageddon_WeaponEngine_v1.0.zip` liegen im Tag, aber nicht in `main`.
`main` schließt `*.zip` aus, weil es Erzeugnisse sind. Der entpackte Inhalt steht
vollständig unter `uploaded/`.
