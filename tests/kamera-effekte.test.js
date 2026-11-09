/**
 * Tests: Kameraeffekte (KAMERA C1, C2, C4, C5, C6) — ohne Browser.
 *
 * Geprüft wird die Rechnung, nicht das Bild: Einstellungen samt Speicherform,
 * Bebenstärke, Knapp-vorbei-Erkennung und -Phase, Wasser-Sturz-Auftrag,
 * Kettenzähler. Die Optik selbst bleibt Sichtprüfung (docs/auftraege/kamera.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BEBEN_STUFEN, BEBEN_FAKTOR, KAMERA_EFFEKTE_SCHLUESSEL, KAMERA_EFFEKTE_STANDARD,
  normalisiereKameraEffekte, naechsteBebenStufe, bebenText, Kettenzaehler,
  KameraAuftraege, Wasserwaechter, kameraEffekte,
} from '../src/client/kameraEffekte.js';
import {
  stossFuer, naechsterVorbeiflug, KNAPP_RADIUS, KNAPP_TREFFER,
} from '../src/client/kameraZiel.js';
import { KameraRegie, STURZ } from '../src/client/kameraRegie.js';
import { ruckFuer, ruckVersatz } from '../src/client/gefuehl.js';
import { KameraeffekteBedienung } from '../src/client/kameraEffekteBedienung.js';

const karte = { b: 2560, h: 1440 };
const schirm = { b: 2560, h: 1440 };
const rand = { oben: 144, unten: 220, links: 470, rechts: 0 };
const pad = { halb: 60, oben: 120, unten: 30 };

function eingabe(extra = {}) {
  return {
    karte, schirm, rand, pad, zoomMax: 4, aktivId: 1,
    aktiv: { x: 800, y: 700, winkel: 0.5 },
    gegner: [], geschosse: [], wiederholung: null, krater: null, waffe: null,
    ansicht: { x: 1280, y: 720, zoom: 1 }, ...extra,
  };
}

/** Setzt den gemeinsamen Stand zurück — jeder Test beginnt bei den Vorgaben. */
function frisch() {
  kameraEffekte.zuruecksetzen();
}

test('Einstellungen: Vorgaben, Normalisierung und kaputte Werte', () => {
  assert.deepEqual(normalisiereKameraEffekte(null), { ...KAMERA_EFFEKTE_STANDARD });
  assert.deepEqual(normalisiereKameraEffekte('quatsch'), { ...KAMERA_EFFEKTE_STANDARD });
  // Ein falscher Typ darf nicht als „an" durchgehen (`Boolean('false')` wäre true).
  const roh = { beben: 'grell', knapp: 'false', wasser: 0, ketten: true };
  assert.deepEqual(normalisiereKameraEffekte(roh), { beben: 'normal', knapp: true, wasser: true, ketten: true });
  assert.deepEqual(normalisiereKameraEffekte({ beben: 'stark', knapp: false, wasser: false, ketten: false }),
    { beben: 'stark', knapp: false, wasser: false, ketten: false });
  // Unbekannte Felder werden nicht durchgereicht.
  assert.deepEqual(Object.keys(normalisiereKameraEffekte({ extra: 1 })), ['beben', 'knapp', 'wasser', 'ketten']);
  assert.equal(KAMERA_EFFEKTE_SCHLUESSEL, 'pa.kameraeffekte');
});

test('Bebenstufen: Reihenfolge, Umlauf, Faktoren und Texte', () => {
  assert.deepEqual([...BEBEN_STUFEN], ['aus', 'leicht', 'normal', 'stark']);
  assert.equal(naechsteBebenStufe('aus'), 'leicht');
  assert.equal(naechsteBebenStufe('leicht'), 'normal');
  assert.equal(naechsteBebenStufe('normal'), 'stark');
  assert.equal(naechsteBebenStufe('stark'), 'aus');
  assert.equal(naechsteBebenStufe('unbekannt'), 'stark', 'Unfug fällt auf „normal" zurück, dann weiter zu „stark"');
  for (const stufe of BEBEN_STUFEN) assert.ok(Number.isFinite(BEBEN_FAKTOR[stufe]));
  assert.equal(BEBEN_FAKTOR.aus, 0);
  assert.equal(bebenText('leicht'), 'Leicht');
});

