/**
 * Tests: Vorrang im HUD-Protokoll.
 *
 * ## Der Befund, der zu dieser Datei führte (belegt, gemessen)
 *
 * Das Ereignisprotokoll hält 60 Zeilen. Neue Zeilen kommen vorn hinein, die
 * älteste fällt hinten heraus — nach ZEIT, nicht nach Wichtigkeit. Eine
 * STEHENDE Figur erzeugt ~34 `landed`-Meldungen je Sekunde (Physik-Bounce um
 * 4 px), und eine Servermeldung wie „In der Luft ist kein erster Sprung
 * möglich" (sie kommt als `danger`) war damit nach wenigen Sekunden
 * verschwunden: Der Spieler drückt SHIFT, es passiert nichts, und die
 * Begründung ist weg, bevor er sie liest.
 *
 * Gemessen mit ECHTEM Motor, ECHTEM Hud und echtem Ereignisweg (Seed 4242,
 * 10 s Laufzeit, Meldung nach 4 s eingesetzt — vor der Änderung):
 *
 *   Lage                          Zeilen/s   Überlebt
 *   4 Figuren, hills, ungefiltert      34,5   105 Takte = 1,8 s
 *   4 Figuren, flooded, ungefiltert    17,3   210 Takte = 3,5 s
 *   40 Figuren, hills, ungefiltert    344,2    14 Takte = 0,2 s
 *   40 Figuren, flooded, ungefiltert  138,4    28 Takte = 0,5 s
 *   40 Figuren, hills, gefiltert       72,2    42 Takte = 0,7 s
 *
 * Der Sendefilter des Servers (`EreignisSendefilter` in `protocol.js`) nimmt
 * Wiederholungen weg und verbessert die Lage — er löst sie nicht.
 *
 * ## Was diese Datei festhält
 *
 * 1. Die Zuteilung Ton → Klasse (`protokollKlasse`).
 * 2. Die Zusicherung: **Anzeigerauschen kann eine Vorrangmeldung nicht
 *    verdrängen** — geprüft mit 200 Anzeigemeldungen (gleiche UND
 *    verschiedene Texte).
 * 3. Das Budget: Anzeigerauschen allein füllt höchstens einen Teil der Zeilen;
 *    der Rest bleibt reserviert. Beide Klassen zusammen ergeben genau
 *    `LOG_LIMIT` Knoten.
 * 4. Das Zusammenfassen: gleicher Text = EINE Zeile mit Zähler — und dabei
 *    wird die Liste NICHT neu aufgebaut (derselbe Knoten, kein
 *    `replaceChildren`, keine neue Ansage).
 * 5. Der echte Weg: dieselbe Zusicherung an einem laufenden Match
 *    (`MatchController` + `EREIGNIS_WIRKUNGEN`), nicht nur an erfundenen
 *    Meldungen.
 *
 * ## DOM-Ersatz
 *
 * `hud.js` ist ein DOM-Modul; im Browser läuft es, in `node --test` nicht. Die
 * Datei bringt deshalb ein kleines, ABGEBILDETES Dokument mit — nur die Teile,
 * die das HUD wirklich benutzt (`getElementById`, `createElement`, `prepend`,
 * `append`, `remove`, `children`, `lastElementChild`, `replaceChildren`,
 * `textContent`, `style`, `dataset`, `classList`, `setAttribute`). Es ist
 * bewusst KEIN jsdom: Was hier fehlt, fällt als Fehler auf, statt still leer zu
 * bleiben. Für die Protokollliste ist das ausreichend scharf — `children` ist
 * eine echte Liste, `remove()` hängt wirklich aus, und `replaceChildren` wird
 * gezählt (siehe Test „Die Live-Region wird nicht neu aufgebaut").
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Hud, protokollKlasse } from '../src/client/hud.js';
import { MatchController } from '../src/engine/match.js';
import { verarbeiteLokal } from '../src/client/ereignisse.js';

const LOG_LIMIT = 60;
const MARKER = 'Server: In der Luft ist kein erster Sprung moeglich';

// ------------------------------------------------------------ DOM-Ersatz

class FakeClassList {
  #werte = new Set();
  add(...klassen) { klassen.forEach(klasse => this.#werte.add(klasse)); }
  remove(...klassen) { klassen.forEach(klasse => this.#werte.delete(klasse)); }
  contains(klasse) { return this.#werte.has(klasse); }
  toggle(klasse) { this.#werte.has(klasse) ? this.#werte.delete(klasse) : this.#werte.add(klasse); }
}

class FakeKnoten {
  /** Zählt Neuaufbauten der KINDER — die Live-Region darf das nie tun. */
  replaceChildrenAufrufe = 0;

  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = {};
    this._text = '';
    this.title = '';
    this.id = '';
    this.className = '';
  }

  get textContent() { return this._text; }
  set textContent(wert) { this._text = String(wert); this.children = []; }

  append(...kinder) {
    for (const kind of kinder) { kind.parentNode = this; this.children.push(kind); }
  }

  prepend(...kinder) {
    for (const kind of [...kinder].reverse()) { kind.parentNode = this; this.children.unshift(kind); }
  }

  remove() {
    const eltern = this.parentNode;
    if (eltern) {
      const stelle = eltern.children.indexOf(this);
      if (stelle >= 0) eltern.children.splice(stelle, 1);
    }
    this.parentNode = null;
  }

  get lastElementChild() { return this.children.at(-1) ?? null; }
  replaceChildren(...kinder) { this.replaceChildrenAufrufe += 1; this.children = []; this.append(...kinder); }
  setAttribute(name, wert) { this.attributes[name] = String(wert); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(art, fn) { (this.listeners[art] ??= []).push(fn); }
  querySelector() { return null; }
  focus() {}
}

