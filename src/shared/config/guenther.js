/**
 * Günther — der frei laufende Kleinspitz.
 *
 * Ein neutraler NPC, der über die Karte läuft, Spieler anpinkelt, Kackhaufen
 * hinterlässt und bei Berührung ein Glücksrad auslöst. Er ist kein Gegner: Er
 * greift nicht an, man kann ihn nicht besiegen, und er gehört keinem Team.
 *
 * Alle Werte stehen hier, damit sich das Verhalten an einer Stelle abstimmen
 * lässt. Die Simulation liest ausschließlich aus dieser Datei.
 *
 * @module guenther
 */

/** Name und Aussehen — der Client zeichnet ihn daraus. */
export const GUENTHER_IDENTITY = Object.freeze({
  name: 'Günther',
  breed: 'Kleinspitz',
  /** Fellfarbe: hellbraun, wie gefordert. */
  coat: [196, 150, 96],
  coatDark: [150, 108, 62],
  belly: [232, 208, 172],
  nose: [46, 38, 34],
  /** Schulterhöhe in Kartenpixeln (der Kleinspitz ist ein kleiner Hund). */
  height: 22,
  length: 30,
});

/**
 * Erscheinungen je Spiel.
 *
 * Der Mittelwert ist 2, die Zahl wird aber AUSGEWÜRFELT (Poisson), nicht gesetzt:
 * So gibt es Spiele ganz ohne Günther und solche mit drei Auftritten hintereinander
 * — genau das war gewünscht.
 */
export const GUENTHER_SPAWN = Object.freeze({
  /** Mittlere Zahl der Auftritte je Spiel. */
  meanPerMatch: 2,
  /** Höchstzahl, damit ein Ausreißer das Spiel nicht übernimmt. */
  maxPerMatch: 6,
  /**
   * Wie viele Runden er je Auftritt bleibt.
   *
   * Drei statt zwei: Bei zwei Runden blieb ihm nach dem Einlaufen vom Rand oft
   * keine Zeit, einen Spieler zu erreichen — der Auftritt verpuffte.
   */
  roundsPerVisit: 3,
  /** Mindestabstand zum Kartenrand beim Betreten. */
  edgeMargin: 40,
});

/**
 * Reichweiten, die mit der KARTENGRÖSSE wachsen.
 *
 * ## Der Befund, der dazu führte
 *
 * Günther läuft mit **fester** Geschwindigkeit (0,9 px/Tick) und sucht Spieler
 * nur im `seekRange`. Ein Auftritt dauert drei Runden. Die Strecke, die er
 * dabei zurücklegt, ist damit **konstant** — gemessen:
 *
 *     Karte      Breite   Strecke je Auftritt   Anteil der Karte
 *     klein        1280              1296 px             101 %
 *     mittel       2560              1296 px              51 %
 *     gross        3840              1296 px              34 %
 *     krieg        5120              1296 px              25 %
 *
 * Auf der alten Karte (1280 px) durchquerte er sie vollständig — er war eine
 * echte Begegnung. Auf der Kriegskarte kommt er nicht einmal ein Viertel weit:
 * Er bleibt am Rand, und in einer Messung über acht Partien kam **keine einzige
 * Begegnung** zustande.
 *
 * ## Die Lösung: Anteile statt fester Werte
 *
 * Alle Reichweiten sind jetzt **Anteile der Kartenbreite**. Bei 1280 px ergeben
 * sie dieselben Werte wie vorher — auf größeren Karten wachsen sie mit.
 *
 * Der Bezug ist `GUENTHER_REFERENZ_BREITE`, die Kartenbreite, auf die die
 * ursprünglichen Werte abgestimmt waren. Das ist dieselbe Haltung wie bei den
 * Waffenreichweiten — nur dass Günther sich anpasst, statt zu kurz zu reichen.
 */
export const GUENTHER_REFERENZ_BREITE = 1280;

/**
 * Laufverhalten.
 *
 * Die Werte sind Anteile der Kartenbreite (siehe oben) und werden über
 * `guentherBewegung(kartenBreite)` in Pixel umgerechnet.
 */
