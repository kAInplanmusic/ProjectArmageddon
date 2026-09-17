/**
 * Tests für den Kulissen-Zeichner (`src/client/sceneryPainter.js`).
 *
 * ## Warum diese Datei existiert
 *
 * Ein Audit stellte fest: Der Zeichner hat 599 Zeilen und **keinen eigenen
 * Test** — er wurde nur mittelbar über E2E-Läufe berührt. Ein Fehler in der
 * Zeichenlogik (falsche Farbe, fehlende Kulisse, Absturz bei einer Wasserart)
 * wäre damit nur durch einen Blick auf einen Screenshot aufgefallen.
 *
 * ## Wie hier geprüft wird
 *
 * Die Funktionen nehmen `ctx` als Parameter — sie sind also **ohne Browser**
 * prüfbar. Ein Fake-Context zeichnet jeden Aufruf auf; geprüft wird, ob die
 * erwarteten Zeichenbefehle entstehen. Das ist kein Pixel-Vergleich (der wäre
 * brüchig), sondern eine Prüfung der ZEICHENABSICHT: Wird überhaupt gezeichnet,
 * mit welcher Farbe, und ohne Absturz bei jeder Kulisse?
 *
 * Die Kulissen kommen aus `pickScenery()` — dem Produktivweg. Nur so deckt der
 * Test die Daten ab, die das Spiel wirklich benutzt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  drawSky, drawAmbient, drawLandmarks, waterColors, drawWaterSurface,
} from '../src/client/sceneryPainter.js';
import { SCENERY_BIOMES, pickScenery } from '../src/shared/config/scenery.js';

/**
 * Ein Context, der seine Aufrufe notiert.
 *
 * Warum ein Fake statt eines Browsers: Die Zeichenlogik ist reine
 * Kontrolllogik über `ctx`-Aufrufe. Ein echter Canvas würde dasselbe prüfen,
 * aber nur mit Browser — und die Aussage wäre dieselbe.
 */
function fakeCtx() {
  const aufrufe = [];
  const notiere = name => (...args) => { aufrufe.push({ name, args }); };
  return {
    aufrufe,
    zaehle: name => aufrufe.filter(a => a.name === name).length,
    hole: name => aufrufe.filter(a => a.name === name),
    hatGezeichnet: () => aufrufe.some(a => ['fill', 'stroke', 'fillRect', 'fillText',
      'arc', 'drawImage'].includes(a.name)),
    save: notiere('save'), restore: notiere('restore'),
    beginPath: notiere('beginPath'), closePath: notiere('closePath'),
    moveTo: notiere('moveTo'), lineTo: notiere('lineTo'), arc: notiere('arc'),
    rect: notiere('rect'), fill: notiere('fill'), stroke: notiere('stroke'),
    fillRect: notiere('fillRect'), strokeRect: notiere('strokeRect'),
    clearRect: notiere('clearRect'), fillText: notiere('fillText'),
    drawImage: notiere('drawImage'), translate: notiere('translate'),
    rotate: notiere('rotate'), scale: notiere('scale'), clip: notiere('clip'),
    quadraticCurveTo: notiere('quadraticCurveTo'),
    bezierCurveTo: notiere('bezierCurveTo'), ellipse: notiere('ellipse'),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', globalCompositeOperation: '',
    filter: '', lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    miterLimit: 10, lineDashOffset: 0,
    setLineDash: notiere('setLineDash'),
    getLineDash: () => [],
  };
}

/**
 * Echte Kulissen — für jedes Biom und mehrere Presets.
 *
 * `pickScenery(seed, preset)` ist der Produktivweg; der Test prüft damit genau
 * die Daten, die das Spiel benutzt, statt erfundene Testobjekte.
 */
const KULISSEN = [];
const PRESETS = ['hills', 'open', 'islands', 'mountains', 'caverns', 'flooded', 'spires', 'warren'];
for (const preset of PRESETS) {
  for (const seed of [1, 4242, 99999]) {
    const s = pickScenery(seed, preset);
    if (s) KULISSEN.push({ id: `${preset}/${seed}`, scenery: s });
  }
}