test('Der gemeinsame Stand: setzen, ablehnen, melden, zurücksetzen', () => {
  frisch();
  assert.equal(kameraEffekte.beben, 'normal');
  assert.equal(kameraEffekte.bebenFaktor, 1);
  assert.equal(kameraEffekte.setze('beben', 'stark'), true);
  assert.equal(kameraEffekte.bebenFaktor, BEBEN_FAKTOR.stark);
  assert.equal(kameraEffekte.setze('beben', 'grell'), false, 'unbekannte Stufe wird abgelehnt');
  assert.equal(kameraEffekte.beben, 'stark', 'Ablehnung ändert nichts');
  assert.equal(kameraEffekte.setze('knapp', 'aus'), false, 'nur echte Schalter');
  assert.equal(kameraEffekte.setze('knapp', false), true);
  assert.equal(kameraEffekte.knapp, false);

  let meldungen = 0;
  const ab = kameraEffekte.abonniere(() => { meldungen += 1; });
  kameraEffekte.setze('ketten', false);
  assert.equal(meldungen, 1);
  kameraEffekte.setze('ketten', false);
  assert.equal(meldungen, 1, 'unveränderter Wert meldet nicht');
  ab();
  kameraEffekte.zuruecksetzen();
  assert.deepEqual(kameraEffekte.stand, { ...KAMERA_EFFEKTE_STANDARD });
});

test('Bebenstufe skaliert den Einschlagsschub, der Deckel bleibt', () => {
  const aus = stossFuer({ radius: 80, kategorie: 'heavy_ranged', beben: 0 });
  assert.equal(aus, null, 'aus = kein Schub');
  const leicht = stossFuer({ radius: 40, kategorie: 'heavy_ranged', beben: BEBEN_FAKTOR.leicht });
  const normal = stossFuer({ radius: 40, kategorie: 'heavy_ranged', beben: 1 });
  const stark = stossFuer({ radius: 40, kategorie: 'heavy_ranged', beben: BEBEN_FAKTOR.stark });
  assert.ok(leicht.amplitude < normal.amplitude);
  assert.ok(stark.amplitude > normal.amplitude);
  assert.ok(stark.amplitude <= 14.000001, 'Lesbarkeitsgrenze gilt in jeder Stufe');
  assert.ok(stark.dauer > normal.dauer, 'stärker wirkt auch länger');
  // Ein großer Einschlag bleibt auch in „stark" unter der Grenze.
  assert.ok(stossFuer({ radius: 200, kategorie: 'ultimate', beben: BEBEN_FAKTOR.stark }).amplitude <= 14.000001);
  // Ohne Angabe bleibt der bisherige Stand (Rückwärtsverträglichkeit).
  assert.deepEqual(stossFuer({ radius: 40, kategorie: 'heavy_ranged' }), normal);
});

test('Bebenstufe „aus" schaltet auch das Erdbeben-Zittern ab', () => {
  frisch();
  const ruck = ruckFuer(120);
  assert.ok(ruck);
  assert.ok(Math.hypot(...Object.values(ruckVersatz(ruck, { bild: 3 }))) > 0);
  kameraEffekte.setze('beben', 'aus');
  const aus = ruckVersatz(ruck, { bild: 3 });
  assert.ok(Math.abs(aus.x) < 1e-9 && Math.abs(aus.y) < 1e-9, 'aus = kein Zittern');
  kameraEffekte.setze('beben', 'normal');
  const normal = ruckVersatz(ruck, { bild: 3 });
  kameraEffekte.setze('beben', 'leicht');
  const leicht = ruckVersatz(ruck, { bild: 3 });
  assert.ok(Math.hypot(leicht.x, leicht.y) < Math.hypot(normal.x, normal.y));
  frisch();
});

