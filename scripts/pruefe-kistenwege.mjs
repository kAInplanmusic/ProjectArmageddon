/**
 * Zusammengeführte lokale Diagnose aus tmp-qualitaet.mjs und tmp-seeds.mjs.
 * Misst nur trockene Oberflächenwege in Ein-Pixel-Schritten (max. 10 px Aufstieg).
 * Sprünge, Seil, Flug und Erreichbarkeit unterirdischer Plattformen fehlen;
 * der Anteil ist eine Diagnose, kein Freigabe-Gate für die Spielbarkeit.
 * Aufruf: node scripts/pruefe-kistenwege.mjs [--groesse=kompakt] [--format=9:16] [--seed=4242]
 */
import { MatchController } from '../src/engine/match.js';
import { MAP_FORMATS, MAP_GROESSEN } from '../src/engine/karte.js';
import { WET_LEVEL } from '../src/shared/config/water.js';
const KISTEN_ANZAHL_PRUEFUNG = 24;
const STUFE = 10;
function kistenErreichbar(m, breite) {
  const hoehe = m.height;
  const oberflaeche = new Int32Array(breite);
  const trockenSp = new Uint8Array(breite);
  for (let x = 0; x < breite; x += 1) {
    const y = m.surfaceYAt(x);
    oberflaeche[x] = y;
    trockenSp[x] = y > 0 && y < hoehe && m.waterLevelAt(x, y - 14) < WET_LEVEL ? 1 : 0;
  }
  const erreicht = new Uint8Array(breite);
  const stapel = [];
  for (const e of m.getState().entities ?? []) {
    if (!e.alive || e.type === 'crate') continue;
    const x = Math.max(0, Math.min(breite - 1, Math.round(e.x)));
    if (trockenSp[x] && !erreicht[x]) { erreicht[x] = 1; stapel.push(x); }
  }
  while (stapel.length) {
    const x = stapel.pop();
    for (const nx of [x - 1, x + 1]) {
      if (nx < 0 || nx >= breite || erreicht[nx] || !trockenSp[nx]) continue;
      if (oberflaeche[x] - oberflaeche[nx] > STUFE) continue; // y wächst nach unten: Aufstieg = kleineres y
      erreicht[nx] = 1;
      stapel.push(nx);
    }
  }
  let trocken = 0;
  let erreichbar = 0;
  for (let i = 0; i < KISTEN_ANZAHL_PRUEFUNG; i += 1) {
    const x = Math.round(breite * (0.08 + 0.84 * (i + 0.5) / KISTEN_ANZAHL_PRUEFUNG));
    if (!trockenSp[x]) continue;
    trocken += 1;
    if (erreicht[x]) erreichbar += 1;
  }
  return { trocken, erreichbar, anteil: trocken ? erreichbar / trocken : 1, gesamt: KISTEN_ANZAHL_PRUEFUNG };
}

const args = new Map(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const groessen = args.has('groesse') ? [args.get('groesse')] : MAP_GROESSEN;
const formate = args.has('format') ? [args.get('format')] : MAP_FORMATS;
const seed = Number(args.get('seed') ?? 4242);
if (!Number.isInteger(seed) || groessen.some(g => !MAP_GROESSEN.includes(g)) || formate.some(f => !MAP_FORMATS.includes(f))) {
  throw new Error('Ungültiger Seed, Größe oder Format; siehe Aufruf am Dateikopf.');
}
const faelle = groessen.flatMap(groesse => formate.map(format => ({ seed, groesse, format })));
if (!args.size) faelle.push({ biom: 'pilzwald', seed: 951031 }, { biom: 'vulkan', seed: 1080350 });
for (const fall of faelle) {
  const m = new MatchController({ ...fall, kartentyp: 'autonom', teams: 2, playersPerTeam: 2 });
  m.start();
  console.log(JSON.stringify({ ...fall, breite: m.width, hoehe: m.height, startErreichbar: m.erreichbarkeit?.ok,
    kistenwege: kistenErreichbar(m, m.width) }));
}
