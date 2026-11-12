/**
 * Semantische Prüfungen zu W18 (Waffen-Audit 2026-11-08).
 *
 * ## Warum diese Datei
 *
 * Der Audit fand grüne Tests, die nichts über die BEDEUTUNG sagen: Datei
 * existiert, Schema passt, Stichwort kommt vor. Durchgekommen sind damit
 * falsche Köpfe, vertauschte Griffe und ein Radius-Fallback, der aus
 * „kein Flächenschaden" eine 24-px-Wirkung machte.
 *
 * Hier stehen deshalb Fälle, die eine Bedeutung festnageln — jeweils mit einem
 * Gegenfall, damit die Prüfung nicht auch bei „alles gleich" grün wird:
 *
 *   1. **Trefferfenster vs. Schadensradius** — ein deklarierter Radius bleibt
 *      erhalten, das 24er-Fenster füllt nur Lücken.
 *   2. **Zweites Ziel** — Radius 0 trifft nur das getroffene Ziel, ein echter
 *      Radius trifft auch den Nachbarn 30 px daneben (derselbe Aufruf).
 *   3. **Waffenversion** — der Standard ist die aktuelle Fassung, Altfassungen
 *      sehen spätere Schichten nicht, und eine Fassung ändert nur ihre Felder.
 *   4. **Anker** — Figuren stehen auf der Bodenlinie, Waffen zeigen mit der
 *      Mündung nach vorn und beide Punkte liegen im Bildinhalt.
 *   5. **Morphologie** — der Prompt nennt die Anatomie des Typs, nicht die
 *      eines anderen; „low stance" kniet ein Kettenfahrzeug nie.
 *   6. **Hockfallback** — fehlt das Hockblatt, fällt die Rolle auf Gehen
 *      zurück und die Prozedur staucht voll statt gedämpft.
 *
 * Abgrenzung: `melee-throw-match.test.js` prüft 0 gegen 24 beim Spawn,
 * `stats-trefferfenster.test.js` das Zeitfenster der Trefferquote,
 * `figur-sheets.test.js` die Rollenreihenfolge an einem synthetischen Blatt,
 * `seitenansichten.test.js` die Manifestfelder. Nichts davon wird hier
 * wiederholt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MatchController } from '../src/engine/match.js';
import { wendeExplosionAn } from '../src/engine/explosion.js';
import {
  getWaffe, WAFFEN_KLASSE, WAFFEN_NACHSCHUB, WAFFEN_STREU, WAFFEN_FEUERWESEN, WAFFEN_STANDARD, WAFFEN_TREFFER, WAFFEN_TEMPO, WAFFEN_WIND, WAFFEN_ALT,
} from '../src/shared/config/waffen-fassung.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { waehleRolle, MODUS } from '../src/client/figurSheets.js';
import { FigurPosen } from '../src/client/figurAnimation.js';
import { TYPES, frameDescription, buildPrompt } from '../tools/design-rest/core.mjs';

const WURZEL = path.resolve(import.meta.dirname, '..');
const lies = rel => JSON.parse(readFileSync(path.join(WURZEL, rel), 'utf8'));

const SEITEN_MANIFEST = lies('src/client/assets/characters-side/manifest.json');
const WAFFEN_MANIFEST = lies('src/client/assets/weapon-sprites/manifest.json');
const DESIGN_CHARAKTERE = lies('tools/design-rest/characters.json');

function neuerMatch() {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  return match;
}

/** Schießt eine Waffe ab und liefert das erzeugte Projektil samt Spawn-Radius. */
function schuss(weaponId) {
  const match = neuerMatch();
  const schuetze = match.getState().entities[0];
  match.inventory.register(schuetze.entityId, [weaponId]);
  match.inventory.selectWeapon(schuetze.entityId, weaponId);
  const ergebnis = match.fire(schuetze.entityId, 1.0, 100, weaponId);
  assert.equal(ergebnis.ok, true, `${weaponId}: Schuss wurde abgelehnt`);
  return {
    match,
    radius: match.world.getComponent(ergebnis.projectileId, 'Projectile', 'blastRadius'),
    trefferRadius: match.world.getComponent(ergebnis.projectileId, 'Projectile', 'trefferRadius'),
  };
}

// ------------------------------------------------- Trefferfenster und Radius

