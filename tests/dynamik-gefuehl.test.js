/**
 * Tests für das Treffer- und Explosionsgefühl (`src/client/gefuehl.js`).
 *
 * ## Warum diese Datei existiert
 *
 * Der Renderer ist in `node --test` nicht ladbar (Vite-Importe,
 * `import.meta.glob`). Alles, was er an Rückmeldung rechnet, wäre damit nur
 * mittelbar über E2E prüfbar — und zwar genau so mittelbar, wie die
 * Explosionssplitter es waren: `erzeugePartikel` war seit Monaten geprüft, und
 * dass GEZEICHNET wird, merkte niemand (siehe `#drawParticles` in
 * `renderer.js`). Deshalb liegt die Rechenlogik des Gefühls in einem reinen
 * Modul, und hier stehen die Zusicherungen dafür.
 *
 * ## Was hier geprüft wird
 *
 * Je Maßnahme mindestens eine Zusicherung — und zu jeder bewegenden Maßnahme
 * eine GEGENPROBE mit `reducedMotion: true` bzw. mit dem Zustand OHNE das
 * Ereignis. Ohne die Gegenprobe prüft ein Test nur den animierten Pfad, und der
 * Barrierefreiheits-Pfad bleibt unbelegt (dieselbe Regel wie in
 * `tests/weapon-animation.test.js`).
 *
 * ## Was hier NICHT geprüft wird
 *
 * Das ZEICHNEN. Es braucht einen Canvas, und ein Pixelvergleich im Unit-Test
 * wäre brüchig. Für das Bild gibt es die E2E-Spezifikation
 * `tests/e2e/dynamik.spec.mjs` (Pixelunterschied am Einschlagort, Bildzeit,
 * Zahl der Zeichenaufrufe).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findeTreffer, trefferMarke, haerteAusTreffer, zuckVersatz, TREFFER_BILDER,
  TREFFER_RING_MAX, TREFFER_ZUCKEN_MAX,
  ruckFuer, altereRuck, ruckVersatz, RUCK_MAX, RUCK_BILDER, RUCK_SCHWELLE,
  ergaenzeNarbe, NARBEN_MAX,
  verlaengereSpur, SPUR_PUNKTE_MAX, SPUR_ABSTAND_MIN, SPUR_SPRUNG_MAX,
  rauchWolke, schreiteRauchFort, rauchDarstellung,
  RAUCH_BILDER, RAUCH_JE_EXPLOSION, RAUCH_SCHWELLE,
} from '../src/client/gefuehl.js';
import { schreiteEffekteFort } from '../src/client/effects.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Eine Figur im Ansichtszustand — nur die Felder, die das Gefühl liest. */
const figur = (entityId, health, extra = {}) => ({
  entityId, health, maxHealth: 100, x: 100 + entityId, y: 200, alive: true, ...extra,
});

/* ======================================================================
 * 1. Treffer erkennen
 * ====================================================================== */

test('Ein Absinken der Gesundheit ist ein Treffer — die erste Beobachtung nicht', () => {
  // Erste Beobachtung: Es gibt nichts zu vergleichen. Ein Treffer wäre erfunden.
  const leer = new Map();
  const start = findeTreffer(leer, [figur(1, 100)]);
  assert.deepEqual(start.treffer, [], 'die erste Messung darf keinen Treffer melden');

  // Von 100 auf 70: ein Treffer über 30 Punkte.
  const schlag = findeTreffer(start.zustand, [figur(1, 70)]);
  assert.equal(schlag.treffer.length, 1);
  assert.equal(schlag.treffer[0].entityId, 1);
  assert.equal(schlag.treffer[0].schaden, 30);
  assert.equal(schlag.treffer[0].anteil, 0.3, 'der Anteil ist der Schaden am Höchstleben');
  assert.equal(schlag.treffer[0].toedlich, false);
});

