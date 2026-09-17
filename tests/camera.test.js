/**
 * Tests: Die Kamera zeigt einen Ausschnitt der Karte.
 *
 * ## Warum diese Datei existiert
 *
 * Bis hierher war die Karte **genau so groß wie das Fenster**: Der Renderer
 * zeichnete 1:1. Auf einem 4K-Fernseher sah man deshalb die ganze Karte — das
 * Gegenteil von „große Welt".
 *
 * Die Kamera ist neue Logik, und sie entscheidet über das Spielgefühl: Wie viel
 * man sieht, wie groß eine Figur wirkt, ob man scrollen muss. Deshalb wird sie
 * geprüft — und zwar **ohne Browser**, weil sie reine Rechnung ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera, ZOOM_GRENZEN, FOLGE_FAKTOR } from '../src/client/camera.js';

/** Eine Kamera über einer 4K-Karte auf einem Full-HD-Schirm. */
function vierKaufFullHd(optionen = {}) {
  return new Camera({
    mapBreite: 3840, mapHoehe: 2160, schirmBreite: 1920, schirmHoehe: 1080, ...optionen,
  });
}

test('Ohne Kamera wäre eine 4K-Karte auf Full HD halb so groß', () => {
  /*
   * Die Ausgangslage, in Zahlen: Der Standardzoom passt die Karte in den
   * Bildschirm ein. Bei 3840 → 1920 ist das Faktor 0,5 — jede Figur wäre halb
   * so groß wie auf einer 1280er Karte mit gleicher Fenstergröße.
   */
  const camera = vierKaufFullHd();

  assert.equal(camera.zoom, 0.5);
  assert.equal(camera.sichtbareBreite, 3840,
    'bei Zoom 0,5 zeigt der Schirm doppelt so viel Welt wie er Pixel hat');
  assert.equal(camera.scrolltHorizontal, false,
    'die ganze Karte passt hinein — das ist genau der Zustand, der abgelöst wird');
});

test('Mit festem Zoom zeigt der Schirm einen Ausschnitt', () => {
  /*
   * DAS Kernverhalten. Zoom 1 heißt: ein Kartenpixel = ein Bildschirmpixel.
   * Auf einem 1920er Schirm sieht man dann 1920 von 3840 Kartenpixeln — die
   * Hälfte. Die Figuren sind so groß wie auf der heutigen Karte.
   */
  const camera = vierKaufFullHd({ zoom: 1 });

  assert.equal(camera.zoom, 1);
  assert.equal(camera.sichtbareBreite, 1920);
  assert.equal(camera.scrolltHorizontal, true,
    'die Karte ist breiter als der Bildschirm — die Kamera muss scrollen');
});

test('Die Kamera hält sich innerhalb der Karte', () => {
  /*
   * Ohne diese Grenze zeigte sie an den Rändern leeren Raum — die Karte würde
   * „aufhören", was wie ein Fehler aussähe.
   */
  const camera = vierKaufFullHd({ zoom: 1 });

  // Weit über den rechten Rand hinaus zielen.
  camera.zieleAuf(99_999, 0, true);
  assert.equal(camera.x, 3840 - 960,
    'am rechten Rand muss die Kamera bei (Kartenbreite − halbe Sichtweite) stehen');

  const rechts = camera.transformation();
  assert.equal(rechts.versatzX, 1920 / 2 - (3840 - 960) * 1);

  // Weit über den linken Rand hinaus.
  camera.zieleAuf(-99_999, 0, true);
  assert.equal(camera.x, 960, 'am linken Rand bei der halben Sichtweite');
});

test('Bei kleiner Karte wird nicht gescrollt', () => {
  /*
   * Ein Duell auf 1280 px auf einem 1920er Schirm: Die Karte ist schmaler als
   * der Bildschirm. Dann wird sie mittig gehalten, nicht gescrollt.
   */
  const camera = new Camera({
    mapBreite: 1280, mapHoehe: 720, schirmBreite: 1920, schirmHoehe: 1080,
  });

  camera.zieleAuf(0, 0, true);
  assert.equal(camera.x, 640, 'mittig: halbe Kartenbreite');
  assert.equal(camera.scrolltHorizontal, false);
});

test('Die Umrechnung Bildschirm zu Karte ist umkehrbar', () => {
  /*
   * Nötig für Eingaben: Ein Klick bei Bildschirmpixel 400 liegt auf einer
   * anderen Kartenstelle, je nachdem wohin die Kamera zeigt. Ist die
   * Umrechnung falsch, schießt der Spieler an eine andere Stelle als er klickt.
   */
  const camera = vierKaufFullHd({ zoom: 0.8 });
  camera.zieleAuf(2000, 1200, true);

  const t = camera.transformation();
  const karte = camera.schirmZuKarte(400, 300);

  // Rückrechnung: Karte → Bildschirm muss wieder (400, 300) ergeben.
  const zurueckX = karte.x * t.skalierung + t.versatzX;
  const zurueckY = karte.y * t.skalierung + t.versatzY;

  assert.ok(Math.abs(zurueckX - 400) < 1e-9, `x: ${zurueckX} statt 400`);
  assert.ok(Math.abs(zurueckY - 300) < 1e-9, `y: ${zurueckY} statt 300`);
});

