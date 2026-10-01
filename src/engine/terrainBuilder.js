/**
 * Terrain-Builder für ProjectArmageddon.
 *
 * ## Muster
 *
 * Dieses Modul folgt dem Muster von `stateSnapshot.js`:
 * Es exportiert eine reine Funktion `baueTerrain(quelle)`, die alle
 * Daten für Terrain, Wasser und Material aus einem Quell-Objekt liest.
 * Der Delegator in `match.js` bindet die Klasse an diese Funktion.
 *
 * ## EIN Rückgabepfad, drei Erzeuger
 *
 * Die drei Generatoren (`erzeugeAutonomeKarte`, `erzeugeKarte`,
 * `generateTerrain`) liefern unterschiedliche Felder. Ein früherer Entwurf
 * gab aus JEDEM Zweig ein eigenes Objekt zurück — dreimal derselbe Aufbau,
 * und nur ein Zweig trug Charakter/Kennzahlen/Material. Wer ein Feld
 * hinzufügte, musste es an drei Stellen tun; genau die Doppelregel, die
 * dieses Projekt sonst verbietet.
 *
 * Jetzt schreibt jeder Zweig nur seine BESONDERHEITEN in lokale Variablen;
 * der Aufbau des Ergebnisses steht EINMAL am Ende.
 *
 * ## Warum die Kollisionsmaske NICHT hier entsteht
 *
 * Die Maske (`CollisionMask.fromBitmap`) ist der Produktivpfad der Kollision
 * und gehört dem Motor: `match.js` baut sie aus der zurückgegebenen Bitmap.
 * Sie hier zusätzlich zu bauen wäre eine ZWEITE Rechnung über dieselben
 * Daten — und eine zweite Wahrheit darüber, was die Kollision trägt.
 *
 * @module terrainBuilder
 */

import { erzeugeKarte } from '../shared/terrainGen2.js';
import { erzeugeAutonomeKarte } from '../shared/terrainGen3.js';
import { generateTerrain } from '../shared/terrainGen.js';

/**
 * Erstellt Terrain, Bitmap, Material und Wasserstand aus einer Quelle.
 *
 * ## Reine Funktion, keine Klassenbindung
 *
 * Diese Funktion greift auf nichts außer ihrem Argument zu.
 * Alle Daten, die sie braucht, stehen in `quelle`.
 * Damit ist der Terrain-Aufbau gegen FESTE EINGABEN prüfbar.
 *
 * ## Eingabedaten (quelle)
 *
 * - `seedManager` — liefert den TERRAIN-RNG
 * - `width`, `height` — Kartenmaße
 * - `kartentyp` — 'autonom', ein Typ-String, oder null
 * - `preset` — das Gelände-Preset (z.B. 'hills')
 * - `events` — EventBus (für 'shield_absorbed')
 * - `statuses` — StatusStore mit armorOf, absorbWithShield
 * - `handleProjectileImpact` — Funktion für Projektil-Einschlag
 * - `world` — das Spiel-Welt-Objekt
 *
 * @param {object} quelle - die Werte, die der Terrain-Bau liest
 * @returns {{
 *   bitmap: Uint8Array,
 *   material: object|null,
 *   waterBaseY: number,
 *   kartencharakter: object|null,
 *   kartenkennzahlen: object|null,
 *   services: object
 * }}
 */
export function baueTerrain(quelle) {
  const terrainRng = quelle.seedManager.getSubRng('TERRAIN');

  let bitmap;
  let waterLevel;
  // Die Besonderheiten des autonomen Generators — nur er liefert sie.
  let kartencharakter = null;
  let kartenkennzahlen = null;
  let material = null;

  if (quelle.kartentyp === 'autonom') {
    /*
     * Der autonome Generator: Er zieht seinen Charakter aus dem Seed — kein
     * Typ, keine Schablone. Was dabei entsteht, steht in `charakter` und
     * `kennzahlen` und ist damit nachprüfbar.
     *
     * Das Bodenmaterial kommt aus DEMSELBEN Generator und damit aus DEMSELBEN
     * Seed. Es wird hier nur übernommen — gelesen wird es an genau EINER
     * Stelle (`MatchController#materialAt`).
     */
    const k = erzeugeAutonomeKarte({
      rng: terrainRng,
      width: quelle.width,
      height: quelle.height,
    });
    bitmap = k.bitmap;
    waterLevel = k.wasserY;
    kartencharakter = k.charakter;
    kartenkennzahlen = k.kennzahlen;
    material = k.material ?? null;
  } else if (quelle.kartentyp) {
    /*
     * Zwei Generatoren, ein Schalter.
     *
     * Der alte (`generateTerrain`) erzeugt ein 1D-Höhenfeld: je Spalte genau
     * eine Oberfläche, alles darunter massiv. Höhlen, Tunnel, Überhänge und
     * schwebende Inseln sind damit nicht darstellbar — eine Eigenschaft des
     * Verfahrens, nicht ein Mangel des Codes.
     *
     * Der neue (`erzeugeKarte`) erzeugt eine 2D-Maske und kann all das.
     * Möglich ist das ohne Motorumbau, weil die Kollision ohnehin 2D ist
     * (`CollisionMask.fromBitmap` mit `isSolid(x, y)`).
     *
     * Der Umschalter steht auf dem KARTENTYP: Ist einer gesetzt, baut der neue
     * Generator die Karte. Ohne Angabe bleibt es beim bewährten Verhalten —
     * ein unbekannter Aufrufer soll nicht plötzlich anderes Gelände bekommen.
     */
    const k = erzeugeKarte({
      rng: terrainRng,
      width: quelle.width,
      height: quelle.height,
      typ: quelle.kartentyp,
    });
    bitmap = k.bitmap;
    waterLevel = k.wasserY;
  } else {
    const alt = generateTerrain({
      rng: terrainRng,
      width: quelle.width,
      height: quelle.height,
      preset: quelle.preset,
    });
    bitmap = alt.bitmap;
    waterLevel = alt.waterLevel;
  }

  return {
    bitmap,
    material,
    waterBaseY: waterLevel,
    kartencharakter,
    kartenkennzahlen,
    services: baueServices(quelle),
  };
}

/**
 * Baut die Services-Objekte für die Welt.
 *
 * ## Schild und Rüstung greifen im DamageSystem
 *
 * Dort wirken sie auch bei Flächenschaden — der Radius verteilt den Schaden,
 * nicht die Waffe. Der Modifikator ist die einzige Brücke dorthin.
 *
 * @param {object} quelle
 * @returns {object}
 */
function baueServices(quelle) {
  return {
    damageModifier(entityId, amount) {
      const armor = quelle.statuses.armorOf(entityId);
      const afterArmor = amount * (1 - armor);
      const { absorbed, rest } = quelle.statuses.absorbWithShield(entityId, afterArmor);
      if (absorbed > 0) {
        quelle.events.emit('shield_absorbed', { playerId: entityId, absorbed });
      }
      return { amount: rest };
    },

    onProjectileImpact(payload) {
      return quelle.handleProjectileImpact(payload);
    },
  };
}