test('GEGENPROBE: Heilung, Stillstand und ein fehlender Wert sind KEIN Treffer', () => {
  const { zustand } = findeTreffer(new Map(), [figur(1, 40)]);

  assert.deepEqual(findeTreffer(zustand, [figur(1, 40)]).treffer, [],
    'unveränderte Gesundheit ist kein Treffer');
  assert.deepEqual(findeTreffer(zustand, [figur(1, 90)]).treffer, [],
    'Heilung ist kein Treffer');
  assert.deepEqual(findeTreffer(zustand, [figur(1, undefined)]).treffer, [],
    'ein fehlender Wert ist kein Treffer (und darf keinen NaN-Schaden erzeugen)');
  assert.deepEqual(findeTreffer(zustand, []).treffer, [],
    'ein leerer Zustand ist kein Treffer');
});

test('Ein Flächenangriff trifft DREI Figuren in einem Zustandssprung', () => {
  /*
   * Der Grund, warum die Rückmeldung aus dem ZUSTAND kommt und nicht aus dem
   * `damage`-Ereignis: Das Ereignis ist gedrosselt und meldete drei Betroffene
   * als eine Meldung (siehe Modulkopf von `gefuehl.js`).
   */
  const { zustand } = findeTreffer(new Map(), [figur(1, 100), figur(2, 80), figur(3, 50)]);
  const flaeche = findeTreffer(zustand, [figur(1, 85), figur(2, 65), figur(3, 50)]);

  assert.equal(flaeche.treffer.length, 2, 'zwei Betroffene, nicht einer');
  assert.deepEqual(flaeche.treffer.map(t => t.entityId), [1, 2]);
  assert.deepEqual(flaeche.treffer.map(t => t.schaden), [15, 15]);
});

test('Ein tödlicher Treffer wird als solcher gemeldet', () => {
  const { zustand } = findeTreffer(new Map(), [figur(7, 20)]);
  const tot = findeTreffer(zustand, [figur(7, 0, { alive: false })]);

  assert.equal(tot.treffer.length, 1);
  assert.equal(tot.treffer[0].toedlich, true);
  assert.equal(tot.treffer[0].schaden, 20);
});

test('Die Klanghärte wächst mit dem Schaden und bleibt im Bereich des Rezepts', () => {
  // `sound.js#treffer` nennt 0,5 weich bis 1,5 hart (Bandpass 1200 × haerte Hz).
  const leicht = haerteAusTreffer(5, 100);
  const voll = haerteAusTreffer(100, 100);

  assert.ok(leicht < voll, `leichter Treffer (${leicht}) muss weicher sein als ein Volltreffer (${voll})`);
  assert.ok(leicht >= 0.5 && voll <= 1.5,
    `${leicht}/${voll} liegen außerhalb des Rezepts (0,5 bis 1,5)`);
  // Fehlende Zahlen dürfen keinen NaN-Klang erzeugen.
  assert.ok(Number.isFinite(haerteAusTreffer(undefined, undefined)));
});

/* ======================================================================
 * 2. Marke, Zucken, Alterung
 * ====================================================================== */

test('Die Marke lebt genau TREFFER_BILDER Bilder — kein Bild mehr, kein Bild weniger', () => {
  /*
   * Die Alterung ist `life - decay` mit `decay = 1/BILDER`. Diese Zusicherung
   * fängt die Zweierpotenz-Falle ab: Bei 1/6 (periodisch) lebte die Marke EIN
   * Bild länger als angekündigt.
   */
  const { zustand } = findeTreffer(new Map(), [figur(1, 100)]);
  const { treffer } = findeTreffer(zustand, [figur(1, 60)]);
  let marken = [trefferMarke(treffer[0])];

  for (let bild = 0; bild < TREFFER_BILDER; bild += 1) {
    assert.equal(marken.length, 1, `die Marke muss im Bild ${bild + 1} noch leben`);
    marken = schreiteEffekteFort(marken);
  }
  assert.equal(marken.length, 0, `nach ${TREFFER_BILDER} Bildern muss sie weg sein`);
});

