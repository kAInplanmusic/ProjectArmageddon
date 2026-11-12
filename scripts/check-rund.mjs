#!/usr/bin/env node
/**
 * Misst die runden Kartenarten (N-40, Geländefassung 14) im echten Match: Aufbauzeit, Speicher, Stand, Begehbarkeit, Spawn-Fairness.
 *
 *     node scripts/check-rund.mjs                       # 960 und 1920 px, Seeds 1 bis 6
 *     node scripts/check-rund.mjs --seiten=5760 --seeds=1,2,3
 *
 * Exit 1, wenn ein Wert die Grenzen des Tests (`tests/gelaende-fassung-14.test.js`) reißt.
 */
import { KARTENARTEN_RUND } from '../src/shared/config/gelaende.js';
import { messeRundeKarte } from '../tools/rund-messung.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SEITEN = String(args.get('seiten') ?? '960,1920').split(',').map(Number);
const SEEDS = String(args.get('seeds') ?? '1,2,3,4,5,6').split(',').map(Number);
let schlecht = 0;
console.log('Art              Seite Seed   ms  rssMB  Stand  Weg  Fair  Gegner  Höhe  erreichbar');
for (const seite of SEITEN) for (const art of KARTENARTEN_RUND) for (const seed of SEEDS) {
  const r = messeRundeKarte({ art, seite, seed });
  const ok = r.standBreite >= 0.25 * seite && r.standHin && r.imStand && r.aufBoden && r.erreichbar === true && r.fairness <= 1.3;
  if (!ok) schlecht += 1;
  console.log(`${art.padEnd(16)} ${String(seite).padStart(5)} ${String(seed).padStart(4)} ${String(r.ms).padStart(5)} ${String(Math.round(process.memoryUsage().rss / 1e6)).padStart(6)} ${String(r.standBreite).padStart(6)}  ${r.standHin ? 'ja ' : 'NEIN'} ${r.fairness.toFixed(2).padStart(5)} ${String(Math.round(r.naechsterGegner)).padStart(6)} ${String(Math.round(r.hoehenSpreizung)).padStart(5)}  ${r.erreichbar}${ok ? '' : '  <-- Grenze verletzt'}`);
}
console.log(schlecht === 0 ? '\nalle innerhalb der Grenzen' : `\n${schlecht} Karte(n) außerhalb der Grenzen`);
process.exit(schlecht === 0 ? 0 : 1);
