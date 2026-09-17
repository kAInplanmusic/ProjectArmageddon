/**
 * Tests für Partikel und Effekte (`src/client/effects.js`).
 *
 * ## Warum diese Datei existiert
 *
 * Ein Audit stellte fest: Der Renderer (1119 Zeilen) hat keinen Unit-Test, weil
 * er in `node --test` nicht ladbar ist (`import.meta.glob`, Vite-spezifisch).
 * Die Partikel- und Effektlogik war damit nur mittelbar über E2E prüfbar.
 *
 * Der Audit schlug zwei Wege vor: einen Vite-Testläufer einführen ODER die
 * testbare Logik in ein eigenes Modul ziehen. Gewählt wurde der zweite — er
 * folgt dem Muster, das im Projekt schon zweimal angewandt ist
 * (`terrainBaker.js`, `shotPrediction.js`).
 *
 * ## Was hier geprüft wird
 *
 * Die Zustandslogik: Entstehung, Alterung, Aufräumen, Determinismus. NICHT
 * geprüft wird das Zeichnen — das braucht einen Canvas, und ein Test dafür wäre
 * ein Pixel-Vergleich (brüchig und ohne Aussage über die Richtigkeit).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  erzeugePartikel, schreitePartikelFort,
  erzeugeStrahl, erzeugeBlitz, schreiteEffekteFort, restlicheBilder,
  MAX_PARTIKEL, PARTIKEL_ABNAHME, PARTIKEL_GRAVITATION,
} from '../src/client/effects.js';

test('Eine Explosion erzeugt eine verteilte Partikelwolke', () => {
  const wolke = erzeugePartikel(400, 300, 40);

  assert.ok(wolke.length > 0, 'es müssen Partikel entstehen');
  assert.ok(wolke.length <= MAX_PARTIKEL,
    `${wolke.length} Partikel überschreiten die Obergrenze ${MAX_PARTIKEL}`);

  for (const p of wolke) {
    assert.equal(p.life, 1, 'frische Partikel starten mit voller Lebensdauer');
    assert.equal(p.x, 400, 'alle starten am Explosionsort');
    assert.equal(p.y, 300);
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy));
    assert.ok(p.radius > 0);
  }

  // Sie fliegen auseinander, nicht in eine Richtung.
  assert.ok(wolke.some(p => p.vx > 0), 'kein Partikel fliegt nach rechts');
  assert.ok(wolke.some(p => p.vx < 0), 'kein Partikel fliegt nach links');
  assert.ok(wolke.some(p => p.vy < 0) || wolke.some(p => p.vy > 0),
    'die Wolke muss sich auch vertikal verteilen');
});

test('Die Partikelzahl wächst mit dem Radius, bleibt aber gedeckelt', () => {
  /*
   * Ein größerer Krater soll mehr Splitter zeigen — aber die Obergrenze muss
   * halten, sonst kostete eine Explosion auf großer Fläche beliebig viel.
   */
  const klein = erzeugePartikel(0, 0, 4);
  const mittel = erzeugePartikel(0, 0, 40);
  const riesig = erzeugePartikel(0, 0, 5000);

  assert.ok(mittel.length > klein.length, 'größerer Radius, mehr Partikel');
  assert.ok(riesig.length <= MAX_PARTIKEL,
    `bei riesigem Radius: ${riesig.length} > ${MAX_PARTIKEL}`);
  assert.equal(klein.length, 10, 'Radius 4 ergibt 8 + 2 = 10 Partikel');
});

test('Fehlender oder unsinniger Radius ergibt trotzdem Partikel', () => {
  // Randfall: Ein Aufruf ohne Radius darf nicht werfen.
  for (const radius of [undefined, null, NaN, 0, -10]) {
    const wolke = erzeugePartikel(100, 100, radius);
    assert.ok(wolke.length > 0,
      `Radius ${String(radius)} ergab keine Partikel`);
    assert.ok(wolke.every(p => Number.isFinite(p.vx) && Number.isFinite(p.vy)),
      `Radius ${String(radius)} ergab unendliche Geschwindigkeit`);
  }
});