test('Der Ring misst nach dem Schaden, der tödliche Treffer ist immer groß', () => {
  const ring = (schaden, toedlich = false) => trefferMarke({
    entityId: 1, x: 0, y: 0, schaden, maxHealth: 100, anteil: schaden / 100, toedlich,
  }).radius;

  assert.ok(ring(2) < ring(50), 'ein Kratzer bekommt einen kleineren Ring als ein Volltreffer');
  assert.ok(ring(100) <= TREFFER_RING_MAX, 'der Ring bleibt gedeckelt');
  assert.equal(ring(1, true), TREFFER_RING_MAX, 'ein tödlicher Treffer hat immer den größten Ring');
});

test('Das Zucken bleibt klein und ist bei reduzierter Bewegung aus', () => {
  let groesster = 0;
  for (let life = 1; life > 0; life -= 1 / TREFFER_BILDER) {
    const { dx, dy } = zuckVersatz(life);
    groesster = Math.max(groesster, Math.abs(dx), Math.abs(dy));
  }
  assert.ok(groesster > 0, 'ohne reduzierter Bewegung muss die Figur sich bewegen');
  assert.ok(groesster <= TREFFER_ZUCKEN_MAX,
    `${groesster} px überschreiten die Grenze ${TREFFER_ZUCKEN_MAX} px — die Figur würde wandern statt zu zucken`);

  // Gegenprobe: Die Aussage bleibt (die Marke wird weiter gezeichnet), die
  // Bewegung entfällt.
  assert.deepEqual(zuckVersatz(1, { reducedMotion: true }), { dx: 0, dy: 0 });
  assert.deepEqual(zuckVersatz(0.5, { reducedMotion: true }), { dx: 0, dy: 0 });
});

/* ======================================================================
 * 3. Kamera-Ruck
 * ====================================================================== */

test('Nur ein GROSSER Krater ruckt — und bei reduzierter Bewegung keiner', () => {
  assert.equal(ruckFuer(RUCK_SCHWELLE - 1), null,
    'ein kleines Loch (Direktschuss) darf die Kamera nicht bewegen');
  assert.equal(ruckFuer(4), null, 'der Direktschuss-Krater ist 4 px');
  assert.ok(ruckFuer(RUCK_SCHWELLE), 'ab der Schwelle gibt es einen Ruck');

  assert.equal(ruckFuer(60, { reducedMotion: true }), null,
    'bei reduzierter Bewegung ruckt nichts — die Marke bleibt, die Bewegung nicht');
  assert.equal(ruckFuer(NaN), null, 'ein unbekannter Radius ruckt nicht');
});

test('Der Ruck bleibt UNTER der Lesbarkeitsgrenze — über alle Bilder und Phasen', () => {
  /*
   * Die Grenze ist der Punkt dieser Maßnahme: Ein Bildversatz in der Größe
   * einer Figur (≥ 15 px) verschiebt das Zielkreuz unter dem Auge weg. Geprüft
   * wird deshalb NICHT ein einzelner Wert, sondern das Maximum über die ganze
   * Lebensdauer und viele Bildzähler — genau die Prüfung, die ein versehentlich
   * verzehnfachter Faktor fallen lässt.
   */
  let groesster = 0;
  for (const radius of [RUCK_SCHWELLE, 40, 60, 200]) {
    let ruck = ruckFuer(radius);
    for (let bild = 0; ruck && bild < RUCK_BILDER + 2; bild += 1) {
      const { x, y } = ruckVersatz(ruck, { bild });
      groesster = Math.max(groesster, Math.abs(x), Math.abs(y));
      ruck = altereRuck(ruck);
    }
  }
  assert.ok(groesster > 0, 'es muss überhaupt rucken');
  assert.ok(groesster <= RUCK_MAX,
    `${groesster.toFixed(2)} px überschreiten RUCK_MAX (${RUCK_MAX} px) — das zerstört die Lesbarkeit`);
});

