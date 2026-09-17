/**
 * Prozeduraler Sound — erzeugt, nicht geladen.
 *
 * ## Warum erzeugt statt geladen
 *
 * Ein Browser-Spiel mit 150 Waffen bräuchte 150 Schussdateien. Das hieße:
 * hunderte Kilobyte Downloads, eine Warteliste beim ersten Schuss — und für
 * jede Datei eine Lizenzfrage.
 *
 * Erzeugter Sound hat nichts davon: Er entsteht im Augenblick des Schusses,
 * wiegt null Byte, und es gibt keine Lizenz, die man prüfen müsste.
 *
 * ## Woher die Rezepte kommen
 *
 * Die Bausteine stammen aus einer Recherche (docs/recherche/sound-und-juice.md).
 * Die Quellen sind einzeln geprüft:
 *
 *   MDN „Advanced techniques" — Code-Beispiele unter **CC0-1.0**,
 *   also frei übernehmbar, auch ohne Namensnennung.
 *
 *   Die Klangrezepte (Rauschen → Tiefpass → Ausklang) sind Allgemeingut der
 *   Synthese und in der Web-Audio-Community seit Jahren dokumentiert.
 *
 * ## Die drei Klänge, die dieses Modul erzeugt
 *
 *   `explosion` — für Einschläge. Braunes Rauschen (tiefer als weißes) mit
 *                 Sub-Bass-Anteil; die Größe skaliert alles.
 *   `schuss`    — für den Abschuss. Harte Transiente, kurzer Körper.
 *   `treffer`   — für Schaden am Ziel. Kurz, hell, ohne Nachhall.
 *
 * ## Was dieses Modul NICHT tut
 *
 * Es spielt nichts ab und kennt keinen Spielzustand. Es ist eine reine
 * Klangquelle: Wer sie nutzt, entscheidet, wann gespielt wird. Damit bleibt
 * sie testbar — ein Klang lässt sich auf seine Parameter prüfen, ohne dass ein
 * Browser laufen muss.
 *
 * @module sound
 */

/**
 * Erzeugt einen Rausch-Puffer.
 *
 * ## Warum braun und nicht weiß
 *
 * Weißes Rauschen hat gleich viel Energie in allen Frequenzen — es klingt
 * hell und dünn. Braunes Rauschen ist tieflastig: Jeder Wert ist der
 * vorherige, leicht verschoben. Für eine Explosion klingt das **fetter**,
 * weil der Bauch fehlt, den weiße Explosionen haben.
 *
 * Der Puffer wird EINMAL erzeugt und für alle Explosionen wiederverwendet.
 * Ein neuer Puffer je Schuss wäre bei 150 Waffen und Dauerfeuer merklich
 * teuer — und klänge identisch.
 *
 * @param {AudioContext} ctx
 * @param {number} [sekunden]
 * @returns {AudioBuffer}
 */
export function erzeugeRauschen(ctx, sekunden = 2) {
  const laenge = Math.floor(ctx.sampleRate * sekunden);
  const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
  const daten = puffer.getChannelData(0);

  let letzter = 0;
  for (let i = 0; i < laenge; i += 1) {
    const weiss = Math.random() * 2 - 1;
    /*
     * Der braune Filter: Ein Tiefpass mit sehr niedriger Grenzfrequenz.
     * `(letzter + 0,02 × weiss) / 1,02` ist die übliche Näherung — sie
     * verschiebt das Spektrum nach unten, ohne bei 0 hängen zu bleiben.
     */
    letzter = (letzter + 0.02 * weiss) / 1.02;
    // Die Verstärkung holt den Pegel zurück: Braunes Rauschen ist von sich
    // aus leiser als weißes.
    daten[i] = letzter * 3.5;
  }
  return puffer;
}

/**
 * Eine Explosion.
 *
 * ## Die drei Anteile
 *
 * **Rauschen** — der Hauptklang. Ein Tiefpass fährt während des Ausklangs von
 * 1800/size Hz auf 60 Hz herunter. Das ist der „Rumms": Je tiefer der Filter,
 * desto mehr verschwindet der helle Anteil, und es bleibt der Bauch.
 *
 * **Hüllkurve** — harter Attack (8 ms) und langer Ausklang. Der harte Attack
 * macht den Einschlag; ohne ihn klänge es wie ein Windstoß.
 *
 * **Sub-Bass** — eine Sinuswelle, die von 120/size auf 28 Hz fällt. Sie ist
 * der eigentliche Druck: Frequenzen unter 60 Hz hört man kaum, man spürt sie.
 *
 * @param {AudioContext} ctx
 * @param {AudioBuffer} rauschen - aus `erzeugeRauschen`
 * @param {object} optionen
 * @param {number} [optionen.groesse] - 0,6 klein bis 1,6 groß
 * @param {number} [optionen.lautstaerke]
 * @param {number} [optionen.zeit] - Startzeit in Kontextsekunden
 */