test('Die Partikel altern und werden aufgeräumt', () => {
  /*
   * Der Kern: Ohne Aufräumen wüchse die Liste mit jeder Explosion — ein
   * Speicherleck, das erst nach vielen Explosionen auffiele.
   */
  let wolke = erzeugePartikel(400, 300, 20);
  const anfangs = wolke.length;
  assert.ok(anfangs > 0, 'Vorbedingung');

  wolke = schreitePartikelFort(wolke);
  assert.ok(wolke.every(p => p.life < 1), 'nach einem Schritt muss die Lebensdauer sinken');

  // Nach genug Schritten ist die Wolke leer.
  for (let i = 0; i < 60; i += 1) wolke = schreitePartikelFort(wolke);
  assert.equal(wolke.length, 0, 'die Wolke muss vollständig verschwinden');
});

test('Die Partikel fallen — die Schwerkraft wirkt', () => {
  const wolke = erzeugePartikel(0, 0, 20);
  const nachher = schreitePartikelFort(wolke);

  assert.equal(nachher.length, wolke.length, 'Testannahme: noch keine aufgeräumt');
  for (let i = 0; i < wolke.length; i += 1) {
    assert.equal(nachher[i].vy, wolke[i].vy + PARTIKEL_GRAVITATION,
      `Partikel ${i}: die Fallbeschleunigung wirkt nicht`);
  }
});

test('Ein Partikel verschwindet nach genau 1/ABNAHME Bildern', () => {
  // Die Lebensdauer ist exakt ableitbar — geprüft wird die Grenze.
  let wolke = erzeugePartikel(0, 0, 10);
  const erwarteteBilder = Math.ceil(1 / PARTIKEL_ABNAHME);

  let bilder = 0;
  while (wolke.length > 0 && bilder < 200) {
    wolke = schreitePartikelFort(wolke);
    bilder += 1;
  }
  assert.equal(bilder, erwarteteBilder,
    `die Wolke lebte ${bilder} Bilder, erwartet ${erwarteteBilder}`);
});

test('Die Fortschreibung verändert die Eingabe nicht', () => {
  /*
   * Die Funktionen sind rein: Sie geben eine neue Liste zurück. Wäre das
   * anders, könnte ein Test (oder späterer Umbau) bestehenden Zustand
   * versehentlich verändern — und die Anzeige zeigte etwas anderes als die
   * Simulation.
   */
  const original = erzeugePartikel(10, 20, 30);
  const kopie = original.map(p => ({ ...p }));

  const neu = schreitePartikelFort(original);
  assert.notEqual(neu, original, 'es muss eine neue Liste sein');
  assert.deepEqual(original, kopie, 'die Eingabe darf nicht verändert werden');
});

test('Derselbe Radius ergibt dieselbe Wolke (Determinismus)', () => {
  /*
   * Die Partikel entstehen aus einem Zähler, nicht aus Zufall. Das macht den
   * Zustand prüfbar — und schadet der Optik nicht, weil die Wolke durch die
   * Verteilung im Kreis ohnehin gleichmäßig wirkt.
   */
  assert.deepEqual(erzeugePartikel(50, 60, 25), erzeugePartikel(50, 60, 25));
});

test('Ein Strahl entsteht mit den übergebenen Endpunkten', () => {
  const strahl = erzeugeStrahl(10, 20, 300, 400);

  assert.equal(strahl.kind, 'beam');
  assert.equal(strahl.fromX, 10);
  assert.equal(strahl.fromY, 20);
  assert.equal(strahl.toX, 300);
  assert.equal(strahl.toY, 400);
  assert.equal(strahl.life, 1);
  assert.ok(strahl.decay > 0, 'ohne Abnahme bliebe der Strahl für immer');
  assert.equal(strahl.hit, false, 'ohne Angabe kein Treffer');
});

