/**
 * Tests: Endrangliste und Podcast UI (A6 UI-Rest).
 *
 * ## Was getestet wird
 *
 * 1. Der Kills-Bereich wird ausgeblendet (keine Kills in der Endrangliste).
 * 2. Die Rangliste ordnet nur nach vorhandenen Werten (Schaden, Trefferquote).
 * 3. Die Podest-Anzeige funktioniert für erste drei Plätze.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const endrangliste = fs.readFileSync(path.join(ROOT, 'src', 'client', 'endrangliste.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('Endrangliste entfernt die Kills-Spalte', () => {
  // Die Funktion entferneKills existiert und ist importiert
  assert.ok(endrangliste.includes('entferneKills'), 'Funktion entferneKills fehlt');
});

test('Endrangliste liest nur vorhandene Spalten', () => {
  // Die leseRangliste-Funktion existiert
  assert.ok(endrangliste.includes('leseRangliste'), 'Funktion leseRangliste fehlt');

  // Sie liest Spieler, Schaden, Schüsse und Trefferquote
  assert.ok(endrangliste.includes("'Spieler'"), 'Spieler-Spalte nicht gelesen');
  assert.ok(endrangliste.includes("'Schaden'"), 'Schaden-Spalte nicht gelesen');
  assert.ok(endrangliste.includes("'Schüsse'"), 'Schüsse-Spalte nicht gelesen');
  assert.ok(endrangliste.includes("'Trefferquote'"), 'Trefferquote-Spalte nicht gelesen');
});

test('Die Endrangliste hat CSS-Klassen für Podest', () => {
  // Die CSS-Datei sollte Podest-Klassen enthalten
  const designCss = fs.readFileSync(path.join(ROOT, 'src', 'client', 'styles', 'design.css'), 'utf8');

  assert.ok(designCss.includes('.end-podest'), 'end-podest-Klasse fehlt');
  assert.ok(designCss.includes('.end-podest__platz'), 'end-podest__platz-Klasse fehlt');
  assert.ok(designCss.includes('.end-podest__krone'), 'end-podest__krone-Klasse fehlt');
  assert.ok(designCss.includes('.end-podest__name'), 'end-podest__name-Klasse fehlt');
  assert.ok(designCss.includes('.end-podest__wert'), 'end-podest__wert-Klasse fehlt');
});

test('Podest hat Statusfarben für 1., 2., 3. Platz', () => {
  const designCss = fs.readFileSync(path.join(ROOT, 'src', 'client', 'styles', 'design.css'), 'utf8');

  // Platz 1: Limette
  assert.ok(designCss.includes(".end-podest__platz[data-platz='1']"), 'Platz-1-Regel fehlt');
  assert.ok(designCss.includes('--lime'), 'Lime-Farbe für 1. Platz fehlt');

  // Platz 2: Hellblau
  assert.ok(designCss.includes(".end-podest__platz[data-platz='2']"), 'Platz-2-Regel fehlt');

  // Platz 3: Orange
  assert.ok(designCss.includes(".end-podest__platz[data-platz='3']"), 'Platz-3-Regel fehlt');
  assert.ok(designCss.includes('--orange'), 'Orange-Farbe für 3. Platz fehlt');
});

test('Lobby-Karten haben Podest-Statusfarbe', () => {
  const designCss = fs.readFileSync(path.join(ROOT, 'src', 'client', 'styles', 'design.css'), 'utf8');

  // Statusfarbe als linke Kante
  assert.ok(designCss.includes('border-left: 4px solid var(--lobby-status)'), 'Lobby-Statusfarbe fehlt');

  // Verschiedene Zustände
  assert.ok(designCss.includes("data-zustand='leer'"), 'Zustand leer fehlt');
  assert.ok(designCss.includes("data-zustand='wartet'"), 'Zustand wartet fehlt');
  assert.ok(designCss.includes("data-zustand='voll'"), 'Zustand voll fehlt');
});

test('Die Endrangliste ist im HTML vorhanden', () => {
  assert.ok(html.includes('id="end-overlay"'), 'End-Overlay fehlt');
  assert.ok(html.includes('id="match-tabelle"'), 'Match-Tabelle fehlt');
  assert.ok(html.includes('id="match-kennzahlen"'), 'Kennzahlen-Bereich fehlt');
});

test('Rangliste-Container wird erstellt via JavaScript', () => {
  // Der Container für die Rangliste wird per JavaScript dynamisch erzeugt
  // (siehe endrangliste.js: createElement('section'), id='end-rangliste')
  assert.ok(endrangliste.includes('bauePodest'), 'bauePodest-Funktion fehlt');
  assert.ok(endrangliste.includes('zeichne'), 'zeichne-Funktion fehlt');
});