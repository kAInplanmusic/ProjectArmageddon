#!/usr/bin/env node
/**
 * Prüft die Zünder-Zeiten gegen die tatsächliche Flugzeit.
 *
 * ## Der Befund
 *
 * Ein Audit stellte fest: Bei **allen 18 Zünder-Waffen** ist der Zünder länger
 * als die Flugzeit des Projektils. Jede zündet damit erst **nach** der Landung.
 *
 * Für eine Handgranate ist das gewollt — sie soll liegen bleiben und dann
 * zünden. Für „Meteoritenbrocken" (Zünder 4 s bei 0,66 s Flug = **Faktor 6**)
 * oder „Höllenkanone" (5 s) ist es vermutlich falsch: Diese Namen versprechen
 * einen Einschlag, keine Liegezeit.
 *
 * ## Warum dieses Werkzeug MELDET statt korrigiert
 *
 * Die Unterscheidung „Granate" gegen „Einschlagwaffe" ist **Namensdeutung**.
 * Ein Skript, das nach Wörtern wie „granate" sucht, würde irgendwann eine Waffe
 * falsch einordnen — und der Fehler wäre unsichtbar, weil er plausibel aussieht.
 *
 * Deshalb liefert das Werkzeug die Zahlen und die Entscheidungsfrage, nicht die
 * Antwort.
 *
 * ## Aufruf
 *
 *     node scripts/check-fuses.mjs
 *
 * ## Die Physik
 *
 * Flugzeit wird **simuliert**, nicht geschätzt — mit denselben Konstanten wie
 * der Motor (`POWER_TO_SPEED 0.14`, `GRAVITY 0.32`, `DRAG 0.995`) und dem
 * tatsächlichen `speedFactor` je Waffe. Eine Faustformel wäre bei den Würfen
 * (Faktor 0,3–0,6) und den schnellen Geschossen (bis 1,6) zu ungenau.
 */
import { WEAPONS } from '../src/shared/config/weapons.js';

/** Konstanten wie im Motor (`src/engine/match.js`). */
const POWER = 100;
const POWER_TO_SPEED = 0.14;
const GRAVITY = 0.32;
const DRAG = 0.995;
const WINKEL = Math.PI / 4;

/** Ein Tick entspricht 16 ms (60 Hz) — so rechnet auch die Anzeige. */
const MS_JE_TICK = 16;

/**
 * Simuliert die Flugzeit eines Projektils bis zur Rückkehr auf Start­höhe.
 *
 * @returns {number} Flugzeit in Ticks
 */
function flugzeitTicks(waffe) {
  const v0 = POWER * POWER_TO_SPEED * (waffe.speedFactor ?? 1);
  let y = 0;
  let vy = -Math.sin(WINKEL) * v0;

  for (let tick = 0; tick < 3000; tick += 1) {
    vy += GRAVITY * (waffe.gravityScale || 1);
    vy *= DRAG;
    y += vy;
    if (y >= 0 && vy > 0 && tick > 0) return tick;
  }
  return 3000;
}

const zeilen = WEAPONS
  .filter(w => (w.fuseTime ?? 0) > 0)
  .map(w => {
    const ticks = flugzeitTicks(w);
    const flugSek = (ticks * MS_JE_TICK) / 1000;
    return {
      id: w.id,
      name: w.displayName,
      kategorie: w.category,
      zuenderSek: w.fuseTime,
      flugSek,
      verhaeltnis: w.fuseTime / flugSek,
    };
  })
  .sort((a, b) => b.verhaeltnis - a.verhaeltnis);

console.log('Zünder-Prüfung: Zünderzeit gegen tatsächliche Flugzeit');
console.log('');
console.log(`${'Waffe'.padEnd(24)}${'Zünder'.padStart(8)}${'Flugzeit'.padStart(10)}${'Faktor'.padStart(9)}  Folge`);
console.log('-'.repeat(74));

for (const z of zeilen) {
  const folge = z.verhaeltnis > 1
    ? `zündet ${z.verhaeltnis.toFixed(1)}× nach der Landung`
    : 'zündet im Flug';
  console.log(
    `${z.name.padEnd(24)}${`${z.zuenderSek} s`.padStart(8)}`
    + `${`${z.flugSek.toFixed(2)} s`.padStart(10)}`
    + `${`${z.verhaeltnis.toFixed(1)}×`.padStart(9)}  ${folge}`,
  );
}

const nachLandung = zeilen.filter(z => z.verhaeltnis > 1);
const knapp = zeilen.filter(z => z.verhaeltnis > 1 && z.verhaeltnis <= 1.5);
const deutlich = zeilen.filter(z => z.verhaeltnis > 3);

console.log('');
console.log(`Waffen mit Zünder: ${zeilen.length}`);
console.log(`  zünden NACH der Landung: ${nachLandung.length}`);
console.log(`  davon deutlich (>3×):    ${deutlich.length}`);

if (deutlich.length > 0) {
  console.log('');
  console.log('DIE DEUTLICHSTEN FÄLLE (Zünder mehr als dreimal so lang wie der Flug):');
  for (const z of deutlich) {
    console.log(`  ${z.name.padEnd(24)} ${z.zuenderSek} s bei ${z.flugSek.toFixed(2)} s Flug`);
  }
}

console.log('');
console.log('DIE ENTSCHEIDUNG, DIE HIER NÖTIG IST:');
console.log('');
console.log('  Ein Zünder ist für eine GRANATE richtig: Sie soll liegen bleiben und');
console.log('  nach einer Weile zünden — das ist eine taktische Waffe (der Gegner muss');
console.log('  weggehen).');
console.log('');
console.log('  Für eine EINSCHLAGWAFFE ist er falsch: Sie soll beim Aufprall wirken.');
console.log('  Ein Name wie „Meteoritenbrocken" oder „Höllenkanone" verspricht einen');
console.log('  Einschlag, keine Liegezeit.');
console.log('');
console.log('  WAS NICHT GEHT: Die Unterscheidung nach Namen zu treffen. Ein Skript,');
console.log('  das nach „granate" sucht, ordnet irgendwann eine Waffe falsch ein —');
console.log('  und der Fehler sähe plausibel aus.');
console.log('');
console.log('  WAS GEHT: In der Designdatei je Waffe ein Feld setzen, das die Absicht');
console.log('  festhält (z. B. `mechanic.fuseIntent: "timed" | "impact"`), und der');
console.log('  Generator setzt `fuseTime` entsprechend auf 0 (Aufprall) oder lässt sie');
console.log('  stehen. Dann ist die Absicht DOKUMENTIERT statt erschlossen.');
console.log('');
console.log(`  Bei den ${knapp.length} knappen Fällen (Faktor 1,0–1,5) fällt die Entscheidung`);
console.log('  leichter: Dort genügt meist eine kleine Kürzung des Zünders.');
