#!/usr/bin/env node
/**
 * Ordnet jeder der 81 Figuren ihre Spezialwaffe zu (TODO 2.17, Entscheidung 2026-11-25) und schreibt
 * `src/shared/config/ausruestung-spezial.js`. Das Ergebnis ist eine eingefrorene Tabelle: Das Spiel liest
 * nur die Datei, nie dieses Skript (Replays bleiben stabil, auch wenn sich das Skript ändert).
 *
 * Regeln:
 *  - Kandidaten: die 150 Katalogwaffen ohne die 5 festen Startwaffen und ohne die zwei Gimmicks.
 *  - Je Fraktion (9 Figuren): 1 legendär, 2 stark (epic/rare), 6 normal (common/uncommon), Stufe = `powerTier`.
 *  - Der Katalog hat nur 3 legendäre Waffen: Fraktion i bekommt die legendäre Nummer i mod 3 (je drei Fraktionen teilen sich eine).
 *    Starke und normale Waffen kommen in der ganzen Tabelle höchstens einmal vor.
 *  - Passung: Stichwörter aus Name und Beschreibung der Superwaffe einer Figur gegen Name und Beschreibung der Waffe,
 *    dazu die Rolle (Nahkampf → melee; Fernkampf → ranged/heavy_ranged/tech; Magie → magic/elemental/ultimate).
 *  - Gierig je Fraktion in fester Reihenfolge, Gleichstand nach Katalogindex: deterministisch.
 *
 * Aufruf: node scripts/ausruestung-zuordnen.mjs [--pruefen]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { FACTIONS, CHARACTERS } from '../src/shared/config/factions.js';
import { FESTE_STARTWAFFEN, GIMMICKS, spezialStufe } from '../src/shared/config/ausruestung.js';

const ZIEL = fileURLToPath(new URL('../src/shared/config/ausruestung-spezial.js', import.meta.url));
const ausgeschlossen = new Set([...FESTE_STARTWAFFEN, ...Object.keys(GIMMICKS)]);
const kandidaten = WEAPONS.filter(w => !ausgeschlossen.has(w.id));

const STOPP = new Set(['der', 'die', 'das', 'und', 'ein', 'eine', 'einen', 'einem', 'einer', 'mit', 'von', 'den', 'dem', 'des', 'auf',
  'aus', 'im', 'in', 'zu', 'zum', 'zur', 'sich', 'nicht', 'sondern', 'nur', 'wie', 'als', 'dass', 'für', 'bei', 'nach', 'über',
  'unter', 'ihr', 'ihn', 'sie', 'es', 'er', 'wird', 'werden', 'kurz', 'kurze', 'kurzer', 'große', 'großer', 'großen', 'dann', 'danach']);
const woerter = text => new Set(String(text ?? '').toLowerCase().normalize('NFC').split(/[^a-zäöüß]+/)
  .filter(w => w.length >= 4 && !STOPP.has(w)).map(w => w.slice(0, 6)));

const ROLLE_KATEGORIE = {
  melee: { melee: 2 },
  ranged: { ranged: 2, heavy_ranged: 2, tech: 1.5 },
  magic: { magic: 2, elemental: 1.5, ultimate: 1 },
};

function passung(figur, waffe) {
  const a = woerter(`${figur.superWeapon?.name} ${figur.superWeapon?.description}`);
  const b = woerter(`${waffe.displayName} ${waffe.description}`);
  let gemeinsam = 0;
  for (const w of a) if (b.has(w)) gemeinsam += 1;
  return gemeinsam * 3 + (ROLLE_KATEGORIE[figur.role]?.[waffe.category] ?? 0);
}

const legendaer = kandidaten.filter(w => spezialStufe(w) === 'legendaer');
const vergeben = new Set();
const tabelle = {};

FACTIONS.forEach((fraktion, fi) => {
  const figuren = CHARACTERS.filter(c => c.faction === fraktion.id);
  const frei = new Set(figuren.map(c => c.id));
  const nimm = (stufe, anzahl, pool) => {
    for (let n = 0; n < anzahl; n += 1) {
      let best = null;
      for (const c of figuren) {
        if (!frei.has(c.id)) continue;
        for (const w of pool) {
          if (spezialStufe(w) !== stufe || (stufe !== 'legendaer' && vergeben.has(w.id))) continue;
          const p = passung(c, w);
          if (!best || p > best.p || (p === best.p && w.index < best.w.index)) best = { c, w, p };
        }
      }
      if (!best) throw new Error(`${fraktion.id}: keine ${stufe}-Waffe mehr frei`);
      tabelle[best.c.id] = best.w.id;
      frei.delete(best.c.id);
      if (stufe !== 'legendaer') vergeben.add(best.w.id);
    }
  };
  nimm('legendaer', 1, [legendaer[fi % legendaer.length]]);
  nimm('stark', 2, kandidaten);
  nimm('normal', 6, kandidaten);
});

const zeilen = CHARACTERS.map(c => {
  const w = WEAPONS.find(x => x.id === tabelle[c.id]);
  return `  '${c.id}': '${w.id}', // ${spezialStufe(w)}: ${w.displayName} (${c.superWeapon?.name ?? '–'})`;
});
const inhalt = `/**
 * Spezialwaffe je Figur (TODO 2.17, Startausrüstung ab Kit-Fassung 5).
 * ERZEUGT von \`scripts/ausruestung-zuordnen.mjs\` — nicht von Hand ändern, sondern das Skript anpassen und neu erzeugen.
 * Regeln und Begründung stehen im Skriptkopf; \`tests/ausruestung.test.js\` prüft Verteilung und Eindeutigkeit.
 *
 * @module config/ausruestung-spezial
 */
export const SPEZIAL_JE_FIGUR = Object.freeze({
${zeilen.join('\n')}
});
`;

if (process.argv.includes('--pruefen')) {
  const alt = readFileSync(ZIEL, 'utf8');
  if (alt !== inhalt) { console.error('ausruestung-spezial.js ist veraltet: node scripts/ausruestung-zuordnen.mjs'); process.exit(1); }
  console.log('ausruestung-spezial.js ist aktuell');
} else {
  writeFileSync(ZIEL, inhalt);
  console.log(`${Object.keys(tabelle).length} Figuren zugeordnet -> ${ZIEL}`);
}
