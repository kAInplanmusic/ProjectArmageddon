/**
 * Tests: Die Rückfrage ist ein Dialog, kein `confirm` (UI-3).
 *
 * ## Der Befund
 *
 * `globalThis.confirm()` blockiert den Hauptfaden. Der Frame-Loop steht, die
 * Zugzeit-Anzeige friert ein, und der Countdown läuft unsichtbar weiter.
 *
 * ## Was hier geprüft wird
 *
 * Das VERHALTEN von `Bestaetigung` — mit einem kleinen DOM-Ersatz, damit der
 * Test ohne Browser läuft: Anzeigen, Antworten, Esc/Enter/Tab, Fokusfalle,
 * `inert` und die Rückgabe des Fokus. Dazu die Struktur in `index.html` und die
 * Verdrahtung in `main.js` (kein `confirm` mehr).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bestaetigung } from '../src/client/bestaetigung.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

/** Minimaler DOM-Ersatz: nur, was `Bestaetigung` benutzt. */
function baueDom() {
  const knoten = (id, extra = {}) => ({
    id,
    hidden: false,
    inert: false,
    textContent: '',
    listeners: {},
    addEventListener(art, fn) { (this.listeners[art] ??= []).push(fn); },
    focus() { doc.activeElement = this; },
    contains(kind) { return this.kinder?.includes(kind) ?? false; },
    ...extra,
  });
  const doc = {
    activeElement: null,
    listeners: {},
    getElementById: id => knoten_map.get(id) ?? null,
    addEventListener(art, fn) { (this.listeners[art] ??= []).push(fn); },
    contains: () => true,
  };
  const ja = knoten('bestaetigung-ja');
  const nein = knoten('bestaetigung-nein');
  const overlay = knoten('bestaetigung', { kinder: [ja, nein] });
  const knoten_map = new Map([
    ['bestaetigung', overlay],
    ['bestaetigung-titel', knoten('bestaetigung-titel')],
    ['bestaetigung-text', knoten('bestaetigung-text')],
    ['bestaetigung-ja', ja],
    ['bestaetigung-nein', nein],
    ['game-canvas', knoten('game-canvas')],
    ['hud', knoten('hud', { inert: false })],
  ]);
  return { doc, overlay, ja, nein, knoten: knoten_map };
}

/** Löst einen Tastendruck aus, wie der Browser ihn liefern würde. */
function taste(dom, key, { shiftKey = false } = {}) {
  const ereignis = {
    key, shiftKey, verhindert: false, gestoppt: false,
    preventDefault() { this.verhindert = true; },
    stopPropagation() { this.gestoppt = true; },
    target: dom.doc.activeElement,
  };
  for (const fn of dom.doc.listeners.keydown ?? []) fn(ereignis);
  return ereignis;
}

/** Klickt einen Knopf des Dialogs. */
function klick(knopf) {
  for (const fn of knopf.listeners.click ?? []) fn({ target: knopf });
}

test('Die Frage zeigt sich und liefert die Antwort als Promise', async () => {
  const dom = baueDom();
  const dialog = new Bestaetigung(dom.doc);

  const antwort = dialog.frage({ titel: 'Match verlassen?', text: 'Der Spielstand geht verloren.', ja: 'Verlassen', nein: 'Weiterspielen' });
  assert.equal(dom.overlay.hidden, false, 'der Dialog muss sichtbar werden');
  assert.equal(dom.knoten.get('bestaetigung-titel').textContent, 'Match verlassen?');
  assert.equal(dom.knoten.get('bestaetigung-text').textContent, 'Der Spielstand geht verloren.');
  assert.equal(dom.ja.textContent, 'Verlassen');
  assert.equal(dom.nein.textContent, 'Weiterspielen');
  assert.equal(dom.doc.activeElement, dom.ja, 'der Fokus gehört auf die Bestätigung (wie beim nativen Dialog)');
  assert.equal(dom.knoten.get('game-canvas').inert, true, 'die Spielfläche ist während der Frage nicht bedienbar');
  assert.equal(dom.knoten.get('hud').inert, true, 'das HUD ist während der Frage nicht bedienbar');

  // Kein blockierendes Warten: Die Antwort kommt aus dem Klick.
  klick(dom.nein);
  assert.equal(await antwort, false);
  assert.equal(dom.overlay.hidden, true, 'nach der Antwort schließt der Dialog');
  assert.equal(dom.knoten.get('game-canvas').inert, false, 'inert wird zurückgesetzt');
  assert.equal(dom.knoten.get('hud').inert, false, 'inert wird zurückgesetzt');
});

test('Esc antwortet Nein und erreicht das Spiel nicht', async () => {
  const dom = baueDom();
  const dialog = new Bestaetigung(dom.doc);
  const antwort = dialog.frage({ titel: 'Aufgeben?', text: 'Deine Figuren zählen als besiegt.' });

  const ereignis = taste(dom, 'Escape');
  assert.equal(await antwort, false, 'Esc darf nicht aufgeben');
  assert.equal(ereignis.gestoppt, true, 'Esc darf nicht bis zum Spiel durchlaufen');
  assert.equal(ereignis.verhindert, true);
  assert.equal(dialog.istOffen, false);
});