/** Alle Biome der Konfiguration. */
const BIOME = Object.keys(SCENERY_BIOMES);

/** Die vier Zeichenschritte als Tabelle — für die Schleifen unten. */
const SCHRITTE = scenery => [
  ['drawSky', drawSky, [1280, 720, scenery, 100]],
  ['drawAmbient', drawAmbient, [1280, 720, scenery, 100, false]],
  ['drawAmbient(vorn)', drawAmbient, [1280, 720, scenery, 100, true]],
  ['drawLandmarks', drawLandmarks, [1280, 720, scenery, 500]],
  ['drawWaterSurface', drawWaterSurface, [1280, 720, scenery, 100]],
];

test('Es gibt Kulissen und Biome zu prüfen', () => {
  // Vorbedingung: Ohne Kulissen wäre alles Folgende leer und der Test wertlos.
  assert.ok(BIOME.length >= 8, `Zu wenige Biome in der Config: ${BIOME.length}`);
  assert.ok(KULISSEN.length >= 20,
    `Zu wenige Kulissen erzeugt: ${KULISSEN.length} (pickScenery liefert nichts?)`);
});

test('Der Himmel wird für jede Kulisse gezeichnet', () => {
  /*
   * `drawSky` ist die Grundfläche — ohne sie bliebe das Bild schwarz. Geprüft
   * wird für JEDE erzeugte Kulisse, dass Zeichenbefehle entstehen.
   */
  const ohneAusgabe = [];
  for (const { id, scenery } of KULISSEN) {
    const ctx = fakeCtx();
    drawSky(ctx, 1280, 720, scenery, 0);
    if (!ctx.hatGezeichnet()) ohneAusgabe.push(id);
  }
  assert.deepEqual(ohneAusgabe, [],
    'diese Kulissen erzeugen keinen einzigen Zeichenbefehl');
});

test('Der Himmel wird auch über die Zeit gezeichnet (Animation)', () => {
  /*
   * Die Kulissen sind animiert (`zeit` als Parameter). Geprüft wird, dass ein
   * späterer Zeitpunkt AUCH zeichnet — ohne zu verlangen, dass die Ausgabe
   * anders ist (das wäre ein Pixel-Vergleich und brüchig).
   */
  for (const { id, scenery } of KULISSEN.slice(0, 8)) {
    const ctx = fakeCtx();
    drawSky(ctx, 1280, 720, scenery, 12345);
    assert.ok(ctx.hatGezeichnet(), `${id}: bei Zeit 12345 keine Ausgabe`);
  }
});

test('Alle Kulissen zeichnen ohne Absturz', () => {
  /*
   * Die wichtigste Prüfung: Ein Fehler in einer einzelnen Kulisse (fehlendes
   * Feld, unbekannte Wasserart) würde im Spiel als leerer Hintergrund
   * erscheinen — oder als Ausnahme den ganzen Frame abbrechen.
   */
  for (const { id, scenery } of KULISSEN) {
    for (const [name, fn, extra] of SCHRITTE(scenery)) {
      const ctx = fakeCtx();
      assert.doesNotThrow(() => fn(ctx, ...extra),
        `${id}: ${name} wirft eine Ausnahme`);
    }
  }
});

test('save und restore sind ausgeglichen', () => {
  /*
   * Ein fehlendes `restore` vererbt Zustand an den nächsten Zeichenschritt —
   * ein klassischer Renderer-Fehler, der sich als „falsche Farben an
   * unerwarteten Stellen" zeigt.
   */
  for (const { id, scenery } of KULISSEN.slice(0, 12)) {
    for (const [name, fn, extra] of SCHRITTE(scenery)) {
      const ctx = fakeCtx();
      fn(ctx, ...extra);
      assert.equal(ctx.zaehle('save'), ctx.zaehle('restore'),
        `${id}: ${name} ruft save ${ctx.zaehle('save')}× und restore `
        + `${ctx.zaehle('restore')}× — der Zustand leckt`);
    }
  }
});

