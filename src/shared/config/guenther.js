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

/** Laufverhalten. */
export const GUENTHER_MOVEMENT = Object.freeze({
  /** Gehgeschwindigkeit in Pixeln pro Tick (60 Ticks = 1 s). */
  speed: 0.9,
  /** Wahrscheinlichkeit je Tick, die Richtung zu wechseln. */
  turnChance: 0.004,
  /** Pause vor einem Richtungswechsel in Ticks. */
  pauseTicks: [24, 90],
  /** Wie weit er dem Gefälle folgt (er läuft AUF der Oberfläche). */
  surfaceFollow: 1,
  /**
   * Ab dieser Entfernung läuft er auf den nächsten Spieler ZU.
   *
   * Ohne das läuft er nur geradeaus und trifft nie jemanden: Ein Hund, der
   * ausgewichen wird, pinkelt nicht. Er sucht die Nähe — das ist der Grund, warum
   * die Mechanik überhaupt greift.
   */
  seekRange: 320,
  /** Anteil der Geschwindigkeit, mit der er einem Ziel folgt. */
  seekSpeed: 1.25,
});

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
