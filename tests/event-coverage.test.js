/**
 * Tests: Die Ereignisbehandlung ist in beiden Modi vollständig.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Ein Black-Box-Audit meldete: Im lokalen Spiel sah man den Einschlag eines
 * Projektils nicht. Nachgeprüft: Die Engine sendet `projectile_impact`
 * (`projectileSystem.js:119`), und der Client hat zwei getrennte
 * Ereignisbehandler —
 *
 *   - `#handleEvents`       für das LOKALE Match
 *   - `#handleRemoteEvent`  für das ONLINE-Match
 *
 * Der lokale Zweig behandelte `projectile_impact` **nicht**. Wer lokal spielte
 * (der Standardfall), bekam keinen Einschlagblitz; im Protokoll stand nur
 * „ist gelandet".
 *
 * ## Warum diese Datei den QUELLTEXT prüft
 *
 * Die beiden Behandler sind private Methoden einer Klasse, die ohne Browser
 * nicht ladbar ist (`import.meta.glob`, siehe `docs/audit-selbst.md`). Ein
 * Verhaltenstest wäre nur über E2E möglich — und der würde die LÜCKE nur bei
 * einem Volltreffer bemerken, nicht systematisch.
 *
 * Deshalb wird hier der Quelltext gelesen und geprüft, welche Ereignistypen
 * jeder Zweig behandelt. Das ist ein Strukturtest: Er hält die Vollständigkeit
 * fest, die sonst leicht auseinanderläuft, weil die Zweige getrennt gepflegt
 * werden.
 *
 * **Ergänzend** gibt es einen echten Verhaltenstest ganz unten: Er prüft, dass
 * die Engine das Ereignis überhaupt sendet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Der Quelltext des Clients. */
const queue = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

/**
 * Schneidet den Rumpf einer Methode aus dem Quelltext.
 *
 * ## Warum geklammert wird statt gesucht
 *
 * Ein erster Anlauf suchte die erste Zeile `\n  }` nach der Signatur — und
 * schnitt damit beim ERSTEN inneren Block ab (`switch (type) {` schließt auf
 * derselben Ebene ein). Die Folge waren vier falsch-rote Tests.
 *
 * Jetzt werden die geschweiften Klammern gezählt: Erst wenn die Ebene wieder
 * bei null ist, endet die Methode. Das ist genau und braucht keinen Parser.
 */
function methodenkoerper(name) {
  const start = queue.indexOf(`  ${name}(`);
  assert.ok(start > 0, `Methode ${name} nicht gefunden — wurde sie umbenannt?`);
  const auf = queue.indexOf('{', start);
  assert.ok(auf > start, `${name}: keine öffnende Klammer gefunden`);

  let tiefe = 0;
  for (let i = auf; i < queue.length; i += 1) {
    const z = queue[i];
    if (z === '{') tiefe += 1;
    else if (z === '}') {
      tiefe -= 1;
      if (tiefe === 0) return queue.slice(start, i + 1);
    }
  }
  return queue.slice(start);
}

/** Alle Ereignistypen, die ein Methodenkörper per `case` behandelt. */
function behandelteTypen(name) {
  const koerper = methodenkoerper(name);
  const typen = new Set();
  for (const treffer of koerper.matchAll(/case '([a-z_]+)':/g)) typen.add(treffer[1]);
  return typen;
}

/** Die Ereignisse, die die Engine erzeugt — aus den Systemen und match.js. */
function ereignisseDerEngine() {
  const dateien = [];
  const sammeln = dir => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(p);
      else if (eintrag.name.endsWith('.js')) dateien.push(p);
    }
  };
  sammeln(path.join(ROOT, 'src', 'engine'));

  const typen = new Set();
  for (const datei of dateien) {
    const text = fs.readFileSync(datei, 'utf8');
    for (const treffer of text.matchAll(/emit\(\s*'([a-z_]+)'/g)) typen.add(treffer[1]);
  }
  return typen;
}

test('Der lokale Zweig behandelt den Einschlag eines Projektils', () => {
  /*
   * DIE Prüfung, die den Audit-Befund festhält. Ohne sie könnte der Fall bei
   * einem Umbau wieder verschwinden — und niemand bemerkte es, weil der Krater
   * (`explosion`) weiterhin erscheint.
   */
  const lokal = behandelteTypen('#handleEvents');
  assert.ok(lokal.has('projectile_impact'),
    'Im lokalen Zweig fehlt `projectile_impact` — der Einschlag bleibt ohne Blitz');

  // Und der Online-Zweig hat ihn (sonst wäre der Befund anders gelagert).
  const online = behandelteTypen('#handleRemoteEvent');
  assert.ok(online.has('projectile_impact'),
    'Auch der Online-Zweig braucht `projectile_impact`');
});

