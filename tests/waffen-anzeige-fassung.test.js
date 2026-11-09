/**
 * W02/W03/W07/W09/W10/W14/W19: EINE partiefassungsabhängige Waffensicht.
 *
 * Der Audit (docs/waffen-audit-2026-11-08/BERICHT.md) belegte gemischte
 * Anzeigen: Menü-Kachel aus dem Grundkatalog, Detailzeile aus der Partiefassung,
 * HUD-Leiste mit Katalogschaden. `pa_127` hieß deshalb gleichzeitig
 * „Teleportplattform“ und „Mine“. Diese Tests prüfen die Anzeige (Menü, HUD)
 * und die Darstellungsregeln (Rollen, Kennzahlen, Posen, Flugmarke) an echten
 * Daten und einem DOM-Ersatz — nicht an Quelltextmustern.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  getWaffe, WAFFEN_ALT, WAFFEN_FEIN, WAFFEN_MINE, WAFFEN_SPREIZUNG, WAFFEN_TEMPO,
} from '../src/shared/config/waffen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import {
  waffeFuerAnzeige, waffenRolle, wirkungsKennzahl, anzeigeKennzahl, istSelbstwirkung,
} from '../src/client/waffenSicht.js';
import { parameterFuerWaffe, geschossGruppe, GESCHOSS_GRUPPEN } from '../src/client/waffenAnimation.js';
import { schussProfilFuer } from '../src/client/klangProfile.js';
import { WaffenMenue } from '../src/client/waffenMenue.js';
import { Hud } from '../src/client/hud.js';
import { verarbeiteLokal } from '../src/client/ereignisse.js';

// ------------------------------------------------------------ DOM-Ersatz

class FakeClassList {
  #werte = new Set();
  add(...klassen) { klassen.forEach(klasse => this.#werte.add(klasse)); }
  remove(...klassen) { klassen.forEach(klasse => this.#werte.delete(klasse)); }
  contains(klasse) { return this.#werte.has(klasse); }
}

class FakeKnoten {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = {};
    this.id = '';
    this.className = '';
    this.title = '';
    this.hidden = false;
    this._text = '';
  }

  get textContent() { return this._text + this.children.map(kind => kind.textContent).join(''); }
  set textContent(wert) { this._text = String(wert); this.children = []; }

  set innerHTML(wert) { this.children = []; this.append(new FakeKnoten('span')); this._innerHTML = String(wert); }
  get innerHTML() { return this._innerHTML ?? ''; }

  get firstChild() { return this.children[0] ?? null; }
  get previousElementSibling() { return null; }
  get offsetWidth() { return 0; }

  append(...kinder) { for (const kind of kinder) { kind.parentNode = this; this.children.push(kind); } }
  prepend(...kinder) { for (const kind of [...kinder].reverse()) { kind.parentNode = this; this.children.unshift(kind); } }
  replaceChildren(...kinder) { this.children = []; this.append(...kinder); }
  remove() { this.parentNode = null; }
  setAttribute(name, wert) { this.attributes[name] = String(wert); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  focus() {}
  blur() {}
  scrollIntoView() {}
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function fakeDokument(ids = []) {
  const elemente = new Map();
  for (const id of ids) {
    const knoten = new FakeKnoten('div');
    knoten.id = id;
    elemente.set(id, knoten);
  }
  return {
    activeElement: null,
    getElementById(id) {
      if (!elemente.has(id)) {
        const knoten = new FakeKnoten('div');
        knoten.id = id;
        elemente.set(id, knoten);
      }
      return elemente.get(id);
    },
    createElement(tagName) { return new FakeKnoten(tagName); },
  };
}

/** Alle Texte eines Teilbaums (Zeilen, Tooltips, Infozeile). */
function texteVon(knoten) {
  const texte = [];
  const lauf = k => {
    if (k._text) texte.push(k._text);
    if (k.title) texte.push(k.title);
    for (const kind of k.children) lauf(kind);
  };
  lauf(knoten);
  return texte;
}

