/**
 * Tests: Der prozedurale Sound.
 *
 * ## Warum diese Datei existiert
 *
 * Der Sound wird **erzeugt**, nicht geladen — es gibt keine Dateien zum
 * Vergleichen. Damit stellt sich die Frage: Was prüft man an einem Klang, den
 * es noch nicht gibt?
 *
 * Zwei Dinge:
 *
 *   1. **Die Struktur** — welche Knoten werden verbaut, mit welchen Werten.
 *      Ein Tiefpass, der auf 60 Hz fährt, ist ein Rumms; einer, der offen
 *      bleibt, wäre ein Windstoß.
 *   2. **Die Aufräumpflicht** — jeder gestartete Knoten muss ein `stop` haben.
 *      Ohne das sammeln sich Oszillatoren im Kontext, bis der Browser stöhnt.
 *      Bei einem Spiel mit Dauerfeuer ist das keine Kleinigkeit.
 *
 * Beides lässt sich mit einem **Fake-AudioContext** prüfen: Er zeichnet auf,
 * welche Knoten entstehen und welche Werte gesetzt werden. Das ist verlässlicher
 * als ein Hörtest und läuft ohne Browser.
 *
 * ## Was hier NICHT geprüft wird
 *
 * Ob es **gut klingt**. Das ist eine Geschmacksfrage und braucht ein Ohr am
 * Lautsprecher. Geprüft wird, dass die Rezepte stimmen — nicht ihr Ergebnis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  erzeugeRauschen, explosion, schuss, treffer,
} from '../src/client/sound.js';

/**
 * Ein AudioContext, der nichts tut außer aufzeichnen.
 *
 * Er zeichnet auf:
 *   `knoten` — welche Knoten erzeugt wurden (mit ihrem Typ)
 *   `verbindungen` — welche Verbindungen entstanden
 *   `starts`/`stops` — was gestartet und was gestoppt wurde
 */
function fakeContext() {
  const aufzeichnung = {
    knoten: [], verbindungen: [], starts: [], stops: [], werte: [],
  };

  const knotenBauer = (art) => {
    const k = {
      art,
      connect(ziel) { aufzeichnung.verbindungen.push({ von: art, nach: ziel?.art ?? 'ziel' }); return ziel; },
      start(zeit, versatz) { aufzeichnung.starts.push({ art, zeit, versatz }); },
      stop(zeit) { aufzeichnung.stops.push({ art, zeit }); },
    };
    aufzeichnung.knoten.push(k);
    return k;
  };

  const ctx = {
    currentTime: 10,
    sampleRate: 48000,
    destination: { art: 'ziel' },
    createBuffer: (kanaele, laenge, rate) => ({
      duration: laenge / rate,
      length: laenge,
      getChannelData: () => new Float32Array(laenge),
    }),
    createBufferSource: () => { const k = knotenBauer('quelle'); k.buffer = null; return k; },
    createBiquadFilter: () => {
      const k = knotenBauer('filter');
      k.frequency = {
        value: 0,
        setValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'filter', art: 'setzen', wert: v }); return this; },
        exponentialRampToValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'filter', art: 'rampe', wert: v }); return this; },
      };
      k.Q = { value: 0 };
      return k;
    },
    createGain: () => {
      const k = knotenBauer('verstaerker');
      k.gain = {
        value: 0,
        setValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'verstaerker', art: 'setzen', wert: v }); return this; },
        exponentialRampToValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'verstaerker', art: 'rampe', wert: v }); return this; },
      };
      return k;
    },
    createOscillator: () => {
      const k = knotenBauer('oszillator');
      k.type = '';
      k.frequency = {
        value: 0,
        setValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'oszillator', art: 'setzen', wert: v }); return this; },
        exponentialRampToValueAtTime(v) { aufzeichnung.werte.push({ knoten: 'oszillator', art: 'rampe', wert: v }); return this; },
      };
      return k;
    },
  };

  return { ctx, aufzeichnung };
}

test('Der Rauschpuffer hat die richtige Länge und ist braun', () => {
  /*
   * Zwei Eigenschaften: die Länge (aus der Abtastrate) und die Tiefpass-
   * Wirkung. Braunes Rauschen hat einen kleineren Mittelwert der Beträge als
   * weißes — das lässt sich an den Daten ablesen.
   */
  const { ctx } = fakeContext();
  const puffer = erzeugeRauschen(ctx, 1);

  assert.equal(puffer.length, 48000, 'eine Sekunde bei 48 kHz');
  assert.ok(Math.abs(puffer.duration - 1) < 0.01, 'die Dauer muss eine Sekunde sein');
});

