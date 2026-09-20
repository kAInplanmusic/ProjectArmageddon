#!/usr/bin/env node
/**
 * Erzeugt die WIRKUNGS-ÜBERSICHT: `docs/matrix-terrain-waffen-wirkung.md`.
 *
 * ## Warum ein Generator und keine handgeschriebene Tabelle
 *
 * Die Übersicht beantwortet Fragen, die sich sonst nur durch Lesen von Code
 * beantworten lassen: *Welche Waffe zerstört wie viel Gelände? Worauf wirkt sie —
 * Figur, Fläche, Terrain, Wasser, Kisten, NPCs? Welche Terrain-Art begünstigt
 * wen?*
 *
 * Jede Zahl darin wird GERECHNET, nicht geschrieben:
 *   - Schaden, Radius, Rückstoß, Durchschlag, Zielsuche, Elemente ← Waffenkatalog
 *   - Kraterradius ← DIESELBE Regel wie `projectileSystem.#explode`
 *     (`terrainDamage > 0 ? terrainDamage : blastRadius * 0,6 : 4`)
 *   - Terrain-Kennzahlen ← `generateTerrain` mit festem Seed, echt gemessen
 *
 * Wer die Designdatei ändert, lässt `npm run matrix` laufen — die Übersicht
 * folgt. `npm run matrix:check` prüft, ob sie noch zum Katalog passt; ein Test
 * fährt das bei jedem `npm test` (`tests/matrix.test.js`).
 *
 *   node scripts/build-matrix.mjs           # schreiben
 *   node scripts/build-matrix.mjs --check   # nur prüfen (Exit 1 bei Abweichung)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { generateTerrain, TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import { SeededRandom } from '../src/shared/prng.js';

const hier = dirname(fileURLToPath(import.meta.url));
const root = resolve(hier, '..');
const ZIEL = join(root, 'docs', 'matrix-terrain-waffen-wirkung.md');

/** Kartenmaße der Vorgabekarte — für Flächenangaben in Prozent. */
const KARTE = { breite: 2560, hoehe: 1440 };

/**
 * Kraterradius EINER Waffe — dieselbe Regel wie im Motor.
 *
 * Steht hier als Funktion, damit ein Auseinanderlaufen auffällt: `tests/matrix.test.js`
 * vergleicht sie mit dem, was `projectileSystem` tatsächlich tut.
 */
export function kraterRadius(waffe) {
  if (waffe.terrainDamage > 0) return Math.max(2, Math.round(waffe.terrainDamage));
  if (waffe.blastRadius > 0) return Math.max(2, Math.round(waffe.blastRadius * 0.6));
  return 4;
}

/** Fläche eines Kraters in Pixeln und in Promille der Vorgabekarte. */
export function kraterFlaeche(waffe) {
  const radius = kraterRadius(waffe);
  const flaeche = Math.PI * radius * radius;
  return { radius, flaeche, promille: (flaeche / (KARTE.breite * KARTE.hoehe)) * 1000 };
}

/** Zerstörungsgrad als Klasse — aus der Fläche, nicht aus dem Gefühl. */
export function zerstoerungsgrad(waffe) {
  const { flaeche } = kraterFlaeche(waffe);
  const seiten = Math.sqrt(flaeche);
  if (flaeche < 200) return '1 · Kratzer';
  if (flaeche < 1200) return '2 · Loch';
  if (flaeche < 5000) return '3 · Trichter';
  if (flaeche < 20000) return '4 · Krater';
  if (seiten < 240) return '5 · Großkrater';
  return '6 · Geländebruch';
}

/**
 * WORAUF die Waffe wirkt — abgeleitet aus den Feldern, nicht behauptet.
 *
 * Die Regeln stehen im Motor (`projectileSystem`, `specials.js`); hier werden
 * sie nur benannt. Wer eine Wirkung hinzufügt, trägt sie an beiden Stellen ein —
 * `npm run check:effects` prüft, dass jedes Feld einen Leser hat.
 */
