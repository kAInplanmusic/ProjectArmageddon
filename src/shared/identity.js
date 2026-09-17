/**
 * Identität: wer spielt, und wo sein Profil liegt.
 *
 * ## Warum diese Datei existiert
 *
 * Ein Audit stellte fest: Profil, Erfolge und Statistik liegen im
 * **`localStorage` des Browsers** (`main.js`, `PROFIL_SCHLUESSEL`). Das heißt:
 * Ein anderer Rechner, ein anderer Browser oder ein gelöschter Cache bedeutet
 * den Verlust aller Erfolge.
 *
 * Konten und Anmeldung sind eine **Produkt- und Datenschutzentscheidung** —
 * welche Daten wohin gehören, wer sie sieht, wie lange sie bleiben. Diese
 * Entscheidung ist nicht gefallen, und sie wird hier auch nicht vorweggenommen.
 *
 * ## Was diese Datei leistet
 *
 * Sie zieht die **Trennstelle**: Alles, was über „wer spielt" und „wo liegt
 * sein Profil" entschieden werden muss, steht an EINER Stelle statt verstreut
 * im Client. Wird die Entscheidung später getroffen, ist hier der Andockpunkt —
 * nicht in zwanzig verstreuten Aufrufen.
 *
 * Bis dahin arbeitet der **lokale** Weg: Das Profil liegt im Browser, und eine
 * Geräte-Kennung erlaubt es, einen Spieler wiederzuerkennen, ohne ihn zu
 * identifizieren.
 *
 * ## Was ausdrücklich NICHT passiert
 *
 * Es werden **keine personenbezogenen Daten** erhoben. Die Kennung ist eine
 * zufällige Zeichenkette ohne Bezug zu einer Person, einem Gerät oder einem
 * Konto. Sie sagt nur: „Dieser Browser war schon einmal hier."
 *
 * Das ist die Datenschutz-freundlichste Variante: Sie ermöglicht Fortschritt
 * über Sitzungen hinweg, ohne irgendetwas über den Spieler zu wissen.
 *
 * @module identity
 */

/** Der Ablageschlüssel des lokalen Profils. Bleibt, damit alte Profile gelten. */
export const PROFIL_SCHLUESSEL = 'pa-profil-v1';

/** Der Ablageschlüssel der Geräte-Kennung. */
export const GERAETE_SCHLUESSEL = 'pa-geraet-v1';

/**
 * Die möglichen Ablageorte eines Profils.
 *
 * Sie stehen hier als Aufzählung, damit die noch offene Entscheidung sichtbar
 * ist statt in Kommentaren verstreut.
 */
export const ABLAGEORTE = Object.freeze({
  /** Im Browser des Spielers. Heute so. */
  LOKAL: 'lokal',
  /** Auf dem Server, dem Gerät zugeordnet. Braucht eine Geräte-Kennung. */
  SERVER_GERAET: 'server-geraet',
  /** Auf dem Server, einem Konto zugeordnet. Braucht Anmeldung. */
  SERVER_KONTO: 'server-konto',
});

/** Wie es heute läuft. Der Wert steht hier, damit er an EINER Stelle änderbar ist. */
export const AKTUELLER_ABLAGEORT = ABLAGEORTE.LOKAL;

/**
 * Erzeugt eine zufällige Kennung.
 *
 * Nutzt `crypto.getRandomValues`, wenn vorhanden — dieselbe Wahl wie bei der
 * Seed-Erzeugung (`prng.js`). Ohne das wäre die Kennung vorhersagbar, und zwei
 * Spieler könnten auf demselben Profil landen.
 *
 * @returns {string} 32 Zeichen aus Hexziffern
 */
export function erzeugeKennung() {
  const quelle = globalThis.crypto;
  const bytes = new Uint8Array(16);

  if (quelle?.getRandomValues) {
    quelle.getRandomValues(bytes);
  } else {
    // Rückfall für Umgebungen ohne crypto — bewusst NICHT Math.random, weil
    // das im Simulationspfad verboten ist und hier dieselbe Regel gilt.
    throw new Error(
      'erzeugeKennung braucht crypto.getRandomValues. Ohne eine echte '
      + 'Zufallsquelle wäre die Kennung vorhersagbar.',
    );
  }

  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Liest die Geräte-Kennung — und legt sie an, wenn es noch keine gibt.
 *
 * Die Kennung ist **kein** Konto: Sie hat keinen Namen, kein Passwort und keinen
 * Bezug zu einer Person. Sie erlaubt nur, denselben Browser wiederzuerkennen.
 *
 * @param {object} [speicher] - `localStorage`-ähnlich; für Tests ersetzbar
 * @returns {string|null} die Kennung, oder `null` ohne Speicher
 */
export function geraeteKennung(speicher = globalThis.localStorage) {
  if (!speicher) return null;

  try {
    const vorhanden = speicher.getItem(GERAETE_SCHLUESSEL);
    if (vorhanden) return vorhanden;

    const neu = erzeugeKennung();
    speicher.setItem(GERAETE_SCHLUESSEL, neu);
    return neu;
  } catch {
    // Ein voller oder gesperrter Speicher (Privatmodus) darf das Spiel nicht
    // aufhalten: Ohne Kennung spielt man eben ohne Wiedererkennung.
    return null;
  }
}

/**
 * Beschreibt den heutigen Stand der Ablage — für die Anzeige.
 *
 * Der Text ist **maschinell** zusammengesetzt, keine erfundene Begründung: Er
 * nennt nur, was im Code steht. Ein Spieler soll wissen, wo sein Fortschritt
 * liegt, ohne die Quelle zu lesen.
 *
 * @returns {{ort: string, text: string, hinweis: string|null}}
 */
export function ablageHinweis() {
  if (AKTUELLER_ABLAGEORT === ABLAGEORTE.LOKAL) {
    return {
      ort: AKTUELLER_ABLAGEORT,
      text: 'Fortschritt liegt in diesem Browser',
      hinweis: 'Ein anderer Browser oder ein gelöschter Cache bedeutet: '
        + 'Erfolge und Statistik beginnen von vorn. Kein Konto, keine Anmeldung '
        + '— es werden auch keine Daten über dich gespeichert.',
    };
  }
  return {
    ort: AKTUELLER_ABLAGEORT,
    text: 'Fortschritt liegt auf dem Server',
    hinweis: null,
  };
}