function menuMit(fassung, weaponId = 'pa_127') {
  const doc = fakeDokument(['waffenmenue', 'waffen-menue-knopf', 'waffenmenue-liste', 'waffenmenue-info', 'waffenmenue-schliessen']);
  const figur = {
    entityId: 1,
    inventory: [weaponId],
    ammo: { [weaponId]: 'unbegrenzt' },
    cooldowns: {},
    activeWeaponId: weaponId,
  };
  const menue = new WaffenMenue(doc, {
    getFigur: () => figur,
    getFassung: () => fassung,
    onSelect: () => true,
  });
  menue.open();
  return { menue, doc, liste: doc.getElementById('waffenmenue-liste'), info: doc.getElementById('waffenmenue-info') };
}

function hudMit(fassung, weaponId = 'pa_040') {
  const doc = fakeDokument([
    'hud-round', 'hud-wind', 'hud-timer', 'hud-status', 'roster', 'weapon-list',
    'hud-angle', 'hud-power', 'hud-blast', 'hud-active', 'log-list', 'hud-connection',
  ]);
  const entity = {
    entityId: 1, label: 'Test', teamId: 0, alive: true, health: 100, maxHealth: 100,
    waterLevel: 0, inventory: [weaponId], ammo: { [weaponId]: 'unbegrenzt' },
    cooldowns: {}, activeWeaponId: weaponId,
  };
  const state = {
    round: 1, wind: 0, status: 'playing', turnDurationMs: 30000, turnElapsedMs: 0,
    entities: [entity], activePlayerId: 1, statuses: {},
  };
  const hud = new Hud(doc, { getFassung: () => fassung });
  hud.update(state);
  return { hud, liste: doc.getElementById('weapon-list') };
}

// ------------------------------------------------------ W02/W03: Fassung

test('W03: pa_127 heißt ab F12 überall Mine, bis F11 Teleportplattform', () => {
  for (const fassung of [WAFFEN_ALT, 4, 11]) {
    const sicht = waffeFuerAnzeige('pa_127', fassung);
    assert.equal(sicht.waffe.displayName, 'Teleportplattform', `Fassung ${fassung}`);
    assert.equal(sicht.waffe.damage, getWaffe('pa_127', fassung).damage);
  }
  for (const fassung of [WAFFEN_MINE, 13, WAFFEN_TEMPO]) {
    const sicht = waffeFuerAnzeige('pa_127', fassung);
    assert.equal(sicht.waffe.displayName, 'Mine', `Fassung ${fassung}`);
    assert.equal(sicht.rolle, 'weltobjekt', 'Mine wird gelegt, nicht gehalten');
  }
});

test('W03: Menü-Kachel und Detailzeile nennen dieselbe Waffe (pa_127)', () => {
  const alt = menuMit(11);
  const altTexte = texteVon(alt.liste).join(' | ');
  assert.match(altTexte, /Teleportplattform/);
  assert.doesNotMatch(altTexte, /\bMine\b/);
  assert.match(alt.info.textContent, /Teleportplattform/);
  assert.doesNotMatch(alt.info.textContent, /\bMine\b/);

  const neu = menuMit(12);
  const neuTexte = texteVon(neu.liste).join(' | ');
  assert.match(neuTexte, /\bMine\b/);
  assert.doesNotMatch(neuTexte, /Teleportplattform/);
  assert.match(neu.info.textContent, /\bMine\b/);
  assert.doesNotMatch(neu.info.textContent, /Teleportplattform/);
});

