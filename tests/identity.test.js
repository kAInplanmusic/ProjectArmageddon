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
  SICHERUNG_FORMAT, SICHERUNG_VERSION,
  erzeugeKennung, geraeteKennung, ablageHinweis,
  erstelleSicherung, sicherungAlsText, pruefeSicherung, sicherungAusText,
} from '../src/shared/identity.js';
import { PlayerProfile } from '../src/shared/stats.js';

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

// ------------------------------------------------------- Profilsicherung

/**
 * Die ENTSCHEIDUNG vom 2026-09-20: keine Serverkonten, dafür eine Datei.
 *
 * Der reale Schaden war „ein gelöschter Cache bedeutet den Verlust aller
 * Erfolge". Eine Datei löst genau den, ohne personenbezogene Daten zu erheben,
 * ohne Anmeldung und ohne Speicherfrist. Diese Tests prüfen die Datei so streng
 * wie eine Schnittstelle: Was hereinkommt, ist Fremddaten.
 */

/** Ein vollständiges Profil, wie `toJSON()` es liefert. */
function beispielProfil() {
  return {
    name: 'Anna',
    fraktion: 'pirates',
    partien: 12,
    siege: 7,
    niederlagen: 5,
    serie: 2,
    serieRekord: 3,
    schuesse: 210,
    treffer: 88,
    schaden: 1400,
    absorbierterSchaden: 90,
    zuege: 210,
    spielzeitSekunden: 5400,
    waffen: { pa_001: 40, pa_028: 5 },
    fraktionen: { pirates: 12 },
    erfolge: ['muster_siege_10', 'muster_erster_schuss'],
  };
}

test('Eine Sicherung überlebt den Weg hin und zurück', () => {
  const profil = beispielProfil();
  const text = sicherungAlsText(profil, { erstelltAm: '2026-09-20T10:00:00.000Z' });

  const geprueft = sicherungAusText(text);
  assert.equal(geprueft.ok, true, geprueft.fehler);
  // Die Erfolge kommen SORTIERT zurück — Absicht: Gleicher Inhalt soll gleich
  // aussehen, sonst hinge die Datei an der Einfügereihenfolge.
  assert.deepEqual(geprueft.profil, { ...profil, erfolge: [...profil.erfolge].sort() });
  assert.deepEqual([...profil.erfolge].sort(), geprueft.profil.erfolge);

  // Und der Inhalt ergibt ein gültiges Profil.
  const wiederhergestellt = PlayerProfile.fromJSON(geprueft.profil);
  assert.equal(wiederhergestellt.partien, 12);
  assert.equal(wiederhergestellt.schaden, 1400);
  assert.equal(wiederhergestellt.erfolge.has('muster_siege_10'), true);
  assert.deepEqual([...wiederhergestellt.erfolge].sort(), [...profil.erfolge].sort());
});

test('Eine Sicherung trägt die Geräte-Kennung NICHT', () => {
  /*
   * Die Kennung ist ein pseudonymes Merkmal des Browsers. In einer Datei, die
   * weitergereicht wird, hätte sie nichts zu suchen — sie würde beim Laden nur
   * zwei Geräte zusammenführen, die niemand zusammenführen wollte.
   */
  const sicherung = erstelleSicherung(beispielProfil());
  assert.equal('geraet' in sicherung, false, 'die Sicherung trägt ein Gerätefeld');
  assert.equal('geraet' in sicherung.profil, false, 'das Profil trägt ein Gerätefeld');
  assert.doesNotMatch(JSON.stringify(sicherung), /geraet/,
    'irgendwo in der Sicherung steht ein Gerätefeld');
});