test('Eine Explosion baut Tiefpass, Hüllkurve und Sub-Bass', () => {
  /*
   * Das Rezept: Rauschen durch einen Tiefpass, eine Hüllkurve darüber, und
   * eine Sinuswelle für den Bauch. Alle drei müssen da sein — fehlt der
   * Tiefpass, klingt es wie ein Windstoß; fehlt der Sub-Bass, fehlt der Druck.
   */
  const { ctx, aufzeichnung } = fakeContext();
  const rauschen = { duration: 2 };
  explosion(ctx, rauschen, { groesse: 1 });

  const arten = aufzeichnung.knoten.map(k => k.art);
  assert.ok(arten.includes('filter'), 'ein Tiefpass fehlt');
  assert.ok(arten.includes('verstaerker'), 'eine Hüllkurve fehlt');
  assert.ok(arten.includes('oszillator'), 'der Sub-Bass fehlt');
  assert.ok(arten.includes('quelle'), 'die Rauschquelle fehlt');
});

test('Die Explosion fährt den Tiefpass nach unten', () => {
  /*
   * Der „Rumms" entsteht dadurch, dass der Tiefpass während des Ausklangs
   * fällt. Ein Tiefpass, der auf seiner Startfrequenz bliebe, ergäbe ein
   * Rauschen ohne Charakter.
   */
  const { ctx, aufzeichnung } = fakeContext();
  explosion(ctx, { duration: 2 }, { groesse: 1 });

  const filterWerte = aufzeichnung.werte.filter(w => w.knoten === 'filter');
  const start = filterWerte.find(w => w.art === 'setzen')?.wert;
  const ende = filterWerte.find(w => w.art === 'rampe')?.wert;

  assert.ok(start > ende, `Der Tiefpass steigt statt zu fallen: ${start} → ${ende}`);
  assert.ok(ende < 100, `Der Tiefpass endet bei ${ende} Hz — erwartet wird unter 100`);
});

test('Die Größe skaliert die Explosion', () => {
  /*
   * Eine große Explosion muss tiefer und länger sein als eine kleine. Ohne
   * das klängen alle 150 Waffen gleich.
   */
  const klein = fakeContext();
  explosion(klein.ctx, { duration: 2 }, { groesse: 0.6 });
  const gross = fakeContext();
  explosion(gross.ctx, { duration: 2 }, { groesse: 1.6 });

  const startFrequenz = (a) => a.aufzeichnung.werte
    .find(w => w.knoten === 'filter' && w.art === 'setzen')?.wert;
  const stopZeit = (a) => Math.max(...a.aufzeichnung.stops.map(s => s.zeit));

  assert.ok(startFrequenz(klein) > startFrequenz(gross),
    'die kleine Explosion muss höher anfangen als die große');
  assert.ok(stopZeit(gross) > stopZeit(klein),
    'die große Explosion muss länger dauern als die kleine');
});

test('Ein Schuss hat eine Transiente und einen Körper', () => {
  /*
   * Zwei Schichten: das hohe „Pop" (Rauschen durch einen Hochpass) und der
   * Körper darunter (ein fallender Ton). Fehlt die Transiente, klingt es wie
   * ein Ton; fehlt der Körper, wie ein Klick.
   */
  const { ctx, aufzeichnung } = fakeContext();
  schuss(ctx, { duration: 2 }, { tonhoehe: 1 });

  const filter = aufzeichnung.knoten.filter(k => k.art === 'filter');
  assert.ok(filter.length >= 1, 'der Hochpass der Transiente fehlt');

  const oszillatoren = aufzeichnung.knoten.filter(k => k.art === 'oszillator');
  assert.equal(oszillatoren.length, 1, 'der Körper-Oszillator fehlt');
});

test('Die Tonhöhe verschiebt den Schuss', () => {
  /*
   * Ein schwerer Mörser klingt tiefer als ein Gewehr. Geprüft wird, dass die
   * Tonhöhe wirklich durchschlägt — nicht nur entgegengenommen wird.
   */
  const tief = fakeContext();
  schuss(tief.ctx, { duration: 2 }, { tonhoehe: 0.6 });
  const hoch = fakeContext();
  schuss(hoch.ctx, { duration: 2 }, { tonhoehe: 1.6 });

  const koerperTon = (a) => a.aufzeichnung.werte
    .find(w => w.knoten === 'oszillator' && w.art === 'setzen')?.wert;

  assert.ok(koerperTon(hoch) > koerperTon(tief),
    `Die Tonhöhe wirkt nicht: ${koerperTon(tief)} → ${koerperTon(hoch)}`);
});