test('Knapp-vorbei: Abstand zur Strecke, nicht zum Einzelpunkt', () => {
  const figur = { x: 1400, y: 700 };
  // Die Strecke läuft 20 px über der Figur vorbei: knapp.
  const knapp = naechsterVorbeiflug({ von: { x: 1300, y: 720 }, nach: { x: 1500, y: 720 }, figuren: [figur] });
  assert.ok(knapp);
  assert.ok(Math.abs(knapp.abstand - 20) < 1e-9);
  assert.ok(Math.abs(knapp.x - 1400) < 1e-9, 'nächster Punkt liegt senkrecht über der Figur');
  assert.equal(knapp.figur, figur);

  // Einzelpunkte lägen 120 px daneben; die Strecke nicht.
  assert.equal(naechsterVorbeiflug({ von: { x: 1290, y: 700 }, nach: { x: 1510, y: 700 }, figuren: [{ x: 1400, y: 720 }] }).abstand, 20);

  // Zu nah = Treffer, kein Vorbeiflug.
  assert.equal(naechsterVorbeiflug({ von: { x: 1300, y: 705 }, nach: { x: 1500, y: 705 }, figuren: [figur] }), null);
  assert.equal(KNAPP_TREFFER < KNAPP_RADIUS, true);
  // Zu weit weg.
  assert.equal(naechsterVorbeiflug({ von: { x: 1300, y: 800 }, nach: { x: 1500, y: 800 }, figuren: [figur] }), null);
  // Unbrauchbare Eingaben.
  assert.equal(naechsterVorbeiflug({ von: null, nach: { x: 1, y: 1 }, figuren: [figur] }), null);
  assert.equal(naechsterVorbeiflug({ von: { x: 1, y: 1 }, nach: { x: 1, y: 1 }, figuren: [figur] }), null);
  assert.equal(naechsterVorbeiflug({ von: { x: 0, y: 0 }, nach: { x: 10, y: 0 }, figuren: [{ x: NaN, y: 0 }] }), null);
});

/** Lässt die Kamera erst zur Ruhe kommen, dann ein Geschoss 20 px über einer Figur vorbeifliegen. */
function vorbeiflug({ reduziert = false } = {}) {
  const regie = new KameraRegie({ auftraege: new KameraAuftraege() });
  regie.setzeReduziert(reduziert);
  for (let i = 0; i < 40; i += 1) regie.schritt(1 / 60, eingabe({ gegner: [{ x: 1400, y: 700 }] }));
  const phasen = [];
  let a = null;
  for (let i = 0; i < 40; i += 1) {
    a = regie.schritt(1 / 60, eingabe({
      gegner: [{ x: 1400, y: 700 }],
      geschosse: [{ x: 1200 + i * 17, y: 715 }],
    }));
    phasen.push(regie.phase);
  }
  return { regie, phasen, letzte: a };
}

test('Regie: knapper Vorbeiflug zoomt kurz hinein und kehrt zurück', () => {
  frisch();
  const vorher = new KameraRegie({ auftraege: new KameraAuftraege() });
  let basis = null;
  for (let i = 0; i < 40; i += 1) basis = vorher.schritt(1 / 60, eingabe({ gegner: [{ x: 1400, y: 700 }] }));
  const { phasen, letzte } = vorbeiflug();
  assert.ok(phasen.includes('knapp'), `Phase knapp gesehen (${phasen.join(',')})`);
  assert.ok(letzte.zoom > basis.zoom, `enger als die Übersicht (${letzte.zoom} gegen ${basis.zoom})`);
  // Nach dem Flug ist der Vorbeiflug vorbei; die Kamera steht wieder in der Übersicht.
  const ende = vorbeiflug();
  const r = ende.regie;
  let a = null;
  for (let i = 0; i < 120; i += 1) a = r.schritt(1 / 60, eingabe({ gegner: [{ x: 1400, y: 700 }] }));
  assert.ok(['uebersicht', 'verfolgung', 'einschlag'].includes(r.phase), `kein Hängen in knapp (${r.phase})`);
  assert.ok(a);
  frisch();
});

test('Regie: Knapp-vorbei entfällt bei Bewegungsreduktion und ausgeschaltetem Effekt', () => {
  frisch();
  const reduziert = vorbeiflug({ reduziert: true });
  assert.ok(!reduziert.phasen.includes('knapp'));

  frisch();
  kameraEffekte.setze('knapp', false);
  const aus = vorbeiflug();
  assert.ok(!aus.phasen.includes('knapp'));
  frisch();
});

