import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACTIONS,
  CHARACTERS,
  COMBAT_ROLES,
  SLOT_CLASSES,
  NAMING_CONFLICTS,
  getFaction,
  getCharacter,
  charactersOf,
  charactersByRole,
  charactersByFaction,
  classOf,
  roleOf,
  validateFactionData,
} from '../src/shared/config/factions.js';

/**
 * Fraktionen und die 81 Charaktere.
 *
 * Die Figuren wurden mit `scripts/extract_factions.py` aus neun Bögen geschnitten.
 * Geprüft wird dreierlei: der Katalog ist vollständig und widerspruchsfrei, die
 * Bilder liegen tatsächlich auf der Platte, und der Ladepfad im Client trifft sie
 * auch (dieselbe Falle wie bei den Waffen-Icons und den Kulissen: ein um eine
 * Ebene falscher Pfad liefert still eine leere Liste).
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const BILD_DIR = path.join(ROOT, 'src', 'client', 'assets', 'characters');

// ------------------------------------------------------------------ Vollständigkeit

test('Es sind neun Fraktionen zu je neun Charakteren', () => {
  assert.equal(FACTIONS.length, 9, 'Es müssen neun Fraktionen sein');
  assert.equal(CHARACTERS.length, 81, 'Es müssen 81 Charaktere sein');

  for (const fraktion of FACTIONS) {
    assert.equal(charactersOf(fraktion.id).length, 9,
      `${fraktion.id}: ${charactersOf(fraktion.id).length} Charaktere statt neun`);
  }
});

test('Jede Fraktion hat drei Zeilen zu je drei Charakteren', () => {
  // Die Zeile ist die Kampfweise. Fehlt eine, ist der Bogen unvollständig gelesen.
  for (const fraktion of FACTIONS) {
    for (const role of Object.keys(COMBAT_ROLES)) {
      const zeile = charactersByRole(fraktion.id, role);
      assert.equal(zeile.length, 3,
        `${fraktion.id}/${role}: ${zeile.length} statt drei Charaktere`);
      // Und die Plätze 0, 1, 2 müssen belegt sein.
      assert.deepEqual([...zeile].map(c => c.slot).sort(), [0, 1, 2],
        `${fraktion.id}/${role}: Plätze nicht vollständig`);
    }
  }
});

test('Der Katalog meldet keine Widersprüche', () => {
  assert.deepEqual(validateFactionData(), []);
});

test('Die Fraktionskennungen entsprechen den Bildordnern', () => {
  const ordner = fs.readdirSync(BILD_DIR).sort();
  assert.deepEqual(FACTIONS.map(f => f.id).sort(), ordner,
    'Die Fraktionskennungen und die Bildordner laufen auseinander');
});

// ------------------------------------------------------------------ Namen

test('Innerhalb einer Fraktion ist jeder Name einmalig', () => {
  for (const fraktion of FACTIONS) {
    const namen = charactersOf(fraktion.id).map(c => c.name);
    const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
    assert.deepEqual(doppelt, [], `${fraktion.id}: doppelte Namen ${doppelt.join(', ')}`);
  }
});

test('Die Namen entsprechen den Bilddateien', () => {
  // Der Kurzname steckt im Dateinamen (siehe scripts/namen.py). Wichen sie
  // voneinander ab, zeigte das Bild den falschen Charakter.
  for (const c of CHARACTERS) {
    const rumpf = c.sprite.replace(/^\d\d_/, '').replace(/\.png$/, '');
    const ausName = c.name
      .toLowerCase()
      .replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    // Beide Richtungen prüfen: Der Dateiname muss im Namen stecken oder umgekehrt
    // (Kurzformen wie „einheit-a" gegen „(einheit a)" sind zulässig).
    const passt = rumpf === ausName
      || ausName.startsWith(rumpf.split('-')[0])
      || rumpf.startsWith(ausName.split('-')[0]);
    assert.ok(passt, `${c.id}: Name „${c.name}" passt nicht zur Datei „${c.sprite}"`);
  }
});

test('Namenskonflikte zwischen Fraktionen sind erfasst', () => {
  // Zwei Bögen benennen je eine Figur „Nullpointer Exception". Das ist ein
  // Inhaltsproblem, kein Codefehler — es wird erfasst, nicht stillschweigend
  // hingenommen. Ein Umbenennen wäre ein Eingriff in den Inhalt.
  const namen = CHARACTERS.map(c => c.name);
  const doppelt = [...new Set(namen.filter((n, i) => namen.indexOf(n) !== i))];

  const erfasst = NAMING_CONFLICTS.flatMap(k => k.characters.map(kennung => {
    const [, id] = kennung.split('/');
    return getCharacter(id)?.name;
  }));

  for (const name of doppelt) {
    assert.ok(erfasst.includes(name),
      `Doppelter Name „${name}" ist nicht in NAMING_CONFLICTS erfasst`);
  }
  for (const name of erfasst) {
    assert.ok(doppelt.includes(name),
      `NAMING_CONFLICTS nennt „${name}", der Name ist aber eindeutig`);
  }
});

// ------------------------------------------------------------------ Inhalt

test('Jeder Charakter hat Superwaffe, Biografie und Profil', () => {
  for (const c of CHARACTERS) {
    assert.ok(c.superWeapon?.name?.length >= 3, `${c.id}: Superwaffe ohne Namen`);
    assert.ok(c.superWeapon?.description?.length >= 30,
      `${c.id}: Superwaffe ohne Erläuterung`);
    assert.ok(c.bio?.length >= 80, `${c.id}: Biografie zu knapp (${c.bio?.length} Zeichen)`);
    assert.ok(c.strengths.length >= 2, `${c.id}: weniger als zwei Stärken`);
    assert.ok(c.weaknesses.length >= 2, `${c.id}: weniger als zwei Schwächen`);

    for (const s of [...c.strengths, ...c.weaknesses]) {
      // Kurze, aber vollständige Einträge wie „Wenig Leben" sind zulässig; ein
      // einzelnes Wort wäre keiner.
      assert.ok(s.length >= 10, `${c.id}: Eintrag zu knapp: „${s}"`);
      assert.ok(s.trim().split(/\s+/).length >= 2, `${c.id}: nur ein Wort: „${s}"`);
    }
  }
});

test('Stärken und Schwächen überschneiden sich nicht', () => {
  // Ein Eintrag, der in beiden Listen steht, wäre ein Widerspruch.
  for (const c of CHARACTERS) {
    const gemeinsam = c.strengths.filter(s => c.weaknesses.includes(s));
    assert.deepEqual(gemeinsam, [], `${c.id}: identisch in Stärken und Schwächen`);
  }
});

test('Die Superwaffen sind innerhalb einer Fraktion unterscheidbar', () => {
  for (const fraktion of FACTIONS) {
    const waffen = charactersOf(fraktion.id).map(c => c.superWeapon.name);
    assert.equal(new Set(waffen).size, 9,
      `${fraktion.id}: ${new Set(waffen).size} verschiedene Superwaffen bei neun Charakteren`);
  }
});

test('Jede Fraktion hat Namen, Wahlspruch und Beschreibung', () => {
  for (const f of FACTIONS) {
    assert.ok(f.name?.length >= 4, `${f.id}: kein Name`);
    assert.ok(f.motto?.length >= 10, `${f.id}: kein Wahlspruch`);
    assert.ok(f.description?.length >= 100, `${f.id}: Beschreibung zu knapp`);
    assert.equal(f.palette.length, 3, `${f.id}: Farbpalette unvollständig`);
    for (const farbe of f.palette) {
      assert.match(farbe, /^#[0-9a-f]{6}$/i, `${f.id}: ungültige Farbe ${farbe}`);
    }
  }
});

// ------------------------------------------------------------------ Klassenzuordnung

test('Die Spielklasse folgt aus der Position', () => {
  assert.deepEqual([...SLOT_CLASSES], ['heavy', 'scout', 'artillery']);
  for (const c of CHARACTERS) {
    assert.equal(classOf(c), SLOT_CLASSES[c.slot]);
    assert.ok(['heavy', 'scout', 'artillery'].includes(classOf(c)));
  }
  // Und jede Fraktion deckt alle drei Klassen ab.
  for (const fraktion of FACTIONS) {
    const klassen = new Set(charactersOf(fraktion.id).map(classOf));
    assert.equal(klassen.size, 3, `${fraktion.id}: nur ${klassen.size} Klassen abgedeckt`);
  }
});

test('Die Kampfweise entspricht der Zeile auf dem Bogen', () => {
  assert.equal(COMBAT_ROLES.melee.row, 0);
  assert.equal(COMBAT_ROLES.ranged.row, 1);
  assert.equal(COMBAT_ROLES.magic.row, 2);
  for (const c of CHARACTERS) {
    assert.equal(roleOf(c).id, c.role);
    // Die Bilddatei beginnt mit der Zeile: 0x = Nahkampf, 1x = Fernkampf, 2x = Magie.
    assert.equal(Number(c.sprite[0]), COMBAT_ROLES[c.role].row,
      `${c.id}: Bildzeile und Kampfweise stimmen nicht überein`);
  }
});

test('Die Archetypen der Kampfweisen passen zu den Spielklassen', () => {
  // brawler/artillerist/occultist sind die Archetypen des Motors.
  assert.equal(COMBAT_ROLES.melee.archetype, 'brawler');
  assert.equal(COMBAT_ROLES.ranged.archetype, 'artillerist');
  assert.equal(COMBAT_ROLES.magic.archetype, 'occultist');
});

// ------------------------------------------------------------------ Bilder

test('Zu jedem Charakter liegt eine Bilddatei', () => {
  const fehlend = CHARACTERS
    .filter(c => !fs.existsSync(path.join(BILD_DIR, c.faction, c.sprite)))
    .map(c => `${c.faction}/${c.sprite}`);
  assert.deepEqual(fehlend, [], `Fehlende Bilder: ${fehlend.join(', ')}`);
});

test('Es liegt kein Bild ohne Katalogeintrag herum', () => {
  const imKatalog = new Set(CHARACTERS.map(c => `${c.faction}/${c.sprite}`));
  const verwaist = [];
  for (const ordner of fs.readdirSync(BILD_DIR)) {
    for (const datei of fs.readdirSync(path.join(BILD_DIR, ordner))) {
      if (!imKatalog.has(`${ordner}/${datei}`)) verwaist.push(`${ordner}/${datei}`);
    }
  }
  assert.deepEqual(verwaist, [], `Verwaiste Bilder: ${verwaist.join(', ')}`);
});

test('Alle Bilder sind freigestellte PNG in gleicher Größe', () => {
  const groessen = new Set();
  for (const c of CHARACTERS) {
    const datei = path.join(BILD_DIR, c.faction, c.sprite);
    const puffer = fs.readFileSync(datei);

    // PNG-Kennung
    assert.equal(puffer.toString('hex', 0, 8), '89504e470d0a1a0a',
      `${c.faction}/${c.sprite}: kein PNG`);

    // Größe aus dem IHDR-Block (Breite und Höhe ab Byte 16)
    const breite = puffer.readUInt32BE(16);
    const hoehe = puffer.readUInt32BE(20);
    groessen.add(`${breite}x${hoehe}`);

    // Farbtyp 6 = RGBA, also mit Transparenz
    const farbtyp = puffer[25];
    assert.equal(farbtyp, 6, `${c.faction}/${c.sprite}: kein RGBA-Bild`);

    assert.ok(fs.statSync(datei).size > 5_000,
      `${c.faction}/${c.sprite}: verdächtig klein`);
  }
  assert.equal(groessen.size, 1,
    `Die Bilder haben unterschiedliche Größen: ${[...groessen].join(', ')}`);
});

// ------------------------------------------------------------------ Ladepfad

test('Das Lade-Muster im Client trifft die Bilder wirklich', () => {
  // Dieselbe Prüfung wie bei den Kulissen: Ein um eine Ebene falscher Pfad im
  // `import.meta.glob` liefert still eine leere Liste.
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'roster.js'), 'utf8');
  const treffer = /import\.meta\.glob\(\s*'([^']+)'/.exec(quelle);
  assert.ok(treffer, 'Kein Glob-Muster im Roster-Modul gefunden');
  const muster = treffer[1];

  const clientDir = path.join(ROOT, 'src', 'client');
  // Alles vor dem ersten Platzhalter ist der feste Ordner. NICHT bis zum letzten
  // Schrägstrich abschneiden — dann bliebe das „*" im Pfad stehen.
  const fest = muster.slice(0, muster.indexOf('*')).replace(/^(\.\/)+/, '').replace(/\/$/, '');
  const gesucht = path.join(clientDir, fest);
  assert.equal(path.resolve(gesucht), path.resolve(BILD_DIR),
    `Das Muster „${muster}" zeigt auf ${path.resolve(gesucht)} statt auf ${BILD_DIR}`);

  const gefunden = fs.readdirSync(gesucht).reduce((summe, ordner) => {
    const p = path.join(gesucht, ordner);
    return summe + (fs.statSync(p).isDirectory()
      ? fs.readdirSync(p).filter(f => f.endsWith('.png')).length
      : 0);
  }, 0);
  assert.equal(gefunden, CHARACTERS.length,
    `Das Muster findet ${gefunden} Bilder, der Katalog kennt ${CHARACTERS.length}`);
});

test('Der Nachschlage-Schlüssel entspricht dem, den Vite vergibt', () => {
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'roster.js'), 'utf8');
  const globMuster = /import\.meta\.glob\(\s*'([^']+)'/.exec(quelle)[1];
  // Fester Ordneranteil des Musters, ohne Sternchen.
  const fest = globMuster.slice(0, globMuster.indexOf('*'));

  const treffer = /BILDER\[`([^`]+)`\]/.exec(quelle);
  assert.ok(treffer, 'Kein Nachschlagen der Bild-URL gefunden');
  const vorlage = treffer[1];

  // Die Vorlage muss mit demselben festen Anteil beginnen, den Vite vergibt.
  assert.ok(vorlage.startsWith(fest),
    `Nachgeschlagen wird „${vorlage}", Vite vergibt Schlüssel beginnend mit „${fest}"`);

  // Und sie muss beide Bestandteile enthalten, die ein Charakter mitbringt.
  assert.ok(/\$\{[^}]*faction[^}]*\}/.test(vorlage),
    `Die Vorlage „${vorlage}" setzt die Fraktion nicht ein`);
  assert.ok(/\$\{[^}]*sprite[^}]*\}/.test(vorlage),
    `Die Vorlage „${vorlage}" setzt den Dateinamen nicht ein`);

  // Gegenprobe: Für jeden Charakter ergibt die Vorlage den Schlüssel, den das
  // Glob-Muster erzeugt.
  for (const c of CHARACTERS) {
    const schluessel = vorlage
      .replace(/\$\{[^}]*faction[^}]*\}/, c.faction)
      .replace(/\$\{[^}]*sprite[^}]*\}/, c.sprite);
    assert.equal(schluessel, `${fest}${c.faction}/${c.sprite}`,
      `${c.id}: Schlüssel stimmt nicht`);
  }
});

// ------------------------------------------------------------------ Zugriff

test('Die Zugriffsfunktionen finden, was sie finden sollen', () => {
  for (const f of FACTIONS) {
    assert.equal(getFaction(f.id), f);
    assert.equal(charactersOf(f.id).length, 9);
  }
  assert.equal(getFaction('gibtsnicht'), null);

  for (const c of CHARACTERS) {
    assert.equal(getCharacter(c.id), c);
  }
  assert.equal(getCharacter('gibtsnicht'), null);

  const karte = charactersByFaction();
  assert.equal(Object.keys(karte).length, 9);
  const gesamt = Object.values(karte).reduce((s, liste) => s + liste.length, 0);
  assert.equal(gesamt, 81);
});

test('Der Katalog ist serialisierbar', () => {
  // Er geht über den Netcode und in Replays.
  const zurueck = JSON.parse(JSON.stringify({ FACTIONS, CHARACTERS }));
  assert.equal(zurueck.CHARACTERS.length, 81);
  assert.deepEqual(zurueck.FACTIONS.map(f => f.id), FACTIONS.map(f => f.id));
});
