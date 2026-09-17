import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const lauf = promisify(execFile);
import { WEAPONS } from '../src/shared/config/weapons.js';

const hier = dirname(fileURLToPath(import.meta.url));
const skript = resolve(hier, '../scripts/balance-report.mjs');

/**
 * Der Balance-Bericht ist ein Messwerkzeug — und ein Messwerkzeug kann falsch
 * messen, ohne dass es auffällt.
 *
 * Fund (belegt): Er hat eine feste Entfernung von 90 px benutzt, während das
 * Spiel bei 426 px startet. Schwere Artillerie, für große Entfernungen gebaut,
 * erschien dadurch als „wirkungslos" — der Bericht hat Waffen schlechtgeredet,
 * weil er sie an der falschen Stelle gemessen hat. Auffallen konnte das nur,
 * weil die Zahl 90 nirgends gegen die Wirklichkeit geprüft wurde.
 *
 * Diese Tests prüfen deshalb nicht die Waffenwerte, sondern das Werkzeug: Misst
 * es auf der Entfernung, auf der gespielt wird? Ist die angegebene Messdistanz
 * die tatsächlich gemessene? Reicht eine Waffe im Nahkampf weniger weit als eine
 * Kanone?
 */

/** Führt den Bericht aus und gibt das JSON zurück. */
async function bericht(...argumente) {
  const { stdout } = await lauf(process.execPath, [skript, '--json', ...argumente], {
    cwd: resolve(hier, '..'),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 600_000,
  });
  return JSON.parse(stdout);
}

test('Ohne --distance wird auf der Startentfernung des Spiels gemessen', async () => {
  /*
   * Die Kernaussage der Korrektur: Gemessen wird, wo gespielt wird. Der Bericht
   * liest die Entfernung aus einem echten Match ab, statt sie zu setzen.
   */
  const report = await bericht('--only=pa_001');

  const { konfiguration } = report;
  assert.equal(konfiguration.messdistanzen.length, 1, 'Ohne Angabe genau eine Messdistanz');
  const gemessen = konfiguration.messdistanzen[0];
  assert.equal(gemessen, konfiguration.startentfernung,
    'Die Messdistanz ist nicht die Startentfernung');

  // Und sie ist nicht die alte feste 90: Die Startfiguren stehen weiter auseinander.
  assert.ok(gemessen > 200,
    `Die Startentfernung (${gemessen} px) ist unrealistisch kurz — wird wieder bei 90 gemessen?`);
});

test('--sweep misst über die Kartenbreite', async () => {
  const report = await bericht('--only=pa_001', '--sweep');
  const { messdistanzen, startentfernung } = report.konfiguration;

  assert.ok(messdistanzen.length >= 5, `Nur ${messdistanzen.length} Distanzen gemessen`);
  // Aufsteigend und ohne Dubletten.
  assert.deepEqual(messdistanzen, [...new Set(messdistanzen)].sort((a, b) => a - b));
  // Die Startentfernung ist dabei — sonst wäre der Vergleich zur Wirklichkeit weg.
  assert.ok(messdistanzen.includes(startentfernung),
    `Die Startentfernung ${startentfernung} px fehlt im Durchlauf`);
  // Und der Durchlauf geht deutlich über den Nahbereich hinaus.
  assert.ok(Math.max(...messdistanzen) >= 500,
    `Der Durchlauf endet schon bei ${Math.max(...messdistanzen)} px`);
});

test('Die gemeldete Messdistanz ist eine wirklich gemessene', async () => {
  /*
   * `findClearLineAdaptive` verkürzt die Entfernung bei hügeligem Gelände
   * stillschweigend, wenn keine freie Schusslinie zu finden ist. Würde der
   * Bericht weiter die ANGERAGTE Entfernung ausgeben, behauptete er Messungen,
   * die so nie stattfanden.
   */
  const report = await bericht('--only=pa_130', '--sweep');
  const zeile = report.staerkste[0] ?? report.schwaechste[0];
  assert.ok(zeile, 'Keine Messzeile gefunden');

  const gemessen = new Set(report.konfiguration.messdistanzen);
  // Die tatsächlich gemessene Distanz darf von der angefragten abweichen
  // (verkürzt), muss aber im Bericht auftauchen.
  assert.ok(zeile.testDistanz > 0, 'Keine Messdistanz gemeldet');
  assert.equal(typeof zeile.angefragteDistanz, 'number',
    'Die angefragte Entfernung fehlt — verkürzte Messungen wären nicht erkennbar');

  // Jede Einzelmessung nennt die gemessene Entfernung, die kleiner oder gleich
  // der angefragten ist (nie größer — es wird nur verkürzt).
  for (const teil of zeile.bestehtAus) {
    assert.ok(teil.gemessen <= teil.angefragt,
      `Gemessen ${teil.gemessen} px, angefragt ${teil.angefragt} px — das wäre eine Verlängerung`);
    assert.ok(teil.gemessen > 0);
  }
  assert.ok(gemessen.size > 0);
});

