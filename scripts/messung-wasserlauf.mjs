#!/usr/bin/env node
/**
 * Messung Wasserlauf (TODO 2.1 WASSER-AUSBAU): Wie stark schiebt die Strömung nach einem Dammbruch?
 *
 * Aufbau mit den echten Bausteinen (`WaterField.stepAktiv`, `CharacterSystem`), aber auf einer festen Rinne statt
 * einer Zufallskarte, damit die Zahlen vergleichbar sind (Maße in Weltpixeln, Rasterzelle = `WATER_SCALE` = 4 px):
 *
 *   |≈≈≈≈ Stausee ≈≈≈≈|█ Damm █|      Figur          ▲ Fels      |
 *   0               240     256      400            600   640   800
 *
 * Der Damm wird in Takt 0 entfernt (wie ein Krater) und das Feld geweckt. Danach 1800 Takte (30 s): erst das Wasser,
 * dann die Figur, wie im Match (`match.js`: `stepAktiv` vor den Systemen). Gemessen je Schub und Stauhöhe:
 * Weg der Figur, Höchsttempo, ob sie am Fels hängen bleibt, höchster Pegel an der Figur, Ertrinkungsschaden.
 *
 * Nur Messung, keine Wertung. Aufruf: node scripts/messung-wasserlauf.mjs [--json]
 */
import { WaterField } from '../src/engine/waterField.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import { BIOMREGELN_STANDARD, BIOMREGELN_TREIBEN, wasserSchubFuer, wasserTeilschritte } from '../src/shared/config/biomregeln.js';
import { DROWN_LEVEL } from '../src/shared/config/water.js';
import { WATER_SCALE } from '../src/shared/config/match-konstanten.js';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

const BREITE = 800;
const HOEHE = 240;
const BODEN = 200; // y ab hier fest
const DAMM = [240, 256];
const FELS = [600, 640, 160]; // x0, x1, Oberkante
const TAKTE = 1800; // 30 s

/** Ein Lauf. `stau` = Wasserhöhe im Stausee in px, `schub` = WASSERLAUF.schub-Wert. */
/** Werte einer Biomregel-Fassung für `lauf`. */
export const werteFuer = fassung => ({ schub: wasserSchubFuer(fassung), teilschritte: wasserTeilschritte(fassung) });

export function lauf({ stau, schub, startX = 400, teilschritte = 1 }) {
  let dammDa = true;
  const fest = (x, y) => {
    if (x < 0 || x >= BREITE || y >= BODEN) return true;
    if (dammDa && x >= DAMM[0] && x < DAMM[1] && y >= BODEN - stau - 20) return true;
    if (x >= FELS[0] && x < FELS[1] && y >= FELS[2]) return true;
    return false;
  };
  const wasser = new WaterField({
    width: BREITE / WATER_SCALE, height: HOEHE / WATER_SCALE, worldScale: WATER_SCALE,
    isSolid: (cx, cy) => fest(cx * WATER_SCALE, cy * WATER_SCALE),
  });
  for (let cy = (BODEN - stau) / WATER_SCALE; cy < BODEN / WATER_SCALE; cy++) {
    for (let cx = 0; cx < DAMM[0] / WATER_SCALE; cx++) wasser.setLevel(cx, cy, 1);
  }

  const komp = { Position: { x: startX, y: BODEN - PLAYER_HALF_HEIGHT - 1 }, Velocity: { x: 0, y: 0 } };
  let schaden = 0;
  const world = {
    services: {
      terrain: { width: BREITE, height: HOEHE, isSolid: (x, y) => fest(Math.floor(x), Math.floor(y)) },
      water: wasser,
      events: { emit() {} },
      match: { wasserSchub: schub },
    },
    isActive: () => true,
    getSystem: () => ({ applyDamage(_id, menge) { schaden += menge; } }),
    getComponent: (_id, k, f) => komp[k]?.[f] ?? 0,
    setComponent: (_id, k, f, w) => { if (komp[k]) komp[k][f] = w; },
  };
  const system = new CharacterSystem();

  // Damm sprengen: Gelände weg, Feld wecken (wie `explosion.js` über `displace`/`wecke`).
  dammDa = false;
  wasser.wecke((DAMM[0] + DAMM[1]) / 2, BODEN - stau / 2, stau);

  const x0 = komp.Position.x;
  let front = DAMM[0]; const frontJeS = [];
  let vmax = 0; let pegelMax = 0; let flussMax = 0; let erreichtTakt = null; let nassTakte = 0;
  for (let t = 0; t < TAKTE; t++) {
    for (let i = 0; i < teilschritte; i++) wasser.stepAktiv();
    system.update(world, [1], 1000 / 60);
    const { x, y } = komp.Position;
    const pegel = wasser.levelAtWorld(x, y);
    if (pegel > 0.35) nassTakte++;
    if (erreichtTakt === null && pegel > 0.35) erreichtTakt = t;
    pegelMax = Math.max(pegelMax, pegel);
    vmax = Math.max(vmax, Math.abs(komp.Velocity.x));
    flussMax = Math.max(flussMax, Math.abs(wasser.flussAn(x, y)));
    if (t % 60 === 59) {
      const zeile = BODEN / WATER_SCALE - 1;
      for (let cx = Math.floor(front / WATER_SCALE); cx < BREITE / WATER_SCALE; cx++) if (wasser.getLevel(cx, zeile) > 0.05) front = cx * WATER_SCALE;
      frontJeS.push(front);
    }
  }
  const x1 = komp.Position.x;
  return {
    stau, schub, startX, teilschritte,
    front10s: frontJeS[9], front30s: frontJeS[29],
    weg: Math.round(x1 - x0),
    amFels: x1 >= FELS[0] - 30 && x1 < FELS[0],
    vmax: Math.round(vmax * 100) / 100,
    flussMax: Math.round(flussMax * 1000) / 1000,
    pegelMax: Math.round(pegelMax * 100) / 100,
    tief: pegelMax >= DROWN_LEVEL,
    schaden: Math.round(schaden * 10) / 10,
    wasserAnFigurNachS: erreichtTakt === null ? null : Math.round(erreichtTakt / 6) / 10,
    nassS: Math.round(nassTakte / 6) / 10,
  };
}

