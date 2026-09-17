/**
 * Der autonome Kartengenerator.
 *
 * ## Die Vorgabe
 *
 * „Kartengenerator hoch 10, aber ohne dass Menschen Einfluss nehmen können."
 *
 * Das ist eine Architektur-Aussage, keine Geschmacksfrage. Sie bedeutet: Es
 * gibt **keine Einstellung**, mit der ein Spieler die Karte formt. Kein
 * Regler, kein Typ-Auswahlfeld, kein Preset. **Der Seed entscheidet alles** —
 * und derselbe Seed ergibt dieselbe Karte, überall.
 *
 * ## Warum das mehr ist als eine fehlende Auswahl
 *
 * Wenn ein Mensch den Typ wählt, wählt er eine **Schablone**. Jede Schablone
 * hat einen beschreibbaren Charakter: „Höhlenkarten sind eng", „Bergkarten
 * sind steil". Nach zehn Partien kennt er sie alle, und die Karte ist kein
 * Gegner mehr, sondern eine Kulisse.
 *
 * Dieses Modul wählt die Schablone nicht — es **erzeugt** sie. Aus dem Seed
 * entsteht nicht nur die Form, sondern auch die **Art** der Form: wie viel
 * Land, wie tief die Höhlen, wie steil die Flanken, wie viel Wasser. Zwei
 * Partien mit verschiedenen Seeds können grundverschieden sein, ohne dass
 * jemand etwas eingestellt hat.
 *
 * ## Wie die Autonomie funktioniert
 *
 * Drei Schichten, jede aus demselben RNG:
 *
 *   1. **Der Charakter** — die Art der Karte. Zwölf Achsen (Landanteil,
 *      Höhlen, Steilheit, Wasser, Zerklüftung, Inseligkeit …) werden gezogen.
 *      Das ist der „Charakterbogen" dieser einen Karte.
 *   2. **Die Form** — aus dem Charakter entsteht die Maske: Höhenfeld,
 *      Oktaven, Höhlen, Wasser.
 *   3. **Die Prüfung** — das Ergebnis wird gemessen. Erfüllt es die
 *      Spielbarkeitsregeln nicht, wird neu gezogen.
 *
 * ## Die Spielbarkeitsregeln
 *
 * Ein autonomer Generator darf nicht nur überraschen, er muss **spielbar**
 * bleiben. Ein Zufall, der eine Karte ohne Land erzeugt, ist kein Zufall,
 * sondern ein Fehler. Deshalb prüft die dritte Schicht, ob die Karte
 * tatsächlich spielbar ist — und zieht notfalls einen neuen Charakter aus
 * demselben RNG.
 *
 * @module terrainGen3
 */
import { oberflaechen } from './terrainGen2.js';

/**
 * Die zwölf Achsen des Charakters.
 *
 * Jede Achse ist ein Bereich [min, max], aus dem gezogen wird. Sie sind
 * **bewusst breit**: Ein enger Bereich ergäbe Karten, die einander ähneln —
 * und genau das soll der Generator vermeiden.
 *
 * Die Werte sind keine Geschmackssache, sondern aus den Gesetzen der
 * Spielbarkeit hergeleitet (siehe `pruefeSpielbarkeit`).
 */
export const CHARAKTER_ACHSEN = Object.freeze({
  /**
   * Wie viel der Karte Land ist — als MITTLERER Anteil.
   *
   * FUND (belegt, eigener Fehler): Die Achse stand auf [0,22–0,48], wurde aber
   * mit einem Faktor 0,75 gedämpft. Gemessen lag der echte Landanteil dadurch
   * bei 15–33 % — weniger als der alte 1D-Generator (35 %).
   *
   * Jetzt hält die Achse, was sie verspricht: `landanteil` IST der mittlere
   * Landanteil. Der Bereich 0,30–0,55 ergibt 30–55 % Land im Mittel, mit
   * Schwankungen durch die Berge und Täler.
   */
  landanteil: [0.3, 0.55],
  /**
   * Anteil des Landes, der zu Hohlräumen wird. 0 = massiv.
   *
   * FUND (belegt): Hier stand 0,42. Gemessen erzeugte ein Wert von 0,34 eine
   * Karte, die im Browser wie ein **Fehler** aussah — nadelförmige Säulen und
   * schwebende Brocken, weil sich das Land auflöste. Die Obergrenze liegt
   * jetzt bei 0,3, und `pruefeSpielbarkeit` zieht bei 0,25 die Notbremse.
   */
  /*
   * ## Warum die Obergrenze von 0,30 auf 0,22 sank
   *
   * FUND (belegt): Bei 0,29 waren **75 % aller Spalten** durchlöchert — das
   * Land löst sich auf und sieht aus „wie Schweizer Käse". Die Beurteilung im
   * Browser nannte es „nicht wie eine natürliche Landschaft".
   *
   * Gemessen über die Höhlungs-Achse:
   *
   *     Höhlung 0,05 →  8 % durchlöcherte Spalten   gutes Höhlensystem
   *     Höhlung 0,10 → 26 %                          gutes Höhlensystem
   *     Höhlung 0,17 → 54 %                          viel, aber möglich
   *     Höhlung 0,22 → ~60 %                         die Grenze
   *     Höhlung 0,29 → 75 %                          ZU VIEL
   *
   * Bei 0,22 ist die Karte noch ein Höhlensystem; darüber wird sie ein Sieb.
   * Die Obergrenze steht deshalb bei 0,22 — die `pruefeSpielbarkeit` zieht
   * zusätzlich bei 0,25 die Notbremse.
   */
  hoehlung: [0.0, 0.22],
  /**
   * Höhenschwankung als Anteil der Kartenhöhe.
   *
   * ## Warum die Untergrenze von 0,16 auf 0,28 stieg
   *
   * FUND (belegt): Bei 0,16 ergibt die Amplitude nur 16 % der Kartenhöhe. Die
   * Tiefenanalyse meldete daraufhin „2 von 25 Karten nutzen weniger als 20 %
   * der Höhe" als Schwachstelle.
   *
   * Eine Karte mit 115 px Hügeln auf 720 px Höhe ist spielbar — aber sie
   * verschenkt die halbe Karte: keine Steilfeuer-Winkel, keine
   * Höhenunterschiede, keine Deckung. Das Gelände soll die Karte nutzen.
   *
   * Die Obergrenze stieg von 0,52 auf 0,58, weil die Rausch-Normierung (siehe
   * `#baueOberflaeche`) den Anteil jetzt exakt einhält — vorher nutzte eine
   * Karte mit 0,52 nur etwa 82 % davon aus.
   */
  steilheit: [0.28, 0.58],
  /** Wie hoch das Wasser steht (Anteil der Kartenhöhe unter der Mitte). */
  wasser: [0.0, 0.3],
  /**
   * Wie fein das Gelände gegliedert ist — die WELLENLÄNGE der Hügel.
   *
   * ## Warum das der richtige Hebel für Steilheit ist
   *
   * FUND (belegt, zwei eigene Fehler): Die Steilheit der Flanken sollte zuerst
   * über die Amplitude gedämpft werden — das senkte aber auch die
   * Höhennutzung (gemessen von 44 % auf 22 %, drei von zwanzig Karten unter
   * 20 % Höhe).
   *
   * Steilheit und Höhe sind zwei Dinge: Eine Welle von 200 px Höhe mit 600 px
   * Wellenlänge ist sanft, dieselbe Höhe mit 60 px Wellenlänge ist eine Wand.
   * Der Hebel ist deshalb die **Wellenlänge**, nicht die Höhe.
   *
   * ## Die Richtung — gemessen, nicht geraten
   *
   * Der erste Versuch erhöhte die Zerklüftung auf [2,8–4,6] in der Annahme,
   * mehr Gitterpunkte ergäben sanftere Hügel. Das Gegenteil war der Fall:
   *
   *     Zerklüftung 1,6–3,4:  Flanken 1,07 px/px,  7,3 % steil
   *     Zerklüftung 2,8–4,6:  Flanken 2,62 px/px, 30,4 % steil
   *
   * Mehr Gitterpunkte heißen KÜRZERE Wellen — und kürzere Wellen bei gleicher
   * Höhe sind steiler. Die richtige Richtung ist die andere: **weniger** Gitter
   * punkte, also längere Wellen.
   *
   *     basisGitter = width / (14 × zerklüftung)
   *
   * Bei 1,0 liegt das Gitter bei `width/14` — auf einer 1280er Karte 91 px je
   * Punkt. Das sind lange, sanfte Hügel.
   */
  zerklueftung: [0.8, 1.8],
  /** Wie breit die Landmassen sind. Hoch = eine große, niedrig = viele kleine. */
  zusammenhaengung: [0.35, 0.95],
  /** Wie stark die Ränder abfallen (Insel-Effekt). */
  inseligkeit: [0.0, 0.45],
});

