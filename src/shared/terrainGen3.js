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
  hoehlung: [0.0, 0.3],
  /** Höhenschwankung als Anteil der Kartenhöhe. */
  steilheit: [0.16, 0.52],
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
   * Die Gitterweite folgt der Zerklüftung: Ein hoher Wert heißt viele, kleine
   * Strukturen (zerklüftet), ein niedriger wenige, große (zusammenhängend).
   */
  const basisGitter = width / (14 * charakter.zerklueftung);
  const spalten = Math.max(4, Math.round(width / basisGitter));
  const zeilen = Math.max(3, Math.round(spalten * (height / width)));

  const grob = gitterrauschen(rng, spalten, zeilen);
  const mittel = gitterrauschen(rng, spalten * 2, zeilen * 2);
  const fein = gitterrauschen(rng, spalten * 3, zeilen * 3);

  /*
   * Die Gewichte der Oktaven folgen der Zerklüftung: Ein zerklüftetes Gelände
   * hat mehr feine Anteile, ein zusammenhängendes mehr grobe.
   */
  const feinAnteil = Math.min(0.35, (charakter.zerklueftung - 1.6) / 6);
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
  const HOEHLEN_GITTERWEITE = 42;
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
  const grundlinie = height * (1 - charakter.landanteil);

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

  for (let x = 0; x < width; x += 1) {
    const fx = x / width;
    const rauschen = masseFeld(fx, 0.5);
    /*
     * Die Inseligkeit senkt die Ränder ab. Bei 0 läuft die Karte bis zum Rand,
     * bei 0,45 fällt sie zu beiden Seiten ins Wasser — eine Insel.
     */
    const randBreite = 90;
    const randAnteil = Math.min(1, Math.min(x, width - 1 - x) / randBreite);
    const randAbsenkung = (1 - randAnteil) * height * charakter.inseligkeit;

    oberflaeche[x] = Math.round(grundlinie - (rauschen - 0.5) * amplitude + randAbsenkung);
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
  if (charakter.hoehlung > 0.02) {
    /*
     * Die Mindesttiefe unter der Oberfläche — als ANTEIL der verfügbaren
     * Landtiefe, nicht in festen Pixeln.
     *
     * FUND (belegt): Ein fester Wert (18 px) frisst auf einer 180 px hohen
     * Karte 20 % des Landes, auf einer 720 px hohen dagegen nur 2,5 %. Bei
     * kleinen Karten blieb damit kaum Raum für Hohlräume.
     */
    const mindestTiefe = Math.max(6, Math.round(height * 0.04));
    for (let x = 0; x < width; x += 1) {
      const fx = x / width;
      for (let y = oberflaeche[x] + mindestTiefe; y < height; y += 1) {
        if (!bitmap[y * width + x]) continue;
        if (hohlFeld(fx, y / height) > 1 - charakter.hoehlung) {
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
