/**
 * Tests: Die Ereignisbehandlung ist in beiden Modi vollständig.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Ein Black-Box-Audit meldete: Im lokalen Spiel sah man den Einschlag eines
 * Projektils nicht. Nachgeprüft: Die Engine sendet `projectile_impact`
 * (`projectileSystem.js:275`), und der Client hatte zwei getrennte
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
// Der Draht: belegt, dass ein v7-Snapshot Günther trägt (siehe Test unten).
import {
  encodeSnapshot,
  decodeSnapshot,
  EreignisSendefilter,
  ANZEIGE_EREIGNISARTEN,
  ZUSTANDSEREIGNISARTEN,
  GEDROSSELTE_EREIGNISARTEN,
  EREIGNIS_DROSSEL_TAKTE,
} from '../src/shared/protocol.js';

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
 * `match.js:1335` auf dieselbe Ereignisliste). Nur `emit(` zu suchen hieß: vier
 * Ereignisarten waren für diesen Wächter unsichtbar — genau die Art stiller
 * Durchlauf, gegen die die Datei antritt.
 *
 * (Das Werkzeug `tools/audit-mcp` wurde nachgezogen: `lib/statisch.mjs:536`
 * sucht mit `(?:emit|melde)\(` nach BEIDEN Meldewegen. Der alte Stand „dort
 * fehlen dieselben vier Arten" gilt nicht mehr.)
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
 * Die Bedeutung ist ENG: „Der Spieler sieht von diesem Ereignis NICHTS; der
 * sichtbare Effekt entsteht über ein anderes Element." Ein Zweig in der Tabelle
 * ist damit KEIN Widerspruch — drei Einträge stehen GENAU DESHALB mit
 * einschränkender Begründung hier: `shot`, `crate_landed` und `turn_start`.
 * Die 27 der Audit-Meldung haben dagegen eine sichtbare Wirkung; sie gehören
 * NICHT hierher (siehe `AUDIT_LISTE_2026_09_26`).
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
                       // (seit 2026-09-27 GEDROSSELT: im Snapshot redundant)
  'damage',            // Lebensbalken sinkt sichtbar
                       // (seit 2026-09-27 GEDROSSELT: im Snapshot redundant)
  'dot_applied',       // Zustandsmarke am Spielernamen

  // --- Dient der Steuerung, nicht der Anzeige
  'shot',              // löst die Vorhersage auf (shotPredictor.resolve)
  'weapon_cooldown',   // die Waffenliste zeigt den Nachladezustand
  'crate_landed',      // lokaler Zweig hat einen Fall; online übernimmt es
                       // die Kistenliste
  /*
   * `weapon_dropped` stand hier bis O8 mit der Begründung „`dropWeapon()` meldet
   * das Ergebnis direkt im Log". Die gilt NUR für den lokalen Zweig. Seit O8 gibt
   * es das Abwerfen online, und dort meldet kein lokaler `dropWeapon()`-Pfad —
   * das Ereignis hat deshalb einen `online`-Zweig bekommen (`ereignisse.js`) und
   * gehört NICHT mehr in diese Menge: Hier bedeutet ein Eintrag „es gibt KEINEN
   * Zweig". Eine veraltete Begründung wäre genau der stille Fehler, den diese
   * Liste verhindern soll.
   */

  // --- Wird bewusst zusammengefasst gemeldet
  /*
   * `drowning` — die Begründung, die hier bis 2026-09-27 stand, war sachlich
   * FALSCH: „bis zu 60x/s: nur beim ÜBERGANG gemeldet (#trackWater)". Sie
   * vermischte die ANZEIGE mit dem SERVER. `Main#trackWater` notiert nur den
   * Übergang — der Motor dagegen meldet es JEDEN Takt, solange die Figur tief
   * genug unter Wasser ist (gemessen 15092 von 15092 Takten). Der Eintrag bleibt
   * richtig, die Begründung ist ersetzt: `drowning` hat KEINEN Zweig (`{}` in
   * `EREIGNIS_WIRKUNGEN`) und ist seit 2026-09-27 gedrosselt, weil sein Wert im
   * Snapshot nachgerechnet redundant ist (`GEDROSSELTE_EREIGNISARTEN`, Gruppe 2;
   * Messreihen in `docs/ereignis-info-gehalt.md`).
   */
  'drowning',
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
 * ## Warum das Werkzeug 27 meldete — und was daraus wurde
 *
 * `tools/audit-mcp/lib/statisch.mjs` → `ereignisAbdeckung()` (dort :525) hielt
 * ein Ereignis für behandelt, wenn sein NAME als ZEICHENKETTE in `src/client/**`
 * vorkam (`/['"]([a-z0-9_]{3,})['"]/`, heute :564). Die Tabelle benutzt aber
 * UNQUOTIERTE Schlüssel (`projectile_impact: beide(…)`) — der alte Leser konnte
 * sie nicht erfassen und meldete deshalb 27 als „undokumentiert".
 *
 * Der Leser wurde nachgezogen und zählt seitdem AUCH die unquotierten Schlüssel
 * (`:565`). Nachgemessen mit dem heutigen Werkzeug: 47 emittierte Arten, 39
 * gedeckt, 8 bewusst stumm, 0 undokumentiert. Die 27 stehen deshalb NUR als
 * Meldung von damals hier — als Beleg, dass die Ereignisse nicht stumm waren,
 * nicht als offener Befund. Ein Eintrag in `bewusstStumm` brächte hier keine
 * Wirkung (die Ereignisse sind behandelt) und würde zusätzlich behaupten, es
 * gäbe keinen Zweig.
 *
 * @type {string[]}
 */