test('Jede andere Taste bleibt im Dialog — R startet keine zweite Frage', async () => {
  const dom = baueDom();
  const dialog = new Bestaetigung(dom.doc);
  const antwort = dialog.frage({ titel: 'Match verlassen?' });

  const ereignis = taste(dom, 'r');
  assert.equal(ereignis.gestoppt, true, 'R darf während der Frage nicht das Spiel erreichen');
  assert.equal(dialog.istOffen, true, 'die Frage bleibt offen');

  // Eine zweite Frage währenddessen liefert DIESELBE Antwort, statt zu stapeln.
  const zweite = dialog.frage({ titel: 'Nochmal?' });
  klick(dom.ja);
  assert.equal(await antwort, true);
  assert.equal(await zweite, true);
  assert.equal(dom.overlay.hidden, true);
});

test('Tab bleibt im Dialog (Fokusfalle)', () => {
  const dom = baueDom();
  const dialog = new Bestaetigung(dom.doc);
  void dialog.frage({ titel: 'Match verlassen?' });

  dom.doc.activeElement = dom.ja;
  taste(dom, 'Tab');
  assert.equal(dom.doc.activeElement, dom.nein, 'Tab wandert zum nächsten Knopf');
  taste(dom, 'Tab');
  assert.equal(dom.doc.activeElement, dom.ja, 'Tab springt am Ende zurück');
  dom.doc.activeElement = dom.ja;
  taste(dom, 'Tab', { shiftKey: true });
  assert.equal(dom.doc.activeElement, dom.nein, 'Shift+Tab wandert rückwärts');
});

test('Enter bestätigt — auf einem Knopf entscheidet der fokussierte Knopf', async () => {
  const dom = baueDom();
  const dialog = new Bestaetigung(dom.doc);
  const antwort = dialog.frage({ titel: 'Match verlassen?' });

  // Fokus liegt auf „Ja"; der Browser löst den Knopf selbst aus (keydown → click).
  // Der Test bildet das nach: Enter auf einem Knopf wird NICHT abgefangen.
  const ereignis = taste(dom, 'Enter');
  assert.equal(ereignis.verhindert, false, 'Enter auf einem Knopf gehört dem Browser');
  klick(dom.ja);
  assert.equal(await antwort, true);

  // Liegt der Fokus außerhalb (Dialog selbst), bestätigt Enter.
  const zweite = dom.doc; // neuer Durchlauf
  const dialog2 = new Bestaetigung(zweite);
  const antwort2 = dialog2.frage({ titel: 'Nochmal?' });
  zweite.activeElement = zweite.getElementById('bestaetigung');
  const ereignis2 = taste({ doc: zweite }, 'Enter');
  assert.equal(ereignis2.verhindert, true);
  assert.equal(await antwort2, true);
});

test('Ohne Markup antwortet der Dialog still mit Nein', async () => {
  const leer = { activeElement: null, getElementById: () => null, addEventListener: () => {}, contains: () => true };
  const dialog = new Bestaetigung(leer);
  assert.equal(dialog.istOffen, false);
  assert.equal(await dialog.frage({ titel: 'Match verlassen?' }), false,
    'eine Frage, die sich nicht zeigen kann, darf keine Partie beenden');
});

test('Das Markup ist ein echter, zugänglicher Dialog', () => {
  const block = html.match(/<div id="bestaetigung"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(block, 'der Dialog fehlt in index.html');
  assert.match(block[0], /role="alertdialog"/, 'eine Frage, die eine Antwort verlangt, ist ein alertdialog');
  assert.match(block[0], /aria-modal="true"/);
  assert.match(block[0], /aria-labelledby="bestaetigung-titel"/);
  assert.match(block[0], /aria-describedby="bestaetigung-text"/);
  assert.match(block[0], /id="bestaetigung-ja"[^>]*type="button"/);
  assert.match(block[0], /id="bestaetigung-nein"[^>]*type="button"/);
  assert.match(block[0], /\shidden(\s|>)/, 'der Dialog ist beim Laden versteckt');
});

test('Kein confirm mehr im Client — beide Wege nutzen den Dialog', () => {
  const code = ohneKommentare(main);
  assert.doesNotMatch(code, /globalThis\.confirm\(|window\.confirm\(/,
    'confirm blockiert den Frame-Loop und darf nicht mehr gerufen werden');
  const abort = code.match(/abortMatch\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(abort, 'abortMatch wurde nicht gefunden');
  assert.match(abort[1], /await this\.bestaetigung\.frage\(/, 'der Abbruch muss den Dialog fragen');
  const aufgeben = code.match(/gibAuf\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(aufgeben, 'gibAuf wurde nicht gefunden');
  assert.match(aufgeben[1], /await this\.bestaetigung\.frage\(/, 'das Aufgeben muss den Dialog fragen');
});