test('drawWaterSurface zeichnet nur, wenn es Wasser gibt', () => {
  /*
   * Die Funktion prüft `scenery.water` — ohne Wasserart darf sie NICHTS tun.
   * Ein Zeichnen ohne Wasser würde über der Landschaft erscheinen.
   */
  const ohneWasser = fakeCtx();
  drawWaterSurface(ohneWasser, 1280, 720, { ...KULISSEN[0].scenery, water: null }, 0);
  assert.equal(ohneWasser.aufrufe.length, 0,
    'ohne Wasserart darf kein Zeichenbefehl entstehen');

  /*
   * Gegenprobe: MIT Wasserart muss etwas entstehen. Ohne sie wäre der Test oben
   * auch dann grün, wenn die Funktion gar nichts täte.
   */
  const mitWasser = KULISSEN.find(k => k.scenery.water);
  assert.ok(mitWasser, 'Keine der erzeugten Kulissen hat Wasser — Testaufbau prüfen');
  const ctx = fakeCtx();
  drawWaterSurface(ctx, 1280, 720, mitWasser.scenery, 0);
  assert.ok(ctx.aufrufe.length > 0,
    `${mitWasser.id}: mit Wasserart muss gezeichnet werden`);
});

test('waterColors liefert immer eine vollständige Farbangabe', () => {
  /*
   * Die Funktion hat einen Rückfall für fehlende Daten. Geprüft wird, dass der
   * Rückfall die Felder liefert, die der Aufrufer erwartet — ein fehlendes Feld
   * geriete als `undefined` in eine Farbzeichenkette.
   */
  const rueckfall = waterColors(null);
  for (const feld of ['body', 'shallow', 'alpha']) {
    assert.ok(rueckfall[feld] !== undefined,
      `der Rückfall liefert kein Feld "${feld}"`);
  }
  assert.ok(Array.isArray(rueckfall.body) && rueckfall.body.length === 3,
    'die Farbe muss ein RGB-Tripel sein');
  for (const kanal of rueckfall.body) {
    assert.ok(Number.isFinite(kanal) && kanal >= 0 && kanal <= 255,
      `Farbkanal ${kanal} liegt außerhalb 0..255`);
  }

  // Eine vorhandene Wasserart wird unverändert durchgereicht.
  const art = { body: [1, 2, 3], shallow: [4, 5, 6], alpha: 0.5 };
  assert.deepEqual(waterColors(art), art,
    'eine vorhandene Wasserart darf nicht verändert werden');
});

test('Der Zeichner ist rein — zweimal aufgerufen dasselbe', () => {
  /*
   * Die Funktionen dürfen keinen eigenen Zustand führen. Wären sie nicht rein,
   * zeichnete derselbe Aufruf beim zweiten Mal etwas anderes — und niemand
   * würde es bemerken, weil es nur die Kulisse beträfe.
   */
  const scenery = KULISSEN[0].scenery;
  const lauf = () => {
    const ctx = fakeCtx();
    drawSky(ctx, 1280, 720, scenery, 100);
    drawAmbient(ctx, 1280, 720, scenery, 100, false);
    drawLandmarks(ctx, 1280, 720, scenery, 500);
    return ctx.aufrufe.map(a => a.name).join(',');
  };
  assert.equal(lauf(), lauf(), 'derselbe Aufruf ergibt eine andere Zeichenfolge');
});

test('Kleine und große Flächen werden ohne Absturz gezeichnet', () => {
  /*
   * Randfall: Ein sehr kleiner Canvas (Vorschau) und ein sehr großer. Beides
   * kommt im Spiel vor, und ein Fehler darin wäre nur bei der jeweiligen Größe
   * sichtbar.
   */
  for (const [b, h] of [[1, 1], [64, 48], [1280, 720], [3840, 2160]]) {
    const ctx = fakeCtx();
    assert.doesNotThrow(
      () => drawSky(ctx, b, h, KULISSEN[0].scenery, 50),
      `drawSky wirft bei ${b}×${h}`,
    );
  }
});