export function wirkungsziele(waffe) {
  const ziele = [];
  const elemente = waffe.elemental ?? {};
  const hatElement = (elemente.fire ?? 0) + (elemente.ice ?? 0) + (elemente.poison ?? 0) > 0;

  if (waffe.damage > 0) ziele.push('Figur (direkt)');
  if (waffe.blastRadius > 0 && waffe.damage > 0) ziele.push('Figuren (Fläche)');
  if (waffe.terrainDamage > 0 || waffe.blastRadius > 0) ziele.push('Terrain (Krater)');
  if (waffe.terrainDamage > 0 || waffe.blastRadius > 0) ziele.push('Wasser (verdrängt)');
  if (waffe.blastRadius > 0 || waffe.damage > 0) ziele.push('Kisten (zerstörbar)');
  if (waffe.blastRadius > 0) ziele.push('NPCs (Günther, Geschütze)');
  if (waffe.knockback > 0) ziele.push('Stellung (Rückstoß)');
  if (waffe.piercing > 0) ziele.push(`Figur (Durchschlag ${waffe.piercing}×)`);
  if (waffe.homing > 0) ziele.push('Ziel (suchend)');
  if (hatElement) ziele.push('Zustand (Element)');
  return ziele;
}

/* ----------------------------------------------------------- Terrain-Arten */
/**
 * Kennzahlen je Terrain-Art — GEMESSEN an einer echten Karte, nicht geschätzt.
 *
 * Dieselbe Vorgabe (Seed, Maße) für alle Arten, damit die Zahlen vergleichbar
 * sind. `hohlräume` zählt Pixel, die unter der Oberfläche LEER sind (Höhlen) —
 * sie sind der Unterschied zwischen einem Höhenfeld und einer echten Maske.
 */
function terrainKennzahlen() {
  const breite = 640;
  const hoehe = 360;
  return Object.keys(TERRAIN_PRESETS).map(preset => {
    const terrain = generateTerrain({
      rng: new SeededRandom(4242), width: breite, height: hoehe, preset,
    });
    let fest = 0;
    /*
     * HOHLRÄUME zählen: leere Pixel, die festes Gestein ÜBER und UNTER sich
     * haben. In einem reinen Höhenfeld gibt es sie nicht — die Zahl ist damit
     * die Messung dafür, ob eine Art eine echte MASKE mit Höhlen ist oder nur
     * eine Oberfläche.
     */
    let hohlraeume = 0;
    for (let x = 0; x < breite; x += 1) {
      let ersterFester = -1;
      let letzterFester = -1;
      for (let y = 0; y < hoehe; y += 1) {
        if (terrain.bitmap[y * breite + x] !== 1) continue;
        fest += 1;
        if (ersterFester < 0) ersterFester = y;
        letzterFester = y;
      }
      for (let y = ersterFester + 1; y < letzterFester; y += 1) {
        if (terrain.bitmap[y * breite + x] !== 1) hohlraeume += 1;
      }
    }
    return {
      preset,
      hoehe,
      festAnteil: fest / (breite * hoehe),
      hohlraeume,
      wasserLevel: terrain.waterLevel,
      hatWasser: terrain.waterLevel !== null && terrain.waterLevel !== undefined,
    };
  });
}

/* ------------------------------------------------------------------- Text */
const prozent = (x) => `${(x * 100).toFixed(1)} %`;
const zahl = (x) => x.toLocaleString('de-DE');

