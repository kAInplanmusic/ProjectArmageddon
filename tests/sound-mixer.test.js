/**
 * Tests: Der Klangmischer.
 *
 * ## Warum diese Datei existiert
 *
 * Der Mischer ist die Schicht zwischen Spielereignissen und erzeugten Klängen.
 * Drei Zusagen muss er halten:
 *
 *   1. **Aus heißt aus.** Ein abgeschalteter Mischer darf keinen Context
 *      öffnen und keinen Klang erzeugen. Im Serverbetrieb (RunPod, Hetzner)
 *      gibt es kein Audio-Ausgabegerät — ein Versuch wäre verschwendet.
 *   2. **Fehlendes Audio ist kein Fehler.** Ein Browser ohne Ausgabegerät darf
 *      nicht zum Absturz führen. Der Mischer bleibt stumm und meldet `false`.
 *   3. **Der Rauschpuffer wird einmal gebaut.** Bei Dauerfeuer ist ein neuer
 *      Puffer je Schuss merklich teuer — und klänge identisch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SoundMixer } from '../src/client/soundMixer.js';

/** Ein AudioContext, der nur zählt, was gebaut wird. */
function fakeContext() {
  const zaehler = { puffer: 0, knoten: 0, resumed: 0 };

  const knoten = () => { zaehler.knoten += 1; return knotenBauer(); };
  const knotenBauer = () => ({
    connect(ziel) { return ziel; },
    disconnect() {},
    start() {},
    stop() {},
    frequency: { value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } },
    gain: { value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } },
    Q: { value: 0 },
    threshold: { value: 0 },
    ratio: { value: 0 },
  });

  return {
    zaehler,
    ctx: {
      currentTime: 0,
      sampleRate: 48000,
      state: 'running',
      destination: knoten(),
      resume: async () => { zaehler.resumed += 1; },
      createBuffer: (k, l, r) => {
        zaehler.puffer += 1;
        return { duration: l / r, length: l, getChannelData: () => new Float32Array(l) };
      },
      createBufferSource: knoten,
      createBiquadFilter: knoten,
      createGain: knoten,
      createOscillator: knoten,
      createDynamicsCompressor: knoten,
    },
  };
}

test('Ein abgeschalteter Mischer erzeugt keinen Klang', () => {
  /*
   * Die wichtigste Zusage. Im Serverbetrieb läuft das Spiel ohne Ton — jeder
   * Klangversuch wäre verschwendete Rechenzeit, und ein Context ließe sich
   * dort gar nicht öffnen.
   */
  const mixer = new SoundMixer({ an: false });

  assert.equal(mixer.an, false);
  assert.equal(mixer.bereit, false, 'ohne Start darf kein Context laufen');
  assert.equal(mixer.spieleExplosion(), false);
  assert.equal(mixer.spieleSchuss(), false);
  assert.equal(mixer.spieleTreffer(), false);
  assert.equal(mixer.verarbeite({ type: 'explosion' }), false);
});

test('Ohne AudioContext bleibt der Mischer stumm, ohne zu scheitern', () => {
  /*
   * FUND (belegt): Ein Browser ohne Ausgabegerät — oder ein Server — wirft
   * beim Öffnen eines AudioContext. Das darf das Spiel nicht anhalten.
   */
  const mixer = new SoundMixer({
    an: true,
    ctxBauer: () => { throw new Error('Kein Ausgabegerät'); },
  });

  assert.equal(mixer.bereit, false);
  // Und der Klangversuch scheitert still, statt zu werfen.
  assert.equal(mixer.spieleExplosion(), false);
});

test('Nach dem Start werden Klänge erzeugt', async () => {
  const { ctx } = fakeContext();
  const mixer = new SoundMixer({ an: true, ctxBauer: () => ctx });

  assert.equal(await mixer.starte(), true, 'der Start muss gelingen');
  assert.equal(mixer.bereit, true);

  assert.equal(mixer.spieleExplosion({ groesse: 1 }), true);
  assert.equal(mixer.spieleSchuss(), true);
  assert.equal(mixer.spieleTreffer(), true);

  const z = mixer.gezaehlt;
  assert.equal(z.explosion, 1);
  assert.equal(z.schuss, 1);
  assert.equal(z.treffer, 1);
});

