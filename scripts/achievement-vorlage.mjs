#!/usr/bin/env node
/**
 * Bereitet die Erfolgs-Entscheidung vor.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die 11 Erfolge in `shared/achievements.js` sind **Muster** (`muster: true`).
 * Der Modulkopf sagt ausdrücklich: Namen, Texte, Symbole und Belohnungen sind
 * eine **Gestaltungsentscheidung des Auftraggebers** — sie wurden bewusst nicht
 * erfunden.
 *
 * Die Mechanik ist fertig. Zum Ersetzen genügt es, `ACHIEVEMENTS` zu tauschen:
 * `muster: true` entfernen und die Inhalte setzen. Kein Code.
 *
 * Dieses Werkzeug legt die Entscheidung als **Tabelle** vor — mit dem, was
 * gemessen ist, neben dem, was entschieden werden muss. Es schlägt nichts vor:
 * Es zeigt, was fehlt.
 *
 * ## Aufruf
 *
 *     node scripts/check-achievements.mjs --katalog
 */
import { ACHIEVEMENTS, TIERS, MUSTER_ANZAHL } from '../src/shared/achievements.js';
import { MatchController } from '../src/engine/match.js';

const args = process.argv.slice(2);
const KATALOG = args.includes('--katalog');

/**
 * Misst eine Partie, um die erreichbaren Werte zu kennen.
 *
 * Die Schwellen der Muster sind bereits geprüft (`--seeds`); hier geht es um
 * die Frage, welche Kennzahlen ein Katalog ENTHALTEN könnte.
 */
function messePartie(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let schuesse = 0;
  let treffer = 0;
  let schaden = 0;
  let runde = 0;
  let schutz = 0;

  while (match.status === 'playing' && schutz < 3000) {
    const zustand = match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (!aktiv?.alive) { match.endTurn(); schutz += 1; continue; }

    if (aktiv.teamId === 0) {
      const waffe = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      const vorher = new Map(
        zustand.entities.filter(e => e.teamId === 1).map(e => [e.entityId, e.health]),
      );
      const ergebnis = match.fire(aktiv.entityId, WINKEL[runde % WINKEL.length], 80, waffe);
      if (ergebnis.ok) { schuesse += 1; runde += 1; }

      let s2 = 0;
      while (match.activeProjectileCount > 0 && s2 < 400) {
        match.step();
        match.consumeEvents();
        s2 += 1;
      }
      for (const g of match.getState().entities.filter(e => e.teamId === 1)) {
        const vor = vorher.get(g.entityId) ?? 0;
        if (g.health < vor) { treffer += 1; schaden += vor - g.health; }
      }
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  const ende = match.getState();
  return {
    runden: ende.round ?? 0,
    schuesse,
    treffer,
    schaden: Math.round(schaden),
    siege: ende.winnerTeamId === 0 ? 1 : 0,
  };
}

const partien = [];
for (let i = 0; i < 3; i += 1) partien.push(messePartie(1000 + i * 137));
const mittel = feld => partien.reduce((s, p) => s + p[feld], 0) / partien.length;

console.log('Erfolge: Entscheidungsvorlage');
console.log('');
console.log(`  Einträge: ${ACHIEVEMENTS.length} | davon Muster: ${MUSTER_ANZAHL}`);
console.log(`  Stufen: ${TIERS.join(', ')}`);
console.log('');

if (!KATALOG) {
  console.log('Was gemessen ist (3 Partien, damit Schwellen begründbar sind):');
  console.log('');
  console.log(`  Runden je Partie   ${mittel('runden').toFixed(0)}`);
  console.log(`  Schüsse je Partie  ${mittel('schuesse').toFixed(0)}`);
  console.log(`  Treffer je Partie  ${mittel('treffer').toFixed(1)} (${((mittel('treffer') / mittel('schuesse')) * 100).toFixed(0)} %)`);
  console.log(`  Schaden je Partie  ${mittel('schaden').toFixed(0)}`);
  console.log('');
  console.log('Diese Zahlen sind der Maßstab für jede Schwelle: Ein Erfolg über');
  console.log('„5.000 Schaden" wäre bei ~150 je Partie erst nach 33 Partien erreicht.');
  console.log('');
  console.log('Die vollständige Vorlage: node scripts/check-achievements.mjs --katalog');
  process.exit(0);
}

/*
 * Die Vorlage: je Eintrag das Vorhandene (Mechanik, geprüft) neben dem Fehlenden
 * (Inhalt, zu entscheiden).
 */
console.log('VORLAGE ZUM AUSFÜLLEN');
console.log('');
console.log('Spalte "Bedingung" ist fertig und geprüft.');
console.log('Spalten "Name", "Symbol", "Belohnung" sind zu entscheiden.');
console.log('');

for (const [index, eintrag] of ACHIEVEMENTS.entries()) {
  const bed = eintrag.condition;
  const bedText = `${bed.kennzahl} >= ${bed.wert}`;
  console.log(`${String(index + 1).padStart(2)}. ${eintrag.title.replace(/^Muster:\s*/, '')}`);
  console.log(`    Stufe:      ${eintrag.tier}`);
  console.log(`    Gruppe:     ${eintrag.category}`);
  console.log(`    Bedingung:  ${bedText}   (fertig, geprüft)`);
  console.log(`    Text:       ${eintrag.text}`);
  console.log(`    Hinweis:    ${eintrag.hint}`);
  console.log(`    ZU ENTSCHEIDEN -> Name · Symbol · Belohnung`);
  console.log('');
}

console.log('SO WIRD ES EINGETRAGEN');
console.log('');
console.log('  In `src/shared/achievements.js` je Eintrag:');
console.log('');
console.log("    title: 'Muster: Erster Schuss'   ->  title: '<dein Name>'");
console.log("    icon:  'muster-schuss'           ->  icon:  '<dein Symbol>'");
console.log('    reward: null                     ->  reward: <deine Belohnung>');
console.log('    muster: true                     ->  (Zeile entfernen)');
console.log('');
console.log('  Dann:');
console.log('');
console.log('    npm run check:achievements -- --seeds=3   # Schwellen erneut prüfen');
console.log('    npm test                                  # die Mechanik bleibt unberührt');
console.log('');
console.log('  Die Auswertung, die Übersicht und die Fortschrittsbalken bleiben');
console.log('  unverändert — es ist eine Tabellenzeile, kein Code.');
