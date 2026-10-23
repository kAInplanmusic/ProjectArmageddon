#!/usr/bin/env node
/** Erzeugt docs/terrain-inventar.md: alle Stoffe mit Eigenschaften, Textur, Biomen, Texturdateien, Planeten, Kulissen-Zahlen. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STOFFE } from '../src/shared/config/stoffe.js';
import { STOFF_TEXTUR } from '../src/client/stoffTexturen.js';
import { NEUE_BIOME } from '../src/shared/config/biome-neu.js';
import { ALTE_REZEPTE } from '../src/shared/config/stoff-rezepte.js';
import { TERRAIN_MATERIALS } from '../src/shared/config/terrain.js';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const verz = p => fs.existsSync(wurzel + p) ? fs.readdirSync(wurzel + p) : [];
const nutzung = {};
const merke = (stoff, biom) => { (nutzung[stoff] ??= new Set()).add(biom); };
const alle = {};
for (const [id, b] of Object.entries(NEUE_BIOME)) alle[id] = b.stoffe;
for (const [id, r] of Object.entries(ALTE_REZEPTE)) alle[id] = r;
for (const [biom, r] of Object.entries(alle)) {
  if (!r) continue;
  for (const [s] of r.deck || []) merke(s, biom);
  if (r.kern) merke(r.kern, biom);
  for (const a of r.adern || []) merke(a.stoff, biom);
}
let md = '# Terrain-Inventar (alles zum Gelände auf einen Blick)\n\n*Erzeugt mit `node scripts/terrain-inventar.mjs` aus Config und Dateien.*\n\n';
md += '## 1. Stoffe (18) mit Eigenschaften, Textur und Vorkommen\n\n| Stoff | Härte | Radius/Tiefe | Brüchig | Brennbar | Schmelzbar | Anfälligkeit | Textur (Client) | Vorkommen in Biomen |\n|---|---|---|---|---|---|---|---|---|\n';
for (const s of STOFFE) {
  const an = Object.entries(s.anfaellig || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || '–';
  md += `| ${s.label} (\`${s.key}\`) | ${s.haerte} | ${s.radius}/${s.tiefe} | ${s.bruechig || '–'} | ${s.brennbar ? 'ja' : '–'} | ${s.schmelzbar ? 'ja' : '–'} | ${an} | ${STOFF_TEXTUR[s.key] ?? '–'} | ${[...(nutzung[s.key] || [])].filter(Boolean).join(', ') || '–'} |\n`;
}
md += '\n## 2. Gelände-Eigenschaften (Oberflächenverhalten)\n\nIds ' + Object.keys(TERRAIN_MATERIALS).join(', ') + ' = normal, Eis (rutschig), Gummi (federnd).\n';
md += '\n## 3. Kartenformen\n\nhills, mountains, islands, caverns, flooded, open, spires, warren (`src/shared/config/terrain.js`). Verteilung je Biom: `docs/biome-uebersicht.md`.\n';
const gruppe = (titel, pfad, filter = () => true) => { const f = verz(pfad).filter(filter); md += `\n### ${titel} (\`${pfad}\`, ${f.length})\n\n${f.join(', ') || '–'}\n`; };
md += '\n## 4. Texturen und Terrain-Bilder\n';
gruppe('Eingebaute Stoff-Texturen (512 px)', 'src/client/assets/stoff-texturen');
gruppe('Neue Stoff-Texturen für die SSOT-Materialien (noch nicht eingebaut)', 'src/client/assets/stoff-texturen-neu');
gruppe('Originale Auftraggeber-Texturen (1024 px)', 'src/client/assets/material-texturen', f => /\.(jpg|png|webp)$/.test(f));
gruppe('Planeten (Kugeln)', 'src/client/assets/material-texturen/planeten');
gruppe('Effekt-Sheets (Original)', 'src/client/assets/material-texturen/effekte');
gruppe('Effekt-Sheets (eingebaut, WebP)', 'src/client/assets/effekt-sheets');
gruppe('Comic-Terrain-Kacheln (Stilreferenz)', 'src/client/assets/terrain-vorlagen');
gruppe('Objekt-Sheets je Biom (SSOT, noch nicht eingebaut)', 'src/client/assets/biom-objekte');
gruppe('Kulissen der Planeten', 'src/client/assets/planeten-kulisse');
md += `\n### Kulissen (Hintergründe)\n\nBasis \`src/client/assets/backdrops/\` (${verz('src/client/assets/backdrops').filter(f => f.endsWith('.jpg')).length}), Stimmungen \`backdrops/stimmung/\` (${verz('src/client/assets/backdrops/stimmung').length}, quer und \`_h\` hochkant).\n`;
md += `\n### Biom-Beispielbilder\n\n\`docs/bilder/biome-realistisch/\` (${verz('docs/bilder/biome-realistisch').length} Dateien: Spielbild \`_spiel\` und fotorealistische Fassung).\n`;
md += '\n## 5. Fehlt laut SSOT (Aufgabe BS-1)\n\nschlacke, schwefelkruste, salzkruste, kalkstein, moos, alienharz, firn, wolkenstein, magnetgestein, keramik, lavaglas, bimsstein, tempelstein, mauerwerk, rostmetall, tiefseeschlamm, hydrothermal, versteinertes_holz, kolossholz, instabiler_boden, teer, treibsand, myzel, leuchtalgen (Texturen dafür siehe `stoff-texturen-neu`, sobald erzeugt).\n';
fs.writeFileSync(wurzel + 'docs/terrain-inventar.md', md);
console.log(md);
