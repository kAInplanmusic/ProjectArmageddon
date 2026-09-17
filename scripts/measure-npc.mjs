#!/usr/bin/env node
/**
 * Misst, was Günther heute tut — und wo er aufhört, interessant zu sein.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Auftrag lautet: „Günther und die NPCs müssen richtig gut werden."
 * Günther ist bereits im Spiel (`src/shared/config/guenther.js`), aber wie viel
 * Verhalten steckt wirklich dahinter?
 *
 * ## Was gemessen wird
 *
 * 1. **Wie oft er auftritt** — über viele Seeds. Ein NPC, den man einmal je
 *    hundert Partien sieht, ist keine Figur, sondern eine Randnotiz.
 * 2. **Was er tut** — die Ausgänge seines Rades und ihre Häufigkeit.
 * 3. **Wie er sich verhält** — hat er Ziele, Vorlieben, Reaktionen? Oder ist
 *    er ein Zufallsgenerator mit Namen?
 *
 * ## Aufruf
 *
 *     node scripts/measure-npc.mjs
 */
import { GUENTHER_WHEEL } from '../src/shared/config/guenther.js';
import { MatchController } from '../src/engine/match.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('partien') ?? 20);

console.log('Günther: Was steckt dahinter?');
console.log('');

/* ------------------------------------------------------------------ 1. Rad */
console.log('DAS RAD IM DIALOG');
console.log('');
console.log(`${'Ausgang'.padEnd(20)}${'Wirkung'.padStart(18)}${'Label'.padStart(30)}`);
console.log('-'.repeat(68));

for (const ausgang of GUENTHER_WHEEL) {
  const wirkung = ausgang.effect.kind;
  const detail = ausgang.effect.kind === 'damage' ? ` (${ausgang.effect.min}–${ausgang.effect.max})`
    : ausgang.effect.kind === 'legendaryWeapon' ? '' : '';
  console.log(
    `${ausgang.id.padEnd(20)}${`${wirkung}${detail}`.padStart(18)}`
    + `${ausgang.label.padStart(30)}`,
  );
}

console.log('');
console.log(`  Ausgänge insgesamt: ${GUENTHER_WHEEL.length}`);

/* -------------------------------------------------------------- 2. Auftritt */
console.log('');
console.log('WIE OFT TRITT ER AUF?');
console.log('');

let mitPlan = 0;
let mitAktivierung = 0;
const ereignisse = { guenther_wheel: 0, guenther_poop: 0, guenther_appear: 0 };

/*
 * ZWEI MESSFEHLER, die dieses Werkzeug zuerst hatte — und was sie lehrten.
 *
 * 1. **Der Zug wurde alle vier Schritte abgegeben.** Das ergab Runden von
 *    16 Ticks statt 4800 (20 s Zugzeit × 4 Spieler × 60 Hz). Günther hatte
 *    damit 300× weniger Zeit zum Laufen: gemessen bewegte er sich 106 px statt
 *    1496 px, und es kam keine einzige Begegnung zustande. Der Befund „Günther
 *    trifft niemanden" war ein Artefakt des Aufbaus.
 *
 * 2. **Die Position wurde je RUNDE abgetastet, nicht je Tick.** Ein Lauf von
 *    1,8 px/Tick sieht je Runde wie ein Sprung aus — das Muster „2518 → 2482 →
 *    2466" sah nach einem Fehler aus, war aber normales Laufen.
 *
 * Jetzt gilt: Der Zug wird erst abgegeben, wenn `turnElapsedMs` die Zugzeit
 * erreicht hat — wie im echten Spiel.
 */
for (let i = 0; i < ANZAHL; i += 1) {
  const match = new MatchController({
    seed: 1000 + i * 137, teams: 2, playersPerTeam: 2,
    preset: 'hills', turnDurationMs: 20000, maxRounds: 30,
  });
  match.start();
  match.consumeEvents();

  const plan = match.getState().guenther?.plan ?? [];
  if (plan.length > 0) mitPlan += 1;

  for (let s = 0; s < 2_000_000 && match.status === 'playing'; s += 1) {
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type in ereignisse) ereignisse[e.type] += 1;
    }
    const zustand = match.getState();
    // Zug erst abgeben, wenn die Zugzeit abgelaufen ist.
    if (zustand.turnElapsedMs >= zustand.turnDurationMs) match.endTurn();
  }

  const zustand = match.getState();
  if ((zustand.guenther?.haufen ?? []).length > 0) mitAktivierung += 1;
}

console.log(`  Partien geprüft:              ${ANZAHL}`);
console.log(`  mit einem Plan (Auftritte):   ${mitPlan} (${((mitPlan / ANZAHL) * 100).toFixed(0)} %)`);
console.log(`  mit sichtbarer Aktivität:     ${mitAktivierung} (${((mitAktivierung / ANZAHL) * 100).toFixed(0)} %)`);
console.log('');
console.log('  Ereignisse über alle Partien:');
for (const [typ, anzahl] of Object.entries(ereignisse)) {
  console.log(`    ${typ.padEnd(20)} ${anzahl}`);
}

console.log('');
console.log('WAS FEHLT — DIE BEOBACHTUNG AUS DEM CODE');
console.log('');
console.log('  Günther hat heute:');
console.log('    - einen Auftrittsplan (wann er erscheint)');
console.log('    - ein Glücksrad mit 5 Ausgängen');
console.log('    - Kackhaufen, die er hinterlässt');
console.log('');
console.log('  Günther hat NICHT:');
console.log('    - ein Ziel. Er behandelt alle gleich — kein Spieler ist ihm lieber.');
console.log('    - eine Reaktion auf das Geschehen. Er erscheint nach Plan, egal ob');
console.log('      jemand gewinnt oder verliert.');
console.log('    - eine Beziehung zu den Spielern. Wer ihn oft trifft, wird nicht');
console.log('      belohnt oder bestraft.');
console.log('    - Sprache. Die Labels des Rades sind Beschriftungen, keine Sätze.');
console.log('    - eine Persönlichkeit über die Mechanik hinaus: Er ist ein');
console.log('      Zufallsgenerator mit Namen.');
console.log('');
console.log('  Das ist der Ansatzpunkt: Nicht „mehr Mechanik", sondern eine FIGUR.');
console.log('  Ein NPC wird interessant, wenn er Vorlieben hat, sich erinnert und');
console.log('  überrascht — nicht, wenn er mehr Ausgänge würfelt.');