/** Ein Dokument mit den Elementen, die `Hud` sucht. */
function fakeDokument() {
  const elemente = new Map();
  return {
    activeElement: null,
    getElementById(id) {
      if (!elemente.has(id)) {
        const knoten = new FakeKnoten('div');
        knoten.id = id;
        elemente.set(id, knoten);
      }
      return elemente.get(id);
    },
    createElement(tagName) { return new FakeKnoten(tagName); },
  };
}

function neuerHud() {
  const dokument = fakeDokument();
  const hud = new Hud(dokument);
  return { hud, liste: hud.elements.log, dokument };
}

/** Die Texte der Protokollzeilen, neueste zuerst. */
function texte(liste) {
  return liste.children.map(kind => kind.textContent);
}

function knotenZahl(liste) {
  const zahl = liste.children.length;
  assert.ok(zahl <= LOG_LIMIT, `Das Protokoll führt ${zahl} Knoten, erlaubt sind ${LOG_LIMIT}`);
  return zahl;
}

// ------------------------------------------------------ Ton → Klasse

test('Vorrang haben Fehler, Zugwechsel und Ereignisse — Anzeige ist der Vorgabeton', () => {
  // Die Zuordnung ist die Grundlage des Vorrangs: Was hier falsch landet,
  // verliert seinen reservierten Rest (oder blockiert ihn).
  assert.equal(protokollKlasse('danger'), 'vorrang', 'Fehler');
  assert.equal(protokollKlasse('accent'), 'vorrang', 'Zugwechsel und Ereignisse');
  assert.equal(protokollKlasse('good'), 'vorrang', 'erledigte Wirkungen (Verbunden, geheilt)');
  assert.equal(protokollKlasse('notice'), 'vorrang', 'Ablehnungsbegründung (z.B. „Nur am eigenen Zug …“)');
  assert.equal(protokollKlasse('neutral'), 'rauschen', 'Anzeigearten — z.B. „X ist gelandet“');
  assert.equal(protokollKlasse(undefined), 'rauschen', 'Ohne Angabe gilt der Vorgabeton neutral');
  assert.equal(protokollKlasse('unbekannt'), 'rauschen', 'Ein fremder Ton ist keine Aussage über Wichtigkeit');
});

// ---------------------- Ablehnungsbegründungen (Ton `notice`) ----------------------

/*
 * Der Auftrag, der zu diesem Ton führte: FÜNF Stellen in `src/client/main.js`
 * protokollieren Ablehnungen mit dem Vorgabeton `neutral` — „Nur am eigenen Zug
 * kann gesprungen werden", die Serverbegründung eines abgelehnten Sprungs,
 * Abwerfen, Waffenwechsel. Genau diese Klasse darf nicht verschwinden: Der
 * Spieler drückt etwas, es passiert nichts, und er soll erfahren warum.
 *
 * Der Ton macht sie vorrangig, OHNE „danger" zu missbrauchen — `danger` heißt
 * im Haus Schaden und ist rot; eine abgelehnte Tasteneingabe sähe damit aus wie
 * ein Angriff.
 */

