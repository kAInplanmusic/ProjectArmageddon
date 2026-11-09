import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHARACTERS,
  MORPHOLOGIEN,
  GESICHTER,
  KOLLISIONSANKER,
  identitaetsRegeln,
  getCharacter,
  validateFactionData,
} from '../src/shared/config/factions.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../src/shared/config/player.js';
import {
  FREIGABE_STUFEN,
  blattBauen,
  emotionFreigabe,
  frameFuer,
  freigabeFuer,
  waehleRolle,
  MODUS,
} from '../src/client/figurSheets.js';
import { FUSS_ABSTAND } from '../src/client/figuren.js';
import { PARAMETER } from '../src/client/figurTypen.js';

/**
 * Identität, Morphologie und Kollisionsanker der 81 Figuren (Audit A01, A02,
 * A03, A10).
 *
 * Der Leitgedanke: Der Körperbau einer Figur ist eine REGEL, keine Anmutung.
 * Er entscheidet, welche Bewegung und welche Manifestrolle überhaupt zulässig
 * ist, und er darf den Fußpunkt der Kollision nicht verschieben. Farbähnlichkeit
 * ist kein Identitätsnachweis — deshalb prüfen die Tests auch, dass eine
 * Freigabe ohne Sichtprüfung nichts freigibt.
 */

const ROOT = path.join(import.meta.dirname, '..');
const SEITEN = path.join(ROOT, 'src', 'client', 'assets', 'characters-side');
const BLATT_MANIFEST = path.join(ROOT, 'src', 'client', 'assets', 'sprite-sheets', 'manifest.json');
const VORSCHLAG = path.join(ROOT, 'docs', 'DesignRest', 'manifest-figur-ident.json');

const manifest = JSON.parse(fs.readFileSync(BLATT_MANIFEST, 'utf8'));
const vorschlag = JSON.parse(fs.readFileSync(VORSCHLAG, 'utf8'));
const jeId = new Map(CHARACTERS.map(c => [c.id, c]));

// ------------------------------------------------------------------ A02 Morphologie

test('Jede der 81 Figuren hat genau eine der acht Morphologien', () => {
  assert.deepEqual(validateFactionData(), []);
  const arten = Object.keys(MORPHOLOGIEN);
  assert.deepEqual(arten.sort(), ['arachnid', 'avian', 'biped', 'hover', 'quadruped', 'serpentine', 'swarm', 'tracked']);
  for (const c of CHARACTERS) {
    assert.ok(arten.includes(c.morphologie), `${c.id}: ${c.morphologie}`);
    const r = identitaetsRegeln(c);
    assert.equal(r.morphologie.id, c.morphologie, c.id);
    assert.ok(r.bewegung.length > 0, `${c.id}: ohne Bewegungstyp`);
    assert.ok(Number.isInteger(r.beine) && r.beine >= 0, c.id);
  }
  // Alle acht Baupläne kommen im Katalog vor — kein toter Zweig.
  for (const art of arten) {
    assert.ok(CHARACTERS.some(c => c.morphologie === art), `Morphologie ${art} ohne Figur`);
  }
});