test('W02: Menü und HUD zeigen den Schaden der Partiefassung, nicht F15', () => {
  // pa_040: Fassung 11 = 21, Fassung 15 = 42 (gemessen, nicht abgeleitet).
  assert.equal(getWaffe('pa_040', 11).damage, 21);
  assert.equal(getWaffe('pa_040', 15).damage, 42);

  const alt = menuMit(11, 'pa_040');
  assert.match(alt.info.textContent, /Schaden 21\b/);
  assert.doesNotMatch(alt.info.textContent, /Schaden 42\b/);

  const neu = menuMit(15, 'pa_040');
  assert.match(neu.info.textContent, /Schaden 42\b/);

  const hudAlt = texteVon(hudMit(11, 'pa_040').liste).join(' | ');
  assert.match(hudAlt, /21 DMG/);
  assert.doesNotMatch(hudAlt, /42 DMG/);

  const hudNeu = texteVon(hudMit(15, 'pa_040').liste).join(' | ');
  assert.match(hudNeu, /42 DMG/);
});

test('W02/W19: Renderer liest Schadensart und Fassung aus EINEM Pfad', async () => {
  // Der Renderer ist ohne Vite nicht importierbar (`import.meta.glob` in
  // tierBilder.js). Geprüft wird deshalb sein Datenpfad im Quelltext plus die
  // Werte, die er über `getWaffe(id, fassung)` erhält.
  const quelle = await import('node:fs').then(fs => fs.readFileSync(
    new URL('../src/client/renderer.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(quelle, /WEAPONS_BY_ID/, 'kein Grundkatalog-Zugriff mehr');
  assert.match(quelle, /waffe\(id\) \{\s*return id \? getWaffe\(id, this\.waffenFassung\)/, 'eine Fassungssicht');
  assert.match(quelle, /setzeWaffenFassung\(/);
  assert.equal(getWaffe('pa_032', WAFFEN_FEIN).damageType, 'physical');
  assert.equal(getWaffe('pa_032', WAFFEN_TEMPO).damageType, 'fire');
  assert.equal(getWaffe('pa_040', WAFFEN_TEMPO).damage, 42);
  assert.equal(getWaffe('pa_127', WAFFEN_MINE).displayName, 'Mine');
});

test('W19: Klangfarbe folgt der übergebenen Fassung, nicht dem Standard', () => {
  // pa_041: Fassung 4 körperlich/wucht, ab Fassung 5 Sprengstoff.
  const alt = getWaffe('pa_041', WAFFEN_FEIN);
  const neu = getWaffe('pa_041', WAFFEN_TEMPO);
  assert.equal(alt.damageType, 'physical');
  assert.equal(neu.damageType, 'explosive');
  assert.equal(schussProfilFuer(alt, WAFFEN_FEIN), 'schwer');
  assert.equal(schussProfilFuer(neu, WAFFEN_TEMPO), 'rakete');
});

// ----------------------------------------------- W07: Rollen der Waffe

test('W07: Beschwörung, Aufstellobjekt, Rucksack und Selbstanwendung sind keine Handwaffe', () => {
  const erwartet = {
    pa_141: 'weltobjekt', // Astralkrieger (Beschwörung)
    pa_143: 'weltobjekt', // Astralross
    pa_115: 'weltobjekt', // Wächterstatue
    pa_127: 'weltobjekt', // Mine
    pa_076: 'weltobjekt', // Portalring
    pa_109: 'weltobjekt', // Giftbaum
    pa_032: 'ruecken',    // Raketenrucksack
    pa_112: 'ruecken',    // Düsenrucksack
    pa_114: 'ruecken',    // Gleitschirm
    pa_092: 'selbst',     // Heilzauber
    pa_040: 'hand',       // Maschinenpistole
  };
  for (const [id, rolle] of Object.entries(erwartet)) {
    const sicht = waffeFuerAnzeige(id, WAFFEN_TEMPO);
    assert.equal(sicht.rolle, rolle, `${id} ${sicht.waffe.displayName}`);
  }
  // Das Wurfding wird erst mit seinem Sprite-Eintrag zur Geschossrolle.
  const bumerang = getWaffe('pa_049', WAFFEN_TEMPO);
  assert.equal(waffenRolle(bumerang, undefined, { projektilInfo: { art: 'ding' } }), 'geschoss');
  // Keine der 38 Selbstwirkungen wird als gehalten gezeichnet.
  for (const waffe of WEAPONS) {
    const effekt = buildEffect(getWaffe(waffe.id, WAFFEN_TEMPO));
    if (!effekt || !SELF_TARGET_KINDS.has(effekt.kind)) continue;
    const rolle = waffenRolle(getWaffe(waffe.id, WAFFEN_TEMPO), effekt);
    assert.ok(rolle === 'selbst' || rolle === 'weltobjekt' || rolle === 'ruecken', `${waffe.id} ${rolle}`);
  }
});

test('W07: Renderer hat keinen zweiten Katalogpfad mehr', async () => {
  const quelle = await import('node:fs').then(fs => fs.readFileSync(
    new URL('../src/client/renderer.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(quelle, /WEAPONS_BY_ID/);
  assert.match(quelle, /waffenRolle\(/);
  assert.match(quelle, /this\.waffe\(entity\.activeWeaponId\)/);
});

// ---------------------------------------- W09: Kennzahl statt pauschal DMG

test('W09: alle 38 Selbstwirkungen nennen ihre Wirkung, nie eine DMG-Zahl', () => {
  const selbst = [];
  for (const waffe of WEAPONS) {
    const inFassung = getWaffe(waffe.id, WAFFEN_TEMPO);
    if (!istSelbstwirkung(inFassung)) continue;
    selbst.push(inFassung);
    const kennzahl = wirkungsKennzahl(inFassung);
    assert.ok(kennzahl, `${waffe.id} ohne Wirkungskennzahl`);
    assert.doesNotMatch(kennzahl, /^Schaden/, `${waffe.id} zeigt weiter Schaden`);
    assert.doesNotMatch(anzeigeKennzahl(inFassung), /^Schaden/, `${waffe.id} zeigt weiter Schaden`);
  }
  assert.equal(selbst.length, 38, '38 Selbstwirkungen laut Audit');

  // Die 23 positiven Katalogwerte sind der eigentliche Fehlerfall.
  const positiv = selbst.filter(waffe => (waffe.damage ?? 0) > 0);
  assert.equal(positiv.length, 23, '23 Selbstwirkungen mit positivem Katalogwert');
});

test('W09: Heilzauber zeigt Heilmenge, Schild seinen Wert, Mine ihre Funktion', () => {
  assert.match(wirkungsKennzahl(getWaffe('pa_092')), /^Heilung 40/);
  assert.match(wirkungsKennzahl(getWaffe('pa_101')), /^Schild 55/);
  assert.match(wirkungsKennzahl(getWaffe('pa_084')), /^Verstärkung ×1\.7/);
  assert.match(wirkungsKennzahl(getWaffe('pa_087')), /^Versetzen 80/);
  assert.match(wirkungsKennzahl(getWaffe('pa_127')), /^Minenfunktion/);
  // HUD-Zeile: Heilzauber nicht als „35 DMG“.
  const hudTexte = texteVon(hudMit(15, 'pa_092').liste).join(' | ');
  assert.match(hudTexte, /Heilung 40/);
  assert.doesNotMatch(hudTexte, /35 DMG/);
});

// ------------------------------------- W10: Flugmarke ohne falsche Streuung

test('W10: keine Cluster-/Streumarke ohne Mehrfachprojektil', () => {
  assert.equal(GESCHOSS_GRUPPEN.cluster, undefined, 'die alte Streumarke ist entfernt');
  assert.ok(GESCHOSS_GRUPPEN.splitter, 'Geländesplitter ist die ehrliche Marke');
  assert.equal(GESCHOSS_GRUPPEN.splitter.name, 'Geländesplitter');

  for (const waffe of WEAPONS) {
    const gruppe = geschossGruppe(getWaffe(waffe.id, WAFFEN_TEMPO));
    assert.notEqual(gruppe, 'cluster', `${waffe.id} trägt noch die Streumarke`);
  }
  // Die Spezialnamen bekommen die Marke nur, weil die Geländesplitterung wirklich existiert.
  for (const id of ['pa_046', 'pa_048', 'pa_054']) {
    assert.equal(geschossGruppe(getWaffe(id, WAFFEN_TEMPO)), 'splitter', id);
  }
  // Hitscan hat kein Geschoss — also auch keine Flugmarke, egal welcher Spezialname.
  assert.equal(geschossGruppe(getWaffe('pa_117', WAFFEN_TEMPO)), null);
});

// --------------------------------- W14: Selbstpose aus dem Motorpfad

test('W14: parameterFuerWaffe erkennt Selbstwirkungen über buildEffect, nicht über damage===0', () => {
  const sp = { form: 'kompakt', projektilInfo: null };
  for (const waffe of WEAPONS) {
    const inFassung = getWaffe(waffe.id, WAFFEN_TEMPO);
    if (!istSelbstwirkung(inFassung)) continue;
    const par = parameterFuerWaffe(inFassung, sp);
    assert.equal(par.art, 'selbst', `${waffe.id} ${inFassung.displayName}`);
  }
  // 23 positive Werte waren vorher NICHT als Selbstwirkung erkannt.
  assert.equal(parameterFuerWaffe(getWaffe('pa_092'), sp).art, 'selbst', 'Heilzauber (35 Schaden)');
  assert.notEqual(parameterFuerWaffe(getWaffe('pa_040'), sp).art, 'selbst', 'Maschinenpistole');
});

test('W14: bewusste Posenkorrekturen bleiben die letzte Schicht', () => {
  // pa_084: Verstärkung, Korrektur heben 0.7 und Sternblitz.
  const glut = parameterFuerWaffe(getWaffe('pa_084'), { form: 'kompakt' });
  assert.equal(glut.art, 'selbst');
  assert.equal(glut.heben, 0.7);
  assert.equal(glut.blitzForm, 'stern');
  // pa_112: Rucksack bleibt hinten (W07), trotz Selbstwirkung.
  const rucksack = parameterFuerWaffe(getWaffe('pa_112'), { form: 'kompakt' });
  assert.equal(rucksack.lage, 'hinter');
  assert.equal(rucksack.handVor, -5);
});

// ---------------------------------- W03: HUD-Name folgt der Partiefassung

test('W03: HUD-Leiste nennt pa_127 bis F11 Teleportplattform, ab F12 Mine', () => {
  const alt = texteVon(hudMit(11, 'pa_127').liste).join(' | ');
  assert.match(alt, /Teleportplattform/);
  assert.doesNotMatch(alt, /\bMine\b/);

  for (const fassung of [WAFFEN_MINE, WAFFEN_TEMPO]) {
    const neu = texteVon(hudMit(fassung, 'pa_127').liste).join(' | ');
    assert.match(neu, /\bMine\b/, `Fassung ${fassung}`);
    assert.doesNotMatch(neu, /Teleportplattform/, `Fassung ${fassung}`);
  }
});

// ------------------- W09: Nutzwerte und Altreplay-Darstellung (F9 vs F10)

test('W09: Heilung, Schild und Bewegung zeigen den Nutzwert der Partiefassung', () => {
  /*
   * Die Staffelung der Fassung 10 hebt die Selbstwirkung vom abgeleiteten
   * Katalogwert ab: Heilzauber 42 -> 40, Eisschild 40 -> 55, Dimensionskugel
   * 60 -> 110. Eine Aufzeichnung der Fassung 9 muss die alten Zahlen zeigen,
   * die laufende Partie die neuen — in Menü UND HUD derselbe Wert.
   */
  const faelle = [
    ['pa_092', 9, /Heilung 42\b/, /Heilung 40\b/],
    ['pa_101', 9, /Schild 40\b/, /Schild 55\b/],
    ['pa_110', 9, /Versetzen 60\b/, /Versetzen 110\b/],
  ];
  for (const [id, altFassung, altWert, neuWert] of faelle) {
    const altMenue = menuMit(altFassung, id);
    const altHud = texteVon(hudMit(altFassung, id).liste).join(' | ');
    assert.match(altMenue.info.textContent, altWert, `${id} Fassung ${altFassung} (Menü)`);
    assert.match(altHud, altWert, `${id} Fassung ${altFassung} (HUD)`);
    assert.doesNotMatch(altMenue.info.textContent, neuWert, `${id}: neue Zahl im Altreplay`);
    assert.doesNotMatch(altHud, neuWert, `${id}: neue Zahl im Altreplay-HUD`);

    const neuMenue = menuMit(WAFFEN_SPREIZUNG, id);
    const neuHud = texteVon(hudMit(WAFFEN_SPREIZUNG, id).liste).join(' | ');
    assert.match(neuMenue.info.textContent, neuWert, `${id} Fassung 10 (Menü)`);
    assert.match(neuHud, neuWert, `${id} Fassung 10 (HUD)`);
    assert.doesNotMatch(neuMenue.info.textContent, altWert, `${id}: alte Zahl in neuer Partie`);
  }
});

// --------------------- W19: Schussklang kommt aus derselben Fassung (Ereignis)

test('W19: das Schussereignis übergibt dem Mischer die Waffe der Partie', () => {
  const klaenge = [];
  const kontext = fassung => ({
    match: { waffen: fassung, players: [] },
    sound: { verarbeite: ereignis => klaenge.push(ereignis) },
    findEntity: () => null,
    renderer: { addMuzzleFlash() {}, merkeSchuss() {} },
    hud: { log() {} },
    shotPredictor: { resolve() {} },
  });

  for (const [fassung, art] of [[WAFFEN_FEIN, 'physical'], [WAFFEN_TEMPO, 'explosive']]) {
    klaenge.length = 0;
    verarbeiteLokal(kontext(fassung), {
      type: 'shot', payload: { playerId: 1, weaponId: 'pa_041', angle: 0 },
    });
    const schuss = klaenge.find(ereignis => ereignis.type === 'shot');
    assert.ok(schuss, `Fassung ${fassung}: kein Schussklang`);
    assert.equal(schuss.waffe?.damageType, art, `Fassung ${fassung}`);
    assert.equal(schussProfilFuer(schuss.waffe, schuss.fassung), art === 'physical' ? 'schwer' : 'rakete');
  }
});

// ------------------- W02: die Anzeigepfade in main.js lesen keine Altdaten

test('W02: main.js liest Namen, Vorschau und Radius aus der Partiefassung', async () => {
  const quelle = await import('node:fs').then(fs => fs.readFileSync(
    new URL('../src/client/main.js', import.meta.url), 'utf8'));
  // Kein Grundkatalog-Zugriff mehr in der Anzeige (Import und Aufrufe).
  assert.doesNotMatch(quelle, /getWeapon\(/);
  // Die vier Anzeigepfade: Abwurf-Meldung, Waffenwechsel-Meldung,
  // Bahnvorhersage und Radius-Vorschau hängen an `match.waffen`.
  for (const pfad of [
    /const name = getWaffe\(weaponId, this\.match\?\.waffen \?\? WAFFEN_STANDARD\)/,
    /Waffe: \$\{getWaffe\(weaponId, this\.match\?\.waffen \?\? WAFFEN_STANDARD\)/,
    /const waffe = eigene\.activeWeaponId \? getWaffe\(eigene\.activeWeaponId, this\.match\?\.waffen/,
    /const activeWeapon = activeEntity\?\.activeWeaponId \? getWaffe\(activeEntity\.activeWeaponId, this\.match\?\.waffen/,
  ]) {
    assert.match(quelle, pfad);
  }
  assert.match(quelle, /blastRadius: activeWeapon\?\.blastRadius \?\? 0/,
    'die Radius-Vorschau nimmt den Wert der Partiefassung');
});