test('W18 Radius: ein deklarierter Radius bleibt, das 24er-Fenster füllt nur Lücken', () => {
  // Vergleich gegen den Stand der Standardfassung (Fassung 21 ändert Radien einzelner Waffen).
  const mitFlaeche = WEAPONS.map(w => getWaffe(w.id)).find(w => w.delivery === 'projectile' && w.blastRadius >= 40);
  assert.ok(mitFlaeche, 'keine Projektilwaffe mit deklariertem Radius im Katalog');

  const deklariert = schuss(mitFlaeche.id).radius;
  assert.equal(deklariert, mitFlaeche.blastRadius,
    `${mitFlaeche.displayName}: Spawn-Radius ${deklariert} statt ${mitFlaeche.blastRadius} — `
    + 'der 24er-Fallback darf einen deklarierten Radius nicht ersetzen');

  // Gegenfall: ohne Deklaration bekommt ein Geschoss das Trefferfenster, aber keinen Schadensradius.
  const ohneFlaeche = WEAPONS.map(w => getWaffe(w.id)).find(w => w.category === 'ranged' && w.blastRadius === 0 && w.damage > 0);
  assert.ok(ohneFlaeche, 'keine Geschosswaffe ohne Flächenwirkung im Katalog');
  const geschoss = schuss(ohneFlaeche.id);
  assert.equal(geschoss.radius, 0,
    `${ohneFlaeche.displayName}: Ein Geschoss ohne Flächenwirkung darf keinen Schadensradius tragen`);
  assert.equal(geschoss.trefferRadius, 24,
    `${ohneFlaeche.displayName}: Ein Geschoss ohne Flächenwirkung braucht das Trefferfenster`);

  // Und eine Wurfwaffe bekommt keines — ihr Startpunkt liegt am Körper.
  const wurf = WEAPONS.find(w => w.category === 'melee' && w.delivery === 'projectile');
  assert.ok(wurf, 'keine Wurfwaffe im Katalog');
  const geworfen = schuss(wurf.id);
  assert.equal(geworfen.radius, 0,
    `${wurf.displayName}: Wurfwaffen dürfen keinen Schadensradius tragen`);
  assert.equal(geworfen.trefferRadius, 0,
    `${wurf.displayName}: Wurfwaffen dürfen kein Trefferfenster tragen`);
});

test('W18 Radius: 0 trifft nur das Ziel, ein echter Radius trifft das zweite Ziel mit', () => {
  /*
   * Derselbe Aufruf, zwei Radien. Damit ist ausgeschlossen, dass die Prüfung
   * nur den Fall „irgendetwas nimmt Schaden" festhält: Bei Radius 0 bleibt der
   * Nachbar 30 px daneben unversehrt, bei 48 nimmt er anteilig Schaden.
   */
  const match = neuerMatch();
  const [erster, zweiter] = match.getState().entities;
  const x = match.world.getComponent(erster.entityId, 'Position', 'x');
  const y = match.world.getComponent(erster.entityId, 'Position', 'y');
  match.world.setComponent(zweiter.entityId, 'Position', 'x', x + 30);
  match.world.setComponent(zweiter.entityId, 'Position', 'y', y);
  const hp = id => match.world.getComponent(id, 'Health', 'current');

  const explosion = radius => wendeExplosionAn(match.world, {
    x, y, damage: 40, blastRadius: radius, knockback: 0, terrainDamage: 0,
    owner: erster.entityId, damageType: 0, weaponId: 0, hitTarget: erster.entityId,
  });

  const vorherZweiter = hp(zweiter.entityId);
  const vorherErster = hp(erster.entityId);
  explosion(0);
  assert.ok(hp(erster.entityId) < vorherErster, 'Radius 0: das getroffene Ziel muss Schaden nehmen');
  assert.equal(hp(zweiter.entityId), vorherZweiter,
    'Radius 0: der Nachbar 30 px daneben darf keinen Schaden nehmen — das wäre ein versteckter Radius');

  const vorherErster2 = hp(erster.entityId);
  const vorherZweiter2 = hp(zweiter.entityId);
  explosion(48);
  assert.ok(hp(erster.entityId) < vorherErster2, 'Radius 48: das getroffene Ziel muss Schaden nehmen');
  assert.ok(hp(zweiter.entityId) < vorherZweiter2,
    'Radius 48: der Nachbar 30 px daneben muss anteilig Schaden nehmen');
});

// --------------------------------------------------------- Waffenversion

