/**
 * Tests: Identität und Ablageort des Fortschritts.
 *
 * ## Der Befund
 *
 * Profil, Erfolge und Statistik liegen im **`localStorage` des Browsers**
 * (`main.js`, `PROFIL_SCHLUESSEL`). Ein anderer Rechner, ein anderer Browser
 * oder ein gelöschter Cache bedeutet den Verlust aller Erfolge — und der
 * Spieler erfährt es erst, wenn es zu spät ist.
 *
 * ## Was hier geprüft wird
 *
 * Konten und Anmeldung sind eine Produkt- und Datenschutzentscheidung; sie ist
 * **nicht** gefallen und wird hier nicht vorweggenommen. Diese Tests halten
 * fest, was stattdessen gilt:
 *
 *   1. Es gibt **eine** Quelle für den Ablageschlüssel (nicht zwei).
 *   2. Die Geräte-Kennung ist zufällig und ohne Personenbezug.
 *   3. Der Hinweis nennt dem Spieler, wo sein Fortschritt liegt.
 *   4. Die offene Entscheidung ist im Code als offen markiert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ABLAGEORTE, AKTUELLER_ABLAGEORT,
  erzeugeKennung, geraeteKennung, ablageHinweis,
} from '../src/shared/identity.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Ein `localStorage`-Ersatz im Speicher. */
function speicherAttrappe() {
  const karte = new Map();
  return {
    getItem: k => (karte.has(k) ? karte.get(k) : null),
    setItem: (k, v) => { karte.set(k, String(v)); },
    removeItem: k => { karte.delete(k); },
    get groesse() { return karte.size; },
  };
}

test('Der Ablageschlüssel steht an genau EINER Stelle', () => {
  /*
   * Er stand vorher als lokale Konstante im Client. Zwei Definitionen laufen
   * irgendwann auseinander — und dann findet ein Spieler sein Profil nicht mehr.
   */
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.doesNotMatch(code, /const PROFIL_SCHLUESSEL\s*=/,
    'Der Client definiert den Schlüssel wieder selbst — er gehört nach '
    + 'shared/identity.js');

  assert.match(main, /import\s*\{[^}]*PROFIL_SCHLUESSEL[^}]*\}\s*from\s*'\.\.\/shared\/identity\.js'/,
    'Der Client muss den Schlüssel importieren');
});

test('Die Geräte-Kennung ist zufällig und lang genug', () => {
  /*
   * Sie ist die Grundlage dafür, denselben Browser wiederzuerkennen. Eine
   * kurze oder vorhersagbare Kennung hätte zur Folge, dass zwei Spieler auf
   * demselben Profil landen.
   */
  const a = erzeugeKennung();
  const b = erzeugeKennung();

  assert.equal(typeof a, 'string');
  assert.equal(a.length, 32, `Die Kennung ist ${a.length} Zeichen lang, erwartet 32`);
  assert.match(a, /^[0-9a-f]{32}$/, 'die Kennung muss aus Hexziffern bestehen');
  assert.notEqual(a, b, 'zwei Kennungen dürfen nicht gleich sein');
});

test('Die Kennung enthält keinen Personenbezug', () => {
  /*
   * Die datenschutzfreundliche Zusage. Eine Kennung, die aus Zeitstempel,
   * Browserkennung oder Adresse abgeleitet wäre, wäre ein personenbezogenes
   * Datum — und das ist eine andere Entscheidung als die, die gefallen ist.
   */
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'identity.js'), 'utf8');
  const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.doesNotMatch(code, /navigator\.userAgent|Date\.now|new Date\(/,
    'Die Kennung darf NICHT aus Browserkennung oder Zeit abgeleitet werden');
  assert.match(code, /getRandomValues/,
    'Die Kennung muss aus einer echten Zufallsquelle kommen');
});