test('Eine Ablehnungsbegründung (`notice`) überlebt 200 Anzeigemeldungen', () => {
  const { hud, liste } = neuerHud();
  hud.log('Nur am eigenen Zug kann gesprungen werden', 'notice');

  for (let i = 0; i < 200; i += 1) hud.log(`Figur ${i} ist gelandet`);

  assert.ok(
    texte(liste).includes('Nur am eigenen Zug kann gesprungen werden'),
    'Die Begründung muss stehen bleiben — sonst ist der Tastendruck ein stummer Ausstieg',
  );
});

test('Eine Ablehnungsbegründung sieht aus wie eine Anzeigezeile, wird aber geschützt', () => {
  /*
   * Die getroffene Entscheidung in EINEM Test: gleiche FARBE wie der
   * Vorgabeton (eine Ablehnung ist kein Schaden), andere KLASSE (sie überlebt
   * dennoch 200 Anzeigemeldungen). Wer die Farbe ändert oder den Ton aus der
   * Vorrangliste nimmt, fällt hier auf.
   */
  const { hud, liste } = neuerHud();
  hud.log('Nur am eigenen Zug kann gesprungen werden', 'notice');
  hud.log('Irgendeine Anzeige', 'neutral');

  assert.equal(liste.children[1].style.color, liste.children[0].style.color,
    '`notice` wird wie `neutral` gezeichnet');
  assert.equal(liste.children[0].style.color, '#8ba0b4');
  assert.notEqual(liste.children[1].style.color, '#ef476f', 'Rot bleibt Schaden und Gefahr');

  for (let i = 0; i < 200; i += 1) hud.log(`Figur ${i} ist gelandet`);
  assert.ok(texte(liste).includes('Nur am eigenen Zug kann gesprungen werden'));
});

test('`notice` füllt dasselbe Budget wie die übrigen Vorrangmeldungen', () => {
  // Kein zweiter Sonderweg: Ablehnungen zählen im Vorrangbudget, nicht daneben.
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 100; i += 1) hud.log(`Ablehnung ${i}`, 'notice');

  assert.equal(knotenZahl(liste), 20);
  assert.equal(texte(liste)[0], 'Ablehnung 99');
  assert.ok(!texte(liste).includes('Ablehnung 0'));
});

// ------------------------------- Die Zusicherung: Rauschen verdrängt nicht

test('Eine Fehlermeldung überlebt 200 Anzeigemeldungen mit GLEICHEM Text', () => {
  const { hud, liste } = neuerHud();
  hud.log(MARKER, 'danger');

  for (let i = 0; i < 200; i += 1) hud.log('Figur A ist gelandet');

  assert.ok(texte(liste).includes(MARKER), 'Die Begründung muss noch im Protokoll stehen');
  /*
   * Reihenfolge: neueste Zeile zuerst. Die gezählte Rauschzeile steht ÜBER der
   * Meldung, weil sie später eingefügt wurde — und sie bleibt dort stehen, sie
   * wandert beim Hochzählen nicht (siehe `Hud#log`).
   */
  assert.deepEqual(texte(liste), ['Figur A ist gelandet ×200', MARKER]);
  assert.equal(knotenZahl(liste), 2);
});

test('Eine Fehlermeldung überlebt 200 Anzeigemeldungen mit VERSCHIEDENEN Texten', () => {
  // Die härtere Probe: Zusammenfassen hilft hier NICHT. Nur das reservierte
  // Budget kann die Zeile halten — genau deshalb gibt es beides.
  const { hud, liste } = neuerHud();
  hud.log(MARKER, 'danger');

  for (let i = 0; i < 200; i += 1) hud.log(`Figur ${i} ist gelandet`, 'neutral');

  assert.ok(texte(liste).includes(MARKER), 'Die Begründung muss auch im Rauschgemisch stehen bleiben');
  assert.equal(knotenZahl(liste), 60, 'Ein Vorrang-Platz, 59 Rauschzeilen — die Gesamtgrenze bleibt 60');
});

