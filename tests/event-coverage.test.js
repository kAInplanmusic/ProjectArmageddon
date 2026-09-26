/**
 * Tests: Die Ereignisbehandlung ist in beiden Modi vollständig.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Ein Black-Box-Audit meldete: Im lokalen Spiel sah man den Einschlag eines
 * Projektils nicht. Nachgeprüft: Die Engine sendet `projectile_impact`
 * (`projectileSystem.js:119`), und der Client hatte zwei getrennte
 * Ereignisbehandler —
 *
 *   - `#handleEvents`       für das LOKALE Match
 *   - `#handleRemoteEvent`  für das ONLINE-Match
 *
 * Der lokale Zweig behandelte `projectile_impact` **nicht**. Wer lokal spielte
 * (der Standardfall), bekam keinen Einschlagblitz; im Protokoll stand nur
 * „ist gelandet".
 *
 * ## Wo diese Datei nachsieht
 *
 * Früher waren die beiden Zweige zwei `switch`-Blöcke in `src/client/main.js`,
 * und dieser Test las den Quelltext von `main.js` und sammelte die `case`-
 * Zweige ein (Strukturtest).
 *
 * Seit dem Umbau „Zerlegung Schritt 3“ gibt es diese Blöcke nicht mehr: Beide
 * Zweige schlagen in EINER Zuordnungstabelle nach — `EREIGNIS_WIRKUNGEN` in
 * `src/client/ereignisse.js`. `main.js` ist nur noch die Fassade, die
 * `verarbeiteLokal` / `verarbeiteOnline` weiterleitet.
 *
 * Die Fundstelle ist damit mit dem Code mitgewandert; die Prüfungen sind
 * dieselben geblieben. Sie lesen jetzt aber nicht mehr nach Mustern im
 * Quelltext, sondern **führen den Code aus**: Das Modul ist ohne Browser
 * ladbar (es hat keinen Besitzer und kennt die Klasse nicht, aus der es gerufen
 * wird — siehe dessen Kopfkommentar), also wird es importiert.
 *
 *    beide(fn)            → gilt in beiden Betriebsarten
 *    { lokal: fn, … }     → nur lokales Match
 *    { online: fn, … }    → nur Online-Betrieb
 *    { }                  → bewusst ohne Wirkung (siehe `bewusstStumm` unten)
 *
 * Ein Eintrag zählt für einen Zweig nur, wenn dort WIRKLICH eine Funktion
 * steht — ein leerer Eintrag ist keine Behandlung. Sollte das Modul je eine
 * Browser-Abhängigkeit bekommen, schlägt schon der Import fehl: auch das ist
 * ein Befund und kein stiller Durchlauf.
 *
 * **Ergänzend** gibt es einen echten Verhaltenstest ganz unten (an einem
 * Match) und einen, der die Wirkung des Einschlags in beiden Zweigen ausführt.
 *
 * **Nachtrag 2026-09-26:** Der Tiefen-Audit meldete 27 Ereignisse als
 * „undokumentiert stumm" (`docs/audit-tief.md`, Abschnitt 11). Einzeln geprüft
 * hatten ALLE 27 einen Zweig in der Tabelle — die Meldung entstand am LESER des
 * Werkzeugs (unquotierte Schlüssel, belegt in `AUDIT_LISTE_2026_09_26`). Statt
 * siebenundzwanzig Scheinbegründungen trägt diese Datei deshalb: die Namensliste
 * mit Fundstelle je Ereignis (dort), eine Prüfung gegen genau dieses
 * Auffangbecken, und eine Belegstelle für JEDES einzweigige Ereignis
 * (`EINZWEIG_BELEGT`) — dort stehen auch die zwei Stellen, an denen im anderen
 * Modus wirklich nichts sichtbar ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { EREIGNIS_WIRKUNGEN, verarbeiteLokal, verarbeiteOnline } from '../src/client/ereignisse.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/**
 * Die Ereignisarten, die jeder Betriebszweig behandelt — aus der Tabelle.
 *
 * Abgeleitet, nicht geraten (und nicht mehr aus dem Quelltext gesucht): Ein
 * Eintrag behandelt eine Ereignisart in einem Zweig genau dann, wenn dort eine
 * Funktion steht. `beide(fn)` setzt beide Felder — ein Eintrag, der in beiden
 * Zweigen gilt, steht damit in beiden Mengen, ohne dass es eine zweite Kopie
 * des Rumpfs gäbe, die auseinanderlaufen könnte.
 *
 * @returns {{lokal: Set<string>, online: Set<string>}} Behandelte Arten je Zweig
 */