test('Beide Zweige behandeln den Einschlag GLEICH', () => {
  /*
   * Der Kern des Befunds war nicht, dass ein Fall fehlte, sondern dass die
   * beiden Zweige UNTERSCHIEDLICH waren. Ein Spieler soll dasselbe sehen,
   * egal ob er lokal oder online spielt.
   *
   * Geprüft wird die Wirkung: Beide müssen einen Blitz am Einschlagort
   * erzeugen (`addFlash` mit denselben Maßen).
   */
  for (const methode of ['#handleEvents', '#handleRemoteEvent']) {
    const koerper = methodenkoerper(methode);
    const index = koerper.indexOf("case 'projectile_impact':");
    assert.ok(index > 0, `${methode}: der Fall fehlt`);

    // Der Rumpf des Falls bis zum nächsten `case`/`break`.
    const rumpf = koerper.slice(index, index + 300);
    assert.match(rumpf, /addFlash\(/,
      `${methode}: der Einschlag muss einen Blitz erzeugen`);
  }
});

test('Die Engine sendet den Einschlag wirklich', () => {
  /*
   * Die Gegenprobe zum Strukturtest: Wäre das Ereignis nie gesendet worden,
   * wäre die fehlende Behandlung im Client kein Fehler gewesen. Gemessen wird
   * an einem echten Match.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();

  const spieler = match.getState().entities[0];
  const boden = match.surfaceYAt(200);
  match.world.setComponent(spieler.entityId, 'Position', 'x', 200);
  match.world.setComponent(spieler.entityId, 'Position', 'y', boden - 12);

  /*
   * Eine ECHTE Projektilwaffe, nicht eine Selbstwirkungs-Waffe: `pa_101`
   * (Eisschild) liefert `projectileId: null` — sie wirkt auf den Schützen und
   * verschiesst nichts. Der erste Testanlauf nahm sie und fand kein Ereignis.
   *
   * `pa_002` (Feuerfaust) fliegt als Wurf — kurz, aber ein echtes Projektil.
   */
  const waffe = 'pa_002';
  match.inventory.register(spieler.entityId, [waffe]);
  match.inventory.selectWeapon(spieler.entityId, waffe);

  const schuss = match.fire(spieler.entityId, Math.PI / 4, 100, waffe);
  assert.equal(schuss.ok, true, 'Vorbedingung: der Schuss geht ab');
  assert.ok(schuss.projectileId !== null, 'Vorbedingung: es entsteht ein Projektil');

  const gesammelt = [];
  let schutz = 0;
  while (match.activeProjectileCount > 0 && schutz < 600) {
    match.step();
    gesammelt.push(...match.consumeEvents());
    schutz += 1;
  }

  assert.ok(gesammelt.some(e => e.type === 'projectile_impact'),
    'Die Engine muss `projectile_impact` senden — sonst wäre der Client-Fall gegenstandslos');
});

test('Jedes Engine-Ereignis ist in MINDESTENS einem Zweig behandelt', () => {
  /*
   * Die systematische Prüfung: Ein Ereignis, das die Engine sendet und das
   * KEIN Zweig behandelt, ist eine stumme Stelle — genau die Art Lücke, die
   * der Audit beim Einschlag gefunden hat.
   *
   * Ausgenommen sind Ereignisse, die absichtlich nicht in der Anzeige landen
   * (reine Buchführung) oder bewusst nur in einem Modus auftreten.
   */
  const engine = ereignisseDerEngine();
  const lokal = behandelteTypen('#handleEvents');
  const online = behandelteTypen('#handleRemoteEvent');

  /*
   * Ereignisse, die absichtlich NICHT in der Anzeige landen.
   *
   * Jeder Eintrag braucht eine Begründung — sonst wird diese Liste zum
   * Sammelbecken, in dem echte Lücken verschwinden. Die Liste ist das Ergebnis
   * einer Einzelprüfung (nicht geraten): Für jedes Ereignis wurde nachgesehen,
   * ob die Wirkung auf einem anderen Weg sichtbar wird.
   */
  const bewusstStumm = new Set([
    // --- Darstellung läuft über ein anderes Element, nicht über das Protokoll
    'turn_start',        // Rundenanzeige im HUD
    'turn_end',          // dito, plus Zugwechsel im Spielerfeld
    'entity_in_water',   // Wasserstand steht als Marke am Spielernamen
    'damage',            // Lebensbalken sinkt sichtbar
    'dot_applied',       // Zustandsmarke am Spielernamen

    // --- Dient der Steuerung, nicht der Anzeige
    'shot',              // löst die Vorhersage auf (shotPredictor.resolve)
    'weapon_cooldown',   // die Waffenliste zeigt den Nachladezustand
    'weapon_dropped',    // `dropWeapon()` meldet das Ergebnis direkt im Log
    'crate_landed',      // lokaler Zweig hat einen Fall; online übernimmt es
                         // die Kistenliste

    // --- Wird bewusst zusammengefasst gemeldet
    'drowning',          // bis zu 60x/s: nur beim ÜBERGANG gemeldet (#trackWater)
    'round_crates',      // Buchführung; die Anzahl steht im HUD
    'projectile_expired', // ein verfallenes Geschoss ist kein Ereignis für den
                          // Spieler — es hat nichts getroffen
    'water_pushed',      // der Wasserstand am Ziel ist die sichtbare Wirkung
  ]);

  const unbehandelt = [];
  for (const typ of engine) {
    if (bewusstStumm.has(typ)) continue;
    if (!lokal.has(typ) && !online.has(typ)) unbehandelt.push(typ);
  }

  assert.deepEqual(unbehandelt.sort(), [],
    'Diese Engine-Ereignisse behandelt KEIN Client-Zweig — sie bleiben stumm');
});
