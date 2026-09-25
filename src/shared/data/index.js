/**
 * Datenzugriff für das Browser-Spiel.
 *
 * ## Warum diese Datei existiert
 *
 * Das Projekt hat JSON-Daten, die ausschließlich serverseitig (Node.js) geladen
 * werden können — `node:fs` gibt es im Browser nicht. Dieses Modul ist bewusst
 * **nicht** aus `src/shared/index.js` re-exportiert (das gemeinsame Balken, den
 * der Browser nutzt). Wer die Daten im Server braucht, importiert direkt von hier.
 *
 * ## Warum die beiden Loader hier verschwunden sind
 *
 * `loadProjectArmageddonWeaponDatabase` und `loadTerrainMaterialDefinitions`
 * standen hier und wurden **nirgends** aufgerufen — weder im Server noch in
 * Tests noch im Client. Sie waren ein Relikt des frühen Prototyps, in dem die
 * Daten per Laufzeit-Loader statt über den generierten Katalog (`weapons.js`)
 * geladen wurden.
 *
 * HEUTE kommt das Wetter aus `scripts/build-weapon-catalog.mjs` →
 * `src/shared/config/weapons.js` (generiert, idempotent), und das Terrain
 * wird komplett aus dem Seed rekonstruiert — keine externen Material-Dateien.
 * Die beiden Funktionen und ihre JSON-Dateien sind daher überflüssig.
 *
 * Geprüft: `grep -rn "loadProjectArmageddonWeaponDatabase\|loadTerrainMaterialDefinitions" src/ tests/ scripts/`
 * liefert keinen Treffer mehr.
 *
 * @module data
 */
// Intentionally empty — siehe oben.
