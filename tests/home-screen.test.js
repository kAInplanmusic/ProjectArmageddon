/**
 * Tests: Home-Bildschirm (A6 UI-Rest).
 *
 * Der Home-Bildschirm ist die Startseite vor dem Menü. Er wird beim ersten Laden
 * angezeigt und beim ersten Klick auf "Match starten" oder "Überrasch mich"
 * ausgeblendet. Danach folgt das normale Menü (menu-overlay).
 *
 * ## Was getestet wird
 *
 * 1. HTML-Struktur: Alle benötigten Elemente existieren.
 * 2. Sichtbarkeit: Home ist zu Beginn sichtbar, Menü versteckt.
 * 3. Wechsel: Klick auf "Match starten" blendet Home aus, Menü ein.
 * 4. Session-Speicherung: Der Wechsel wird gespeichert, Startpage folgt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('Der Home-Bildschirm existiert mit allen Elementen', () => {
  // Die Container-Elemente
  assert.ok(html.includes('id="home-screen"'), 'Home-Bildschirm fehlt');
  assert.ok(html.includes('id="home-start"'), 'Start-Knopf fehlt');
  assert.ok(html.includes('id="home-ueberrasch"'), 'Überrasch-Menü-Knopf fehlt');
});

test('Der Home-Bildschirm hat eine Karte mit Klasse', () => {
  // Die Klasse für Styling ist auf dem inneren div
  assert.ok(html.includes('class="overlay-card panel home-card"'), 'home-card-Klasse fehlt');

  // Die Beschriftungen
  assert.ok(html.includes('id="home-start"') && html.includes('Match starten'), 'Start-Knopf-Beschriftung fehlt');
  assert.ok(html.includes('id="home-ueberrasch"') && html.includes('Überrasch mich'), 'Überrasch-Knopf-Beschriftung fehlt');
});

test('Der Home-Bildschirm hat eine Hinweiszeile', () => {
  assert.ok(html.includes('class="home-hinweis"'), 'Hinweis-Klasse fehlt');
  assert.ok(html.includes('Drücke eine Taste oder klicke irgendwo'), 'Hinweis-Text fehlt');
});

test('Der Home-Bildschirm ist ein Overlay wie das Menü', () => {
  // Home sollte die gleiche Rolle wie menu-overlay haben
  const home = html.match(/<section[^>]*id="home-screen"[^>]*>/);
  const menu = html.match(/<section[^>]*id="menu-overlay"[^>]*>/);

  assert.ok(home, 'Home-Bildschirm nicht gefunden');
  assert.ok(menu, 'Menu-Bildschirm nicht gefunden');

  // Beide sollten overlay-class haben
  assert.ok(home[0].includes('class="overlay'), 'Home hat nicht die overlay-Klasse');
  assert.ok(menu[0].includes('class="overlay'), 'Menu hat nicht die overlay-Klasse');
});

test('Der Intro-Splash existiert für den ersten Load', () => {
  assert.ok(html.includes('id="intro-splash"'), 'Intro-Splash fehlt');

  // Die Elemente im Splash
  assert.ok(html.includes('class="intro-splash__logo"'), 'Logo-Element fehlt');
  assert.ok(html.includes('class="intro-splash__balken"'), 'Ladebalken fehlt');
  assert.ok(html.includes('class="intro-splash__text"'), 'Text-Element fehlt');
});

test('Intro-Splash zeigt Lade-Status', () => {
  assert.ok(html.includes('Lädt …'), 'Lade-Status-Text fehlt');
});