test('Fremde Dateien werden abgelehnt, nicht halb übernommen', () => {
  /*
   * Der wichtigste Test dieser Gruppe: Die Prüfung darf NICHT tolerant sein.
   * `PlayerProfile` ist es (fehlende Felder bekommen Vorgaben) — eine Datei mit
   * `waffen: "abc"` ergäbe dort still ein Profil mit drei Waffen namens „0",
   * „1", „2". Genau solche Daten kommen über einen Datei-Upload herein.
   */
  const faelle = [
    [{}, /keine ProjectArmageddon-Sicherung/],
    [{ format: 'irgendwas', version: 1, profil: {} }, /keine ProjectArmageddon-Sicherung/],
    [{ format: SICHERUNG_FORMAT, version: 0, profil: {} }, /keine gültige Version/],
    [{ format: SICHERUNG_FORMAT, version: SICHERUNG_VERSION + 1, profil: {} }, /neueren Fassung/],
    [{ format: SICHERUNG_FORMAT, version: SICHERUNG_VERSION }, /kein Profil/],
    [{ format: SICHERUNG_FORMAT, version: SICHERUNG_VERSION, profil: [] }, /kein Profil/],
  ];
  for (const [daten, erwartet] of faelle) {
    const geprueft = pruefeSicherung(daten);
    assert.equal(geprueft.ok, false, `akzeptiert: ${JSON.stringify(daten)}`);
    assert.match(geprueft.fehler, erwartet);
  }

  // Falsche Typen INNERHALB des Profils.
  const typfehler = [
    ['partien', 'viele'],
    ['schaden', Number.NaN],
    ['name', 42],
    ['waffen', 'abc'],
    ['waffen', { pa_001: 'viel' }],
    ['fraktionen', 7],
    ['erfolge', 'muster_siege_10'],
    ['erfolge', [1, 2]],
  ];
  for (const [feld, wert] of typfehler) {
    const geprueft = pruefeSicherung({
      format: SICHERUNG_FORMAT,
      version: SICHERUNG_VERSION,
      profil: { ...beispielProfil(), [feld]: wert },
    });
    assert.equal(geprueft.ok, false, `${feld}=${JSON.stringify(wert)} wurde akzeptiert`);
  }

  // Und: Die Prüfung nimmt nur BEKANNTE Felder an — nichts wird durchgereicht.
  const mitFremdfeld = pruefeSicherung({
    format: SICHERUNG_FORMAT,
    version: SICHERUNG_VERSION,
    profil: { ...beispielProfil(), schuld: 999, __proto__: { boese: true } },
  });
  assert.equal(mitFremdfeld.ok, true);
  assert.equal('schuld' in mitFremdfeld.profil, false, 'ein fremdes Feld wurde übernommen');
});

test('Kein gültiges JSON ist kein Absturz', () => {
  const geprueft = sicherungAusText('{ das ist kein JSON');
  assert.equal(geprueft.ok, false);
  assert.match(geprueft.fehler, /kein gültiges JSON/);
  assert.equal(geprueft.profil, null);
});

test('Der Hinweis nennt dem Spieler den Weg mit — nicht nur den Verlust', () => {
  /*
   * Die alte Fassung nannte nur die Gefahr („ein gelöschter Cache bedeutet
   * Verlust"). Seit es die Sicherung gibt, muss der Hinweis auch sagen, WIE man
   * sie nutzt — sonst kennt der Spieler die Knöpfe nicht.
   */
  const hinweis = ablageHinweis();
  assert.equal(hinweis.ort, AKTUELLER_ABLAGEORT);
  assert.match(hinweis.hinweis, /sichern/i);
  assert.match(hinweis.hinweis, /laden/i);
});

test('Die Sicherung ersetzt kein Konto — der Konto-Ablageort bleibt unbenutzt', () => {
  /*
   * Eine Entscheidung ist nur dann eine, wenn sie im Code sichtbar bleibt:
   * `SERVER_KONTO` existiert als Möglichkeit, ist aber nicht aktiv, und die
   * Begründung steht bei der Sicherung.
   */
  assert.notEqual(AKTUELLER_ABLAGEORT, ABLAGEORTE.SERVER_KONTO);
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'identity.js'), 'utf8');
  assert.match(quelle, /keine Serverkonten/);
});