test('Regie: der Schuss am eigenen Abschussort ist kein Vorbeiflug', () => {
  frisch();
  const regie = new KameraRegie({ auftraege: new KameraAuftraege() });
  for (let i = 0; i < 20; i += 1) regie.schritt(1 / 60, eingabe());
  const phasen = [];
  for (let i = 0; i < 20; i += 1) {
    regie.schritt(1 / 60, eingabe({
      aktiv: { x: 800, y: 700, winkel: 0.5 },
      geschosse: [{ x: 800 + i * 18, y: 720 }],
    }));
    phasen.push(regie.phase);
  }
  assert.ok(!phasen.includes('knapp'), `kein Zoom am Schützen (${phasen.join(',')})`);
  frisch();
});

test('Regie: ein Geschosssprung über die halbe Karte ist kein Vorbeiflug', () => {
  frisch();
  const regie = new KameraRegie({ auftraege: new KameraAuftraege() });
  const gegner = [{ x: 1700, y: 700 }];
  for (let i = 0; i < 20; i += 1) regie.schritt(1 / 60, eingabe({ gegner }));
  regie.schritt(1 / 60, eingabe({ gegner, geschosse: [{ x: 1200, y: 715 }] }));
  const phasen = [];
  for (let i = 0; i < 5; i += 1) {
    regie.schritt(1 / 60, eingabe({ gegner, geschosse: [{ x: 2200 + i * 10, y: 715 }] }));
    phasen.push(regie.phase);
  }
  assert.ok(!phasen.includes('knapp'), `kein Zoom über einen Sprung (${phasen.join(',')})`);
  frisch();
});

test('Regie: Wasser-Sturz hält kurz auf der Stelle und endet', () => {
  frisch();
  const auftraege = new KameraAuftraege();
  const regie = new KameraRegie({ auftraege });
  let a = null;
  for (let i = 0; i < 40; i += 1) a = regie.schritt(1 / 60, eingabe());
  auftraege.merke({ art: 'sturz', x: 1200, y: 800 });
  a = regie.schritt(1 / 60, eingabe());
  assert.equal(regie.phase, 'sturz');
  assert.ok(a);
  const zielY = 800 + STURZ.unten;
  let minAbstand = Infinity;
  let maxZoom = 0;
  for (let i = 0; i < Math.ceil(STURZ.halten * 60) + 2; i += 1) {
    a = regie.schritt(1 / 60, eingabe());
    minAbstand = Math.min(minAbstand, Math.hypot(a.x - 1200, a.y - zielY));
    maxZoom = Math.max(maxZoom, a.zoom);
  }
  assert.ok(minAbstand < 40, `Kamera fährt zur Sturzstelle (Abstand ${minAbstand.toFixed(1)})`);
  assert.ok(maxZoom > 1.5, `sie zoomt hinein (${maxZoom.toFixed(2)})`);
  for (let i = 0; i < 60; i += 1) a = regie.schritt(1 / 60, eingabe());
  assert.equal(regie.phase, 'uebersicht');
  frisch();
});

test('Regie: Wasser-Sturz entfällt bei Bewegungsreduktion und ausgeschaltetem Effekt', () => {
  frisch();
  for (const variante of ['reduziert', 'aus']) {
    const auftraege = new KameraAuftraege();
    const regie = new KameraRegie({ auftraege });
    if (variante === 'reduziert') regie.setzeReduziert(true);
    else kameraEffekte.setze('wasser', false);
    for (let i = 0; i < 30; i += 1) regie.schritt(1 / 60, eingabe());
    auftraege.merke({ art: 'sturz', x: 1200, y: 800 });
    for (let i = 0; i < 60; i += 1) regie.schritt(1 / 60, eingabe());
    assert.notEqual(regie.phase, 'sturz', `kein Sturz (${variante})`);
    assert.equal(auftraege.anzahl, 0, 'der Auftrag wird verbraucht, nicht gestaut');
    frisch();
  }
});

test('Regie: bei Spielerführung werden Sturz-Aufträge verworfen, nicht gestaut', () => {
  frisch();
  const auftraege = new KameraAuftraege();
  const regie = new KameraRegie({ auftraege });
  for (let i = 0; i < 20; i += 1) regie.schritt(1 / 60, eingabe());
  regie.uebersteuere();
  auftraege.merke({ art: 'sturz', x: 1200, y: 800 });
  assert.equal(regie.schritt(1 / 60, eingabe()), null);
  assert.equal(auftraege.anzahl, 0);
  frisch();
});