export function explosion(ctx, rauschen, {
  groesse = 1, lautstaerke = 1, zeit = ctx.currentTime, ziel = null,
} = {}) {
  const zielKnoten = ziel ?? ctx.destination;

  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschen;

  const tiefpass = ctx.createBiquadFilter();
  tiefpass.type = 'lowpass';
  tiefpass.frequency.setValueAtTime(1800 / groesse, zeit);
  tiefpass.frequency.exponentialRampToValueAtTime(60, zeit + 0.45 * groesse);

  const huelle = ctx.createGain();
  /*
   * Die Hüllkurve beginnt bei einem SEHR kleinen Wert, nicht bei null:
   * `exponentialRampToValueAtTime` kann nicht auf null fahren — das würde
   * stillschweigend ignoriert.
   */
  huelle.gain.setValueAtTime(0.0001, zeit);
  huelle.gain.exponentialRampToValueAtTime(lautstaerke, zeit + 0.008);
  huelle.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.5 * groesse);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120 / groesse, zeit);
  sub.frequency.exponentialRampToValueAtTime(28, zeit + 0.35 * groesse);

  const subHuelle = ctx.createGain();
  subHuelle.gain.setValueAtTime(0.9 * lautstaerke, zeit);
  subHuelle.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.4 * groesse);

  quelle.connect(tiefpass).connect(huelle).connect(zielKnoten);
  sub.connect(subHuelle).connect(zielKnoten);

  quelle.start(zeit);
  quelle.stop(zeit + 0.6 * groesse);
  sub.start(zeit);
  sub.stop(zeit + 0.5 * groesse);

  return { ende: zeit + 0.6 * groesse };
}

/**
 * Ein Abschuss.
 *
 * Zwei Schichten: eine harte, hohe Transiente (das „Pop") und ein kurzer
 * Körper darunter. Die Tonhöhe hängt an der Waffe — ein schwerer Mörser klingt
 * tiefer als ein Scharfschützengewehr.
 *
 * @param {AudioContext} ctx
 * @param {AudioBuffer} rauschen
 * @param {object} optionen
 * @param {number} [optionen.tonhoehe] - 1 = mittel, 0,6 tief, 1,6 hoch
 * @param {number} [optionen.lautstaerke]
 * @param {number} [optionen.zeit]
 */
export function schuss(ctx, rauschen, {
  tonhoehe = 1, lautstaerke = 1, zeit = ctx.currentTime, ziel = null,
} = {}) {
  const zielKnoten = ziel ?? ctx.destination;

  // Die Transiente: hohes Rauschen, sehr kurz.
  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschen;

  const hochpass = ctx.createBiquadFilter();
  hochpass.type = 'highpass';
  hochpass.frequency.value = 800 * tonhoehe;

  const huelle = ctx.createGain();
  huelle.gain.setValueAtTime(0.8 * lautstaerke, zeit);
  huelle.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.08);

  quelle.connect(hochpass).connect(huelle).connect(zielKnoten);
  quelle.start(zeit);
  quelle.stop(zeit + 0.1);

  // Der Körper: ein kurzer Ton, der nach unten fällt.
  const koerper = ctx.createOscillator();
  koerper.type = 'triangle';
  koerper.frequency.setValueAtTime(300 * tonhoehe, zeit);
  koerper.frequency.exponentialRampToValueAtTime(60 * tonhoehe, zeit + 0.06);

  const koerperHuelle = ctx.createGain();
  koerperHuelle.gain.setValueAtTime(0.5 * lautstaerke, zeit);
  koerperHuelle.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.09);

  koerper.connect(koerperHuelle).connect(zielKnoten);
  koerper.start(zeit);
  koerper.stop(zeit + 0.1);

  return { ende: zeit + 0.1 };
}

/**
 * Ein Treffer — kurz, hell, ohne Nachhall.
 *
 * Anders als die Explosion hat er keinen Bauch: Ein Treffer soll die
 * Bestätigung geben („getroffen!"), nicht die Szene füllen. Er liegt deshalb
 * höher und klingt schneller ab.
 *
 * @param {AudioContext} ctx
 * @param {AudioBuffer} rauschen
 * @param {object} optionen
 * @param {number} [optionen.haerte] - 0,5 weich bis 1,5 hart
 */
export function treffer(ctx, rauschen, {
  haerte = 1, lautstaerke = 0.7, zeit = ctx.currentTime, ziel = null,
} = {}) {
  const zielKnoten = ziel ?? ctx.destination;

  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschen;
  // Ein zufälliger Startpunkt: Zwei Treffer hintereinander sollen nicht
  // identisch klingen — das verrät die Wiederholung.
  const start = Math.random() * Math.max(0.01, rauschen.duration - 0.2);
  const versatz = start;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1200 * haerte;
  bandpass.Q.value = 1.2;

  const huelle = ctx.createGain();
  huelle.gain.setValueAtTime(lautstaerke, zeit);
  huelle.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.12);

  quelle.connect(bandpass).connect(huelle).connect(zielKnoten);
  quelle.start(zeit, versatz);
  quelle.stop(zeit + 0.15);

  return { ende: zeit + 0.15 };
}
