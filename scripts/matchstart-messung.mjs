#!/usr/bin/env node
/**
 * Misst, wie lange der Matchstart dauert (QV-7) — mit denselben Optionen wie das Menü
 * (`kartentyp` aus `MENUE_KARTENTYP`).
 *
 *     node scripts/matchstart-messung.mjs [--format=24:9] [--groesse=riesig] [--biom=klassisch] [--runs=3]
 *     node --cpu-prof scripts/matchstart-messung.mjs ...   # Profil für die Aufschlüsselung
 *
 * Gemessen wird nur die Engine (Konstruktor + start()); Zeichnen und Bilderladen des Clients sind nicht enthalten.
 */
import { performance } from 'node:perf_hooks';
import { MatchController } from '../src/engine/match.js';
import { MENUE_KARTENTYP } from '../src/shared/config/menueStart.js';

const a = new Map(process.argv.slice(2).map(s => { const [k, v] = s.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const format = a.get('format') ?? '24:9';
const groesse = a.get('groesse') ?? 'gross';
const biom = a.get('biom') === 'keins' ? null : (a.get('biom') ?? null);
const runs = Number(a.get('runs') ?? 3);

const zeilen = [];
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  const match = new MatchController({
    seed: 1000 + i, teams: 2, playersPerTeam: 2, preset: 'hills', kartentyp: MENUE_KARTENTYP, format, groesse, biom,
  });
  const t1 = performance.now();
  match.start();
  const t2 = performance.now();
  zeilen.push({ lauf: i, konstruktorMs: Math.round(t1 - t0), startMs: Math.round(t2 - t1), gesamtMs: Math.round(t2 - t0), breite: match.width, hoehe: match.height });
}
console.table(zeilen);
