/**
 * Hymnensteuerung im Menü (A14) — Kaderreiter, Überblendung, Geste, Stumm.
 *
 * ## Was diese Datei festhält
 *
 * A14 verlangt vier Dinge, und alle vier sind hier an der echten `Musik`-Klasse
 * mit Attrappen für Audio/AudioContext geprüft (es klingt nichts):
 *
 * 1. **Anbindung:** Der Kaderreiter meldet seine Fraktion an die
 *    Hymnensteuerung (`buildRosterView({ hymneWaehlen })`), `main.js` verdrahtet
 *    sie auf `Musik.waehleHymne`.
 * 2. **Überblendung 1–2 s:** Ein Hymnenwechsel blendet, er schneidet nicht.
 * 3. **Kein Neustart:** Ein zweiter Klick auf dieselbe Fraktion lässt die
 *    laufende Stelle stehen (kein neuer Start, keine neue Überblendung).
 * 4. **Geste und Stumm:** Vor der Geste kein Ton, bei „Musik aus" keine
 *    Wiedergabe — die Wahl bleibt gespeichert und setzt beim Einschalten fort.
 *
 * Dazu die Abgrenzung zum Match: Beim Match-Start endet die Hymne, damit im
 * Match keine Hymne dauernd neu anfängt (A15, Sieg-Jingle bleibt offen).
 *
 * `kaderansicht.js` lässt sich unter `node --test` nicht laden (es importiert
 * CSS und baut das echte Menü). Die Anbindung wird deshalb dort geprüft, wo sie
 * entschieden wird — an `Musik` und `main.js` — plus als Quelltext-Wächter für
 * die eine Zeile im Kader.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Musik, UEBERBLENDUNG_S, wiedergabeErlaubt } from '../src/client/musik.js';
import { hymnenStueck } from '../src/client/musikListe.js';
import { FACTIONS } from '../src/shared/config/factions.js';
import { join } from 'node:path';

const ORDNER = resolve(import.meta.dirname, '../src/client/assets/music');
const HYMNEN = JSON.parse(readFileSync(join(ORDNER, 'fraktionen', 'manifest.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ORDNER, 'manifest.json'), 'utf8'));
const NAMEN = Object.fromEntries(FACTIONS.map(f => [f.id, f.name]));
const HYMNEN_URLS = Object.fromEntries(
  Object.values(HYMNEN.fraktionen).map(h => [`fraktionen/${h.datei}`, `/m/fraktionen/${h.datei}`]),
);

/* ------------------------------------------------------------- Attrappen */

function param(wert = 1) {
  return {
    value: wert,
    ramps: [],
    cancelScheduledValues() {},
    setValueAtTime(w) { this.value = w; },
    linearRampToValueAtTime(w, zeit) {
      this.ramps.push({ ziel: w, zeit });
      this.ziel = w;
      this.value = w;
    },
  };
}

class FakeAudio {
  constructor() { this.hoerer = {}; this.paused = true; this.src = ''; this.currentTime = 0; this.duration = NaN; }
  addEventListener(art, fn) { this.hoerer[art] = fn; }
  play() {
    if (this.abbruch) {
      const fehler = new Error(this.abbruch);
      fehler.name = this.abbruch;
      return Promise.reject(fehler);
    }
    this.paused = false; this.gespielt = (this.gespielt ?? 0) + 1; return Promise.resolve();
  }
  pause() { this.paused = true; }
  ausloesen(art) { this.hoerer[art]?.(); }
}

function baue({ aktiv = true } = {}) {
  const audios = [];
  const gains = [];
  const ctx = {
    currentTime: 0,
    createGain() {
      const g = { gain: param(), connect() {} };
      gains.push(g);
      return g;
    },
    createMediaElementSource() { return { connect() {} }; },
  };
  const mischer = {
    async starte() { return true; },
    musikAnschluss() { return { ctx, ziel: {} }; },
  };
  const verzoegert = [];
  const musik = new Musik({
    manifest: MANIFEST,
    urls: {
      ...Object.fromEntries(MANIFEST.stuecke.map(s => [s.datei, `/m/${s.datei}`])),
      ...HYMNEN_URLS,
    },
    hymnen: HYMNEN,
    hymnenNamen: NAMEN,
    mischer,
    aktiv,
    speicher: { lies: () => null, schreibe() {} },
    audioBauer: () => { const a = new FakeAudio(); audios.push(a); return a; },
    zufall: () => 0,
    setTimeoutFn: fn => { verzoegert.push(fn); },
  });
  return { musik, audios, gains, verzoegert };
}

/** Alle Zeitpläne abarbeiten (Pausen nach der Überblendung). */
function alleTimer(verzoegert) { for (const fn of verzoegert.splice(0)) fn(); }

/* ------------------------------------------------------------ Anbindung */

test('A14: Überblenddauer liegt im vereinbarten Fenster 1–2 s', () => {
  assert.ok(UEBERBLENDUNG_S >= 1 && UEBERBLENDUNG_S <= 2, `Überblendung ${UEBERBLENDUNG_S} s`);
});