function behandelteTypen() {
  const lokal = new Set();
  const online = new Set();
  for (const [typ, wirkung] of Object.entries(EREIGNIS_WIRKUNGEN)) {
    if (typeof wirkung?.lokal === 'function') lokal.add(typ);
    if (typeof wirkung?.online === 'function') online.add(typ);
  }
  return { lokal, online };
}

/**
 * Führt die Wirkung einer Ereignisart in BEIDEN Betriebsarten aus und zeichnet
 * auf, welche Blitze sie dabei am Renderer erzeugt.
 *
 * ## Warum ausgeführt statt gelesen wird
 *
 * Der alte Test suchte im Fallrumpf nach dem Muster `addFlash(`. Ein Muster
 * kann eine Wirkung nicht von einem Kommentar oder einem nie erreichten Zweig
 * unterscheiden. Hier werden die Einstiegspunkte der Tabelle gerufen —
 * dieselben, die `main.js` benutzt — und die Aufrufe am Renderer aufgezeichnet.
 *
 * @param {string} typ Die Ereignisart
 * @param {object} nutzlast Die Felder der Ereignis-/Servermeldung
 * @returns {{lokal: Array, online: Array}} Aufgezeichnete `addFlash`-Aufrufe
 */
function verarbeiteInBeidenZweigen(typ, nutzlast) {
  const aufrufe = [];
  const kontext = {
    renderer: { addFlash: (...args) => aufrufe.push(args) },
    hud: { log: () => {} },
    sound: null,
  };

  verarbeiteLokal(kontext, { type: typ, payload: nutzlast });
  const lokal = aufrufe.splice(0);
  // Der Server schickt die Felder flach neben der Art (`t`), nicht in `payload`.
  verarbeiteOnline(kontext, { t: typ, ...nutzlast });

  return { lokal, online: aufrufe.splice(0) };
}

/**
 * Die Ereignisse, die die Engine erzeugt — aus den Systemen und match.js.
 *
 * ## Zwei Meldewege, nicht einer
 *
 * Gesucht wird nach BEIDEN Wegen, auf denen die Engine Ereignisse meldet:
 * `emit('…')` (überall) und `melde('…')` (Günthers System, das den Melder als
 * `kontext.melde` bekommt — `guentherSystem.js:276` ff., verdrahtet in
 * `match.js:1301` auf dieselbe Ereignisliste). Nur `emit(` zu suchen hieß: vier
 * Ereignisarten waren für diesen Wächter unsichtbar — genau die Art stiller
 * Durchlauf, gegen die die Datei antritt.
 *
 * (Das Werkzeug `tools/audit-mcp` sucht weiterhin nur `emit(` — dort fehlen
 * dieselben vier Arten. Der Unterschied der Zahlen ist damit erklärt und nicht
 * ein zweiter Befund.)
 */
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
    for (const treffer of text.matchAll(/(?:emit|melde)\(\s*'([a-z_]+)'/g)) typen.add(treffer[1]);
  }
  return typen;
}