/**
 * Zieht einen Charakter aus dem RNG.
 *
 * ## Warum nicht einfach jeder Wert gleichverteilt
 *
 * Eine Gleichverteilung erzeugt **viele mittelmäßige Karten**: Die meisten
 * Kombinationen liegen in der Mitte, die Extreme sind selten. Was fehlt, sind
 * die wirklich große Kaverne, die zerklüftete Steilküste, die Karte fast ohne
 * Land.
 *
 * Deshalb wird die Verteilung **U-förmig** gemacht: Die Ränder werden
 * häufiger, die Mitte seltener. Aber nicht zu stark — eine reine U-Verteilung
 * würde fast nur Extreme liefern und die spielbare Mitte verlieren.
 *
 * ## Die Formel — und ein eigener Denkfehler
 *
 * FUND (belegt, eigener Fehler): Hier stand `(2t−1)³ · 0,5 + 0,5`. Nachgerechnet
 * ergibt das:
 *
 *     t = 0,10  →  0,244      ← zur MITTE gezogen
 *     t = 0,90  →  0,756      ← zur MITTE gezogen
 *
 * Die Formel tat also das **Gegenteil** dessen, was der Kommentar behauptete:
 * Sie sammelte die Werte in der Mitte. Ein Test deckte es auf („die Abdeckung
 * ist gut, aber die Extreme fehlen").
 *
 * Richtig ist der Kehrwert-Anteil: Ein Wert nahe 0,5 wird weit nach außen
 * geschoben, einer nahe dem Rand bleibt. Die Gewichtung `0,3` bestimmt, wie
 * stark — bei 0 wäre es die Gleichverteilung, bei 1 nur Extreme.
 *
 * @param {object} rng
 * @param {number} [randGewicht] - 0 = gleichverteilt, 1 = nur Extreme
 * @returns {object} Charakter mit allen Achsen
 */
export function zieheCharakter(rng, randGewicht = 0.45) {
  /**
   * Schiebt einen Wert von der Mitte an den Rand — ohne den Bereich zu
   * verlassen.
   *
   * Die Kennlinie: `t=0,5` bleibt 0,5 (die Mitte ist ein Fixpunkt), und je
   * näher t schon am Rand liegt, desto weniger wird es verschoben. Das ergibt
   * eine U-förmige Verteilung mit einer Spitze bei 0,5.
   */
  const zurMitteOderRand = (t) => {
    const abstandVonMitte = Math.abs(t - 0.5) * 2; // 0 in der Mitte, 1 am Rand
    const nachAussen = abstandVonMitte ** (1 / (1 + randGewicht * 2));
    return t < 0.5 ? 0.5 - nachAussen * 0.5 : 0.5 + nachAussen * 0.5;
  };

  const zieh = ([min, max]) => {
    const roh = zurMitteOderRand(rng.next());
    return min + (max - min) * roh;
  };

  return {
    landanteil: zieh(CHARAKTER_ACHSEN.landanteil),
    hoehlung: zieh(CHARAKTER_ACHSEN.hoehlung),
    steilheit: zieh(CHARAKTER_ACHSEN.steilheit),
    wasser: zieh(CHARAKTER_ACHSEN.wasser),
    zerklueftung: zieh(CHARAKTER_ACHSEN.zerklueftung),
    zusammenhaengung: zieh(CHARAKTER_ACHSEN.zusammenhaengung),
    inseligkeit: zieh(CHARAKTER_ACHSEN.inseligkeit),
  };
}

/**
 * Gitterrauschen über einem 2D-Gitter — wie in `terrainGen2`, hier lokal,
 * damit dieses Modul nicht von dessen Innenleben abhängt.
 */