test('A14: Kaderreiter melden die Fraktion an die Hymnensteuerung', () => {
  const kader = readFileSync(resolve(import.meta.dirname, '../src/client/kaderansicht.js'), 'utf8');
  const main = readFileSync(resolve(import.meta.dirname, '../src/client/main.js'), 'utf8');
  assert.match(kader, /export function buildRosterView\(\{ hymneWaehlen = null \} = \{\}\)/);
  assert.match(kader, /hymneWaehlen\?\.\(fraktion\.id\)/, 'Reiterklick reicht die Fraktions-ID weiter');
  assert.match(main, /buildRosterView\(\{ hymneWaehlen:/, 'main verdrahtet den Kader');
  assert.match(main, /\.waehleHymne\(/, 'main nutzt den Gesten-Weg der Musik');
  assert.match(main, /fraktion-felder[^]*?waehleHymne/, 'auch das Fraktionsfeld geht über den Gesten-Weg');
});

/* -------------------------------------------------------------- Wiedergabe */

test('A14: Hymne erklingt erst mit der Geste und blendet über 1–2 s ein', async () => {
  const { musik, audios, gains, verzoegert } = baue();
  musik.setzeHymne('pixel');
  assert.equal(await musik.freigeben(), true);
  assert.equal(audios.length, 1, 'nur ein Element, kein Vorab-Laden');
  assert.equal(musik.zustand.id, 'hymne-pixel');
  assert.equal(musik.zustand.starts, 1, 'die Hymne ist das erste Stück, nicht erst die Menümusik');
  assert.equal(audios[0].paused, false);
  const einblenden = gains.at(-1).gain.ramps.at(-1);
  assert.ok(einblenden.zeit <= UEBERBLENDUNG_S, `Einblenden ${einblenden.zeit} s`);
  alleTimer(verzoegert);
});

test('A14: Wechsel der Fraktion überblendet 1–2 s, höchstens eine Hymne klingt', async () => {
  const { musik, audios, gains, verzoegert } = baue();
  await musik.waehleHymne('pixel');
  const alt = audios[0];
  const altGain = gains.at(-1);
  await musik.waehleHymne('xeno');

  assert.equal(musik.zustand.id, 'hymne-xeno');
  assert.equal(musik.zustand.ueberblendungen, 1);
  assert.equal(audios.length, 2, 'zwei Slots, mehr braucht die Überblendung nicht');
  assert.equal(alt.paused, false, 'das alte Stück läuft während der Überblendung aus');
  const ein = gains.at(-1).gain.ramps.at(-1);
  const aus = altGain.gain.ramps.at(-1);
  assert.ok(ein.zeit >= 1 && ein.zeit <= 2, `Einblenden ${ein.zeit} s`);
  assert.ok(aus.zeit >= 1 && aus.zeit <= 2, `Ausblenden ${aus.zeit} s`);
  assert.equal(ein.zeit, aus.zeit, 'beide Seiten gleich lang');

  alleTimer(verzoegert);
  assert.equal(audios.filter(a => !a.paused).length, 1, 'nach der Überblendung genau eine');
});

test('A14: Klick auf dieselbe Fraktion startet nichts neu', async () => {
  const b = baue();
  await b.musik.waehleHymne('pixel');
  const el = b.audios[0];
  el.currentTime = 7.5;
  const startsVorher = b.musik.zustand.starts;
  const rampsVorher = b.gains.reduce((n, g) => n + g.gain.ramps.length, 0);
  const srcVorher = el.src;

  await b.musik.waehleHymne('pixel');

  assert.equal(b.musik.zustand.starts, startsVorher, 'kein neuer Start');
  assert.equal(b.musik.zustand.ueberblendungen, 0, 'keine neue Überblendung');
  assert.equal(el.currentTime, 7.5, 'die laufende Stelle bleibt stehen');
  assert.equal(el.src, srcVorher, 'dieselbe Datei wird nicht neu geladen');
  assert.equal(b.gains.reduce((n, g) => n + g.gain.ramps.length, 0), rampsVorher);
  assert.equal(b.audios.filter(a => !a.paused).length, 1);
  alleTimer(b.verzoegert);
});

test('A14: bei „Musik aus" bleibt die Wahl still und setzt beim Einschalten fort', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.waehleHymne('pixel');
  const el = audios[0];
  el.currentTime = 4.2;

  musik.setzeAn(false);
  alleTimer(verzoegert);
  assert.equal(el.paused, true, 'stumm');

  await musik.waehleHymne('undead');
  alleTimer(verzoegert);
  assert.equal(musik.zustand.hymne, 'undead', 'die Wahl wird gemerkt, obwohl nichts klingt');
  assert.equal(audios.filter(a => !a.paused).length, 0, 'keine Wiedergabe bei Musik aus');

  musik.setzeAn(true);
  assert.equal(musik.zustand.id, 'hymne-undead', 'Einschalten setzt die gewählte Hymne fort');
  assert.equal(audios.filter(a => !a.paused).length, 1);
  assert.equal(musik.zustand.hymne, 'undead');
});

test('A14: Wahl bei „Musik aus" verdrängt die pausierte Menümusik', async () => {
  // Regression: `#setzeFort` nahm jedes Menüstück an, auch wenn inzwischen eine
  // Hymne gewählt war — beim Einschalten lief dann weiter die alte Menümusik.
  const { musik, audios, verzoegert } = baue();
  await musik.freigeben(); // Menümusik
  assert.ok(!musik.zustand.id.startsWith('hymne-'));
  musik.setzeAn(false);
  alleTimer(verzoegert);

  await musik.waehleHymne('shinobi');
  musik.setzeAn(true);

  assert.equal(musik.zustand.id, 'hymne-shinobi');
  assert.equal(musik.zustand.hymne, 'shinobi');
  assert.ok(audios.some(a => a.src.endsWith('/shinobi.mp3') && !a.paused), 'die Hymne klingt');
});

test('A14: ein abgebrochener Abspielversuch verwirft die Hymne nicht', async () => {
  // Befund aus dem Browser: Pause während des Ladens lässt `play()` mit
  // AbortError scheitern. Vorher zählte das als Dateifehler und die Wahl fiel
  // auf die Menümusik zurück — mitten im Stummschalten.
  for (const name of ['AbortError', 'NotAllowedError']) {
    const { musik, audios, verzoegert } = baue();
    await musik.waehleHymne('pixel');
    const el = audios[0];
    musik.setzeAn(false);
    alleTimer(verzoegert);
    el.abbruch = name;
    musik.setzeAn(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(musik.zustand.fehler, 0, `${name} ist kein Dateifehler`);
    assert.equal(musik.zustand.hymne, 'pixel', `${name}: Wahl bleibt erhalten`);
    assert.equal(musik.zustand.id, 'hymne-pixel');
    el.abbruch = null;
  }
});

test('A14: unbekannte Fraktion und „Automatisch" führen still zur Menümusik zurück', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.waehleHymne('pixel');
  await musik.waehleHymne('gibtsnicht');
  assert.equal(musik.zustand.hymne, null);
  assert.ok(!musik.zustand.id.startsWith('hymne-'), 'Menümusik statt Hymne');
  alleTimer(verzoegert);
  assert.equal(audios.filter(a => !a.paused).length, 1, 'weiter genau eine Quelle');
});

test('A14/A15: Match-Start beendet die Hymne — im Match startet sie nicht neu', async () => {
  const { musik, audios, verzoegert } = baue();
  await musik.waehleHymne('machina');
  musik.setzeStimmung('match');
  alleTimer(verzoegert);
  assert.equal(musik.zustand.hymne, null);
  assert.ok(!musik.zustand.id.startsWith('hymne-'));

  // Ein Reiterklick im Match (Kader ist zu, theoretisch) ändert daran nichts.
  await musik.waehleHymne('pixel');
  assert.equal(musik.zustand.hymne, 'pixel', 'Wahl wird gemerkt');
  assert.ok(!musik.zustand.id.startsWith('hymne-'), 'aber im Match klingt keine Hymne');
  assert.equal(musik.zustand.spielt, true);

  musik.setzeStimmung('menu');
  alleTimer(verzoegert);
  assert.equal(musik.zustand.id, 'hymne-pixel', 'zurück im Menü gilt die Wahl wieder');
  assert.equal(audios.filter(a => !a.paused).length, 1);
});

test('A14: eine Geste startet genau einmal, auch wenn mehrere Hörer sie sehen', async () => {
  const { musik, audios } = baue();
  const ergebnisse = await Promise.all([
    musik.waehleHymne('pixel'),
    musik.freigeben(), // pointerup-Hörer
    musik.freigeben(), // click-Hörer
    musik.freigeben(), // Kaderreiter
  ]);
  assert.deepEqual(ergebnisse, [true, true, true, true]);
  assert.equal(musik.zustand.starts, 1, 'kein Stapel gleicher Hymnen');
  assert.equal(musik.zustand.ueberblendungen, 0);
  assert.equal(audios.length, 1);
  assert.equal(audios.filter(a => !a.paused).length, 1);
});

test('A14: in Testumgebungen ohne Wiedergabe wirft der Klick nicht und merkt die Wahl', async () => {
  assert.equal(wiedergabeErlaubt({ webdriver: true }), false);
  const { musik } = baue({ aktiv: false });
  await musik.waehleHymne('shinobi');
  assert.equal(musik.zustand.hymne, 'shinobi');
  assert.equal(musik.zustand.starts, 0);
  assert.equal(musik.zustand.spielt, false);
});

/* ------------------------------------------------------------ Dateibezug */

test('A14: jede Fraktion hat eine abspielbare Hymne im Manifest', () => {
  for (const { id } of FACTIONS) {
    const stueck = hymnenStueck(HYMNEN, id, NAMEN[id]);
    assert.ok(stueck, `${id}: Hymne fehlt`);
    assert.ok(HYMNEN_URLS[stueck.datei], `${id}: URL-Zuordnung fehlt`);
  }
});
