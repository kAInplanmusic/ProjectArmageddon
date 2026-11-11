import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blattBauen, waehleRolle, frameFuer, zustandHockeZelle, ZUSTAND_ZELLEN, MODUS } from '../src/client/figurSheets.js';
import { FigurPosen, HOCKE_ERSATZ, hockeErsatz } from '../src/client/figurAnimation.js';
import { ausruestungFuer, waffeAmKoerper, ankerFehlt, AUSRUESTUNG_ART, ANKER } from '../src/client/figurAusruestung.js';
import { TYP_JE_CHARAKTER, PARAMETER } from '../src/client/figurTypen.js';

const leinwand = () => ({ getContext: () => ({ drawImage() {} }) });
const blattBild = { width: 1024, height: 512 };
const manifest = JSON.parse(readFileSync(new URL('../src/client/assets/sprite-sheets/manifest.json', import.meta.url), 'utf8'));
const vorschlag = JSON.parse(readFileSync(new URL('../docs/DesignRest/manifest-figur-zustand.json', import.meta.url), 'utf8'));

const figur = (x, y) => ({ entityId: 1, x, y });

/** Sprung, Fall und Aufprall wie in `figur-animation.test.js`, nur mit Typ-Parametern. */
function landung(typ, blatt) {
  const posen = new FigurPosen();
  const opt = { typ, params: PARAMETER[typ], blatt: blatt ?? null };
  let t = 0;
  for (let i = 0; i < 10; i += 1) { t += 1 / 60; posen.pose(figur(100, 50), t, opt); }
  let y = 50;
  for (let i = 0; i < 6; i += 1) { t += 1 / 60; y -= 6; posen.pose(figur(100, y), t, opt); }
  for (let i = 0; i < 14; i += 1) { t += 1 / 60; y += 6 + i * 1.2; posen.pose(figur(100, y), t, opt); }
  let minSy = 2;
  let maxDy = -2;
  let pose;
  for (let i = 0; i < 8; i += 1) {
    t += 1 / 60;
    pose = posen.pose(figur(100, y), t, opt);
    minSy = Math.min(minSy, pose.sy);
    maxDy = Math.max(maxDy, pose.dy);
  }
  return { pose, minSy, maxDy, art: posen.zustand(1).hockeArt };
}

// ---------------------------------------------------------------- A06: Bestand

test('A06: genau die 10 dokumentierten Figuren haben keine Hockrolle (Nicht-Zweibeiner; die 12 Zweibeiner bekamen 2026-11-11 eine), der Vorschlag nennt dieselbe Liste', () => {
  const fehlt = Object.entries(manifest.figuren)
    .filter(([, e]) => !e.rollen?.hocke)
    .map(([k]) => k)
    .sort();
  assert.equal(fehlt.length, 10);
  assert.deepEqual(fehlt, [...vorschlag.fehlendeHocke].sort());
  for (const [k, e] of Object.entries(manifest.figuren)) {
    if (!fehlt.includes(k)) assert.ok(Number.isInteger(e.rollen.hocke), `${k} hat eine Hocke-Zelle`);
  }
});

test('A06: fehlende Hocke fällt sichtbar zurück, keine fremde Zelle als Ersatzpose', () => {
  const eintrag = { gehen: [0, 1, 2, 3, 4, 5, 6, 7], rollen: { idle: [0, 1], luft: 2, treffer: 5, tod: 7 } };
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  assert.equal(b.hocke, null, 'keine Hocke erfunden');
  assert.equal(waehleRolle(b, MODUS.HOCKE), null, 'Hocke ohne Frame -> Seitenbild-Fallback');
  assert.equal(waehleRolle(b, MODUS.HOCKE | MODUS.GEHEN), 'walk', 'Gehen bleibt, Hocke ersetzt es nicht');
  assert.equal(frameFuer(b, 'hocke', 0, 0), null);
  assert.deepEqual(ZUSTAND_ZELLEN.slice(0, 2), ['hocke', 'fallen']);
});

// ---------------------------------------------------------------- A05: Zustand-Gate

