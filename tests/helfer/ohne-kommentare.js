/**
 * Quelltext ohne Kommentare — für Textproben, die etwas VERBIETEN.
 *
 * ============================================================================
 * WARUM ES DIESEN HELFER NUR EINMAL GIBT
 * ============================================================================
 *
 * Vorher stand diese Funktion in VIER Testdateien, in DREI verschiedenen
 * Fassungen:
 *
 *   shot-prediction.test.js       `/\/\/.*$/gm` mit `(^|[^:])`-Wächter
 *   reichweite-konsistenz.test.js `/^\s*\/\/.*$/gm` — nur GANZE Kommentarzeilen
 *   turret-zerlegung.test.js      wie reichweite-konsistenz
 *   eine-regel-eine-stelle.test.js filtert Zeilen, die mit `//` beginnen
 *
 * Der Unterschied ist keine Geschmacksfrage, er ändert das Urteil:
 *
 *     const g = 0.32;   // war früher die Zahl aus ballistics.js
 *
 * Die erste Fassung entfernt den nachgestellten Kommentar, die anderen beiden
 * lassen ihn STEHEN. Ein Test, der eine Zahl verbietet, meldet damit je nach
 * Kopie einen Treffer oder keinen — für dieselbe Datei. Eine Regel an vier
 * Stellen ist vier Regeln, und drei davon sind falsch.
 *
 * ============================================================================
 * ENTSCHEIDUNG
 * ============================================================================
 *
 * Entfernt werden ALLE Kommentare, auch nachgestellte. Begründung: ob eine
 * Zahl in einer eigenen Kommentarzeile steht oder hinter dem Semikolon, ist
 * für die Frage „gibt es eine ZWEITE Regel?" bedeutungslos — beides ist eine
 * Erklärung, kein Code.
 *
 * Genau diese Lehre hat sich das Audit-Werkzeug schon einmal eingebaut
 * (`tools/audit-mcp/README.md`: „Kommentarzeilen sind keine Treffer"). Hier
 * gilt sie für die Testseite.
 *
 * ============================================================================
 * GRENZE DER NÄHERUNG
 * ============================================================================
 *
 * Diese Funktion ist kein Parser. Sie kennt drei Fälle nicht:
 *
 *   1. Ein `//` INNERHALB einer Zeichenkette wird mitgeschnitten (der Wächter
 *      `(^|[^:])` rettet nur die häufige Form `https://…`).
 *   2. Ein `/*` innerhalb einer Zeichenkette beginnt fälschlich einen Block.
 *   3. Ein Regex-Literal mit `//` wird wie ein Kommentar behandelt.
 *
 * Für die geprüften Quelldateien ist das folgenlos (nachgesehen: keine URLs
 * und keine `//`-Literale in den Zeichenketten). Wer diesen Helfer auf eine
 * Datei mit solchen Inhalten ansetzt, muss ihn vorher prüfen — nicht blind
 * vertrauen.
 */

/**
 * @param {string} text Quelltext
 * @returns {string} derselbe Text ohne Block- und Zeilenkommentare
 */
export function ohneKommentare(text) {
  return text
    /* Blockkommentare zuerst — sonst frisst der Zeilenausdruck ihren Inhalt. */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    /*
     * HTML-Kommentare. Auch hier gilt die eine Regel: ob eine Zahl in einer
     * JS- oder in einer HTML-Erklaerung steht, ist fuer die Frage nach einer
     * ZWEITEN Regel bedeutungslos. Ein Aufrufer (tests/abort-knopf.test.js,
     * prueft index.html) brauchte das zusaetzlich — statt ihm eine eigene
     * Fassung zu lassen, deckt der eine Helfer beide Dateiarten ab.
     */
    .replace(/<!--[\s\S]*?-->/g, '')
    /*
     * Zeilenkommentare. Der Wächter `(^|[^:])` schützt `://` — sonst würde
     * jede URL den Rest ihrer Zeile verlieren. Das Zeichen vor `//` wird
     * zurückgeschrieben, damit `const x = 1;` nicht zu `const x = 1` wird.
     */
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
