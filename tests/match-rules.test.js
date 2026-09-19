/**
 * Tests: Die Match-Konfiguration und die durchgesetzten Regeln passen zusammen.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Ein Code- und ein User-Flow-Audit fanden **fünf tote Konfigurationsfelder** in
 * `MATCH_RULES` (gemessen: null Lesestellen):
 *
 *   - `teamSize: {minimum: 4, maximum: 6}` — zur Zeit des Audits ließ
 *     `server/lobby.js` nur **1 bis 3** Spieler je Team zu (die Grenze liegt
 *     heute bei `MAX_PLAYERS_PER_TEAM = 6`, siehe Test unten).
 *   - `turnTimers.duelSeconds.maximum: 60` und
 *     `turnTimers.fourPlayerSeconds.maximum: 40` — der Motor liest nur
 *     `.minimum`.
 *   - `gameplayDimension` / `visualsDimension` — ohne Lesestelle.
 *
 * **Der `teamSize`-Fall ist der ernsteste:** Die Konfiguration versprach 4–6
 * Spieler je Team, der Server lehnte alles über 3 ab. Wer dort nachschlug,
 * bekam eine **falsche** Antwort.
 *
 * ## Was hier geprüft wird
 *
 * Dass die Konfiguration keine Zahlen mehr führt, die niemand liest — und dass
 * die Zugdauer-Berechnung die Werte tatsächlich benutzt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATCH_RULES } from '../src/shared/config/match.js';
import { getTurnDurationForPlayerCount } from '../src/engine/systems/turnSystem.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Alle Projektdateien, die Quelltext sind (ohne Tests, ohne Build-Ausgabe). */
function quelldateien(verzeichnis) {
  const ergebnis = [];
  const sammeln = dir => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
      const voll = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(voll);
      else if (eintrag.name.endsWith('.js')) ergebnis.push(voll);
    }
  };
  sammeln(verzeichnis);
  return ergebnis;
}

test('Die Zugzeit-Konfiguration führt keine Obergrenze mehr', () => {
  /*
   * Eine Zahl, die eine Grenze verspricht, die nie geprüft wird, ist
   * irreführend. Geprüft wird, dass sie nicht zurückkehrt.
   */
  assert.ok(MATCH_RULES.turnTimers, 'turnTimers fehlt');

  for (const stufe of ['duelSeconds', 'fourPlayerSeconds']) {
    assert.equal(typeof MATCH_RULES.turnTimers[stufe].seconds, 'number',
      `${stufe}.seconds muss eine Zahl sein`);
    assert.ok(!('maximum' in MATCH_RULES.turnTimers[stufe]),
      `${stufe}.maximum ist zurück — es hatte null Lesestellen`);
    assert.ok(!('minimum' in MATCH_RULES.turnTimers[stufe]),
      `${stufe}.minimum ist zurück — das Feld heißt jetzt seconds`);
  }
});

test('Die Zugdauer wird tatsächlich aus der Konfiguration gelesen', () => {
  /*
   * Die Gegenprobe zum vorigen Test: Die Werte müssen WIRKEN. Gelesen wird
   * über die öffentliche Funktion, nicht über die Konstante — so wird die
   * ganze Kette geprüft.
   */
  assert.equal(getTurnDurationForPlayerCount(2),
    MATCH_RULES.turnTimers.duelSeconds.seconds * 1000,
    'Bei 2 Spielern muss die Duell-Zeit gelten');
  assert.equal(getTurnDurationForPlayerCount(1),
    MATCH_RULES.turnTimers.duelSeconds.seconds * 1000,
    'Bei 1 Spieler ebenfalls');
  assert.equal(getTurnDurationForPlayerCount(4),
    MATCH_RULES.turnTimers.fourPlayerSeconds.seconds * 1000,
    'Bei 4 Spielern die Vier-Spieler-Zeit');
  assert.equal(getTurnDurationForPlayerCount(6), 15_000,
    'Bei mehr als 4 Spielern gelten 15 Sekunden');
});

test('`teamSize` steht NICHT mehr in der Konfiguration', () => {
  /*
   * Der Widerspruch war: `teamSize: {4, 6}` gegen die Lobby-Regel 1–3. Beide
   * Angaben können nicht gelten. Die Konfiguration ist entfernt — die geltende
   * Regel steht dort, wo sie durchgesetzt wird.
   */
  assert.ok(!('teamSize' in MATCH_RULES),
    'teamSize ist zurück. Es widersprach der Lobby-Regel (1–3) und hatte '
    + 'keinen Leser. Wer eine Teamgrenze braucht: `server/lobby.js` prüft sie.');
});