test('Die im Audit belegten Baupläne sind richtig zugeordnet', () => {
  const erwartet = {
    // A01: niemals Zweibeiner statt Vierbeiner
    'recon-luchs-01': 'quadruped', pikamon: 'quadruped', 'shrew-quakes': 'quadruped',
    'ember-tails': 'quadruped', 'magma-plate': 'quadruped', 'nullpointer-exception': 'quadruped',
    'pyrofox-a': 'quadruped', 'pyrofox-b': 'quadruped', 'pyrowand-a': 'quadruped',
    shieldmon: 'quadruped', 'hyper-link-hound': 'quadruped',
    // A01: niemals Beine an Kettenfahrzeugen
    'heavy-battery-moerser-bot': 'tracked', 'rauch-meister-genzi': 'tracked',
    // Schlangen laufen nicht
    'ordnance-rail-viper': 'serpentine', 'blowpipe-koga': 'serpentine', 'chrome-code-shifter': 'serpentine',
    // Schweber haben keinen Bodenkontakt
    'drone-theta': 'hover', 'harbinger-zeta': 'hover', 'dark-matter-witch': 'hover',
    'grid-drifter-datastream': 'hover', 'overlord-kernel-panic': 'hover',
    'vessel-plague-skull': 'hover', 'banshee-beatrice': 'hover', 'cosmic-meditate': 'hover',
    'sonic-blossom': 'hover', 'phantom-mal-a': 'hover',
    // Vielbein und Schwarm
    'synapse-streamer': 'arachnid', 'buffer-flow-swarm': 'swarm',
    // Flügel statt Gang
    'storm-talon': 'avian',
    // Breite Mechs sind Zweibeiner, keine Kettenfahrzeuge
    'hydra-titan-mech': 'biped', 'chassis-endo-t8': 'biped',
    // Theropode Zweibeinigkeit bleibt tierisch, kein Menschenkörper
    'flame-jaws': 'biped', 'arcershorn-a': 'biped',
  };
  for (const [id, art] of Object.entries(erwartet)) {
    assert.equal(getCharacter(id)?.morphologie, art, `${id}: ${getCharacter(id)?.morphologie} statt ${art}`);
  }
});

test('Bewegungstyp und Beingliederung widersprechen sich nirgends', () => {
  const soll = {
    biped: [2, 'gehen', true], quadruped: [4, 'laufen', false], tracked: [0, 'ketten', false],
    serpentine: [0, 'schlingen', false], hover: [0, 'schweben', false], avian: [2, 'fliegen', false],
    arachnid: [8, 'krabbeln', false], swarm: [0, 'wuseln', false],
  };
  for (const [art, [beine, bewegung, gehzyklus]] of Object.entries(soll)) {
    const m = MORPHOLOGIEN[art];
    assert.equal(m.beine, beine, art);
    assert.equal(m.bewegung, bewegung, art);
    assert.equal(m.gehzyklus, gehzyklus, art);
    // Nur der Zweibeiner trägt den Beinenzyklus der Sheets; alles andere
    // fällt bis zur Sichtprüfung auf die Prozedur zurück.
    assert.equal(m.gehzyklus, art === 'biped', `${art}: Gehzyklus-Freigabe`);
  }
  for (const c of CHARACTERS) {
    const r = identitaetsRegeln(c);
    if (r.beine === 0) assert.ok(!r.gehzyklus, `${c.id}: Beinenzyklus ohne Beine`);
  }
});

// ------------------------------------------------------------------ A01 Identität

test('Kein Menschengesicht und kein menschlicher Leichnam bei Nicht-Menschen', () => {
  for (const c of CHARACTERS) {
    const r = identitaetsRegeln(c);
    assert.ok(GESICHTER[c.identitaet.gesicht], `${c.id}: ${c.identitaet.gesicht}`);
    if (r.gesicht.menschlich) {
      assert.equal(c.identitaet.gesicht, 'menschlich', c.id);
      assert.ok(!r.verboten.includes('menschliches Gesicht'), `${c.id}: Mensch verbietet Menschengesicht`);
    } else {
      assert.ok(r.verboten.includes('menschliches Gesicht'), `${c.id}: Menschengesicht nicht verboten`);
      assert.ok(r.verboten.includes('menschlicher Leichnam'), `${c.id}: Menschenleichnam nicht verboten`);
    }
  }
  // Stichproben aus dem Audit: Alien, Roboter, Tier und Maske sind keine Menschen.
  for (const [id, gesicht] of [['sgt-acid-xeno', 'alien'], ['chassis-endo-t8', 'roboter'],
    ['pikamon', 'tier'], ['vixen-kitsune', 'maske'], ['buffer-flow-swarm', 'schwarm']]) {
    assert.equal(getCharacter(id).identitaet.gesicht, gesicht, id);
    assert.ok(identitaetsRegeln(getCharacter(id)).verboten.includes('menschliches Gesicht'), id);
  }
});

