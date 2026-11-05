#!/usr/bin/env node
/**
 * Vorher/Nachher-Vergleich der Waffenfassungen 14 und 15 (GP-4 Tempo).
 *
 * Liest die beiden Messdateien aus `scripts/waffen-balance.mjs` und stellt sie
 * gegenüber:
 *
 *   node scripts/waffen-balance.mjs --waffen=14 --json > docs/balance-auslese/waffen-vorher.json
 *   node scripts/waffen-balance.mjs --waffen=15 --json > docs/balance-auslese/waffen-nachher.json
 *   node scripts/balance-tempo-vergleich.mjs
 *
 * Ausgewertet wird nur, was die Messung wirklich trägt:
 *  - **Schüsse bis Sieg (STK)** je Klasse und je Kategorie: Median über die Waffen
 *    mit Schaden am Ziel (Selbstwirkungen haben keinen Schaden und würden den
 *    Median künstlich nach unten ziehen).
 *  - **Schaden je Kategorie**: Median des besten Treffers.
 *  - **Flächenanteil**: Anteil der Waffen mit `blastRadius > 0` an den Waffen mit
 *    Schaden und an der Summe des gemessenen Schadens.
 *  - **Ein-Treffer-Kills**: Waffen, deren Treffer die 100-LP-Figur mit einem Schuss
 *    fällt — vorher und nachher, damit „kein NEUER Ein-Treffer-Kill" belegt ist.
 *
 * Bewusst NICHT ausgewertet wird der Median über alle Waffen samt Waffen ohne
 * Schaden am Ziel: Das sind Werkzeuge und Selbstwirkungen, kein Kampfschaden.
 *
 * @module scripts/balance-tempo-vergleich
 */
import { readFileSync } from 'node:fs';
import { WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VORHER = resolve(WURZEL, 'docs/balance-auslese/waffen-vorher.json');
const NACHHER = resolve(WURZEL, 'docs/balance-auslese/waffen-nachher.json');

const KLASSEN = Object.freeze(['nahkampf', 'fernkampf', 'okkultist']);
const ZIEL_LEBEN = 100; // Fernkämpfer-Figur, Klassenfassung 3

const lies = pfad => JSON.parse(readFileSync(pfad, 'utf8'));

/** Median; bei gerader Anzahl das Mittel der beiden mittleren Werte. */
function median(werte) {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const runde = (wert, stellen = 1) => (wert === null ? '—' : Number(wert.toFixed(stellen)).toString());

/** Nur Waffen, die überhaupt Schaden am Ziel anrichten. */
const kampf = bericht => bericht.waffen.filter(w => !w.selbstwirkung && w.schadenBest > 0);

function kennzahlen(bericht) {
  const waffen = kampf(bericht);
  return {
    anzahl: waffen.length,
    stk: Object.fromEntries(KLASSEN.map(k => [k, median(waffen.map(w => w.stk[k]))])),
    stkMittel: Object.fromEntries(KLASSEN.map(k => [k, waffen.reduce((s, w) => s + w.stk[k], 0) / waffen.length])),
    kategorien: Object.fromEntries([...new Set(waffen.map(w => w.kategorie))].sort().map(kategorie => {
      const gruppe = waffen.filter(w => w.kategorie === kategorie);
      return [kategorie, {
        anzahl: gruppe.length,
        schaden: median(gruppe.map(w => w.schadenBest)),
        stk: median(gruppe.map(w => w.stk.fernkampf)),
      }];
    })),
    // Flächenwaffen: Katalogfeld `blastRadius` — gemessen wird der Schaden am Ziel,
    // die Fläche ist eine Eigenschaft der Waffe.
    flaechen: (() => {
      const mitFlaeche = waffen.filter(w => (WEAPONS_BY_ID[w.id]?.blastRadius ?? 0) > 0);
      const summe = waffen.reduce((s, w) => s + w.schadenBest, 0);
      return {
        anzahl: mitFlaeche.length,
        anteilWaffen: mitFlaeche.length / waffen.length,
        anteilSchaden: summe > 0 ? mitFlaeche.reduce((s, w) => s + w.schadenBest, 0) / summe : 0,
      };
    })(),
    // Ein-Treffer-Kill gegen die 100-LP-Figur (nur Waffen, die wirklich treffen).
    einTreffer: waffen.filter(w => w.schadenBest >= ZIEL_LEBEN).map(w => w.id),
  };
}

function tabelle(vorher, nachher) {
  const a = kennzahlen(vorher);
  const b = kennzahlen(nachher);
  const zeilen = [];

  zeilen.push('| Kennzahl | vorher (Fassung 14) | nachher (Fassung 15) |');
  zeilen.push('| :-- | --: | --: |');
  for (const k of KLASSEN) {
    zeilen.push(`| Median Schüsse bis Sieg — ${k} | ${runde(a.stk[k])} | ${runde(b.stk[k])} |`);
  }
  for (const k of KLASSEN) {
    zeilen.push(`| Mittel Schüsse bis Sieg — ${k} | ${runde(a.stkMittel[k], 2)} | ${runde(b.stkMittel[k], 2)} |`);
  }
  zeilen.push(`| Waffen mit Schaden am Ziel | ${a.anzahl} | ${b.anzahl} |`);
  zeilen.push(`| Waffen, die die 100-LP-Figur mit einem Schuss fällen | ${a.einTreffer.length} | ${b.einTreffer.length} |`);
  zeilen.push(`| Flächenwaffen (Anteil Waffen / Anteil Schaden) | ${a.flaechen.anzahl} (${runde(a.flaechen.anteilWaffen * 100)} % / ${runde(a.flaechen.anteilSchaden * 100)} %) | ${b.flaechen.anzahl} (${runde(b.flaechen.anteilWaffen * 100)} % / ${runde(b.flaechen.anteilSchaden * 100)} %) |`);

  zeilen.push('');
  zeilen.push('| Kategorie | Waffen | Median Schaden vorher | nachher | STK vorher | nachher |');
  zeilen.push('| :-- | --: | --: | --: | --: | --: |');
  for (const kategorie of Object.keys(a.kategorien)) {
    const x = a.kategorien[kategorie];
    const y = b.kategorien[kategorie] ?? { schaden: null, stk: null, anzahl: 0 };
    zeilen.push(`| ${kategorie} | ${x.anzahl} | ${runde(x.schaden)} | ${runde(y.schaden)} | ${runde(x.stk)} | ${runde(y.stk)} |`);
  }
  return { text: zeilen.join('\n'), vorher: a, nachher: b };
}

if (import.meta.main) {
  const { text, vorher, nachher } = tabelle(lies(VORHER), lies(NACHHER));
  console.log('GP-4 Tempo — Waffenfassung 14 gegen 15\n');
  console.log(text);
  console.log(`\nEin-Treffer-Kills vorher: ${vorher.einTreffer.join(', ') || 'keine'}`);
  console.log(`Ein-Treffer-Kills nachher: ${nachher.einTreffer.join(', ') || 'keine'}`);
}