const istHaupt = import.meta.url === `file://${process.argv[1]}`;
if (istHaupt) {
  const zeilen = [];
  const nurTeil = process.argv.find(a => a.startsWith('--teilschritte='));
  const teile = nurTeil ? nurTeil.split('=')[1].split(',').map(Number) : [werteFuer(BIOMREGELN_TREIBEN).teilschritte, werteFuer(BIOMREGELN_STANDARD).teilschritte];
  const schuebe = process.argv.find(a => a.startsWith('--schub='))?.split('=')[1].split(',').map(Number) ?? [0, werteFuer(BIOMREGELN_TREIBEN).schub, werteFuer(BIOMREGELN_STANDARD).schub];
  for (const teilschritte of teile) {
    for (const stau of [80, 160]) {
      for (const startX of [280, 340, 400]) {
        for (const schub of schuebe) zeilen.push(lauf({ stau, schub, startX, teilschritte }));
      }
    }
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ fassung6: werteFuer(BIOMREGELN_TREIBEN), standard: werteFuer(BIOMREGELN_STANDARD), gehtempo: 1.2, zeilen }, null, 2));
  } else {
    console.log(`Dammbruch, 30 s; Damm endet bei x=256, Fels ab x=600. Fassung 6: ${JSON.stringify(werteFuer(BIOMREGELN_TREIBEN))}, Standard: ${JSON.stringify(werteFuer(BIOMREGELN_STANDARD))}, Gehtempo 1,2 px/Takt.`);
    console.log('| Teilschritte | Stau px | Figur x | Schub | Wasserfront 10 s / 30 s | Weg px | am Fels | vmax px/Takt | Strömung max | Pegel max | tief | Schaden | Wasser da nach s | nass s |');
    console.log('|---:|---:|---:|---:|---:|---:|:-:|---:|---:|---:|:-:|---:|---:|---:|');
    for (const z of zeilen) {
      console.log(`| ${z.teilschritte} | ${z.stau} | ${z.startX} | ${z.schub} | ${z.front10s} / ${z.front30s} | ${z.weg} | ${z.amFels ? 'ja' : '–'} | ${z.vmax} | ${z.flussMax} | ${z.pegelMax} | ${z.tief ? 'ja' : '–'} | ${z.schaden} | ${z.wasserAnFigurNachS ?? '–'} | ${z.nassS} |`);
    }
  }
}