test('Ein Strahl kann als Treffer und mit eigener Farbe angelegt werden', () => {
  const strahl = erzeugeStrahl(0, 0, 1, 1, { hit: true, color: '#00ff00' });
  assert.equal(strahl.hit, true);
  assert.equal(strahl.color, '#00ff00');

  // Ohne Angabe gilt die Standardfarbe — sie darf nicht undefined sein,
  // sonst zeichnete der Canvas mit "undefined".
  assert.equal(erzeugeStrahl(0, 0, 1, 1).color, '#ffe066');
});

test('Ein Blitz trägt Position, Radius und Farbe', () => {
  const blitz = erzeugeBlitz(120, 240, 30);
  assert.equal(blitz.kind, 'flash');
  assert.equal(blitz.x, 120);
  assert.equal(blitz.y, 240);
  assert.equal(blitz.radius, 30);
  assert.ok(blitz.life > 0 && blitz.decay > 0);

  // Eigene Farbe wird übernommen (z. B. beim Einschlag).
  assert.equal(erzeugeBlitz(0, 0, 5, { color: '#ffffff' }).color, '#ffffff');
});

test('Die Effekte altern und werden aufgeräumt', () => {
  // Wie bei den Partikeln: ohne Aufräumen wüchse die Liste unbegrenzt.
  let effekte = [erzeugeStrahl(0, 0, 1, 1), erzeugeBlitz(2, 2, 10)];
  assert.equal(effekte.length, 2, 'Vorbedingung');

  // Der Strahl lebt kürzer als der Blitz (decay 0,14 gegen 0,09).
  const strahlBilder = restlicheBilder(effekte[0]);
  const blitzBilder = restlicheBilder(effekte[1]);
  assert.ok(strahlBilder < blitzBilder,
    `Strahl (${strahlBilder}) muss kürzer leben als Blitz (${blitzBilder})`);

  let bilder = 0;
  while (effekte.length > 0 && bilder < 200) {
    effekte = schreiteEffekteFort(effekte);
    bilder += 1;
  }
  assert.equal(effekte.length, 0, 'alle Effekte müssen verschwinden');
  assert.ok(bilder <= blitzBilder, `es dauerte ${bilder} Bilder, erwartet ≤ ${blitzBilder}`);
});

test('Die Effekt-Fortschreibung verändert die Eingabe nicht', () => {
  const original = [erzeugeBlitz(0, 0, 10)];
  const kopie = { ...original[0] };
  const neu = schreiteEffekteFort(original);

  assert.notEqual(neu, original, 'es muss eine neue Liste sein');
  assert.deepEqual(original[0], kopie, 'die Eingabe darf nicht verändert werden');
});

test('restlicheBilder rechnet die Lebensdauer in Bilder um', () => {
  // Für die Anzeige und für Tests: Wie lange ist der Effekt noch zu sehen?
  assert.equal(restlicheBilder(erzeugeBlitz(0, 0, 1)), Math.ceil(1 / 0.09));
  assert.equal(restlicheBilder({ life: 0.5, decay: 0.1 }), 5);
  assert.equal(restlicheBilder({ life: 1, decay: 0.5 }), 2);

  // Randfälle: fehlender Effekt oder fehlende Abnahme ergeben 0, nicht NaN.
  assert.equal(restlicheBilder(null), 0);
  assert.equal(restlicheBilder(undefined), 0);
  assert.equal(restlicheBilder({ life: 1, decay: 0 }), 0);
  assert.equal(restlicheBilder({ life: 1 }), 0);
});

test('Die Reihenfolge der Partikel bleibt beim Fortschreiten erhalten', () => {
  /*
   * Geprüft, weil die Zeichenroutine über die Liste läuft. Eine Umsortierung
   * wäre kein Fehler — aber sie würde bedeuten, dass etwas anderes passiert als
   * „jeden Partikel einen Schritt bewegen", und das wäre überraschend.
   */
  const wolke = erzeugePartikel(0, 0, 20);
  const nachher = schreitePartikelFort(wolke);
  for (let i = 0; i < nachher.length; i += 1) {
    assert.equal(nachher[i].x, wolke[i].x + wolke[i].vx,
      `Partikel ${i} wurde nicht an seiner Position fortgeschrieben`);
  }
});
