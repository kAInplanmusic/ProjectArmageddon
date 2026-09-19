/**
 * Tests: Die Reichweitenskalierung.
 *
 * ## Der Mangel, den diese Datei absichert
 *
 * FUND (belegt, gemessen mit `npm run check:reichweite`): Die Wurfweite ist
 * **konstant 613 px** — unabhängig von der Kartengröße. Auf einer 1280er Karte
 * fiel das nie auf (1,91× Reserve gegen den nächsten Gegner); auf 5120 px
 * erreicht die stärkste Waffe **nicht mehr** den nächsten Gegner (0,48×).
 *
 * Die Waffen sind für kleine Karten gebaut. Der Motor skaliert deshalb die
 * Umrechnung mit der Kartenbreite — bei 1920 px mit dem Faktor 1,0, sodass
 * dort alles unverändert bleibt.
 *
 * ## Warum das eine Produktentscheidung war
 *
 * Die Alternative wäre gewesen, 150 Werte der Designdatei zu ändern. Die Datei
 * gehört dem Auftraggeber und wird nicht ohne Auftrag angefasst — abgesehen
 * davon würde das nur EINE Kartengröße stimmig machen. Der Faktor dagegen
 * erfasst alle Waffen gleichmäßig und lässt ihre Spreizung unberührt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reichweitenFaktor, geschwindigkeitsFaktor, wurfweite,
  reichtZumNaechstenGegner, BEZUGS_KARTENBREITE, FAKTOR_MIN, FAKTOR_MAX,
} from '../src/shared/reichweite.js';
import { POWER_TO_SPEED, HOHECHSTE_KRAFT, reichweiteFuer } from '../src/engine/match.js';
import { DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';

const G = DEFAULT_PROJECTILE_GRAVITY;

/** Die Wurfweite einer Waffe auf einer Karte. */
function weiteAuf(kartenbreite, speedFactor = 1) {
  return wurfweite({
    powerToSpeed: POWER_TO_SPEED,
    kraft: HOHECHSTE_KRAFT,
    schwerkraft: G,
    speedFactor,
    /*
     * Der GESCHWINDIGKEITS-Faktor — nicht der Weitenfaktor. Der Parameter hieß
     * hier früher `reichweite` und trug damit denselben Namen wie die Skalierung
     * selbst; seit 2026-09-19 heißen die beiden Dinge verschieden:
     * `geschwindigkeitsFaktor` (für v, also f) und `weitenFaktor` (für x, f²).
     */
    geschwindigkeitsFaktor: geschwindigkeitsFaktor(kartenbreite),
  });
}

test('Bei der Bezugsbreite ändert sich nichts', () => {
  /*
   * Die wichtigste Zusage: Auf der gewohnten Größe bleibt das Spiel, wie es
   * war. Eine Skalierung, die überall etwas ändert, wäre keine Erweiterung,
   * sondern ein Umbau.
   */
  assert.equal(BEZUGS_KARTENBREITE, 1920);
  assert.equal(reichweitenFaktor(1920), 1,
    'bei 1920 px muss der Faktor genau 1 sein');
  assert.equal(reichweiteFuer(1920), 1,
    'der Motor muss denselben Wert liefern');
});

test('Kleinere Karten werden gedämpft, größere verstärkt', () => {
  /*
   * Die Richtung. Wäre sie vertauscht, würde eine 4K-Karte die Waffen
   * kürzer machen — das Gegenteil des Zwecks.
   */
  assert.ok(reichweitenFaktor(1280) < 1, '1280 px muss unter 1 liegen');
  assert.ok(reichweitenFaktor(2560) > 1, '2560 px muss über 1 liegen');
  assert.ok(reichweitenFaktor(3840) > reichweitenFaktor(2560),
    'größere Karten müssen einen größeren Faktor ergeben');
});

test('Der Faktor wächst mit der WURZEL der Breite', () => {
  /*
   * ## Warum die Wurzel und nicht linear
   *
   * Die Wurfweite wächst mit dem QUADRAT der Geschwindigkeit (`x = v²/g`). Um
   * die Weite zu verdoppeln, genügt deshalb die √2-fache Geschwindigkeit.
   *
   * Ohne die Wurzel würde eine 4K-Karte die Waffen viermal so stark machen —
   * die Bahn würde flach und die Waffe unspielbar weit.
   */
  const vierfacheBreite = reichweitenFaktor(1920 * 4);
  assert.ok(Math.abs(vierfacheBreite - 2) < 0.05,
    `Vierfache Breite ergibt Faktor ${vierfacheBreite.toFixed(2)} — erwartet wird 2,00 ` +
    '(die Wurzel aus 4)');
});

test('Der Faktor wird begrenzt', () => {
  /*
   * Ein Ausreißer darf das Spiel nicht zerlegen. Bei einem Faktor von 0,3
   * fiele jedes Geschoss vor die Füße; bei 3,0 flöge es über die Karte hinaus
   * und die Windphysik würde bedeutungslos.
   */
  assert.equal(reichweitenFaktor(1), FAKTOR_MIN,
    'eine winzige Karte muss auf die Untergrenze fallen');
  assert.equal(reichweitenFaktor(1e9), FAKTOR_MAX,
    'eine riesige Karte muss auf die Obergrenze fallen');

  // Und unsinnige Eingaben ergeben den Neutralwert.
  assert.equal(reichweitenFaktor(0), 1);
  assert.equal(reichweitenFaktor(-100), 1);
  assert.equal(reichweitenFaktor(NaN), 1);
  assert.equal(reichweitenFaktor('abc'), 1);
});