function baue() {
  const zeilen = [];
  const w = (text = '') => zeilen.push(text);

  const mitKrater = WEAPONS.filter(x => x.terrainDamage > 0 || x.blastRadius > 0);
  const ohneWirkung = WEAPONS.filter(x => x.damage <= 0 && x.blastRadius <= 0
    && x.terrainDamage <= 0 && x.knockback <= 0);
  const kategorien = [...new Set(WEAPONS.map(x => x.category))].sort();

  w('# Wirkungs-Übersicht: Terrain, Waffen und was auf was wirkt');
  w();
  w('*Erzeugt von `npm run matrix` (`scripts/build-matrix.mjs`). Jede Zahl ist');
  w('gerechnet — aus dem Waffenkatalog und dem Terrain-Generator, mit derselben');
  w('Regel, die der Motor benutzt. `npm run matrix:check` schlägt fehl, wenn die');
  w('Übersicht nicht mehr zum Katalog passt.*');
  w();
  w(`**Katalog:** ${WEAPONS.length} Waffen · **Karte:** ${zahl(KARTE.breite)}×${zahl(KARTE.hoehe)} px `
    + `= ${(KARTE.breite * KARTE.hoehe / 1e6).toFixed(2)} Mio. Pixel`);
  w();

  /* ---------------------------------------------------------- 1. Überblick */
  w('## 1. Die Waffen in Zahlen');
  w();
  w('| Kategorie | Waffen | Schaden min–max | Flächenwirkung | Krater | Zünder | Durchschlag | Zielsuche |');
  w('|---|---|---|---|---|---|---|---|');
  for (const kategorie of kategorien) {
    const gruppe = WEAPONS.filter(x => x.category === kategorie);
    const schaeden = gruppe.map(x => x.damage).filter(x => x > 0);
    const kratzer = gruppe.map(x => kraterRadius(x));
    w(`| ${kategorie} | ${gruppe.length} `
      + `| ${schaeden.length ? `${Math.min(...schaeden)}–${Math.max(...schaeden)}` : '—'} `
      + `| ${gruppe.filter(x => x.blastRadius > 0).length} `
      + `| ${Math.min(...kratzer)}–${Math.max(...kratzer)} px `
      + `| ${gruppe.filter(x => x.fuseTime > 0).length} `
      + `| ${gruppe.filter(x => x.piercing > 0).length} `
      + `| ${gruppe.filter(x => x.homing > 0).length} |`);
  }
  w(`| **gesamt** | **${WEAPONS.length}** | | ${WEAPONS.filter(x => x.blastRadius > 0).length} `
    + `| | ${WEAPONS.filter(x => x.fuseTime > 0).length} `
    + `| ${WEAPONS.filter(x => x.piercing > 0).length} `
    + `| ${WEAPONS.filter(x => x.homing > 0).length} |`);
  w();
  w('**Zustellart:** '
    + `${WEAPONS.filter(x => x.delivery === 'projectile').length} Projektile · `
    + `${WEAPONS.filter(x => x.delivery === 'hitscan').length} Hitscan.`
    + ' Ein Hitscan erzeugt kein Geschoss — Flug, Zünder, Durchschlag und Zielsuche');
  w('können bei ihm nicht wirken. `npm run check:effects` hält das fest.');
  w();
  if (ohneWirkung.length > 0) {
    w(`**Wirkung OHNE Schaden (${ohneWirkung.length}):** `
      + ohneWirkung.map(x => `${x.displayName} (${x.special ?? 'Spezialeffekt'})`).join(', '));
    w();
    w('Diese Waffen bewegen, schützen oder versorgen — sie graben nichts und'
      + ' treffen niemanden. Ihr Nutzen liegt im Spezialeffekt.');
    w();
  }

  /* ------------------------------------------------- 2. Zerstörungsgrad */
  w('## 2. Zerstörungsgrad');
  w();
  w('Der Krater folgt EINER Regel (`projectileSystem.#explode`):');
  w('`terrainDamage > 0` → Radius = `terrainDamage`, sonst `blastRadius × 0,6`,');
  w('sonst ein Mindestloch von 4 px, damit ein Einschlag sichtbar bleibt.');
  w();
  const klassen = [...new Set(WEAPONS.map(zerstoerungsgrad))].sort();
  w('| Grad | Kraterfläche | Waffen | stärkste Waffe |');
  w('|---|---|---|---|');
  for (const klasse of klassen) {
    const gruppe = WEAPONS.filter(x => zerstoerungsgrad(x) === klasse);
    const staerkste = gruppe.reduce((a, b) => (kraterFlaeche(b).flaeche > kraterFlaeche(a).flaeche ? b : a));
    const flaeche = kraterFlaeche(staerkste).flaeche;
    w(`| ${klasse} | ${Math.round(Math.min(...gruppe.map(x => kraterFlaeche(x).flaeche)))}–`
      + `${Math.round(Math.max(...gruppe.map(x => kraterFlaeche(x).flaeche)))} px² `
      + `| ${gruppe.length} | ${staerkste.displayName} (${Math.round(flaeche)} px²) |`);
  }
  w();
  w(`Von ${WEAPONS.length} Waffen graben **${mitKrater.length}** Gelände weg; `
    + `**${WEAPONS.length - mitKrater.length}** tun es nicht (Hitscan ohne Flächenwirkung `
    + 'oder Wirkung nur auf Figuren).');
  w();

  /* ----------------------------------------------------- 3. Terrain-Arten */
  w('## 3. Terrain-Arten (gemessen, Seed 4242, 640×360)');
  w();
  w('| Art | fester Anteil | leerer Innenraum | Wasserlinie | was das für Waffen bedeutet |');
  w('|---|---|---|---|---|');
  const bedeutung = {
    hills: 'Hügel in Wurfweite — Standardfall für Bogenfeuer',
    mountains: 'hohe Wände: Artillerie über den Berg, Hitscan trifft die Wand',
    islands: 'Wasser zwischen den Inseln: Rückstoß drückt hinein, Wurfwaffen verziehen',
    caverns: 'Höhlen: Sprengung öffnet Wege, ein Durchschlag trifft auch dahinter',
    open: 'kaum Deckung: direkte Schüsse und Flächenwaffen dominieren',
    spires: 'schmale Türme: ein Treffer am Fuß kippt die Stellung',
    flooded: 'Wasser über der Oberfläche: Versenken wirkt schneller als Schaden',
    warren: 'Gänge im Gestein: Krater verändern die Karte am stärksten',
  };
  for (const k of terrainKennzahlen()) {
    w(`| ${k.preset} | ${prozent(k.festAnteil)} | ${zahl(k.hohlraeume)} px `
      + `| ${k.hatWasser ? `y = ${k.wasserLevel} von ${k.hoehe}` : 'nein'} `
      + `| ${bedeutung[k.preset] ?? '—'} |`);
  }
  w();
  w('*Zum „leeren Innenraum\": Er zählt die Pixel, die Gestein ÜBER und UNTER sich');
  w('haben. Bei `caverns` und `warren` sind das die HÖHLEN, bei `hills` der nicht');
  w('gefüllte Bauch der Karte — beides ist für eine Explosion erreichbar, aber nur');
  w('im ersten Fall ein Weg.*');
  w();
  w('*Die Terrain-Art bestimmt die Wirkung mit: Ein Krater in `warren` schafft');
  w('einen Durchgang, derselbe Krater in `open` ist ein Loch im Boden.*');
  w();

  /* ------------------------------------------------ 4. Wirkung je Waffe */
  w('## 4. Wirkungs-Matrix (alle Waffen)');
  w();
  w('| # | Waffe | Klasse | Schaden | Radius | Krater | Grad | Rückstoß | Element | wirkt auf |');
  w('|---|---|---|---|---|---|---|---|---|---|');
  for (const waffe of [...WEAPONS].sort((a, b) => a.index - b.index)) {
    const krater = kraterFlaeche(waffe);
    const element = (waffe.elemental ?? {});
    const elemente = [['Feuer', element.fire], ['Eis', element.ice], ['Gift', element.poison]]
      .filter(([, wert]) => wert > 0).map(([name, wert]) => `${name} ${wert}`).join(', ');
    w(`| ${waffe.index} | ${waffe.displayName} | ${waffe.category} `
      + `| ${waffe.damage > 0 ? waffe.damage : '—'} `
      + `| ${waffe.blastRadius > 0 ? waffe.blastRadius : '—'} `
      + `| ${krater.radius} px `
      + `| ${zerstoerungsgrad(waffe).split(' · ')[0]} `
      + `| ${waffe.knockback > 0 ? waffe.knockback : '—'} `
      + `| ${elemente || '—'} `
      + `| ${wirkungsziele(waffe).join(', ') || '—'} |`);
  }
  w();

  /* ------------------------------------------------ 5. Zustands-Effekte */
  w('## 5. Zustands-Effekte (Elementarschaden)');
  w();
  w('Elementarschaden wird in `src/engine/specials.js` in Zustände übersetzt:');
  w('Feuer und Gift als Schaden über Zeit, Eis als Einfrieren. Die Dauer wächst');
  w('mit der Summe der Elementpunkte.');
  w();
  for (const [element, feld] of [['Feuer', 'fire'], ['Eis', 'ice'], ['Gift', 'poison']]) {
    const gruppe = WEAPONS.filter(x => (x.elemental?.[feld] ?? 0) > 0)
      .sort((a, b) => b.elemental[feld] - a.elemental[feld]);
    w(`**${element}** (${gruppe.length}): `
      + (gruppe.slice(0, 8).map(x => `${x.displayName} ${x.elemental[feld]}`).join(', ')
        || '—')
      + (gruppe.length > 8 ? `, … (${gruppe.length - 8} weitere)` : ''));
    w();
  }

  /* --------------------------------------------------- 6. Herkunft */
  w('## 6. Woher die Zahlen kommen');
  w();
  w('| Größe | Quelle |');
  w('|---|---|');
  w('| Schaden, Radius, Rückstoß, Elemente, Durchschlag, Zielsuche | `src/shared/config/weapons.js` (erzeugt aus `project_armageddon_weapons_v1.json`) |');
  w('| Kraterradius | `src/engine/systems/projectileSystem.js`, `#explode` — hier nachgebildet und im Test verglichen |');
  w('| Flächenwirkung auf Figuren | Falloff `max(0,25, 1 − Abstand/Radius)` je Figur im Radius |');
  w('| Wasser | `water.displace(x, y, craterRadius, 0,65)` bei jedem Krater |');
  w('| Kisten und NPCs | Sie tragen `Position`+`Health` und werden vom Flächenschaden mitgetroffen |');
  w('| Terrain-Kennzahlen | `generateTerrain` mit Seed 4242, 640×360 — dieselbe Vorgabe für alle Arten |');
  w();
  w('*Felder ohne Wirkung sind der Fehler, den `npm run check:effects` sucht:');
  w('Bis 2026-09-20 trugen 6 Waffen `piercing` und 2 `homing`, ohne dass ein Stück');
  w('Motorcode sie las — die Übersicht hätte damals Wirkungen ausgewiesen, die es');
  w('nicht gab.*');
  w();

  return `${zeilen.join('\n')}\n`;
}

const text = baue();
const pruefen = process.argv.includes('--check');

if (pruefen) {
  let vorhanden = '';
  try {
    vorhanden = readFileSync(ZIEL, 'utf8');
  } catch {
    console.error(`FEHLT: ${ZIEL} — mit \`npm run matrix\` erzeugen.`);
    process.exitCode = 1;
  }
  if (vorhanden && vorhanden !== text) {
    console.error('VERALTET: Die Wirkungs-Übersicht passt nicht mehr zum Katalog.');
    console.error('  Behebung: npm run matrix');
    process.exitCode = 1;
  } else if (vorhanden) {
    console.log(`Aktuell: ${ZIEL}`);
  }
} else {
  writeFileSync(ZIEL, text);
  console.log(`Wirkungs-Übersicht geschrieben: ${ZIEL}`);
  console.log(`  Waffen: ${WEAPONS.length} | mit Krater: `
    + `${WEAPONS.filter(x => x.terrainDamage > 0 || x.blastRadius > 0).length} | `
    + `Kategorien: ${new Set(WEAPONS.map(x => x.category)).size}`);
}