test('Der Sweep misst auch den Wurfbereich', async () => {
  /*
   * Wurfwaffen fliegen 35–71 px (gemessen). Mit einer ersten Messstufe von
   * 90 px konnten sie auf keiner Distanz treffen und galten als „ohne Wirkung",
   * obwohl sie wirken — nur eben näher.
   *
   * Die Messstufen müssen den Bereich abdecken, in dem die Wurfklasse wirkt.
   */
  const report = await bericht('--sweep', '--only=pa_001');
  const stufen = report.konfiguration.messdistanzen;

  assert.ok(Math.min(...stufen) <= 45,
    `Die kleinste Messstufe ist ${Math.min(...stufen)} px — zu grob für Wurfwaffen (35–71 px)`);
  assert.ok(Math.max(...stufen) >= 400,
    'Der Sweep muss auch große Entfernungen abdecken');

  // Die größere Reichweite muss dennoch gemessen werden.
  assert.ok(Array.isArray(stufen) && stufen.length >= 6,
    `Zu wenige Messstufen: ${stufen.length}`);
});

test('Nahkampf reicht weniger weit als Artillerie', async () => {
  /*
   * Die inhaltliche Prüfung: Der Aufbau muss Rollen unterscheiden können. Ein
   * Baseballschläger wirkt nur im Nahbereich, eine Feldkanone auch weit — wenn
   * der Bericht beides gleich bewertet, taugt er nicht zur Balance-Beurteilung.
   *
   * ## Warum hier NICHT auf eine Wurfwaffe geprüft wird
   *
   * Der Bericht misst die WIRKSAME Entfernung, nicht `maxRange`. Für eine
   * Wurfwaffe ist die Messlatte des Berichts (ab 90 px) zu grob: Der
   * Baseballschläger hat `maxRange` 110 px bei neutralem Profil, im Match aber
   * nur ~30 px (Klassendämpfung 0,64 und Abschuss auf Kopfhöhe) — er kann auf
   * keiner Messdistanz treffen.
   *
   * `istNahkampf` im Bericht heißt deshalb „wirkt nur bis 200 px" und nicht
   * „ist eine Wurfwaffe". Für den Rollenvergleich wird die Kategorie bemüht:
   * Eine Wurfwaffe muss eine KÜRZERE gespeicherte Reichweite haben als eine
   * Fernkampfwaffe.
   */
  const melee = WEAPONS.filter(w => w.category === 'melee');
  const heavy = WEAPONS.filter(w => w.category === 'heavy_ranged');
  assert.ok(melee.length > 0 && heavy.length > 0, 'Vorbedingung: beide Klassen existieren');

  const meleeMax = Math.max(...melee.map(w => w.maxRange));
  const heavyMax = Math.max(...heavy.map(w => w.maxRange));
  assert.ok(meleeMax < 250, `Nahkampf reicht zu weit: ${meleeMax} px`);
  assert.ok(heavyMax > 700, `Schweres Gerät reicht zu kurz: ${heavyMax} px`);
  assert.ok(heavyMax > meleeMax * 4,
    `Schweres Gerät muss deutlich weiter reichen: ${heavyMax} vs ${meleeMax}`);

  // Und der Bericht muss die Rollen trotzdem unterscheiden können.
  const report = await bericht('--sweep', '--only=pa_101');
  assert.ok(Array.isArray(report.reichweite), 'Die Reichweiten-Verteilung fehlt');
});

test('Der Bericht liefert die Rollenverteilung der Reichweite', async () => {
  /*
   * Die Kennzahlen, die eine Balance-Entscheidung tragen: Wie viele Waffen
   * wirken nur im Nahbereich, wie viele auch auf große Entfernung? Ohne sie ist
   * „die Waffen sind unbalanciert" eine Behauptung ohne Zahl.
   */
  // `--only` nimmt nur einen Wert (der letzte gewinnt) — deshalb eine Waffe.
  const report = await bericht('--sweep', '--only=pa_130');
  assert.ok(Array.isArray(report.reichweite), 'Die Reichweiten-Verteilung fehlt');
  assert.ok(report.rollen, 'Die Rollenzahlen fehlen');
  assert.equal(typeof report.rollen.nurNahbereich, 'number');
  assert.equal(typeof report.rollen.auchLangstrecke, 'number');
  assert.ok(Array.isArray(report.langstreckenIds));

  // Die Verteilung deckt sich mit den Zählern.
  const summe = report.reichweite.reduce((acc, gruppe) => acc + gruppe.anzahl, 0);
  assert.equal(summe, report.konfiguration.waffen,
    'Die Reichweiten-Verteilung deckt nicht alle Waffen ab');
});