const AUDIT_LISTE_2026_09_26 = [
  'crate_pickup',          // ereignisse.js:424 — lokal :433 (Protokollzeile je Beuteart)
  'crate_pickup_blocked',  // ereignisse.js:461 — beide (Q-Hinweis gilt seit O8 auch online, dort gibt es das Abwerfen)
  'death',                 // ereignisse.js:479 — beide :482/:485
  'dot_tick',              // ereignisse.js:344 — beide :351
  'fall_damage',           // ereignisse.js:489 — lokal :491
  'frozen',                // ereignisse.js:336 — beide :337
  'fuse_armed',            // ereignisse.js:270 — beide :271 (Protokoll) + :272 (Blitz)
  'fuse_expired',          // ereignisse.js:275 — beide :276 + :277
  'jumped',                // ereignisse.js:399 — beide :401 (seit O8 auch online)
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
  'turret_deployed',       // ereignisse.js:289 — lokal :291 + :295, online :300
  'turret_expired',        // ereignisse.js:322 — beide :323
  'turret_fired',          // ereignisse.js:313 — lokal :315, online :318
];

/**
 * Günther im Online-Betrieb — der Anschluss ist gelegt (2026-09-26).
 *
 * ## Der Befund, der hier stand
 *
 * Zwei Hälften fehlten online, beide belegt:
 *
 *   - Die Onlinesicht führte kein `guenther`-Feld (die Felder des
 *     Online-Zustands in `src/client/main.js`, damals :1119–:1143), obwohl der
 *     Renderer Günther und seine Haufen GENAU daraus zeichnet
 *     (`src/client/renderer.js:1218` `#drawGuenther(state.guenther)`, `:1200`
 *     `#drawPoopPiles(state.guenther?.haufen ?? [])`). Lokal reichte
 *     `src/engine/stateSnapshot.js:201` (`guenther: quelle.guenther`) es durch.
 *   - Keiner der vier Streich-Arten hatte einen Online-Zweig
 *     (`src/client/ereignisse.js`, damals :375 ff.) — obwohl der Server JEDES
 *     Engine-Ereignis ohne Whitelist schickt (`src/server/gameServer.js:246–248`)
 *     und der Client unbekannte Steuernachrichten an `game_event` weiterreicht
 *     (`src/client/networkClient.js:396–398`). Sie kamen an und fielen erst bei
 *     der Wirkung weg.
 *
 * ## Stand jetzt
 *
 * Beide Hälften sind geschlossen und durch die Tests unten festgehalten:
 *
 *   - `guenther: snapshot.guenther ?? null` in der Onlinesicht
 *     (`src/client/main.js:1165`, Form wie `crates`/`turrets`),
 *   - die vier Streich-Arten sind `beide(fn)` (`src/client/ereignisse.js:398`
 *     ff.), `crate_pickup_blocked` ist seit O8 ebenfalls `beide(fn)` — vorher
 *     hatte es einen eigenen Online-Text ohne (Q), weil es online kein Abwerfen
 *     gab; das Abwerfen gibt es seit O8 (siehe der Test am Datei-Ende).
 *
 * Damit sind die vier Arten KEINE Einzweig-Fälle mehr und stehen nicht in
 * `EINZWEIG_BELEGT`. Sichtbare Folge eines Streichs bleibt zusätzlich der
 * Lebensbalken (`src/client/hud.js:247`).
 *
 * **Grenze dieses Belegs:** Die Onlinesicht (`Game#onlineViewState`) ist ohne
 * Browser/DOM nicht ausführbar — `import('./src/client/main.js')` bricht schon
 * am Modulkopf ab (`const game = new Game()`, `src/client/main.js:2617`; der
 * Import scheitert mit „(intermediate value).glob is not a function"). Deshalb
 * belegt der Test unten den ausführbaren Teil (v7-Snapshot rein → dekodiertes
 * `guenther` raus) UND den Textweg der Onlinesicht (die Durchreichung als
 * Quelltext, wie es diese Datei für das Modul schon tut).
 */

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
  /*
   * --- nur lokal behandelt (im Online-Betrieb kommt das Ereignis an und fällt)
   *
   * O2 nachgezogen (2026-09-27): `crate_pickup`, `fall_damage`, `landed` und
   * `toxic_rain` hatten bis dahin nur einen `lokal:`-Zweig, obwohl der Server
   * sie sendet (`src/server/gameServer.js:246-248`). Sie haben jetzt einen
   * `online:`-Zweig (`src/client/ereignisse.js`) und sind KEINE Einzweig-Fälle
   * mehr — deshalb stehen sie hier nicht mehr.
   *
   * O8 nachgezogen (2026-09-27): `jumped` hatte nur einen `lokal:`-Zweig (online
   * sprang niemand). Seit es den Online-Sprung gibt, ist es `beide(fn)` und damit
   * kein Einzweig-Fall mehr — der Eintrag ist hier entfernt. `crate_landed`
   * bleibt einzweigig; sein Online-Beleg ist die Kistenliste aus dem Snapshot.
   */
  ['crate_landed', {
    zweig: 'lokal',
    entweder: 'online kommen die Kisten aus dem Snapshot und werden gezeichnet: src/client/main.js:1143 (crates) → src/client/renderer.js:1201 (#drawCrates)',
  }],

  // --- nur online behandelt (lokal kommt es aus einem anderen Weg)
  ['weapon_dropped', {
    zweig: 'online',
    entweder: 'lokal meldet `Main#dropWeapon` das Ergebnis direkt im Log (Name, Munition, Listenaktualisierung) — src/client/main.js:857 (`hud.log`) und :858 (`hud.update`) —, es braucht deshalb keinen Tabellenzweig. ONLINE gibt es diesen lokalen Erfolgspfad nicht: der Server führt den Abwurf aus und schickt das Ereignis; ohne den `online:`-Zweig fiele es stumm weg.',
  }],
  ['projectile_spawn', {
    zweig: 'online',
    entweder: 'lokal BRAUCHT es keinen Zweig: die Vorhersage gibt es dort nicht — src/client/main.js:1480–1481 (#startShotPrediction kehrt im lokalen Modus sofort zurück), gezeichnet wird sie nur online (:1961). Das Ereignis läuft lokal trotzdem (es kommt aus dem Motor, src/engine/shooting.js:344) und fällt in eine leere Stelle: Absicht, keine Lücke.',
  }],
  ['terrain_destroyed', {
    zweig: 'online',
    entweder: 'lokal entsteht derselbe Krater über `explosion`: src/client/ereignisse.js:105 (applyCrater) — ein zweiter Eintrag würde zweimal graben.',
  }],
  ['karte_unerreichbar', {
    zweig: 'online',
    offen: 'im lokalen Match läuft dieselbe Prüfung und sendet dasselbe Ereignis: src/engine/match.js:658 (Aufruf in `start()`) → `#pruefeErreichbarkeit` ab :701 → die Zuweisung `this.erreichbarkeit` in :752. Der lokale Zweig fehlt, und ein anderes Element zeigt es nicht: das Ergebnis landet nur in `match.erreichbarkeit` (src/engine/match.js:752), und außerhalb von match.js liest das niemand (einziger Leser im ganzen Projekt: tests/zugreihenfolge.test.js:144). BEFUND: wer lokal auf einer abgeschnittenen Karte spielt, erfährt es nicht.',
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

test('Die Klangebene gilt ONLINE genauso wie lokal — Schuss, Explosion, Treffer', () => {
  /*
   * ## Der Befund (belegt, 2026-09-27)
   *
   * Alle vier Klangaufrufe des Clients standen in den NUR-LOKALEN Zweigen
   * (`ereignisse.js`: `explosion`, zweimal `hitscan`, `shot`). Der Online-Zweig
   * machte nur `shotPredictor.resolve()` — Mündungsfeuer, Schuss- und
   * Explosionsklang fehlten. Der Mischer WIRD online übergeben
   * (`Main#ereignisKontext`, `sound: this.sound`), er wurde nur nie gerufen.
   * Wer online spielte, hörte überhaupt keine Schüsse und Einschläge.
   *
   * ## Was hier geprüft wird
   *
   * Nicht „ein Zweig ist da", sondern dass online GENAU DIESELBEN Klänge
   * entstehen wie lokal — über den echten Einstieg `verarbeiteOnline`, mit
   * einem Mischer, der die Aufrufe aufzeichnet. Die Erwartung ist deshalb
   * `deepEqual(lokal, online)`: Beide Betriebsarten müssen dieselbe Tonfolge
   * erzeugen, inklusive der Bedingung „`damage` nur bei einem echten Treffer".
   *
   * ## Und keine Klangflut
   *
   * Das `damage`-Klangsignal hängt am TREFFER eines `hitscan`-Ereignisses, nicht
   * am `damage`-Ereignis des Motors. Das ist der Unterschied: `damage` meldet im
   * großen Match jeden Takt und ist gedrosselt (`GEDROSSELTE_EREIGNISARTEN`,
   * gemessen 15092 Meldungen in 30 s bei 40 Figuren) — ein Klang daran wäre ein
   * Dauerläuten. Gemessen an einem echten Replay (38 Schüsse, 40,7 s, durch den
   * Sendefilter): 74 Klang-Anlässe = **1,8 je Sekunde**.
   */
  const gehoert = { lokal: [], online: [] };
  const kontext = zweig => ({
    sound: { verarbeite: ereignis => gehoert[zweig].push(ereignis.type) },
    hud: { log: () => {} },
    renderer: {
      applyCrater() {}, addFlash() {}, spawnExplosionParticles() {}, addMuzzleFlash() {},
    },
    shotPredictor: { resolve() {} },
    drawHitscanBeam() {},
    logSpecialEffect() {},
    showGuentherWheel() {},
    showEndScreen() {},
    nameOf: () => 'P1',
    match: { players: [] },
    fernzustand: { status: () => 'playing', setzeStatus() {}, setzeSieger() {}, setzeEinschnitt() {} },
  });

  const faelle = [
    ['explosion', { x: 10, y: 20, radius: 30 }],
    ['shot', { playerId: 1, angle: 0.5 }],
    // Fehlschuss: EIN Klang (der Schuss), KEIN Trefferklang.
    ['hitscan', { playerId: 1, weaponId: 'pa_002', hit: false, hitX: 5, hitY: 6 }],
    // Treffer: Schuss UND Treffer.
    ['hitscan', { playerId: 1, weaponId: 'pa_002', hit: true, target: 2, hitX: 5, hitY: 6 }],
  ];
  for (const [typ, nutzlast] of faelle) {
    verarbeiteLokal(kontext('lokal'), { type: typ, payload: nutzlast });
    verarbeiteOnline(kontext('online'), { t: typ, ...nutzlast });
  }

  assert.deepEqual(gehoert.lokal, ['explosion', 'shot', 'shot', 'shot', 'damage'],
    `Der lokale Klangweg ist nicht der erwartete: ${JSON.stringify(gehoert.lokal)}`);
  assert.deepEqual(gehoert.online, gehoert.lokal,
    'ONLINE muss dieselbe Tonfolge erzeugen wie lokal — sonst ist die Klangebene dort wieder stumm');
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

// ------------------------------------------- Günthers Anschluss im Online-Betrieb

test('Der v7-Snapshot trägt Günther — und die Onlinesicht reicht ihn durch', () => {
  /*
   * DIE Prüfung, die den Anschluss festhält: Günther ist online sichtbar.
   *
   * Die Kette hat zwei Enden, deshalb zwei Glieder:
   *
   *  (1) AUSGEFÜHRT — Was der Client EMPFÄNGT, trägt Günther. Ein v7-Snapshot
   *      mit aktivem Günther und zwei Haufen geht durch `encodeSnapshot` /
   *      `decodeSnapshot` und kommt mit `aktiv === true` und DERSELBEN
   *      Haufenzahl heraus. Das ist genau der `snapshot`, den die Onlinesicht
   *      liest (`src/client/networkClient.js:243`, `latestSnapshot`).
   *
   *  (2) QUELLTEXT — Was die Onlinesicht damit TUT. `Game#onlineViewState`
   *      (`src/client/main.js:1053`) reicht `snapshot.guenther` als Feld `guenther`
   *      durch, in der Form von `crates`/`turrets` daneben. Dieser Schritt ist
   *      hier NICHT ausführbar: `main.js` bricht schon beim Import am Modulkopf
   *      ab (`const game = new Game()`, `src/client/main.js:2617`) — ohne
   *      Browser/DOM gibt es keine Instanz von `Game`. Deshalb der
   *      Quelltextbeleg; es ist dasselbe Mittel, mit dem diese Datei oben prüft,
   *      dass `main.js` die Tabelle überhaupt benutzt (der `verarbeiteLokal`
   *      /`verarbeiteOnline`-Abschnitt). Und der Renderer, der es zeichnet,
   *      liest GENAU dieses Feld — auch das wird hier festgehalten.
   */
  const snapshot = {
    tick: 1234,
    round: 3,
    wind: 0,
    activePlayerId: 1,
    entities: [{ entityId: 1, teamId: 0, x: 120, y: 60, health: 100, alive: true }],
    projectiles: [],
    crates: [],
    turrets: [],
    guenther: {
      aktiv: true,
      x: 240,
      y: 300,
      richtung: -1,
      haufen: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    },
  };

  const decoded = decodeSnapshot(encodeSnapshot(snapshot));
  assert.equal(decoded.guenther.aktiv, true,
    'Der dekodierte Snapshot muss Günther als aktiv führen — sonst zeichnet der Renderer nichts');
  assert.equal(decoded.guenther.haufen.length, 2,
    'Die Haufenzahl muss den Draht unverändert passieren');

  // (2) Die Onlinesicht reicht das Feld durch — und der Renderer liest es.
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  assert.match(main, /guenther:\s*snapshot\.guenther/,
    'Die Onlinesicht muss `guenther` aus dem Snapshot in den Ansichtszustand setzen '
    + '(ohne diese Zeile ist Günther online unsichtbar)');

  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'client', 'renderer.js'), 'utf8');
  assert.match(renderer, /#drawGuenther\(state\.guenther\)/,
    'Der Renderer zeichnet Günther aus `state.guenther` — genau dieses Feld muss die Onlinesicht liefern');
  assert.match(renderer, /#drawPoopPiles\(state\.guenther\?\.haufen/,
    'Der Renderer zeichnet die Haufen aus `state.guenther.haufen`');
});

test('Günthers vier Streiche werden ONLINE behandelt — die Wirkung läuft wirklich', () => {
  /*
   * Vorher hatten die vier Arten NUR lokale Zweige, obwohl der Server sie
   * schickt (`src/server/gameServer.js:246–248`) und der Client sie
   * durchreicht (`src/client/networkClient.js:396–398`).
   *
   * Geprüft wird nicht nur „ein Zweig ist da", sondern dass eine WIRKUNG
   * entsteht: Der Online-Einstieg wird gerufen und aufgezeichnet.
   */
  const { online } = behandelteTypen();
  for (const typ of ['guenther_wheel', 'guenther_pee', 'guenther_poop', 'guenther_poop_hit']) {
    assert.ok(online.has(typ), `${typ} braucht einen ONLINE-Zweig`);
  }

  const gesehen = [];
  const kontext = {
    hud: { log: text => gesehen.push(['log', text]) },
    showGuentherWheel: n => gesehen.push(['rad', n.outcome]),
    nameOf: () => 'P1',
  };
  verarbeiteOnline(kontext, { t: 'guenther_wheel', outcome: 'heimdall', label: 'Heimdall' });
  verarbeiteOnline(kontext, { t: 'guenther_pee', playerId: 1, amount: 5 });
  verarbeiteOnline(kontext, { t: 'guenther_poop', x: 1, y: 2 });
  verarbeiteOnline(kontext, { t: 'guenther_poop_hit', playerId: 1 });

  assert.deepEqual(gesehen.map(e => e[0]), ['rad', 'log', 'log', 'log'],
    'Jede der vier Arten muss online eine Wirkung erzeugen — keine darf still durchfallen');
  assert.equal(gesehen[0][1], 'heimdall',
    'Das Rad dreht auf den Ausgang, den das Serverereignis trägt — nicht auf einen eigenen Wurf');
});

test('`crate_pickup_blocked` meldet online den vollen Vorrat — MIT Q-Aufforderung', () => {
  /*
   * Vor O8 fiel das Ereignis online still durch: Der Spieler konnte nicht
   * aufnehmen und erfuhr keinen Grund. Seit O2 hat es einen Online-Zweig; seit O8
   * gibt es das Abwerfen AUCH online (`CONTROL.DROP_WEAPON`).
   *
   * Vorher unterschieden sich die Texte bewusst: nur lokal nannte die Taste (Q),
   * online nicht — „eine online angezeigte (Q)-Aufforderung wäre eine falsche
   * Anweisung". Diese Begründung ist mit O8 GEGENSTANDSLOS: Die Taste wirkt
   * online genauso. Der Eintrag ist deshalb `beide(fn)`, und beide Meldungen
   * nennen die Taste und sind identisch.
   *
   * Ein Online-Text ohne Handlung ließe den Spieler mit vollem Vorrat ohne
   * Ausweg zurück — genau der Zustand, den O8 behebt.
   */
  const { lokal, online } = behandelteTypen();
  assert.ok(online.has('crate_pickup_blocked'),
    'online bleibt der volle Vorrat ohne Rückmeldung — der Spieler erfährt den Grund nicht');
  assert.ok(lokal.has('crate_pickup_blocked'), 'lokal muss den vollen Vorrat melden');

  const lokalTexte = [];
  verarbeiteLokal({ hud: { log: text => lokalTexte.push(text) } },
    { type: 'crate_pickup_blocked', payload: { crateId: 1, playerId: 1, reason: 'voll' } });
  const onlineTexte = [];
  verarbeiteOnline({ hud: { log: text => onlineTexte.push(text) } },
    { t: 'crate_pickup_blocked', crateId: 1, playerId: 1, reason: 'voll' });

  assert.equal(lokalTexte.length, 1, 'lokal muss eine Meldung entstehen');
  assert.equal(onlineTexte.length, 1, 'online muss eine Meldung entstehen');
  assert.match(lokalTexte[0], /\(Q\)/, 'lokal nennt die Abwerf-Taste');
  assert.match(onlineTexte[0], /\(Q\)/,
    'online gibt es seit O8 das Abwerfen (CONTROL.DROP_WEAPON) — die Meldung muss die Taste nennen');
  assert.deepEqual(onlineTexte, lokalTexte,
    'Da beide Betriebsarten dieselbe Handlung haben, müssen die Texte identisch sein (beide(fn))');
});

/* ===========================================================================
 * Der SENDEFILTER des Ereigniskanals — die Gegenrichtung derselben Frage
 * ===========================================================================
 *
 * Die Tests oben prüfen, was der CLIENT mit einem Ereignis tut. Hier geht es um
 * die andere Hälfte des Kanals: Was der SERVER überhaupt auf die Leitung legt.
 *
 * Der Befund (mehrfach unabhängig gemessen, `docs/ereigniskanal-filter.md`):
 * Der Server schickte JEDES Motorereignis ungefiltert. Bei vier Figuren auf
 * `hills` waren das 3428 `landed`-Nachrichten in 100 s (34,3/s = 86,8 % der
 * Steuerlast); bei 40 Figuren 34 283 (342,8/s). Ursache ist ein Bounce-Artefakt
 * einer STEHENDEN Figur — sie meldet alle 7 Takte eine Landung, ohne sich zu
 * bewegen. Folge im Browser: Das HUD-Protokoll führt 60 Zeilen und lief in
 * 1,8 s durch; eine wichtige Servermeldung war damit unsichtbar.
 *
 * Die Tests hier halten die drei Zusagen des Filters fest:
 *   1. Wiederholungen derselben Art und Figur werden zusammengefasst (die
 *      ERSTE Meldung geht raus — es bleibt sichtbar, DASS etwas geschah),
 *   2. zustandstragende Ereignisse kommen UNGEKUERZT durch — AUSSER den drei,
 *      die im Snapshot nachgerechnet redundant sind (`damage`,
 *      `entity_in_water`, `drowning`; gemessen, siehe
 *      `docs/ereignis-info-gehalt.md`),
 *   3. der Filter berührt die Simulation nicht.
 */

/** Läuft ein Match und liefert jedes Ereignis mit Takt und Nutzlast. */
function sammleEreignisse({ ticks, seed = 20260910, teams = 2, playersPerTeam = 2, preset = 'hills' }) {
  const match = new MatchController({ seed, teams, playersPerTeam, preset, maxRounds: 30 });
  match.start();
  const gesehen = [];
  for (let i = 0; i < ticks; i += 1) {
    if (match.status !== 'playing') break;
    match.step();
    const takt = match.world.tickCount;
    for (const ereignis of match.consumeEvents()) {
      gesehen.push({ type: ereignis.type, payload: ereignis.payload, takt });
    }
  }
  return { match, gesehen };
}

test('Der Sendefilter drosselt nur Anzeige oder snapshot-redundanten Zustand — die Einteilung ist vollständig', () => {
  /*
   * Warum dieser Test der wichtigste der Gruppe ist: Eine Einteilung, die
   * veraltet, ist gefährlicher als keine. Fällt eine neue Zustandsart in die
   * Anzeige-Menge (oder umgekehrt), verschwindet sie still vom Draht — genau
   * der Fehler, den O2 für vier Ereignisse beheben musste.
   *
   * Geprüft wird gegen ZWEI Quellen: die tatsächlich emittierten Arten
   * (`ereignisseDerEngine()`, beide Meldewege) und die Zuordnungstabelle des
   * Clients. Jede Art muss in GENAU einer der beiden Mengen stehen.
   */
  const anzeige = new Set(ANZEIGE_EREIGNISARTEN);
  const zustand = new Set(ZUSTANDSEREIGNISARTEN);

  assert.equal(anzeige.size, ANZEIGE_EREIGNISARTEN.length, 'Keine Dopplung in ANZEIGE_EREIGNISARTEN');
  assert.equal(zustand.size, ZUSTANDSEREIGNISARTEN.length, 'Keine Dopplung in ZUSTANDSEREIGNISARTEN');
  for (const art of anzeige) {
    assert.ok(!zustand.has(art), `"${art}" steht in beiden Mengen — genau eine muss gelten`);
  }

  const bekannt = new Set([...anzeige, ...zustand]);
  const ausQuelle = [...ereignisseDerEngine()];
  const ausTabelle = Object.keys(EREIGNIS_WIRKUNGEN);
  const unbekannt = [...new Set([...ausQuelle, ...ausTabelle])].filter(art => !bekannt.has(art));
  assert.deepEqual(unbekannt, [],
    'Diese Ereignisarten fehlen in der Einteilung des Sendefilters. Wer sie einführt, muss '
    + 'einmal entscheiden, ob sie Zustand tragen (ZUSTANDSEREIGNISARTEN) oder nur Anzeige sind '
    + '(ANZEIGE_EREIGNISARTEN) — sonst kann eine neue Zustandsart still gefiltert werden.');

  /*
   * Die Drossel trifft ZWEI Gruppen, und die Prüfung unterscheidet sie:
   *
   *  1. reine Anzeigearten (Bodenkontakte) — sie dürfen NIE Zustand tragen,
   *  2. drei Zustandsarten, die ihren Wert jeden Takt melden, obwohl er im
   *     Snapshot steht (`damage`, `entity_in_water`, `drowning`). Sie sind
   *     gemessen redundant (`docs/ereignis-info-gehalt.md`) und stehen deshalb
   *     seit 2026-09-27 in der Drossel.
   *
   * Für Gruppe 2 gilt die alte Zusicherung „gedrosselt ⇒ Anzeige" bewusst NICHT.
   * Was sie ersetzt, ist die Bedingung: gedrosselt werden darf Zustand nur, wenn
   * er im Snapshot nachgerechnet redundant ist — und deshalb steht die
   * Ausnahmeliste hier NAMENTLICH und nicht als „alles, was auch Zustand ist".
   */
  const imSnapshotRedundant = new Set(['damage', 'entity_in_water', 'drowning']);
  for (const art of GEDROSSELTE_EREIGNISARTEN) {
    if (imSnapshotRedundant.has(art)) {
      assert.ok(zustand.has(art),
        `"${art}" ist als snapshot-redundant gedrosselt, steht aber nicht in ZUSTANDSEREIGNISARTEN`);
      continue;
    }
    assert.ok(anzeige.has(art), `"${art}" ist gedrosselt, aber nicht als Anzeige eingeordnet`);
    assert.ok(!zustand.has(art),
      `"${art}" ist gedrosselt UND trägt Zustand — das ist ein Informationsverlust, kein Filter`);
  }

  /*
   * Die Arten, die der Auftrag ausdrücklich schützt, sind ungedrosselt: Zustand,
   * der NICHT im Snapshot steht (Sturzschaden, Zustandsschaden über Zeit,
   * Heilung, Tod, Zugwechsel, Terrainzerstörung, Geschosserzeugung). Bei ihnen
   * WÄRE eine verlorene Meldung ein Informationsverlust.
   *
   * `damage`, `drowning` und `entity_in_water` standen hier bis 2026-09-27 — sie
   * sind aus der Liste entfernt, weil genau das Gegenteil gemessen wurde.
   */
  for (const art of ['fall_damage', 'dot_tick', 'heal', 'death', 'turn_start',
    'terrain_destroyed', 'projectile_spawn']) {
    assert.ok(zustand.has(art), `"${art}" trägt Zustand und muss in ZUSTANDSEREIGNISARTEN stehen`);
    assert.ok(!GEDROSSELTE_EREIGNISARTEN.includes(art), `"${art}" darf NICHT gedrosselt werden`);
  }
});

test('34x `landed` derselben Figur in 120 Takten: die erste Meldung geht raus, der Rest wird zusammengefasst', () => {
  /*
   * Das ist der gemessene Kernfall: Eine STEHENDE Figur pendelt um 4 px und
   * meldet alle 7 Takte eine Landung. Der Test benutzt genau dieses Muster
   * (34 Landungen in 120 Takten, Figur 3) — nicht ein erfundenes.
   *
   * Zwei Zusagen: Die Zahl der Meldungen sinkt deutlich, UND die erste Meldung
   * geht raus (sonst wäre die Landung nicht bloß zusammengefasst, sondern
   * gelöscht — und niemand sähe, DASS gelandet wurde).
   */
  const filter = new EreignisSendefilter();
  const gehtRaus = [];
  const landungen = [];
  for (let i = 0; i < 34; i += 1) {
    const takt = 4 + i * 3; // ~ alle 3 Takte, dichter als das echte Artefakt
    landungen.push({ takt, art: 'landed', payload: { playerId: 3 } });
  }
  /*
   * Dazu dieselben Landungen einer ZWEITEN Figur — sie dürfen nicht
   * mitgedrosselt werden, denn das Fenster gilt je Art UND Figur.
   *
   * Die zweite Liste wird GEBAUT, nicht an die erste angehängt: Ein
   * `for (const x of landungen) landungen.push(...)` läuft endlos (die Schleife
   * besucht die eigenen Anhänge) — genau das hat diesen Test beim ersten Lauf
   * in den Speicherlauf getrieben.
   */
  const zweiteFigur = landungen.map(({ takt }) => ({ takt, art: 'landed', payload: { playerId: 4 } }));

  for (const e of [...landungen, ...zweiteFigur]) {
    if (filter.durchlassen(e.art, e.payload, e.takt)) gehtRaus.push(e);
  }

  const gesendet3 = gehtRaus.filter(e => e.payload.playerId === 3);
  const gesendet4 = gehtRaus.filter(e => e.payload.playerId === 4);
  const zahlen = filter.zahlen().find(z => z.art === 'landed');

  assert.equal(zahlen.empfangen, 68, 'Alle 68 Meldungen müssen den Filter erreichen (nichts wird vorab verworfen)');
  assert.ok(gesendet3.length > 0, 'Die erste Landung der Figur muss gesendet werden');
  assert.ok(gesendet3.length <= 4,
    `Figur 3 darf höchstens 4 Meldungen erzeugen (gemessen wurden ${gesendet3.length}) — `
    + 'bei 120 Takten Fenster von 30 Takten sind das 4 Fenster');
  assert.ok(gesendet3.length * 3 < 34,
    `Deutlich weniger als 34: gesendet ${gesendet3.length}`);
  assert.equal(gesendet3[0].takt, 4, 'Die ERSTE Landung steht im Sendeplan — sonst wäre sie gelöscht statt zusammengefasst');
  assert.equal(gesendet4.length, gesendet3.length,
    'Zwei verschiedene Figuren dürfen sich nicht gegenseitig die Meldung wegnehmen');
  assert.equal(zahlen.unterdrueckt, 68 - gehtRaus.length, 'Was nicht rausgeht, wird gezählt — nicht verschwiegen');
});

test('`damage` wird zusammengefasst — 34 Meldungen in 120 Takten, hoechstens 4 auf der Leitung', () => {
  /*
   * BIS 2026-09-27 stand hier das Gegenteil („`damage` kommt ungekürtzt durch —
   * 34 Meldungen, 34 auf der Leitung"). Die Begründung war eine Annahme: Schaden
   * sei Spielzustand und stehe NICHT im Snapshot. Gemessen steht er dort —
   * `remaining` == Snapshot-Gesundheit in 15092 von 15092 Fällen,
   * `amount` == Takt-Differenz in 15084 von 15092 (`docs/ereignis-info-gehalt.md`).
   *
   * Geprüft wird jetzt dasselbe dichte Muster wie bei `landed`: Die ERSTE
   * Meldung geht raus (sonst wäre der Treffer gelöscht statt zusammengefasst),
   * die Wiederholungen im Fenster werden zusammengefasst.
   *
   * VORBEHALT: `damage` trägt `attackerId`, und der Urheber steht NICHT im
   * Snapshot. Heute liest ihn niemand; soll ihn je eine Anzeige zeigen, muss
   * `damage` aus der Drossel heraus oder je Urheber zusammengefasst werden. Der
   * Satz steht als Bedingung an `GEDROSSELTE_EREIGNISARTEN` im Code.
   */
  const filter = new EreignisSendefilter();
  let gesendet = 0;
  for (let i = 0; i < 34; i += 1) {
    const payload = { entityId: 3, attackerId: 1, amount: 5 + i, remaining: 100 - i };
    if (filter.durchlassen('damage', payload, 4 + i * 3)) gesendet += 1;
  }
  assert.ok(gesendet > 0,
    'Die erste Schadensmeldung muss raus — zusammengefasst heißt nicht gelöscht');
  assert.ok(gesendet <= 4,
    `In 120 Takten passen höchstens 4 Fenster (30 Takte), gesendet: ${gesendet}`);
  assert.ok(gesendet < 34, `Die Wiederholungen müssen zusammengefasst werden, gesendet: ${gesendet}`);
  const zahlen = filter.zahlen().find(z => z.art === 'damage');
  assert.equal(zahlen.unterdrueckt, 34 - gesendet, 'Was nicht rausgeht, wird gezählt — nicht verschwiegen');
  assert.equal(zahlen.gesendet, gesendet);
});

test('Ein echtes Match verliert kein einziges Zustandsereignis, das NICHT im Snapshot steht — und alle Anzeigearten bleiben sichtbar', () => {
  /*
   * Die schwerste Zusage, an einem echten Lauf geprüft (nicht an einer
   * Nachricht aus der Hand): Ein Match mit vier Figuren auf `hills`, 1800 Takte
   * (30 s) — die Bounce-Flut ist dabei voll da.
   *
   * Verglichen wird Zeichen für Zeichen: Die Folge der Zustandsereignisse muss
   * VORHER und NACHHER identisch sein. Zusätzlich darf KEINE Anzeigeart
   * vollständig verschwinden — zusammengefasst heißt nicht gelöscht.
   *
   * AUSGENOMMEN sind seit 2026-09-27 die drei Zustandsarten, die im Snapshot
   * nachgerechnet redundant sind (`damage`, `entity_in_water`, `drowning`) —
   * bei ihnen ist das Zusammenfassen die ENTSCHEIDUNG, nicht ein Fehler. Sie
   * werden unten einzeln geprüft: sichtbar bleiben sie, vollständig dürfen sie
   * nicht bleiben.
   */
  const { gesehen } = sammleEreignisse({ ticks: 1800 });
  assert.ok(gesehen.length > 500,
    `Der Lauf muss die Flut enthalten (gemessen ${gesehen.length} Ereignisse) — sonst prüft der Test nichts`);

  const imSnapshotRedundant = new Set(['damage', 'entity_in_water', 'drowning']);
  const zustandsarten = new Set([...ZUSTANDSEREIGNISARTEN].filter(art => !imSnapshotRedundant.has(art)));
  const filter = new EreignisSendefilter();
  const gefiltert = [];
  for (const e of gesehen) if (filter.durchlassen(e.type, e.payload, e.takt)) gefiltert.push(e);

  const text = liste => JSON.stringify(liste.map(e => [e.type, e.payload, e.takt]));
  assert.equal(text(gesehen.filter(e => zustandsarten.has(e.type))),
    text(gefiltert.filter(e => zustandsarten.has(e.type))),
    'Ein Zustandsereignis fehlt oder hat sich geändert — der Filter darf nur '
    + 'Zustand zusammenfassen, der im Snapshot nachgerechnet redundant ist');

  for (const art of new Set(gesehen.map(e => e.type))) {
    const vorher = gesehen.filter(e => e.type === art).length;
    const nachher = gefiltert.filter(e => e.type === art).length;
    assert.ok(nachher > 0,
      `"${art}" ist vollständig verschwunden (${vorher} vorher, 0 nachher) — zusammengefasst heißt nicht gelöscht`);
  }

  // Die drei gedrosselten Zustandsarten: sichtbar ja, vollständig nein.
  for (const art of imSnapshotRedundant) {
    const vorher = gesehen.filter(e => e.type === art).length;
    if (vorher === 0) continue; // kommt in diesem Lauf nicht vor (z. B. kein Wasser)
    const nachher = gefiltert.filter(e => e.type === art).length;
    assert.ok(nachher > 0, `"${art}" ist vollständig verschwunden (${vorher} -> 0)`);
    assert.ok(nachher < vorher,
      `"${art}" wurde nicht zusammengefasst (${vorher} -> ${nachher}) — dann stünde es zu Unrecht in der Drossel`);
  }

  const landedVorher = gesehen.filter(e => e.type === 'landed').length;
  const landedNachher = gefiltert.filter(e => e.type === 'landed').length;
  assert.ok(landedNachher < landedVorher / 3,
    `Die Flut muss deutlich sinken: ${landedVorher} -> ${landedNachher}`);
  assert.ok(landedNachher > 0, 'Es muss weiterhin sichtbar sein, DASS gelandet wurde');
});

test('Das Drosselfenster ist kürzer als eine echte Flugphase — eine echte Landung kann nicht verschluckt werden', () => {
  /*
   * Warum dieser Test die Fensterlänge absichert: Die Drossel darf nur
   * WIEDERHOLUNGEN desselben Zustands treffen. Zwischen zwei ECHTEN Landungen
   * derselben Figur liegt immer eine Flugphase — ist das Fenster länger als
   * diese, würde eine echte Landung verschluckt. Der Test misst die Flugdauer am
   * laufenden Motor und hält sie gegen die Fensterlänge: Ändert jemand die
   * Sprungphysik, fällt hier auf, dass die Fensterlänge nachgezogen werden muss.
   *
   * Gemessen: 50 Takte von `jump()` bis `landed` (auf `hills` und `flooded`
   * gleich, siehe `docs/ereigniskanal-filter.md`).
   */
  for (const preset of ['hills', 'flooded']) {
    const match = new MatchController({ seed: 777, teams: 2, playersPerTeam: 2, preset });
    match.start();
    for (let i = 0; i < 60; i += 1) { match.step(); match.consumeEvents(); }
    const aktiver = match.getState().activePlayerId;
    assert.equal(match.jump(aktiver, 0).ok, true, `Der Sprung muss angenommen werden (${preset})`);

    let flugTakte = 0;
    let gelandet = false;
    while (flugTakte < 400 && !gelandet) {
      match.step();
      flugTakte += 1;
      for (const e of match.consumeEvents()) {
        if (e.type === 'landed' && e.payload.playerId === aktiver) gelandet = true;
      }
    }
    assert.equal(gelandet, true, `Die Figur muss innerhalb von 400 Takten landen (${preset})`);
    assert.ok(EREIGNIS_DROSSEL_TAKTE < flugTakte,
      `Das Fenster (${EREIGNIS_DROSSEL_TAKTE} Takte) muss kürzer sein als die Flugdauer `
      + `(${flugTakte} Takte auf ${preset}) — sonst verschluckt die Drossel eine echte Landung`);
  }
});

test('Der Sendefilter sitzt hinter consumeEvents — die Simulation sieht ihn nicht', () => {
  /*
   * Die Determinismus-Zusage, in zwei Teilen:
   *
   *  1. AUSFÜHRUNG: Zwei Matches mit demselben Seed durchlaufen — bei einem
   *     wandert jedes Ereignis durch den Filter, beim anderen nicht. Der
   *     Zustandshash am Ende muss gleich sein: Der Filter kann die Simulation
   *     nicht beeinflussen, weil er ihre Ereignisse nur LIEST.
   *  2. QUELLE: Unter `src/engine/` darf der Filter an keiner Stelle vorkommen.
   *     Ein Import dort würde ihn in den Simulationspfad ziehen — und die
   *     Wiedergabegleichheit hinge an einem Netzwerkdetail. Replays zeichnen
   *     Eingaben auf, keine Ereignisse (`src/engine/replay.js`).
   */
  const gefiltert = sammleEreignisse({ ticks: 900, seed: 4242 });
  const roh = sammleEreignisse({ ticks: 900, seed: 4242 });
  assert.deepEqual(gefiltert.gesehen, roh.gesehen,
    'Die Ereignisströme zweier identischer Matches müssen gleich sein (Determinismus)');
  assert.equal(gefiltert.match.stateHash(), roh.match.stateHash(),
    'Der Zustandshash muss gleich bleiben — der Filter darf die Simulation nicht berühren');

  const dateien = [];
  const sammeln = dir => {
    for (const eintrag of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, eintrag.name);
      if (eintrag.isDirectory()) sammeln(p);
      else if (eintrag.name.endsWith('.js')) dateien.push(p);
    }
  };
  sammeln(path.join(ROOT, 'src', 'engine'));

  const treffer = dateien.filter(datei => {
    const text = fs.readFileSync(datei, 'utf8');
    return /EreignisSendefilter|durchlassen|GEDROSSELTE_EREIGNISARTEN|ANZEIGE_EREIGNISARTEN/.test(text);
  });
  assert.deepEqual(treffer.map(p => path.relative(ROOT, p)), [],
    'Der Sendefilter gehört NICHT in den Simulationspfad — er sitzt im Server hinter consumeEvents()');

  // Und der Server benutzt ihn auch wirklich (sonst wäre alles oben Theorie).
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server', 'gameServer.js'), 'utf8');
  assert.match(server, /this\.match\.consumeEvents\(\)[\s\S]{0,400}durchlassen\(/,
    'Der Server muss den Filter im Ereigniskanal NACH consumeEvents() anwenden');
  assert.match(server, /if \(!this\.sendefilter\.durchlassen/,
    'Die unterdrückte Meldung darf NICHT gesendet werden (continue statt broadcast)');
});
