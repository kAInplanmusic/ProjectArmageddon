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
        + 'Erfolge und Statistik beginnen von vorn. Nimm ihn deshalb mit — '
        + '„Fortschritt sichern" legt eine Datei an, „Sicherung laden" nimmt '
        + 'sie anderswo wieder an. Kein Konto, keine Anmeldung, keine Daten '
        + 'über dich auf einem Server.',
    };
  }
  return {
    ort: AKTUELLER_ABLAGEORT,
    text: 'Fortschritt liegt auf dem Server',
    hinweis: null,
  };
}

/*
 * ---------------------------------------------------------------------------
 * Profilsicherung (Entscheidung vom 2026-09-20)
 * ---------------------------------------------------------------------------
 *
 * ENTSCHEIDUNG: Es gibt weiterhin **keine Serverkonten**. Der Fortschritt liegt
 * lokal. Damit ein Browserwechsel nicht stillschweigend alles löscht, gibt es
 * stattdessen eine **Sicherung als Datei**: Der Spieler lädt sie herunter und
 * lädt sie anderswo wieder hoch.
 *
 * Warum so: Die eigentliche Beschwerde war „ein gelöschter Cache bedeutet den
 * Verlust aller Erfolge", nicht „ich will ein Konto". Eine Datei löst genau
 * dieses Problem, ohne personenbezogene Daten zu erheben, ohne Anmeldung und
 * ohne eine Speicherfrist, die jemand festlegen und überwachen müsste.
 * `ABLAGEORTE.SERVER_KONTO` bleibt deshalb ausdrücklich **unbenutzt**.
 *
 * Was die Datei NICHT enthält: die **Geräte-Kennung**. Sie ist ein
 * pseudonymes Merkmal des Browsers und hat in einer Sicherung nichts zu suchen —
 * sie würde beim Übertragen nur ein zweites Gerät zusammenführen, das niemand
 * zusammenführen wollte.
 */

/** Format- und Versionskennung einer Profilsicherung. */
export const SICHERUNG_FORMAT = 'pa-profil-sicherung';
export const SICHERUNG_VERSION = 1;

/** Zahlenfelder eines Profils — für die Prüfung einer Sicherung. */
const ZAHLENFELDER = [
  'partien', 'siege', 'niederlagen', 'serie', 'serieRekord',
  'schuesse', 'treffer', 'schaden', 'absorbierterSchaden', 'zuege',
  'spielzeitSekunden',
];

/** Textfelder eines Profils. */
const TEXTFELDER = ['name', 'fraktion'];

function istObjekt(wert) {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Baut eine Sicherung aus einem Profil-Objekt (`PlayerProfile#toJSON()`).
 *
 * @param {object} profil
 * @param {{erstelltAm?: string|null}} [optionen] - Zeitstempel setzt der Aufrufer
 *   (der Client), damit diese Funktion rein bleibt und in Node prüfbar ist.
 */
export function erstelleSicherung(profil, { erstelltAm = null } = {}) {
  return {
    format: SICHERUNG_FORMAT,
    version: SICHERUNG_VERSION,
    erstelltAm,
    profil,
  };
}

/** Sicherung als Text — dieselbe Form, die als Datei landet. */
export function sicherungAlsText(profil, { erstelltAm = null } = {}) {
  return JSON.stringify(erstelleSicherung(profil, { erstelltAm }), null, 2);
}

/**
 * Prüft eine Sicherung und gibt ein BEREINIGTES Profil zurück.
 *
 * Warum bereinigt und nicht durchgereicht: `PlayerProfile` ist tolerant (fehlende
 * Felder bekommen Vorgaben) — genau deshalb darf die Prüfung nicht tolerant sein.
 * Eine Datei mit `waffen: "abc"` ergäbe sonst still ein Profil mit drei Waffen
 * namens „0", „1", „2". Übernommen werden deshalb nur bekannte Felder, und jedes
 * muss den erwarteten Typ haben.
 *
 * @param {unknown} daten - geparste JSON-Struktur
 * @returns {{ok: boolean, fehler: string|null, profil: object|null}}
 */
export function pruefeSicherung(daten) {
  if (!istObjekt(daten)) {
    return { ok: false, fehler: 'Die Datei enthält kein Objekt.', profil: null };
  }
  if (daten.format !== SICHERUNG_FORMAT) {
    return {
      ok: false,
      fehler: `Das ist keine ProjectArmageddon-Sicherung (format: ${String(daten.format)}).`,
      profil: null,
    };
  }
  if (!Number.isInteger(daten.version) || daten.version < 1) {
    return { ok: false, fehler: 'Die Sicherung nennt keine gültige Version.', profil: null };
  }
  if (daten.version > SICHERUNG_VERSION) {
    return {
      ok: false,
      fehler: `Die Sicherung stammt aus einer neueren Fassung (Version ${daten.version}, `
        + `gelesen wird ${SICHERUNG_VERSION}).`,
      profil: null,
    };
  }
  if (!istObjekt(daten.profil)) {
    return { ok: false, fehler: 'Die Sicherung enthält kein Profil.', profil: null };
  }

  const quelle = daten.profil;
  const profil = {};

  for (const feld of ZAHLENFELDER) {
    const wert = quelle[feld];
    if (wert === undefined) continue;
    if (typeof wert !== 'number' || !Number.isFinite(wert)) {
      return { ok: false, fehler: `Feld „${feld}" ist keine Zahl.`, profil: null };
    }
    profil[feld] = wert;
  }
  for (const feld of TEXTFELDER) {
    const wert = quelle[feld];
    if (wert === undefined || wert === null) continue;
    if (typeof wert !== 'string') {
      return { ok: false, fehler: `Feld „${feld}" ist kein Text.`, profil: null };
    }
    profil[feld] = wert;
  }
  for (const feld of ['waffen', 'fraktionen']) {
    const wert = quelle[feld];
    if (wert === undefined) continue;
    if (!istObjekt(wert)) {
      return { ok: false, fehler: `Feld „${feld}" ist keine Zuordnung.`, profil: null };
    }
    for (const [schluessel, anzahl] of Object.entries(wert)) {
      if (typeof anzahl !== 'number' || !Number.isFinite(anzahl)) {
        return { ok: false, fehler: `Feld „${feld}.${schluessel}" ist keine Zahl.`, profil: null };
      }
    }
    profil[feld] = wert;
  }
  if (quelle.erfolge !== undefined) {
    if (!Array.isArray(quelle.erfolge) || quelle.erfolge.some(e => typeof e !== 'string')) {
      return { ok: false, fehler: 'Feld „erfolge" ist keine Liste von Kennungen.', profil: null };
    }
    profil.erfolge = [...quelle.erfolge].sort();
  }

  return { ok: true, fehler: null, profil };
}

/** Liest eine Sicherung aus Text (Dateiinhalt). */
export function sicherungAusText(text) {
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    return { ok: false, fehler: 'Die Datei ist kein gültiges JSON.', profil: null };
  }
  return pruefeSicherung(daten);
}