test('Jede Figur trägt mindestens zwei Identitätsmerkmale, Namen und Dateinamen bleiben unverändert', () => {
  const namen = new Set();
  for (const c of CHARACTERS) {
    assert.ok(Array.isArray(c.identitaet.merkmale) && c.identitaet.merkmale.length >= 2, `${c.id}: Merkmale`);
    for (const m of c.identitaet.merkmale) assert.ok(typeof m === 'string' && m.trim().length > 2, `${c.id}: ${m}`);
    // Dateiname = Bogennummer + Kennung; die Umbenennung von Figuren ist A07, nicht hier.
    assert.match(c.sprite, /^\d{2}_[a-z0-9-]+\.png$/, c.id);
    assert.ok(fs.existsSync(path.join(SEITEN, c.faction, c.sprite)), `${c.id}: ${c.sprite} fehlt`);
    namen.add(`${c.faction}/${c.name}`);
  }
  assert.equal(namen.size, 81, 'Anzeigenamen innerhalb der Fraktion eindeutig');
});

// ------------------------------------------------------------------ A03 Freigabe

/** Manifesteintrag einer Figur, wie ihn der Vorschlag in das echte Manifest schreiben würde. */
function eintragFuer(id) {
  const c = jeId.get(id);
  const key = `${c.faction}/${c.sprite.replace(/\.png$/, '')}`;
  const e = vorschlag.figuren[key];
  return { ...manifest.figuren[key], identitaet: { ...e.identitaet } };
}

test('Ohne Sichtprüfung bleibt der Beinenzyklus bei Nicht-Zweibeinern gesperrt', () => {
  for (const id of ['heavy-battery-moerser-bot', 'pikamon', 'blowpipe-koga', 'drone-theta', 'storm-talon']) {
    const f = freigabeFuer(jeId.get(id), eintragFuer(id));
    assert.equal(f.gehen, null, `${id}: Gehzyklus trotz ${jeId.get(id).morphologie}`);
    assert.equal(f.freigabe, 'ungeprueft', id);
    // Fallback: keine Rolle → Seitenbild + Prozedur, kein Ersatzframe.
    const blatt = blattBauen({ gehen: undefined, rollen: f.rollen }, null, null);
    assert.equal(waehleRolle(blatt, MODUS.GEHEN), null, `${id}: Fallback fehlt`);
    assert.equal(frameFuer(blatt, 'walk', 0.5, 0), null, id);
  }
});

test('Der belegte Identitätsfehler greift sofort — auch ohne geändertes Manifest', () => {
  // Das echte Manifest ist unverändert (nur Heuristik). Die gesperrten Zellen
  // stehen deshalb in der Spielconfig und wirken ohne Manifeständerung.
  const c = jeId.get('sgt-acid-xeno');
  const roh = manifest.figuren['xeno/00_sgt-acid-xeno'];
  assert.equal(roh.identitaet, undefined, 'Manifest bleibt unverändert');
  const f = freigabeFuer(c, roh);
  assert.deepEqual(f.gesperrt, [6, 7]);
  assert.equal(f.gehen, null, 'Gehzyklus enthält die gesperrten Zellen');
  assert.equal(f.rollen.tod, undefined, 'Todesframe gesperrt');
  assert.ok(f.rollen.idle, 'Idle bleibt (Zellen 0/1)');
  assert.equal(identitaetsRegeln(c).gesperrteZellen.join(','), '6,7');
  // Der Vorschlag führt dieselben Zellen — eine Quelle, zwei Auslieferungen.
  assert.equal(vorschlag.figuren['xeno/00_sgt-acid-xeno'].identitaet.gesperrteZellen.join(','), '6,7');
});