/**
 * Ereignisse, die absichtlich NICHT in der Anzeige landen.
 *
 * Jeder Eintrag braucht eine Begründung — sonst wird diese Liste zum
 * Sammelbecken, in dem echte Lücken verschwinden. Die Liste ist das Ergebnis
 * einer Einzelprüfung (nicht geraten): Für jedes Ereignis wurde nachgesehen,
 * ob die Wirkung auf einem anderen Weg sichtbar wird.
 *
 * Die Bedeutung ist ENG: „KEIN Client-Zweig behandelt dieses Ereignis; was der
 * Spieler davon sieht, entsteht über ein anderes Element." Ein Ereignis, das
 * `EREIGNIS_WIRKUNGEN` behandelt, gehört deshalb NICHT hierher — der Eintrag
 * wäre keine Dokumentation, sondern eine Falschaussage. Genau das verlangte die
 * Audit-Meldung vom 2026-09-26 für 27 Ereignisse; sie sind deshalb NICHT
 * eingetragen worden (siehe `AUDIT_LISTE_2026_09_26`).
 *
 * Der Stand steht seit dem 2026-09-26 hier auf Modulebene (vorher im Rumpf des
 * letzten Tests): Der Nachtrag zur Audit-Meldung und die Einzweig-Prüfung lesen
 * dieselbe Menge — eine zweite Kopie wäre die Sorte Doppelregel, die
 * auseinanderläuft.
 *
 * **Grenze dieses Belegs:** Die Fundstelle der „anderen Wirkung" steht je
 * Eintrag als Begründung hier — geprüft, aber nicht maschinell nachgerechnet.
 * Was maschinell prüfbar ist (Zweig vorhanden: ja/nein), prüfen die Tests
 * unten.
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

/**
 * Die 27 Ereignisse, die `docs/audit-tief.md` (Abschnitt 11) am 2026-09-26 als
 * „UNDOKUMENTIERT stumm" meldete — namentlich, mit Fundstelle, damit die
 * Meldung nachprüfbar ist.
 *
 * ## Einzelprüfung am 2026-09-26: die Meldung ist veraltet
 *
 * KEINES dieser 27 ist stumm. Jedes hat einen Zweig in `EREIGNIS_WIRKUNGEN`
 * (`src/client/ereignisse.js`); die Zeile hinter dem Namen ist der Schlüssel in
 * der Tabelle, die zweite Zeile die Stelle, an der die Wirkung entsteht. Der
 * Test unten hält beides fest: einen Zweig haben sie, und in `bewusstStumm`
 * dürfen sie nicht landen.
 *
 * ## Warum dasselbe Werkzeug trotzdem 27 meldet (belegt, nicht vermutet)
 *
 * `tools/audit-mcp/lib/statisch.mjs` → `ereignisAbdeckung()` hält ein Ereignis
 * für behandelt, wenn sein NAME als ZEICHENKETTE in `src/client/**` vorkommt
 * (`/['"]([a-z0-9_]{3,})['"]/`, dort Zeile 384–386). Die Tabelle benutzt aber
 * UNQUOTIERTE Schlüssel (`projectile_impact: beide(…)`) — diese Suche kann sie
 * nicht erfassen. Werkzeugsicht derselben Sitzung: 6 gedeckt / 10 dokumentiert /
 * 27 undokumentiert; wahre Sicht: 43 emittierte Arten, davon 33 in der Tabelle
 * behandelt und 10 bewusst stumm, 0 ohne beides.
 *
 * Die Meldung ist damit ein MESSFEHLER des Lesers, kein Zustand des Spiels. Wer
 * sie abstellen will, ändert den LESER (die Tabelle in die Zählung aufnehmen) —
 * nicht diese Liste: Ein Eintrag in `bewusstStumm` brächte hier keine Wirkung
 * (die Ereignisse sind behandelt) und würde zusätzlich behaupten, es gäbe
 * keinen Zweig.
 *
 * @type {string[]}
 */
