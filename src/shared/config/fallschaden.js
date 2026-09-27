/**
 * Der Fallschaden — die Bremse gegen unbegrenztes Springen.
 *
 * ## Warum diese Datei existiert
 *
 * Die Entscheidung des Auftraggebers, wörtlich: „sprung unbegrenzt, fallschaden
 * bremst den character (somit kein freier flug)". Damit ist der Fallschaden
 * keine Randnotiz mehr, sondern eine SPIELREGEL — und Regeln dieses Projekts
 * stehen in `src/shared/config/`, nicht als Zahlen im Motor.
 *
 * ## Was gemessen wurde, bevor die Regel entstand (2026-09-27)
 *
 * Der erste Verdacht des Auftrags war ein DECKEL auf der Fallgeschwindigkeit
 * („terminale Geschwindigkeit"), weil der Aufprall nach 633 px Sturz nicht über
 * die Schwelle stieg. Der Verdacht ist GEMESSEN WIDERLEGT: Es gibt keinen
 * Deckel. Das Aufpralltempo folgt der Fallhöhe wie `v = √(2·g·h)` — Sturz OHNE
 * Sprung in einer freien Spalte, Seed 4242/606/2025 (identische Werte), der
 * physikalische Erwartungswert `√(2·0,42·h)` in der dritten Spalte:
 *
 * | Fallhöhe | Aufpralltempo gemessen | physikalisch | Fallschaden |
 * | ---: | ---: | ---: | ---: |
 * | 20 px | 4,20 | 4,10 | 0,00 |
 * | 40 px | 5,88 | 5,80 | 0,00 |
 * | 80 px | 8,40 | 8,20 | 0,00 |
 * | 117 px | 10,08 | 9,91 | 0,00 |
 * | 200 px | 13,02 | 12,96 | 4,44 |
 * | 300 px | 15,96 | 15,87 | 10,91 |
 * | 400 px | 18,48 | 18,33 | 16,46 |
 * | 500 px | 20,58 | 20,49 | 21,08 |
 * | 600 px | 22,26 | 22,45 | 24,77 |
 * | 700 px | 24,36 | 24,25 | 29,39 |
 *
 * Die Ursache lag woanders: Die Kollisionsprüfung des Charakters tastete nur den
 * ENDPUNKT eines Schritts ab (Punktprobe). Ein schneller Sturz sprang damit über
 * eine dünne Geländekruste, traf „Festkörper bei y+höhe UND bei y+höhe−11" — und
 * genau dieser Fall war im Motor als „nicht gelandet" verdrahtet. Folge: kein
 * Fallschaden UND eine stehende Figur mit unbegrenzt wachsendem `vy` (gemessen:
 * gesetztes `vy` 20 → 0,00 Schaden, `vy` wuchs auf 22,52; gesetztes `vy` 60 →
 * 0,00 Schaden, `vy` wuchs auf 62,52; im Sprungdauerfeuer wuchs `vy` auf 201,48).
 * Die Behebung steht in `characterSystem.js#ersteSolideZeile`; sie macht die
 * Landung unabhängig von der Schrittweite.
 *
 * ## Warum der Zuschlag JE LUFTSPRUNG (und nicht eine niedrigere Schwelle)
 *
 * Ein einzelner Sprung landet mit gemessenen **10,04 px/Takt** (Impuls 9,70,
 * Rückweg unter Schwerkraft). Die Schwelle 11 liegt nur **0,96 px/Takt** darüber.
 * Eine Schwelle unter 10,04 würde also jeden Sprung bestrafen — gewollt ist das
 * Gegenteil. Der Sprung selbst ist nicht das Problem; die ZAHL der Sprünge in
 * der Luft ist es: Jeder Luft-Sprung SETZT die senkrechte Geschwindigkeit neu
 * (`match.js#jump`), statt sie zu addieren, und schenkt der Figur damit Höhe,
 * die sie nicht hat. Diese geborgte Höhe wird jetzt beim Aufprall abgerechnet.
 */
export const FALLSCHADEN = Object.freeze({
  /**
   * Aufprallgeschwindigkeit (px/Takt), ab der Schaden entsteht.
   *
   * Gemessen: Ein einzelner Sprung landet bei 10,04 — die Schwelle MUSS darüber
   * bleiben, sonst kostet jeder einzelne Sprung Leben.
   */
  schwelle: 11,

  /** Schaden je px/Takt über der Schwelle. Unverändert gegenüber dem Vorzustand. */
  skala: 2.2,

  /**
   * Aufschlag auf das Aufpralltempo JE angenommenem Luft-Sprung.
   *
   * Gewählt aus der gemessenen Leiter (Seed 4242/606/2025, `hills`, Sprünge
   * jeweils am Gipfel; vollständige Messung: `docs/fallschaden-bremse.md`).
   * Der Schaden ist `(Aufprall − Schwelle) · Skala`, und der Aufprall ist
   * `vy_land + 0,42 + Zuschlag · Anzahl` — gemessen und nachgerechnet:
   *
   * | Luft-Sprünge | Aufprall ohne Zuschlag | mit Zuschlag | Schaden | Leben danach |
   * | ---: | ---: | ---: | ---: | ---: |
   * | 0 (ein Sprung) | 9,62–10,04 | 9,62–10,04 | **0,00** | 96/96 |
   * | 1 | 12,90 | 15,90 | 10,79 | 85,2/96 |
   * | 2 | 15,00 | 21,00 | 22,01 | 74,0/96 |
   * | 3 | 17,10 | 26,10 | 33,23 | 62,8/96 |
   * | 5 | 20,46 | 35,46 | 53,82 | 42,2/96 |
   * | 9 | 23,00–25,92 | 50,00–52,92 | 86,69–92,23 | 3,8–9,3/96 |
   * | 200 (Dauerfeuer) | 23,40 | 623,40 | 1347,29 | tot |
   *
   * Damit ist das Zielbild erfüllt: ein Sprung kostet nichts, ein bis drei
   * Luft-Sprünge kosten spürbar (10,79–33,23), sehr viele sind tödlich — und eine
   * Geländekante OHNE Sprung zahlt nur den physikalischen Sturz (gemessen
   * unverändert: 40 px → 0 Schaden, 117 px → 0 Schaden).
   */
  luftsprungZuschlag: 3,
});

export default FALLSCHADEN;