test('Zweibeiner behalten den Gehzyklus, verlieren aber Treffer/Tod ohne Freigabe', () => {
  const c = jeId.get('vortex-grabber');
  const f = freigabeFuer(c, eintragFuer('vortex-grabber'));
  assert.deepEqual(f.gehen, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(f.rollen.idle, 'Idle bleibt nutzbar');
  assert.equal(f.rollen.treffer, undefined, 'Trefferframe ohne Sichtprüfung gesperrt');
  assert.equal(f.rollen.tod, undefined, 'Todesframe ohne Sichtprüfung gesperrt');
  // Menschliche Figuren dürfen den menschlichen Todeskörper zeigen.
  const sven = freigabeFuer(jeId.get('captain-sven'), eintragFuer('captain-sven'));
  assert.ok(sven.rollen.treffer !== undefined && sven.rollen.tod !== undefined, 'Mensch ohne Treffer/Tod');
});

test('Gesperrte Zellen entfernen die Rolle; ein Gehzyklus mit gesperrter Zelle entfällt ganz', () => {
  const c = jeId.get('sgt-acid-xeno');
  const e = eintragFuer('sgt-acid-xeno');
  assert.deepEqual(e.identitaet.gesperrteZellen, [6, 7]);
  const f = freigabeFuer(c, e);
  assert.equal(f.rollen.tod, undefined, 'Zelle 7 ist gesperrt');
  // Alle acht Gehzellen werden benutzt — eine gesperrte Zelle nimmt den ganzen Zyklus mit.
  assert.equal(f.gehen, null, 'Gehzyklus mit gesperrter Zelle');
  const ohneWalk = { ...e, gehen: [0, 1, 2, 3, 4, 5] };
  assert.equal(freigabeFuer(c, ohneWalk).gehen, null, 'kein 8-Frame-Zyklus ohne Zellen');
  // Gesperrte Einzelfiguren geben gar nichts frei.
  const gesperrtEintrag = { ...e, identitaet: { ...e.identitaet, freigabe: 'gesperrt' } };
  const gesperrt = freigabeFuer(c, gesperrtEintrag);
  assert.deepEqual(gesperrt.rollen, {});
  assert.equal(gesperrt.gehen, null);
  assert.equal(gesperrt.freigabe, 'gesperrt');
  assert.deepEqual(gesperrt.gesperrt, [6, 7]);
});

test('Nur eine Sichtprüfung gibt frei — Farbähnlichkeit, Alpha-Box und Dateiexistenz nicht', () => {
  const c = jeId.get('pikamon');
  const e = eintragFuer('pikamon');
  const farbe = { ...e, identitaet: { ...e.identitaet, grundlage: 'farbe', freigabe: 'geprueft', walk: { frei: true } } };
  assert.equal(freigabeFuer(c, farbe).gehen, null, 'Farbfreigabe darf nichts freigeben');
  const sicht = { ...e, identitaet: { ...e.identitaet, grundlage: 'sichtpruefung', freigabe: 'geprueft', walk: { frei: true } } };
  const f = freigabeFuer(c, sicht);
  assert.deepEqual(f.gehen, [0, 1, 2, 3, 4, 5, 6, 7], 'Sichtprüfung gibt den Vierbeinerzyklus frei');
  assert.equal(f.freigabe, 'geprueft');
});

test('Hocke nur bei Zweibeinern, Rollen ohne Frame fallen auf das Seitenbild zurück', () => {
  for (const id of ['pikamon', 'heavy-battery-moerser-bot', 'blowpipe-koga', 'overlord-kernel-panic']) {
    const f = freigabeFuer(jeId.get(id), eintragFuer(id));
    assert.equal(f.rollen.hocke, undefined, `${id}: Hocke ohne Zweibeiner`);
  }
  assert.ok(freigabeFuer(jeId.get('captain-sven'), eintragFuer('captain-sven')).rollen.hocke !== undefined);
  // Fehlt die Rolle im (gefilterten) Blatt, wählt der Renderer keine Ersatzpose.
  const blatt = blattBauen({ rollen: freigabeFuer(jeId.get('captain-sven'), eintragFuer('captain-sven')).rollen }, null, null);
  assert.equal(waehleRolle(blatt, MODUS.HOCKE), null, 'Hocke ohne Aktionsbild');
  assert.equal(waehleRolle(blatt, MODUS.GEHEN), null, 'Gehen ohne Gehblatt');
});

test('Emotionen brauchen eine Sichtprüfung; die Farbmaske allein genügt nicht', () => {
  const farbPruefung = { gueltig: [0, 1, 2, 3, 4, 5, 6, 7], identitaet: { grundlage: 'heuristik', freigabe: 'ungeprueft', zellen: [0, 1] } };
  assert.equal(emotionFreigabe(farbPruefung), null, 'Farbähnlichkeit darf keine Emotionen freigeben');
  assert.equal(emotionFreigabe({ gueltig: [0, 1, 2, 3, 4, 5, 6, 7] }), null, 'ohne Freigabefeld nichts');
  const sicht = { gueltig: [0, 1, 2, 3, 4, 5, 6, 7], identitaet: { grundlage: 'sichtpruefung', freigabe: 'geprueft', zellen: [1, 3, 9] } };
  assert.deepEqual(emotionFreigabe(sicht), [1, 3], 'nur geprüfte, gültige Zellen');
  const gesperrt = { ...sicht, identitaet: { ...sicht.identitaet, freigabe: 'gesperrt' } };
  assert.equal(emotionFreigabe(gesperrt), null);
});

// ------------------------------------------------------------------ A10 Kollisionsanker

test('Ein Kollisionsanker für alle 81 Figuren — unabhängig von der Morphologie', () => {
  assert.equal(KOLLISIONSANKER.halbBreite, PLAYER_HALF_WIDTH);
  assert.equal(KOLLISIONSANKER.halbHoehe, PLAYER_HALF_HEIGHT);
  assert.equal(KOLLISIONSANKER.fussAbstand, FUSS_ABSTAND, 'Fußpunkt der Darstellung weicht vom Körper ab');
  assert.equal(KOLLISIONSANKER.fussY, 0.96);
  // Der Anker ist eine Konstante, keine Figureneigenschaft: kein Charakter darf
  // eine eigene Kollisionsform oder einen eigenen Fußpunkt mitbringen.
  for (const c of CHARACTERS) {
    for (const feld of ['anker', 'fussY', 'kollision', 'halbBreite', 'halbHoehe', 'radius']) {
      assert.equal(c[feld], undefined, `${c.id}: eigener Kollisionswert ${feld}`);
    }
  }
  // Und die Morphologien überschreiben ihn nicht.
  for (const m of Object.values(MORPHOLOGIEN)) {
    for (const feld of ['fussY', 'halbBreite', 'halbHoehe', 'anker']) {
      assert.equal(m[feld], undefined, `${m.id}: eigener Kollisionswert ${feld}`);
    }
  }
  // Der sichtbare Fußring ist der Fußabdruck derselben Kollision: kein Typ darf
  // einen breiteren Ring zeichnen als der andere.
  for (const [typ, par] of Object.entries(PARAMETER)) {
    assert.equal(par.fussBreite, 1, `${typ}: Fußring weicht von der Kollisionsbreite ab`);
  }
});

test('Die Darstellung zieht den Fußpunkt aus dem Kollisionsanker, nicht aus dem Seitenmanifest', () => {
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'figurenBilder.js'), 'utf8');
  assert.match(quelle, /fussY: KOLLISIONSANKER\.fussY/, 'Fußpunkt nicht aus dem Anker');
  assert.ok(!/\.\.\.e\.anker/.test(quelle), 'Seitenmanifest überschreibt den Anker');
  // Die Seitenmanifest-Anker sind Pixelwerte aus der Freistellung und dürfen den
  // Fußpunkt nicht verschieben — sie tragen nur den Mündungspunkt.
  const seiten = JSON.parse(fs.readFileSync(path.join(SEITEN, 'manifest.json'), 'utf8'));
  for (const [key, e] of Object.entries(seiten.figures)) {
    assert.ok(Number.isInteger(e.anchor?.x) && Number.isInteger(e.anchor?.y), key);
  }
});