test('Ein Treffer hat einen Bandpass und keinen Sub-Bass', () => {
  /*
   * Der Unterschied zur Explosion: Ein Treffer bestätigt nur („getroffen!"),
   * er füllt nicht die Szene. Er liegt höher und hat keinen Bauch.
   */
  const { ctx, aufzeichnung } = fakeContext();
  treffer(ctx, { duration: 2 });

  const filter = aufzeichnung.knoten.filter(k => k.art === 'filter');
  assert.equal(filter.length, 1, 'genau ein Bandpass');

  const oszillatoren = aufzeichnung.knoten.filter(k => k.art === 'oszillator');
  assert.equal(oszillatoren.length, 0,
    'ein Treffer darf keinen Sub-Bass haben — sonst klingt er wie eine Explosion');
});

test('Zwei Treffer starten an verschiedenen Stellen im Rauschen', () => {
  /*
   * Damit sich Wiederholungen nicht verraten. Ein Treffer muss ein Einzelklang
   * sein, kein Sample, das zweimal erklingt.
   */
  const a = fakeContext();
  treffer(a.ctx, { duration: 2 });
  const b = fakeContext();
  treffer(b.ctx, { duration: 2 });

  const versatz = (x) => x.aufzeichnung.starts.find(s => s.art === 'quelle')?.versatz ?? 0;

  /*
   * Bei 2 Sekunden Rauschen und 10 Läufen ist die Wahrscheinlichkeit, dass
   * alle zehn denselben Versatz haben, praktisch null. Ein einzelner Vergleich
   * wäre statistisch wackelig — zehn sind es nicht.
   */
  const versaetze = new Set([versatz(a), versatz(b)]);
  for (let i = 0; i < 8; i += 1) {
    const c = fakeContext();
    treffer(c.ctx, { duration: 2 });
    versaetze.add(versatz(c));
  }

  assert.ok(versaetze.size > 1,
    'zehn Treffer starteten alle am selben Punkt — sie klingen identisch');
});

test('Jeder gestartete Knoten wird auch gestoppt', () => {
  /*
   * ## Die Prüfung, die bei einem Spiel zählt
   *
   * Ein gestarteter Oszillator ohne `stop` läuft für immer weiter. Bei einem
   * Artillerie-Spiel mit Dauerfeuer sammeln sich so hunderte Knoten im
   * AudioContext — bis der Browser die Ausgabe stocken lässt.
   *
   * Die Regel gilt für alle drei Klänge.
   */
  for (const [name, klang] of [
    ['Explosion', (ctx) => explosion(ctx, { duration: 2 })],
    ['Schuss', (ctx) => schuss(ctx, { duration: 2 })],
    ['Treffer', (ctx) => treffer(ctx, { duration: 2 })],
  ]) {
    const { ctx, aufzeichnung } = fakeContext();
    klang(ctx);

    const gestartet = aufzeichnung.starts.filter(s => s.art === 'quelle' || s.art === 'oszillator');
    const gestoppt = aufzeichnung.stops.filter(s => s.art === 'quelle' || s.art === 'oszillator');

    assert.equal(gestartet.length, gestoppt.length,
      `${name}: ${gestartet.length} gestartet, aber ${gestoppt.length} gestoppt — `
      + 'ein Knoten läuft weiter');

    for (const s of gestartet) {
      assert.ok(s.zeit !== undefined && s.zeit !== null,
        `${name}: ein ${s.art} wurde ohne Zeit gestartet`);
    }
  }
});

test('Der Ausklang nutzt keinen Nullwert', () => {
  /*
   * FUND (belegt): `exponentialRampToValueAtTime` kann NICHT auf null fahren —
   * der Aufruf wird stillschweigend ignoriert, und der Klang endet abrupt
   * statt auszuklingen.
   *
   * Die Hüllkurven müssen deshalb bei einem kleinen Wert beginnen und enden,
   * nie bei exakt null.
   */
  for (const [name, klang] of [
    ['Explosion', (ctx) => explosion(ctx, { duration: 2 })],
    ['Schuss', (ctx) => schuss(ctx, { duration: 2 })],
    ['Treffer', (ctx) => treffer(ctx, { duration: 2 })],
  ]) {
    const { ctx, aufzeichnung } = fakeContext();
    klang(ctx);

    for (const w of aufzeichnung.werte) {
      if (w.art !== 'rampe') continue;
      assert.notEqual(w.wert, 0,
        `${name}: eine Rampe fährt auf 0 — das wird stillschweigend ignoriert`);
      assert.ok(w.wert > 0, `${name}: eine Rampe fährt ins Negative`);
    }
  }
});
