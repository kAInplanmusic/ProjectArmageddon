/**
 * Tests: Das Kantenlicht.
 *
 * ## Der Befund, der diese Datei nötig machte
 *
 * `npm run check:terrain` maß über Jahre denselben Zustand:
 *
 *     Gemalte Striche:                 64
 *     betroffene Spalten:              64 von 64
 *     Spalten mit mehr als einem Strich: 0
 *
 *     BEFUND: Die Kante ist überall ein EINZELNER Strich von 1 px Breite.
 *     Es gibt keinen Verlauf und keine zweite Stufe — die Kante ist damit
 *     eine Linie, kein Licht.
 *
 * Ein 1-px-Strich in einer etwas helleren Farbe ist eine **Kontur**. Echte
 * Kantenbeleuchtung hat mehrere Stufen: hell an der Oberfläche, dann schnell
 * abfallend. Erst dadurch wirkt die Kante wie eingefallenes Licht und gibt dem
 * Gelände Volumen.
 *
 * ## Was hier geprüft wird
 *
 *   1. Die Kante hat **mehrere Stufen** (nicht eine).
 *   2. Die Stufen werden nach unten **dunkler** (Verlauf, nicht Block).
 *   3. Ganz oben stimmt die Farbe mit `edgeLightColor` überein.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  drawSurfaceEdge, edgeLightColor, KANTEN_STUFEN,
} from '../src/client/terrainBaker.js';

/**
 * Ein 2D-Zeichenkontext, der die Farben mitschreibt.
 *
 * Er zeichnet nicht wirklich, sondern sammelt je Pixel die zuletzt gesetzte
 * Farbe. Damit lässt sich prüfen, welche Stufen eine Spalte bekommen hat —
 * ohne Canvas.
 */
function fakeCtx() {
  const gesetzt = new Map();

  return {
    gesetzt,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    fillRect(x, y, w, h) {
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          gesetzt.set(`${x + dx},${y + dy}`, this.fillStyle);
        }
      }
    },
  };
}

/** Baut eine Maske aus ASCII. `#` = Land. */
function maske(zeilen) {
  const height = zeilen.length;
  const width = zeilen[0].length;
  const bitmap = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (zeilen[y][x] === '#') bitmap[y * width + x] = 1;
    }
  }
  return { bitmap, width, height };
}

/**
 * Wandelt eine Farbangabe in eine Helligkeit.
 *
 * ## Ein eigener Fehler, der hier stand
 *
 * FUND (belegt): Die Funktion suchte mit `/rgb\(…\)/` — die Kantenfarben heißen
 * aber `rgba(…)`. In JavaScript matcht `/rgb\(/` **nicht** in `rgba(`, weil
 * direkt nach `rgb` eine öffnende Klammer erwartet wird und dort ein `a` steht.
 *
 * Folge: Jede Helligkeit war `null`, und der Test meldete
 * „kein sichtbarer Unterschied (undefined → undefined)" — obwohl der Verlauf
 * einwandfrei funktionierte. Der Fehler lag im Test, nicht im Code.
 *
 * Das Muster deckt jetzt beide Formen ab (`rgb` und `rgba`), und ein
 * `assert` in den Tests stellt sicher, dass wirklich eine Zahl herauskommt.
 */
function helligkeit(farbe) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(farbe));
  if (!m) return null;
  return Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114;
}

test('Das Kantenlicht hat mehrere Stufen', () => {
  /*
   * Der Kern der Sache. Eine einzelne Stufe ist eine Kontur; erst mehrere
   * Stufen mit abnehmender Helligkeit ergeben den Eindruck von Licht.
   */
  assert.ok(KANTEN_STUFEN >= 2,
    `KANTEN_STUFEN ist ${KANTEN_STUFEN} — eine Kante braucht mindestens zwei Stufen`);

  const { bitmap, width, height } = maske([
    '....',
    '#...',
    '##..',
    '###.',
    '####',
    '####',
    '####',
    '####',
  ]);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, [86, 148, 74]);

  /*
   * FUND (belegt, eigener Testfehler): Hier stand `y = 3` als Kantenbeginn —
   * gemessen beginnt sie bei **y=4**. Die Maske setzt in Zeile 3 (`###.`) das
   * Land der Spalte 3, aber Zeile 4 (`####`) hat dort schon Land, also ist die
   * sichtbare Kante die Zeile 4.
   *
   * Statt die Stelle zu raten, wird sie jetzt GESUCHT: die erste Zeile, in der
   * in dieser Spalte etwas gezeichnet wurde.
   */
  let kantenBeginn = -1;
  for (let y = 0; y < height; y += 1) {
    if (ctx.gesetzt.has(`3,${y}`)) { kantenBeginn = y; break; }
  }

  assert.ok(kantenBeginn >= 0, 'in Spalte 3 wurde überhaupt nichts gezeichnet');

  const farben = [];
  for (let y = kantenBeginn; y < kantenBeginn + KANTEN_STUFEN; y += 1) {
    farben.push(ctx.gesetzt.get(`3,${y}`));
  }

  assert.ok(farben.every(f => f !== undefined),
    `Nur ${farben.filter(f => f !== undefined).length} von ${KANTEN_STUFEN} Stufen ` +
    'wurden gezeichnet');

  const eindeutige = new Set(farben);
  assert.ok(eindeutige.size >= 2,
    `Alle ${KANTEN_STUFEN} Stufen haben dieselbe Farbe (${farben[0]}) — ` +
    'das ist ein Block, kein Verlauf');
});

