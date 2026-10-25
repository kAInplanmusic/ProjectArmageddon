import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController } from '../src/engine/match.js';

/*
 * LOOK-4 Stufe 1 (2026-10-25): Hohlraeume sind begehbar — der Beleg.
 *
 * Gemessen, nicht behauptet: Die Figurenphysik fragt `terrain.isSolid(x, y)`
 * (y-faehig, `bewegungSystem.js:48`, `characterSystem.js:239/272`), NICHT die
 * einwertige Oberflaeche `surfaceYAt(x)`. Diese Pruefung haelt fest, dass
 * - Hohlraumkarten Innenboeden haben (und Huegelkarten keine),
 * - an einem Innenboden fester Boden mit Luft darüber und darunter liegt,
 * - niemand unter der Oberflaeche startet.
 *
 * Die vier x-only-Stellen (`surfaceYAt` in guentherSystem, cookieSystem,
 * shooting-Einschlag, turret) sind der offene Rest und NICHT Teil dieser
 * Pruefung — siehe docs/auftraege/look4-innenraeume.md.
 */

/** Feste Baender mit Luft darunter — dieselbe Zaehlung wie in der Messung. */
function innenboeden(bitmap, breite, hoehe, schritt = 2) {
  const funde = [];
  for (let x = 0; x < breite; x += schritt) {
    let y = 0;
    while (y < hoehe) {
      while (y < hoehe && !bitmap[y * breite + x]) y += 1;
      if (y >= hoehe) break;
      const oben = y;
      while (y < hoehe && bitmap[y * breite + x]) y += 1;
      const unten = y - 1;
      if (unten < hoehe - 1 && bitmap[(unten + 1) * breite + x] === 0) funde.push({ x, oben, unten });
    }
  }
  return funde;
}

function baueMatch(kartentyp) {
  const m = new MatchController({
    seed: 7,
    teams: 2,
    playersPerTeam: 2,
    kartentyp,
    turnDurationMs: 2000,
    valhallaRound: 999,
  });
  m.start();
  return m;
}

test('Hohlraumkarte hat viele Innenboeden, Huegelkarte keinen', () => {
  const breite = 2560;
  const kavernen = baueMatch('kavernen');
  const hoehe = kavernen.bitmap.length / breite;
  const boeden = innenboeden(kavernen.bitmap, breite, hoehe);
  assert.ok(boeden.length > 1000, `kavernen: ${boeden.length} Innenboeden erwartet > 1000`);

  const huegel = baueMatch('huegel');
  const huegelBoeden = innenboeden(huegel.bitmap, breite, hoehe);
  assert.equal(huegelBoeden.length, 0, `huegel darf keine Innenboeden haben, gefunden: ${huegelBoeden.length}`);
});

test('An einem tiefen Innenboden ist der Boden fest, oben und unten ist Luft', () => {
  const breite = 2560;
  const m = baueMatch('kavernen');
  const hoehe = m.bitmap.length / breite;
  const boeden = innenboeden(m.bitmap, breite, hoehe).map(b => ({
    ...b,
    tiefe: b.unten - Math.round(m.surfaceYAt(b.x)),
  }));
  assert.ok(boeden.length > 0, 'mindestens ein Innenboden erwartet');
  const tiefster = boeden.reduce((a, b) => (b.tiefe > a.tiefe ? b : a), boeden[0]);
  assert.ok(tiefster.tiefe > 100, `tiefster Innenboden liegt ${tiefster.tiefe} px unter der Oberflaeche`);

  // Genau das braucht eine Figur zum Stehen: fester Boden, Luft drumherum.
  assert.equal(m.terrain.isSolid(tiefster.x, tiefster.oben), true, 'Innenboden muss fest sein');
  assert.equal(m.terrain.isSolid(tiefster.x, tiefster.oben - 5), false, 'ueber dem Boden muss Luft sein');
  assert.equal(m.terrain.isSolid(tiefster.x, tiefster.unten + 4), false, 'unter dem Band muss Luft sein');

  // Und die einwertige Oberflaeche liegt woanders — der offene Rest (x-only).
  assert.ok(m.surfaceYAt(tiefster.x) < tiefster.oben - 100,
    'surfaceYAt(x) kennt den Innenboden nicht — genau die vier offenen Stellen');
});

test('Niemand startet unter der Oberflaeche', () => {
  for (const kartentyp of ['kavernen', 'hoehlen', 'huegel']) {
    const m = baueMatch(kartentyp);
    // Die Platzvergabe setzt die Figuren an die Oberflaeche; `isGrounded`
    // stimmt erst nach dem ersten Physikschritt (gemessen 2026-10-25).
    for (let i = 0; i < 30; i += 1) m.step();
    const spieler = m.players ?? [];
    assert.ok(spieler.length >= 4, `${kartentyp}: Spieler erwartet`);
    for (const p of spieler) {
      const x = m.world.getComponent(p.entityId, 'Position', 'x');
      const y = m.world.getComponent(p.entityId, 'Position', 'y');
      const oberflaeche = m.surfaceYAt(Math.round(x));
      assert.ok(y < oberflaeche, `${kartentyp}: Spieler bei y=${y} liegt unter der Oberflaeche ${oberflaeche}`);
      assert.equal(m.isGrounded(p.entityId), true, `${kartentyp}: Spieler muss auf dem Boden stehen`);
    }
  }
});

/*
 * Der Fehler, den Stufe 1 beheben muss (rot bis zum Fix, 2026-10-25):
 * `shiftPlayer` (Rueckstoss/Selbstbewegung) verankerte die Figur mit
 * `surfaceYAt(zielX)` — der einwertigen Gelaendeoberflaeche. Gemessen in einer
 * Kaverne (Seed 7): Figur auf dem Innenboden y=1279, Oberflaeche 516; nach dem
 * Feuern einer Bewegungswaffe stand sie bei y=638, also 641 px nach oben aus
 * der Hoehle gerissen. Ein Bewegungsspezial darf eine Figur nicht aus dem
 * Hohlraum teleportieren.
 */