test('Ein Zugwechsel kann 200 Anzeigemeldungen ebenfalls nicht verdrängen', () => {
  const { hud, liste } = neuerHud();
  hud.log('Anna ist am Zug', 'accent');

  for (let i = 0; i < 200; i += 1) hud.log(`Figur ${i} ist gelandet`);

  assert.ok(texte(liste).includes('Anna ist am Zug'), 'Wer dran ist, muss die wichtigste Ansage bleiben');
});

test('Anzeigerauschen nutzt nur den Platz, den der Vorrang nicht braucht', () => {
  /*
   * Die reservierte Decke in Zahlen: Sind 20 Vorrangmeldungen da (das Budget),
   * bleiben dem Rauschen 40 Zeilen — mehr nicht. Ohne Vorrangmeldungen darf es
   * das Protokoll dagegen füllen (bis `LOG_LIMIT`): Ein Protokoll, das bei 40
   * Zeilen dichtmacht, obwohl keine einzige wichtige Meldung ansteht, wäre eine
   * Verschlechterung ohne Nutzen.
   */
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 20; i += 1) hud.log(`Fehler ${i}`, 'danger');
  for (let i = 0; i < 500; i += 1) hud.log(`Anzeigemeldung ${i}`, 'neutral');

  const gefuehrt = texte(liste);
  const rauschzeilen = gefuehrt.filter(text => text.startsWith('Anzeigemeldung')).length;
  const vorrangzeilen = gefuehrt.filter(text => text.startsWith('Fehler')).length;

  assert.equal(knotenZahl(liste), LOG_LIMIT, 'Die Gesamtgrenze bleibt LOG_LIMIT');
  assert.equal(vorrangzeilen, 20, 'Keine einzige Vorrangmeldung wurde verdrängt');
  assert.equal(rauschzeilen, 40, 'Das Rauschen zahlt den Überhang');
});

test('Ohne Vorrangmeldungen füllt das Rauschen das Protokoll bis LOG_LIMIT', () => {
  // Die bestehende Zusicherung der E2E-Suite (`screenreader.spec.mjs`: 80
  // Füllzeilen → 60 Knoten) bleibt damit gültig.
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 80; i += 1) hud.log(`Füllzeile ${i}`);

  assert.equal(knotenZahl(liste), LOG_LIMIT);
  assert.equal(texte(liste)[0], 'Füllzeile 79', 'Die jüngste Meldung steht oben');
});

test('Vorrangmeldungen füllen ihren reservierten Rest — und ältere fallen zuerst', () => {
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 100; i += 1) hud.log(`Fehler ${i}`, 'danger');

  const gefuehrt = texte(liste);
  assert.equal(knotenZahl(liste), 20, 'Das Vorrang-Budget ist begrenzt');
  assert.equal(gefuehrt[0], 'Fehler 99', 'Der neueste Vorrang steht oben');
  assert.equal(gefuehrt.at(-1), 'Fehler 80', 'Die 20 jüngsten Vorrangmeldungen bleiben');
  assert.ok(!gefuehrt.includes('Fehler 0'), 'Vorrang verdrängt Vorrang — nur eben nicht durch Anzeige');
});

test('Beide Budgets zusammen ergeben genau LOG_LIMIT Knoten', () => {
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 300; i += 1) hud.log(`Anzeige ${i}`, 'neutral');
  for (let i = 0; i < 300; i += 1) hud.log(`Fehler ${i}`, 'danger');

  assert.equal(knotenZahl(liste), LOG_LIMIT);
  assert.ok(texte(liste).includes('Anzeige 299'), 'Neueste Anzeige bleibt sichtbar');
  assert.ok(texte(liste).includes('Fehler 299'), 'Neuester Vorrang bleibt sichtbar');
});

// ------------------------------------------------------------- Zusammenfassen

test('Gleicher Text wird zu EINER Zeile mit Zähler — auch bei abwechselnden Figuren', () => {
  const { hud, liste } = neuerHud();
  hud.log('Anna ist gelandet');
  hud.log('Bert ist gelandet');
  hud.log('Anna ist gelandet');
  hud.log('Anna ist gelandet');

  /*
   * Die gezählte Zeile bleibt an IHREM Platz stehen und wandert nicht nach
   * oben: Sie ist kein neues Ereignis, sondern dieselbe Meldung öfter. Wer
   * strikt chronologische Reihenfolge braucht, darf nicht zusammenfassen —
   * für ein Ereignisprotokoll ist die Zahl aussagekräftiger als 40 gleiche
   * Zeilen. Diese Entscheidung ist hier festgehalten, damit sie nicht
   * versehentlich aufgehoben wird.
   */
  assert.deepEqual(texte(liste), ['Bert ist gelandet', 'Anna ist gelandet ×3']);
  assert.equal(knotenZahl(liste), 2, 'Die Wiederholungen erzeugen keine neuen Knoten');
});