test('Der Ruck klingt ab und endet genau nach RUCK_BILDER Bildern', () => {
  let ruck = ruckFuer(60);
  for (let bild = 0; bild < RUCK_BILDER; bild += 1) {
    assert.ok(ruck, `der Ruck muss im Bild ${bild + 1} noch laufen`);
    ruck = altereRuck(ruck);
  }
  assert.equal(ruck, null, `nach ${RUCK_BILDER} Bildern steht das Bild wieder still`);
});

test('GEGENPROBE Ruck: Bei reduzierter Bewegung ist der Versatz genau null', () => {
  // Auch dann null, wenn aus irgendeinem Grund noch ein Ruck im Zustand steht
  // (etwa weil die Systemeinstellung MITTEN im Ruck umgestellt wurde).
  const laufend = ruckFuer(60);
  assert.deepEqual(ruckVersatz(laufend, { bild: 3, reducedMotion: true }), { x: 0, y: 0 });
  assert.deepEqual(ruckVersatz(null, { bild: 3 }), { x: 0, y: 0 });
});

/* ======================================================================
 * 4. Krater-Narben
 * ====================================================================== */

test('Die Narbe bleibt an ihrem Ort — und die Liste bleibt gedeckelt', () => {
  let narben = [];
  for (let i = 0; i < NARBEN_MAX + 12; i += 1) {
    narben = ergaenzeNarbe(narben, i * 10, 100, 20);
  }

  assert.equal(narben.length, NARBEN_MAX,
    `die Liste wuchs auf ${narben.length} — sie muss bei ${NARBEN_MAX} bleiben`);
  // Die ÄLTESTE fällt heraus: Der frische Krater ist der, den der Spieler sah.
  assert.equal(narben[narben.length - 1].x, (NARBEN_MAX + 11) * 10,
    'die jüngste Narbe muss die letzte in der Liste sein');
  assert.equal(narben[0].x, 12 * 10, 'die ältesten sind herausgefallen');
});

test('Eine Narbe ohne Radius (NaN, 0) wird nicht angelegt', () => {
  /*
   * Ein Krater mit `NaN` käme als `arc(x, y, NaN)` im Canvas an und würde
   * stillschweigend NICHTS zeichnen — eine unsichtbare Zeile in der Liste wäre
   * der schlechteste Zustand: Sie kostet und sagt nichts.
   */
  assert.deepEqual(ergaenzeNarbe([], 10, 10, NaN), []);
  assert.deepEqual(ergaenzeNarbe([], 10, 10, 0), []);
  assert.deepEqual(ergaenzeNarbe([], 10, 10, -5), []);
  assert.equal(ergaenzeNarbe([], 10, 10, 12).length, 1);
});

/* ======================================================================
 * 5. Projektil-Spur
 * ====================================================================== */

test('Die Spur folgt dem Geschoss, hält Abstand und bleibt kurz', () => {
  let spur = verlaengereSpur([], 0, 0);
  assert.deepEqual(spur, [{ x: 0, y: 0 }], 'der erste Punkt wird immer genommen');

  // Zu nah: derselbe Fleck, kein zweiter Punkt.
  spur = verlaengereSpur(spur, 1, 1);
  assert.equal(spur.length, 1, `Abstand < ${SPUR_ABSTAND_MIN} px ergibt keinen neuen Punkt`);

  // Ein echter Flugschritt.
  spur = verlaengereSpur(spur, 20, 5);
  assert.equal(spur.length, 2);

  // Und über viele Schritte bleibt die Länge gedeckelt.
  for (let i = 3; i < 60; i += 1) spur = verlaengereSpur(spur, i * 20, 5 + i);
  assert.equal(spur.length, SPUR_PUNKTE_MAX,
    `die Spur wuchs auf ${spur.length} Punkte statt ${SPUR_PUNKTE_MAX}`);
  assert.equal(spur[spur.length - 1].x, 59 * 20, 'der jüngste Punkt steht am Ende');
});

