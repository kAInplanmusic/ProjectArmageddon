import assert from 'node:assert/strict';
import test from 'node:test';
import { isTextEntry } from '../src/client/dom.js';

/**
 * Der Helfer entscheidet, ob eine Taste ins Spiel oder in ein Formularfeld
 * gehört. Ein Fehler hier führt dazu, dass Tippen im Menü das Match steuert
 * (oder umgekehrt die Steuerung im Spiel blockiert wird) — deshalb wird die
 * Zuordnung breit abgedeckt.
 */

/** Baut ein minimales Element nach, wie es ein Tastaturereignis liefert. */
function fakeElement(tagName, { type, isContentEditable } = {}) {
  return { tagName, type, isContentEditable };
}

test('Texteingaben werden erkannt', () => {
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'text' })), true);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'number' })), true);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'search' })), true);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'email' })), true);
  assert.equal(isTextEntry(fakeElement('INPUT')), true, 'Ohne type gilt text');
  assert.equal(isTextEntry(fakeElement('TEXTAREA')), true);
  assert.equal(isTextEntry(fakeElement('SELECT')), true);
  assert.equal(isTextEntry(fakeElement('DIV', { isContentEditable: true })), true);
});

test('Knöpfe und Schalter gelten nicht als Texteingabe', () => {
  // Sonst würde die Leertaste auf einem fokussierten Button das Spiel nicht
  // mehr steuern, obwohl der Nutzer spielt.
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'button' })), false);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'submit' })), false);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'checkbox' })), false);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'radio' })), false);
  assert.equal(isTextEntry(fakeElement('INPUT', { type: 'range' })), false);
  assert.equal(isTextEntry(fakeElement('BUTTON')), false);
  assert.equal(isTextEntry(fakeElement('A')), false);
  assert.equal(isTextEntry(fakeElement('DIV')), false);
  assert.equal(isTextEntry(fakeElement('CANVAS')), false);
  assert.equal(isTextEntry(fakeElement('BODY')), false);
});

test('Unbrauchbare Ziele werden ohne Fehler behandelt', () => {
  // Tastaturereignisse können auf window oder document zielen.
  assert.equal(isTextEntry(null), false);
  assert.equal(isTextEntry(undefined), false);
  assert.equal(isTextEntry({}), false);
  assert.equal(isTextEntry('input'), false, 'Zeichenkette ist kein Element');
  assert.equal(isTextEntry(42), false);
  assert.equal(isTextEntry({ tagName: 99 }), false);
});

test('Groß- und Kleinschreibung des Tag-Namens ist egal', () => {
  assert.equal(isTextEntry(fakeElement('input', { type: 'text' })), true);
  assert.equal(isTextEntry(fakeElement('Input', { type: 'text' })), true);
  assert.equal(isTextEntry(fakeElement('textarea')), true);
});

test('isContentEditable gewinnt gegen den Tag-Namen', () => {
  // Ein bearbeitbares DIV verhält sich wie ein Textfeld.
  assert.equal(isTextEntry(fakeElement('DIV', { isContentEditable: true })), true);
  assert.equal(isTextEntry(fakeElement('DIV', { isContentEditable: false })), false);
});