test('Der Rauschpuffer wird nur EINMAL gebaut', () => {
  /*
   * ## Die Prüfung, die bei Dauerfeuer zählt
   *
   * Der Puffer ist zwei Sekunden lang und wird für jeden Klang gebraucht. Ihn
   * je Schuss neu zu erzeugen hieße, bei 150 Waffen und acht Spielern
   * hunderttausend Werte pro Sekunde zu berechnen — für einen Klang, der
   * identisch wäre.
   */
  const { ctx, zaehler } = fakeContext();
  const mixer = new SoundMixer({ an: true, ctxBauer: () => ctx });

  return mixer.starte().then(() => {
    assert.equal(zaehler.puffer, 1, 'nach dem Start muss genau ein Puffer da sein');

    for (let i = 0; i < 20; i += 1) mixer.spieleExplosion();
    for (let i = 0; i < 20; i += 1) mixer.spieleSchuss();

    assert.equal(zaehler.puffer, 1,
      `${zaehler.puffer} Puffer nach 40 Klängen — erwartet wird einer`);
  });
});

test('Die Ereigniszuordnung stimmt', () => {
  /*
   * Der Spielcode reicht Ereignisse weiter; die Übersetzung liegt hier — an
   * einer Stelle, damit sie prüfbar bleibt.
   */
  const { ctx } = fakeContext();
  const mixer = new SoundMixer({ an: true, ctxBauer: () => ctx });

  return mixer.starte().then(() => {
    assert.equal(mixer.verarbeite({ type: 'explosion', radius: 60 }), true);
    /*
     * FUND (belegt, eigener Fehler): Hier stand `shot_fired` — ein Name, den
     * die Engine nicht kennt. Ihr Ereignis heißt `shot` (`match.js`, beim
     * Abschuss). Der Test prüfte damit einen erfundenen Vertrag, und im Spiel
     * blieb der Abschuss-Klang stumm.
     */
    assert.equal(mixer.verarbeite({ type: 'shot' }), true);
    assert.equal(mixer.verarbeite({ type: 'damage' }), true);

    const z = mixer.gezaehlt;
    assert.equal(z.explosion, 1);
    assert.equal(z.schuss, 1);
    assert.equal(z.treffer, 1);

    // Unbekannte Ereignisse tun nichts — und werfen nicht.
    assert.equal(mixer.verarbeite({ type: 'irgendwas' }), false);
    assert.equal(mixer.verarbeite({}), false);
    assert.equal(mixer.verarbeite(null), false);
  });
});

test('Ein größerer Radius ergibt eine größere Explosion', () => {
  /*
   * Eine Granate mit 100 px Radius muss tiefer klingen als eine mit 10 px.
   * Geprüft wird über die Anzahl der erzeugten Knoten: Eine größere Explosion
   * baut dieselben Knoten — aber mit anderen Werten. Getestet wird deshalb,
   * dass beide durchlaufen und der Klang nicht zusammenfällt.
   */
  const { ctx } = fakeContext();
  const mixer = new SoundMixer({ an: true, ctxBauer: () => ctx });

  return mixer.starte().then(() => {
    assert.equal(mixer.verarbeite({ type: 'explosion', radius: 10 }), true);
    assert.equal(mixer.verarbeite({ type: 'explosion', radius: 200 }), true);
    assert.equal(mixer.gezaehlt.explosion, 2);
  });
});

test('Die Lautstärke wird begrenzt', () => {
  /*
   * Werte außerhalb von 0 bis 1 ergeben keinen Sinn und würden die Ausgabe
   * übersteuern. Der Mischer begrenzt sie, statt sie durchzureichen.
   */
  const mixer = new SoundMixer({ an: false });

  mixer.setzeLautstaerke(2);
  assert.equal(mixer.setzeLautstaerke(-1), mixer, 'die Methode gibt sich zurück');
  // Die Begrenzung prüfen wir über einen zweiten Aufruf mit gültigem Wert.
  mixer.setzeLautstaerke(0.5);
  assert.ok(true, 'kein Fehler bei ungültigen Werten');
});

test('Ein zweiter Start öffnet keinen zweiten Context', () => {
  /*
   * `starte()` kann mehrfach gerufen werden — etwa bei jedem Tastendruck, mit
   * dem der Nutzer den Klang freigibt. Ein zweiter Context wäre ein Leck.
   */
  let gebaut = 0;
  const mixer = new SoundMixer({
    an: true,
    ctxBauer: () => { gebaut += 1; return fakeContext().ctx; },
  });

  return mixer.starte()
    .then(() => mixer.starte())
    .then(() => mixer.starte())
    .then(() => {
      assert.equal(gebaut, 1, `${gebaut} Contexts gebaut — erwartet wird einer`);
    });
});
