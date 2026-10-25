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