// ------------------------------------------------------------------ Manifestvorschlag

test('Der Vorschlag deckt alle 81 Figuren ab und passt zur Spielconfig', () => {
  const keys = Object.keys(vorschlag.figuren).sort();
  assert.deepEqual(keys, Object.keys(manifest.figuren).sort());
  assert.equal(keys.length, 81);
  for (const c of CHARACTERS) {
    const key = `${c.faction}/${c.sprite.replace(/\.png$/, '')}`;
    const e = vorschlag.figuren[key];
    assert.ok(e, key);
    assert.equal(e.morphologie, c.morphologie, `${key}: Morphologie`);
    assert.equal(e.gesicht, c.identitaet.gesicht, `${key}: Gesicht`);
    assert.deepEqual(e.merkmale, c.identitaet.merkmale, `${key}: Merkmale`);
    assert.ok(FREIGABE_STUFEN.includes(e.identitaet.freigabe), `${key}: ${e.identitaet.freigabe}`);
    assert.ok(['heuristik', 'sichtpruefung'].includes(e.identitaet.grundlage), key);
    assert.equal(e.identitaet.rueckfall, 'seitenbild+prozedur', key);
    assert.equal(typeof e.identitaet.befund, 'string', key);
    assert.ok(e.identitaet.befund.length > 10, key);
    // Ehrlichkeit: „geprueft" nur mit Sichtprüfung.
    if (e.identitaet.freigabe === 'geprueft') assert.equal(e.identitaet.grundlage, 'sichtpruefung', key);
  }
  assert.equal(vorschlag.figuren['xeno/00_sgt-acid-xeno'].identitaet.gesperrteZellen.join(','), '6,7');
});