export const GUENTHER_MOVEMENT = Object.freeze({
  /**
   * Gehgeschwindigkeit als Anteil der Kartenbreite je Tick.
   *
   * 0,9 px bei 1280er Breite = 0,9 / 1280 = 0,000703. Auf der Kriegskarte
   * (5120 px) ergibt das 3,6 px/Tick — er läuft dort viermal so schnell, weil
   * die Karte viermal so weit ist.
   */
  speedAnteil: 0.9 / 1280,
  /**
   * Mittlere Strecke zwischen zwei zufälligen Richtungswechseln, als Anteil
   * der Kartenbreite.
   *
   * FUND (belegt): Hier stand eine feste Wahrscheinlichkeit von 0,004 je Tick —
   * das ist eine Umkehr alle 250 Ticks. Bei Günthers Tempo sind das rund
   * **450 px**, unabhängig von der Karte:
   *
   *     Karte    Breite   Strecke zwischen Umkehrungen   Anteil
   *     klein      1280                        450 px     35 %
   *     mittel     2560                        450 px     18 %
   *     krieg      5120                        450 px      9 %
   *
   * Auf der kleinen Karte kam er damit weit — auf der großen pendelt er am
   * Rand und trifft niemanden. Gemessen in acht Partien: keine Begegnung.
   *
   * Jetzt ist es ein Anteil: 450 px bei 1280er Breite ist dieselbe Strecke,
   * aber auf jeder Kartengröße derselbe ANTEIL.
   */
  turnStreckeAnteil: 450 / 1280,
  /** Pause vor einem Richtungswechsel in Ticks. */
  pauseTicks: [24, 90],
  /** Wie weit er dem Gefälle folgt (er läuft AUF der Oberfläche). */
  surfaceFollow: 1,
  /**
   * Ab welcher Entfernung er auf den nächsten Spieler ZU läuft — als Anteil.
   *
   * Ohne das läuft er nur geradeaus und trifft nie jemanden: Ein Hund, der
   * ausgewichen wird, pinkelt nicht. Er sucht die Nähe — das ist der Grund,
   * warum die Mechanik überhaupt greift.
   *
   * 320 px bei 1280er Breite = ein Viertel der Karte.
   */
  seekRangeAnteil: 320 / 1280,
  /** Anteil der Geschwindigkeit, mit der er einem Ziel folgt. */
  seekSpeed: 1.25,
});

/**
 * Rechnet Günthers Bewegungswerte für eine Kartenbreite aus.
 *
 * @param {number} kartenBreite
 * @returns {{speed:number, seekRange:number}} Pixelwerte
 */
export function guentherBewegung(kartenBreite) {
  const breite = Number.isFinite(kartenBreite) && kartenBreite > 0
    ? kartenBreite
    : GUENTHER_REFERENZ_BREITE;
  return {
    speed: GUENTHER_MOVEMENT.speedAnteil * breite,
    seekRange: GUENTHER_MOVEMENT.seekRangeAnteil * breite,
  };
}

/**
 * Anpinkeln.
 *
 * Die Schadenshöhe sinkt mit jedem weiteren Mal auf DENSELBEN Spieler: Wer schon
 * dreimal angepinkelt wurde, verliert kaum noch Leben. Das verhindert, dass
 * Günther einen Spieler allein durch Anpinkeln ausschaltet.
 */
export const GUENTHER_PEE = Object.freeze({
  /** Erste Pinkelrunde nach so vielen Ticks. Er pinkelt wirklich andauernd. */
  intervalTicks: [45, 95],
  /** Reichweite, in der er zielt. */
  range: 130,
  /** Schaden beim ersten Mal. */
  baseDamage: 9,
  /** Jeder weitere Treffer auf denselben Spieler wird damit multipliziert. */
  decay: 0.72,
  /** Untergrenze, damit ein Treffer nie ganz wirkungslos ist. */
  minDamage: 1,
});

/**
 * Kackhaufen.
 *
 * Tritt ein Spieler hinein, wirkt der Haufen drei Runden: Schaden je Zug und
 * verlangsamte Fortbewegung. Jeder Haufen trifft denselben Spieler nur einmal —
 * sonst würde ein einziger Haufen über drei Runden dreifach zuschlagen.
 */
