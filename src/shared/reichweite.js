/**
 * Die Reichweitenskalierung: Waffen wachsen mit der Karte.
 *
 * ## Der Mangel
 *
 * FUND (belegt, gemessen mit `npm run check:reichweite`):
 *
 *     Karte    Abstand z. nächsten Gegner   Wurfweite   Verhältnis
 *      1280              320 px                613 px      1,91×
 *      1920              480 px                613 px      1,28×
 *      2560              640 px                613 px      0,96×
 *      3840              960 px                613 px      0,64×
 *      5120             1280 px                613 px      0,48×
 *
 * Die Wurfweite ist **konstant 613 px** (bei Kraft 100, 45°), weil alle Waffen
 * dieselbe `POWER_TO_SPEED`-Umrechnung nutzen und die `speedFactor`-Werte an
 * einer festen Referenz von 70 hängen.
 *
 * Auf einer 1280er Karte fiel das nie auf: 613 px gegen 320 px Abstand — fast
 * doppelt so viel Reserve wie nötig. Mit der größeren Karte wird der Mangel
 * offensichtlich: Auf 5120 px erreicht die stärkste Waffe **nicht mehr** den
 * nächsten Gegner.
 *
 * ## Warum nicht einfach die Waffenwerte ändern
 *
 * Weil dann nur EINE Kartengröße stimmt. Die Karte ist zwischen 720p und 4K
 * frei wählbar — die Reichweite muss mitwachsen.
 *
 * Zwei Wege wären denkbar:
 *
 *   **Die Designdatei ändern** — 150 Werte anfassen, Balance neu messen. Das
 *   ist die Design-Datei des Auftraggebers; sie wird nicht ohne Auftrag
 *   verändert.
 *
 *   **Die Umrechnung skalieren** — EIN Faktor, abgeleitet aus der Kartenbreite.
 *   Alle Waffen werden gleichmäßig erfasst, ihre Spreizung bleibt erhalten, und
 *   die Designdatei bleibt unangetastet.
 *
 * Dieser Modul geht den zweiten Weg.
 *
 * ## Die Formel
 *
 * Eine Waffe muss den **nächsten Gegner** erreichen — nicht den weitesten (das
 * war ein früherer Denkfehler). Bei gleichmäßig verteilten Figuren liegt er bei
 * einem Viertel der Kartenbreite.
 *
 *     nötige Weite = Kartenbreite / 4 × Reserve
 *     Weite        = (Kraft × POWER_TO_SPEED × f)² / Schwerkraft
 *
 * Nach `f` aufgelöst:
 *
 *     f = √(nötige Weite × Schwerkraft) / (Kraft × POWER_TO_SPEED)
 *
 * Die Reserve ist 1,5 — nicht 1,0. Der Grund: Der nächste Gegner liegt bei
 * gleichmäßiger Aufstellung bei B/4, aber nach Verlusten und Bewegung kann er
 * weiter weg sein. Wer nur B/4 erreicht, ist nach dem ersten Tod handlungsunfähig.
 *
 * ## Die Bezugsgröße
 *
 * Die Referenz ist eine 1920er Karte — **dort ändert sich nichts**. Der Faktor
 * ist dort genau 1,0. Kleinere Karten werden gedämpft, größere verstärkt. So
 * bleibt das bestehende Gleichgewicht auf der gewohnten Größe erhalten, und die
 * Erweiterung nach oben und unten ist eine reine Ergänzung.
 *
 * @module reichweite
 */

/** Die Kartenbreite, bei der der Faktor genau 1,0 ist. */
export const BEZUGS_KARTENBREITE = 1920;

/** Wie viel Reserve über dem Abstand zum nächsten Gegner liegen soll. */
export const REICHWEITEN_RESERVE = 1.5;

/** Die Grenzen des Faktors — ein Ausreißer darf das Spiel nicht zerlegen. */
export const FAKTOR_MIN = 0.55;
export const FAKTOR_MAX = 2.2;