test('Die Stufen werden nach unten dunkler', () => {
  /*
   * Die Richtung des Verlaufs. Ein Verlauf, der nach unten HELLER wird, würde
   * das Licht von unten kommen lassen — das sieht falsch aus und wäre ein
   * Fehler, den man im Code nicht sieht.
   */
  const { bitmap, width, height } = maske([
    '....',
    '####',
    '####',
    '####',
    '####',
    '####',
    '####',
    '####',
  ]);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, [86, 148, 74]);

  let kantenBeginn = -1;
  for (let y = 0; y < height; y += 1) {
    if (ctx.gesetzt.has(`2,${y}`)) { kantenBeginn = y; break; }
  }
  assert.ok(kantenBeginn >= 0, 'in Spalte 2 wurde nichts gezeichnet');

  const helligkeiten = [];
  for (let y = kantenBeginn; y < kantenBeginn + KANTEN_STUFEN; y += 1) {
    const h = helligkeit(ctx.gesetzt.get(`2,${y}`));
    assert.ok(typeof h === 'number' && Number.isFinite(h),
      `Stufe bei y=${y}: die Farbe „${ctx.gesetzt.get(`2,${y}`)}" ließ sich nicht `
      + 'in eine Helligkeit umrechnen');
    helligkeiten.push(h);
  }

  for (let i = 1; i < helligkeiten.length; i += 1) {
    assert.ok(helligkeiten[i] <= helligkeiten[i - 1] + 0.5,
      `Stufe ${i} (${helligkeiten[i]?.toFixed(0)}) ist heller als Stufe ${i - 1} ` +
      `(${helligkeiten[i - 1]?.toFixed(0)}) — der Verlauf zeigt nach oben`);
  }

  assert.ok(helligkeiten[0] > helligkeiten[helligkeiten.length - 1] + 2,
    'Zwischen hellster und dunkelster Stufe liegt kein sichtbarer Unterschied ' +
    `(${helligkeiten[0]?.toFixed(0)} → ${helligkeiten[helligkeiten.length - 1]?.toFixed(0)})`);
});

test('Die oberste Stufe nutzt die Kantenfarbe des Bodens', () => {
  /*
   * Die hellste Stufe muss zur Bodenfarbe passen — sonst leuchtet die Kante in
   * einer Fremdfarbe. `edgeLightColor` ist die Stelle, die das festlegt; sie
   * wird hier gegen die Zeichnung geprüft, nicht gegen eine abgeschriebene Zahl.
   */
  const boden = [86, 148, 74];
  const erwartet = edgeLightColor(boden);

  const { bitmap, width, height } = maske(['....', '####', '####', '####', '####']);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, boden);

  assert.equal(ctx.gesetzt.get('2,1'), erwartet,
    'die oberste Stufe muss die Kantenfarbe tragen');
});

test('Eine Kante mit mehreren Abschnitten wird ganz beleuchtet', () => {
  /*
   * Der frühere Fehler: Ein `break` zeichnete nur die ERSTE Kante je Spalte.
   * Bei einer 1D-Oberfläche ist das richtig; bei einer 2D-Maske mit Höhlen gibt
   * es Decke und Boden je Kammer. Alle außer der obersten blieben dunkel.
   */
  const { bitmap, width, height } = maske([
    '####',
    '####',
    '#..#',
    '#..#',
    '####',
    '####',
  ]);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, [86, 148, 74]);

  // Die Spalte 1 hat zwei Kanten: bei y=4 (Boden der Kammer) und y=0.
  assert.ok(ctx.gesetzt.has('1,4'),
    'der KAMMERBODEN bei y=4 wurde nicht beleuchtet — nur die oberste Kante je Spalte');
  assert.ok(ctx.gesetzt.has('1,0'), 'die oberste Kante fehlt');
});

test('Ohne Land wird nichts gezeichnet', () => {
  /*
   * Eine leere Karte darf keine Farbe setzen. Ein Randfall, der bei einer
   * Inselkarte mit leeren Spalten wirklich vorkommt.
   */
  const { bitmap, width, height } = maske(['....', '....', '....']);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, [86, 148, 74]);

  assert.equal(ctx.gesetzt.size, 0, 'auf einer leeren Karte wurde gezeichnet');
});

test('Der Verlauf läuft nicht über die Karte hinaus', () => {
  /*
   * Liegt die Kante ganz unten, dürfen die Stufen nicht über den Rand hinaus
   * gezeichnet werden — `fillRect` mit y > height wäre wirkungslos, aber die
   * Rechnung soll trotzdem sauber bleiben.
   */
  const { bitmap, width, height } = maske(['####', '####', '####', '####']);
  const ctx = fakeCtx();
  drawSurfaceEdge(ctx, bitmap, width, height, [86, 148, 74]);

  for (const schluessel of ctx.gesetzt.keys()) {
    const y = Number(schluessel.split(',')[1]);
    assert.ok(y >= 0 && y < height,
      `Es wurde bei y=${y} gezeichnet, die Karte ist ${height} px hoch`);
  }
});