// Behoben am 2026-10-25 (LOOK-4 Stufe 1) — Goldwerte im Krater-Lauf bewusst nachgezogen:
// Mit einer Bodensuche um die bisherige Hoehe (statt surfaceYAt) wird dieser Test
// gruen — aber die Goldwert-Pruefungen in tests/zerstoerung.test.js aendern ihre
// Zustands-Hashes (Seed 4242: 85bd9975 -> 1fefacd8, 30 Krater, Figuren stehen im
// Krater). Diesen Fehler anzufassen heisst: Goldwerte bewusst neu basieren. Das ist
// eine eigene Entscheidung, keine Nebenwirkung. Bis dahin bleibt der Test sichtbar
// uebersprungen — er beschreibt den Fehler und ist mit dem Fix sofort nutzbar.
test('Ein Bewegungsspezial reisst die Figur nicht aus dem Hohlraum', () => {
  const breite = 2560;
  const m = new MatchController({
    seed: 7, teams: 2, playersPerTeam: 2, kartentyp: 'kavernen', turnDurationMs: 20000, valhallaRound: 999,
  });
  m.start();
  const hoehe = m.bitmap.length / breite;
  const boeden = innenboeden(m.bitmap, breite, hoehe).map(b => ({ ...b, tiefe: b.unten - Math.round(m.surfaceYAt(b.x)) }));
  const tiefster = boeden.reduce((a, b) => (b.tiefe > a.tiefe ? b : a), boeden[0]);
  assert.ok(tiefster.tiefe > 400, `Testszenario braucht einen tiefen Hohlraum, tiefster: ${tiefster.tiefe} px`);

  const p = m.players[0];
  // Bewegungswaffe (Selbst-Effekt MOVE) in die Hand geben — pa_087 ist Teleport.
  m.inventory.grantWeapon(p.entityId, 'pa_087');
  m.inventory.grantAmmo(p.entityId, 'pa_087', 5);
  m.inventory.selectWeapon(p.entityId, 'pa_087');
  m.world.setComponent(p.entityId, 'Position', 'x', tiefster.x);
  m.world.setComponent(p.entityId, 'Position', 'y', tiefster.oben);
  m.world.setComponent(p.entityId, 'Velocity', 'x', 0);
  m.world.setComponent(p.entityId, 'Velocity', 'y', 0);

  const vorherY = m.world.getComponent(p.entityId, 'Position', 'y');
  const schuss = m.fire(p.entityId, 0, 0.5, 'pa_087');
  assert.equal(schuss.ok, true, `Schuss muss angenommen werden: ${JSON.stringify(schuss.errors ?? [])}`);
  for (let i = 0; i < 5; i += 1) m.step();

  const x = m.world.getComponent(p.entityId, 'Position', 'x');
  const y = m.world.getComponent(p.entityId, 'Position', 'y');
  // Die Bewegung darf die Hoehe des Hohlraums nicht verlassen (+-120 px).
  assert.ok(Math.abs(y - vorherY) <= 120,
    `Figur wurde aus dem Hohlraum gerissen: y ${Math.round(vorherY)} -> ${Math.round(y)}`);
  assert.ok(y > m.surfaceYAt(Math.round(x)) + 400,
    `Figur muss tief unter der Oberflaeche bleiben: y=${Math.round(y)}, Oberflaeche=${Math.round(m.surfaceYAt(Math.round(x)))}`);
});

/*
 * Haustiere im Hohlraum (Entscheidung 2026-10-25: sie sollen folgen).
 *
 * Cookie hängt in `#bodenFolgen` an `surfaceYAt` — gemessen: in eine Kaverne
 * gesetzt (y=1279, Oberfläche 516) stand er nach 10 Ticks auf 516, also auf der
 * Oberfläche über der Höhle. Der Fix läuft über die gemeinsame Abfrage
 * `bodenNahe(x, vonY)` aus `src/engine/boden.js`; Günther nutzt denselben
 * Kontext-Zugang (`#tierKontext`), wird hier aber nicht geprüft, weil er selbst
 * wandert und damit keine feste Spalte hat.
 */
test('Cookie bleibt auf einem Innenboden', () => {
  const breite = 2560;
  const m = new MatchController({
    seed: 7, teams: 2, playersPerTeam: 2, kartentyp: 'kavernen',
    turnDurationMs: 20000, valhallaRound: 999, cookie: 2,
  });
  m.start();
  const hoehe = m.bitmap.length / breite;
  const boeden = innenboeden(m.bitmap, breite, hoehe).map(b => ({ ...b, tiefe: b.unten - Math.round(m.surfaceYAt(b.x)) }));
  const tiefster = boeden.reduce((a, b) => (b.tiefe > a.tiefe ? b : a), boeden[0]);
  assert.ok(tiefster.tiefe > 400, `Testszenario braucht einen tiefen Hohlraum, tiefster: ${tiefster.tiefe} px`);

  m.cookieSystem.setzePosition(tiefster.x, tiefster.oben);
  for (let i = 0; i < 10; i += 1) m.step();

  const p = m.cookieSystem.position;
  const oberflaeche = Math.round(m.surfaceYAt(Math.round(p.x)));
  assert.ok(p.y > oberflaeche + 200,
    `Cookie wurde auf die Oberfläche gesetzt: y=${Math.round(p.y)}, Oberfläche=${oberflaeche} (Hohlraum war ${tiefster.oben})`);
});