test('Die Live-Region wird beim Zusammenfassen NICHT neu aufgebaut', () => {
  /*
   * Der Kern der Barrierefreiheit: `#log-list` ist `role="log"` mit
   * `aria-relevant="additions"`. Ein Neuaufbau der Liste würde einen
   * Screenreader die ganze Region vorlesen lassen — bei jeder Meldung. Beim
   * Zusammenfassen ändert sich nur der TEXT eines vorhandenen Knotens:
   * derselbe Knoten, dieselbe Kinderliste, kein `replaceChildren`.
   */
  const { hud, liste } = neuerHud();
  hud.log('Anna ist gelandet');
  const knotenVorher = liste.children[0];
  const kinderVorher = [...liste.children];

  hud.log('Anna ist gelandet');
  hud.log('Anna ist gelandet');

  assert.equal(liste.children[0], knotenVorher, 'Es ist DERSELBE Knoten');
  assert.equal(liste.children.length, kinderVorher.length, 'Die Kinderliste wächst nicht');
  assert.equal(liste.children[0].parentNode, liste, 'Der Knoten hängt weiter in der Liste');
  assert.equal(knotenVorher.textContent, 'Anna ist gelandet ×3');
  assert.equal(liste.replaceChildrenAufrufe, 0, 'Die Region wurde kein einziges Mal neu aufgebaut');
});

test('Eine spätere gleiche Vorrangmeldung ist ein NEUES Ereignis, keine Hochzählung', () => {
  /*
   * Die Gegenprobe zum Zusammenfassen: „A ist am Zug" der nächsten Runde darf
   * nicht in der Zeile der vorigen Runde verschwinden — sonst fiele die
   * Zugwechsel-Ansage weg (sie ist die wichtigste Ansage des Protokolls, siehe
   * den Kommentar an `Hud#update`).
   */
  const { hud, liste } = neuerHud();
  hud.log('Anna ist am Zug', 'accent');
  hud.log('Bert ist am Zug', 'accent');
  hud.log('Anna ist am Zug', 'accent');

  assert.deepEqual(texte(liste), ['Anna ist am Zug', 'Bert ist am Zug', 'Anna ist am Zug']);
  assert.equal(knotenZahl(liste), 3);
});

test('Eine unmittelbar folgende Wiederholung wird auch bei Vorrang zusammengefasst', () => {
  // Tastenspam auf dieselbe Sperre: fünfmal dieselbe Begründung sind EINE
  // Meldung mit Zähler, nicht fünf Zeilen.
  const { hud, liste } = neuerHud();
  for (let i = 0; i < 5; i += 1) hud.log(MARKER, 'danger');

  assert.deepEqual(texte(liste), [`${MARKER} ×5`]);
  assert.equal(knotenZahl(liste), 1);
});

test('Nach clearLog beginnt ein Text wieder bei eins', () => {
  // Der Zähler hängt an der ZEILE, nicht am Text: Ist die Zeile weg (Match-
  // wechsel), ist auch die Zahl weg.
  const { hud, liste } = neuerHud();
  hud.log('Anna ist gelandet');
  hud.log('Anna ist gelandet');
  hud.clearLog();
  assert.equal(knotenZahl(liste), 0);

  hud.log('Anna ist gelandet');
  assert.deepEqual(texte(liste), ['Anna ist gelandet']);
});

test('Eine verdrängte Rauschzeile kommt als neue Zeile mit Zähler eins zurück', () => {
  const { hud, liste } = neuerHud();
  hud.log('Anna ist gelandet');
  for (let i = 0; i < 100; i += 1) hud.log(`Anzeige ${i}`, 'neutral');
  assert.ok(!texte(liste).includes('Anna ist gelandet'), 'Die älteste Rauschzeile ist hinausgefallen');

  hud.log('Anna ist gelandet');
  assert.equal(texte(liste)[0], 'Anna ist gelandet', 'Ohne alten Zähler — die Zeile war weg');
});