const AUDIT_LISTE_2026_09_26 = [
  'crate_pickup',          // ereignisse.js:424 — lokal :433 (Protokollzeile je Beuteart)
  'crate_pickup_blocked',  // ereignisse.js:417 — lokal :420 („Vorrat voll …")
  'death',                 // ereignisse.js:479 — beide :482/:485
  'dot_tick',              // ereignisse.js:344 — beide :351
  'fall_damage',           // ereignisse.js:489 — lokal :491
  'frozen',                // ereignisse.js:336 — beide :337
  'fuse_armed',            // ereignisse.js:270 — beide :271 (Protokoll) + :272 (Blitz)
  'fuse_expired',          // ereignisse.js:275 — beide :276 + :277
  'jumped',                // ereignisse.js:399 — lokal :401
  'karte_unerreichbar',    // ereignisse.js:542 — nur online :544 (siehe unten, offen)
  'landed',                // ereignisse.js:405 — lokal :407
  'loot_error',            // ereignisse.js:253 — beide :254
  'maelstrom_contract',    // ereignisse.js:463 — beide :70/:71 (Kontraktion + Protokoll)
  'match_over',            // ereignisse.js:505 — lokal :513, online :517–:519
  'projectile_impact',     // ereignisse.js:225 — beide :226 (Blitz am Einschlagort)
  'projectile_pierced',    // ereignisse.js:236 — beide :237 (Blitz am Opfer)
  'projectile_spawn',      // ereignisse.js:202 — nur online :206 (Vorhersage auflösen)
  'pulled',                // ereignisse.js:369 — beide :370
  'round_start',           // ereignisse.js:495 — beide :496
  'shield_absorbed',       // ereignisse.js:360 — beide :363 (Blitz) und :66 (Meldung)
  'special_effect',        // ereignisse.js:331 — beide :333 → main.js:1431
  'terrain_destroyed',     // ereignisse.js:90  — nur online :92 (Krater)
  'toxic_rain',            // ereignisse.js:499 — lokal :501
  'turn_skipped',          // ereignisse.js:340 — beide :341
  'turret_deployed',       // ereignisse.js:289 — beide :291 + lokal :295
  'turret_expired',        // ereignisse.js:322 — beide :323
  'turret_fired',          // ereignisse.js:313 — lokal :315, online :318
];

/**
 * Der Beleg für Günthers vier Ereignisarten — sie sind außerhalb der 27
 * gemeldeten und nur hier gelandet, weil der Sammler jetzt auch `melde('…')`
 * liest (`melde` steht nirgends sonst im Motor: `guentherSystem.js`).
 *
 * Belegt ist:
 *   - der Streich läuft auch online — die NPCs stecken im Motor und laufen mit
 *     der Simulation (`src/server/gameServer.js:292`),
 *   - die Onlinesicht führt aber kein `guenther`-Feld (`src/client/main.js:1119`
 *     bis `:1143` — die Felder des Online-Zustands), und der Renderer zeichnet
 *     Günther und seine Haufen GENAU daraus (`src/client/renderer.js:1218`,
 *     `:1200`),
 *   - kein Zweig der vier Arten ist online vorhanden (`ereignisse.js:375` ff.).
 *
 * Sichtbar bleiben online nur die FOLGEN (Schaden → Lebensbalken,
 * `src/client/hud.js:247`; Beute → Bestand).
 *
 * NICHT gemessen: ob der Server Günther überhaupt würfeln lässt (`gameServer.js:292`
 * ist ein Kommentar, kein Messwert) und ob die Folgen in jedem Fall ankommen.
 * Deshalb steht bei den vier Einträgen `offen` und nicht `entweder`.
 */
const GUENTHER_ONLINE_OFFEN = 'Online fehlt Günthers DARSTELLUNG: die Onlinesicht führt kein `guenther`-Feld (src/client/main.js:1119–1143), der Renderer zeichnet Günther und seine Haufen daraus (src/client/renderer.js:1218, :1200), und keiner der vier Zweige ist online vorhanden (src/client/ereignisse.js:375 ff.). Sichtbar bleiben nur die Folgen (Schaden → src/client/hud.js:247). Ob der Server würfelt, ist NICHT gemessen.';