test('Auf jeder Kartengröße bleibt dieselbe Reserve', () => {
  /*
   * DAS Ziel der Skalierung. Vorher sank die Reserve von 1,91× auf 0,48×,
   * je größer die Karte wurde — auf 5120 px war der nächste Gegner nicht mehr
   * erreichbar.
   *
   * Jetzt liegt die Reserve überall gleich hoch. Gemessen wird über die
   * tatsächliche Wurfweite, nicht über den Faktor.
   */
  const reserven = [1280, 1920, 2560, 3840, 5120].map((breite) => {
    const r = reichtZumNaechstenGegner({
      kartenbreite: breite, weite: weiteAuf(breite),
    });
    return { breite, reserve: r.reserve, ausreichend: r.ausreichend };
  });

  for (const { breite, reserve, ausreichend } of reserven) {
    assert.ok(ausreichend,
      `Auf ${breite} px reicht die Waffe nicht (Reserve ${reserve.toFixed(2)}×)`);
    assert.ok(reserve > 1.1,
      `Auf ${breite} px ist die Reserve nur ${reserve.toFixed(2)}× — zu knapp`);
    assert.ok(reserve < 1.6,
      `Auf ${breite} px ist die Reserve ${reserve.toFixed(2)}× — die Waffen sind zu weit`);
  }
});

test('Die Spreizung der Waffen bleibt erhalten', () => {
  /*
   * ## Die Prüfung, die eine schlechte Lösung entlarvt
   *
   * Eine Skalierung könnte alle Waffen auf denselben Wert bringen — dann gäbe
   * es keine Unterschiede mehr. Der Faktor muss deshalb JEDE Waffe gleich
   * erfassen: Die Reihenfolge der Reichweiten bleibt unverändert.
   *
   * Die `speedFactor`-Werte stammen aus dem Katalog (Wurf 0,39, Geschoss 1,0).
   */
  const faktoren = [0.39, 0.62, 0.79, 1.0];
  const weiten = faktoren.map(f => weiteAuf(2560, f));

  for (let i = 1; i < weiten.length; i += 1) {
    assert.ok(weiten[i] > weiten[i - 1],
      `Die Reihenfolge ist zerbrochen: ${weiten[i - 1]} px folgt auf ${weiten[i]} px`);
  }

  /*
   * Und eine Wurfwaffe darf auch auf einer großen Karte nicht plötzlich so
   * weit fliegen wie ein Geschoss: Das Verhältnis bleibt.
   */
  const verhaeltnis = weiten[weiten.length - 1] / weiten[0];
  assert.ok(verhaeltnis > 2,
    `Das Verhältnis zwischen schwerster und leichtester Waffe ist nur `
    + `${verhaeltnis.toFixed(2)} — die Spreizung ist verloren`);
});

test('Der Motor nutzt den Faktor wirklich', () => {
  /*
   * Die Gegenprobe zur reinen Rechnung: Der Motor muss denselben Wert liefern
   * wie das Modul. Ein zweiter Rechenweg wäre eine zweite Wahrheit.
   */
  for (const breite of [1280, 1920, 2560, 5120]) {
    assert.equal(reichweiteFuer(breite), reichweitenFaktor(breite),
      `Der Motor weicht bei ${breite} px vom Modul ab`);
  }
});

test('Eine echte Waffe erreicht den nächsten Gegner', () => {
  /*
   * ## Die Frage, die zählt — und ein eigener Denkfehler
   *
   * FUND (belegt, eigener Fehler): Hier stand zuerst `weite > 1280` — die
   * Erwartung, ein Geschoss müsse die KARTENMITTE einer 2560er Karte
   * erreichen. Gemessen waren es 817 px, und der Test schlug fehl.
   *
   * Die Erwartung war falsch. Figur 1 muss nicht Figur 3 in der Mitte
   * erreichen, sondern den NÄCHSTEN Gegner. Bei vier gleichmäßig verteilten
   * Figuren liegt der bei einem Viertel der Kartenbreite — 640 px auf einer
   * 2560er Karte. Die 817 px sind dazu die 1,28-fache Reserve, also reichlich.
   *
   * Der Test prüft deshalb die richtige Frage — und zwar auf jeder Größe.
   */
  for (const breite of [1280, 1920, 2560, 3840, 5120]) {
    const weite = weiteAuf(breite, 1.0);
    const { ausreichend, abstand, reserve } = reichtZumNaechstenGegner({
      kartenbreite: breite, weite,
    });

    assert.ok(ausreichend,
      `Auf ${breite} px: Weite ${Math.round(weite)} px gegen Abstand `
      + `${Math.round(abstand)} px — der nächste Gegner ist unerreichbar`);

    assert.ok(reserve > 1.15,
      `Auf ${breite} px ist die Reserve nur ${reserve.toFixed(2)}× — zu knapp`);
  }
});

test('Eine Wurfwaffe bleibt eine Wurfwaffe', () => {
  /*
   * Der Baseballschläger hat einen `speedFactor` von 0,39. Auch skaliert darf
   * er kein Fernkampfgeschoss werden — sonst wäre der Unterschied zwischen
   * Wurf- und Schusswaffen verschwunden.
   */
  const wurf = weiteAuf(5120, 0.39);
  const geschoss = weiteAuf(5120, 1.0);

  assert.ok(wurf < geschoss * 0.5,
    `Eine Wurfwaffe fliegt ${Math.round(wurf)} px gegen ${Math.round(geschoss)} px — `
    + 'sie ist keine Wurfwaffe mehr');
});
