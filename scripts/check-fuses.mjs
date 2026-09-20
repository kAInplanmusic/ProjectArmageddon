#!/usr/bin/env node
/**
 * Prüft die Zünder-Zeiten gegen die tatsächliche Flugzeit UND gegen die Absicht
 * aus der Designdatei.
 *
 * ## Der Befund (2026-09-19)
 *
 * Ein Audit stellte fest: Bei **allen 18 Zünder-Waffen** war der Zünder länger
 * als die Flugzeit des Projektils. Jede zündete damit erst **nach** der Landung.
 *
 * Für eine Handgranate ist das gewollt — sie soll liegen bleiben und dann
 * zünden. Für „Meteoritenbrocken" (Zünder 4 s bei 0,66 s Flug = **Faktor 6**)
 * oder „Höllenkanone" (5 s) war es falsch: Diese Namen versprechen einen
 * Einschlag, keine Liegezeit. Der „Explosive Energieball" war dadurch die
 * einzige Waffe, die `npm run balance:sweep` als „ohne Wirkung" meldete.
 *
 * ## Die Entscheidung ist gefallen — und steht in der Designdatei (2026-09-20)
 *
 * Die Unterscheidung „Granate" gegen „Einschlagwaffe" nach NAMEN zu treffen wäre
 * Namensdeutung. Deshalb hält jetzt `mechanic.fuseIntent` in
 * `project_armageddon_weapons_v1.json` die Absicht je Waffe fest
 * (`"timed"` | `"impact"`), und der Generator leitet `fuseTime` daraus ab.
 *
 * Dieses Werkzeug MELDET nicht mehr eine offene Frage, sondern PRÜFT die
 * Zusage: `impact` verlangt Zünder 0, `timed` verlangt Zünder > Flugzeit, ein
 * Hitscan darf gar keinen Zünder tragen. Ein Verstoß endet mit Exit-Code 1 —
 * damit ist der Widerspruch zwischen Designdatei und Katalog ein Fehler und
 * keine Fußnote.
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
      absicht: w.fuseIntent ?? '(keine)',
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
const impact = WEAPONS.filter(w => w.fuseIntent === 'impact').length;
const timed = WEAPONS.filter(w => w.fuseIntent === 'timed').length;

/*
 * Verstöße gegen die ABSICHT (`mechanic.fuseIntent` in der Designdatei).
 *
 * Der Zünder ist nicht mehr erschlossen, sondern festgehalten — damit ist er
 * prüfbar geworden. Geprüft wird:
 *   - `impact` verlangt Zünder 0 (sonst wäre die Waffe eine Liegezeit-Waffe).
 *   - `timed` verlangt einen Zünder (sonst wirkt sie beim Aufprall).
 *   - `timed` verlangt Zünder > FLUGZEIT: Eine Granate, die im Flug zündet,
 *     bleibt nicht liegen und ist keine Granate mehr.
 *   - Ein HITSCAN darf keinen Zünder tragen: Er erzeugt kein Geschoss, das
 *     liegen bleiben könnte — der Wert wäre reine Anzeige.
 */
const verstoesse = [];
for (const w of WEAPONS) {
  const zuender = w.fuseTime ?? 0;
  if (w.fuseIntent === 'impact' && zuender !== 0) {
    verstoesse.push(`${w.displayName}: Absicht 'impact', aber Zünder ${zuender} s`);
  }
  if (w.fuseIntent === 'timed' && !(zuender > 0)) {
    verstoesse.push(`${w.displayName}: Absicht 'timed', aber kein Zünder`);
  }
  if (w.delivery === 'hitscan' && zuender > 0) {
    verstoesse.push(`${w.displayName}: Hitscan mit Zünder ${zuender} s (wirkungslos)`);
  }
}
for (const z of zeilen) {
  if (z.absicht === 'timed' && z.verhaeltnis <= 1) {
    verstoesse.push(`${z.name}: Zünder (${z.zuenderSek} s) kürzer als der Flug (${z.flugSek.toFixed(2)} s)`);
  }
}

console.log('');
console.log(`Waffen mit Zünder: ${zeilen.length}`);
console.log(`  zünden NACH der Landung: ${nachLandung.length}`);
console.log(`Absicht aus der Designdatei: timed ${timed} | impact ${impact}`);
console.log(`Verstöße gegen die Absicht: ${verstoesse.length}`);
for (const v of verstoesse) console.log(`  - ${v}`);

if (verstoesse.length > 0) {
  console.log('');
  console.log('FEHLER: Die Designdatei sagt etwas anderes als der Katalog. Entweder');
  console.log('`mechanic.fuseIntent` korrigieren oder `npm run weapons:build` neu laufen');
  console.log('lassen — ein stiller Widerspruch wäre hier der schlimmere Zustand.');
  process.exitCode = 1;
}