test('A05: Zustand-Sheet ist gesperrtes Quellmaterial, solange keine Zelle geprüft ist', () => {
  const gesperrt = [
    {},
    { hockeQuelle: { blatt: 'zustand', zelle: 0 } },
    { hockeQuelle: { blatt: 'zustand', zelle: 0, geprueft: false } },
    { hockeQuelle: { blatt: 'aktion', zelle: 0, geprueft: true } },
    { hockeQuelle: { blatt: 'zustand', zelle: 8, geprueft: true } },
    { hockeQuelle: { blatt: 'zustand', zelle: -1, geprueft: true } },
  ];
  for (const e of gesperrt) assert.equal(zustandHockeZelle(e), null);
  assert.equal(zustandHockeZelle({ hockeQuelle: { blatt: 'zustand', zelle: 0, geprueft: true } }), 0);
  assert.equal(zustandHockeZelle({ hockeQuelle: { blatt: 'zustand', zelle: 7, geprueft: true } }), 7);
});

test('A05: ungeprüfte Zustand-Zelle wird nicht als Hocke gebaut, geprüfte schon', () => {
  const rollen = { idle: [0, 1], luft: 2, treffer: 5, tod: 7 };
  const offen = blattBauen({ rollen }, blattBild, blattBild, leinwand, blattBild);
  assert.equal(offen.hocke, null, 'Datei allein macht noch keine Animation');
  const eintrag = { rollen, hockeQuelle: { blatt: 'zustand', zelle: 0, geprueft: true } };
  const frei = blattBauen(eintrag, blattBild, blattBild, leinwand, blattBild);
  assert.ok(frei.hocke, 'geprüfte Zelle wird gebaut');
  assert.equal(waehleRolle(frei, MODUS.HOCKE), 'hocke');
  assert.equal(frameFuer(frei, 'hocke', 0, 0), frei.hocke);
  const falschesMass = blattBauen(eintrag, blattBild, blattBild, leinwand, { width: 512, height: 512 });
  assert.equal(falschesMass.hocke, null, 'falsches Blattmaß -> Fallback');
});

test('A05: Vorschlag gibt keine Zustand-Zelle ungeprüft frei', () => {
  for (const [k, e] of Object.entries(vorschlag.figuren)) {
    if (!e.hocke) continue;
    assert.equal(e.hocke.zustandZelle0.geprueft, false, `${k}: nur nach Einzelbildabnahme freigeben`);
  }
});

// ---------------------------------------------------------------- A06: Ersatzpose

test('A06: Ersatz je Morphologie, ein echter Blatt-Frame hat Vorrang', () => {
  assert.equal(HOCKE_ERSATZ.fahrzeug, 'absenken');
  assert.equal(HOCKE_ERSATZ.schweber, 'absenken');
  assert.equal(HOCKE_ERSATZ.tier, 'daempfen');
  assert.equal(HOCKE_ERSATZ.humanoid, 'menschlich');
  assert.equal(hockeErsatz('fahrzeug', false), 'absenken');
  assert.equal(hockeErsatz('fahrzeug', true), 'blatt');
  assert.equal(hockeErsatz('unbekannt', false), 'menschlich');
  for (const typ of Object.keys(PARAMETER)) assert.ok(HOCKE_ERSATZ[typ], `${typ} braucht einen Ersatz`);
});

test('A06: Fahrzeug senkt ab statt zu hocken, Zweibeiner beugt die Knie', () => {
  const fahrzeug = landung('fahrzeug');
  assert.equal(fahrzeug.art, 'absenken');
  assert.ok(fahrzeug.maxDy > 0.5, `Körper senkt sich (dy ${fahrzeug.maxDy})`);
  assert.ok(fahrzeug.minSy > 0.97, `keine menschliche Stauchung (sy ${fahrzeug.minSy})`);

  const mensch = landung('humanoid');
  assert.equal(mensch.art, 'menschlich');
  assert.ok(mensch.minSy < 0.97, `Kniebeuge bleibt (sy ${mensch.minSy})`);

  const tier = landung('tier');
  assert.equal(tier.art, 'daempfen');
});