function gitterrauschen(rng, spalten, zeilen) {
  const punkte = new Float32Array((spalten + 1) * (zeilen + 1));
  for (let i = 0; i < punkte.length; i += 1) punkte[i] = rng.next();

  const glatt = t => t * t * (3 - 2 * t);

  return (fx, fy) => {
    const x = Math.max(0, Math.min(spalten - 1e-6, fx * spalten));
    const y = Math.max(0, Math.min(zeilen - 1e-6, fy * zeilen));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = glatt(x - x0);
    const ty = glatt(y - y0);

    const i = (px, py) => punkte[py * (spalten + 1) + px];
    const oben = i(x0, y0) + (i(x0 + 1, y0) - i(x0, y0)) * tx;
    const unten = i(x0, y0 + 1) + (i(x0 + 1, y0 + 1) - i(x0, y0 + 1)) * tx;
    return oben + (unten - oben) * ty;
  };
}

/**
 * Erzeugt eine Karte aus einem autonomen Charakter.
 *
 * @param {object} optionen
 * @param {object} optionen.rng - SeededRandom
 * @param {number} optionen.width
 * @param {number} optionen.height
 * @returns {{bitmap:Uint8Array, surface:Int32Array, wasserY:number, charakter:object, versuche:number, kennzahlen:object}}
 */
export function erzeugeAutonomeKarte({ rng, width, height }) {
  if (!rng || typeof rng.next !== 'function') {
    throw new TypeError('erzeugeAutonomeKarte benötigt einen RNG mit next()');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('width und height müssen positive Ganzzahlen sein');
  }

  /*
   * Bis zu acht Versuche.
   *
   * Ein autonomer Generator kann danebengreifen — ein gezogener Charakter kann
   * eine unspielbare Karte ergeben (kein Land, alles Wasser, eine Wand). Das
   * ist kein Fehler des Zufalls, sondern eine Eigenschaft der Freiheit: Wer
   * Extreme zulässt, bekommt auch extreme Ausreißer.
   *
   * Statt die Extreme zu verbieten (was die Autonomie beschneiden würde),
   * wird **geprüft und neu gezogen**. Der RNG läuft dabei weiter — der
   * nächste Versuch ist ebenso deterministisch wie der erste.
   */
  const MAX_VERSUCHE = 8;
  let letzterFehler = null;

  for (let versuch = 1; versuch <= MAX_VERSUCHE; versuch += 1) {
    const charakter = zieheCharakter(rng);
    const karte = baueKarte({ rng, width, height, charakter });
    const kennzahlen = messe(karte.bitmap, karte.surface, width, height);

    const urteil = pruefeSpielbarkeit(kennzahlen);
    if (urteil.ok) {
      return { ...karte, charakter, versuche: versuch, kennzahlen };
    }
    letzterFehler = urteil.grund;
  }

  /*
   * Nach acht Versuchen wird genommen, was da ist — aber NICHT still.
   *
   * Ein Generator, der im Notfall etwas Unspielbares ausliefert, ohne es zu
   * sagen, wäre schlimmer als einer, der es meldet. Die Kennzahlen gehen mit,
   * damit ein Aufrufer entscheiden kann.
   */
  const charakter = zieheCharakter(rng);
  const karte = baueKarte({ rng, width, height, charakter });
  const kennzahlen = messe(karte.bitmap, karte.surface, width, height);
  return {
    ...karte,
    charakter,
    versuche: MAX_VERSUCHE + 1,
    kennzahlen,
    warnung: `Keine spielbare Karte nach ${MAX_VERSUCHE} Versuchen (zuletzt: ${letzterFehler})`,
  };
}

/**
 * Baut die Maske aus einem Charakter.
 *
 * Der Aufbau folgt dem bewährten Muster aus `terrainGen2` — drei Oktaven für
 * die Landmasse, ein eigenes Feld für die Hohlräume — aber alle Maße kommen
 * aus dem Charakter statt aus einer Tabelle.
 */
