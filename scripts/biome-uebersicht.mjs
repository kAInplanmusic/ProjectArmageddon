#!/usr/bin/env node
/** Erzeugt docs/biome-uebersicht.md aus den Configs (Biome, Gelände, Stoffe). Aufruf: node scripts/biome-uebersicht.mjs */
import fs from 'node:fs';
import { NEUE_BIOME } from '../src/shared/config/biome-neu.js';
import { THEMEN_BIOME } from '../src/shared/config/biome-themen.js';
import { ALTE_REZEPTE } from '../src/shared/config/stoff-rezepte.js';
import { BACKDROP_BIOMES } from '../src/shared/config/backdrops.js';

const stoffe = r => {
  if (!r) return '–';
  const deck = (r.deck || []).map(([s, d]) => `${s} (${d})`).join(', ') || '–';
  const adern = (r.adern || []).map(a => `${a.stoff} ${Math.round(a.dichte * 100)} %`).join(', ') || '–';
  return `Deck: ${deck}; Kern: ${r.kern ?? '–'}; Adern: ${adern}`;
};
const bereich = a => Array.isArray(a) ? `${a[0]}–${a[1]}` : a;
const form = f => f ? Object.entries(f).map(([k, v]) => `${k} ${bereich(v)}`).join(', ') : '–';
const zeile = (id, b) => `| \`${id}\` | ${b.label ?? id} | ${b.mapPreset ?? '–'} | ${(b.water || []).join(', ') || '–'} | ${(b.landmarks || []).join(', ') || '–'} | ${stoffe(b.stoffe)} | ${form(b.form)} |`;
const kopf = '| ID | Name | Kartenform | Wasser | Landmarken | Stoffe | Form (Bereiche) |\n|---|---|---|---|---|---|---|';

let md = '# Biome und Gelände — Übersicht\n\n*Erzeugt mit `node scripts/biome-uebersicht.mjs` aus den Configs. Zahlen in Klammern: Tiefe der Deckschicht in Pixeln.*\n\n';
md += `## Sonderbiome (Gelände-Fassung 2–4 und 7)\n\n${kopf}\n`;
for (const [id, b] of Object.entries(NEUE_BIOME)) if (!(id in THEMEN_BIOME)) md += zeile(id, b) + '\n';
md += `\n## Themenbiome (Gelände-Fassung 3)\n\n${kopf}\n`;
for (const [id, b] of Object.entries(THEMEN_BIOME)) md += zeile(id, b) + '\n';
md += '\n## Kulissenbiome (16, je 10 Varianten) mit Stoffrezept\n\n| ID | Name | Kartenform | Stoffe | Varianten |\n|---|---|---|---|---|\n';
for (const b of BACKDROP_BIOMES) md += `| \`${b.id}\` | ${b.label} | ${b.mapPreset} | ${stoffe(ALTE_REZEPTE[b.id])} | ${b.variants.map(v => v.label).join(', ')} |\n`;
md += '\nMaterial-Eigenschaften (Härte, Brennbarkeit, Zerstörbarkeit je Schadensart): siehe MASTERDOTO, „Biome und Materialien" und den Hilfe-Reiter „Karte und Gelände". Die fünf klassischen Karten (Kartenform-Spalte: `hills`, `mountains`, `islands`, `caverns`, `flooded`, `open`, `spires`, `warren`) sind in `src/shared/config/terrain.js` als Gelände-Voreinstellungen definiert.\n';
fs.writeFileSync(new URL('../docs/biome-uebersicht.md', import.meta.url), md);
console.log(md);
