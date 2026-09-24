/**
 * Tests: Waffenanimationen ohne Canvas.
 *
 * `renderer.js` ist in `node --test` nicht ladbar (Vite-Importe). Genau
 * deshalb liegt die Geometrie der Animationen in `weaponAnimation.js` — hier
 * wird sie gemessen, statt sie im Browser zu erhoffen.
 *
 * Geprüft wird je Teil die AUSSAGE, nicht die Pixelzahl:
 *  - Mündungsfeuer zeigt in SCHUSSRICHTUNG (nicht in eine feste Richtung).
 *  - Rückstoß ist am Anfang am größten und klingt auf 0 ab.
 *  - Das Fadenkreuz hat eine LÜCKE in der Mitte (sonst verdeckt es den Punkt,
 *    den es markiert).
 *  - Der Nachladebalken ist leer, wenn gerade geschossen wurde, und voll, wenn
 *    die Waffe bereit ist.
 *
 * UND: reduzierte Bewegung nimmt die BEWEGUNG, nicht die Aussage. Jeder Test
 * mit Animation hat eine Gegenprobe mit `reducedMotion: true`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pulsFaktor, rueckstossVersatz, muendungsfeuer, fadenkreuzSegmente, blitzPuls,
  ladungAnteil, erzeugeMuendungsfeuer,
  MUENDUNGSFEUER_BILDER, RUECKSTOSS_MAX, ROHR_LAENGE,
} from '../src/client/weaponAnimation.js';
import { schreiteEffekteFort, restlicheBilder } from '../src/client/effects.js';

test('Mündungsfeuer zeigt in SCHUSSRICHTUNG', () => {
  // Winkel 0 = nach rechts: Der Versatz muss auf +x liegen.
  const rechts = muendungsfeuer(0, 1);
  assert.ok(rechts.offsetX > 0, `erwartet > 0, war ${rechts.offsetX}`);
  assert.ok(Math.abs(rechts.offsetY) < 1e-9, `erwartet 0, war ${rechts.offsetY}`);

  // Winkel π/2 = nach oben: Der Bildschirm-y wächst nach UNTEN, oben ist -y.
  const oben = muendungsfeuer(Math.PI / 2, 1);
  assert.ok(oben.offsetY < 0, `erwartet < 0, war ${oben.offsetY}`);
  assert.ok(Math.abs(oben.offsetX) < 1e-6, `erwartet 0, war ${oben.offsetX}`);

  // Und nach links — die Gegenrichtung, damit nicht beide Vorzeichen passen.
  const links = muendungsfeuer(Math.PI, 1);
  assert.ok(links.offsetX < 0, `erwartet < 0, war ${links.offsetX}`);
});

test('Die Mündung liegt am Ende des Rohres, nicht in der Figurenmitte', () => {
  const feuer = muendungsfeuer(0, 1);
  // Ohne Rückstoß (Leben 0) genau die Rohrlänge.
  const ohne = muendungsfeuer(0, 0);
  assert.ok(Math.abs(ohne.offsetX - ROHR_LAENGE) < 1e-9,
    `Die Mündung muss ${ROHR_LAENGE} px vom Mittelpunkt liegen, war ${ohne.offsetX}`);
  // Frisch abgefeuert liegt sie HINTER dem Rohrende (Rückstoß).
  assert.ok(feuer.offsetX < ohne.offsetX,
    'Frisch geschossen muss die Mündung zurückgezogen sein');
});

test('Rückstoß ist am Anfang am größten und klingt auf 0 ab', () => {
  const frisch = rueckstossVersatz(1);
  const halb = rueckstossVersatz(0.5);
  const fertig = rueckstossVersatz(0);

  assert.equal(frisch, -RUECKSTOSS_MAX, 'im ersten Bild der volle Rückstoß');
  assert.ok(halb < 0 && halb > frisch, 'dazwischen abnehmend');
  assert.equal(fertig, 0, 'danach kein Versatz mehr');

  // Außerhalb des Bereichs wird begrenzt, nicht extrapoliert.
  assert.equal(rueckstossVersatz(2), -RUECKSTOSS_MAX);
  assert.equal(rueckstossVersatz(-1), 0);
});

test('Reduzierte Bewegung: kein Rückstoß, aber das Feuer bleibt sichtbar', () => {
  const bewegung = { reducedMotion: true };

  assert.equal(rueckstossVersatz(1, bewegung), 0,
    'Bei reduzierter Bewegung fährt das Rohr nicht');
  assert.equal(muendungsfeuer(0, 1, bewegung).offsetX, ROHR_LAENGE,
    'Die Mündung liegt dann fest am Rohrende');

  // Die Gegenprobe: Das Feuer selbst verschwindet NICHT.
  const feuer = muendungsfeuer(0, 1, bewegung);
  assert.ok(feuer.alpha > 0, 'Das Mündungsfeuer muss sichtbar bleiben');
  assert.ok(feuer.length > 0, 'Der Kegel muss eine Länge haben');
  assert.ok(feuer.coreRadius > 0, 'Der Kern muss einen Radius haben');

  // Und der Kern steht still (kein Pulsieren).
  assert.equal(
    muendungsfeuer(0, 0.2, bewegung).coreRadius,
    muendungsfeuer(0, 1, bewegung).coreRadius,
    'Der Kern darf bei reduzierter Bewegung nicht atmen',
  );
});

test('Das Mündungsfeuer verblasst und wächst nach vorn', () => {
  const frisch = muendungsfeuer(0, 1);
  const spaet = muendungsfeuer(0, 0.2);

  assert.ok(frisch.alpha > spaet.alpha, 'Es muss verblassen');
  assert.ok(spaet.length > frisch.length,
    'Während es verblasst, wächst der Kegel nach vorn');
});

test('Das Fadenkreuz hat eine LÜCKE in der Mitte', () => {
  const { segmente, innen } = fadenkreuzSegmente(100, 50, 10);

  assert.equal(segmente.length, 4, 'vier Arme');
  assert.ok(innen > 0, 'Der Innenring hat einen Radius');

  // Kein Segment darf den Mittelpunkt berühren — sonst verdeckt das Visier
  // genau den Punkt, den es markiert.
  for (const [x1, y1, x2, y2] of segmente) {
    const beruehrtMitte = (x1 === 100 && y1 === 50) || (x2 === 100 && y2 === 50);
    assert.equal(beruehrtMitte, false,
      `Segment ${x1},${y1}→${x2},${y2} berührt den Mittelpunkt`);
  }

  // Die Arme liegen symmetrisch um den Punkt (je einer links/rechts/oben/unten).
  const links = segmente.filter(([, , x2]) => x2 < 100).length;
  const rechts = segmente.filter(([x1]) => x1 > 100).length;
  const oben = segmente.filter(([, , , y2]) => y2 < 50).length;
  const unten = segmente.filter(([, y1]) => y1 > 50).length;
  assert.deepEqual([links, rechts, oben, unten], [1, 1, 1, 1]);
});

test('Das Fadenkreuz wird mit der Größe skaliert', () => {
  const klein = fadenkreuzSegmente(0, 0, 5);
  const gross = fadenkreuzSegmente(0, 0, 20);
  const spanne = (s) => Math.max(...s.flat().map(Math.abs));
  assert.ok(spanne(gross.segmente) > spanne(klein.segmente),
    'Der größere Wert muss weiter reichen');

  // Eine unsinnige Größe (0 oder negativ) wird auf ein Mindestmaß gehoben.
  assert.ok(fadenkreuzSegmente(0, 0, 0).innen > 0);
});

test('Der Puls bleibt in der Nähe von 1 und steht bei reduzierter Bewegung still', () => {
  for (let bild = 0; bild < 200; bild += 1) {
    const puls = pulsFaktor(bild);
    assert.ok(puls >= 0.8 && puls <= 1.2, `Puls außerhalb 0,8–1,2 bei Bild ${bild}: ${puls}`);
  }
  // Er schwankt wirklich (kein konstantes 1).
  const werte = new Set();
  for (let bild = 0; bild < 40; bild += 1) werte.add(pulsFaktor(bild).toFixed(3));
  assert.ok(werte.size > 5, `Der Puls muss sich ändern, hatte aber nur ${werte.size} Werte`);

  for (let bild = 0; bild < 40; bild += 1) {
    assert.equal(pulsFaktor(bild, { reducedMotion: true }), 1);
  }
});

test('Der Flächenradius atmet, ohne die Größe zu verfälschen', () => {
  const radius = 40;
  let min = Infinity;
  let max = -Infinity;
  for (let bild = 0; bild < 200; bild += 1) {
    const { radius: r, alpha, strichVersatz } = blitzPuls(radius, bild);
    min = Math.min(min, r);
    max = Math.max(max, r);
    assert.ok(alpha > 0 && alpha <= 0.2, `Deckkraft außerhalb: ${alpha}`);
    assert.ok(strichVersatz >= 0 && strichVersatz < 10, `Strichversatz: ${strichVersatz}`);
  }
  assert.ok(min > radius * 0.8 && max < radius * 1.2,
    `Der Radius darf nur leicht atmen: ${min.toFixed(1)}–${max.toFixed(1)} bei ${radius}`);

  // Reduzierte Bewegung: fester Radius, fester Wert, kein Drehen.
  const still = blitzPuls(radius, 137, { reducedMotion: true });
  assert.equal(still.radius, radius);
  assert.equal(still.strichVersatz, 0);
  assert.ok(still.alpha > 0, 'Der Ring bleibt sichtbar');
});

test('Der Nachladebalken ist leer beim Schuss und voll bei Bereitschaft', () => {
  // Gerade geschossen: die volle Nachladezeit steht noch aus.
  assert.equal(ladungAnteil(3, 3), 0);
  // Ein Drittel der Zeit ist um — mit Toleranz, weil `1 - 1/3` und `2/3` im
  // Binärsystem NICHT dieselbe Zahl sind (0,6666666666666667 gegen …666).
  assert.ok(Math.abs(ladungAnteil(1, 3) - 2 / 3) < 1e-9,
    `erwartet ~0,667, war ${ladungAnteil(1, 3)}`);
  // Bereit.
  assert.equal(ladungAnteil(0, 3), 1);
  // Waffe ohne Nachladezeit ist immer bereit.
  assert.equal(ladungAnteil(0, 0), 1);
  assert.equal(ladungAnteil(5, 0), 1);
  assert.equal(ladungAnteil(0, -1), 1);
  // Unsinnige Werte werden begrenzt statt NaN zu liefern (der Fehler, an dem
  // schon einmal eine Partikelwolke leer blieb — siehe effects.js).
  assert.equal(ladungAnteil(Number.NaN, 3), 1);
  assert.equal(ladungAnteil(3, Number.NaN), 1);
  assert.equal(ladungAnteil(10, 3), 0, 'mehr Restzeit als Gesamtzeit → leer, nicht negativ');
  assert.equal(ladungAnteil(-5, 3), 1, 'negative Restzeit → bereit, nicht übervoll');
});

test('Ein Mündungsfeuer-Effekt lebt genau seine Bilder und verschwindet dann', () => {
  const effekt = erzeugeMuendungsfeuer(7, 1.2);
  assert.equal(effekt.kind, 'muzzle');
  assert.equal(effekt.entityId, 7);
  assert.equal(effekt.angle, 1.2);
  assert.equal(effekt.life, 1);
  assert.ok(effekt.decay > 0, 'Ohne Alterung bliebe der Effekt für immer stehen');
  assert.equal(restlicheBilder(effekt), MUENDUNGSFEUER_BILDER);

  // Durch die ECHTE Alterung schicken (effects.js), nicht nachgebaut.
  let liste = [effekt];
  for (let i = 0; i < MUENDUNGSFEUER_BILDER - 1; i += 1) {
    liste = schreiteEffekteFort(liste);
    assert.equal(liste.length, 1, `vorzeitig verschwunden nach ${i + 1} Bildern`);
    assert.ok(liste[0].life > 0);
  }
  liste = schreiteEffekteFort(liste);
  assert.equal(liste.length, 0, 'nach der Lebensdauer muss er verschwinden');
});