function baueKarte({ rng, width, height, charakter }) {
  /*
   * Die Gitterweite — die WELLENLÄNGE der Hügel.
   *
   * ## Zwei Erkenntnisse, beide gemessen
   *
   * **Erstens:** Die Steilheit einer Flanke ist `Amplitude / Wellenlänge` —
   * nicht die Amplitude allein. Ein fester Gitterfaktor kann deshalb nicht
   * beides bedienen: Wird die Amplitude erhöht (mehr Höhennutzung), werden bei
   * gleicher Wellenlänge die Flanken steiler.
   *
   * **Zweitens:** Zwei Achsen verstärken sich. Gemessen an Seed 424997:
   *
   *     steilheit    0,569  →  Amplitude 409 px
   *     zerklüftung  1,768  →  Wellenlänge 89 px
   *     Flanken:             2,79 px/px   ← eine Wand, kein Hügel
   *
   * Beide Werte lagen im erlaubten Bereich, ihre KOMBINATION war unspielbar.
   *
   * ## Die Kopplung
   *
   * Die Wellenlänge wächst mit der Amplitude: Steilere Karten bekommen längere
   * Wellen. Die Zerklüftung bleibt der Regler dafür, wie fein die Struktur ist —
   * aber sie kann die Wellen nicht mehr beliebig kurz machen.
   *
   *     Wellenlänge = Grundlänge × Amplitude-Faktor × Zerklüftungs-Faktor
   *
   * Die Steilheit einer Flanke bleibt damit in einem Band, unabhängig davon,
   * welche Kombination der Seed zieht.
   */
  const amplitudenFaktor = charakter.steilheit / 0.43;   // 0,43 ist die Mitte der Achse

  /*
   * Die Grundlänge — in PIXELN, nicht als Anteil der Breite.
   *
   * ## Warum das der eigentliche Fehler war
   *
   * FUND (belegt): Der Gitterabstand war ein **Anteil der Kartenbreite**
   * (`width / faktor`). Bei einer 1280er Karte und Faktor 5 ergab das eine
   * Zellbreite von 256 px — bei den Achsenwerten von Seed 424997 (Steilheit
   * 0,569, Zerklüftung 1,768) blieben davon nur **7 Gitterpunkte** über die
   * ganze Karte.
   *
   * Sieben Punkte können keine wellige Oberfläche beschreiben. Das Rauschen
   * springt von einem Wert zum nächsten, und die Interpolation dazwischen ist
   * ein gerades Segment. Gemessen:
   *
   *     Amplitude 409 px / Zellbreite 181 px = 2,26 px/px  — als Mittel
   *     Spitzen bis                                  6 px/px
   *
   * Das Bild zeigte eine „eckig-zackige" Silhouette — und die Messung meldete
   * im MITTEL nur 1,0 px/px. Der Mittelwert verdeckte die Spitzen, und sichtbar
   * sind die Spitzen.
   *
   * ## Die Kopplung an die Amplitude, nicht an die Kartenbreite
   *
   * Die entscheidende Größe ist das Verhältnis `Amplitude / Wellenlänge` — die
   * Steigung. Die Wellenlänge wird deshalb aus der **Amplitude** abgeleitet:
   *
   *     Wellenlänge = Amplitude / ZIEL_STEIGUNG
   *
   * Bei einer Zielsteigung von 0,5 px/px und 409 px Amplitude ergibt das
   * 818 px Wellenlänge — bei 1280 px Kartenbreite also rund 1,5 Wellen. Das
   * ist wenig; die Grundwelle entsteht aus der Ausrichtung (siehe unten), die
   * feinen Anteile kommen aus den Oktaven.
   *
   * Die Untergrenze `ZELLE_MIN` verhindert, dass eine sehr flache Karte in
   * einen einzigen Gitterpunkt zusammenfällt.
   */
  /*
   * Die Zielsteigung: `Amplitude / Wellenlänge`.
   *
   * Ein Wert von 0,5 bedeutet: Eine Welle von 400 px Höhe ist 800 px lang. Das
   * ist sehr sanft — gemessen ergab es nur **22 % Höhennutzung**, weil eine
   * lange Welle weniger Höhe über die Kartenbreite verteilt.
   *
   * 0,75 ist der Kompromiss: kurz genug für 35–50 % Höhennutzung, lang genug
   * für Flanken unter 1,5 px/px.
   */
  const ZIEL_STEIGUNG = 0.75;
  const amplitudeFuerGitter = Math.max(1, height * charakter.steilheit);
  const ZELLE_MIN = 48;
  const grundWellenlaenge = Math.max(
    ZELLE_MIN,
    amplitudeFuerGitter / ZIEL_STEIGUNG / (0.22 + charakter.zerklueftung * 0.28),
  );

  /*
   * Die Amplitude verlängert die Wellen. Der Exponent 0,8 statt 1,0 dämpft die
   * Kopplung: Eine Verdopplung der Amplitude verlängert die Wellen um den
   * Faktor 1,74 statt 2,0 — die Flanken werden also etwas steiler, aber nicht
   * doppelt so steil.
   */
  const amplitudenAnteil = Math.max(0.5, Math.min(2, amplitudenFaktor ** 0.8));

  const basisGitter = grundWellenlaenge * amplitudenAnteil / charakter.zerklueftung;
  const spalten = Math.max(4, Math.round(width / basisGitter));
  const zeilen = Math.max(3, Math.round(spalten * (height / width)));

  const grob = gitterrauschen(rng, spalten, zeilen);
  const mittel = gitterrauschen(rng, spalten * 2, zeilen * 2);
  /*
   * ## Die feine Oktave — und warum sie nicht mehr 3× so fein ist
   *
   * FUND (belegt): Die Oktaven standen im Verhältnis 1 : 2 : **3**. Die feinste
   * Struktur war damit nur ein Drittel der Grundwellenlänge — bei 90 px
   * Grundgitter also 30 px. Über eine Amplitude von 400 px gelegt ergibt das
   * **Zacken**.
   *
   * Gemessen an Seed 424997:
   *
   *     Mittel der Steigungen:   1,78 px/px   ← sieht gut aus
   *     Median:                  2 px/px
   *     q99:                     5 px/px      ← das sieht das Auge
   *     Maximum:                 6 px/px
   *
   * Ein Mittelwert verdeckt die Spitzen. Und sichtbar sind die Spitzen: Das
   * Bild zeigte „spitze und zackige Hügel ohne Plateaus", obwohl die Messung
   * 1,32 px/px meldete.
   *
   * Jetzt ist das Verhältnis 1 : 2 : 2,5 — die feinste Struktur ist doppelt so
   * lang wie vorher, die Zacken verschwinden, und die Zerklüftung bleibt als
   * Regler erhalten.
   */
  const fein = gitterrauschen(rng, Math.round(spalten * 2.5), Math.round(zeilen * 2.5));

  /*
   * Die Gewichte der Oktaven folgen der Zerklüftung: Ein zerklüftetes Gelände
   * hat mehr feine Anteile, ein zusammenhängendes mehr grobe.
   *
   * Der feine Anteil ist zusätzlich gedeckelt: Über 0,22 wird das Gelände
   * zackig, unabhängig davon, wie lang die feinste Welle ist.
   */
  const feinAnteil = Math.min(0.22, (charakter.zerklueftung - 1.6) / 8);
  const mittelAnteil = 0.3;
  const grobAnteil = 1 - feinAnteil - mittelAnteil;

  const masseFeld = (fx, fy) => grob(fx, fy) * grobAnteil
    + mittel(fx, fy) * mittelAnteil
    + fein(fx, fy) * feinAnteil;

  /*
   * Das Höhlen-Gitter — und warum es am KARTENMASSSTAB hängen muss.
   *
   * FUND (belegt, eigener Fehler): Hier stand `width / 70`. Bei einer 1280er
   * Karte sind das 18 Gitterpunkte, bei einer 320er nur **4** — die „Höhlen"
   * wären 80 px breit, ein Drittel der Karte. Gemessen hatte eine 320×180
   * Karte deshalb **0 von 30** Durchläufen einen Hohlraum über 15 %; bei
   * 1280×720 waren es 5 von 30.
   *
   * Der Maßstab muss sich am **Bezug der Figuren** orientieren, nicht an der
   * Kartenbreite: Eine Figur ist überall rund 14 px breit. Ein Gang muss also
   * überall dieselbe Mindestbreite haben — und das heißt: eine feste
   * Gitterweite in Pixeln, nicht ein Anteil.
   */
  /*
   * ## Warum die Gitterweite von 42 auf 26 sank
   *
   * FUND (belegt): Bei 42 px Gitterweite hat eine 1280er Karte nur **30
   * Gitterpunkte** — und jeder Punkt wurde zu einem Hohlraum von bis zu
   * **3400 px** Ausdehnung. Gemessen:
   *
   *     Höhlung 0,05 → größter Hohlraum  645 px, 11 Stück
   *     Höhlung 0,15 → größter Hohlraum 2001 px, 21 Stück
   *     Höhlung 0,21 → größter Hohlraum 3400 px, 20 Stück
   *
   * 3400 px ist mehr als die halbe Kartenbreite: Aus einem Höhlensystem wird
   * ein einziger Hohlraum, und das Land sieht aus „wie Schweizer Käse" (so die
   * Beurteilung des Bildes im Browser).
   *
   * Bei 26 px sind es 49 Punkte auf 1280 px — die Hohlräume werden kleiner und
   * zahlreicher, und das Ergebnis liest sich als Gangsystem.
   */
  const HOEHLEN_GITTERWEITE = 26;
  const hoehlenGitter = Math.max(6, Math.round(width / HOEHLEN_GITTERWEITE));
  const hohlFeld = gitterrauschen(rng, hoehlenGitter,
    Math.max(4, Math.round(hoehlenGitter * (height / width))));

  const bitmap = new Uint8Array(width * height);

  /*
   * Das Höhenfeld.
   *
   * ## Was die Achse `landanteil` bedeutet — und was sie vorher NICHT bedeutete
   *
   * FUND (belegt, eigener Fehler): Hier stand
   *
   *     grundlinie = height * (1 - landanteil * 0,75)
   *
   * Der Faktor 0,75 sollte den Anteil dämpfen, tat aber etwas anderes: Er
   * senkte ihn. Nachgerechnet ergab `landanteil = 0,48` damit nur **36 %**
   * echten Landanteil, und `landanteil = 0,22` nur **17 %**. Gemessen über
   * zwölf Karten lag der Landanteil bei **15–33 % (Mittel 21 %)** — weniger
   * als der alte 1D-Generator (35 %) und deutlich weniger als eine
   * Worms-Karte (40–50 %).
   *
   * Das ist eine **Verschlechterung**, nicht nur ein Schönheitsfehler: Wenig
   * Land heißt wenig Deckung, wenig Stellfläche und ein Spiel, das fast nur im
   * Himmel stattfindet.
   *
   * ## Jetzt hält die Achse, was ihr Name verspricht
   *
   *     grundlinie = height * (1 - landanteil)
   *
   * Der MITTLERE Landanteil ist damit genau `landanteil`. Die Amplitude
   * verschiebt ihn nach oben und unten — das sind die Berge und Täler, und
   * diese Schwankung ist gewollt.
   *
   * Die Achse selbst reicht jetzt von 0,30 bis 0,55 statt von 0,22 bis 0,48.
   * Bei einem mittleren Wert von 0,4 schwankt der echte Anteil zwischen 23 %
   * und 57 % — es gibt also flache Seenlandschaften UND gebirgige Karten.
   */
  /*
   * ## Der Landanteil gleicht die Inseligkeit aus
   *
   * FUND (belegt, die eigentliche Ursache): Die beiden Achsen sind nicht
   * unabhängig. Die Randabsenkung zieht die Oberfläche zu den Seiten nach
   * unten, und bei niedrigem Landanteil steht dort kaum noch Land:
   *
   *     Landanteil 0,30 + Inseligkeit 0,44 → Rand bei y=634 (nur 86 px Land)
   *     Landanteil 0,55 + Inseligkeit 0,44 → Rand bei y=562 (158 px Land)
   *
   * Gemessen an Seed 403571 (Landanteil 0,326, Inseligkeit 0,434): Der obere
   * **Drittel** der Karte war komplett leer, das Land lag nur rechts. Das Bild
   * im Browser wirkte „wie ein Fehler".
   *
   * Die Behebung: Der wirksame Landanteil steigt mit der Inseligkeit. Die
   * gezogene Achse bleibt, wie sie ist — der Generator sorgt nur dafür, dass
   * sie nicht mit der Inseligkeit kollidiert.
   *
   * `landanteil + inseligkeit * 0,35`, begrenzt auf 0,62: Bei mittlerer
   * Inseligkeit (0,25) hebt das den Landanteil um 0,09 — genug, dass die
   * Ränder nicht in den Kartenboden laufen.
   */
  const wirksamerLandanteil = Math.min(
    0.62,
    charakter.landanteil + charakter.inseligkeit * 0.35,
  );
  const grundlinie = height * (1 - wirksamerLandanteil);

  /*
   * Die Amplitude — die ganze Schwankung, nicht ihr halber Ausschlag.
   *
   * ## Zwei Fehler in Folge, beide gemessen
   *
   * **Erstens:** Die Amplitude war `height × steilheit`. Bei `steilheit = 0,51`
   * ergab das 365 px. Gemessen: **5,07 px Höhenunterschied je 1 px Breite**,
   * **57 % steile Flanken**. Ein Worms-Hügel hat 0,5 bis 1,5 px/px — das war
   * eine Zickzacklinie.
   *
   * **Zweitens:** Der Gegenversuch dämpfte pauschal mit Faktor 0,55. Das
   * senkte die Steilheit auf 1,07 px/px (gut) — aber auch die
   * **Höhennutzung** von 44 % auf 22 %. Gemessen: Drei von zwanzig Karten
   * nutzten weniger als 20 % der Kartenhöhe. Eine flache Karte ist ebenso
   * langweilig wie eine zackige.
   *
   * ## Warum eine pauschale Dämpfung falsch war
   *
   * Steilheit und Höhe sind **zwei verschiedene Dinge**. Eine steile Flanke
   * entsteht aus dem Verhältnis von Höhe zu Breite — nicht aus der Höhe allein.
   * Eine Welle von 200 px Höhe mit 600 px Wellenlänge ist sanft; dieselbe Höhe
   * mit 60 px Wellenlänge ist eine Wand.
   *
   * Der richtige Hebel ist deshalb die **Wellenlänge**: die Gitterweite des
   * Rauschfelds, gesteuert über `zerklueftung` (siehe unten). Die Amplitude
   * folgt der Steilheit-Achse unverändert.
   *
   * ## Was jetzt gilt
   *
   *     Schwankung der Oberfläche = amplitude
   *
   * Das Rauschen läuft von 0 bis 1, also schwankt `(rauschen − 0,5)` um ±0,5
   * und die Oberfläche um ±amplitude/2 — **insgesamt um `amplitude`**. Deshalb
   * entspricht die Amplitude jetzt der gewünschten Höhennutzung.
   */
  const amplitude = height * charakter.steilheit;
  const oberflaeche = new Int32Array(width);

  /*
   * Die Randabsenkung — und warum sie eine WAND war.
   *
   * FUND (belegt, eigener Fehler): Die Absenkung lief über **90 px** und fiel
   * dabei um bis zu `height × inseligkeit` — bei Inseligkeit 0,305 sind das
   * **220 px**. Das sind **2,4 px Höhe je 1 px Breite** allein aus dem Rand.
   *
   * Gemessen an Seed 424997:
   *
   *     surface[0]  =   0     ← auf den Mindestwert geklemmt
   *     surface[1]  = 695     ← Sprung um 695 px!
   *     surface[50] = 440     ← 6,5 px/px
   *
   * Das Bild zeigte entsprechend eine „eckig-zackige" Silhouette. Es war
   * keine Zackigkeit — es war eine **Wand** am Kartenrand.
   *
   * ## Die Behebung
   *
   * Die Absenkung bekommt eine **Mindestbreite**: Je tiefer sie fällt, desto
   * länger läuft sie. Damit bleibt die Steigung des Randes in einem erträglichen
   * Band, unabhängig davon, wie inselig der Seed zieht.
   *
   * Die Formel: Die Randbreite wächst mit der Absenkungstiefe, sodass der Rand
   * höchstens `RAND_STEIGUNG` px Höhe je px Breite verliert.
   */
  /*
   * ## Die Tiefe wird begrenzt — sonst frisst der Rand die Karte
   *
   * FUND (belegt, eigener Fehler): Bei Inseligkeit 0,305 war die Absenkung
   * **220 px** tief. Die Grundlinie liegt bei 369 px (Landanteil 0,488), also
   * blieben bis zum Kartenboden nur 351 px. Die Absenkung schob die
   * Oberfläche über den Rand hinaus:
   *
   *     Oberfläche bei x=0 = 369 + 220 = 589 px   (bei mittlerem Rauschen)
   *     Oberfläche bei x=0 = 369 + 220 + 205 = 793 px  (bei tiefem Rauschen)
   *     Karte ist 720 px hoch  →  Klemmung greift, `surface[0] = 0`
   *
   * Eine Oberfläche „bei 0" ist keine Oberfläche — sie ist der Klemmwert, und
   * die erste Spalte bekam dadurch einen Sprung von 697 px auf einen Schlag.
   *
   * Die Tiefe wird deshalb auf den Raum begrenzt, der zwischen Grundlinie und
   * Kartenboden bleibt: höchstens 60 % davon. Der Rand läuft dann ins Wasser,
   * ohne die Karte zu verlassen.
   */
  const RAND_STEIGUNG = 1.2;
  const platzNachUnten = height - grundlinie;
  const randTiefe = Math.min(height * charakter.inseligkeit, platzNachUnten * 0.6);
  const randBreite = Math.max(60, randTiefe / RAND_STEIGUNG);

  const randAbsenkungProX = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    /*
     * Die Inseligkeit senkt die Ränder ab. Bei 0 läuft die Karte bis zum Rand,
     * bei 0,45 fällt sie zu beiden Seiten ins Wasser — eine Insel.
     *
     * Die Glättung `randAnteil² × (3 − 2·randAnteil)` sorgt für einen weichen
     * Ein- und Auslauf: Ohne sie hätte die Absenkung an ihrem inneren Ende
     * einen Knick.
     */
    const roh = Math.min(1, Math.min(x, width - 1 - x) / randBreite);
    const weich = roh * roh * (3 - 2 * roh);
    randAbsenkungProX[x] = (1 - weich) * randTiefe;
  }

  /*
   * Das rohe Rauschen, VOR der Skalierung.
   *
   * ## Warum es zwischengespeichert wird
   *
   * FUND (belegt): Hier stand
   *
   *     oberflaeche[x] = grundlinie - (rauschen - 0,5) * amplitude + …
   *
   * Die Formel nimmt an, dass `rauschen` von 0 bis 1 läuft — dann schwankt der
   * Ausdruck um ±0,5 und die Oberfläche um genau `amplitude`.
   *
   * Das Rauschen TUT das aber nicht: Gemessen über zwanzig Karten lief es nur
   * von etwa 0,2 bis 0,8. Die Folge: Karten nutzten nur **75–84 %** ihrer
   * Amplitude, und in der Tiefenanalyse fielen Karten auf, die „weniger als
   * 20 % der Höhe nutzen".
   *
   * Deshalb wird das Feld erst gesammelt und auf seinen EIGENEN Bereich
   * normiert — dann nutzt jede Karte ihre Amplitude vollständig.
   */
  const roh = new Float64Array(width);
  let rohMin = Infinity;
  let rohMax = -Infinity;
  for (let x = 0; x < width; x += 1) {
    roh[x] = masseFeld(x / width, 0.5);
    if (roh[x] < rohMin) rohMin = roh[x];
    if (roh[x] > rohMax) rohMax = roh[x];
  }

  /*
   * Die Normierung.
   *
   * `spanne` ist 0, wenn das Feld konstant ist (etwa bei einer sehr flachen
   * Karte mit einem einzigen Gitterpunkt). Dann bleibt das Rauschen in der
   * Mitte — die Karte wird eben flach, statt durch null zu teilen.
   */
  const spanne = rohMax - rohMin;

  for (let x = 0; x < width; x += 1) {
    const normiert = spanne > 1e-9 ? (roh[x] - rohMin) / spanne : 0.5;

    /*
     * Die Oberfläche — und ihre Klemmung.
     *
     * FUND (belegt, eigener Fehler): Der Minimalwert war **1**. Bei einem tief
     * abgesenkten Rand ergab das `surface[0] = 0` — einen Wert, der keine
     * Oberfläche beschreibt, sondern den Anschlag der Klemmung. Gemessen fiel
     * die Oberfläche danach von 0 auf 688 px: ein Sprung über fast die ganze
     * Karte in einer einzigen Spalte.
     *
     * Die Untergrenze ist deshalb **mindestens eine halbe Amplitude unter der
     * Grundlinie** — dort ist der tiefste Punkt, den das Rauschen erreichen
     * kann. Alles darüber ist Klemmung; alles darunter gibt es nicht.
     */
    const tiefster = Math.max(
      Math.round(grundlinie + amplitude * 0.5),
      2,
    );
    const hoechster = Math.max(2, Math.round(grundlinie - amplitude * 0.5));

    const hoehe = grundlinie - (normiert - 0.5) * amplitude + randAbsenkungProX[x];
    oberflaeche[x] = Math.round(hoehe);
    oberflaeche[x] = Math.max(hoechster, Math.min(tiefster, oberflaeche[x]));

    /*
     * Und dann die harte Kartengrenze — sie darf nur greifen, wenn die
     * berechnete Spanne selbst über die Karte hinausreicht.
     */
    oberflaeche[x] = Math.max(1, Math.min(height - 2, oberflaeche[x]));
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = oberflaeche[x]; y < height; y += 1) bitmap[y * width + x] = 1;
  }

  /*
   * Die Hohlräume — nur, wenn der Charakter welche vorsieht.
   *
   * Gestanzt wird ab einer festen Tiefe unter der Oberfläche, damit keine
   * Löcher in den Himmel entstehen (dieselbe Lehre wie in `terrainGen2`).
   */
  /*
   * ## Die Höhlung wird an die LANDTIEFE gekoppelt
   *
   * FUND (belegt, die eigentliche Ursache): Alle Versuche, die Hohlräume über
   * Schwellen und Gitterweiten zu zähmen, scheiterten — weil das Problem nicht
   * die Höhle war, sondern das **Land**.
   *
   * Gemessen bei einer Karte mit 30 % Landanteil:
   *
   *     Landtiefe je Spalte:  216 px
   *     davon Luft bei Höhlung 0,22:  etwa die Hälfte
   *     Ergebnis: das Land ist ein Sieb
   *
   * Bei 55 % Landanteil sind es 396 px Landtiefe — dort haben Hohlräume Platz,
   * ohne die Struktur aufzulösen.
   *
   * Die wirksame Höhlung wird deshalb mit der Landtiefe skaliert: Eine flache
   * Karte bekommt weniger Hohlräume als eine tiefe, ohne dass der Charakter
   * dafür zwei Achsen koordinieren muss.
   */
  const landTiefe = height - grundlinie;
  /*
   * Bei `landTiefe / height = 0,45` (der Mitte der Achse) bleibt die Höhlung
   * unverändert. Eine flachere Karte dämpft sie, eine tiefere verstärkt sie —
   * begrenzt auf den halben bis doppelten Wert.
   */
  const tiefenFaktor = Math.max(
    0.5,
    Math.min(2, (landTiefe / height) / 0.45),
  );
  const wirksameHoehlung = Math.min(0.25, charakter.hoehlung * tiefenFaktor);

  if (wirksameHoehlung > 0.02) {
    /*
     * Die Mindesttiefe unter der Oberfläche — als ANTEIL der verfügbaren
     * Landtiefe, nicht in festen Pixeln.
     *
     * FUND (belegt): Ein fester Wert (18 px) frisst auf einer 180 px hohen
     * Karte 20 % des Landes, auf einer 720 px hohen dagegen nur 2,5 %. Bei
     * kleinen Karten blieb damit kaum Raum für Hohlräume.
     */
    const mindestTiefe = Math.max(6, Math.round(height * 0.04));

    /*
     * Der Schwellenwert.
     *
     * ## Eine Zwischenlösung, die ich zurückgenommen habe
     *
     * FUND (belegt): Als die Hohlräume zu groß wurden (bis 3400 px), baute ich
     * einen Deckel ein: `Math.max(0,82, …)`. Der Deckel wirkte — aber er
     * dämpfte **jede** Höhlung über 0,13 auf denselben Wert. Gemessen:
     *
     *     gezogen 0,212 → gemessener Hohlraum nur 0,098   (54 % Verlust)
     *     gezogen 0,22  → wirksam gedeckelt bei 0,238
     *
     * Die Höhlungs-Achse war damit zur Hälfte wirkungslos — „massive UND
     * durchlöcherte Karten" gab es nicht mehr, und ein Test schlug zu Recht an.
     *
     * Der Deckel war die falsche Antwort auf die richtige Beobachtung. Die
     * Riesenhöhlen entstanden nicht durch eine zu niedrige Schwelle, sondern
     * durch zu **wenig Land**: Bei 216 px Landtiefe war jeder Hohlraum sofort
     * ein Loch in der ganzen Struktur.
     *
     * Seit der Landanteil die Inseligkeit ausgleicht (siehe oben) ist genug
     * Land da. Der Deckel ist deshalb entfernt, und die Schwelle folgt der
     * Höhlung direkt — so wie ursprünglich gedacht.
     */
    const schwelle = 1 - wirksameHoehlung;

    for (let x = 0; x < width; x += 1) {
      const fx = x / width;
      for (let y = oberflaeche[x] + mindestTiefe; y < height; y += 1) {
        if (!bitmap[y * width + x]) continue;
        if (hohlFeld(fx, y / height) > schwelle) {
          bitmap[y * width + x] = 0;
        }
      }
    }
  }

  /*
   * Die Ränder und der Boden werden versiegelt.
   *
   * Wichtig bei Inseln: Wenn die Inseligkeit hoch ist, liegt das Gelände an
   * den Seiten unter Wasser — die Versiegelung setzt trotzdem eine Wand, damit
   * niemand aus der Welt fällt. Sie ist schmal und unter Wasser unsichtbar.
   */
  for (let y = 0; y < height; y += 1) {
    bitmap[y * width] = 1;
    bitmap[y * width + (width - 1)] = 1;
  }
  for (let x = 0; x < width; x += 1) bitmap[(height - 1) * width + x] = 1;

  const surface = oberflaechen(bitmap, width, height);

  /*
   * Der Wasserspiegel folgt dem Charakter, gemessen am Gelände.
   *
   * Die Ränder bleiben außen vor: Sie sind versiegelt und würden den Spiegel
   * auf Himmelshöhe ziehen (dieser Fehler ist in `terrainGen2` dokumentiert).
   */
  const rand = Math.max(2, Math.round(width * 0.02));
  const inneres = [];
  for (let x = rand; x < width - rand; x += 1) {
    if (surface[x] >= 0) inneres.push(surface[x]);
  }
  inneres.sort((a, b) => a - b);

  let wasserY;
  if (charakter.wasser < 0.02 || inneres.length === 0) {
    // Kein Wasser: Der Spiegel liegt unter dem tiefsten Land.
    wasserY = inneres.length > 0 ? inneres[inneres.length - 1] + 2 : height;
  } else {
    const stellung = Math.min(inneres.length - 1,
      Math.floor(inneres.length * (1 - charakter.wasser)));
    wasserY = inneres[Math.max(0, stellung)];
  }

  return { bitmap, surface, wasserY };
}