// ------------------------------------------------- Echter Weg: laufendes Match

/**
 * Fährt ein echtes Match und leitet die Ereignisse über die ECHTE Tabelle
 * (`src/client/ereignisse.js`) in das HUD — derselbe Weg wie `main.js`
 * (`#render` → `hud.update`, dann `verarbeiteLokal` je Ereignis).
 */
function fahreMatch({ figuren = 4, preset = 'hills', ticks = 300, seed = 4242, markeBeiTick = 60 }) {
  const match = new MatchController({
    seed,
    teams: figuren === 4 ? 2 : 4,
    playersPerTeam: figuren === 4 ? 2 : 10,
    preset,
    turnDurationMs: 30_000,
    maxRounds: 12,
  });
  match.start();

  const { hud, liste, dokument } = neuerHud();
  dokument.getElementById('log-list');
  const namen = new Map(match.getState().entities.map(e => [e.entityId, e.label]));

  /*
   * Der Kontext für `EREIGNIS_WIRKUNGEN`. Er ist ABSICHTLICH unvollständig
   * (kein Renderer, kein Klang) — das Modul meldet fehlende Felder selbst auf
   * die Konsole, statt still zu schweigen. Für das Protokoll reichen `hud`,
   * `match`, `nameOf` und der Fernzustand.
   */
  const kontext = {
    hud,
    match,
    fernzustand: { status: () => 'playing', setzeStatus() {}, setzeSieger() {}, setzeEinschnitt() {} },
    nameOf: id => namen.get(id) ?? `#${id}`,
  };

  let takte = 0;
  for (; takte < ticks && match.status === 'playing'; takte += 1) {
    match.step();
    hud.update(match.getState(), { aim: null, onWeaponSelect: null });
    for (const ereignis of match.consumeEvents()) verarbeiteLokal(kontext, ereignis);
    if (takte === markeBeiTick) hud.log(MARKER, 'danger');
  }
  return { hud, liste, takte, match, texte: texte(liste) };
}

test('Am laufenden Match: die Servermeldung überlebt 240 Takte Anzeigerauschen', () => {
  /*
   * Zahl aus der Messung: VOR der Änderung fiel dieselbe Meldung nach 105
   * Takten (1,8 s) aus dem Protokoll (4 Figuren, hills, ungefiltert:
   * 34,5 Meldungen je Sekunde). Der Test fährt 300 Takte und setzt die
   * Meldung nach 60 Takten ein — 240 Takte später muss sie noch da sein.
   */
  const { takte, texte: gefuehrt } = fahreMatch({ figuren: 4, preset: 'hills', ticks: 300, markeBeiTick: 60 });

  assert.equal(takte, 300, 'Es müssen wirklich 300 Takte gefahren worden sein');
  assert.ok(gefuehrt.includes(MARKER), `Nach ${takte} Takten fehlt die Servermeldung`);
  assert.ok(
    gefuehrt.some(zeile => zeile.includes('ist gelandet')),
    'Kontrolle: Es gab wirklich Landungsrauschen — sonst prüft der Test nichts',
  );
});

test('Am laufenden Match: das Protokoll bleibt unter LOG_LIMIT — das Rauschen belegt wenige Zeilen', () => {
  /*
   * Bei 4 Figuren sind genau 4 Landungstexte im Umlauf. Ohne Zusammenfassen
   * liefen in 300 Takten ~172 Landungszeilen ein und das Protokoll stand bei
   * 60 Knoten; mit Zusammenfassen belegt dasselbe Rauschen vier Zeilen. Jeder
   * Text kommt höchstens einmal vor.
   */
  const { liste } = fahreMatch({ figuren: 4, preset: 'hills', ticks: 300 });
  const gefuehrt = texte(liste);

  assert.ok(knotenZahl(liste) < LOG_LIMIT, `Nur ${gefuehrt.length} Knoten statt ${LOG_LIMIT}`);
  assert.equal(new Set(gefuehrt).size, gefuehrt.length, 'Kein Text doppelt — Wiederholungen wurden gezählt');
  assert.ok(
    gefuehrt.filter(zeile => zeile.includes('ist gelandet')).length <= 4,
    'Höchstens eine Zeile je Figur',
  );
});