test('W18 Waffenversion: Standard ist die aktuelle Fassung, Altfassungen sehen spätere Schichten nicht', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_FEUERWESEN + 1,
    'WAFFEN_STANDARD muss die jüngste Fassung sein (21, Entscheidungen 2026-11-11) — sonst zeigt das Spiel alte Werte');
  assert.equal(WAFFEN_FEUERWESEN, WAFFEN_STREU + 1,
    'die neue Fassung ist genau eine Stufe nach der Streuung (20 nach 19, Feuerwesen)');
  assert.equal(WAFFEN_STREU, WAFFEN_NACHSCHUB + 1,
    'Fassung 19 folgt auf den Nachschub (19 nach 18, BAL-16 Streuung)');
  assert.equal(WAFFEN_NACHSCHUB, WAFFEN_KLASSE + 1,
    'Fassung 18 folgt auf den Klassenfaktor (18 nach 17, BAL-05)');
  assert.equal(WAFFEN_KLASSE, WAFFEN_TREFFER + 1,
    'Fassung 17 folgt auf das Trefferfenster (17 nach 16)');

  const waffe = WEAPONS[0];
  assert.equal(getWaffe(waffe.id), getWaffe(waffe.id, WAFFEN_STANDARD),
    'ohne Fassungsangabe muss derselbe (zwischengespeicherte) Stand kommen');

  // Wind (AERO) ist eine Fassungsschicht: davor gibt es das Feld nicht.
  assert.equal(getWaffe(waffe.id, WAFFEN_WIND - 1).windFactor, undefined,
    `Fassung ${WAFFEN_WIND - 1} darf das Windfeld noch nicht sehen`);
  assert.equal(typeof getWaffe(waffe.id, WAFFEN_WIND).windFactor, 'number',
    `ab Fassung ${WAFFEN_WIND} muss der Windfaktor am Objekt stehen`);

  // Die Altfassung ist nicht bloß „anders", sondern die ältere Zahl.
  assert.ok(getWaffe(waffe.id, WAFFEN_ALT).damage < getWaffe(waffe.id, WAFFEN_STANDARD).damage,
    `${waffe.displayName}: die Altfassung muss den niedrigeren Schaden tragen`);
});

test('W18 Waffenversion: eine Fassung ändert nur ihre eigenen Felder', () => {
  /*
   * Die Fassungsschichten sind Aufschläge auf den Katalog, keine Neudefinition.
   * Ändert eine Fassung ein Feld, das sie nicht führt, ist das ein
   * stiller Balance-Eingriff an allen Waffen dieser Stufe.
   */
  const geaendert = WEAPONS.filter(w => (
    getWaffe(w.id, WAFFEN_TEMPO).damage !== getWaffe(w.id, WAFFEN_TEMPO - 1).damage
  ));
  assert.ok(geaendert.length > 0, 'Fassung 15 muss Waffenwerte anheben — sonst prüft der Fall nichts');

  for (const w of geaendert) {
    const alt = getWaffe(w.id, WAFFEN_TEMPO - 1);
    const neu = getWaffe(w.id, WAFFEN_TEMPO);
    const felder = Object.keys(neu).filter(f => JSON.stringify(neu[f]) !== JSON.stringify(alt[f]));
    assert.deepEqual(felder, ['damage'],
      `${w.displayName}: Fassung ${WAFFEN_TEMPO} ändert ${felder.join(', ')} statt nur den Schaden`);
  }
});

// ---------------------------------------------------------------- Anker

test('W18 Anker: Figuren stehen auf der Bodenlinie, im Bild', () => {
  const figuren = Object.entries(SEITEN_MANIFEST.figures).filter(([, e]) => e.hasSide);
  assert.ok(figuren.length > 0, 'das Seitenmanifest nennt keine Figur mit Seite');

  for (const [name, eintrag] of figuren) {
    assert.ok(eintrag.anchor, `${name}: Anker fehlt`);
    assert.equal(eintrag.anchor.y, SEITEN_MANIFEST.groundY,
      `${name}: Anker y=${eintrag.anchor.y} statt Bodenlinie ${SEITEN_MANIFEST.groundY} — `
      + 'die Figur schwebt oder steckt im Boden');
    assert.ok(eintrag.anchor.x >= 0 && eintrag.anchor.x <= 255,
      `${name}: Anker x=${eintrag.anchor.x} liegt außerhalb des Bildes`);
  }
});