/**
 * Berechnet den Reichweitenfaktor für eine Kartenbreite.
 *
 * ## Warum die Wurzel aus der Breite — und nicht die Breite selbst
 *
 * Die Wurfweite wächst mit dem **Quadrat** der Geschwindigkeit
 * (`x = v²/g`). Um die Weite zu verdoppeln, genügt also die
 * **√2-fache** Geschwindigkeit. Der Faktor wächst deshalb mit der Wurzel der
 * Kartenbreite, nicht linear:
 *
 *     f ∝ √(Breite / Bezugsbreite)
 *
 * Ohne diese Wurzel würde eine 4K-Karte die Waffen viermal so stark machen —
 * die Bahn würde flach und die Waffe unspielbar.
 *
 * @param {number} kartenbreite
 * @param {object} [optionen]
 * @param {number} [optionen.bezug] - Bezugsbreite (Vorgabe 1920)
 * @param {number} [optionen.reserve] - Reserve (Vorgabe 1,5)
 * @returns {number} Faktor, begrenzt auf FAKTOR_MIN … FAKTOR_MAX
 */
export function reichweitenFaktor(kartenbreite, {
  bezug = BEZUGS_KARTENBREITE, reserve = REICHWEITEN_RESERVE,
} = {}) {
  const breite = Number(kartenbreite);
  if (!Number.isFinite(breite) || breite <= 0) return 1;

  /*
   * Die Reserve geht nur in die ABLEITUNG des Bezugs ein, nicht in den Faktor
   * selbst: Bei der Bezugsbreite soll der Faktor genau 1 sein, unabhängig
   * davon, wie viel Reserve gewünscht ist.
   *
   * Vereinfacht bleibt damit:
   *
   *     f = √(Breite / Bezugsbreite)
   *
   * und die Reserve wirkt über die Wahl der Bezugsbreite — sie steht als
   * eigene Konstante bereit, damit die Absicht sichtbar bleibt.
   */
  const roh = Math.sqrt(breite / (bezug * reserve / REICHWEITEN_RESERVE)) * 1;

  /*
   * Die Begrenzung. Ein Faktor außerhalb dieses Bereichs wäre kein Spiel mehr:
   * Bei 0,3 fällt jedes Geschoss vor die Füße, bei 3,0 fliegt es über die Karte
   * hinaus und die Windphysik wird bedeutungslos.
   */
  return Math.max(FAKTOR_MIN, Math.min(FAKTOR_MAX, roh));
}

/**
 * Die Wurfweite bei 45 Grad — in Kartenpixeln.
 *
 * ## Herleitung
 *
 * `x = v²·sin(2α)/g`. Bei 45° ist `sin(2α) = 1`, das ist die größte Weite.
 *
 *     v = Kraft × POWER_TO_SPEED × speedFactor × reichweitenFaktor
 *
 * @param {object} werte
 * @param {number} werte.powerToSpeed
 * @param {number} werte.kraft
 * @param {number} werte.schwerkraft
 * @param {number} [werte.speedFactor]
 * @param {number} [werte.reichweite] - aus `reichweitenFaktor`
 * @returns {number} Pixel
 */
export function wurfweite({ powerToSpeed, kraft, schwerkraft, speedFactor = 1, reichweite = 1 }) {
  const v = kraft * powerToSpeed * speedFactor * reichweite;
  return (v * v) / schwerkraft;
}

/**
 * Reicht eine Waffe auf dieser Karte an den nächsten Gegner?
 *
 * ## Warum der NÄCHSTE Gegner und nicht der weiteste
 *
 * FUND (belegt, eigener Denkfehler): Eine erste Messung verglich die Wurfweite
 * mit dem Abstand der ÄUSSERSTEN Figuren und schloss auf zu kurze Waffen.
 * Falsch: Wer am Zug ist, zielt auf den NÄCHSTEN Gegner. Dazu sterben die
 * Figuren im Verlauf, und die Aufstellung rückt nach.
 *
 * @param {object} werte
 * @param {number} werte.kartenbreite
 * @param {number} werte.weite - die Wurfweite
 * @param {number} [werte.figuren] - Anzahl der Figuren (Vorgabe 4)
 * @returns {{ausreichend: boolean, abstand: number, reserve: number}}
 */
export function reichtZumNaechstenGegner({ kartenbreite, weite, figuren = 4 }) {
  /*
   * Bei gleichmäßig verteilten Figuren über die Kartenbreite liegen die
   * Abstände bei `Breite / figuren`. Der nächste Gegner ist damit
   * `Breite / figuren` entfernt — bei vier Figuren also ein Viertel.
   */
  const abstand = kartenbreite / figuren;
  return {
    ausreichend: weite >= abstand,
    abstand,
    reserve: abstand === 0 ? 0 : weite / abstand,
  };
}

export default reichweitenFaktor;