test('Der Zoom bleibt in seinen Grenzen', () => {
  /*
   * Zu weit hinein: Man sieht nur noch einen Ausschnitt ohne Übersicht.
   * Zu weit heraus: Die Figuren werden unkenntlich.
   */
  const camera = vierKaufFullHd({ zoom: 1 });

  camera.setzeZoom(99);
  assert.equal(camera.zoom, ZOOM_GRENZEN.max);

  camera.setzeZoom(0.001);
  assert.equal(camera.zoom, ZOOM_GRENZEN.min);
});

test('Ein gesetzter Zoom überlebt eine Fenstergrößenänderung', () => {
  /*
   * Sonst würde jede Fensteränderung die Einstellung des Spielers
   * zurücksetzen — bei einem Fernseher, der die Auflösung wechselt, wäre das
   * besonders ärgerlich.
   */
  const camera = vierKaufFullHd({ zoom: 1.5 });
  camera.setzeSchirm(1280, 720);

  assert.equal(camera.zoom, 1.5, 'der Zoom muss erhalten bleiben');
});

test('Ohne festen Zoom passt sich die Ansicht der Fenstergröße an', () => {
  /*
   * Die andere Seite: Wer den Zoom nie angefasst hat, bekommt bei jedem
   * Fensterwechsel die ganze Karte zu sehen.
   */
  const camera = vierKaufFullHd();
  assert.equal(camera.zoom, 0.5);

  camera.setzeSchirm(3840, 2160);
  assert.equal(camera.zoom, 1, 'bei 4K-Fenster und 4K-Karte ist der Zoom 1');
});

test('Die Kamera zieht weich nach', () => {
  /*
   * Ein harter Schnitt bei jedem Schuss ließe den Zusammenhang verlieren. Der
   * Faktor ist kleiner als 1, die Kamera braucht also mehrere Bilder.
   */
  const camera = vierKaufFullHd({ zoom: 1 });
  camera.zieleAuf(1000, 1000, true);
  camera.zieleAuf(3000, 1000);

  const vorher = camera.x;
  camera.schritt();
  const nachher = camera.x;

  assert.ok(nachher > vorher, 'sie muss sich in Richtung Ziel bewegen');
  assert.ok(nachher < 3000, 'sie darf das Ziel nicht in einem Schritt erreichen');
  assert.ok(FOLGE_FAKTOR < 1, 'der Faktor muss kleiner als 1 sein');
});

test('Ziehen überschreibt das Ziel', () => {
  /*
   * Wer die Karte selbst schiebt, will nicht, dass sie zurückspringt.
   */
  const camera = vierKaufFullHd({ zoom: 1 });
  camera.zieleAuf(2000, 1000, true);

  camera.verschiebe(200, 0);
  const nachZiehen = camera.x;

  camera.schritt();
  assert.equal(camera.x, nachZiehen, 'die Kamera darf nicht zum alten Ziel zurückspringen');
});

test('Eine neue Karte begrenzt die Position neu', () => {
  /*
   * Wechselt die Kartengröße, darf die Kamera nicht außerhalb stehen bleiben.
   */
  const camera = vierKaufFullHd({ zoom: 1 });
  camera.zieleAuf(3500, 2000, true);

  camera.setzeKarte(1280, 720);
  assert.ok(camera.x <= 1280, `x liegt bei ${camera.x}, die Karte ist 1280 breit`);
  assert.ok(camera.y <= 720, `y liegt bei ${camera.y}, die Karte ist 720 hoch`);
});

test('Zoom 1 bedeutet: ein Kartenpixel ist ein Bildschirmpixel', () => {
  /*
   * Die Definition, gegen die alles andere rechnet. Ist sie falsch, stimmen
   * alle Umrechnungen nicht.
   */
  const camera = vierKaufFullHd({ zoom: 1 });
  camera.zieleAuf(1920, 1080, true);

  const t = camera.transformation();
  assert.equal(t.skalierung, 1);

  // Der Kartenpunkt in der Mitte muss auf der Bildschirmmitte liegen.
  const mitte = { x: 1920 * 1 + t.versatzX, y: 1080 * 1 + t.versatzY };
  assert.equal(mitte.x, 960, 'Kartenmitte liegt in der Bildschirmmitte');
  assert.equal(mitte.y, 540);
});