/**
 * Ereignisse, die nur EINEN der beiden Zweige haben — je Ereignis mit der
 * Fundstelle, an der ihre Wirkung im ANDEREN Modus sichtbar wird (oder mit der
 * Angabe, dass es dort keine gibt).
 *
 * ## Warum das eine eigene Prüfung braucht
 *
 * Der Server schickt JEDES Engine-Ereignis an alle Clients
 * (`src/server/gameServer.js:246–248`) — und das lokale Match erzeugt dieselben
 * Ereignisse wie das Online-Match (es ist derselbe Motor). Ein Ereignis mit nur
 * einem Zweig ist damit im anderen Modus STILL. Genau das war der Befund, aus
 * dem diese Datei entstand (`projectile_impact` fehlte lokal). „Nur ein Zweig"
 * ist also keine Kleinigkeit, sondern eine Entscheidung, die eine Fundstelle
 * braucht:
 *
 *   entweder: '…'  es gibt eine sichtbare Wirkung auf einem anderen Weg —
 *                  mit `datei.js:Zeile` (ein `entweder` ohne Fundstelle fällt um)
 *   offen:    '…'  es gibt KEINE — Grund und Befund, mit Fundstelle
 *
 * Genau EINES von beiden muss stehen. Und: die Menge der Einträge muss genau
 * die Menge der einzweigigen Tabelleneinträge sein — sonst fällt der Test um,
 * damit ein neuer halber Zweig nicht unbemerkt entsteht.
 */