export const GUENTHER_POOP = Object.freeze({
  intervalTicks: [200, 340],
  /** Radius, in dem ein Haufen liegt. */
  radius: 14,
  /** Trittradius, in dem ein Spieler hineingerät. */
  triggerRadius: 22,
  /** Wie viele Runden der Haufen wirkt. */
  turns: 3,
  /** Schaden je Zug. */
  damagePerTurn: 4,
  /** Verlangsamung: Faktor auf Sprung und Bewegung. */
  slowFactor: 0.55,
  /** Höchstzahl gleichzeitig liegender Haufen. */
  maxPiles: 6,
});

/**
 * Berührung löst das Glücksrad aus.
 *
 * `CONTACT_RADIUS` ist bewusst knapp: Man muss Günther schon anlaufen, nicht
 * bloß in seine Nähe kommen.
 */
export const GUENTHER_CONTACT = Object.freeze({
  radius: 26,
  /**
   * Mindestbewegung des Spielers in diesem Tick, damit es als Berührung gilt.
   *
   * Ein Spieler, der stillsteht, „berührt" Günther nicht — auch wenn der Hund an
   * ihm vorbeiläuft. Gewünscht war die Berührung beim eigenen Laufen.
   */
  minPlayerMove: 0.6,
  /** Nach einem Rad bleibt er so viele Ticks unbeteiligt (sonst Dauerrad). */
  cooldownTicks: 240,
});

/**
 * Die fünf Ausgänge des Glücksrads.
 *
 * Die Gewichte ergeben zusammen 100, damit die Wahrscheinlichkeit direkt
 * ablesbar ist. Heimdall liegt bei genau 5 Prozent — die Obergrenze aus der
 * Anforderung. Er ist der einzige Ausgang, der eine LEGENDÄRE Waffe gibt.
 */
export const GUENTHER_WHEEL = Object.freeze([
  {
    id: 'gassi',
    weight: 30,
    label: 'Du gehst mit Günther Gassi',
    detail: 'Günther muss dringend raus. Du setzt eine Runde aus.',
    effect: { kind: 'skip', turns: 1 },
  },
  {
    id: 'fuettern',
    weight: 25,
    label: 'Du fütterst Günther',
    detail: 'Er frisst dir aus der Hand — und du setzt eine Runde aus. Zur Belohnung findet er eine Waffe für dich.',
    effect: { kind: 'skipAndWeapon', turns: 1, rarity: 'low' },
  },
  {
    id: 'spielen',
    weight: 22,
    label: 'Du spielst mit Günther',
    detail: 'Er dreht vor Freude Kreise. Du setzt eine Runde aus, fühlst dich aber deutlich besser.',
    effect: { kind: 'skipAndHeal', turns: 1, heal: [50, 100] },
  },
  {
    id: 'angriff',
    weight: 18,
    label: 'Günther greift dich an',
    detail: 'Der Kleinspitz schnappt zu. Das hätte er nicht tun müssen.',
    effect: { kind: 'damage', range: [1, 99] },
  },
  {
    id: 'heimdall',
    weight: 5,
    label: 'Günther verwandelt sich in Heimdall',
    detail: 'Das Gjallarhorn erklingt, die Bifröst legt sich über das Feld — und der Wächter übergibt dir eine Waffe der Legenden.',
    effect: { kind: 'legendaryWeapon', animation: 'bifroest' },
  },
]);

/** Gewichtssumme der Ausgänge (muss 100 sein). */
export const GUENTHER_WHEEL_TOTAL = GUENTHER_WHEEL.reduce((summe, o) => summe + o.weight, 0);

/** Höchstwahrscheinlichkeit für Heimdall in Prozent. */
export const HEIMDALL_MAX_PERCENT = 5;

/** Gewichte für eine gewöhnliche Waffe (niedrige Seltenheit). */
export const LOW_RARITY_WEIGHTS = Object.freeze({
  common: 68, uncommon: 26, rare: 6, epic: 0, legendary: 0,
});

/**
 * Gewichte für Heimdalls Gabe: ausschließlich legendär.
 * Über die Ableitung nach `powerTier` fällt darunter die höchste Stufe.
 */
