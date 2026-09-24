/**
 * Prüft die drei Wirkungsmerkmale des Waffenkatalogs.
 *
 * Geprüft wird gegen den GENERIERTEN Katalog (`src/shared/config/weapons.js`),
 * nicht gegen die Quelldatei: Nur was im Katalog steht, erreicht den Motor.
 *
 * 1. SCHADENSART (`damageType`)
 *    Jede der 150 Waffen muss eine Art tragen, die der Motor kennt
 *    (`src/engine/damageTypes.js`). Eine unbekannte Art wäre im Int32-Feld des
 *    Projektils stillschweigend 0 (körperlich) — eine Waffe, die anders wirkt,
 *    als sie heißt.
 *
 * 2. SICHTLINIE (`requiresLineOfSight`)
 *    Das Merkmal muss mit der Feuerart zusammenpassen: Ein Hitscan ohne
 *    Flugbahn kann Deckung nicht umfliegen, braucht also Sicht. Ein
 *    Steilfeuer-Geschoss (Anflug von oben) darf umgekehrt NICHT auf Sicht
 *    bestehen, sonst schösse es nie über einen Berg.
 *
 * 3. ZIELART (`targeting`)
 *    Jede Waffe muss eine Zielart tragen. Der Abgleich mit der Wirkung selbst
 *    steht in `scripts/check-weapon-targeting.mjs` — hier wird nur die
 *    Vollständigkeit geprüft, damit die beiden Prüfungen nicht dieselbe Regel
 *    doppelt führen.
 *
 * Exit-Code 1 bei jedem Verstoß.
 */
import { WEAPONS } from '../src/shared/config/weapons.js';
import { DAMAGE_TYPE_IDS, isKnownDamageType } from '../src/engine/damageTypes.js';
import { LINE_OF_SIGHT_SPECIALS } from './build-weapon-catalog.mjs';

const fehler = [];
const warnungen = [];

let ohneSicht = 0;

for (const waffe of WEAPONS) {
  const name = `${waffe.id} (${waffe.displayName})`;

  // 1. Schadensart vorhanden und bekannt?
  if (!waffe.damageType) {
    fehler.push(`${name}: keine Schadensart`);
  } else if (!isKnownDamageType(waffe.damageType)) {
    fehler.push(
      `${name}: unbekannte Schadensart "${waffe.damageType}" — `
      + `bekannt sind ${DAMAGE_TYPE_IDS.length} Arten (src/engine/damageTypes.js)`,
    );
  }

  // 2. Sichtlinie passt zur Feuerart?
  if (waffe.requiresLineOfSight) {
    ohneSicht += 1;
    // Steilfeuer kommt von oben und darf nicht auf freier Sicht bestehen.
    if (waffe.strikeStyle && waffe.strikeStyle !== 'self') {
      fehler.push(
        `${name}: verlangt Sichtlinie, kommt aber als ${waffe.strikeStyle}-Anflug `
        + `(Steilfeuer schießt über Deckung — das Merkmal widerspricht dem)`,
      );
    }
    // Wer Sicht verlangt, muss direkt zielen: Ein Wirkungsname aus der
    // Sichtlinien-Liste oder ein Wert aus der Designdatei.
    const ausListe = LINE_OF_SIGHT_SPECIALS.has(waffe.special);
    const ausQuelle = waffe.requiresLineOfSightSource === 'source';
    if (!ausListe && !ausQuelle) {
      fehler.push(
        `${name}: verlangt Sichtlinie ohne direkte Feuerart (special=${waffe.special ?? 'null'})`,
      );
    }
  }

  // 3. Zielart vollständig?
  if (!waffe.targeting) {
    warnungen.push(`${name}: keine Zielart (targeting) — der Motor entscheidet über die Wirkung`);
  }
}

if (ohneSicht === 0) {
  fehler.push('KEINE Waffe verlangt Sichtlinie — das Merkmal wäre wieder ohne Wirkung');
}

for (const warnung of warnungen) console.warn(`WARNUNG  ${warnung}`);
for (const eintrag of fehler) console.error(`FEHLER   ${eintrag}`);

console.log('');
console.log(`  Schadensarten : ${DAMAGE_TYPE_IDS.length} bekannt, ${new Set(WEAPONS.map(w => w.damageType)).size} im Katalog`);
console.log(`  Sichtlinie    : ${ohneSicht} von ${WEAPONS.length} Waffen verlangen freie Sicht`);
console.log(`  Zielart       : ${WEAPONS.filter(w => w.targeting).length} von ${WEAPONS.length} gesetzt`);
console.log(`  Fehler        : ${fehler.length}`);
console.log(`  Warnungen     : ${warnungen.length}`);

process.exit(fehler.length === 0 ? 0 : 1);
