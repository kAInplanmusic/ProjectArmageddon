#!/usr/bin/env node
/**
 * Misst, ob Kisten erreichbar sind — und was ein größerer Radius bewirkt.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Der Aufheberadius für Kisten war **18 px**
 * bei Karten von 1280 px Breite. Nachgemessen kam eine Figur praktisch nie in
 * Reichweite — der Loot-Strang hing an einem Zufall.
 *
 * ## Warum dieser Aufbau so aussieht, wie er aussieht
 *
 * Beim Bau dieses Werkzeugs sind DREI Messfehler passiert. Sie stehen hier,
 * weil sie ohne Erklärung wieder passieren würden:
 *
 *   1. **Die Figur sprang fast nie.** Ein Rhythmus aus der Schrittzahl
 *      (`schritt % 35`) traf kaum einen Zug — gemessen wurden 3 Sprünge in
 *      einer ganzen Partie. Ein Messaufbau, in dem sich nichts bewegt, misst
 *      nur, wo die Kisten zufällig entstehen.
 *   2. **Der Sprung wurde abgelehnt.** `jump()` antwortet
 *      „In der Luft ist kein erster Sprung möglich", weil eine Figur beim
 *      Aufstellen auf `boden - 12` steht (Kopfposition) und die Physik sie
 *      erst fallen lassen muss. Richtig ist: erst `isGrounded()` abwarten.
 *   3. **Der Wert war abgeschrieben.** Das Werkzeug trug `HEUTE = 18` als
 *      eigene Konstante — nach der Änderung auf 70 px meldete es weiter
 *      „heute 18 px". Jetzt liest es `PICKUP_RADIUS` aus dem Code: eine Quelle.
 *
 * ## Aufruf
 *
 *     node scripts/check-crates.mjs
 *     node scripts/check-crates.mjs --seeds=6
 */
import { MatchController } from '../src/engine/match.js';
import { PICKUP_RADIUS as HEUTE } from '../src/engine/systems/lootSystem.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('seeds') ?? 6);

/** Die geprüften Radien — um den heutigen Wert herum. */
const RADIEN = [18, 40, HEUTE, 110, 160].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

/**
 * Misst eine Partie: kleinster Abstand zur Kiste und Berührungen je Radius.
 *
 * Die Figuren SPRINGEN wirklich — der Aufbau lässt sie vor jedem Absprung
 * landen (`isGrounded`), sonst lehnt die Physik den Sprung ab.
 */
function messe(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  let minAbstand = Infinity;
  let spruenge = 0;
  const treffer = Object.fromEntries(RADIEN.map(r => [r, 0]));

  for (let schritt = 0; schritt < 2500 && match.status === 'playing'; schritt += 1) {
    const zustand = match.getState();

    // Messen.
    for (const kiste of (zustand.crates ?? [])) {
      for (const e of zustand.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - kiste.x, e.y - kiste.y);
        if (d < minAbstand) minAbstand = d;
        for (const r of RADIEN) if (d <= r) treffer[r] += 1;
      }
    }

    /*
     * Springen: nur der aktive Spieler kann es, und nur vom Boden aus.
     * Die Figur wird deshalb erst landen gelassen.
     */
    const aktiv = match.activePlayerId;
    if (aktiv !== null && match.isGrounded?.(aktiv)) {
      const ergebnis = match.jump(aktiv, schritt % 3 === 0);
      if (ergebnis?.ok) spruenge += 1;

      // Ein paar Schritte fliegen lassen, damit der Sprung wirkt.
      for (let i = 0; i < 12 && match.status === 'playing'; i += 1) {
        match.step();
        match.consumeEvents();
      }
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
  }

  return {
    seed,
    minAbstand: Number.isFinite(minAbstand) ? Math.round(minAbstand) : null,
    spruenge,
    treffer,
  };
}

console.log(`Kisten-Reichweite: ${ANZAHL} Partien, heute ${HEUTE} px`);
console.log('');
console.log(`Seed    kleinster Abstand   Sprünge   Berührungen je Radius`);
console.log('-'.repeat(74));

const ergebnisse = [];
for (let i = 0; i < ANZAHL; i += 1) {
  const r = messe(1000 + i * 137);
  ergebnisse.push(r);
  const zeile = RADIEN.map(rad => `${rad}:${r.treffer[rad]}`).join('  ');
  console.log(
    `${String(r.seed).padStart(4)}    ${String(r.minAbstand ?? '—').padStart(10)} px`
    + `${String(r.spruenge).padStart(10)}   ${zeile}`,
  );
}

console.log('');
console.log(`${'Radius'.padStart(8)}${'Partien mit Berührung'.padStart(24)}${'Berührungen gesamt'.padStart(20)}`);
console.log('-'.repeat(54));

for (const rad of RADIEN) {
  const partien = ergebnisse.filter(e => e.treffer[rad] > 0).length;
  const gesamt = ergebnisse.reduce((s, e) => s + e.treffer[rad], 0);
  const marke = rad === HEUTE ? '  <- heute' : '';
  console.log(
    `${`${rad} px`.padStart(8)}${`${partien} von ${ANZAHL}`.padStart(24)}`
    + `${String(gesamt).padStart(20)}${marke}`,
  );
}

const heutePartien = ergebnisse.filter(e => e.treffer[HEUTE] > 0).length;
const keineBewegung = ergebnisse.filter(e => e.spruenge === 0).length;

console.log('');
if (keineBewegung > 0) {
  console.log(`WARNUNG: In ${keineBewegung} Partien kam kein einziger Sprung zustande.`);
  console.log('  Die Messung wäre dann nur eine Aussage über die Spawn-Orte, nicht über');
  console.log('  die Erreichbarkeit. Der Aufbau ist zu prüfen.');
  process.exitCode = 1;
} else if (heutePartien === 0) {
  console.log(`BEFUND: Bei ${HEUTE} px kam in KEINER der ${ANZAHL} Partien eine Figur in Reichweite.`);
} else if (heutePartien < ANZAHL) {
  console.log(`BEFUND: Bei ${HEUTE} px kam in ${heutePartien} von ${ANZAHL} Partien eine Figur in Reichweite.`);
} else {
  console.log(`Bei ${HEUTE} px kam in allen ${ANZAHL} Partien eine Berührung zustande.`);
}

console.log('');
console.log('WAS DER RADIUS BESTIMMT');
console.log('');
console.log('  Der Radius entscheidet, was eine Kiste IST:');
console.log('');
console.log('  - klein: eine Belohnung fuer Zufall. Wer nicht zufaellig auf ihr');
console.log('    landet, kommt nie an sie heran — es gibt keine Wurf- oder');
console.log('    Greifmechanik. Der Loot-Strang ist dann Kosmetik.');
console.log('  - mittel: eine erreichbare Wahl. Man muss fuer die Kiste etwas tun,');
console.log('    kann es aber planen.');
console.log('  - gross: ein Automatismus. Die Kiste wird im Vorbeigehen eingesammelt.');
console.log('');
console.log('  Die Tabelle oben zeigt, was jeder Wert bewirkt. Der aktive Wert steht');
console.log(`  in lootSystem.js (${HEUTE} px) und wird von hier gelesen — nicht abgeschrieben.`);