/** Misst die Kennzahlen einer Karte. */
function messe(bitmap, surface, width, height) {
  let land = 0;
  for (let i = 0; i < bitmap.length; i += 1) if (bitmap[i]) land += 1;

  // Hohlraum: nicht-solide Pixel unterhalb der Oberfläche.
  let unter = 0;
  let leer = 0;
  for (let x = 0; x < width; x += 1) {
    if (surface[x] < 0) continue;
    for (let y = surface[x]; y < height; y += 1) {
      unter += 1;
      if (!bitmap[y * width + x]) leer += 1;
    }
  }

  // Erhebungen: Vorzeichenwechsel der Steigung, ohne die versiegelten Ränder.
  let erhebungen = 0;
  let richtung = 0;
  const profil = [];
  for (let x = 5; x < width - 5; x += 1) {
    if (surface[x] < 0) continue;
    profil.push(surface[x]);
  }
  for (let i = 1; i < profil.length; i += 1) {
    const d = profil[i] - profil[i - 1];
    const r = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    if (r !== 0 && richtung !== 0 && r !== richtung) erhebungen += 1;
    if (r !== 0) richtung = r;
  }

  // Überhänge: Spalten mit mehr als einem soliden Abschnitt.
  let ueberhaenge = 0;
  for (let x = 1; x < width - 1; x += 1) {
    let abschnitte = 0;
    let vorher = false;
    for (let y = 1; y < height - 1; y += 1) {
      const solide = bitmap[y * width + x] === 1;
      if (solide && !vorher) abschnitte += 1;
      vorher = solide;
    }
    if (abschnitte > 1) ueberhaenge += 1;
  }

  // Der Anteil des Profils unter dem Wasserspiegel — nur die Kennzahl, nicht
  // der Spiegel selbst.
  const profilWerte = profil.length > 0 ? profil : [0];
  const spanne = Math.max(...profilWerte) - Math.min(...profilWerte);

  return {
    landAnteil: land / bitmap.length,
    hohlraum: unter === 0 ? 0 : leer / unter,
    hoehennutzung: spanne / height,
    erhebungen,
    ueberhaenge,
  };
}