test('Wasserwächter: nur der Übergang ins Untergetaucht-Sein zählt', () => {
  const w = new Wasserwaechter({ sperreMs: 0 });
  assert.equal(w.melde(1, 0.4, 0), false, 'nass ist kein Sturz');
  assert.equal(w.melde(1, 0.8, 100), true, 'nass → untergetaucht');
  assert.equal(w.melde(1, 0.9, 200), false, 'bleibt untergetaucht');
  assert.equal(w.melde(1, 0.5, 300), false, 'wieder nass: kein neuer Sturz');
  assert.equal(w.melde(1, 0.8, 400), true, 'nass → untergetaucht erneut');
  assert.equal(w.melde(1, 0.8, 410), false);
  // Nach einer Pause ohne Meldung gilt die Figur als trocken (Online drosselt).
  assert.equal(w.melde(1, 0.9, 5000), true);
  // Sperre verhindert Flackern direkt nacheinander.
  const s = new Wasserwaechter({ trockenMs: 0, sperreMs: 4000 });
  assert.equal(s.melde(2, 0.9, 0), true);
  assert.equal(s.melde(2, 0.3, 10), false);
  assert.equal(s.melde(2, 0.9, 20), false, 'innerhalb der Sperre');
  assert.equal(s.melde(2, 0.9, 4100), true);
});

test('Kettenzähler: zählt nur innerhalb eines Schusses, sichtbar ab zwei', () => {
  const z = new Kettenzaehler();
  assert.equal(z.glied('Figur'), null, 'ohne Schuss keine Kette');
  z.schuss();
  assert.equal(z.stand.sichtbar, false);
  z.glied('Fass');
  assert.equal(z.stand.anzahl, 1);
  assert.equal(z.stand.sichtbar, false, 'ein Glied ist kein Kettenmoment');
  const stand = z.glied('Mine');
  assert.equal(stand.anzahl, 2);
  assert.equal(stand.sichtbar, true);
  assert.deepEqual([...stand.glieder], ['Fass', 'Mine']);
  z.ende();
  assert.equal(z.glied('Figur'), null, 'nach dem Schuss wird nicht weitergezählt');
  assert.equal(z.stand.anzahl, 2, 'der letzte Stand bleibt lesbar');
  z.schuss();
  assert.equal(z.stand.anzahl, 0, 'ein neuer Schuss beginnt bei null');
});

test('Kettenzähler über den gemeinsamen Stand: Schuss, Glieder, Ende', () => {
  frisch();
  kameraEffekte.schuss();
  kameraEffekte.ketteGlied('Mine');
  const stand = kameraEffekte.ketteGlied('Figur');
  assert.equal(stand.sichtbar, true);
  assert.equal(kameraEffekte.kette.anzahl, 2);
  kameraEffekte.ketteEnde();
  assert.equal(kameraEffekte.kette.offen, false);
  kameraEffekte.ketteZuruecksetzen();
  assert.equal(kameraEffekte.kette.anzahl, 0);
  frisch();
});

test('Auftragswarteschlange: Deckel, Reihenfolge, Leeren', () => {
  const q = new KameraAuftraege({ max: 2 });
  assert.equal(q.merke({ art: 'sturz', x: 1, y: 2 }), true);
  assert.equal(q.merke({ art: 'sturz', x: 3, y: 4 }), true);
  assert.equal(q.merke({ art: 'sturz', x: 5, y: 6 }), true);
  assert.equal(q.anzahl, 2, 'der älteste Auftrag fällt heraus');
  const liste = q.nimm();
  assert.deepEqual(liste.map(a => a.x), [3, 5]);
  assert.equal(q.anzahl, 0);
  assert.equal(q.merke(null), false);
  q.merke({ art: 'sturz' });
  q.leeren();
  assert.equal(q.anzahl, 0);
});

/* ---------------------------------------------------------------------
 * Bedienung ohne Browser: Menüknöpfe, Texte und Speicher mit einem
 * minimalen DOM-Ersatz. Die echte Bedienung prüft E2E
 * (tests/e2e/hud-einstellungen.spec.mjs); hier zählt die Logik.
 * ------------------------------------------------------------------- */

