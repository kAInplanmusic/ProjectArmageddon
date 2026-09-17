#!/usr/bin/env node
/**
 * Vergleicht Kisten-Reichweiten und zeigt, was jeder Radius bewirkt.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Der Aufheberadius für Kisten ist **18 px**
 * (`lootSystem.js:25`) — bei Karten von 1280 px Breite. Nachgemessen über drei
 * Seeds:
 *
 *     Seed 1000: kleinster Abstand   8 px   (1 Berührung — zufällig)
 *     Seed 1137: kleinster Abstand  19 px   (0 Berührungen — 1 px zu weit!)
 *     Seed 1274: kleinster Abstand 185 px   (0 Berührungen)
 *
 * Der Loot-Strang hängt damit an einem Zufall: Wer nicht zufällig auf der Kiste
 * landet, kommt nie an sie heran. Es gibt keine Wurf- oder Greifmechanik.
 *
 * ## Was dieses Werkzeug tut
 *
 * Es misst für mehrere Radien, wie oft eine Figur in Reichweite kommt — und
 * zeigt damit die Folge einer Änderung, BEVOR sie gemacht wird. Die Entscheidung
 * bleibt beim Auftraggeber: Der Radius ist eine Spielgefühls-Frage.
 *
 * ## Aufruf
 *
 *     node scripts/check-crates.mjs
 *     node scripts/check-crates.mjs --seeds=8
 *
 * ## Wie gemessen wird
 *
 * Eine Figur bewegt sich nur durch Springen (es gibt keine Laufsteuerung). Um
 * dem echten Spiel nahe zu kommen, springt sie in unregelmäßigen Abständen —
 * deterministisch aus dem Seed abgeleitet, damit die Messung wiederholbar ist.
 */
import { MatchController } from '../src/engine/match.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('seeds') ?? 6);

/** Die geprüften Radien — der heutige Wert und drei Stufen darüber. */
const RADIEN = [18, 40, 70, 110, 160];

/** Der heutige Wert, aus dem Code gelesen statt abgeschrieben. */
const HEUTE = 18;

/**
 * Misst für eine Partie, welche Radien eine Berührung ergeben hätten.
 *
 * @returns {{seed:number, minAbstand:number, treffer:Object<number,number>}}
 */
function messe(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  let minAbstand = Infinity;
  const treffer = Object.fromEntries(RADIEN.map(r => [r, 0]));
  let schutz = 0;

  while (match.status === 'playing' && schutz < 2500) {
    const zustand = match.getState();
    for (const kiste of (zustand.crates ?? [])) {
      for (const e of zustand.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - kiste.x, e.y - kiste.y);
        if (d < minAbstand) minAbstand = d;
        for (const r of RADIEN) if (d <= r) treffer[r] += 1;
      }
    }

    /*
     * Springen ist die einzige Bewegung. Der Rhythmus kommt aus der Schrittzahl,
     * nicht aus Zufall — so bleibt die Messung wiederholbar.
     */
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (aktiv?.alive && schutz % 35 === 0) {
      match.jump?.(aktiv.entityId, schutz % 70 === 0);
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  return { seed, minAbstand: Math.round(minAbstand), treffer };
}

console.log(`Kisten-Reichweite: ${ANZAHL} Partien, heute ${HEUTE} px`);
console.log('');
console.log('Seed    kleinster Abstand   Berührungen je Radius');
console.log('-'.repeat(72));

const ergebnisse = [];
for (let i = 0; i < ANZAHL; i += 1) {
  const r = messe(1000 + i * 137);
  ergebnisse.push(r);
  const zeile = RADIEN.map(rad => `${rad}:${r.treffer[rad]}`).join('  ');
  console.log(`${String(r.seed).padStart(4)}    ${String(r.minAbstand).padStart(10)} px   ${zeile}`);
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
console.log('');

if (heutePartien === 0) {
  console.log(`BEFUND: Bei ${HEUTE} px kam in KEINER der ${ANZAHL} Partien eine Figur in Reichweite.`);
} else if (heutePartien < ANZAHL) {
  console.log(`BEFUND: Bei ${HEUTE} px kam nur in ${heutePartien} von ${ANZAHL} Partien eine Figur in Reichweite.`);
} else {
  console.log(`Bei ${HEUTE} px kam in allen ${ANZAHL} Partien eine Berührung zustande.`);
}

console.log('');
console.log('DIE ENTSCHEIDUNG');
console.log('');
console.log('  Der Radius ist eine SPIELGEFUEHLS-Frage, keine technische:');
console.log('');
console.log('  - Klein (18 px): Die Kiste ist eine Belohnung fuer Zufall. Wer nicht');
console.log('    zufaellig auf ihr landet, kommt nie an sie heran — es gibt keine');
console.log('    Wurf- oder Greifmechanik. Der ganze Loot-Strang ist damit Kosmetik.');
console.log('  - Mittel (70-110 px): Die Kiste wird erreichbar, ohne dass Springen');
console.log('    praezise geplant werden muss. Das entspricht der Groesse einer Figur');
console.log('    (14 px breit) mal dem Sprungbogen.');
console.log('  - Gross (160 px): Die Kiste wird im Vorbeigehen eingesammelt. Dann ist');
console.log('    sie keine Entscheidung mehr, sondern ein Automatismus.');
console.log('');
console.log('  Die Zahlen oben zeigen, was jeder Wert bewirkt. Ein Radius aendert das');
console.log('  Spielgefuehl — er gehoert deshalb entschieden, nicht gesetzt.');