test('Ein Sprung über die halbe Karte ist ein ANDERES Geschoss (Entity-IDs werden wiederverwendet)', () => {
  const alt = verlaengereSpur(verlaengereSpur([], 100, 100), 130, 100);
  const weit = 130 + SPUR_SPRUNG_MAX + 10;
  const neu = verlaengereSpur(alt, weit, 100);

  assert.deepEqual(neu, [{ x: weit, y: 100 }],
    'ein Sprung über SPUR_SPRUNG_MAX beginnt eine neue Spur');
  // Gegenprobe: ein weiter Schritt UNTER der Grenze wird angehängt.
  assert.equal(verlaengereSpur(alt, 130 + SPUR_SPRUNG_MAX - 10, 100).length, 3);
});

test('Die Spur verändert die übergebene Liste nicht', () => {
  // Der Renderer hält die Spur je Bild in einer neuen Karte; würde die Funktion
  // hineinschreiben, wäre die Reihenfolge der Bilder nicht mehr nachvollziehbar.
  const alt = [{ x: 0, y: 0 }];
  const neu = verlaengereSpur(alt, 50, 0);
  assert.equal(alt.length, 1, 'die alte Liste muss unverändert bleiben');
  assert.equal(neu.length, 2);
  assert.notEqual(alt, neu);
});

/* ======================================================================
 * 6. Nachhall (Rauch)
 * ====================================================================== */

test('Rauch entsteht nur bei einem großen Einschlag — und in begrenzter Zahl', () => {
  assert.deepEqual(rauchWolke(100, 100, RAUCH_SCHWELLE - 1), [],
    'ein kleines Loch raucht nicht');
  assert.deepEqual(rauchWolke(100, 100, NaN), [], 'ohne Radius keine Wolke');

  const gross = rauchWolke(100, 100, 60);
  assert.ok(gross.length > 0, 'ein großer Krater muss Rauch hinterlassen');
  assert.ok(gross.length <= RAUCH_JE_EXPLOSION,
    `${gross.length} Wolken überschreiten die Obergrenze ${RAUCH_JE_EXPLOSION}`);
  // Er STEIGT (nach oben ist −y) und verteilt sich.
  assert.ok(gross.every(w => w.vy < 0), 'Rauch steigt auf');
  assert.ok(gross.some(w => w.vx > 0) && gross.some(w => w.vx < 0), 'er treibt auseinander');
});

test('Der Rauch wächst, verblasst, bleibt halbdurchsichtig und räumt sich auf', () => {
  let wolken = rauchWolke(100, 100, 60);
  const start = wolken.map(w => rauchDarstellung(w));

  for (let bild = 0; bild < RAUCH_BILDER; bild += 1) {
    assert.ok(wolken.length > 0, `der Rauch muss im Bild ${bild + 1} noch stehen`);
    wolken = schreiteRauchFort(wolken);
  }
  assert.equal(wolken.length, 0, `nach ${RAUCH_BILDER} Bildern muss der Rauch weg sein`);

  // Die Deckkraft bleibt niedrig — Rauch ist Hintergrund, kein Blickfang. Der
  // Radius wächst dabei.
  for (let bild = 1; bild < 10; bild += 1) {
    const teil = schreiteRauchFort(rauchWolke(100, 100, 60).map(w => ({ ...w, life: 1 - bild / RAUCH_BILDER })));
    for (const w of teil) {
      const darstellung = rauchDarstellung(w);
      assert.ok(darstellung.alpha <= 0.34,
        `Deckkraft ${darstellung.alpha} über 0,34 — der Rauch würde die Szene verdecken`);
      assert.ok(darstellung.radius > start[0].radius || bild < 2,
        'die Wolke muss mit der Zeit wachsen');
    }
  }
});

/* ======================================================================
 * 7. Die Garantien des Moduls selbst
 * ====================================================================== */