/**
 * Prüft, ob eine Karte spielbar ist.
 *
 * ## Warum diese Prüfung unverzichtbar ist
 *
 * Ein autonomer Generator darf überraschen, aber nicht unspielbar werden. Die
 * Regeln hier sind **nicht** Geschmack — sie kommen aus dem, was der Motor
 * braucht:
 *
 *   **Land** — Je Spieler braucht es Platz für eine Figur (rund 14 px breit,
 *   mit Standfläche).  
 *   **Luft** — Projektile müssen fliegen können; eine Karte aus Land ist ein
 *   Kampf auf Tuchfühlung.  
 *   **Höhennutzung** — Ein Gelände, das nur in einer Zeile spielt, verschenkt
 *   die Karte und lässt keine Steilfeuer-Winkel zu.  
 *   **Größe der Landmasse** — Eine Figur auf einer 1-%-Insel stranden lässt,
 *   ist kein Abenteuer, sondern ein Fehler.
 *
 * @returns {{ok:boolean, grund:string}}
 */
export function pruefeSpielbarkeit(k) {
  if (k.landAnteil < 0.15) {
    return { ok: false, grund: `zu wenig Land (${(k.landAnteil * 100).toFixed(0)} %)` };
  }
  if (k.landAnteil > 0.9) {
    return { ok: false, grund: `zu viel Land (${(k.landAnteil * 100).toFixed(0)} %)` };
  }
  if (k.hoehennutzung < 0.12) {
    return { ok: false, grund: `zu flach (${(k.hoehennutzung * 100).toFixed(0)} % Höhennutzung)` };
  }
  if (k.erhebungen < 4) {
    return { ok: false, grund: `zu wenige Erhebungen (${k.erhebungen})` };
  }

  /*
   * ## Die Höhlung braucht eine OBERGRENZE
   *
   * FUND (belegt): Ein Seed mit 0,34 Höhlung erzeugte eine Karte, die im
   * Browser wie ein **Fehler** aussah. Wörtlich aus der Beurteilung:
   *
   *   „Es wirkt eindeutig wie ein Fehler oder ein unfertiges Level. Die
   *    schwebenden Säulen im Himmel, die willkürlich wirkenden weißen Löcher
   *    im grünen Material — das deutet stark auf einen Fehler in der
   *    Kartengenerierung hin."
   *
   * Bei zu viel Höhlung löst sich das Land auf: Übrig bleiben nadelförmige
   * Säulen und schwebende Brocken, auf denen keine Figur mehr stehen kann.
   *
   * Ein Viertel Hohlraum ist die Grenze — darüber sieht eine Karte nicht mehr
   * zerklüftet aus, sondern kaputt. Das ist keine Geschmacksfrage: Ein
   * Generator, dessen Ergebnis für einen Fehler gehalten wird, ist
   * gescheitert, egal wie interessant die Struktur ist.
   */
  if (k.hohlraum > 0.25) {
    return { ok: false, grund: `zu durchlöchert (${(k.hohlraum * 100).toFixed(0)} % Hohlraum)` };
  }

  /*
   * ## Die Steilheit ebenfalls
   *
   * Eine Karte aus lauter Nadeln hat keine Plateaus — Figuren finden keinen
   * Platz, und jede Bewegung endet in einem Sturz. Gemessen an der Zahl der
   * Überhänge: Sehr viele heißen, dass fast jede Spalte mehrfach unterbrochen
   * ist.
   */
  if (k.ueberhaenge > 0) {
    const ueberhangAnteil = k.ueberhaenge / k.width;
    if (ueberhangAnteil > 0.75) {
      return { ok: false, grund: `zu nadelig (${(ueberhangAnteil * 100).toFixed(0)} % der Spalten unterbrochen)` };
    }
  }

  return { ok: true, grund: '' };
}

export default erzeugeAutonomeKarte;