function knopfAttrappe() {
  const el = {
    textContent: '', hidden: false, dataset: {}, attrs: {}, handlers: {},
    setAttribute(k, v) { el.attrs[k] = String(v); },
    querySelector() { return el.text ?? (el.text = { textContent: '' }); },
    addEventListener(art, fn) { el.handlers[art] = fn; },
    klick() { el.handlers.click?.(); },
  };
  return el;
}

function domAttrappe() {
  const beben = knopfAttrappe();
  const kette = { textContent: '', hidden: true };
  const schalter = new Map();
  return {
    beben, kette, schalter,
    getElementById(id) {
      if (id === 'kamera-beben') return beben;
      if (id === 'kamera-kette') return kette;
      return null;
    },
    querySelector(sel) {
      const treffer = /data-kamera-effekt="([a-z]+)"/.exec(sel);
      if (!treffer) return null;
      if (!schalter.has(treffer[1])) schalter.set(treffer[1], knopfAttrappe());
      return schalter.get(treffer[1]);
    },
  };
}

function speicherAttrappe() {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

test('Bedienung: Beben schaltet durch, Schalter und Speicher folgen', () => {
  frisch();
  const doc = domAttrappe();
  const ablage = speicherAttrappe();
  const bedienung = new KameraeffekteBedienung({ doc, speicher: ablage });
  assert.match(doc.beben.text.textContent, /Beben: Normal/);
  assert.equal(doc.schalter.get('knapp').attrs['aria-pressed'], 'true');

  doc.beben.klick();
  assert.equal(kameraEffekte.beben, 'stark');
  assert.match(doc.beben.text.textContent, /Beben: Stark/);
  assert.equal(JSON.parse(ablage.getItem('pa.kameraeffekte')).beben, 'stark');
  assert.equal(doc.beben.dataset.stufe, 'stark');

  doc.schalter.get('knapp').klick();
  assert.equal(kameraEffekte.knapp, false);
  assert.equal(doc.schalter.get('knapp').attrs['aria-pressed'], 'false');
  assert.match(doc.schalter.get('knapp').text.textContent, /Knapp vorbei: aus/);

  // Eine zweite Sitzung liest denselben Speicher.
  kameraEffekte.zuruecksetzen();
  const zweite = domAttrappe();
  const zwei = new KameraeffekteBedienung({ doc: zweite, speicher: ablage });
  assert.equal(kameraEffekte.beben, 'stark');
  assert.equal(kameraEffekte.knapp, false);
  assert.match(zweite.beben.text.textContent, /Beben: Stark/);
  bedienung.ende();
  zwei.ende();
  frisch();
});

test('Bedienung: Kettenanzeige erscheint ab zwei Gliedern und verschwindet beim Abschalten', () => {
  frisch();
  const doc = domAttrappe();
  const bedienung = new KameraeffekteBedienung({ doc, speicher: speicherAttrappe() });
  assert.equal(doc.kette.hidden, true);
  kameraEffekte.schuss();
  kameraEffekte.ketteGlied('Mine');
  assert.equal(doc.kette.hidden, true, 'ein Glied zeigt nichts');
  kameraEffekte.ketteGlied('Fass');
  assert.equal(doc.kette.hidden, false);
  assert.match(doc.kette.textContent, /Kette ×2/);
  assert.match(doc.kette.textContent, /Mine · Fass/);
  doc.schalter.get('ketten').klick();
  assert.equal(doc.kette.hidden, true, 'abgeschaltet blendet sofort aus');
  bedienung.ende();
  kameraEffekte.ketteZuruecksetzen();
  frisch();
});

test('Bedienung: kaputter Speicherinhalt fällt auf Vorgaben zurück', () => {
  frisch();
  const ablage = speicherAttrappe();
  ablage.setItem('pa.kameraeffekte', '{kein json');
  const doc = domAttrappe();
  const bedienung = new KameraeffekteBedienung({ doc, speicher: ablage });
  assert.equal(kameraEffekte.beben, 'normal');
  bedienung.ende();

  ablage.setItem('pa.kameraeffekte', JSON.stringify({ beben: 'grell', wasser: 'nein' }));
  const zwei = new KameraeffekteBedienung({ doc: domAttrappe(), speicher: ablage });
  assert.equal(kameraEffekte.beben, 'normal');
  assert.equal(kameraEffekte.wasser, true);
  zwei.ende();
  frisch();
});
