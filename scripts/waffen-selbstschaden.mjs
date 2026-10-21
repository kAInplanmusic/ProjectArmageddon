#!/usr/bin/env node
/**
 * Selbstschaden-Fallen: Welche Waffen schaden dem SCHÜTZEN leicht selbst?
 *
 * Je Waffe werden Winkel x Kraft gegen freies Gelände geschossen (kein Gegner in der Nähe)
 * und der Schaden gemessen, den der Schütze durch den eigenen Schuss erleidet
 * (Schadensereignis mit Angreifer = Opfer, ohne den Fallschaden des Bodens: der hat keinen
 * Angreifer). Bewertet wird der Anteil der Einstellungen,
 *   - die dem Schützen überhaupt schaden (`anteil`),
 *   - die einen Scout (kleinste Gesundheit) töten (`toedlich`),
 * und der größte Selbstschaden (`maximum`). Eine Falle ist eine Waffe, die schon bei
 * gewöhnlichen Einstellungen (nicht nur bei Absicht) tötet.
 *
 * `--fassung=N` misst mit der Waffenfassung N (Standard: Motorstandard).
 *
 * Aufruf: node scripts/waffen-selbstschaden.mjs [--json] [--nur=pa_001,pa_028] [--fassung=4]
 */
import { MatchController, BASE_HEALTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { WAFFEN_STANDARD, getWaffe } from '../src/shared/config/waffen-fassung.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const FASSUNG = args.fassung ? Number(args.fassung) : WAFFEN_STANDARD;

export const WINKEL = Object.freeze([0.1, 0.4, 0.7, 1.0, 1.3, 1.5]);
export const KRAEFTE = Object.freeze([20, 45, 70, 100]);
/** Eine Waffe gilt als Falle, wenn mindestens dieser Anteil der Einstellungen den Scout tötet. */
export const FALLE_ANTEIL = 0.05;

export function scoutLeben() {
  return Math.round(BASE_HEALTH * Math.min(...CLASS_IDS.map(k => combatProfile(k).healthMultiplier)));
}

function schuss(waffe, winkel, kraft, seed) {
  const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, schaden: 1, waffen: FASSUNG });
  match.start();
  const z = match.getState();
  const schuetze = z.entities.find(e => e.entityId === match.activePlayerId);
  if (!schuetze) return null;
  const w = match.world;
  for (let i = 0; i < 10; i += 1) { match.step(); match.consumeEvents(); }
  match.inventory.register(schuetze.entityId, [waffe.id]);
  match.inventory.selectWeapon(schuetze.entityId, waffe.id);
  const r = match.fire(schuetze.entityId, winkel, kraft, waffe.id);
  if (!r.ok) return null;
  let selbst = 0;
  const sammle = () => {
    for (const e of match.consumeEvents()) {
      if (e.type === 'damage' && e.payload.entityId === schuetze.entityId && e.payload.attackerId === schuetze.entityId) selbst += e.payload.amount;
    }
  };
  let g = 0;
  while (match.activeProjectileCount > 0 && g < 900) { match.step(); sammle(); g += 1; }
  for (let i = 0; i < 12; i += 1) { match.step(); sammle(); }
  void w;
  return selbst;
}

export function messeSelbstschaden(waffe, index) {
  const seed = 777 + index * 31;
  const leben = scoutLeben();
  let gueltig = 0; let schaden = 0; let toedlich = 0; let maximum = 0;
  for (const winkel of WINKEL) {
    for (const kraft of KRAEFTE) {
      const s = schuss(waffe, winkel, kraft, seed);
      if (s === null) continue;
      gueltig += 1;
      if (s > 0) schaden += 1;
      if (s >= leben) toedlich += 1;
      maximum = Math.max(maximum, s);
    }
  }
  return {
    id: waffe.id, name: waffe.displayName, stufe: waffe.powerTier, gueltig,
    anteil: gueltig ? Number((schaden / gueltig).toFixed(2)) : 0,
    toedlich: gueltig ? Number((toedlich / gueltig).toFixed(2)) : 0,
    maximum: Number(maximum.toFixed(1)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nur = typeof args.nur === 'string' ? new Set(args.nur.split(',')) : null;
  const ids = WEAPONS.map(w => w.id).filter(id => !nur || nur.has(id));
  const liste = ids.map((id, i) => messeSelbstschaden(getWaffe(id, FASSUNG), i)).filter(m => m.gueltig > 0);
  const fallen = liste.filter(m => m.toedlich >= FALLE_ANTEIL);
  if (args.json) {
    console.log(JSON.stringify({ scoutLeben: scoutLeben(), fassung: FASSUNG, fallen, waffen: liste }, null, 1));
  } else {
    console.log(`Scout-Leben ${scoutLeben()}; Fassung ${FASSUNG}; ${liste.length} Waffen gemessen; Fallen (>= ${FALLE_ANTEIL * 100} % tödlich): ${fallen.length}`);
    for (const f of fallen.sort((a, b) => b.toedlich - a.toedlich)) {
      console.log(`  ${f.id} ${f.name} [${f.stufe}] tödlich ${Math.round(f.toedlich * 100)} %, schadet ${Math.round(f.anteil * 100)} %, max ${f.maximum}`);
    }
  }
}