test('Kein Zufall und keine Uhr im Gefühl — dieselbe Szene ergibt dasselbe Bild', () => {
  /*
   * Ein `Math.random` im Anzeigepfad wäre kein Simulationsfehler, aber er
   * machte jede Prüfung unmöglich: Zwei Durchläufe mit demselben Zustand hätten
   * verschiedene Ruckversätze und verschiedene Rauchwolken. Dieselbe Regel gilt
   * im Haus schon für `renderer.js` (siehe `guenther-online.spec.mjs`) und für
   * `effects.js`.
   */
  const quelle = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src/client/gefuehl.js'), 'utf8'));

  for (const verboten of ['Math.random', 'performance.now', 'Date.now']) {
    assert.ok(!quelle.includes(verboten),
      `${verboten} steht im Gefühl — dann ist keine Anzeige mehr reproduzierbar`);
  }

  // Gegenprobe: zweimal dieselbe Rechnung, zweimal dasselbe Ergebnis.
  const wolkeA = rauchWolke(400, 300, 48);
  const wolkeB = rauchWolke(400, 300, 48);
  assert.deepEqual(wolkeA, wolkeB);
  assert.deepEqual(ruckVersatz(ruckFuer(50), { bild: 7 }), ruckVersatz(ruckFuer(50), { bild: 7 }));
});

test('Der Renderer ZEICHNET die Splitter (der Fehler, der diese Sitzung auslöste)', () => {
  /*
   * FUND (belegt): `#drawParticles()` war im Renderer definiert und wurde von
   * KEINER Stelle gerufen. Die Splitter einer Explosion entstanden also,
   * alterten und verschwanden — ohne je im Bild zu sein. Ein Test, der nur
   * `effects.js` prüft, sieht das nie: Das Modul war korrekt, es wurde nur
   * nichts gezeichnet.
   *
   * Deshalb hier eine Textprobe auf die AUFRUFSTELLE. Sie ist grob (sie liest
   * Quelltext), aber genau das ist ihr Zweck: Sie fällt bei jeder Fassung
   * dieses Fehlers, egal wie die Zeichnung intern aussieht.
   */
  const quelle = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src/client/renderer.js'), 'utf8'));

  for (const methode of ['#drawParticles()', '#drawNarben()', '#drawSpuren()', '#drawRauch()', '#drawTreffer()']) {
    const aufrufe = quelle.split(`this.${methode};`).length - 1;
    assert.ok(aufrufe > 0, `${methode} wird nirgends gerufen — die Rückmeldung bleibt unsichtbar`);
  }
  // Und die Gegenprobe: Die Zeichenmethoden existieren überhaupt (kein Tippfehler
  // in dieser Probe).
  for (const methode of ['#drawParticles', '#drawNarben', '#drawSpuren', '#drawRauch', '#drawTreffer']) {
    assert.ok(quelle.includes(`${methode}()`), `${methode} fehlt im Renderer`);
  }
});

test('Der Trefferklang hängt am Zustand — und der Ereigniszweig wird nicht verdoppelt', () => {
  /*
   * Zwei Zusicherungen an EINER Stelle, weil sie zusammengehören: Der Klang zum
   * Geschosstreffer entsteht in `main.js#spieleTrefferklang` (aus dem Zustand),
   * der Klang zum HITSCAN-Treffer im Ereigniszweig. Ohne den Vergleich der
   * Mischerzähler hätte ein Hitscan-Treffer zwei Klänge; ohne den Zustandsweg
   * hätte ein Geschosstreffer gar keinen (gemessen: der Klang hing allein an
   * `hitscan`, siehe `ereignisse.js`).
   */
  const quelle = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src/client/main.js'), 'utf8'));

  assert.ok(quelle.includes('spieleTreffer(haerteAusTreffer('),
    'der Trefferklang aus dem Zustand fehlt in main.js');
  assert.ok(quelle.includes('this.sound?.gezaehlt?.treffer'),
    'ohne den Vergleich mit dem Mischerzähler wird ein Treffer doppelt gehört');
  assert.ok(quelle.includes('this.renderer.nimmTreffer?.()'),
    'die Treffer müssen vom Renderer abgeholt werden');
});