test('Die Freigabe im Vorschlag stimmt mit dem Laufzeitfilter überein', () => {
  for (const c of CHARACTERS) {
    const key = `${c.faction}/${c.sprite.replace(/\.png$/, '')}`;
    const e = vorschlag.figuren[key];
    const f = freigabeFuer(c, e);
    assert.equal(Boolean(f.gehen), e.identitaet.walk.frei, `${key}: walk`);
    for (const rolle of ['idle', 'luft', 'hocke', 'treffer', 'tod']) {
      const soll = e.identitaet.rollen[rolle]?.frei === true;
      assert.equal(f.rollen[rolle] !== undefined, soll, `${key}: ${rolle}`);
    }
  }
});

test('Der Vorschlag ändert weder Pfade noch Zellenzahlen des Manifests', () => {
  assert.equal(vorschlag.version, 2);
  assert.match(vorschlag.bezug, /unverändert/);
  for (const [key, e] of Object.entries(vorschlag.figuren)) {
    const original = manifest.figuren[key];
    assert.equal(e.walk, original.walk, key);
    assert.equal(e.aktion, original.aktion, key);
    assert.equal(e.zustand, original.zustand, key);
    assert.deepEqual(e.gehen, original.gehen, key);
    for (const [rolle, wert] of Object.entries(original.rollen)) {
      assert.deepEqual(e.identitaet.rollen[rolle].zellen, Array.isArray(wert) ? wert : [wert], `${key}/${rolle}`);
    }
    // Rollen außerhalb der vier Zustände bleiben unangetastet.
    assert.deepEqual(Object.keys(e.identitaet.rollen).sort(), Object.keys(original.rollen).sort(), key);
  }
});