test('Die Kennung wird einmal erzeugt und bleibt', () => {
  /*
   * Der Sinn: Derselbe Browser erkennt sich wieder. Eine Kennung, die bei jedem
   * Aufruf neu entstünde, wäre nutzlos.
   */
  const speicher = speicherAttrappe();

  const erste = geraeteKennung(speicher);
  assert.ok(erste, 'beim ersten Aufruf muss eine Kennung entstehen');

  const zweite = geraeteKennung(speicher);
  assert.equal(zweite, erste, 'beim zweiten Aufruf muss dieselbe kommen');
  assert.equal(speicher.groesse, 1, 'es darf nur ein Eintrag entstehen');
});

test('Ohne Speicher arbeitet das Spiel weiter', () => {
  /*
   * Der Privatmodus und gesperrte Speicher sind reale Fälle. Ein Absturz dort
   * wäre schlimmer als ein fehlendes Profil.
   */
  assert.equal(geraeteKennung(null), null);
  assert.equal(geraeteKennung(undefined), null);

  // Ein Speicher, der wirft.
  const kaputt = {
    getItem: () => { throw new Error('gesperrt'); },
    setItem: () => { throw new Error('gesperrt'); },
  };
  assert.equal(geraeteKennung(kaputt), null,
    'ein werfender Speicher darf nicht durchschlagen');
});

test('Der Hinweis nennt dem Spieler, wo sein Fortschritt liegt', () => {
  /*
   * Der Kern der Behebung: Ohne diesen Hinweis erfährt der Spieler erst beim
   * Browserwechsel, dass alles weg ist.
   */
  const hinweis = ablageHinweis();

  assert.equal(hinweis.ort, AKTUELLER_ABLAGEORT);
  assert.match(hinweis.text, /Browser/,
    'der Hinweis muss den Ablageort nennen');
  assert.ok(hinweis.hinweis, 'bei lokaler Ablage braucht es den Warnhinweis');
  assert.match(hinweis.hinweis, /verloren|von vorn|gelöschter Cache/i,
    'der Hinweis muss die Folge nennen');
});

test('Der Hinweis steht auch im Menü', () => {
  /*
   * Ein Hinweis, den niemand sieht, ist keiner. Geprüft wird die Verdrahtung.
   */
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  assert.match(main, /ablageHinweis\(\)/,
    'der Ablage-Hinweis wird im Client nicht benutzt');
  assert.match(main, /profil-hinweis/,
    'das Element für den Hinweis fehlt');
});

test('Die offene Entscheidung ist als offen markiert', () => {
  /*
   * Wichtig für die Nachvollziehbarkeit: Der Ablageort ist eine OFFENE
   * Entscheidung, kein vergessener Zustand. Wer den Code liest, soll das
   * sehen — sonst hält er den lokalen Weg für eine bewusste Endentscheidung.
   */
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'identity.js'), 'utf8');

  assert.ok(Object.isFrozen(ABLAGEORTE), 'die Ablageorte müssen eingefroren sein');
  assert.ok(ABLAGEORTE.SERVER_KONTO, 'der Ort "Server mit Konto" muss vorgesehen sein');
  assert.ok(ABLAGEORTE.SERVER_GERAET, 'der Ort "Server, dem Gerät zugeordnet" ebenfalls');

  assert.match(quelle, /Entscheidung/,
    'die Datei muss die offene Entscheidung benennen');
  assert.match(quelle, /Datenschutz|personenbezogen/,
    'und den Datenschutz-Aspekt');
});

test('Die Konfiguration reicht die Kennung an das Profil weiter', () => {
  /*
   * Der Andockpunkt für die spätere Server-Ablage: Die Kennung muss beim
   * Speichern mitgeschrieben werden, sonst müsste sie nachträglich in jedes
   * bestehende Profil eingesetzt werden.
   */
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.match(code, /geraeteKennung\(\)/,
    'die Geräte-Kennung wird beim Speichern nicht mitgeschrieben');
  assert.match(code, /geraet:/,
    'das Feld `geraet` fehlt in der gespeicherten Nutzlast');
});