export const LEGENDARY_WEIGHTS = Object.freeze({
  common: 0, uncommon: 0, rare: 0, epic: 12, legendary: 88,
});

export default GUENTHER_IDENTITY;

/*
 * ============================================================================
 * Fassung 2: Günthers Aktionen (Versionsmarke `config.guenther`, AGENTS.md §2)
 * ============================================================================
 *
 * Günther kann mehr, als zu laufen, zu pinkeln und zu kacken: Er frisst Kisten,
 * hüpft, zieht am Seil, wühlt, kuschelt, lässt sich den Rücken kraulen, macht
 * Sitz und Platz und dreht gelegentlich durch. Das ändert den Verlauf jeder
 * Partie, in der er auftritt — deshalb trägt der Replay-Kopf `config.guenther`:
 *
 *   - `GUENTHER_ALT` (1): nur Laufen, Pinkeln, Kacken, Glücksrad. Das Feld FEHLT
 *     in jeder Aufzeichnung aus der Zeit davor; `ReplayRecorder.fromJSON` setzt
 *     dann diesen Wert. Bit für Bit das alte Verhalten.
 *   - `GUENTHER_AKTIONEN` (2): wie 1, dazu die Aktionen unten. Sie würfeln mit
 *     einem EIGENEN Teilgenerator (`GUENTHER_AKTION`), der Zufallsstrom der
 *     Fassung 1 bleibt unberührt.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 */
export const GUENTHER_ALT = 1;
export const GUENTHER_AKTIONEN = 2;
/** Fassung 3: Feinschliff nach Messung (`scripts/tiere-verteilung.mjs`), siehe unten. */
export const GUENTHER_FEINSCHLIFF = 3;
/** Fassung NEUER Partien (Server und Client geben sie ausdrücklich mit). */
export const GUENTHER_FASSUNG_STANDARD = GUENTHER_FEINSCHLIFF;

/**
 * Fehlende oder unbekannte Werte sind `GUENTHER_ALT`: Wer die Marke nicht trägt,
 * spielt wie vorher. (Anders als bei `kisten` gilt das schon im Konstruktor von
 * `MatchController` und `ReplayRecorder`: Ein Match ohne Angabe bleibt Bit für Bit
 * das alte.)
 */
export function normalisiereGuenther(fassung) {
  if (fassung === GUENTHER_FEINSCHLIFF) return GUENTHER_FEINSCHLIFF;
  return fassung === GUENTHER_AKTIONEN ? GUENTHER_AKTIONEN : GUENTHER_ALT;
}

/**
 * Posen, die der Client als Sprite zeichnet. Die Reihenfolge ist das Drahtformat
 * (Index in den Flag-Bits 1–5 des Günther-Blocks) — nur hinten anhängen.
 */
export const GUENTHER_POSEN = Object.freeze([
  'stehen', 'laufen', 'sitz', 'platz', 'huepfen', 'essen', 'kacken', 'wuehlen',
  'ziehen', 'kuscheln', 'rueckenlage', 'bellen', 'schlafen', 'schuetteln',
]);

/**
 * Die Aktionen (Fassung 2).
 *
 * `gewicht`: Auswahlgewicht. `ticks`: Dauer. `wirkung`: Tick (vom Start gezählt),
 * an dem die Wirkung eintritt. `pose`: Sprite. `braucht`: Bedingung
 * (`kiste`: Kiste in `reichweite`; `spieler`: Spieler in `reichweite`).
 * `ruhig`: Pinkel- und Kack-Uhr stehen, solange die Aktion läuft (Sitz, Platz).
 */