test('W18 Anker: Waffengriffe sitzen am gesetzten Heft, Mündungen zeigen nach vorn', () => {
  /*
   * Die Figuren blicken nach rechts. Der Griff muss am Heft der Waffe liegen (bei Waffen
   * ohne geführtes Heft am Schwerpunkt), die Mündung am tatsächlichen Ende davor. Beide
   * Punkte müssen im Bildinhalt der Zelle liegen — ein Anker außerhalb wäre der
   * „numerisch gültige, semantisch falsche" Fall aus dem Audit.
   *
   * Die frühere Hälftenregel („bei `form: objekt` liegt der Griff in der hinteren
   * Bildhälfte", mit vier Ausnahmen) ist ersetzt: sie war eine Randheuristik und lag bei
   * Waffen, die am Kopf gehalten werden (Eispickel, Tonfa), falsch. Maßgeblich ist die
   * belegte Heftspanne aus `scripts/waffen-anker-tabelle.json`.
   */
  const waffen = Object.entries(WAFFEN_MANIFEST.waffen);
  assert.ok(waffen.length > 0, 'das Waffenmanifest ist leer');

  for (const [id, eintrag] of waffen) {
    const { content, anchor } = eintrag;
    assert.ok(content && anchor?.grip && anchor?.muzzle, `${id}: Inhalt oder Anker fehlt`);
    const imInhalt = p => p.x >= content.x && p.x <= content.x + content.w
      && p.y >= content.y && p.y <= content.y + content.h;
    assert.ok(imInhalt(anchor.grip), `${id}: Griff liegt außerhalb des Bildinhalts`);
    assert.ok(imInhalt(anchor.muzzle), `${id}: Mündung liegt außerhalb des Bildinhalts`);
    assert.ok(anchor.muzzle.x > anchor.grip.x,
      `${id} (${eintrag.name}): Mündung x=${anchor.muzzle.x} liegt hinter dem Griff x=${anchor.grip.x} — `
      + 'Griff und Mündung sind vertauscht');
    assert.equal(anchor.source, 'semantik', `${id}: Ankerquelle ${anchor.source}`);
    if (anchor.halt === 'heft') {
      assert.ok(anchor.grip.x >= anchor.heft[0] && anchor.grip.x <= anchor.heft[1],
        `${id} (${eintrag.name}): Griff x=${anchor.grip.x} liegt nicht im Heft ${anchor.heft.join('..')}`);
      assert.ok(anchor.heft[0] > content.x - 1 && anchor.heft[1] < content.x + content.w,
        `${id} (${eintrag.name}): Heftspanne liegt außerhalb der Waffe`);
    }
  }
});

// ----------------------------------------------------------- Morphologie

test('W18 Morphologie: der Prompt nennt die Anatomie des Typs, nicht eine fremde', () => {
  const charaktere = Object.values(DESIGN_CHARAKTERE);
  assert.ok(charaktere.length > 0, 'keine Design-Charaktere vorhanden');

  for (const c of charaktere) {
    assert.ok(TYPES.includes(c.morphology),
      `${c.id}: Morphologie „${c.morphology}" ist keiner der ${TYPES.length} Typen`);
  }

  // Jeder Typ hat seine eigene, unverwechselbare Zusage.
  const anatomie = {
    biped: /exactly two arms, two legs and one head/,
    quadruped: /exactly four legs, one head and one tail/,
    serpentine: /zero legs and zero arms/,
    tracked: /No legs, feet or humanoid torso/,
    hover: /No walking legs/,
    avian: /Exactly two wings and two taloned legs/,
    arachnid: /Exactly eight legs/,
    swarm: /Never merge them into one giant insect/,
  };
  for (const [typ, muster] of Object.entries(anatomie)) {
    const text = frameDescription(typ, 'reference', 0);
    assert.match(text, muster, `${typ}: der Referenz-Prompt nennt die Anatomie nicht`);
    for (const [anderer, anderesMuster] of Object.entries(anatomie)) {
      if (anderer !== typ) assert.doesNotMatch(text, anderesMuster,
        `${typ}: der Prompt trägt die Anatomie von ${anderer}`);
    }
  }

  // „low stance" ist für ein Kettenfahrzeug kein Knien — und für einen Läufer schon gar nicht.
  assert.match(frameDescription('tracked', 'action', 3), /never kneeling/);
  assert.doesNotMatch(frameDescription('quadruped', 'action', 3), /never kneeling/);

  // Unbekannter Typ wird abgelehnt, nicht stillschweigend als Mensch gezeichnet.
  assert.throws(() => frameDescription('drache', 'reference', 0), /Unbekannter Bewegungstyp/);

  // Der Prompt trägt die freigegebenen Zahlen der Figur wörtlich.
  const mitZahlen = charaktere.find(c => Object.keys(c.approvedCounts ?? {}).length > 0);
  const prompt = buildPrompt(mitZahlen, { style: 'Test', colorDescription: 'Test', palette: ['#000'] },
    'reference', 0, ['Referenz']);
  assert.ok(prompt.includes(JSON.stringify(mitZahlen.approvedCounts)),
    `${mitZahlen.id}: die freigegebenen Zahlen stehen nicht im Prompt`);
});