const EINZWEIG_BELEGT = new Map([
  // --- nur lokal behandelt (im Online-Betrieb kommt das Ereignis an und fällt)
  ['crate_pickup', {
    zweig: 'lokal',
    entweder: 'online steht der Bestand in der Waffenliste: src/client/main.js:1000 (remoteLoadouts aus der LOADOUTS-Nachricht) → :1114 (inventory) → :1212 (#weaponIdsForActivePlayer)',
  }],
  ['crate_pickup_blocked', {
    zweig: 'lokal',
    offen: 'online kommt das Ereignis an (src/server/gameServer.js:246–248) und kein Zweig nimmt es; ein anderes Element zeigt die Ursache nicht — die Kiste bleibt liegen, die Waffenliste bleibt gleich. Die Meldung dazu gibt es nur lokal, src/client/ereignisse.js:420. BEFUND: online bleibt ein voller Vorrat ohne Rückmeldung.',
  }],
  ['fall_damage', {
    zweig: 'lokal',
    entweder: 'online sinkt der Lebensbalken: src/client/main.js:1103 (health aus dem Snapshot) → src/client/hud.js:216 (Balkenbreite) und :247 (Zahl)',
  }],
  ['jumped', {
    zweig: 'lokal',
    entweder: 'online ist der Sprung als Bewegung sichtbar: src/client/main.js:1077 (interpolierte Entities aus dem Snapshot) → src/client/renderer.js:1217 (#drawEntities)',
  }],
  ['landed', {
    zweig: 'lokal',
    entweder: 'wie `jumped` — die Landung ist die Bewegung der Figur: src/client/main.js:1077 → src/client/renderer.js:1217',
  }],
  ['toxic_rain', {
    zweig: 'lokal',
    entweder: 'online sinkt der Lebensbalken der Betroffenen: der Regen teilt echten Schaden aus (src/engine/systems/maelstromSystem.js:92 applyDamage) → src/client/main.js:1103 (health) → src/client/hud.js:247',
  }],
  ['crate_landed', {
    zweig: 'lokal',
    entweder: 'online kommen die Kisten aus dem Snapshot und werden gezeichnet: src/client/main.js:1143 (crates) → src/client/renderer.js:1201 (#drawCrates)',
  }],

  // --- Günthers Streiche (nur lokal behandelt, siehe GUENTHER_ONLINE_OFFEN)
  ['guenther_wheel', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
  ['guenther_pee', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
  ['guenther_poop', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
  ['guenther_poop_hit', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],

  // --- nur online behandelt (lokal kommt es aus einem anderen Weg)
  ['projectile_spawn', {
    zweig: 'online',
    entweder: 'lokal BRAUCHT es keinen Zweig: die Vorhersage gibt es dort nicht — src/client/main.js:1480–1481 (#startShotPrediction kehrt im lokalen Modus sofort zurück), gezeichnet wird sie nur online (:1961). Das Ereignis läuft lokal trotzdem (es kommt aus dem Motor, src/engine/shooting.js:325) und fällt in eine leere Stelle: Absicht, keine Lücke.',
  }],
  ['terrain_destroyed', {
    zweig: 'online',
    entweder: 'lokal entsteht derselbe Krater über `explosion`: src/client/ereignisse.js:105 (applyCrater) — ein zweiter Eintrag würde zweimal graben.',
  }],
  ['karte_unerreichbar', {
    zweig: 'online',
    offen: 'im lokalen Match läuft dieselbe Prüfung und sendet dasselbe Ereignis: src/engine/match.js:641 (Aufruf in `start()`) → `#pruefeErreichbarkeit` ab :684 → :742. Der lokale Zweig fehlt, und ein anderes Element zeigt es nicht: das Ergebnis landet nur in `match.erreichbarkeit` (src/engine/match.js:735), und außerhalb von match.js liest das niemand (einziger Leser im ganzen Projekt: tests/zugreihenfolge.test.js:144). BEFUND: wer lokal auf einer abgeschnittenen Karte spielt, erfährt es nicht.',
  }],
  ['turn_start', {
    zweig: 'online',
    entweder: 'lokal kommt der Status aus dem Motor, src/client/main.js:1039 (`this.match.getState()`), und die Rundenzahl zeigt das HUD, src/client/hud.js:92; der Online-Zweig setzt nur den Fernzustand (`setzeStatus`).',
  }],
]);

test('Der lokale Zweig behandelt den Einschlag eines Projekils', () => {
  /*
   * DIE Prüfung, die den Audit-Befund festhält. Ohne sie könnte der Fall bei
   * einem Umbau wieder verschwinden — und niemand bemerkte es, weil der Krater
   * (`explosion`) weiterhin erscheint.
   */
  const { lokal, online } = behandelteTypen();
  assert.ok(lokal.has('projectile_impact'),
    'Im lokalen Zweig fehlt `projectile_impact` — der Einschlag bleibt ohne Blitz');

  // Und der Online-Zweig hat ihn (sonst wäre der Befund anders gelagert).
  assert.ok(online.has('projectile_impact'),
    'Auch der Online-Zweig braucht `projectile_impact`');
});

test('Beide Zweige behandeln den Einschlag GLEICH', () => {
  /*
   * Der Kern des Befunds war nicht, dass ein Fall fehlte, sondern dass die
   * beiden Zweige UNTERSCHIEDLICH waren. Ein Spieler soll dasselbe sehen,
   * egal ob er lokal oder online spielt.
   *
   * Geprüft wird die Wirkung, nicht die Formulierung: Beide müssen einen Blitz
   * AM EINSCHLAGORT erzeugen (`addFlash`), und zwar mit denselben Maßen.
   * Genau das kann `beide(fn)` in der Tabelle garantieren — dieser Test hält es
   * fest, damit ein Auseinanderlaufen nicht durch einen Umbau zurückkommt.
   */
  const einschlag = { x: 123, y: 456 };
  const { lokal, online } = verarbeiteInBeidenZweigen('projectile_impact', einschlag);

  for (const [zweig, aufrufe] of [['lokal', lokal], ['online', online]]) {
    assert.ok(
      aufrufe.some(([x, y]) => x === einschlag.x && y === einschlag.y),
      `${zweig}: der Einschlag muss einen Blitz am Einschlagort erzeugen (addFlash)`,
    );
  }

  assert.deepEqual(lokal, online,
    'Beide Zweige müssen denselben Blitz erzeugen — gleicher Ort, gleiche Maße');
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
  const { lokal, online } = behandelteTypen();

  /*
   * Die Tabelle ist nur dann die Fundstelle der Ereignisbehandlung, wenn der
   * Client sie auch benutzt. Ohne diese Prüfung könnte dieser Test grün sein,
   * während `main.js` die Tabelle gar nicht mehr aufruft — er prüfte dann ein
   * Modul ohne Aufrufer.
   */
  const client = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  for (const name of ['verarbeiteLokal', 'verarbeiteOnline']) {
    assert.ok(client.includes(name),
      `main.js muss ${name} aus src/client/ereignisse.js benutzen`);
  }

  /*
   * Ereignisse, die absichtlich NICHT in der Anzeige landen: `bewusstStumm`.
   *
   * Die Liste steht seit dem 2026-09-26 auf Modulebene (oben bei den
   * Konstanten) — der Nachtrag zur Audit-Meldung und die Einzweig-Prüfung
   * lesen dieselbe Menge, und zwei Kopien wären genau die Doppelregel, die
   * auseinanderläuft. Inhalt, Bedeutung und die Begründung je Eintrag: siehe
   * dort.
   */

  const unbehandelt = [];
  for (const typ of engine) {
    if (bewusstStumm.has(typ)) continue;
    if (!lokal.has(typ) && !online.has(typ)) unbehandelt.push(typ);
  }

  assert.deepEqual(unbehandelt.sort(), [],
    'Diese Engine-Ereignisse behandelt KEIN Client-Zweig — sie bleiben stumm');
});

test('Die 27 Ereignisse der Audit-Meldung haben einen Zweig — und stehen NICHT in bewusstStumm', () => {
  /*
   * Hält den Nachtrag vom 2026-09-26 fest, doppelt: die gemeldeten Ereignisse
   * sind behandelt, UND sie sind nicht als „bewusst stumm" verbucht worden.
   *
   * Der zweite Teil ist der wichtigere. Die Audit-Meldung ließe sich auch
   * „abstellen", indem man die 27 Namen in `bewusstStumm` schreibt — dann wäre
   * sie grün und die Aussage der Liste falsch (dort bedeutet ein Eintrag: es
   * gibt KEINEN Zweig). Ein Wächter, der beides prüft, macht diesen Weg
   * unmöglich, ohne dass jemand die Absicht erraten muss.
   */
  assert.equal(AUDIT_LISTE_2026_09_26.length, 27,
    'Die Liste ist die Meldung von damals — sie hat 27 Namen');

  const { lokal, online } = behandelteTypen();

  const ohneZweig = AUDIT_LISTE_2026_09_26
    .filter(typ => !lokal.has(typ) && !online.has(typ))
    .sort();
  assert.deepEqual(ohneZweig, [],
    'Ein Ereignis aus der Audit-Meldung ist wieder stumm geworden — es braucht einen Zweig');

  const falschBewusstStumm = AUDIT_LISTE_2026_09_26
    .filter(typ => bewusstStumm.has(typ))
    .sort();
  assert.deepEqual(falschBewusstStumm, [],
    'Behandelte Ereignisse gehören NICHT in `bewusstStumm` — dort bedeutet der Eintrag „kein Zweig". '
    + 'Die Audit-Meldung wird am LESER behoben (tools/audit-mcp), nicht in dieser Liste');

  // Gegenprobe: alle 27 sind wirklich in der Tabelle, keine Namensvariante.
  const unbekannt = AUDIT_LISTE_2026_09_26
    .filter(typ => !(typ in EREIGNIS_WIRKUNGEN))
    .sort();
  assert.deepEqual(unbekannt, [],
    'Diese Namen gibt es in EREIGNIS_WIRKUNGEN nicht — Tippfehler in der Liste?');
});

test('Ereignisse mit nur EINEM Zweig sind einzeln belegt', () => {
  /*
   * Ein Ereignis mit nur einem Zweig ist im anderen Modus still — und der
   * Server schickt JEDES Engine-Ereignis an beide Betriebsarten
   * (`src/server/gameServer.js:246–248`). Genau diese Form hatte der Befund,
   * aus dem die Datei entstand. Deshalb ist „nur ein Zweig" eine Entscheidung,
   * die eine Fundstelle braucht: entweder gibt es im anderen Modus eine andere
   * sichtbare Wirkung, oder es gibt keine — und dann ist es ein Befund, der
   * benannt wird statt versteckt.
   *
   * Geprüft wird die MENGE, nicht eine Stichprobe: Die Einträge müssen genau
   * die einzweigigen Tabelleneinträge sein. Ein neuer halber Zweig fällt damit
   * auf, und ein Eintrag, der inzwischen beide Zweige hat, ebenso.
   */
  const { lokal, online } = behandelteTypen();

  const einzweigig = new Set();
  for (const typ of new Set([...lokal, ...online])) {
    if (lokal.has(typ) !== online.has(typ)) einzweigig.add(typ);
  }

  // Gegenprobe gegen einen stillen Durchlauf: ohne Einträge prüft der Test nichts.
  assert.ok(einzweigig.size > 0, 'Vorbedingung: es gibt einzweigige Ereignisse');

  const unbelegt = [...einzweigig].filter(typ => !EINZWEIG_BELEGT.has(typ)).sort();
  assert.deepEqual(unbelegt, [],
    'Diese Ereignisse haben nur einen Zweig und keine Belegstelle — im anderen Modus bleibt '
    + 'die Wirkung stumm, ohne dass das eine Entscheidung wäre');

  const veraltet = [...EINZWEIG_BELEGT.keys()].filter(typ => !einzweigig.has(typ)).sort();
  assert.deepEqual(veraltet, [],
    'Diese Einträge sind keine Einzweig-Fälle mehr (Zweig kam dazu oder fiel weg) — '
    + 'die Belegstelle ist damit gegenstandslos');

  for (const [typ, eintrag] of EINZWEIG_BELEGT) {
    assert.ok(['lokal', 'online'].includes(eintrag.zweig),
      `${typ}: der Eintrag muss den Zweig nennen, den es GIBT (lokal|online)`);
    assert.equal(lokal.has(typ), eintrag.zweig === 'lokal',
      `${typ}: der genannte Zweig stimmt nicht mit der Tabelle überein`);

    // Genau eine Aussage: „es gibt eine Wirkung anderswo" ODER „es gibt keine".
    assert.ok(
      Boolean(eintrag.entweder) !== Boolean(eintrag.offen),
      `${typ}: genau EINES von \`entweder\`/\`offen\` muss stehen — sonst ist die Aussage unklar`,
    );

    if (eintrag.entweder) {
      assert.match(eintrag.entweder, /(^|\s)[\w./-]+\.(js|mjs):\d+/,
        `${typ}: ein \`entweder\` ohne Fundstelle (datei.js:Zeile) ist eine Behauptung, kein Beleg`);
    } else {
      assert.ok(eintrag.offen.length > 40,
        `${typ}: ein \`offen\` muss den Befund benennen (Grund + Fundstelle), nicht nur „offen" heißen`);
      assert.match(eintrag.offen, /(^|\s)[\w./-]+\.(js|mjs):\d+/,
        `${typ}: auch ein \`offen\` braucht die Fundstelle der ausbleibenden Wirkung`);
    }
  }
});