export const GUENTHER_AKTION_REGELN = Object.freeze({
  /** Wartezeit zwischen zwei Aktionen. */
  intervalTicks: [150, 280],
  /** Zwei Aktionen nie unmittelbar hintereinander dieselbe. */
  essen: Object.freeze({ gewicht: 3, ticks: 70, wirkung: 35, pose: 'essen', braucht: 'kiste', reichweite: 150, heilung: 20, heilReichweite: 180 }),
  huepfen: Object.freeze({ gewicht: 3, ticks: 50, wirkung: 25, pose: 'huepfen' }),
  ziehen: Object.freeze({ gewicht: 2, ticks: 70, wirkung: 35, pose: 'ziehen', braucht: 'spieler', reichweite: 260, zugX: 4.5, zugY: -2.5 }),
  wuehlen: Object.freeze({ gewicht: 3, ticks: 80, wirkung: 40, pose: 'wuehlen', kraterRadius: 11, kraterTiefe: 70, fundChance: 0.35 }),
  kuscheln: Object.freeze({ gewicht: 4, ticks: 90, wirkung: 80, pose: 'kuscheln', braucht: 'spieler', reichweite: 90, heilung: 15 }),
  kraulen: Object.freeze({ gewicht: 2, ticks: 100, wirkung: 90, pose: 'rueckenlage', braucht: 'spieler', reichweite: 70, heilung: 28}),
  sitz: Object.freeze({ gewicht: 2, ticks: 90, wirkung: 90, pose: 'sitz', ruhig: true }),
  platz: Object.freeze({ gewicht: 2, ticks: 120, wirkung: 120, pose: 'platz', ruhig: true }),
  /** Wildes Bellen: Chaos — Spieler in `radius` werden alle `takt` Ticks aufgescheucht. */
  chaos: Object.freeze({ gewicht: 1.5, ticks: 150, wirkung: 0, pose: 'bellen', radius: 260, takt: 30, stossX: 3.2, stossY: -3, tempo: 2.2 }),
});

/** Reihenfolge der Auswahl (feste Reihenfolge = deterministisch). */
export const GUENTHER_AKTION_IDS = Object.freeze(Object.keys(GUENTHER_AKTION_REGELN).filter(k => k !== 'intervalTicks'));

/** Wie lange die Pose „kacken" beim Ablegen eines Haufens steht. */
export const GUENTHER_KACK_POSE_TICKS = 36;


/*
 * ============================================================================
 * Fassung 3: Feinschliff nach Messung (Versionsmarke `config.guenther` = 3)
 * ============================================================================
 *
 * Messung: `node scripts/tiere-verteilung.mjs --guenther=2 --cookie=2` (60 Seeds, 2x2-Bot,
 * 7 Minuten, 25 Runden). Befund der Fassung 2:
 *
 *     Pinkeln 43-50 mal je Partie (75-82 Schaden), Häufchen 10-13 Treffer (120-150 Schaden):
 *     Günther verursachte ~55 % des Gesamtschadens einer Bot-Partie (Waffen ~200, Tier ~260).
 *     Er sollte Würze sein, nicht die Hauptwaffe.
 *
 * Fassung 3 senkt Pinkeln und Häufchen (seltener, weniger Schaden), lässt das Rad unberührt
 * (Heimdall bleibt bei 5 %) und macht den Rad-Angriff NICHT tödlich: Wer Günther anläuft,
 * verliert höchstens bis auf 1 Leben. Aktionen, Gewichte und Wirkungen bleiben wie in Fassung 2.
 * Alles andere (Aktionsplan, Rad-Gewichte) gilt unverändert, der Zufallsstrom bleibt derselbe
 * Teilgenerator, nur die Zahlen der Wirkung ändern sich.
 */
export const GUENTHER_PEE_3 = Object.freeze({
  ...GUENTHER_PEE,
  intervalTicks: [90, 170],
  baseDamage: 7,
  decay: 0.65,
});

export const GUENTHER_POOP_3 = Object.freeze({
  ...GUENTHER_POOP,
  intervalTicks: [420, 700],
  damagePerTurn: 3,
  maxPiles: 4,
});

/**
 * Die Werte, die Simulation und Anzeige für eine Fassung lesen.
 *
 * @param {number} fassung - normalisierte Fassung (1, 2 oder 3)
 * @returns {{pee:object, poop:object, aktionen:object, radAngriffNichtToedlich:boolean}}
 */
export function guentherWerte(fassung) {
  const neu = fassung >= GUENTHER_FEINSCHLIFF;
  return {
    pee: neu ? GUENTHER_PEE_3 : GUENTHER_PEE,
    poop: neu ? GUENTHER_POOP_3 : GUENTHER_POOP,
    aktionen: GUENTHER_AKTION_REGELN,
    radAngriffNichtToedlich: neu,
  };
}