test('W18 Morphologie: eine Posenvorlage ersetzt die Posenbeschreibung, nicht die Anatomie', () => {
  const charakter = Object.values(DESIGN_CHARAKTERE)[0];
  const fraktion = { style: 'Test', colorDescription: 'Test', palette: ['#000'] };
  const mitVorlage = buildPrompt(charakter, fraktion, 'walk', 2, ['Referenz'], '', true);
  const ohneVorlage = buildPrompt(charakter, fraktion, 'walk', 2, ['Referenz'], '', false);

  assert.match(mitVorlage, /Match the pose and articulation of the pose guide exactly/);
  assert.doesNotMatch(ohneVorlage, /pose guide exactly/);
  for (const prompt of [mitVorlage, ohneVorlage]) {
    assert.ok(prompt.includes(JSON.stringify(charakter.approvedCounts)),
      'die Anatomie-Zahlen müssen in beiden Wegen stehen');
    assert.match(prompt, /Strict right-facing orthographic side view/);
  }
});

// --------------------------------------------------------- Hockfallback

test('W18 Hockfallback: ohne Hockblatt fällt die Rolle auf Gehen zurück, nicht auf Stillstand', () => {
  const ohneHocke = { walk: [1, 2], idle: [3], luft: null, hocke: null, treffer: null, tod: null };
  assert.equal(waehleRolle(ohneHocke, MODUS.HOCKE | MODUS.GEHEN), 'walk',
    'in der Hocke ohne eigenes Blatt muss die Gehrolle weiterlaufen');
  /*
   * Nur Hocke (ohne Bewegung) ist kein Stand: `waehleRolle` liefert null, der
   * Renderer nimmt dann Seitenbild + Prozedur. Ein `idle` wäre hier falsch —
   * die Figur stünde aufrecht in der Hocke.
   */
  assert.equal(waehleRolle(ohneHocke, MODUS.HOCKE), null,
    'ohne Hockblatt fällt die Hocke auf Seitenbild und Prozedur zurück, nicht auf das Stehbild');

  const mitHocke = { ...ohneHocke, hocke: [4] };
  assert.equal(waehleRolle(mitHocke, MODUS.HOCKE | MODUS.GEHEN), 'hocke',
    'mit Hockblatt hat die Hocke Vorrang vor dem Gehen');
});

test('W18 Hockfallback: mit Hockblatt dämpft die Prozedur das Landestauch auf ein Drittel', () => {
  /*
   * Das Hockblatt trägt die Beinarbeit selbst; die Prozedur darf nur noch ein
   * Rest sein (`× 0,3` in `figurAnimation.js`). Ohne Blatt federt die Figur
   * voll — sonst sähe eine Landung mit Hockframe doppelt gestaucht aus.
   */
  const landung = blatt => {
    const posen = new FigurPosen();
    let t = 0;
    for (const y of [0, 20, 60, 120, 180, 240, 300, 300, 300]) {
      t += 0.05;
      posen.pose({ entityId: 1, x: 0, y }, t, { blatt });
    }
    return posen.pose({ entityId: 1, x: 0, y: 300 }, t + 0.0006, { blatt });
  };

  const blatt = { walk: [1], idle: [1], luft: null, hocke: [1], treffer: null, tod: null };
  const ohne = landung(null);
  const mit = landung(blatt);

  assert.ok(ohne.sy < 0.9, `ohne Blatt muss die Landung sichtbar stauchen (sy=${ohne.sy.toFixed(3)})`);
  assert.ok(mit.sy > 0.9, `mit Hockblatt darf die Prozedur nur leicht stauchen (sy=${mit.sy.toFixed(3)})`);
  assert.ok(ohne.sy < mit.sy, 'die Dämpfung muss die Stauchung verringern, nicht verstärken');
});