test('A06: mit Hocke-Frame gilt die Blattpose, der Ersatz tritt zurück', () => {
  const b = blattBauen({ rollen: { idle: [0, 1], hocke: 3 }, gehen: [0, 1, 2, 3, 4, 5, 6, 7] }, blattBild, blattBild, leinwand);
  const { art, minSy } = landung('humanoid', b);
  assert.equal(art, 'blatt');
  assert.ok(minSy > landung('humanoid').minSy, 'Blatt-Frame dämpft die prozedurale Stauchung');
});

// ---------------------------------------------------------------- A04: Ausrüstung

test('A04: Standard ist getrennt, nur geprüfte Figuren tragen Ausrüstung am Körper', () => {
  const standard = ausruestungFuer('pikamon');
  assert.equal(standard.art, AUSRUESTUNG_ART.GETRENNT);
  assert.equal(standard.anker, 'hand');
  assert.equal(waffeAmKoerper('pikamon'), false, 'Bestie mit Krallen bleibt bewaffnbar');
  assert.equal(ausruestungFuer(null).art, AUSRUESTUNG_ART.GETRENNT);
});

test('A04: montierte Körperwaffen unterdrücken das zweite Waffen-Sprite', () => {
  for (const id of ['hydra-titan-mech', 'heavy-battery-moerser-bot', 'nullpointer-exception-cult']) {
    assert.equal(ausruestungFuer(id).art, AUSRUESTUNG_ART.MONTIERT);
    assert.equal(waffeAmKoerper(id), true, `${id}: eingebaute Kanone nicht doppelt zeichnen`);
    assert.equal(ausruestungFuer(id).anker, 'halterung');
  }
  assert.equal(waffeAmKoerper('iron-hook-harry'), false, 'Hakenprothese ist Werkzeug, keine abgefeuerte Waffe');
});

test('A04: angeborene Krallen und Mäuler bleiben Körper, unterdrücken aber kein Requisit', () => {
  for (const id of ['stalker-predax', 'vortex-grabber', 'flame-jaws', 'plasma-maw-zorg', 'sonic-blossom']) {
    assert.equal(ausruestungFuer(id).art, AUSRUESTUNG_ART.ANGEBOREN);
    assert.equal(waffeAmKoerper(id), false);
  }
  assert.equal(ausruestungFuer('flame-jaws').anker, 'maul');
});

test('A04: jeder geprüfte Eintrag nennt eine bekannte Figur und einen definierten Anker', () => {
  const geprueft = ['hydra-titan-mech', 'heavy-battery-moerser-bot', 'nullpointer-exception-cult', 'iron-hook-harry',
    'stalker-predax', 'vortex-grabber', 'sgt-acid-xeno', 'flame-jaws', 'plasma-maw-zorg', 'sonic-blossom', 'quantum-qubit-knight'];
  for (const id of geprueft) {
    assert.ok(TYP_JE_CHARAKTER[id], `unbekannte Figur ${id}`);
    assert.ok(ANKER[ausruestungFuer(id).anker], `${id}: Anker nicht definiert`);
  }
  // Der Schildritter bleibt getrennt, braucht aber einen Rückenanker statt der Hand.
  assert.equal(ausruestungFuer('quantum-qubit-knight').art, AUSRUESTUNG_ART.GETRENNT);
  assert.equal(ausruestungFuer('quantum-qubit-knight').anker, 'ruecken');
  assert.equal(waffeAmKoerper('quantum-qubit-knight'), false);
  // Die vier fehlenden Anker sind ausdrücklich als fehlend markiert, nicht stillschweigend vorhanden.
  for (const anker of ['maul', 'ruecken', 'schwebe']) assert.equal(ANKER[anker].vorhanden, false);
  assert.equal(ankerFehlt('flame-jaws'), true);
  assert.equal(ankerFehlt('quantum-qubit-knight'), true);
  assert.equal(ankerFehlt('hydra-titan-mech'), false);
});