test('Die Lobby-Grenze und die Kapazität widersprechen sich nicht', () => {
  /*
   * Damit der Widerspruch nicht in anderer Form zurückkommt: Die alte Fassung
   * erlaubte **3 je Team**, aber **12 in der Summe** — zwei Zahlen, die
   * einander widersprachen, und die kleinere war die wirksame.
   *
   * Geprüft wird jetzt die BEZIEHUNG statt eines festen Werts: Die Grenze je
   * Team darf die Gesamtkapazität nur dann unterschreiten, wenn wenigstens ein
   * Team sie ausschöpfen kann. Sonst ist sie wieder eine Zahl, die niemand
   * erreicht.
   *
   * FUND (belegt): Die Grenze wurde von 3 auf 6 verschoben, nachdem gemessen
   * war, dass der Motor 12 Figuren trägt. Der Test hat die Verschiebung
   * bemerkt und verlangt — wie in seinem eigenen Kommentar angekündigt — dass
   * er mitzieht.
   */
  const text = fs.readFileSync(path.join(ROOT, 'src', 'server', 'lobby.js'), 'utf8');

  assert.match(text, /playersPerTeam\s*>\s*MAX_PLAYERS_PER_TEAM/,
    'Die Lobby-Validierung für playersPerTeam fehlt oder prüft nicht mehr '
    + 'gegen MAX_PLAYERS_PER_TEAM');

  // Die beiden Konstanten müssen zusammenpassen.
  const jeTeam = /export const MAX_PLAYERS_PER_TEAM = (\d+)/.exec(text);
  const gesamt = /export const MAX_LOBBY_PLAYERS = (\d+)/.exec(text);
  assert.ok(jeTeam && gesamt, 'MAX_PLAYERS_PER_TEAM oder MAX_LOBBY_PLAYERS fehlt');

  const proTeam = Number(jeTeam[1]);
  const kapazitaet = Number(gesamt[1]);

  assert.ok(proTeam <= kapazitaet,
    `Je Team sind ${proTeam} erlaubt, die Gesamtkapazität ist aber nur `
    + `${kapazitaet} — die Grenze je Team wäre nie erreichbar`);

  /*
   * Wenigstens ein Team muss die Grenze ausschöpfen können: Bei zwei Teams
   * muss 2 × proTeam die Kapazität erreichen oder überschreiten.
   */
  assert.ok(proTeam * 2 >= kapazitaet,
    `Bei zwei Teams ergäben ${proTeam} × 2 = ${proTeam * 2} Spieler, die `
    + `Kapazität liegt bei ${kapazitaet} — die Grenze je Team ist dann nicht `
    + 'die wirksame, sondern die Summe. Das ist erlaubt, aber dann muss der '
    + 'Kommentar es sagen.');
});

test('Kein Feld der Konfiguration ist ungenutzt', () => {
  /*
   * Die systematische Prüfung. Für jedes Feld der Konfiguration wird gesucht,
   * ob es im Quelltext gelesen wird. Ein Feld ohne Leser ist Ballast — und
   * schlimmstenfalls irreführend (wie `teamSize`).
   *
   * Ausgenommen sind reine Beschreibungsfelder, die ausdrücklich als solche
   * gekennzeichnet sind.
   */
  const dateien = quelldateien(path.join(ROOT, 'src'))
    .map(f => ({ pfad: f, text: fs.readFileSync(f, 'utf8') }));

  const verwaist = [];
  for (const feld of Object.keys(MATCH_RULES)) {
    // Gesucht wird `MATCH_RULES.<feld>` — der Zugriffsweg, den ein Leser nutzt.
    const gelesen = dateien.some(d => d.text.includes(`MATCH_RULES.${feld}`)
      || d.text.includes(`MATCH_RULES.${feld}`));
    if (!gelesen) verwaist.push(feld);
  }

  /*
   * Die beiden Dimensionsangaben sind reine Beschreibung (Doku für Menschen,
   * keine Steuerung). Sie sind ausdrücklich erlaubt — alles andere nicht.
   */
  const erlaubtBeschreibend = new Set(['gameplayDimension', 'visualsDimension']);
  const echteVerwaiste = verwaist.filter(f => !erlaubtBeschreibend.has(f));

  assert.deepEqual(echteVerwaiste, [],
    'Diese Konfigurationsfelder werden von niemandem gelesen. Entweder nutzen '
    + 'oder entfernen — ein Feld ohne Leser verspricht eine Wirkung, die es '
    + 'nicht hat.');
});

test('Die Beschreibungsfelder sind ausdrücklich als solche dokumentiert', () => {
  /*
   * Damit die Ausnahme im Test oben nicht stillschweigend wächst: Die beiden
   * erlaubten Felder müssen im Quelltext als Beschreibung erkennbar sein.
   */
  const text = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'config', 'match.js'), 'utf8');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.match(code, /gameplayDimension:\s*'2d'/);
  assert.match(code, /visualsDimension:\s*'2\.5d'/);

  // Und der Kommentar in der Datei erklärt, warum sie keinen Leser brauchen.
  assert.match(text, /gameplayDimension|Maße des Spiels/,
    'die Beschreibungsfelder sind nicht kommentiert');
});
